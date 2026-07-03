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
    1. 按 DateTimeOriginal 分组（同值 = 同源候选）
    2. 候选组内 dHash 汉明距离验证
    3. 组内按时间排序
    4. 未分组的照片单独成链
    """
    photos = db.query(Photo).filter(Photo.project_id == project_id).all()
    if not photos:
        return []

    assigned: set[str] = set()
    chains: list[VersionChain] = []

    # 步骤1: 按 DateTimeOriginal 分组
    time_groups: dict[str, list[Photo]] = {}
    for p in photos:
        key = p.exif_datetime_original or f"no_exif_{p.id}"
        time_groups.setdefault(key, []).append(p)

    # 步骤2+3: 每组内验证和排序
    for key, group in time_groups.items():
        if len(group) == 1:
            # 单独成链，置信度由 _calc_confidence 根据数据质量计算
            chains.append(VersionChain(photos=list(group),
                                       overall_confidence=_calc_confidence(list(group))))
            assigned.update(p.id for p in group)
            continue

        # 组内两两计算汉明距离，拆分子组
        subgroups = _cluster_by_dhash(group)
        for sg in subgroups:
            # 组内排序
            sg.sort(key=lambda p: (
                p.exif_datetime_original or "z",
                p.uploaded_at or "",
            ))
            confidence = _calc_confidence(sg)
            chains.append(VersionChain(photos=sg, overall_confidence=confidence))
            assigned.update(p.id for p in sg)

    # 步骤4: 未被分组的（安全网，理论上不会到这里）
    unassigned = [p for p in photos if p.id not in assigned]
    for p in unassigned:
        chains.append(VersionChain(photos=[p], overall_confidence=0.3))

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
