"""Anthropic Claude Provider — 流式聊天 + tool_use 解析"""

import logging
from typing import AsyncGenerator

import anthropic

from .base import ChatProvider

logger = logging.getLogger(__name__)


class AnthropicProvider:
    """通过 anthropic SDK 调用 Claude API 的流式聊天 Provider。

    实现 ChatProvider 协议，支持:
    - 逐 token 文本流式输出
    - Claude native tool_use 检测与透传
    - 错误降级
    """

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError(
                "ANTHROPIC_API_KEY 未设置。请在设置面板中输入 API Key，"
                "或在 docker-compose.yml 中配置环境变量。"
            )
        self.client = anthropic.AsyncAnthropic(api_key=api_key)

    async def stream_chat(
        self,
        model: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        system: str | None = None,
        max_tokens: int = 16000,
        temperature: float = 0.7,
    ) -> AsyncGenerator[dict, None]:
        """流式调用 Claude API。

        Claude 的 streaming 事件流:
        - message_start → content_block_start → content_block_delta (text/tool_use)
        - → content_block_stop → message_delta → message_stop

        我们关心:
        - content_block_delta.text_delta → yield text_delta
        - 最终 message 中的 tool_use blocks → yield tool_use
        """
        try:
            # 清理 messages 中的 None content（Claude API 不允许）
            clean_messages = _sanitize_messages(messages)

            async with self.client.messages.stream(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system or "",
                tools=tools or [],
                messages=clean_messages,
            ) as stream:
                # 流式输出文本增量
                async for text in stream.text_stream:
                    yield {"type": "text_delta", "text": text}

                # 获取最终消息，检测 tool_use
                final = await stream.get_final_message()

                for block in final.content:
                    if block.type == "tool_use":
                        yield {
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": block.input,
                        }

                # 提取 usage 信息
                usage = None
                if hasattr(final, "usage") and final.usage:
                    usage = {
                        "input_tokens": getattr(final.usage, "input_tokens", 0),
                        "output_tokens": getattr(final.usage, "output_tokens", 0),
                        "cache_read_input_tokens": getattr(
                            final.usage, "cache_read_input_tokens", 0
                        ),
                    }
                yield {"type": "usage", "usage": usage}

        except anthropic.APIError as e:
            logger.error(f"Claude API 错误: {e}")
            yield {
                "type": "error",
                "message": f"Claude API 调用失败: {e}",
            }
        except Exception as e:
            logger.error(f"Provider 异常: {e}", exc_info=True)
            yield {
                "type": "error",
                "message": f"LLM 调用异常: {e}",
            }


def _sanitize_messages(messages: list[dict]) -> list[dict]:
    """清理消息列表，移除 None content 等 Claude API 不接受的字段。

    Claude API 要求:
    - content 不能是 None
    - tool_use 块必须有完整的 id/name/input
    """
    cleaned = []
    for msg in messages:
        role = msg.get("role")
        content = msg.get("content")

        # 跳过空 content 的 assistant 消息（除非有 tool_use）
        if role == "assistant" and isinstance(content, str) and not content.strip():
            # 检查是否有 tool_use
            has_tool_use = isinstance(msg.get("tool_calls"), list) and len(msg.get("tool_calls", [])) > 0
            if not has_tool_use:
                continue

        if role == "user" and content is None:
            continue

        cleaned.append(msg)

    return cleaned
