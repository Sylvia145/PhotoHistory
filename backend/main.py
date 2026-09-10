"""PhotoHistory 后端应用入口"""

import os as _os
import asyncio as _asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import init_db, SessionLocal
from routers import projects, photos, cleanup, search


async def _purge_expired_loop():
    """后台任务：每 5 分钟清理超过 30 分钟的软删除照片。"""
    while True:
        try:
            await _asyncio.sleep(300)
            threshold = datetime.now() - timedelta(minutes=30)
            db = SessionLocal()
            try:
                from models.photo import Photo
                expired = (
                    db.query(Photo)
                    .filter(Photo.deleted_at.isnot(None), Photo.deleted_at <= threshold)
                    .all()
                )
                for p in expired:
                    if _os.path.exists(p.stored_path):
                        try:
                            _os.remove(p.stored_path)
                        except OSError:
                            pass
                    db.delete(p)
                if expired:
                    db.commit()
            finally:
                db.close()
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化数据库"""
    init_db()
    # 启动后台回收站清理任务
    task = _asyncio.create_task(_purge_expired_loop())
    yield
    task.cancel()


app = FastAPI(
    title="PhotoHistory",
    description="智能相似照片清理工具后端 API",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS 配置（开发阶段允许前端 localhost）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(projects.router)
app.include_router(photos.router)
app.include_router(cleanup.router)
app.include_router(search.router)
app.include_router(photos.compare_router)
app.include_router(photos.recycle_router)

# ── V3.0 Agent 路由 ──────────────────────────────────────────
from agent.router import create_agent_router
app.include_router(create_agent_router())

# ── V3.0 MCP HTTP 子应用（可选，环境变量 PHOTOHISTORY_MCP_HTTP=1 启用）──
if _os.getenv("PHOTOHISTORY_MCP_HTTP", "0") == "1":
    from mcp_server.server import mcp

    app.mount("/mcp", mcp.streamable_http_app())


@app.get("/api/health")
def health_check():
    """健康检查端点"""
    return {"status": "ok", "version": "2.0.0"}
