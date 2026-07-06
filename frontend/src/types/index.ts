/** 项目 */
export interface Project {
  id: string
  name: string
  description: string | null
  photo_count: number
  created_at: string
  updated_at: string
}

/** 照片 */
export interface Photo {
  id: string
  project_id: string
  original_name: string
  file_size: number
  mime_type: string
  resolution_w: number | null
  resolution_h: number | null
  exif_datetime_original: string | null
  exif_make: string | null
  exif_model: string | null
  exif_has_all: boolean
  quality_status: string
  quality_reason: string | null
  dhash: string | null
  source_type: string
  uploaded_at: string
  // V2.0 清理字段
  cleanup_status: string | null
  cleanup_group_id: string | null
  cleanup_group_rank: number | null
  cleanup_reason: string | null
}

/** ===== V2.0 清理相关类型 ===== */

/** 清理扫描结果中的单组照片 */
export interface CleanupGroupPhoto extends Photo {
  exif_make: string | null
  exif_model: string | null
}

/** 清理扫描结果中的相似组 */
export interface CleanupGroup {
  group_id: string
  photo_count: number
  keep_count: number
  delete_count: number
  estimated_space_saved: number
  confidence: number
  confidence_label: string
  photos: CleanupGroupPhoto[]
}

/** 清理扫描完整结果 */
export interface CleanupScanResult {
  project_id: string
  group_count: number
  total_photos: number
  total_keep: number
  total_delete: number
  total_space_saved: number
  groups: CleanupGroup[]
}

/** 删除结果中的单条 */
export interface DeleteItem {
  photo_id: string
  original_name: string
  file_size: number
}

/** 删除失败项 */
export interface FailedItem {
  photo_id: string
  reason: string
}

/** 清理执行结果 */
export interface CleanupExecuteResult {
  deleted_count: number
  failed_count: number
  space_freed: number
  deleted: DeleteItem[]
  failed: FailedItem[]
}

/** 创建项目请求 */
export interface CreateProjectRequest {
  name: string
  description?: string
}

/** V2.1 清理历史记录 */
export interface CleanupHistoryRecord {
  id: string
  project_id: string
  executed_at: string | null
  deleted_count: number
  space_freed: number
  photo_count_before: number
  photo_count_after: number
  details: DeleteItem[] | null
}

/** 清理报告 */
export interface CleanupReport {
  report_type: string
  project_id: string
  executed_at: string | null
  summary: {
    deleted_count: number
    space_freed_bytes: number
    space_freed_mb: number
    photo_count_before: number
    photo_count_after: number
  }
  deleted_photos: DeleteItem[]
}

/** API 统一响应 */
export interface ApiResponse<T> {
  data: T | null
  error: string | null
  message: string | null
}
