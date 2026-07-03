"""照片 ORM 模型"""

import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Boolean, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    project_id: Mapped[str] = mapped_column(
        String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )

    # 文件信息
    original_name: Mapped[str] = mapped_column(String(500), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resolution_w: Mapped[int | None] = mapped_column(Integer, default=None)
    resolution_h: Mapped[int | None] = mapped_column(Integer, default=None)

    # EXIF 信息
    exif_datetime_original: Mapped[str | None] = mapped_column(String(50), default=None)
    exif_make: Mapped[str | None] = mapped_column(String(100), default=None)
    exif_model: Mapped[str | None] = mapped_column(String(100), default=None)
    exif_has_all: Mapped[bool] = mapped_column(Boolean, default=True)

    # 质量标记
    quality_status: Mapped[str] = mapped_column(String(20), default="ok")
    quality_reason: Mapped[str | None] = mapped_column(Text, default=None)

    # 感知哈希
    phash: Mapped[str | None] = mapped_column(String(64), default=None)
    dhash: Mapped[str | None] = mapped_column(String(64), default=None)

    # 上传信息
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    source_type: Mapped[str] = mapped_column(String(50), default="manual")

    project = relationship("Project", back_populates="photos")
