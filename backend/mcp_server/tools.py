"""MCP Tool 业务实现。

每个函数：
- 接收基本类型参数（str, list[str] 等 MCP 可序列化的类型）
- 通过 get_mcp_db_session() 获取独立数据库会话
- 调用 services/ 和 models/ 完成业务逻辑
- 返回 dict（由 FastMCP 自动序列化为 JSON 字符串）
- 错误不抛异常，返回包含 "error" 键的 dict
"""

import json
import os
from datetime import datetime

from .db_session import get_mcp_db_session
from .security import (
    SecurityError,
    validate_cleanup_params,
    validate_photo_belongs_to_project,
    ensure_photo_marked_delete,
)
from models.project import Project
from models.photo import Photo
from models.cleanup_history import CleanupHistory
from services.grouping import analyze_project
from services.cleanup_engine import generate_cleanup_suggestions
from services.hash_service import hamming_distance


# ═══════════════════════════════════════════════════════════════
# 辅助函数
# ═══════════════════════════════════════════════════════════════

def _fmt_size(bytes_val: int | None) -> str:
    """将字节数格式化为人类可读字符串。"""
    if bytes_val is None:
        return "未知"
    if bytes_val < 1024:
        return f"{bytes_val} B"
    elif bytes_val < 1024 * 1024:
        return f"{bytes_val / 1024:.1f} KB"
    else:
        return f"{bytes_val / 1024 / 1024:.1f} MB"


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


def _photo_to_dict(photo: Photo) -> dict:
    """Photo ORM → 供 MCP 工具返回的 dict（含衍生字段）。"""
    return {
        "id": photo.id,
        "project_id": photo.project_id,
        "original_name": photo.original_name,
        "file_size": photo.file_size,
        "file_size_mb": _size_mb(photo.file_size),
        "mime_type": photo.mime_type,
        "resolution_w": photo.resolution_w,
        "resolution_h": photo.resolution_h,
        "resolution": (
            f"{photo.resolution_w}x{photo.resolution_h}"
            if photo.resolution_w and photo.resolution_h
            else None
        ),
        "megapixels": (
            round(photo.resolution_w * photo.resolution_h / 1_000_000, 1)
            if photo.resolution_w and photo.resolution_h
            else None
        ),
        "exif_datetime_original": photo.exif_datetime_original,
        "exif_make": photo.exif_make,
        "exif_model": photo.exif_model,
        "exif_has_all": photo.exif_has_all,
        "quality_status": photo.quality_status,
        "quality_reason": photo.quality_reason,
        "ai_score_sharpness": photo.ai_score_sharpness,
        "ai_score_aesthetic": photo.ai_score_aesthetic,
        "ai_score_overall": photo.ai_score_overall,
        "dhash": photo.dhash,
        "source_type": photo.source_type,
        "source_type_label": _source_label(photo.source_type),
        "uploaded_at": photo.uploaded_at.isoformat() if photo.uploaded_at else None,
        "cleanup_status": photo.cleanup_status,
        "cleanup_group_id": photo.cleanup_group_id,
        "cleanup_group_rank": photo.cleanup_group_rank,
        "cleanup_reason": photo.cleanup_reason,
    }


# ═══════════════════════════════════════════════════════════════
# Tool 1: scan_similar_groups
# ═══════════════════════════════════════════════════════════════

def do_scan_similar_groups(project_id: str) -> dict:
    """扫描项目内所有相似照片组，生成清理建议。

    流程: 分组 → 清理引擎评分 → 写入 cleanup 字段 → 返回分组结果。
    对应 REST API: POST /api/projects/{id}/cleanup/scan
    """
    with get_mcp_db_session() as db:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return {"error": f"项目不存在，请检查 project_id: {project_id}"}

        # 执行分组
        chains = analyze_project(project_id, db)

        # 为每组的照片生成清理建议
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
                "estimated_space_saved": sum(p.file_size or 0 for p in delete_photos),
                "estimated_space_saved_mb": _size_mb(sum(p.file_size or 0 for p in delete_photos)),
                "confidence": chain.overall_confidence,
                "confidence_label": (
                    "HIGH" if chain.overall_confidence >= 0.9
                    else "MEDIUM" if chain.overall_confidence >= 0.6
                    else "LOW"
                ),
                "photos": [_photo_to_dict(p) for p in chain.photos],
            })

        total_keep = sum(g["keep_count"] for g in groups)
        total_delete = sum(g["delete_count"] for g in groups)
        total_space = sum(g["estimated_space_saved"] for g in groups)

        return {
            "project_id": project_id,
            "group_count": len(groups),
            "total_photos": sum(g["photo_count"] for g in groups),
            "total_keep": total_keep,
            "total_delete": total_delete,
            "total_space_saved": total_space,
            "total_space_saved_mb": _size_mb(total_space),
            "groups": groups,
        }


# ═══════════════════════════════════════════════════════════════
# Tool 2: get_photo_detail
# ═══════════════════════════════════════════════════════════════

def do_get_photo_detail(photo_id: str) -> dict:
    """获取单张照片的完整信息（EXIF + 哈希 + 质量 + 清理状态）。

    对应 REST API: GET /api/projects/{id}/photos/{photo_id}
    注意：不要求 project_id，因为 photo_id 全局唯一。
    """
    with get_mcp_db_session() as db:
        photo = db.query(Photo).filter(Photo.id == photo_id).first()
        if not photo:
            return {"error": f"照片不存在，请检查 photo_id: {photo_id}"}

        return _photo_to_dict(photo)


# ═══════════════════════════════════════════════════════════════
# Tool 3: compare_two_photos
# ═══════════════════════════════════════════════════════════════

def do_compare_two_photos(photo_id_a: str, photo_id_b: str) -> dict:
    """计算两张照片的 dHash 汉明距离 + 综合对比。

    阈值说明：
    - 距离 0-10: 高度相似（确认同源）
    - 距离 11-20: 可能相似（需人工判断）
    - 距离 > 20: 不相似

    对应 REST API: GET /api/photos/{photo_id}/compare/{other_id}
    """
    with get_mcp_db_session() as db:
        photo_a = db.query(Photo).filter(Photo.id == photo_id_a).first()
        photo_b = db.query(Photo).filter(Photo.id == photo_id_b).first()

        if not photo_a:
            return {"error": f"照片 A 不存在: {photo_id_a}"}
        if not photo_b:
            return {"error": f"照片 B 不存在: {photo_id_b}"}

        # 计算 dHash 汉明距离
        dhash_dist = None
        if photo_a.dhash and photo_b.dhash:
            dhash_dist = hamming_distance(photo_a.dhash, photo_b.dhash)

        # 相似度判定
        if dhash_dist is None:
            verdict = "无法计算"
            verdict_detail = "两张照片中至少有一张缺少 dHash，无法比较相似度"
        elif dhash_dist == 0:
            verdict = "完全相同"
            verdict_detail = "dHash 完全相同，两张照片在感知层面完全一致"
        elif dhash_dist <= 10:
            verdict = "高度相似"
            verdict_detail = f"dHash 汉明距离为 {dhash_dist}（阈值 ≤ 10），确认为同一场景的不同版本"
        elif dhash_dist <= 20:
            verdict = "可能相似"
            verdict_detail = f"dHash 汉明距离为 {dhash_dist}（阈值 11-20），可能为同一场景，建议人工确认"
        else:
            verdict = "不相似"
            verdict_detail = f"dHash 汉明距离为 {dhash_dist}（阈值 > 20），两张照片在感知层面差异较大"

        # 文件大小比
        size_ratio = None
        size_ratio_detail = None
        if photo_a.file_size and photo_b.file_size and photo_b.file_size > 0:
            size_ratio = round(photo_a.file_size / photo_b.file_size, 2)
            if size_ratio > 1:
                size_ratio_detail = f"照片 A 是照片 B 的 {size_ratio} 倍大小"
            elif size_ratio < 1:
                size_ratio_detail = f"照片 B 是照片 A 的 {round(1 / size_ratio, 2)} 倍大小"
            else:
                size_ratio_detail = "两张照片文件大小完全相同"

        # 分辨率比较
        same_resolution = (
            photo_a.resolution_w == photo_b.resolution_w
            and photo_a.resolution_h == photo_b.resolution_h
        )
        if same_resolution:
            resolution_detail = f"两张照片分辨率相同（{photo_a.resolution_w}x{photo_a.resolution_h}）"
        else:
            res_a = f"{photo_a.resolution_w}x{photo_a.resolution_h}" if photo_a.resolution_w else "未知"
            res_b = f"{photo_b.resolution_w}x{photo_b.resolution_h}" if photo_b.resolution_w else "未知"
            # 判断哪张分辨率更高
            mp_a = (photo_a.resolution_w or 0) * (photo_a.resolution_h or 0)
            mp_b = (photo_b.resolution_w or 0) * (photo_b.resolution_h or 0)
            if mp_a > mp_b:
                resolution_detail = f"照片 A ({res_a}) 分辨率更高，照片 B ({res_b}) 可能是压缩或裁剪版本"
            elif mp_b > mp_a:
                resolution_detail = f"照片 B ({res_b}) 分辨率更高，照片 A ({res_a}) 可能是压缩或裁剪版本"
            else:
                resolution_detail = f"照片 A ({res_a}) vs 照片 B ({res_b})，分辨率不同"

        # 时间差
        time_diff_seconds = None
        time_diff_detail = None
        if photo_a.exif_datetime_original and photo_b.exif_datetime_original:
            try:
                ta = datetime.fromisoformat(photo_a.exif_datetime_original)
                tb = datetime.fromisoformat(photo_b.exif_datetime_original)
                diff = abs((ta - tb).total_seconds())
                time_diff_seconds = diff
                if diff == 0:
                    time_diff_detail = "两张照片拍摄时间完全相同（同一时刻）"
                elif diff < 60:
                    time_diff_detail = f"拍摄时间相差 {int(diff)} 秒"
                elif diff < 3600:
                    time_diff_detail = f"拍摄时间相差 {int(diff / 60)} 分钟"
                elif diff < 86400:
                    time_diff_detail = f"拍摄时间相差 {int(diff / 3600)} 小时"
                else:
                    time_diff_detail = f"拍摄时间相差 {int(diff / 86400)} 天"
            except (ValueError, TypeError):
                pass

        # 综合质量对比
        quality_comparison = _build_quality_comparison(photo_a, photo_b)

        return {
            "photo_a": _photo_to_dict(photo_a),
            "photo_b": _photo_to_dict(photo_b),
            "comparison": {
                "dhash_distance": dhash_dist,
                "similarity_verdict": verdict,
                "similarity_detail": verdict_detail,
                "size_ratio": size_ratio,
                "size_ratio_detail": size_ratio_detail,
                "same_resolution": same_resolution,
                "resolution_detail": resolution_detail,
                "time_diff_seconds": time_diff_seconds,
                "time_diff_detail": time_diff_detail,
                "quality_comparison": quality_comparison,
            },
        }


def _build_quality_comparison(photo_a: Photo, photo_b: Photo) -> str:
    """综合评估哪张照片质量更优，生成人类可读的比较结论。"""
    score_a = 0
    score_b = 0

    # EXIF 完整性
    if photo_a.exif_has_all:
        score_a += 2
    if photo_b.exif_has_all:
        score_b += 2

    # 文件大小（更大的通常质量更好，但不是绝对）
    if photo_a.file_size and photo_b.file_size:
        if photo_a.file_size > photo_b.file_size:
            score_a += 1
        elif photo_b.file_size > photo_a.file_size:
            score_b += 1

    # 分辨率
    mp_a = (photo_a.resolution_w or 0) * (photo_a.resolution_h or 0)
    mp_b = (photo_b.resolution_w or 0) * (photo_b.resolution_h or 0)
    if mp_a > mp_b:
        score_a += 1
    elif mp_b > mp_a:
        score_b += 1

    # 非微信压缩图加分
    if photo_a.source_type != "wechat_compressed":
        score_a += 1
    if photo_b.source_type != "wechat_compressed":
        score_b += 1

    if score_a > score_b:
        return f"照片 A ({photo_a.original_name}) 质量更优（评分 {score_a} vs {score_b}）：" \
               f"综合考虑 EXIF 完整性、文件大小、分辨率和来源类型"
    elif score_b > score_a:
        return f"照片 B ({photo_b.original_name}) 质量更优（评分 {score_b} vs {score_a}）：" \
               f"综合考虑 EXIF 完整性、文件大小、分辨率和来源类型"
    else:
        return f"两张照片质量相当（评分 {score_a} vs {score_b}），建议人工判断"


# ═══════════════════════════════════════════════════════════════
# Tool 4: suggest_cleanup_plan
# ═══════════════════════════════════════════════════════════════

def do_suggest_cleanup_plan(project_id: str) -> dict:
    """生成清理计划——逐组列出保留/删除建议及理由。

    前提：必须先调用 scan_similar_groups 完成扫描。
    此工具读取已写入的 cleanup_status 和 cleanup_reason 字段来生成计划。
    """
    with get_mcp_db_session() as db:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return {"error": f"项目不存在，请检查 project_id: {project_id}"}

        # 检查是否已扫描
        scanned_photos = (
            db.query(Photo)
            .filter(
                Photo.project_id == project_id,
                Photo.cleanup_status.isnot(None),
            )
            .count()
        )

        if scanned_photos == 0:
            return {
                "error": "项目尚未扫描，请先调用 scan_similar_groups 工具扫描该项目",
                "scan_required": True,
                "project_id": project_id,
            }

        # 按 cleanup_group_id 分组读取
        all_photos = (
            db.query(Photo)
            .filter(Photo.project_id == project_id)
            .order_by(Photo.cleanup_group_id, Photo.cleanup_group_rank)
            .all()
        )

        # 按 group_id 分组
        groups: dict[str, list[Photo]] = {}
        ungrouped: list[Photo] = []
        for p in all_photos:
            if p.cleanup_group_id:
                groups.setdefault(p.cleanup_group_id, []).append(p)
            else:
                ungrouped.append(p)

        plan = []
        total_keep = 0
        total_delete = 0
        total_space = 0
        high_conf = 0
        med_conf = 0
        low_conf = 0

        for group_id, photos in groups.items():
            keep = [p for p in photos if p.cleanup_status == "keep"]
            delete = [p for p in photos if p.cleanup_status == "delete"]
            space = sum(p.file_size or 0 for p in delete)

            # 置信度：用组内 EXIF 完整率估算
            exif_ratio = sum(1 for p in photos if p.exif_has_all) / len(photos) if photos else 0
            if exif_ratio >= 0.8:
                confidence = "HIGH"
                high_conf += 1
            elif exif_ratio >= 0.5:
                confidence = "MEDIUM"
                med_conf += 1
            else:
                confidence = "LOW"
                low_conf += 1

            plan.append({
                "group_id": group_id,
                "photo_count": len(photos),
                "confidence": confidence,
                "action": f"保留 {len(keep)} 张，删除 {len(delete)} 张",
                "space_to_free_mb": _size_mb(space),
                "keep": [
                    {
                        "photo_id": p.id,
                        "original_name": p.original_name,
                        "file_size_mb": _size_mb(p.file_size),
                        "reason": p.cleanup_reason or "无",
                    }
                    for p in keep
                ],
                "delete": [
                    {
                        "photo_id": p.id,
                        "original_name": p.original_name,
                        "file_size_mb": _size_mb(p.file_size),
                        "reason": p.cleanup_reason or "无",
                    }
                    for p in delete
                ],
            })

            total_keep += len(keep)
            total_delete += len(delete)
            total_space += space

        # 生成推荐文案
        recommendation_parts = []
        if high_conf > 0:
            recommendation_parts.append(
                f"建议优先处理 {high_conf} 个高置信度组（可安全删除 {sum(1 for g in plan if g['confidence'] == 'HIGH' for _ in g['delete'])} 张）"
            )
        if med_conf > 0:
            recommendation_parts.append(
                f"{med_conf} 个中置信度组建议人工复核后再执行"
            )
        if low_conf > 0:
            recommendation_parts.append(
                f"{low_conf} 个低置信度组建议跳过或手动逐张对比"
            )
        recommendation = "；".join(recommendation_parts) if recommendation_parts else "无需清理"

        return {
            "project_id": project_id,
            "scan_required": False,
            "summary": {
                "total_groups": len(plan),
                "total_photos_in_groups": total_keep + total_delete + len(ungrouped),
                "suggested_keep": total_keep,
                "suggested_delete": total_delete,
                "total_space_to_free": total_space,
                "total_space_to_free_mb": _size_mb(total_space),
                "high_confidence_groups": high_conf,
                "medium_confidence_groups": med_conf,
                "low_confidence_groups": low_conf,
                "ungrouped_photos": len(ungrouped),
            },
            "plan": plan,
            "recommendation": recommendation,
        }


# ═══════════════════════════════════════════════════════════════
# Tool 5: execute_cleanup
# ═══════════════════════════════════════════════════════════════

def do_execute_cleanup(project_id: str, photo_ids_to_delete: list[str]) -> dict:
    """执行清理计划：批量删除指定照片。

    安全机制（三道防线）：
    1. 参数校验：photo_ids_to_delete 不能为空
    2. 归属验证：每张照片必须属于指定的 project
    3. 状态锁：只删除 cleanup_status='delete' 的照片

    此操作不可撤销！
    对应 REST API: POST /api/projects/{id}/cleanup/execute
    """
    # 防线 1: 参数校验
    try:
        validate_cleanup_params(project_id, photo_ids_to_delete)
    except SecurityError as e:
        return {"error": str(e)}

    with get_mcp_db_session() as db:
        # 记录清理前照片数
        photo_count_before = (
            db.query(Photo).filter(Photo.project_id == project_id).count()
        )

        deleted = []
        failed = []

        for photo_id in photo_ids_to_delete:
            # 防线 2: 归属验证
            try:
                photo = validate_photo_belongs_to_project(db, photo_id, project_id)
            except SecurityError as e:
                failed.append({"photo_id": photo_id, "reason": str(e)})
                continue

            # 防线 3: 状态锁
            try:
                ensure_photo_marked_delete(photo)
            except SecurityError as e:
                failed.append({"photo_id": photo_id, "reason": str(e)})
                continue

            # 删除文件
            try:
                if os.path.exists(photo.stored_path):
                    os.remove(photo.stored_path)
            except OSError as e:
                failed.append({
                    "photo_id": photo_id,
                    "reason": f"文件删除失败: {e}",
                })
                continue

            deleted.append({
                "photo_id": photo_id,
                "original_name": photo.original_name,
                "file_size": photo.file_size or 0,
                "file_size_mb": _size_mb(photo.file_size),
            })
            db.delete(photo)

        # 创建清理历史记录
        space_freed = sum(d["file_size"] for d in deleted)
        history = CleanupHistory(
            project_id=project_id,
            deleted_count=len(deleted),
            space_freed=space_freed,
            photo_count_before=photo_count_before,
            photo_count_after=photo_count_before - len(deleted),
            details=json.dumps(deleted, ensure_ascii=False),
        )
        db.add(history)
        db.commit()

        return {
            "success": len(failed) == 0,
            "summary": {
                "deleted_count": len(deleted),
                "failed_count": len(failed),
                "space_freed": space_freed,
                "space_freed_mb": _size_mb(space_freed),
                "photo_count_before": photo_count_before,
                "photo_count_after": photo_count_before - len(deleted),
            },
            "deleted": deleted,
            "failed": failed,
            "cleanup_history_id": history.id,
        }
