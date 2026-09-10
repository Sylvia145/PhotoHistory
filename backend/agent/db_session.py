"""Agent 数据库会话 — 独立于 FastAPI 依赖注入的上下文管理器"""

from contextlib import contextmanager

from db import SessionLocal


@contextmanager
def get_agent_db_session():
    """获取数据库会话（上下文管理器）。

    用法:
        with get_agent_db_session() as db:
            # 执行数据库操作
            db.commit()
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
