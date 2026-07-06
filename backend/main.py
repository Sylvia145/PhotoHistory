"""PhotoHistory 后端应用入口"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import init_db
from routers import projects, photos, analysis, cleanup, search


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化数据库"""
    init_db()
    yield


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
app.include_router(analysis.router)
app.include_router(cleanup.router)
app.include_router(search.router)
app.include_router(photos.compare_router)


@app.get("/api/health")
def health_check():
    """健康检查端点"""
    return {"status": "ok", "version": "2.0.0"}
