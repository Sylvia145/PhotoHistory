"""Provider 基类 — 定义 LLM Provider 必须实现的协议"""

from typing import Protocol, AsyncGenerator


class ChatProvider(Protocol):
    """LLM 聊天 Provider 协议。

    所有 Provider 必须实现 stream_chat 方法，
    返回 AsyncGenerator[dict]，每个 dict 代表一个流式事件。

    事件类型:
        {"type": "text_delta", "text": "..."}     — 文本增量（逐 token）
        {"type": "tool_use", "id": "...", "name": "...", "input": {...}}  — 工具调用
        {"type": "error", "message": "..."}        — 错误
    """

    async def stream_chat(
        self,
        model: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        system: str | None = None,
        max_tokens: int = 16000,
        temperature: float = 0.7,
    ) -> AsyncGenerator[dict, None]:
        """流式调用 LLM，逐 token 返回文本 + 工具调用。

        Args:
            model: 模型名称
            messages: 对话历史（Claude API 格式）
            tools: 工具定义列表（Claude API format）
            system: 系统提示词
            max_tokens: 最大输出 token 数
            temperature: 温度

        Yields:
            dict: 流式事件
        """
        ...
