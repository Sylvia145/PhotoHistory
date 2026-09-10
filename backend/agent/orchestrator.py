"""Agent 编排循环 — ReAct 模式 + SSE 流式输出 + 确认门机制。

核心算法: ReAct (Reasoning + Acting) Loop
1. 加载历史 → 构建 System Prompt
2. LLM stream → 流式输出文本
3. 检测 tool_use → 执行工具
4. 破坏性工具 → 暂停等待用户确认
5. 保存结果 → 继续循环直至无工具调用
"""

import asyncio
import json
import logging
import time
from typing import AsyncGenerator

from sqlalchemy.orm import Session

from config import (
    LLM_MODEL,
    LLM_MAX_TOKENS,
    LLM_TEMPERATURE,
    AGENT_MAX_ITERATIONS,
    AGENT_CONFIRM_TIMEOUT,
)
from .schemas import ChatRequest
from .history import ChatHistory
from .tools import (
    ALL_TOOL_DEFINITIONS,
    DESTRUCTIVE_TOOLS,
    execute_tool,
)
from .providers.registry import get_provider
from .db_session import get_agent_db_session

logger = logging.getLogger(__name__)

# 全局确认等待字典: {tool_call_id: asyncio.Event}
_pending_confirmations: dict[str, asyncio.Event] = {}
# 确认结果: {tool_call_id: bool}
_confirmation_results: dict[str, bool] = {}


def signal_confirmation(tool_call_id: str, confirmed: bool):
    """外部调用：通知编排器确认结果。由 router.py 调用。"""
    _confirmation_results[tool_call_id] = confirmed
    event = _pending_confirmations.get(tool_call_id)
    if event:
        event.set()


class AgentOrchestrator:
    """Agent 编排器 — 管理一次完整的 Agent 对话轮次。"""

    def __init__(self):
        self.usage_stats: dict = {
            "input_tokens": 0,
            "output_tokens": 0,
            "cache_read_tokens": 0,
            "tool_calls": 0,
            "iterations": 0,
            "elapsed_ms": 0,
        }

    async def run(self, req: ChatRequest) -> AsyncGenerator[dict, None]:
        """运行 Agent 编排循环，yield SSE 事件。

        Args:
            req: 前端发来的聊天请求

        Yields:
            dict: {"event": "text_delta"|"tool_call"|"tool_result"|"confirm_required"|"error"|"done",
                   "data": {...}}
        """
        start_time = time.time()

        # ── 处理确认响应 ──────────────────────────────────
        if req.confirm_tool_call_id is not None:
            signal_confirmation(req.confirm_tool_call_id, req.confirm_result or False)
            # 确认响应不需要 yield 内容（旧的 SSE 连接会处理）
            yield {"event": "done", "data": {"ack": True}}
            return

        # ── 初始化 ───────────────────────────────────────
        try:
            provider = get_provider()
        except ValueError as e:
            yield {"event": "error", "data": {"message": str(e)}}
            return

        # 选择 provider（前端可覆盖）
        actual_provider_name = req.provider or "anthropic"
        actual_model = req.model or LLM_MODEL
        if req.api_key:
            # 前端传入的 API Key：重新创建 provider
            from .providers.anthropic import AnthropicProvider
            from .providers.openai_compat import OpenAICompatProvider
            if actual_provider_name == "anthropic":
                provider = AnthropicProvider(api_key=req.api_key)
            else:
                provider = OpenAICompatProvider(api_key=req.api_key)

        # 加载/创建会话
        history = ChatHistory(
            conversation_id=req.conversation_id,
            project_id=req.project_id,
            provider=actual_provider_name,
            model=actual_model,
            max_tokens=LLM_MAX_TOKENS,
        )

        # 记录用户消息
        history.add_message("user", req.message)

        # 构建 System Prompt
        system = self._build_system(req.project_id)

        # ── ReAct Loop ────────────────────────────────────
        iteration = 0

        while iteration < AGENT_MAX_ITERATIONS:
            iteration += 1

            # 获取当前消息列表
            messages = history.to_api_format()

            # 调用 LLM (streaming)
            tool_blocks = []
            assistant_text = ""
            usage = None
            error = None

            try:
                async for event in provider.stream_chat(
                    model=actual_model,
                    messages=messages,
                    tools=ALL_TOOL_DEFINITIONS,
                    system=system,
                    max_tokens=LLM_MAX_TOKENS,
                    temperature=LLM_TEMPERATURE,
                ):
                    if event["type"] == "text_delta":
                        assistant_text += event["text"]
                        yield {
                            "event": "text_delta",
                            "data": {"text": event["text"]},
                        }

                    elif event["type"] == "tool_use":
                        tool_blocks.append(event)
                        self.usage_stats["tool_calls"] += 1
                        yield {
                            "event": "tool_call",
                            "data": {
                                "id": event["id"],
                                "name": event["name"],
                                "status": "running",
                            },
                        }

                    elif event["type"] == "usage":
                        usage = event.get("usage")

                    elif event["type"] == "error":
                        error = event["message"]
                        break

            except Exception as e:
                logger.error(f"LLM 调用异常: {e}", exc_info=True)
                yield {
                    "event": "error",
                    "data": {"message": f"LLM 调用失败: {e}"},
                }
                break

            if error:
                yield {"event": "error", "data": {"message": error}}
                break

            # 累积 usage
            if usage:
                self.usage_stats["input_tokens"] += usage.get("input_tokens", 0)
                self.usage_stats["output_tokens"] += usage.get("output_tokens", 0)
                self.usage_stats["cache_read_tokens"] += usage.get("cache_read_input_tokens", 0)

            # 无工具调用 → 对话结束
            if not tool_blocks:
                history.add_message(
                    "assistant", assistant_text,
                    usage=usage,
                )
                break

            # 保存 assistant 消息（含 tool_use）
            history.add_message(
                "assistant", assistant_text,
                tool_calls=tool_blocks,
                usage=usage,
            )

            # 逐个执行工具
            for tb in tool_blocks:
                tool_name = tb["name"]
                tool_input = tb["input"]
                tool_call_id = tb["id"]

                # ⚠️ 安全检查：破坏性工具需确认
                if tool_name in DESTRUCTIVE_TOOLS:
                    # 构建删除详情（含完整照片信息）
                    detail = self._build_delete_detail(tool_input)

                    yield {
                        "event": "confirm_required",
                        "data": {
                            "tool_call_id": tool_call_id,
                            "tool_name": tool_name,
                            "summary": detail["summary"],
                            "details": detail["photos"],
                            "total_size_mb": detail["total_size_mb"],
                            "count": detail["count"],
                        },
                    }

                    # 等待用户确认
                    confirmed = await self._wait_for_confirmation(tool_call_id)

                    if not confirmed:
                        history.add_message(
                            "tool",
                            content=f"用户取消了删除操作",
                            tool_name=tool_name,
                            tool_call_id=tool_call_id,
                        )
                        yield {
                            "event": "tool_result",
                            "data": {
                                "id": tool_call_id,
                                "name": tool_name,
                                "status": "cancelled",
                                "result": "用户取消了删除操作",
                            },
                        }
                        continue

                # 执行工具
                with get_agent_db_session() as db:
                    result_json = execute_tool(tool_name, tool_input, db)

                    # 解析结果
                    try:
                        result_obj = json.loads(result_json)
                    except json.JSONDecodeError:
                        result_obj = {"raw": result_json}

                    # 检查是否有错误
                    is_error = isinstance(result_obj, dict) and "error" in result_obj

                # 保存 tool 消息
                history.add_message(
                    "tool",
                    content=result_json,
                    tool_name=tool_name,
                    tool_call_id=tool_call_id,
                )

                yield {
                    "event": "tool_result",
                    "data": {
                        "id": tool_call_id,
                        "name": tool_name,
                        "status": "error" if is_error else "done",
                        "result": result_obj,
                    },
                }

            # 继续循环（LLM 会根据 tool_result 决定下一步）
            self.usage_stats["iterations"] = iteration

        # ── 完成 ─────────────────────────────────────────
        self.usage_stats["elapsed_ms"] = int((time.time() - start_time) * 1000)

        yield {
            "event": "done",
            "data": {
                "conversation_id": history.conversation_id,
                "conversation": history.get_conversation_info(),
                "usage": self.usage_stats,
            },
        }

    # ── 内部方法 ──────────────────────────────────────────

    def _build_system(self, project_id: str | None) -> str:
        """构建 System Prompt，注入项目上下文。"""
        project_context = ""
        if project_id:
            with get_agent_db_session() as db:
                from models.project import Project
                from models.photo import Photo
                project = db.query(Project).filter(Project.id == project_id).first()
                if project:
                    photo_count = db.query(Photo).filter(
                        Photo.project_id == project_id
                    ).count()
                    project_context = f"""## 当前上下文
- 项目名称：{project.name}
- 照片数量：{photo_count} 张
- 项目 ID：{project_id}
（用户当前正在查看此项目，如无特别说明，操作默认针对此项目）
"""

        return f"""你是 PhotoHistory 智能助手，帮助用户管理和清理照片库。

{project_context}
## 你的能力
1. **列出项目** — 查看用户的所有照片项目（名称 + 照片数量）
2. **扫描相似照片** — 使用感知哈希 (dHash) + EXIF 交叉验证，找出视觉上几乎相同的照片组
3. **查看照片详情** — 单张照片的 EXIF 信息、AI 质量评分（0-10）、来源类型
4. **对比两张照片** — 计算 dHash 汉明距离（0=完全相同, ≤10=高度相似, >20=不相似）
5. **生成清理计划** — 逐组建议保留/删除，给出可解释的理由和预计释放空间
6. **执行清理** — 批量删除标记的照片（⚠️ 需要用户明确确认）

## 行为规则
- 使用自然、友好的中文交流，回答简洁
- 清理流程：扫描 → 计划 → 确认 → 执行（严格按顺序）
- 展示结果时突出关键数字：相似组数、重复张数、可释放空间
- 如有微信压缩图（source_type=wechat_compressed），特别提醒用户
- 低置信度相似组建议人工复核
- 销毁操作必须获得明确确认，绝不自作主张
- 如果用户意图不明确，主动询问澄清
- 工具返回的数据中，file_size_mb 是 MB，space_mb 是 MB
"""

    def _build_delete_detail(self, tool_input: dict) -> dict:
        """构建删除详情（用于确认卡片渲染），返回结构化数据。"""
        photo_ids = tool_input.get("photo_ids_to_delete", [])

        # 获取照片来源标签
        def _source_label(st: str) -> str:
            labels = {
                "manual": "手动上传（原图）",
                "wechat_compressed": "⚠️ 微信压缩图",
                "app_library": "App 相册导入",
            }
            return labels.get(st, st)

        with get_agent_db_session() as db:
            from models.photo import Photo
            photos = db.query(Photo).filter(Photo.id.in_(photo_ids)).all()

            photo_list = []
            total_size = 0
            for p in photos:
                total_size += p.file_size or 0
                photo_list.append({
                    "id": p.id,
                    "original_name": p.original_name,
                    "file_size_mb": round((p.file_size or 0) / 1048576, 2),
                    "resolution": f"{p.resolution_w}x{p.resolution_h}" if p.resolution_w else None,
                    "thumbnail_url": f"/api/projects/photos/{p.id}/file?thumb=true&size=200",
                    "file_url": f"/api/projects/photos/{p.id}/file",
                    "ai_score_overall": p.ai_score_overall,
                    "source_type_label": _source_label(p.source_type),
                })

            total_size_mb = round(total_size / 1048576, 2)

            return {
                "count": len(photo_ids),
                "total_size_mb": total_size_mb,
                "summary": f"即将删除 {len(photo_ids)} 张照片，释放约 {total_size_mb} MB 空间。此操作不可撤销！",
                "photos": photo_list,
            }

    async def _wait_for_confirmation(self, tool_call_id: str) -> bool:
        """等待用户确认（阻塞编排循环，由 router.py 的 POST 唤醒）。

        Returns:
            True=确认删除, False=取消/超时
        """
        event = asyncio.Event()
        _pending_confirmations[tool_call_id] = event

        try:
            # 等待确认信号或超时
            await asyncio.wait_for(event.wait(), timeout=AGENT_CONFIRM_TIMEOUT)
            result = _confirmation_results.get(tool_call_id, False)
            return result
        except asyncio.TimeoutError:
            logger.warning(f"确认超时: tool_call_id={tool_call_id}")
            return False
        finally:
            _pending_confirmations.pop(tool_call_id, None)
            _confirmation_results.pop(tool_call_id, None)
