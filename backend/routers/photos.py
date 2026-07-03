"""照片管理路由（占位，阶段 2 实现）"""

from fastapi import APIRouter

router = APIRouter(prefix="/api/projects", tags=["photos"])


@router.get("/{project_id}/photos")
def list_photos(project_id: str):
    """列出项目内所有照片（TODO）"""
    return {"message": "待实现", "project_id": project_id, "photos": []}
