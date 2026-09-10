"""Agent Pydantic 模型 — 请求/响应/SSE 事件类型"""

from pydantic import BaseModel, Field


# ── 请求模型 ────────────────────────────────────────────────

class ChatRequest(BaseModel):
    """POST /api/agent/chat 请求体"""
    conversation_id: str | None = Field(
        default=None, description="会话 ID。null = 创建新会话"
    )
    project_id: str | None = Field(
        default=None, description="当前上下文项目 ID"
    )
    message: str = Field(
        ..., min_length=1, max_length=4000, description="用户输入"
    )
    # 确认门响应
    confirm_tool_call_id: str | None = Field(
        default=None, description="确认或取消的工具调用 ID"
    )
    confirm_result: bool | None = Field(
        default=None, description="True=确认, False=取消"
    )
    # Provider 覆盖（前端传入，优先级高于环境变量）
    provider: str | None = Field(
        default=None, description="覆盖 LLM Provider"
    )
    api_key: str | None = Field(
        default=None, description="覆盖 API Key"
    )
    model: str | None = Field(
        default=None, description="覆盖模型名称"
    )


class ConversationResponse(BaseModel):
    """GET /api/agent/conversations 响应项"""
    id: str
    project_id: str | None
    title: str | None
    provider: str
    model: str
    message_count: int
    created_at: str
    updated_at: str


# ── SSE 事件类型 ─────────────────────────────────────────────

class SSEEvent(BaseModel):
    """SSE 事件统一模型"""
    event: str = Field(
        ..., description="事件类型: text_delta | tool_call | tool_result "
                         "| confirm_required | error | done"
    )
    data: dict = Field(
        default_factory=dict, description="事件数据"
    )


# SSE 事件 data 的具体模型

class TextDeltaData(BaseModel):
    text: str


class ToolCallData(BaseModel):
    id: str
    name: str
    status: str  # "running" | "done" | "error"


class ToolResultData(BaseModel):
    id: str
    name: str
    result: dict | str


class ConfirmRequiredData(BaseModel):
    tool_call_id: str
    tool_name: str = "execute_cleanup"
    summary: str
    details: list[dict] = Field(default_factory=list)


class DoneData(BaseModel):
    conversation_id: str
    usage: dict | None = None
