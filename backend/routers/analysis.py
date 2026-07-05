"""分析路由：版本分组"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from models.project import Project
from services.grouping import analyze_project

router = APIRouter(prefix="/api/projects", tags=["analysis"])


@router.post("/{project_id}/analyze")
def analyze(project_id: str, db: Session = Depends(get_db)):
    """触发版本分析，返回版本链"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    chains = analyze_project(project_id, db)

    return {
        "project_id": project_id,
        "chain_count": len(chains),
        "total_photos": sum(len(c.photos) for c in chains),
        "chains": [
            {
                "root_photo_id": c.root_photo.id if c.root_photo else None,
                "photo_count": len(c.photos),
                "overall_confidence": c.overall_confidence,
                "confidence_label": (
                    "HIGH" if c.overall_confidence >= 0.9
                    else "MEDIUM" if c.overall_confidence >= 0.6
                    else "LOW"
                ),
                "photo_ids": [p.id for p in c.photos],
            }
            for c in chains
        ],
    }


@router.get("/{project_id}/version-chain")
def get_version_chain(project_id: str, db: Session = Depends(get_db)):
    """获取项目版本链（含照片详情）"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    chains = analyze_project(project_id, db)

    return {
        "project_id": project_id,
        "chain_count": len(chains),
        "chains": [
            {
                "root_photo": _photo_to_dict(c.root_photo),
                "versions": [_photo_to_dict(p) for p in c.photos],
                "overall_confidence": c.overall_confidence,
                "confidence_label": (
                    "HIGH" if c.overall_confidence >= 0.9
                    else "MEDIUM" if c.overall_confidence >= 0.6
                    else "LOW"
                ),
                "group_id": c.group_id,      # V2.0
            }
            for c in chains
        ],
    }


def _photo_to_dict(photo):
    """Photo ORM → dict（避免循环引用）"""
    if not photo:
        return None
    return {
        "id": photo.id,
        "original_name": photo.original_name,
        "file_size": photo.file_size,
        "resolution_w": photo.resolution_w,
        "resolution_h": photo.resolution_h,
        "exif_datetime_original": photo.exif_datetime_original,
        "exif_has_all": photo.exif_has_all,
        "quality_status": photo.quality_status,
        "source_type": photo.source_type,
        "uploaded_at": photo.uploaded_at.isoformat() if photo.uploaded_at else None,
        # V2.0 cleanup 字段
        "cleanup_status": photo.cleanup_status,
        "cleanup_group_id": photo.cleanup_group_id,
        "cleanup_group_rank": photo.cleanup_group_rank,
        "cleanup_reason": photo.cleanup_reason,
    }
