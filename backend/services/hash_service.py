"""感知哈希计算"""

import imagehash
from PIL import Image


def compute_dhash(file_path: str) -> str:
    """计算 64 位差异哈希（dHash）"""
    img = Image.open(file_path).convert("L")      # 转灰度
    img = img.resize((9, 8), Image.LANCZOS)        # 缩放
    hash_val = imagehash.dhash(img, hash_size=8)
    return str(hash_val)


def compute_phash(file_path: str) -> str:
    """计算感知哈希（pHash），作为辅助参考"""
    img = Image.open(file_path).convert("L")
    hash_val = imagehash.phash(img)
    return str(hash_val)


def hamming_distance(h1: str, h2: str) -> int:
    """计算两个 Hex 哈希值的汉明距离"""
    if not h1 or not h2:
        return 999
    a = int(h1, 16)
    b = int(h2, 16)
    return bin(a ^ b).count("1")
