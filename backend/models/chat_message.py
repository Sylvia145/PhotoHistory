"""聊天消息 ORM 模型 — 单条对话消息"""

import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    conversation_id: Mapped[str] = mapped_column(
        String, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    # "user" | "assistant" | "tool"
    content: Mapped[str | None] = mapped_column(Text, default=None)
    # 文本内容（user/assistant 消息）或工具返回（tool 消息，JSON 字符串）
    tool_calls_json: Mapped[str | None] = mapped_column(Text, default=None)
    # assistant 消息中的 tool_use 块序列化（JSON list）
    tool_name: Mapped[str | None] = mapped_column(String(100), default=None)
    # tool 消息对应的工具名
    tool_call_id: Mapped[str | None] = mapped_column(String(100), default=None)
    # tool_result 对应的 tool_use id（用于关联）
    usage_json: Mapped[str | None] = mapped_column(Text, default=None)
    # LLM token 用量 {"input": N, "output": N}（仅 assistant 消息）
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    conversation = relationship("Conversation", back_populates="messages")
