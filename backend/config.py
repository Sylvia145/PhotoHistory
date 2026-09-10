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

# ── V3.0 Agent: LLM Provider 配置 ────────────────────────────
LLM_PROVIDER = os.getenv("PHOTOHISTORY_LLM_PROVIDER", "anthropic")
# 可选: "anthropic" | "openai_compat"
LLM_MODEL = os.getenv("PHOTOHISTORY_LLM_MODEL", "claude-sonnet-4-6")
# 推荐: claude-sonnet-4-6（性价比）| claude-opus-4-8（最强推理）
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
LLM_MAX_TOKENS = int(os.getenv("PHOTOHISTORY_LLM_MAX_TOKENS", "16000"))
LLM_TEMPERATURE = float(os.getenv("PHOTOHISTORY_LLM_TEMPERATURE", "0.7"))
# Agent 编排参数
AGENT_MAX_ITERATIONS = int(os.getenv("PHOTOHISTORY_AGENT_MAX_ITERATIONS", "15"))
AGENT_CONFIRM_TIMEOUT = int(os.getenv("PHOTOHISTORY_AGENT_CONFIRM_TIMEOUT", "120"))
