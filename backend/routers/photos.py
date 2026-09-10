"""照片管理路由"""

import io
import os
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from PIL import Image

from config import MAX_FILE_SIZE, ALLOWED_MIME_TYPES
from db import get_db
from models.photo import Photo
from models.project import Project
from schemas.photo import PhotoResponse
from services.photo_ingest import ingest_photo

router = APIRouter(prefix="/api/projects", tags=["photos"])


@router.get("/{project_id}/photos", response_model=list[PhotoResponse])
def list_photos(project_id: str, db: Session = Depends(get_db)):
    """列出项目内所有照片"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    photos = (
        db.query(Photo)
        .filter(Photo.project_id == project_id, Photo.deleted_at.is_(None))
        .order_by(Photo.original_name)
        .all()
    )
    return [PhotoResponse.model_validate(p) for p in photos]


@router.post("/{project_id}/photos", response_model=dict)
async def upload_photos(
    project_id: str,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    """上传照片（支持批量）"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    results = []
    errors = []

    for file in files:
        # 检查 MIME 类型
        if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
            errors.append({"filename": file.filename, "error": f"不支持的格式: {file.content_type}"})
            continue

        # 检查文件大小
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            errors.append({"filename": file.filename, "error": f"文件超过 50MB 限制"})
            continue

        # 流水线处理
        result = ingest_photo(
            db=db,
            project_id=project_id,
            file_content=content,
            original_filename=file.filename or "unknown.jpg",
            mime_type=file.content_type or "image/jpeg",
        )

        if result.success and result.photo:
            results.append(PhotoResponse.model_validate(result.photo))
        else:
            errors.append({"filename": file.filename, "error": result.error or "未知错误"})

    return {
        "uploaded": len(results),
        "failed": len(errors),
        "photos": [r.model_dump() for r in results],
        "errors": errors,
    }


@router.get("/{project_id}/photos/{photo_id}", response_model=PhotoResponse)
def get_photo(project_id: str, photo_id: str, db: Session = Depends(get_db)):
    """获取单张照片信息"""
    photo = (
        db.query(Photo)
        .filter(Photo.project_id == project_id, Photo.id == photo_id)
        .first()
    )
    if not photo:
        raise HTTPException(status_code=404, detail="照片不存在")
    return PhotoResponse.model_validate(photo)


@router.delete("/{project_id}/photos/{photo_id}", status_code=204)
def delete_photo(project_id: str, photo_id: str, db: Session = Depends(get_db)):
    """删除照片"""
    photo = (
        db.query(Photo)
        .filter(Photo.project_id == project_id, Photo.id == photo_id)
        .first()
    )
    if not photo:
        raise HTTPException(status_code=404, detail="照片不存在")

    # 删除文件
    if os.path.exists(photo.stored_path):
        os.remove(photo.stored_path)

    db.delete(photo)
    db.commit()


@router.get("/photos/{photo_id}/file")
def get_photo_file(
    photo_id: str,
    thumb: bool = Query(False),
    size: int = Query(400),
    download: bool = Query(False),
    db: Session = Depends(get_db),
):
    """获取照片原始文件或缩略图"""
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="照片不存在")

    if not os.path.exists(photo.stored_path):
        raise HTTPException(status_code=404, detail="文件不存在")

    # 缩略图模式：Pillow 缩放后返回内存中的 JPEG
    if thumb:
        try:
            img = Image.open(photo.stored_path)
            img.thumbnail((size, size), Image.LANCZOS)
            # 处理 RGBA → RGB（JPEG 不支持透明通道）
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=85)
            buf.seek(0)
            return StreamingResponse(
                buf,
                media_type="image/jpeg",
                headers={"Cache-Control": "public, max-age=3600"},
            )
        except Exception:
            # 降级：缩略图生成失败则返回原图
            pass

    # 原图模式
    headers = {}
    if download:
        encoded_filename = quote(photo.original_name)
        headers["Content-Disposition"] = (
            f'attachment; filename="{encoded_filename}"; '
            f"filename*=UTF-8''{encoded_filename}"
        )

    return FileResponse(
        photo.stored_path,
        media_type=photo.mime_type,
        headers=headers if headers else None,
    )


# ── V2.1 对比端点 ─────────────────────────────────────────────────

# 独立路由（不带 /api/projects 前缀），因为对比是跨照片的
compare_router = APIRouter(prefix="/api/photos", tags=["compare"])


@compare_router.get("/{photo_id}/compare/{other_id}")
def compare_photos(photo_id: str, other_id: str, db: Session = Depends(get_db)):
    """获取两张照片的对比元数据"""
    from services.hash_service import hamming_distance

    photo_a = db.query(Photo).filter(Photo.id == photo_id).first()
    photo_b = db.query(Photo).filter(Photo.id == other_id).first()

    if not photo_a:
        raise HTTPException(status_code=404, detail="照片 A 不存在")
    if not photo_b:
        raise HTTPException(status_code=404, detail="照片 B 不存在")

    # 计算 dHash 距离
    dhash_dist = None
    if photo_a.dhash and photo_b.dhash:
        dhash_dist = hamming_distance(photo_a.dhash, photo_b.dhash)

    # 文件大小比
    size_ratio = None
    if photo_a.file_size and photo_b.file_size and photo_b.file_size > 0:
        size_ratio = round(photo_a.file_size / photo_b.file_size, 2)

    # 时间差（秒）
    time_diff = None
    if photo_a.exif_datetime_original and photo_b.exif_datetime_original:
        try:
            from datetime import datetime
            ta = datetime.fromisoformat(photo_a.exif_datetime_original)
            tb = datetime.fromisoformat(photo_b.exif_datetime_original)
            time_diff = abs((ta - tb).total_seconds())
        except (ValueError, TypeError):
            pass

    return {
        "photo_a": _photo_to_compare_dict(photo_a),
        "photo_b": _photo_to_compare_dict(photo_b),
        "dhash_distance": dhash_dist,
        "size_ratio": size_ratio,
        "same_resolution": (
            photo_a.resolution_w == photo_b.resolution_w
            and photo_a.resolution_h == photo_b.resolution_h
        ),
        "time_diff_seconds": time_diff,
    }


def _photo_to_compare_dict(photo: Photo) -> dict:
    return {
        "id": photo.id,
        "original_name": photo.original_name,
        "file_size": photo.file_size,
        "mime_type": photo.mime_type,
        "resolution_w": photo.resolution_w,
        "resolution_h": photo.resolution_h,
        "exif_datetime_original": photo.exif_datetime_original,
        "exif_make": photo.exif_make,
        "exif_model": photo.exif_model,
        "exif_has_all": photo.exif_has_all,
        "ai_score_sharpness": photo.ai_score_sharpness,
        "ai_score_aesthetic": photo.ai_score_aesthetic,
        "ai_score_overall": photo.ai_score_overall,
        "dhash": photo.dhash,
        "source_type": photo.source_type,
    }


# ── V3.1: 回收站/恢复端点 ────────────────────────────────────────

from datetime import datetime, timedelta

recycle_router = APIRouter(prefix="/api/photos", tags=["recycle"])


@recycle_router.get("/recycle-bin")
def list_deleted_photos(project_id: str | None = None, db: Session = Depends(get_db)):
    """列出回收站中的软删除照片"""
    query = db.query(Photo).filter(Photo.deleted_at.isnot(None))
    if project_id:
        query = query.filter(Photo.project_id == project_id)
    photos = query.order_by(Photo.deleted_at.desc()).all()

    now = datetime.now()
    return {
        "count": len(photos),
        "photos": [
            {
                "id": p.id,
                "original_name": p.original_name,
                "file_size_mb": round((p.file_size or 0) / 1048576, 2),
                "thumbnail_url": f"/api/projects/photos/{p.id}/file?thumb=true&size=200",
                "deleted_at": p.deleted_at.isoformat() if p.deleted_at else None,
                "deleted_by": p.deleted_by,
                "minutes_remaining": max(0, 30 - int((now - p.deleted_at).total_seconds() / 60)) if p.deleted_at else 0,
            }
            for p in photos
        ],
    }


@recycle_router.post("/restore")
def restore_photos_endpoint(photo_ids: list[str], db: Session = Depends(get_db)):
    """从回收站恢复照片"""
    restored = []
    failed = []

    for pid in photo_ids:
        photo = db.query(Photo).filter(Photo.id == pid).first()
        if not photo:
            failed.append({"photo_id": pid, "reason": "照片不存在"})
            continue
        if photo.deleted_at is None:
            failed.append({"photo_id": pid, "reason": "照片未被删除"})
            continue
        photo.deleted_at = None
        photo.deleted_by = None
        restored.append(pid)

    db.commit()
    return {
        "success": len(failed) == 0,
        "restored_count": len(restored),
        "failed": failed,
    }


@recycle_router.post("/purge-expired")
def purge_expired_photos_endpoint(db: Session = Depends(get_db)):
    """物理删除超过 30 分钟的软删除照片"""
    threshold = datetime.now() - timedelta(minutes=30)
    expired = (
        db.query(Photo)
        .filter(Photo.deleted_at <= threshold)
        .all()
    )

    purged = 0
    for p in expired:
        if os.path.exists(p.stored_path):
            try:
                os.remove(p.stored_path)
            except OSError:
                pass
        db.delete(p)
        purged += 1

    db.commit()
    return {"purged_count": purged, "message": f"已物理删除 {purged} 张过期照片"}
