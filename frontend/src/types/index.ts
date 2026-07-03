/** 项目 */
export interface Project {
  id: string
  name: string
  description: string | null
  photo_count: number
  created_at: string
  updated_at: string
}

/** 项目详情（含版本链） */
export interface ProjectDetail extends Project {
  version_chains: VersionChain[]
}

/** 版本链 */
export interface VersionChain {
  root_photo: Photo
  versions: Photo[]
  overall_confidence: number
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
}

/** 创建项目请求 */
export interface CreateProjectRequest {
  name: string
  description?: string
}

/** API 统一响应 */
export interface ApiResponse<T> {
  data: T | null
  error: string | null
  message: string | null
}
