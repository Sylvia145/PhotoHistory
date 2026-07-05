"""版本分组算法"""

from dataclasses import dataclass, field
from sqlalchemy.orm import Session

from models.photo import Photo
from services.hash_service import hamming_distance
from config import DHASH_SIMILARITY_THRESHOLD, DHASH_POSSIBLE_THRESHOLD


@dataclass
class VersionChain:
    photos: list[Photo] = field(default_factory=list)
    overall_confidence: float = 1.0
    group_id: str = ""                    # V2.0: 相似组标识

    @property
    def root_photo(self) -> Photo | None:
        return self.photos[0] if self.photos else None

    @property
    def versions(self) -> list[Photo]:
        return self.photos


def analyze_project(project_id: str, db: Session) -> list[VersionChain]:
    """
    分析项目内所有照片，自动分组为版本链。

    算法：
    1. 按 DateTimeOriginal 分组（同值 = 同源候选），无 EXIF 的统一放入 "no_exif" 组
    2. 每组内 dHash 汉明距离聚类验证
    3. 组内按时间排序
    4. 跨组匹配：dHash 相似的无 EXIF 链合并到有 EXIF 链中
    """
    photos = db.query(Photo).filter(Photo.project_id == project_id).all()
    if not photos:
        return []

    chains: list[VersionChain] = []

    # 步骤1: 按 DateTimeOriginal 分组（无 EXIF 的统一归入 "__no_exif__"）
    time_groups: dict[str, list[Photo]] = {}
    for p in photos:
        if p.exif_datetime_original:
            time_groups.setdefault(p.exif_datetime_original, []).append(p)
        else:
            time_groups.setdefault("__no_exif__", []).append(p)

    # 步骤2+3: 每组内 dHash 聚类 + 排序
    for key, group in time_groups.items():
        subgroups = _cluster_by_dhash(group)
        for sg in subgroups:
            sg.sort(key=lambda p: (
                p.exif_datetime_original or "z",
                p.uploaded_at or "",
            ))
            chains.append(VersionChain(
                photos=sg,
                overall_confidence=_calc_confidence(sg),
            ))

    # 步骤4: 全链 dHash 合并 — 不同时间组的链如果 dHash 相似，合并
    chains = _merge_similar_chains(chains)

    # V2.0: 为每条链分配 group_id 并写入照片的 cleanup 字段
    for idx, chain in enumerate(chains):
        chain.group_id = f"group_{project_id}_{idx + 1}"
        for rank, photo in enumerate(chain.photos, start=1):
            photo.cleanup_group_id = chain.group_id
            photo.cleanup_group_rank = rank

    return chains


def _cluster_by_dhash(photos: list[Photo]) -> list[list[Photo]]:
    """基于 dHash 汉明距离的简单聚类"""
    if len(photos) <= 1:
        return [photos]

    # 以第一张为基准
    base = photos[0]
    close = [base]
    far = []

    for p in photos[1:]:
        dist = hamming_distance(base.dhash or "", p.dhash or "")
        if dist <= DHASH_SIMILARITY_THRESHOLD:
            close.append(p)
        else:
            far.append(p)

    result = [close]
    if far:
        # 递归处理剩余的
        result.extend(_cluster_by_dhash(far))
    return result


def _calc_confidence(photos: list[Photo]) -> float:
    """
    计算版本链整体置信度。

    置信度反映版本分组的可信程度，而非照片质量：
    - 多张照片 + 全部有 EXIF → HIGH (0.9+)
    - 多张照片 + 大部分有 EXIF 或 dHash 匹配 → MEDIUM
    - 单张照片：有 EXIF 则为 MEDIUM（照片可信，只是无其他版本可关联）；
                无 EXIF 则为 LOW
    """
    if len(photos) <= 1:
        # 单张照片：无法做分组判断，看数据质量
        if photos and photos[0].exif_has_all:
            return 0.75    # 照片数据完整，只是暂无其他版本
        return 0.5          # 无 EXIF，数据质量存疑

    # 多张照片：综合 EXIF 和 dHash 聚类结果
    exif_count = sum(1 for p in photos if p.exif_has_all)
    exif_ratio = exif_count / len(photos)

    if exif_ratio >= 0.8:
        return 0.9          # 大部分有 EXIF → 高置信度
    elif exif_ratio >= 0.5:
        return 0.75         # 过半有 EXIF → 中高置信度
    elif exif_ratio > 0:
        return 0.65         # 少数有 EXIF → 中置信度
    else:
        return 0.6          # 全部无 EXIF，仅靠 dHash 分组 → 中低置信度


def _merge_similar_chains(chains: list[VersionChain]) -> list[VersionChain]:
    """
    对所有链做 dHash 交叉验证，将汉明距离 ≤ 阈值的链合并。

    场景：
    1. 不同 App 编辑后 EXIF 时间丢失 → GPS 日期回退，与 DateTimeOriginal 不一致
    2. 不同 DateTimeOriginal 值但实际同源（GPS 只有日期 vs EXIF 有完整时间戳）
    3. EXIF 完全丢失 → 已被步骤 1 的 "__no_exif__" 组处理
    """
    if len(chains) <= 1:
        return chains

    # 两两比较，合并 dHash 相似的链
    merged = list(chains)
    changed = True

    while changed:
        changed = False
        i = 0
        while i < len(merged):
            j = i + 1
            while j < len(merged):
                dist = _chain_min_distance(merged[i], merged[j])
                if dist <= DHASH_SIMILARITY_THRESHOLD:
                    # 合并 j 到 i
                    merged[i].photos.extend(merged[j].photos)
                    merged[i].photos.sort(key=lambda p: (
                        p.exif_datetime_original or "z",
                        p.uploaded_at or "",
                    ))
                    merged[i].overall_confidence = _calc_confidence(merged[i].photos)
                    merged.pop(j)
                    changed = True
                else:
                    j += 1
            i += 1

    return merged


def _chain_min_distance(chain_a: VersionChain, chain_b: VersionChain) -> int:
    """计算两条链之间的最小 dHash 汉明距离"""
    min_dist = 999
    for pa in chain_a.photos:
        if not pa.dhash:
            continue
        for pb in chain_b.photos:
            if not pb.dhash:
                continue
            dist = hamming_distance(pa.dhash, pb.dhash)
            if dist < min_dist:
                min_dist = dist
    return min_dist
