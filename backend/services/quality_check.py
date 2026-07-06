"""图片质量检测：识别微信压缩图，评估图片压缩率"""

import os
import re
from dataclasses import dataclass

from PIL import Image


@dataclass
class QualityResult:
    passed: bool
    status: str          # ok | warning | rejected
    reason: str | None
    source_type: str     # manual | wechat_original | wechat_compressed
    resolution_w: int
    resolution_h: int


def check_quality(file_path: str, original_filename: str,
                  project_existing_resolutions: list[tuple[int, int]] | None = None) -> QualityResult:
    """
    检测图片质量，决定是否接受。

    规则：
    1. 文件名匹配 mmexport 模式 → 标记为微信来源
    2. 微信来源 + EXIF 不完整 → 标记 warning（不拒绝，仅提示）
    3. 微信来源 + 分辨率显著低于项目已有照片(>20%) → 拒绝
    4. 计算压缩率（bytes/pixel），过高压缩标记 warning
    """
    img = Image.open(file_path)
    w, h = img.size
    file_size = os.path.getsize(file_path)
    megapixels = (w * h) / 1_000_000
    bytes_per_pixel = file_size / (w * h) if w * h > 0 else 0

    # 检测微信来源
    is_wechat = bool(re.match(r'mmexport\d{13}', original_filename, re.IGNORECASE))
    source_type = "wechat_compressed" if is_wechat else "manual"

    # 微信来源 + 分辨率明显偏低（与项目已有对比）
    if is_wechat and project_existing_resolutions:
        avg_w = sum(r[0] for r in project_existing_resolutions) / len(project_existing_resolutions)
        avg_h = sum(r[1] for r in project_existing_resolutions) / len(project_existing_resolutions)
        if avg_w > 0 and w < avg_w * 0.8:
            return QualityResult(
                passed=False,
                status="rejected",
                reason=f"分辨率({w}x{h})显著低于项目平均水平({int(avg_w)}x{int(avg_h)})，疑似微信压缩导致",
                source_type=source_type,
                resolution_w=w,
                resolution_h=h,
            )

    # 微信来源：标记 warning（后续 EXIF 检测可能进一步降级）
    if is_wechat:
        reasons = []
        reasons.append("微信传输来源，文件名匹配 mmexport 模式")

        # 检查极端压缩率：JPEG 正常 0.5-3 bytes/pixel，<0.15 表示严重压缩
        if bytes_per_pixel < 0.15:
            reasons.append(f"压缩率异常(bytes/px={bytes_per_pixel:.2f})")
            return QualityResult(
                passed=True,
                status="warning",
                reason="；".join(reasons) + "，图片质量可能受损",
                source_type=source_type,
                resolution_w=w,
                resolution_h=h,
            )

        return QualityResult(
            passed=True,
            status="warning",
            reason="；".join(reasons) + "，如EXIF完整则可接受",
            source_type=source_type,
            resolution_w=w,
            resolution_h=h,
        )

    # 非微信来源：检查压缩率是否异常
    if megapixels > 0 and bytes_per_pixel < 0.1:
        return QualityResult(
            passed=True,
            status="warning",
            reason=f"图片压缩率较高({megapixels:.1f}MP, bytes/px={bytes_per_pixel:.2f})，可能经过多次保存",
            source_type=source_type,
            resolution_w=w,
            resolution_h=h,
        )

    return QualityResult(
        passed=True,
        status="ok",
        reason=None,
        source_type=source_type,
        resolution_w=w,
        resolution_h=h,
    )
