"""分析路由（占位，阶段 2 实现）"""

from fastapi import APIRouter

router = APIRouter(prefix="/api/projects", tags=["analysis"])


@router.post("/{project_id}/analyze")
def analyze_project(project_id: str):
    """触发版本分析（TODO）"""
    return {"message": "待实现", "project_id": project_id}
