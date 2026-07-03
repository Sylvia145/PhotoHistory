"""图片质量检测：识别并拒绝微信压缩图"""

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
    2. 对微信来源检查 EXIF 完整性（调用方传入）
    3. 分辨率显著低于项目已有照片 → 拒绝
    """
    img = Image.open(file_path)
    w, h = img.size

    # 检测微信来源
    is_wechat = bool(re.match(r'mmexport\d{13}', original_filename, re.IGNORECASE))
    source_type = "wechat_compressed" if is_wechat else "manual"

    # 微信来源 + 分辨率明显偏低
    if is_wechat and project_existing_resolutions:
        avg_w = sum(r[0] for r in project_existing_resolutions) / len(project_existing_resolutions)
        avg_h = sum(r[1] for r in project_existing_resolutions) / len(project_existing_resolutions)
        if avg_w > 0 and w < avg_w * 0.8:
            return QualityResult(
                passed=False,
                status="rejected",
                reason=f"分辨率({w}x{h})显著低于项目平均水平({int(avg_w)}x{int(avg_h)})，疑似微信压缩",
                source_type=source_type,
                resolution_w=w,
                resolution_h=h,
            )

    # 暂不做文件大小判断（不同App保存的JPEG质量不同，容易误判）
    return QualityResult(
        passed=True,
        status="ok",
        reason=None,
        source_type=source_type,
        resolution_w=w,
        resolution_h=h,
    )
