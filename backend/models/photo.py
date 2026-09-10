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

    # ========== V3.0: AI 质量评分 ==========
    ai_score_sharpness: Mapped[float | None] = mapped_column(Float, default=None)
    # AI 清晰度评分 (0-10): Laplacian 方差法
    ai_score_aesthetic: Mapped[float | None] = mapped_column(Float, default=None)
    # AI 美学评分 (0-10): 分辨率+对比度+宽高比+曝光
    ai_score_overall: Mapped[float | None] = mapped_column(Float, default=None)
    # AI 综合评分 (0-10): 清晰度×0.4 + 美学×0.3 + 压缩×0.3

    # 感知哈希
    phash: Mapped[str | None] = mapped_column(String(64), default=None)
    dhash: Mapped[str | None] = mapped_column(String(64), default=None)

    # 上传信息
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    source_type: Mapped[str] = mapped_column(String(50), default="manual")

    # ========== V2.0: 清理相关字段 ==========
    cleanup_status: Mapped[str | None] = mapped_column(String(20), default=None)
    # None=未判定, 'keep'=建议保留, 'delete'=建议删除
    cleanup_group_id: Mapped[str | None] = mapped_column(String(100), default=None)
    # 相似组 ID，同组照片共享此值
    cleanup_group_rank: Mapped[int | None] = mapped_column(Integer, default=None)
    # 组内排名: 1=最优
    cleanup_reason: Mapped[str | None] = mapped_column(Text, default=None)
    # 清理建议理由，可供用户阅读的文案

    # ========== V3.1: 软删除字段 ==========
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    # 软删除时间（非空=已删除），30分钟后物理清除
    deleted_by: Mapped[str | None] = mapped_column(String(20), default=None)
    # 删除来源: "agent" | "manual"

    project = relationship("Project", back_populates="photos")
