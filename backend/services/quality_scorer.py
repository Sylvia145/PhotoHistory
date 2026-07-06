"""AI 质量评分服务

轻量级图像质量评估（无深度学习依赖，仅 Pillow + NumPy）：
- 清晰度: Laplacian 方差法（行业标准模糊检测）
- 美学: 分辨率 + 对比度 + 宽高比 + 曝光
- 压缩质量: bytes-per-pixel 归一化
- 综合: 加权组合

所有评分归一化到 0-10 标度。
"""

import logging
from dataclasses import dataclass
from math import log1p

import numpy as np
from PIL import Image, ImageFilter

logger = logging.getLogger(__name__)

# 性能上限：超过此尺寸先缩略再分析
MAX_ANALYSIS_PX = 4096


@dataclass
class PhotoScores:
    """照片质量评分结果。"""
    sharpness: float      # 清晰度 (0-10)
    aesthetic: float      # 美学 (0-10)
    overall: float        # 综合 (0-10)


# ═══════════════════════════════════════════════════════════════
# 公开 API
# ═══════════════════════════════════════════════════════════════

def score_photo(stored_path: str, file_size: int) -> PhotoScores | None:
    """对一张照片执行全维度质量评估。

    Args:
        stored_path: 照片文件的磁盘路径
        file_size: 文件大小（字节），用于压缩质量计算

    Returns:
        PhotoScores 对象；如果图像无法打开或处理失败则返回 None
    """
    try:
        img = Image.open(stored_path)
        w, h = img.size

        # 大图先缩略以控制内存（不影响清晰度评估）
        if w > MAX_ANALYSIS_PX or h > MAX_ANALYSIS_PX:
            img.thumbnail((MAX_ANALYSIS_PX, MAX_ANALYSIS_PX), Image.LANCZOS)
            w, h = img.size

        sharpness = _compute_sharpness(img)
        aesthetic = _compute_aesthetic(img, w, h)
        compression = _compute_compression(file_size, w, h)
        overall = round(0.4 * sharpness + 0.3 * aesthetic + 0.3 * compression, 1)

        img.close()
        return PhotoScores(sharpness=sharpness, aesthetic=aesthetic, overall=overall)

    except Exception:
        logger.warning("AI 评分失败: %s", stored_path, exc_info=True)
        return None


# ═══════════════════════════════════════════════════════════════
# 1. 清晰度 — Laplacian 方差法
# ═══════════════════════════════════════════════════════════════

def _compute_sharpness(img: Image.Image) -> float:
    """Laplacian 方差法清晰度评分（0-10）。

    原理：清晰图像边缘锐利 → Laplacian 响应强 → 方差大。
    模糊图像边缘平滑 → Laplacian 响应弱 → 方差小。
    """
    gray = img.convert("L")

    # 3×3 Laplacian kernel
    kernel = (0, 1, 0, 1, -4, 1, 0, 1, 0)
    laplacian = gray.filter(ImageFilter.Kernel((3, 3), kernel))

    arr = np.array(laplacian, dtype=np.float64)
    variance = float(arr.var())

    # log 归一化: var=0→0, var=100→5.7, var=1000→8.6, var=5000→10
    score = min(10.0, log1p(variance) * 2.5)
    return round(score, 1)


# ═══════════════════════════════════════════════════════════════
# 2. 美学 — 多维启发式
# ═══════════════════════════════════════════════════════════════

def _compute_aesthetic(img: Image.Image, w: int, h: int) -> float:
    """综合美学评分（0-10）。

    子维度权重：分辨率 25% + 对比度 30% + 宽高比 20% + 曝光 25%
    """
    resolution = _score_resolution(w, h)
    contrast = _score_contrast(img)
    aspect = _score_aspect_ratio(w, h)
    exposure = _score_exposure(img)

    score = 0.25 * resolution + 0.30 * contrast + 0.20 * aspect + 0.25 * exposure
    return round(score, 1)


def _score_resolution(w: int, h: int) -> float:
    """分辨率评分：12MP+ 满分。"""
    mp = (w * h) / 1_000_000
    return round(min(10.0, mp / 1.2), 1)


def _score_contrast(img: Image.Image) -> float:
    """对比度评分：灰度标准差归一化。"""
    gray = img.convert("L")
    arr = np.array(gray, dtype=np.float64)
    std = float(arr.std())
    return round(min(10.0, std / 25.5), 1)


def _score_aspect_ratio(w: int, h: int) -> float:
    """宽高比评分：非极端比例得高分。"""
    if w <= 0 or h <= 0:
        return 5.0
    ratio = w / h
    if ratio < 1:
        ratio = 1 / ratio

    if ratio <= 1.34:        # 4:3 或 1:1
        return 10.0
    elif ratio <= 1.78:      # 16:9
        return 9.0
    elif ratio <= 2.0:       # 2:1 全景
        return 7.0
    else:
        return 5.0            # 极端裁剪


def _score_exposure(img: Image.Image) -> float:
    """曝光评分：亮度在合理范围内得高分。"""
    gray = img.convert("L")
    arr = np.array(gray, dtype=np.float64)
    mean_brightness = float(arr.mean())

    if 60 <= mean_brightness <= 195:
        return 10.0           # 正常曝光
    elif 45 <= mean_brightness < 60 or 195 < mean_brightness <= 210:
        return 7.0            # 轻微欠曝/过曝
    elif 30 <= mean_brightness < 45 or 210 < mean_brightness <= 225:
        return 4.0            # 明显欠曝/过曝
    else:
        return 2.0            # 极端


# ═══════════════════════════════════════════════════════════════
# 3. 压缩质量 — bytes-per-pixel
# ═══════════════════════════════════════════════════════════════

def _compute_compression(file_size: int, w: int, h: int) -> float:
    """基于 bytes-per-pixel 的压缩质量评分（0-10）。

    复用 quality_check.py 已有的 BPP 概念，归一化到评分标度。
    """
    pixels = w * h
    if pixels <= 0:
        return 5.0
    bpp = file_size / pixels

    if bpp >= 0.5:
        return 10.0           # 高质量 JPEG
    elif bpp >= 0.3:
        return 8.5
    elif bpp >= 0.15:
        return 7.0            # 中等压缩
    elif bpp >= 0.08:
        return 4.5
    elif bpp >= 0.05:
        return 3.0            # 重度压缩
    else:
        return 1.0            # 微信压缩级别
