"""清理路由：扫描相似组、执行删除、重置状态、历史记录"""

import json
import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from db import get_db
from models.project import Project
from models.photo import Photo
from models.cleanup_history import CleanupHistory
from schemas.cleanup import (
    BatchDeleteRequest,
    CleanupExecuteResponse,
    CleanupResetResponse,
    CleanupHistoryResponse,
)
from services.grouping import analyze_project
from services.cleanup_engine import generate_cleanup_suggestions

router = APIRouter(prefix="/api/projects", tags=["cleanup"])


@router.post("/{project_id}/cleanup/scan")
def scan_similar_groups(project_id: str, db: Session = Depends(get_db)):
    """
    扫描项目内相似照片组，生成清理建议。

    流程: 分组 → 清理引擎评分 → 写入 cleanup 字段 → 返回分组结果
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

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
            "confidence": chain.overall_confidence,
            "confidence_label": (
                "HIGH" if chain.overall_confidence >= 0.9
                else "MEDIUM" if chain.overall_confidence >= 0.6
                else "LOW"
            ),
            "photos": [_photo_to_cleanup_dict(p) for p in chain.photos],
        })

    total_keep = sum(g["keep_count"] for g in groups)
    total_delete = sum(g["delete_count"] for g in groups)

    return {
        "project_id": project_id,
        "group_count": len(groups),
        "total_photos": sum(g["photo_count"] for g in groups),
        "total_keep": total_keep,
        "total_delete": total_delete,
        "total_space_saved": sum(g["estimated_space_saved"] for g in groups),
        "groups": groups,
    }


@router.post("/{project_id}/cleanup/execute")
def execute_cleanup(
    project_id: str,
    req: BatchDeleteRequest,
    db: Session = Depends(get_db),
):
    """
    执行清理：批量删除标记为 delete 的照片。

    安全机制：
    1. 只删除 cleanup_status='delete' 的照片（代码级锁）
    2. 删除前验证照片属于该项目
    3. 返回删除结果报告
    """
    if not req.photo_ids:
        raise HTTPException(status_code=400, detail="未指定要删除的照片")

    # 记录清理前照片数
    photo_count_before = db.query(Photo).filter(
        Photo.project_id == project_id
    ).count()

    deleted = []
    failed = []

    for photo_id in req.photo_ids:
        photo = db.query(Photo).filter(
            Photo.id == photo_id,
            Photo.project_id == project_id,
            Photo.cleanup_status == "delete",       # 安全锁：只删除标记过的
        ).first()

        if not photo:
            failed.append({"photo_id": photo_id, "reason": "照片不存在或未标记为可删除"})
            continue

        # 删除文件
        try:
            if os.path.exists(photo.stored_path):
                os.remove(photo.stored_path)
        except OSError as e:
            failed.append({"photo_id": photo_id, "reason": f"文件删除失败: {e}"})
            continue

        deleted.append({
            "photo_id": photo_id,
            "original_name": photo.original_name,
            "file_size": photo.file_size or 0,
        })
        db.delete(photo)

    # 创建清理历史记录
    history = CleanupHistory(
        project_id=project_id,
        deleted_count=len(deleted),
        space_freed=sum(d["file_size"] for d in deleted),
        photo_count_before=photo_count_before,
        photo_count_after=photo_count_before - len(deleted),
        details=json.dumps(deleted, ensure_ascii=False),
    )
    db.add(history)
    db.commit()

    return CleanupExecuteResponse(
        deleted_count=len(deleted),
        failed_count=len(failed),
        space_freed=sum(d["file_size"] for d in deleted),
        deleted=deleted,
        failed=failed,
    )


@router.post("/{project_id}/cleanup/reset")
def reset_cleanup(project_id: str, db: Session = Depends(get_db)):
    """重置清理状态（撤销扫描结果，不删除任何文件）"""
    photos = db.query(Photo).filter(Photo.project_id == project_id).all()
    count = 0
    for p in photos:
        if p.cleanup_status is not None:
            p.cleanup_status = None
            p.cleanup_group_id = None
            p.cleanup_group_rank = None
            p.cleanup_reason = None
            count += 1
    db.commit()
    return CleanupResetResponse(status="ok", reset_count=count)


# ── V2.1 清理历史 ─────────────────────────────────────────────────

@router.get("/{project_id}/cleanup/history")
def get_cleanup_history(project_id: str, db: Session = Depends(get_db)):
    """获取项目的清理历史记录"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    records = (
        db.query(CleanupHistory)
        .filter(CleanupHistory.project_id == project_id)
        .order_by(CleanupHistory.executed_at.desc())
        .all()
    )

    result = []
    for r in records:
        details = None
        if r.details:
            try:
                details = json.loads(r.details)
            except json.JSONDecodeError:
                details = []
        result.append({
            "id": r.id,
            "project_id": r.project_id,
            "executed_at": r.executed_at.isoformat() if r.executed_at else None,
            "deleted_count": r.deleted_count,
            "space_freed": r.space_freed,
            "photo_count_before": r.photo_count_before,
            "photo_count_after": r.photo_count_after,
            "details": details,
        })
    return result


@router.get("/{project_id}/cleanup/history/{history_id}/export")
def export_cleanup_report(project_id: str, history_id: str, db: Session = Depends(get_db)):
    """导出清理报告（JSON 文件下载）"""
    record = (
        db.query(CleanupHistory)
        .filter(CleanupHistory.id == history_id, CleanupHistory.project_id == project_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="历史记录不存在")

    details = []
    if record.details:
        try:
            details = json.loads(record.details)
        except json.JSONDecodeError:
            details = []

    import urllib.parse

    report = {
        "report_type": "PhotoHistory 清理报告",
        "project_id": project_id,
        "executed_at": record.executed_at.isoformat() if record.executed_at else None,
        "summary": {
            "deleted_count": record.deleted_count,
            "space_freed_bytes": record.space_freed,
            "space_freed_mb": round(record.space_freed / 1024 / 1024, 2),
            "photo_count_before": record.photo_count_before,
            "photo_count_after": record.photo_count_after,
        },
        "deleted_photos": details,
    }

    filename = f"cleanup_report_{record.executed_at.strftime('%Y%m%d_%H%M%S') if record.executed_at else history_id}.json"
    encoded_filename = urllib.parse.quote(filename)

    return JSONResponse(
        content=report,
        headers={
            "Content-Disposition": f'attachment; filename="{encoded_filename}"; filename*=UTF-8\'\'{encoded_filename}',
        },
    )


def _photo_to_cleanup_dict(photo: Photo) -> dict:
    """Photo ORM → cleanup 响应 dict"""
    return {
        "id": photo.id,
        "original_name": photo.original_name,
        "file_size": photo.file_size,
        "resolution_w": photo.resolution_w,
        "resolution_h": photo.resolution_h,
        "exif_datetime_original": photo.exif_datetime_original,
        "exif_make": photo.exif_make,
        "exif_model": photo.exif_model,
        "exif_has_all": photo.exif_has_all,
        "quality_status": photo.quality_status,
        "source_type": photo.source_type,
        "dhash": photo.dhash,
        "cleanup_status": photo.cleanup_status,
        "cleanup_group_id": photo.cleanup_group_id,
        "cleanup_group_rank": photo.cleanup_group_rank,
        "cleanup_reason": photo.cleanup_reason,
        "uploaded_at": photo.uploaded_at.isoformat() if photo.uploaded_at else None,
    }
