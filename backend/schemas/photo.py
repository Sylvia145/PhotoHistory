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
    dhash: str | None
    source_type: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}
