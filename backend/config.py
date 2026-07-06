"""应用配置"""

import os

# 项目根目录
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 数据库
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR}/photohistory.db")

# 上传文件存储
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")

# 图片限制
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/heif", "image/heic", "image/tiff"}

# 版本分组参数
DHASH_SIMILARITY_THRESHOLD = 10       # 汉明距离 ≤ 10 → 确认同源
DHASH_POSSIBLE_THRESHOLD = 20         # 汉明距离 11-20 → 可能同源

# MCP Server
MCP_SERVER_NAME = os.getenv("PHOTOHISTORY_MCP_NAME", "PhotoHistory")
MCP_SERVER_VERSION = "3.0.0"
