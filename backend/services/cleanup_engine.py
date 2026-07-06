"""清理建议规则引擎

为相似组内的照片生成可解释的保留/删除建议。
"""

from models.photo import Photo


def generate_cleanup_suggestions(photos_in_group: list[Photo]) -> None:
    """
    为相似组内的照片填充 cleanup_status 和 cleanup_reason。

    规则优先级（从高到低）：
    1. 单张照片 → 建议保留
    2. 微信压缩图 — 同组有原图时建议删除
    3. 同质照片 → 按 AI 综合评分降序（评分高的保留），无评分时回退到文件大小
    """
    if len(photos_in_group) <= 1:
        for p in photos_in_group:
            p.cleanup_status = "keep"
            p.cleanup_reason = _build_reason(p, is_single=True)
        return

    # 规则: 微信压缩图 → 同组存在非压缩版本时标记删除
    has_original = any(
        p.source_type != "wechat_compressed" and p.exif_has_all
        for p in photos_in_group
    )
    for p in photos_in_group:
        if p.source_type == "wechat_compressed" and has_original:
            p.cleanup_status = "delete"
            p.cleanup_reason = "微信压缩图，同组存在原图版本，EXIF信息丢失"

    # 规则: 按 AI 综合评分排序（降级到文件大小）
    def _rank_key(p: Photo) -> tuple[int, float]:
        """排序键：已评分照片按 AI 评分降序；未评分回退到文件大小。"""
        if p.ai_score_overall is not None:
            return (0, -p.ai_score_overall)  # 已评分优先
        else:
            return (1, -(p.file_size or 0))  # 未评分用文件大小

    sorted_photos = sorted(photos_in_group, key=_rank_key)

    for rank, p in enumerate(sorted_photos, start=1):
        if p.cleanup_status is not None:
            continue  # 已被微信规则标记
        if rank == 1:
            p.cleanup_status = "keep"
            p.cleanup_reason = _build_reason(p, rank=rank)
        else:
            p.cleanup_status = "delete"
            p.cleanup_reason = _build_reason(p, rank=rank)


def _build_reason(photo: Photo, rank: int = 1, is_single: bool = False) -> str:
    """生成可供用户阅读的清理理由"""
    if is_single:
        return "单独照片，无相似版本"

    parts = [f"组内排名 #{rank}"]
    if photo.ai_score_overall is not None:
        parts.append(f"AI综合评分 {photo.ai_score_overall}/10")
    if photo.exif_has_all:
        parts.append("EXIF完整")
    else:
        parts.append("EXIF缺失")
    if photo.exif_datetime_original:
        parts.append(f"拍摄于 {photo.exif_datetime_original[:10]}")
    if photo.resolution_w and photo.resolution_h:
        parts.append(f"{photo.resolution_w}x{photo.resolution_h}")
    if photo.file_size:
        mb = photo.file_size / 1024 / 1024
        parts.append(f"{mb:.1f}MB")
    return "，".join(parts)
