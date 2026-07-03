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
    """从图片中提取 EXIF 信息，同时检查 IFD0、Exif、GPS 三个段"""
    datetime_original = None
    make = None
    model = None

    try:
        exif_dict = piexif.load(file_path)

        # Make / Model 可能在 IFD0（0th）或 Exif 段
        ifd0 = exif_dict.get("0th", {})
        exif_data = exif_dict.get("Exif", {})
        gps_data = exif_dict.get("GPS", {})

        # --- 设备信息：优先从 IFD0 读取 ---
        make_bytes = ifd0.get(271) or exif_data.get(271)
        if make_bytes:
            make = make_bytes.decode("utf-8", errors="ignore").strip().rstrip("\x00")

        model_bytes = ifd0.get(272) or exif_data.get(272)
        if model_bytes:
            model = model_bytes.decode("utf-8", errors="ignore").strip().rstrip("\x00")

        # --- 拍摄时间：多级回退 ---
        # 优先级: DateTimeOriginal > DateTimeDigitized > GPSDateStamp
        dt_bytes = exif_data.get(36867)  # DateTimeOriginal
        if not dt_bytes:
            dt_bytes = exif_data.get(36868)  # DateTimeDigitized
        if not dt_bytes:
            dt_bytes = gps_data.get(29)  # GPSDateStamp

        if dt_bytes:
            dt_str = dt_bytes.decode("utf-8", errors="ignore").strip().rstrip("\x00")
            # 格式可能是 "2026:06:27" 或 "2026:06:29 22:30:01"
            try:
                # 将 EXIF 日期格式转为 ISO
                if " " in dt_str:
                    dt_clean = dt_str.replace(":", "-", 2).replace(" ", "T", 1)
                else:
                    dt_clean = dt_str.replace(":", "-")
                datetime_original = dt_clean
            except (ValueError, IndexError):
                pass

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
