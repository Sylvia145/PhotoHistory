"""照片管理路由"""

import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

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
        .filter(Photo.project_id == project_id)
        .order_by(Photo.uploaded_at.desc())
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
def get_photo_file(photo_id: str, thumb: bool = False, size: int = 400, db: Session = Depends(get_db)):
    """获取照片原始文件或缩略图"""
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="照片不存在")

    if not os.path.exists(photo.stored_path):
        raise HTTPException(status_code=404, detail="文件不存在")

    # TODO: 缩略图生成
    return FileResponse(photo.stored_path, media_type=photo.mime_type)
