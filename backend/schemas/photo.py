"""照片相关的 Pydantic 模型"""

from datetime import datetime
from pydantic import BaseModel


class PhotoResponse(BaseModel):
    id: str
    project_id: str
    original_name: str
    file_size: int
    mime_type: str
    resolution_w: int | None
    resolution_h: int | None
    exif_datetime_original: str | None
    exif_make: str | None
    exif_model: str | None
    exif_has_all: bool
    quality_status: str
    quality_reason: str | None
    # V3.0 AI 质量评分
    ai_score_sharpness: float | None = None
    ai_score_aesthetic: float | None = None
    ai_score_overall: float | None = None
    dhash: str | None
    source_type: str
    uploaded_at: datetime
    # V2.0 清理字段
    cleanup_status: str | None = None
    cleanup_group_id: str | None = None
    cleanup_group_rank: int | None = None
    cleanup_reason: str | None = None

    model_config = {"from_attributes": True}
