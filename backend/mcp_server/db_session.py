"""MCP 专用数据库会话管理。

与 FastAPI get_db() 依赖注入解耦，
因为 stdio 模式下没有 Web 请求生命周期。
使用 contextmanager 保证会话正确关闭。
"""

from contextlib import contextmanager

from db import SessionLocal


@contextmanager
def get_mcp_db_session():
    """为 MCP 工具提供独立的数据库会话上下文。

    用法:
        with get_mcp_db_session() as db:
            project = db.query(Project).filter(...).first()
            # 在 with 块内使用 db，退出时自动关闭
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
