"""MCP 工具安全层。

为 execute_cleanup 提供三道防线：
1. 参数非空校验
2. photo_ids 归属验证（每张照片必须属于指定 project）
3. cleanup_status 状态锁（只删除已标记为 'delete' 的照片）
"""

from sqlalchemy.orm import Session

from models.photo import Photo


class SecurityError(Exception):
    """安全校验失败异常，消息为人类可读的中文说明。"""
    pass


def validate_cleanup_params(project_id: str, photo_ids: list[str]) -> None:
    """校验清理参数的有效性（防线 1）。

    Args:
        project_id: 项目 ID
        photo_ids: 待删除的照片 ID 列表

    Raises:
        SecurityError: 参数不合法时抛出，消息包含具体原因
    """
    if not project_id or not project_id.strip():
        raise SecurityError("未指定项目 ID（project_id 不能为空）")

    if not photo_ids or len(photo_ids) == 0:
        raise SecurityError("未指定要删除的照片（photo_ids_to_delete 不能为空）")


def validate_photo_belongs_to_project(
    db: Session, photo_id: str, project_id: str
) -> Photo:
    """验证照片存在且属于指定项目（防线 2）。

    Args:
        db: 数据库会话
        photo_id: 照片 ID
        project_id: 项目 ID

    Returns:
        验证通过的 Photo ORM 对象

    Raises:
        SecurityError: 照片不存在或不属于该项目
    """
    photo = (
        db.query(Photo)
        .filter(Photo.id == photo_id, Photo.project_id == project_id)
        .first()
    )
    if not photo:
        # 先检查照片是否存在（不限定 project）
        exists = db.query(Photo).filter(Photo.id == photo_id).first()
        if exists:
            raise SecurityError(
                f"照片 {photo_id}（{exists.original_name}）不属于项目 {project_id}，"
                f"该照片实际属于项目 {exists.project_id}"
            )
        raise SecurityError(f"照片 {photo_id} 不存在，请检查 photo_id 是否正确")
    return photo


def ensure_photo_marked_delete(photo: Photo) -> None:
    """验证照片已标记为可删除状态（防线 3）。

    Args:
        photo: Photo ORM 对象

    Raises:
        SecurityError: 照片未标记为可删除
    """
    if photo.cleanup_status != "delete":
        raise SecurityError(
            f"照片 {photo.id}（{photo.original_name}）未标记为可删除状态"
            f"（当前状态: {photo.cleanup_status or '未判定'}），"
            f"请先调用 scan_similar_groups 扫描项目，"
            f"再由用户确认哪些照片需要删除"
        )
