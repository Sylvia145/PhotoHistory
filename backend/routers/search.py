"""自然语言搜索路由 — 将中文关键词转为 SQL 条件查询照片"""

import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from db import get_db
from models.photo import Photo
from models.project import Project
from schemas.photo import PhotoResponse

router = APIRouter(prefix="/api/projects", tags=["search"])


# ── 关键词 → SQL 条件映射 ─────────────────────────────────────────────

# 设备品牌关键词
DEVICE_KEYWORDS: dict[str, tuple[str, str]] = {
    "iphone": ("Apple", "iPhone"),
    "苹果": ("Apple", "iPhone"),
    "ipad": ("Apple", "iPad"),
    "华为": ("HUAWEI", None),
    "huawei": ("HUAWEI", None),
    "小米": ("Xiaomi", None),
    "xiaomi": ("Xiaomi", None),
    "三星": ("Samsung", None),
    "samsung": ("Samsung", None),
    "佳能": ("Canon", None),
    "canon": ("Canon", None),
    "索尼": ("SONY", None),
    "sony": ("SONY", None),
    "尼康": ("NIKON", None),
    "nikon": ("NIKON", None),
    "大疆": ("DJI", None),
    "dji": ("DJI", None),
    "google": ("Google", None),
    "pixel": ("Google", "Pixel"),
}

# 照片方向
ORIENTATION_KEYWORDS = {
    "竖屏", "竖图", "竖拍", "竖版",
    "横屏", "横图", "横拍", "横版",
    "正方形", "方形",
}

# 来源/质量
QUALITY_KEYWORDS = {
    "原图", "原始",
    "压缩", "微信",
}

# 清理状态（当在清理视图中）
CLEANUP_KEYWORDS = {
    "保留", "keep",
    "删除", "delete", "待删",
}


def _parse_search_query(q: str) -> list:
    """将自然语言查询解析为 SQLAlchemy filter 条件列表（AND 关系）"""
    filters: list = []
    q_lower = q.lower().strip()

    # ── 设备品牌匹配 ──
    for keyword, (make, model) in DEVICE_KEYWORDS.items():
        if keyword in q_lower:
            if model:
                filters.append(
                    (Photo.exif_make.ilike(f"%{make}%")) &
                    (Photo.exif_model.ilike(f"%{model}%"))
                )
            else:
                filters.append(Photo.exif_make.ilike(f"%{make}%"))
            break  # 只匹配第一个设备关键词

    # ── 文件大小: "大于NMB" / ">NMB" / "小于NMB" / "<NMB" ──
    size_gt = re.search(r'(?:大于|>)\s*(\d+(?:\.\d+)?)\s*(?:MB|mb)', q)
    size_lt = re.search(r'(?:小于|<)\s*(\d+(?:\.\d+)?)\s*(?:MB|mb)', q)
    if size_gt:
        mb = float(size_gt.group(1))
        filters.append(Photo.file_size > int(mb * 1024 * 1024))
    if size_lt:
        mb = float(size_lt.group(1))
        filters.append(Photo.file_size < int(mb * 1024 * 1024))

    if not size_gt and not size_lt:
        # "大文件" = >10MB
        if any(w in q for w in ["大文件", "大图", "大型"]):
            filters.append(Photo.file_size > 10 * 1024 * 1024)
        # "小文件" = <1MB
        if any(w in q for w in ["小文件", "小图"]):
            filters.append(Photo.file_size < 1 * 1024 * 1024)

    # ── 照片方向 ──
    if any(w in q for w in ["竖屏", "竖图", "竖拍", "竖版"]):
        filters.append(Photo.resolution_h > Photo.resolution_w)
    elif any(w in q for w in ["横屏", "横图", "横拍", "横版"]):
        filters.append(Photo.resolution_w > Photo.resolution_h)
    elif any(w in q for w in ["正方形", "方形"]):
        filters.append(
            (Photo.resolution_w - Photo.resolution_h).between(-100, 100)
        )

    # ── 来源/质量 ──
    if any(w in q for w in ["原图", "原始"]):
        filters.append(Photo.source_type == "manual")
        filters.append(Photo.exif_has_all == True)
    elif any(w in q for w in ["压缩", "微信"]):
        filters.append(Photo.source_type == "wechat_compressed")

    # ── 清理状态 ──
    if any(w in q for w in ["保留", "keep"]):
        filters.append(Photo.cleanup_status == "keep")
    elif any(w in q for w in ["删除", "delete", "待删"]):
        filters.append(Photo.cleanup_status == "delete")

    # ── 日期: 支持 "2026年" "6月" "2026年6月" "6月27" "2026-06-27" ──
    date_full = re.search(r'(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})', q)
    date_ym = re.search(r'(\d{4})[年/-](\d{1,2})', q)
    date_y = re.search(r'(\d{4})年', q)
    date_m = re.search(r'(\d{1,2})月', q)
    date_md = re.search(r'(\d{1,2})月(\d{1,2})[日号]?', q)

    if date_full:
        y, m, d = date_full.groups()
        filters.append(Photo.exif_datetime_original.like(f"{y}-{int(m):02d}-{int(d):02d}%"))
    elif date_md:
        m, d = date_md.groups()
        filters.append(Photo.exif_datetime_original.like(f"%-{int(m):02d}-{int(d):02d}%"))
    elif date_ym:
        y, m = date_ym.groups()
        filters.append(Photo.exif_datetime_original.like(f"{y}-{int(m):02d}%"))
    elif date_y:
        y = date_y.group(1)
        filters.append(Photo.exif_datetime_original.like(f"{y}%"))
    elif date_m:
        m = date_m.group(1)
        filters.append(Photo.exif_datetime_original.like(f"%-{int(m):02d}%"))

    # ── 无 EXIF / EXIF 不完整 ──
    if any(w in q for w in ["无时间", "缺时间", "无exif", "没exif"]):
        filters.append(Photo.exif_has_all == False)

    # ── 文件名搜索（兜底） ──
    # 如果没有任何条件命中，尝试按文件名模糊搜索
    if not filters:
        filters.append(Photo.original_name.ilike(f"%{q}%"))

    return filters


# ── 端点 ──────────────────────────────────────────────────────────

@router.get("/{project_id}/search", response_model=list[PhotoResponse])
def search_photos(
    project_id: str,
    q: str = Query(..., min_length=1, description="搜索关键词"),
    db: Session = Depends(get_db),
):
    """自然语言搜索项目内的照片"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    filters = _parse_search_query(q)
    query = db.query(Photo).filter(Photo.project_id == project_id)

    for f in filters:
        query = query.filter(f)

    results = query.order_by(Photo.original_name).all()
    return [PhotoResponse.model_validate(p) for p in results]
