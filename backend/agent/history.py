"""会话持久化 — Conversation + ChatMessage CRUD + 上下文窗口管理"""

import json
import uuid
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from models.conversation import Conversation
from models.chat_message import ChatMessage

logger = logging.getLogger(__name__)

# 中文 token 估算系数: 中文平均 1.5 字符/token, 英文 4 字符/token
# 简化处理: 使用 char / 2.0 作为粗略估算
TOKEN_ESTIMATE_CHARS_PER_TOKEN = 2.0


class ChatHistory:
    """会话消息管理器。

    职责:
    1. 从 DB 加载/保存消息
    2. 转换为 Claude API 兼容的消息格式
    3. 上下文窗口管理（超限裁剪）
    """

    def __init__(
        self,
        conversation_id: str | None = None,
        project_id: str | None = None,
        provider: str = "anthropic",
        model: str = "claude-sonnet-4-6",
        max_tokens: int = 16000,
    ):
        self.max_tokens = max_tokens
        self._db: Session | None = None
        self._conversation: Conversation | None = None
        self._messages: list[ChatMessage] = []

        if conversation_id:
            # 加载已有会话
            with self._get_db() as db:
                conv = db.query(Conversation).filter(
                    Conversation.id == conversation_id
                ).first()
                if conv:
                    self._conversation = conv
                    self._messages = list(conv.messages) if conv.messages else []
                else:
                    # ID 不存在 → 新建
                    self._create_conversation(db, project_id, provider, model)
        else:
            # 新建会话
            with self._get_db() as db:
                self._create_conversation(db, project_id, provider, model)

    @property
    def conversation_id(self) -> str:
        return self._conversation.id if self._conversation else ""

    @property
    def message_count(self) -> int:
        return len(self._messages)

    def add_message(
        self,
        role: str,
        content: str | None = None,
        tool_calls: list[dict] | None = None,
        tool_name: str | None = None,
        tool_call_id: str | None = None,
        usage: dict | None = None,
    ):
        """添加一条消息到 DB 和内存。"""
        msg = ChatMessage(
            id=str(uuid.uuid4()),
            conversation_id=self.conversation_id,
            role=role,
            content=content,
            tool_calls_json=json.dumps(tool_calls, ensure_ascii=False) if tool_calls else None,
            tool_name=tool_name,
            tool_call_id=tool_call_id,
            usage_json=json.dumps(usage, ensure_ascii=False) if usage else None,
            created_at=datetime.now(),
        )

        with self._get_db() as db:
            # 将会话的 updated_at 更新
            conv = db.query(Conversation).filter(
                Conversation.id == self.conversation_id
            ).first()
            if conv:
                conv.updated_at = datetime.now()
                # 自动生成标题
                if not conv.title and role == "user" and content:
                    conv.title = content[:50] + ("..." if len(content) > 50 else "")
            db.add(msg)
            db.commit()
            db.refresh(msg)

        self._messages.append(msg)

    def to_api_format(self) -> list[dict]:
        """将消息历史转为 Claude API 兼容的 messages 列表（含上下文窗口裁剪）。

        Claude API 格式:
        - user:  {"role": "user", "content": "..."}
        - user (含 tool_result): {"role": "user", "content": [{"type": "tool_result", ...}]}
        - assistant: {"role": "assistant", "content": [{"type": "text", ...}, {"type": "tool_use", ...}]}
        - tool: 转为 user + tool_result 块
        """
        api_messages = []

        for msg in self._messages:
            formatted = _message_to_api_format(msg)
            if formatted:
                api_messages.append(formatted)

        # 上下文窗口裁剪
        return self._trim_context(api_messages)

    def get_conversation_info(self) -> dict:
        """返回会话元信息。"""
        if not self._conversation:
            return {}
        return {
            "id": self._conversation.id,
            "project_id": self._conversation.project_id,
            "title": self._conversation.title,
            "provider": self._conversation.provider,
            "model": self._conversation.model,
            "message_count": len(self._messages),
            "created_at": self._conversation.created_at.isoformat() if self._conversation.created_at else None,
            "updated_at": self._conversation.updated_at.isoformat() if self._conversation.updated_at else None,
        }

    # ── 内部方法 ──────────────────────────────────────────

    def _create_conversation(
        self, db: Session, project_id: str | None,
        provider: str, model: str
    ):
        conv = Conversation(
            id=str(uuid.uuid4()),
            project_id=project_id,
            provider=provider,
            model=model,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)
        self._conversation = conv
        self._messages = []

    def _get_db(self):
        """返回一个数据库会话。"""
        from db import SessionLocal
        return SessionLocal()

    def _estimate_tokens(self, messages: list[dict]) -> int:
        """粗略估算消息列表的 token 数。"""
        total_chars = 0
        for msg in messages:
            content = msg.get("content", "")
            if isinstance(content, str):
                total_chars += len(content)
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, dict):
                        total_chars += len(json.dumps(block, ensure_ascii=False))
        return int(total_chars / TOKEN_ESTIMATE_CHARS_PER_TOKEN)

    def _trim_context(self, messages: list[dict]) -> list[dict]:
        """裁剪上下文：保留最近 N 轮对话，确保不超过 token 限制的 80%。

        策略: 从旧到新删除 user/assistant 配对，保留最近的对话。
        """
        threshold = int(self.max_tokens * 0.8)
        estimated = self._estimate_tokens(messages)

        if estimated <= threshold:
            return messages

        # 从前面开始裁剪（保留最后 10 对 user/assistant）
        keep_pairs = 10
        # 找到倒数第 10 个 user 消息的位置
        user_indices = [
            i for i, m in enumerate(messages) if m.get("role") == "user"
        ]
        if len(user_indices) <= keep_pairs:
            # 已经很少了，尝试去掉最早的一半
            cut = len(messages) // 4
            return messages[cut:]

        # 从倒数第 keep_pairs 个 user 消息开始保留
        start_idx = user_indices[-keep_pairs]
        trimmed = messages[start_idx:]

        logger.info(
            f"上下文裁剪: {len(messages)} → {len(trimmed)} 条消息 "
            f"(estimated tokens: {estimated} → {self._estimate_tokens(trimmed)})"
        )
        return trimmed


def _message_to_api_format(msg: ChatMessage) -> dict | None:
    """单条 ChatMessage → Claude API 消息格式。"""
    if msg.role == "user":
        content = msg.content or ""
        return {"role": "user", "content": content}

    elif msg.role == "assistant":
        content_blocks = []

        # 文本部分
        text = msg.content or ""
        if text.strip():
            content_blocks.append({"type": "text", "text": text})

        # 工具调用部分
        if msg.tool_calls_json:
            try:
                tool_calls = json.loads(msg.tool_calls_json)
                for tc in tool_calls:
                    content_blocks.append({
                        "type": "tool_use",
                        "id": tc.get("id", ""),
                        "name": tc.get("name", ""),
                        "input": tc.get("input", {}),
                    })
            except json.JSONDecodeError:
                pass

        if not content_blocks:
            return None

        # 如果只有一个 text 块，简化为纯文本（兼容 Claude API）
        # 如果有 tool_use 块，必须用列表格式
        has_tool_use = any(b.get("type") == "tool_use" for b in content_blocks)
        if len(content_blocks) == 1 and not has_tool_use:
            content = content_blocks[0].get("text", "")
        else:
            content = content_blocks

        return {
            "role": "assistant",
            "content": content,
            "tool_calls": (
                json.loads(msg.tool_calls_json)
                if msg.tool_calls_json and has_tool_use
                else None
            ),
        }

    elif msg.role == "tool":
        return {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": msg.tool_call_id or "",
                    "content": msg.content or "",
                }
            ],
        }

    return None


# ── 会话列表查询 ──────────────────────────────────────────────

def list_conversations(
    project_id: str | None = None, limit: int = 50
) -> list[dict]:
    """列出会话列表。"""
    from db import SessionLocal

    with SessionLocal() as db:
        q = db.query(Conversation).order_by(Conversation.updated_at.desc())
        if project_id:
            q = q.filter(Conversation.project_id == project_id)
        conversations = q.limit(limit).all()

        return [
            {
                "id": c.id,
                "project_id": c.project_id,
                "title": c.title,
                "provider": c.provider,
                "model": c.model,
                "message_count": len(c.messages) if c.messages else 0,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in conversations
        ]


def get_conversation_history(conversation_id: str) -> list[dict]:
    """获取某个会话的消息历史（用于前端恢复对话）。"""
    from db import SessionLocal

    with SessionLocal() as db:
        messages = (
            db.query(ChatMessage)
            .filter(ChatMessage.conversation_id == conversation_id)
            .order_by(ChatMessage.created_at)
            .all()
        )
        return [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "tool_calls_json": m.tool_calls_json,
                "tool_name": m.tool_name,
                "tool_call_id": m.tool_call_id,
                "usage_json": m.usage_json,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ]
