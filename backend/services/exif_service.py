"""EXIF 信息提取"""

from dataclasses import dataclass

import piexif
from PIL import Image


@dataclass
class ExifResult:
    datetime_original: str | None     # ISO 格式 "2026-07-03T14:30:52"
    make: str | None
    model: str | None
    has_all: bool                     # 关键字段是否全部存在


def extract_exif(file_path: str) -> ExifResult:
    """从图片中提取 EXIF 信息"""
    datetime_original = None
    make = None
    model = None

    try:
        exif_dict = piexif.load(file_path)
        exif_data = exif_dict.get("Exif", {})

        # DateTimeOriginal (标签号 36867)
        dt_bytes = exif_data.get(36867)
        if dt_bytes:
            dt_str = dt_bytes.decode("utf-8", errors="ignore").strip()
            # "2026:07:03 14:30:52" → "2026-07-03T14:30:52"
            try:
                dt_clean = dt_str.replace(":", "-", 2).replace(" ", "T", 1)
                datetime_original = dt_clean
            except (ValueError, IndexError):
                pass

        # 设备厂商 (标签号 271)
        make_bytes = exif_data.get(271)
        if make_bytes:
            make = make_bytes.decode("utf-8", errors="ignore").strip().rstrip("\x00")

        # 设备型号 (标签号 272)
        model_bytes = exif_data.get(272)
        if model_bytes:
            model = model_bytes.decode("utf-8", errors="ignore").strip().rstrip("\x00")

    except Exception:
        # 不是 JPEG 或 EXIF 损坏，返回空
        pass

    has_all = datetime_original is not None
    return ExifResult(
        datetime_original=datetime_original,
        make=make,
        model=model,
        has_all=has_all,
    )
