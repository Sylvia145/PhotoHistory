"""PhotoHistory MCP Server — FastMCP 实例 + Tool 注册 + 启动入口。

两种启动方式：
1. Stdio 模式（默认）：python -m mcp_server.server
   → Claude Code/Desktop 通过 stdio 协议直连
2. HTTP 模式：通过 main.py 挂载 streamable_http_app()
   → 远程 Agent 通过 HTTP 调用

所有 tool 函数共享同一个 mcp 实例。
"""

import json

from mcp.server.fastmcp import FastMCP

from config import MCP_SERVER_NAME
from .tools import (
    do_scan_similar_groups,
    do_get_photo_detail,
    do_compare_two_photos,
    do_suggest_cleanup_plan,
    do_execute_cleanup,
)

# ── FastMCP 实例 ─────────────────────────────────────────────
# stateless_http=True 是 Streamable HTTP 传输模式的要求，
# 对 stdio 模式无影响，但保证两种模式共享同一个实例定义
mcp = FastMCP(MCP_SERVER_NAME, stateless_http=True)


# ── Tool 注册 ────────────────────────────────────────────────


@mcp.tool()
def scan_similar_groups(project_id: str) -> str:
    """扫描指定项目内的所有照片，使用 dHash 感知哈希 + EXIF 交叉验证算法，
    自动将相似照片聚类为「相似组」，并为每组生成保留/删除建议。

    每组内的照片在视觉上高度相似（dHash 汉明距离 <= 10）。

    何时调用：
    - 用户说「帮我看看这个项目里有哪些重复照片」
    - 用户说「扫描一下相似照片」
    - 在调用 suggest_cleanup_plan 之前必须先调用此工具

    参数:
        project_id: 项目唯一标识符（UUID 格式）

    返回:
        JSON 格式字符串，包含：
        - group_count: 相似组数量
        - total_keep: 建议保留的照片数
        - total_delete: 建议删除的照片数
        - total_space_saved_mb: 预计可释放空间（MB）
        - groups: 每组照片明细（含 cleanup_status、cleanup_reason 等字段）
    """
    result = do_scan_similar_groups(project_id)
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
def get_photo_detail(photo_id: str) -> str:
    """获取单张照片的完整信息，包括文件属性、EXIF 元数据、感知哈希、
    质量检测结果和清理状态。

    何时调用：
    - 用户想深入了解某张特定照片的信息
    - 在对比两张照片之前，先获取各自的详情
    - Agent 需要根据照片质量做出保留/删除决策时

    参数:
        photo_id: 照片唯一标识符。可从 scan_similar_groups 返回结果中获取

    返回:
        JSON 格式字符串，包含照片的全部字段（含衍生字段如 file_size_mb、megapixels 等）
    """
    result = do_get_photo_detail(photo_id)
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
def compare_two_photos(photo_id_a: str, photo_id_b: str) -> str:
    """对比两张照片的相似度。计算 dHash 汉明距离、文件大小比、
    分辨率差异、时间差等指标，并给出综合相似度判定和质量比较。

    汉明距离阈值：
    - 0: 完全相同
    - 1-10: 高度相似（确认同源）
    - 11-20: 可能相似（需人工判断）
    - > 20: 不相似

    何时调用：
    - 用户问「这两张照片有什么区别」
    - Agent 需要确认两张照片是否为同一组
    - 用户想手动对比两张疑似重复的照片

    参数:
        photo_id_a: 第一张照片的 ID
        photo_id_b: 第二张照片的 ID

    返回:
        JSON 格式字符串，包含对比指标和综合判定结论
    """
    result = do_compare_two_photos(photo_id_a, photo_id_b)
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
def suggest_cleanup_plan(project_id: str) -> str:
    """为项目生成详细的清理计划。列出每个相似组的保留/删除建议、
    理由和预计释放空间。

    重要前提：必须先调用 scan_similar_groups 工具完成扫描！

    清理规则：
    - 每组保留 1 张最优照片（EXIF 完整 + 文件最大 + 非微信压缩）
    - 微信压缩图在同组存在原图时建议删除
    - 单张照片视为独立照片，建议保留

    何时调用：
    - 用户说「帮我生成清理计划」
    - 扫描完成后需要预览具体哪些照片会被删除
    - 在执行清理之前用户想确认清理方案

    参数:
        project_id: 项目唯一标识符

    返回:
        JSON 格式字符串，包含：
        - summary: 清理计划摘要（总组数、保留/删除数量、释放空间）
        - plan: 逐组明细（每组保留/删除照片 + 理由）
        - recommendation: 面向人类的自然语言建议
    """
    result = do_suggest_cleanup_plan(project_id)
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
def execute_cleanup(project_id: str, photo_ids_to_delete: list[str]) -> str:
    """执行清理计划，批量删除指定的照片。

    ⚠️ 此操作不可撤销！照片文件将被永久删除。

    安全机制（三道防线）：
    1. 参数校验：photo_ids_to_delete 不能为空
    2. 归属验证：每张照片必须属于指定的 project
    3. 状态锁：只删除 cleanup_status='delete' 的照片
       → 必须先 scan_similar_groups 扫描 + 用户确认标记

    何时调用：
    - 用户明确说「确认删除」「执行清理」「帮我删掉这些」
    - Agent 已展示清理计划且用户已明确确认
    - ⚠️ 不应猜测用户意图，必须有明确的删除确认

    参数:
        project_id: 项目唯一标识符
        photo_ids_to_delete: 待删除的照片 ID 列表

    返回:
        JSON 格式字符串，包含删除结果统计和明细。
        删除失败的照片会列出原因，帮助 Agent 自我纠正。
    """
    result = do_execute_cleanup(project_id, photo_ids_to_delete)
    return json.dumps(result, ensure_ascii=False, indent=2)


# ── 工厂函数 ─────────────────────────────────────────────────


def create_mcp_server() -> FastMCP:
    """工厂函数：返回已配置好所有 tool 的 mcp 实例。

    Returns:
        已注册 5 个 tool 的 FastMCP 实例
    """
    return mcp


# ── Stdio 启动入口 ───────────────────────────────────────────

if __name__ == "__main__":
    mcp.run(transport="stdio")
