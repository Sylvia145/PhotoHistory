"""LLM Tool Schema 定义 + Handler 映射。

为 Agent 编排器提供 6 个工具:
1. list_projects       — 列出所有项目（比 MCP 多一个，Agent 需要发现能力）
2. scan_similar_groups — 扫描相似照片组
3. get_photo_detail    — 单张照片详情
4. compare_two_photos  — 两张照片对比
5. suggest_cleanup_plan — 清理计划
6. execute_cleanup     — 执行删除（含确认门）

每个工具包含:
- schema: Claude API tool_use 格式定义
- handler: 执行函数（复用 MCP server tools.py 中的业务逻辑）
"""

import json
import logging
import os
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from .db_session import get_agent_db_session

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════
# 工具函数
# ═══════════════════════════════════════════════════════════════

def _size_mb(bytes_val: int | None) -> float | None:
    """字节数 → MB（保留 2 位小数）。"""
    if bytes_val is None:
        return None
    return round(bytes_val / 1024 / 1024, 2)


def _source_label(source_type: str) -> str:
    """将 source_type 转为中文标签。"""
    labels = {
        "manual": "手动上传（原图）",
        "wechat_compressed": "⚠️ 微信压缩图",
        "app_library": "App 相册导入",
    }
    return labels.get(source_type, source_type)


def _photo_to_agent_dict(photo) -> dict:
    """统一照片序列化格式，供所有 Agent 工具使用。

    比 MCP 版 _photo_to_dict 更丰富：增加缩略图 URL、文件访问 URL。
    """
    from models.photo import Photo

    return {
        # 基本标识
        "id": photo.id,
        "original_name": photo.original_name,

        # 访问 URL（前端渲染用）
        "file_url": f"/api/projects/photos/{photo.id}/file",
        "thumbnail_url": f"/api/projects/photos/{photo.id}/file?thumb=true&size=200",

        # 基本信息
        "file_size": photo.file_size,
        "file_size_mb": _size_mb(photo.file_size),
        "mime_type": photo.mime_type,
        "resolution_w": photo.resolution_w,
        "resolution_h": photo.resolution_h,
        "resolution": f"{photo.resolution_w}x{photo.resolution_h}" if photo.resolution_w and photo.resolution_h else None,

        # EXIF
        "exif_datetime_original": photo.exif_datetime_original,
        "exif_make": photo.exif_make,
        "exif_model": photo.exif_model,
        "exif_has_all": photo.exif_has_all,

        # 质量
        "quality_status": photo.quality_status,
        "quality_reason": photo.quality_reason,
        "ai_score_sharpness": photo.ai_score_sharpness,
        "ai_score_aesthetic": photo.ai_score_aesthetic,
        "ai_score_overall": photo.ai_score_overall,

        # 来源
        "source_type": photo.source_type,
        "source_type_label": _source_label(photo.source_type),

        # 清理状态
        "cleanup_status": photo.cleanup_status,
        "cleanup_group_id": photo.cleanup_group_id,
        "cleanup_group_rank": photo.cleanup_group_rank,
        "cleanup_reason": photo.cleanup_reason,
    }


# ═══════════════════════════════════════════════════════════════
# Tool Schema 定义（Claude API 格式）
# ═══════════════════════════════════════════════════════════════

TOOL_LIST_PROJECTS = {
    "name": "list_projects",
    "description": "列出用户创建的所有照片项目。返回每个项目的名称、照片数量和更新时间。"
                   "当用户说「帮我看看有哪些项目」「列出我的项目」时调用此工具。",
    "input_schema": {
        "type": "object",
        "properties": {},
        "required": [],
    },
}

TOOL_SCAN_SIMILAR_GROUPS = {
    "name": "scan_similar_groups",
    "description": "扫描指定项目内的所有照片，使用 dHash 感知哈希 + EXIF 交叉验证算法，"
                   "自动将相似照片聚类为「相似组」，并为每组生成保留/删除建议。"
                   "当用户说「扫描重复照片」「帮我看看有哪些重复的」时调用。"
                   "在执行 suggest_cleanup_plan 之前必须先调用此工具。",
    "input_schema": {
        "type": "object",
        "properties": {
            "project_id": {
                "type": "string",
                "description": "项目唯一标识符 (UUID)",
            },
        },
        "required": ["project_id"],
    },
}

TOOL_GET_PHOTO_DETAIL = {
    "name": "get_photo_detail",
    "description": "获取单张照片的完整信息：文件大小、分辨率、EXIF 元数据、"
                   "AI 质量评分（清晰度/美学/综合）、感知哈希、清理状态。"
                   "当用户想了解某张特定照片的详细信息时调用。",
    "input_schema": {
        "type": "object",
        "properties": {
            "photo_id": {
                "type": "string",
                "description": "照片唯一标识符 (UUID)。可从 scan_similar_groups 返回结果中获取",
            },
        },
        "required": ["photo_id"],
    },
}

TOOL_COMPARE_TWO_PHOTOS = {
    "name": "compare_two_photos",
    "description": "对比两张照片的相似度。计算 dHash 汉明距离（0=完全相同, ≤10=高度相似, "
                   "11-20=可能相似, >20=不相似）、文件大小比、分辨率差异和时间差。"
                   "当用户问「这两张有什么区别」「哪张更好」时调用。",
    "input_schema": {
        "type": "object",
        "properties": {
            "photo_id_a": {
                "type": "string",
                "description": "第一张照片的 ID",
            },
            "photo_id_b": {
                "type": "string",
                "description": "第二张照片的 ID",
            },
        },
        "required": ["photo_id_a", "photo_id_b"],
    },
}

TOOL_SUGGEST_CLEANUP_PLAN = {
    "name": "suggest_cleanup_plan",
    "description": "为项目生成详细的清理计划。列出每个相似组哪些照片建议保留、哪些建议删除、"
                   "理由是什么、预计可释放多少空间。"
                   "**前提**: 必须先调用 scan_similar_groups 完成扫描。"
                   "当用户说「生成清理计划」「哪些可以删」时调用。",
    "input_schema": {
        "type": "object",
        "properties": {
            "project_id": {
                "type": "string",
                "description": "项目唯一标识符",
            },
        },
        "required": ["project_id"],
    },
}

TOOL_EXECUTE_CLEANUP = {
    "name": "execute_cleanup",
    "description": "⚠️ **不可撤销操作**：永久删除指定的照片文件。\n"
                   "必须满足以下条件才能调用：\n"
                   "1. 用户已明确表示要删除照片（如「确认删除」「执行清理」）\n"
                   "2. 已经展示了清理计划并得到用户确认\n"
                   "3. 每张照片都已标记为 cleanup_status='delete'\n"
                   "⚠️ 如果用户只是问「能不能删」而非明确确认，不要调用此工具。",
    "input_schema": {
        "type": "object",
        "properties": {
            "project_id": {
                "type": "string",
                "description": "项目唯一标识符",
            },
            "photo_ids_to_delete": {
                "type": "array",
                "items": {"type": "string"},
                "description": "待删除的照片 ID 列表",
            },
        },
        "required": ["project_id", "photo_ids_to_delete"],
    },
}

TOOL_RESTORE_PHOTOS = {
    "name": "restore_photos",
    "description": "从回收站恢复已软删除的照片。照片在软删除后 30 分钟内可通过此工具恢复。"
                   "当用户说「恢复刚才删除的照片」「撤销删除」「从回收站还原」时调用此工具。",
    "input_schema": {
        "type": "object",
        "properties": {
            "photo_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "待恢复的照片 ID 列表",
            },
        },
        "required": ["photo_ids"],
    },
}

TOOL_SEARCH_PHOTOS = {
    "name": "search_photos",
    "description": "按条件搜索照片：可按拍摄日期范围、设备品牌/型号、来源类型（手动/微信压缩/App导入）"
                   "组合筛选。当用户问「去年用 iPhone 拍的照片」「最近一周拍的」「找微信压缩图」时调用。",
    "input_schema": {
        "type": "object",
        "properties": {
            "project_id": {
                "type": "string",
                "description": "项目唯一标识符 (UUID)",
            },
            "date_from": {
                "type": "string",
                "description": "拍摄日期起始 (ISO 格式，如 '2024-01-01')",
            },
            "date_to": {
                "type": "string",
                "description": "拍摄日期截止 (ISO 格式，如 '2024-12-31')",
            },
            "make": {
                "type": "string",
                "description": "相机/手机品牌 (exif_make)，如 'Apple', 'Canon'",
            },
            "model": {
                "type": "string",
                "description": "设备型号 (exif_model)，如 'iPhone 15 Pro'",
            },
            "source_type": {
                "type": "string",
                "description": "来源类型: 'manual'(手动上传), 'wechat_compressed'(微信压缩图), 'app_library'(App导入)",
            },
            "quality_status": {
                "type": "string",
                "description": "质量状态: 'ok'(正常), 'blurry'(模糊), 'overexposed'(过曝)",
            },
            "min_score": {
                "type": "number",
                "description": "最低 AI 综合评分 (0-10)",
            },
            "limit": {
                "type": "integer",
                "description": "返回条数上限，默认 50",
            },
        },
        "required": ["project_id"],
    },
}

# 全部工具定义列表
ALL_TOOL_DEFINITIONS = [
    TOOL_LIST_PROJECTS,
    TOOL_SCAN_SIMILAR_GROUPS,
    TOOL_GET_PHOTO_DETAIL,
    TOOL_COMPARE_TWO_PHOTOS,
    TOOL_SUGGEST_CLEANUP_PLAN,
    TOOL_EXECUTE_CLEANUP,
    TOOL_RESTORE_PHOTOS,
    TOOL_SEARCH_PHOTOS,
]

# 破坏性工具集合（需确认门）
DESTRUCTIVE_TOOLS = {"execute_cleanup"}


# ═══════════════════════════════════════════════════════════════
# Tool Handler 映射
# ═══════════════════════════════════════════════════════════════

def execute_tool(tool_name: str, tool_input: dict, db: Session) -> str:
    """执行指定工具，返回 JSON 字符串结果。

    Args:
        tool_name: 工具名
        tool_input: 工具参数（来自 LLM）
        db: 数据库会话

    Returns:
        JSON 字符串 — 工具执行结果
    """
    handler = _HANDLERS.get(tool_name)
    if handler is None:
        return json.dumps({"error": f"未知工具: {tool_name}"}, ensure_ascii=False)

    try:
        result = handler(db, **tool_input)
        if isinstance(result, str):
            return result
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"工具执行失败 [{tool_name}]: {e}", exc_info=True)
        return json.dumps({"error": f"工具执行失败: {e}"}, ensure_ascii=False)


def _handle_list_projects(db: Session) -> dict:
    """列出所有项目。"""
    from models.project import Project

    projects = (
        db.query(Project)
        .order_by(Project.updated_at.desc())
        .all()
    )

    return {
        "projects": [
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "photo_count": len(p.photos) if p.photos else 0,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            }
            for p in projects
        ],
        "total": len(projects),
    }


def _handle_scan_similar_groups(db: Session, project_id: str) -> dict:
    """扫描相似组。复用 MCP tools 的业务逻辑。"""
    from mcp_server.tools import do_scan_similar_groups
    # do_scan_similar_groups 内部自己管理 db session，
    # 但这里我们需要在同一个 db session 中调用。
    # 改为直接调用底层逻辑。
    from models.project import Project
    from services.grouping import analyze_project
    from services.cleanup_engine import generate_cleanup_suggestions

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return {"error": f"项目不存在: {project_id}"}

    chains = analyze_project(project_id, db)
    for chain in chains:
        generate_cleanup_suggestions(chain.photos)
    db.commit()

    # 构建响应
    groups = []
    for chain in chains:
        keep_photos = [p for p in chain.photos if p.cleanup_status == "keep"]
        delete_photos = [p for p in chain.photos if p.cleanup_status == "delete"]
        groups.append({
            "group_id": chain.group_id,
            "photo_count": len(chain.photos),
            "keep_count": len(keep_photos),
            "delete_count": len(delete_photos),
            "estimated_space_saved_mb": round(
                sum(p.file_size or 0 for p in delete_photos) / 1024 / 1024, 2
            ),
            "confidence_label": (
                "HIGH" if chain.overall_confidence >= 0.9
                else "MEDIUM" if chain.overall_confidence >= 0.6
                else "LOW"
            ),
            "photos": [_photo_to_agent_dict(p) for p in chain.photos],
        })

    total_keep = sum(g["keep_count"] for g in groups)
    total_delete = sum(g["delete_count"] for g in groups)
    total_space = sum(
        sum(p.file_size or 0 for p in chain.photos if p.cleanup_status == "delete")
        for chain in chains
    )

    return {
        "project_id": project_id,
        "project_name": project.name,
        "group_count": len(groups),
        "total_photos_in_groups": sum(g["photo_count"] for g in groups),
        "total_keep": total_keep,
        "total_delete": total_delete,
        "total_space_saved_mb": round(total_space / 1024 / 1024, 2),
        "groups": groups,
    }


def _handle_get_photo_detail(db: Session, photo_id: str) -> dict:
    """获取单张照片详情。"""
    from models.photo import Photo

    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        return {"error": f"照片不存在: {photo_id}"}

    return _photo_to_agent_dict(photo)


def _handle_compare_two_photos(
    db: Session, photo_id_a: str, photo_id_b: str
) -> dict:
    """对比两张照片。"""
    from models.photo import Photo
    from services.hash_service import hamming_distance
    from datetime import datetime

    photo_a = db.query(Photo).filter(Photo.id == photo_id_a).first()
    photo_b = db.query(Photo).filter(Photo.id == photo_id_b).first()

    if not photo_a:
        return {"error": f"照片 A 不存在: {photo_id_a}"}
    if not photo_b:
        return {"error": f"照片 B 不存在: {photo_id_b}"}

    # dHash 距离
    dhash_dist = None
    if photo_a.dhash and photo_b.dhash:
        dhash_dist = hamming_distance(photo_a.dhash, photo_b.dhash)

    # 相似度判定
    if dhash_dist is None:
        verdict = "无法计算"
        verdict_detail = "缺少 dHash 数据"
    elif dhash_dist <= 10:
        verdict = "高度相似 — 确认同源"
        verdict_detail = f"汉明距离 {dhash_dist} (≤10 = 高度相似)"
    elif dhash_dist <= 20:
        verdict = "可能相似 — 建议人工判断"
        verdict_detail = f"汉明距离 {dhash_dist} (11-20 = 可能相似)"
    else:
        verdict = "不相似"
        verdict_detail = f"汉明距离 {dhash_dist} (>20 = 不相似)"

    # 文件大小比
    size_ratio = None
    if photo_a.file_size and photo_b.file_size and photo_b.file_size > 0:
        size_ratio = round(photo_a.file_size / photo_b.file_size, 2)

    # 分辨率差异
    res_diff_mp = None
    if photo_a.resolution_w and photo_a.resolution_h and photo_b.resolution_w and photo_b.resolution_h:
        mp_a = photo_a.resolution_w * photo_a.resolution_h / 1_000_000
        mp_b = photo_b.resolution_w * photo_b.resolution_h / 1_000_000
        res_diff_mp = round(abs(mp_a - mp_b), 1)

    # 时间差
    time_diff_seconds = None
    if photo_a.exif_datetime_original and photo_b.exif_datetime_original:
        try:
            ta = datetime.fromisoformat(photo_a.exif_datetime_original)
            tb = datetime.fromisoformat(photo_b.exif_datetime_original)
            time_diff_seconds = abs((ta - tb).total_seconds())
        except (ValueError, TypeError):
            pass

    # 质量评分对比
    quality_comparison = {}
    if photo_a.ai_score_overall is not None and photo_b.ai_score_overall is not None:
        diff = round(photo_a.ai_score_overall - photo_b.ai_score_overall, 1)
        quality_comparison = {
            "score_a": photo_a.ai_score_overall,
            "score_b": photo_b.ai_score_overall,
            "difference": diff,
            "winner": "A" if diff > 0 else "B" if diff < 0 else "tie",
        }

    # 建议
    suggestion = None
    if verdict == "高度相似 — 确认同源":
        if quality_comparison and quality_comparison.get("winner") == "A":
            suggestion = "保留照片 A（AI 评分更高），删除照片 B"
        elif quality_comparison and quality_comparison.get("winner") == "B":
            suggestion = "保留照片 B（AI 评分更高），删除照片 A"
        elif size_ratio and size_ratio > 1.5:
            suggestion = "保留照片 A（文件更大，可能包含更多细节）"
        elif size_ratio and size_ratio < 0.67:
            suggestion = "保留照片 B（文件更大，可能包含更多细节）"
        else:
            suggestion = "两张照片非常相似，建议人工选择保留哪张"

    return {
        "photo_a": _photo_to_agent_dict(photo_a),
        "photo_b": _photo_to_agent_dict(photo_b),
        "comparison": {
            "dhash_distance": dhash_dist,
            "verdict": verdict,
            "verdict_detail": verdict_detail,
            "size_ratio": size_ratio,
            "res_diff_mp": res_diff_mp,
            "time_diff_seconds": time_diff_seconds,
            "quality_comparison": quality_comparison,
            "suggestion": suggestion,
        },
    }


def _handle_suggest_cleanup_plan(db: Session, project_id: str) -> dict:
    """生成清理计划。"""
    from models.project import Project
    from models.photo import Photo

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return {"error": f"项目不存在: {project_id}"}

    scanned = (
        db.query(Photo)
        .filter(Photo.project_id == project_id, Photo.cleanup_status.isnot(None), Photo.deleted_at.is_(None))
        .count()
    )
    if scanned == 0:
        return {
            "error": "项目尚未扫描，请先调用 scan_similar_groups 工具",
            "scan_required": True,
        }

    photos = (
        db.query(Photo)
        .filter(Photo.project_id == project_id, Photo.deleted_at.is_(None))
        .order_by(Photo.cleanup_group_id, Photo.cleanup_group_rank)
        .all()
    )

    groups: dict[str, list[Photo]] = {}
    ungrouped: list[Photo] = []
    for p in photos:
        if p.cleanup_group_id:
            groups.setdefault(p.cleanup_group_id, []).append(p)
        else:
            ungrouped.append(p)

    plan = []
    total_keep = 0
    total_delete = 0
    total_space = 0
    high = med = low = 0

    for gid, gphotos in groups.items():
        keep = [p for p in gphotos if p.cleanup_status == "keep"]
        delete = [p for p in gphotos if p.cleanup_status == "delete"]
        space = sum(p.file_size or 0 for p in delete)
        exif_ratio = sum(1 for p in gphotos if p.exif_has_all) / len(gphotos) if gphotos else 0

        if exif_ratio >= 0.8:
            conf = "HIGH"
            high += 1
        elif exif_ratio >= 0.5:
            conf = "MEDIUM"
            med += 1
        else:
            conf = "LOW"
            low += 1

        plan.append({
            "group_id": gid,
            "photo_count": len(gphotos),
            "confidence": conf,
            "action": f"保留 {len(keep)} 张，删除 {len(delete)} 张",
            "space_mb": round(space / 1024 / 1024, 2),
            "keep": [_photo_to_agent_dict(p) for p in keep],
            "delete": [_photo_to_agent_dict(p) for p in delete],
        })
        total_keep += len(keep)
        total_delete += len(delete)
        total_space += space

    return {
        "project_id": project_id,
        "summary": {
            "groups": len(plan),
            "keep": total_keep,
            "delete": total_delete,
            "space_mb": round(total_space / 1024 / 1024, 2),
            "high_confidence": high,
            "medium_confidence": med,
            "low_confidence": low,
            "ungrouped": len(ungrouped),
        },
        "plan": plan,
    }


def _handle_execute_cleanup(
    db: Session, project_id: str, photo_ids_to_delete: list[str]
) -> dict:
    """执行软删除：标记 deleted_at 和 deleted_by，不物理删除文件。

    V3.1 改进：30 分钟内可从回收站恢复。
    """
    from models.photo import Photo
    from models.cleanup_history import CleanupHistory
    from datetime import datetime
    import os

    # 统计操作前照片总数
    photo_count_before = (
        db.query(Photo)
        .filter(Photo.project_id == project_id, Photo.deleted_at.is_(None))
        .count()
    )

    deleted: list[dict] = []
    failed: list[dict] = []
    now = datetime.now()

    for photo_id in photo_ids_to_delete:
        photo = db.query(Photo).filter(Photo.id == photo_id, Photo.project_id == project_id).first()
        if not photo:
            failed.append({"photo_id": photo_id, "reason": "照片不存在"})
            continue

        if photo.deleted_at is not None:
            failed.append({"photo_id": photo_id, "reason": "照片已被删除"})
            continue

        # 软删除：标记时间戳
        photo.deleted_at = now
        photo.deleted_by = "agent"

        deleted.append({
            "photo_id": photo_id,
            "original_name": photo.original_name,
            "file_size": photo.file_size or 0,
            "file_size_mb": _size_mb(photo.file_size),
            "deleted_at": now.isoformat(),
            "restore_before": (now + timedelta(minutes=30)).isoformat(),
        })

    # 创建清理历史记录
    space_freed = sum(d["file_size"] for d in deleted)
    try:
        history = CleanupHistory(
            project_id=project_id,
            deleted_count=len(deleted),
            space_freed=space_freed,
            photo_count_before=photo_count_before,
            photo_count_after=photo_count_before - len(deleted),
        )
        db.add(history)
    except Exception:
        pass  # cleanup_history 表可能还未创建

    db.commit()

    return {
        "success": len(failed) == 0,
        "soft_delete": True,
        "restore_window_minutes": 30,
        "summary": {
            "deleted_count": len(deleted),
            "failed_count": len(failed),
            "space_freed_mb": _size_mb(space_freed),
            "photo_count_before": photo_count_before,
            "photo_count_after": photo_count_before - len(deleted),
        },
        "deleted": deleted,
        "failed": failed,
    }


def _handle_restore_photos(db: Session, photo_ids: list[str]) -> dict:
    """从回收站恢复已软删除的照片。"""
    from models.photo import Photo

    restored: list[dict] = []
    failed: list[dict] = []

    for photo_id in photo_ids:
        photo = db.query(Photo).filter(Photo.id == photo_id).first()
        if not photo:
            failed.append({"photo_id": photo_id, "reason": "照片不存在"})
            continue
        if photo.deleted_at is None:
            failed.append({"photo_id": photo_id, "reason": "照片未被删除，无需恢复"})
            continue

        photo.deleted_at = None
        photo.deleted_by = None
        restored.append({
            "photo_id": photo_id,
            "original_name": photo.original_name,
        })

    db.commit()

    return {
        "success": len(failed) == 0,
        "restored_count": len(restored),
        "failed_count": len(failed),
        "restored": restored,
        "failed": failed,
    }


def _handle_search_photos(
    db: Session,
    project_id: str,
    date_from: str = None,
    date_to: str = None,
    make: str = None,
    model: str = None,
    source_type: str = None,
    quality_status: str = None,
    min_score: float = None,
    limit: int = 50,
) -> dict:
    """按条件搜索照片。"""
    from models.photo import Photo

    query = db.query(Photo).filter(
        Photo.project_id == project_id,
        Photo.deleted_at.is_(None),
    )

    if date_from:
        query = query.filter(Photo.exif_datetime_original >= date_from)
    if date_to:
        query = query.filter(Photo.exif_datetime_original <= date_to)
    if make:
        query = query.filter(Photo.exif_make.ilike(f"%{make}%"))
    if model:
        query = query.filter(Photo.exif_model.ilike(f"%{model}%"))
    if source_type:
        query = query.filter(Photo.source_type == source_type)
    if quality_status:
        query = query.filter(Photo.quality_status == quality_status)
    if min_score is not None:
        query = query.filter(Photo.ai_score_overall >= min_score)

    total = query.count()
    photos = query.order_by(Photo.exif_datetime_original.desc()).limit(limit).all()

    return {
        "project_id": project_id,
        "total": total,
        "returned": len(photos),
        "photos": [_photo_to_agent_dict(p) for p in photos],
        "filters_applied": {
            k: v for k, v in {
                "date_from": date_from,
                "date_to": date_to,
                "make": make,
                "model": model,
                "source_type": source_type,
                "quality_status": quality_status,
                "min_score": min_score,
            }.items() if v is not None
        },
    }


# Handler 注册表
_HANDLERS: dict[str, Any] = {
    "list_projects": _handle_list_projects,
    "scan_similar_groups": _handle_scan_similar_groups,
    "get_photo_detail": _handle_get_photo_detail,
    "compare_two_photos": _handle_compare_two_photos,
    "suggest_cleanup_plan": _handle_suggest_cleanup_plan,
    "execute_cleanup": _handle_execute_cleanup,
    "restore_photos": _handle_restore_photos,
    "search_photos": _handle_search_photos,
}
