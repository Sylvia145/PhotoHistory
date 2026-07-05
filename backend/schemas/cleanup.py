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
