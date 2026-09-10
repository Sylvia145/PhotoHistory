"""会话 ORM 模型 — Agent 对话历史"""

import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    project_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("projects.id", ondelete="SET NULL"), default=None
    )
    provider: Mapped[str] = mapped_column(String(50), default="anthropic")
    model: Mapped[str] = mapped_column(String(100), default="claude-sonnet-4-6")
    title: Mapped[str | None] = mapped_column(String(200), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, onupdate=datetime.now
    )

    messages = relationship(
        "ChatMessage", back_populates="conversation",
        cascade="all, delete-orphan", order_by="ChatMessage.created_at"
    )
