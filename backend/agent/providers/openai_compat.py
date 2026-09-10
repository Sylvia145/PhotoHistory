"""OpenAI 兼容 Provider — 流式聊天 + function_call 转换"""

import json
import logging
from typing import AsyncGenerator

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class OpenAICompatProvider:
    """通过 OpenAI 兼容 API 调用 LLM 的流式聊天 Provider。

    支持 OpenAI 原生及兼容接口（DeepSeek, 千问, vLLM 等）。
    内部将 Anthropic 格式的 tool schema 转为 OpenAI function_call 格式。
    """

    def __init__(self, api_key: str, base_url: str = "https://api.openai.com/v1"):
        if not api_key:
            raise ValueError("OPENAI_API_KEY 未设置")
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def stream_chat(
        self,
        model: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        system: str | None = None,
        max_tokens: int = 16000,
        temperature: float = 0.7,
    ) -> AsyncGenerator[dict, None]:
        """流式调用 OpenAI 兼容 API。

        将 Anthropic 格式的输入转为 OpenAI 格式，再将输出转回统一事件格式。
        """
        try:
            # 转换消息格式
            openai_messages = _to_openai_messages(messages, system)

            # 转换工具定义
            openai_tools = _to_openai_tools(tools) if tools else None

            # 流式调用
            stream = await self.client.chat.completions.create(
                model=model,
                messages=openai_messages,
                tools=openai_tools,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=True,
            )

            # 累积 tool_calls（OpenAI 流式返回时分片）
            tool_call_accumulator: dict[int, dict] = {}
            assistant_content = ""

            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta is None:
                    continue

                # 文本增量
                if delta.content:
                    assistant_content += delta.content
                    yield {"type": "text_delta", "text": delta.content}

                # 工具调用增量
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_call_accumulator:
                            tool_call_accumulator[idx] = {
                                "id": tc.id or "",
                                "name": "",
                                "arguments": "",
                            }
                        if tc.id:
                            tool_call_accumulator[idx]["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                tool_call_accumulator[idx]["name"] = tc.function.name
                            if tc.function.arguments:
                                tool_call_accumulator[idx]["arguments"] += tc.function.arguments

            # 输出完整的 tool_use 事件
            for tc in tool_call_accumulator.values():
                try:
                    parsed_input = json.loads(tc["arguments"])
                except json.JSONDecodeError:
                    parsed_input = {"raw_args": tc["arguments"]}

                yield {
                    "type": "tool_use",
                    "id": tc["id"],
                    "name": tc["name"],
                    "input": parsed_input,
                }

            # usage 信息
            yield {"type": "usage", "usage": None}

        except Exception as e:
            logger.error(f"OpenAI API 错误: {e}", exc_info=True)
            yield {
                "type": "error",
                "message": f"LLM API 调用失败: {e}",
            }


def _to_openai_messages(messages: list[dict], system: str | None) -> list[dict]:
    """将内部消息格式转为 OpenAI 消息格式。"""
    result = []

    # System prompt
    if system:
        result.append({"role": "system", "content": system})

    for msg in messages:
        role = msg.get("role")
        content = msg.get("content")

        if role == "user":
            if isinstance(content, list):
                # 提取文本部分（跳过 tool_result 等）
                text_parts = []
                tool_results = []
                for block in content:
                    if isinstance(block, dict):
                        if block.get("type") == "text":
                            text_parts.append(block.get("text", ""))
                        elif block.get("type") == "tool_result":
                            tool_results.append(block)
                if tool_results:
                    # 有 tool_result → 转为 OpenAI tool 消息（每个 tool_result 一条）
                    for tr in tool_results:
                        tr_content = tr.get("content", "")
                        result.append({
                            "role": "tool",
                            "tool_call_id": tr.get("tool_use_id", ""),
                            "content": tr_content if isinstance(tr_content, str) else json.dumps(tr_content, ensure_ascii=False),
                        })
                elif text_parts:
                    result.append({"role": "user", "content": "\n".join(text_parts)})
                else:
                    result.append({"role": "user", "content": str(content)})
            else:
                text = content or ""
                result.append({"role": "user", "content": text})

        elif role == "assistant":
            text = content or ""
            msg_obj: dict = {"role": "assistant", "content": text}

            # 处理 tool_calls
            tool_calls_raw = msg.get("tool_calls")
            if tool_calls_raw:
                openai_tool_calls = []
                if isinstance(tool_calls_raw, str):
                    tool_calls_raw = json.loads(tool_calls_raw)
                for tc in (tool_calls_raw or []):
                    openai_tool_calls.append({
                        "id": tc.get("id", ""),
                        "type": "function",
                        "function": {
                            "name": tc.get("name", ""),
                            "arguments": json.dumps(tc.get("input", {}), ensure_ascii=False),
                        },
                    })
                msg_obj["tool_calls"] = openai_tool_calls

            result.append(msg_obj)

        elif role == "tool":
            result.append({
                "role": "tool",
                "tool_call_id": msg.get("tool_call_id", ""),
                "content": content or "",
            })

    return result


def _to_openai_tools(tools: list[dict]) -> list[dict]:
    """将 Anthropic 格式的 tool schema 转为 OpenAI function 格式。"""
    openai_tools = []
    for tool in tools:
        openai_tools.append({
            "type": "function",
            "function": {
                "name": tool.get("name", ""),
                "description": tool.get("description", ""),
                "parameters": tool.get("input_schema", {}),
            },
        })
    return openai_tools
