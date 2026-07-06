"""清理相关的 Pydantic 模型"""

from pydantic import BaseModel


class BatchDeleteRequest(BaseModel):
    """批量删除请求"""
    photo_ids: list[str]


class DeleteItem(BaseModel):
    """单条删除结果"""
    photo_id: str
    original_name: str
    file_size: int


class FailedItem(BaseModel):
    """删除失败项"""
    photo_id: str
    reason: str


class CleanupExecuteResponse(BaseModel):
    """执行清理的响应"""
    deleted_count: int
    failed_count: int
    space_freed: int
    deleted: list[DeleteItem]
    failed: list[FailedItem]


class CleanupResetResponse(BaseModel):
    """重置清理状态的响应"""
    status: str
    reset_count: int


# ── V2.1 清理历史 ────────────────────────────────────────────────

class CleanupHistoryResponse(BaseModel):
    """历史记录响应"""
    id: str
    project_id: str
    executed_at: str
    deleted_count: int
    space_freed: int
    photo_count_before: int
    photo_count_after: int
    details: list[dict] | None = None

    model_config = {"from_attributes": True}
