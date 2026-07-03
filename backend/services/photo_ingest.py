"""照片录入流水线：接收文件 → 质量检测 → EXIF提取 → 哈希计算 → 写入数据库"""

import os
import uuid
import shutil
from dataclasses import dataclass

from sqlalchemy.orm import Session

from config import UPLOAD_DIR
from models.photo import Photo
from services.quality_check import check_quality
from services.exif_service import extract_exif
from services.hash_service import compute_dhash, compute_phash


@dataclass
class IngestResult:
    success: bool
    photo: Photo | None
    error: str | None


def ingest_photo(
    db: Session,
    project_id: str,
    file_content: bytes,
    original_filename: str,
    mime_type: str,
) -> IngestResult:
    """
    完整照片录入流水线：
    1. 保存文件到 uploads/{project_id}/{photo_id}.jpg
    2. 质量检测（拒绝压缩图）
    3. EXIF 提取
    4. 感知哈希计算
    5. 写入数据库
    """

    photo_id = str(uuid.uuid4())
    project_dir = os.path.join(UPLOAD_DIR, project_id)
    os.makedirs(project_dir, exist_ok=True)

    # 统一存为 .jpg（后续可扩展保持原扩展名）
    ext = os.path.splitext(original_filename)[1].lower() or ".jpg"
    stored_name = f"{photo_id}{ext}"
    stored_path = os.path.join(project_dir, stored_name)

    # 1. 保存文件
    with open(stored_path, "wb") as f:
        f.write(file_content)

    file_size = len(file_content)

    # 2. 质量检测
    quality = check_quality(stored_path, original_filename)
    if not quality.passed:
        # 删除已保存的文件
        os.remove(stored_path)
        return IngestResult(success=False, photo=None, error=quality.reason)

    # 3. EXIF 提取
    exif = extract_exif(stored_path)

    # 4. 二次检查：微信来源 + EXIF 丢失 → 拒绝
    if quality.source_type == "wechat_compressed" and not exif.has_all:
        os.remove(stored_path)
        return IngestResult(
            success=False,
            photo=None,
            error="检测到该图片经过微信压缩，EXIF信息丢失。请通过微信「原图」重新发送。",
        )

    # 5. 感知哈希
    dhash = compute_dhash(stored_path)
    phash = compute_phash(stored_path)

    # 6. 写入数据库
    photo = Photo(
        id=photo_id,
        project_id=project_id,
        original_name=original_filename,
        stored_path=stored_path,
        file_size=file_size,
        mime_type=mime_type,
        resolution_w=quality.resolution_w,
        resolution_h=quality.resolution_h,
        exif_datetime_original=exif.datetime_original,
        exif_make=exif.make,
        exif_model=exif.model,
        exif_has_all=exif.has_all,
        quality_status=quality.status,
        quality_reason=quality.reason,
        phash=phash,
        dhash=dhash,
        source_type=quality.source_type,
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)

    return IngestResult(success=True, photo=photo, error=None)
