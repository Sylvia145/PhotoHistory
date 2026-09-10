"""数据库连接和会话管理"""

import logging

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from config import DATABASE_URL

logger = logging.getLogger(__name__)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def init_db():
    """创建所有表 + 执行轻量迁移"""
    from models.project import Project  # noqa: F401
    from models.photo import Photo  # noqa: F401
    from models.cleanup_history import CleanupHistory  # noqa: F401
    from models.conversation import Conversation  # noqa: F401
    from models.chat_message import ChatMessage  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _migrate_ai_score_columns()
    _migrate_soft_delete_columns()


def _migrate_ai_score_columns():
    """V3.0: 为现有 photos 表添加 AI 评分列（幂等）。"""
    new_columns = [
        ("ai_score_sharpness", "FLOAT"),
        ("ai_score_aesthetic", "FLOAT"),
        ("ai_score_overall", "FLOAT"),
    ]
    try:
        inspector = inspect(engine)
        existing = {col["name"] for col in inspector.get_columns("photos")}
        for col_name, col_type in new_columns:
            if col_name not in existing:
                with engine.connect() as conn:
                    conn.execute(text(f"ALTER TABLE photos ADD COLUMN {col_name} {col_type}"))
                    conn.commit()
                logger.info(f"迁移: 添加列 photos.{col_name} ({col_type})")
    except Exception as e:
        logger.warning(f"迁移检查失败（可能表尚不存在）: {e}")


def _migrate_soft_delete_columns():
    """V3.1: 为现有 photos 表添加软删除列（幂等）。"""
    new_columns = [
        ("deleted_at", "DATETIME"),
        ("deleted_by", "VARCHAR(20)"),
    ]
    try:
        inspector = inspect(engine)
        existing = {col["name"] for col in inspector.get_columns("photos")}
        for col_name, col_type in new_columns:
            if col_name not in existing:
                with engine.connect() as conn:
                    conn.execute(text(f"ALTER TABLE photos ADD COLUMN {col_name} {col_type}"))
                    conn.commit()
                logger.info(f"迁移: 添加列 photos.{col_name} ({col_type})")
    except Exception as e:
        logger.warning(f"迁移检查失败（可能表尚不存在）: {e}")


def get_db():
    """FastAPI 依赖：获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
