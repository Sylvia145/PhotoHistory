"""Agent API 路由 — SSE 聊天端点 + 会话管理"""

import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from .schemas import ChatRequest
from .orchestrator import AgentOrchestrator
from .history import list_conversations, get_conversation_history

logger = logging.getLogger(__name__)


def create_agent_router() -> APIRouter:
    """创建并返回 Agent API 路由器。"""
    router = APIRouter(prefix="/api/agent", tags=["agent"])

    @router.post("/chat")
    async def agent_chat(req: ChatRequest):
        """Agent 聊天端点 — SSE 流式响应。

        接收用户消息，通过 ReAct Loop 编排 LLM + 工具调用，
        以 Server-Sent Events 流式返回结果。

        事件类型:
        - text_delta: 文本增量（逐 token 流式输出）
        - tool_call: Agent 正在调用工具
        - tool_result: 工具执行结果
        - confirm_required: 需要用户确认破坏性操作
        - error: 错误信息
        - done: 对话结束（含 usage 统计）
        """
        orchestrator = AgentOrchestrator()

        async def event_generator():
            try:
                async for sse in orchestrator.run(req):
                    event_type = sse["event"]
                    data = sse["data"]
                    yield f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
            except Exception as e:
                logger.error(f"Agent 编排异常: {e}", exc_info=True)
                yield f"event: error\ndata: {json.dumps({'message': str(e)}, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # 禁用 nginx 缓冲
            },
        )

    @router.get("/conversations")
    def list_agent_conversations(project_id: str | None = None, limit: int = 50):
        """列出会话列表。可按 project_id 过滤。"""
        try:
            return {
                "conversations": list_conversations(project_id, limit),
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/conversations/{conversation_id}/messages")
    def get_agent_messages(conversation_id: str):
        """获取某个会话的完整消息历史（用于恢复对话）。"""
        try:
            messages = get_conversation_history(conversation_id)
            if not messages:
                # 尝试检查会话是否存在
                return {"messages": [], "note": "会话不存在或已删除"}
            return {"messages": messages}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return router
