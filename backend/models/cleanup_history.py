"""V2.1 清理历史记录模型"""

import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


class CleanupHistory(Base):
    __tablename__ = "cleanup_history"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    project_id: Mapped[str] = mapped_column(
        String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    executed_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, nullable=False
    )
    deleted_count: Mapped[int] = mapped_column(Integer, nullable=False)
    space_freed: Mapped[int] = mapped_column(Integer, nullable=False)
    photo_count_before: Mapped[int] = mapped_column(Integer, nullable=False)
    photo_count_after: Mapped[int] = mapped_column(Integer, nullable=False)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
