import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// 响应拦截：统一处理错误
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || error.response?.data?.detail || error.message
    return Promise.reject(new Error(message))
  }
)

/** 项目管理 API */
export const projectsApi = {
  list: () => api.get('/projects'),
  create: (data: { name: string; description?: string }) => api.post('/projects', data),
  get: (id: string) => api.get(`/projects/${id}`),
  update: (id: string, data: { name?: string; description?: string }) => api.put(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
}

/** 照片管理 API */
export const photosApi = {
  list: (projectId: string) => api.get(`/projects/${projectId}/photos`),
  upload: (projectId: string, files: File[]) => {
    const formData = new FormData()
    files.forEach((f) => formData.append('files', f))
    return api.post(`/projects/${projectId}/photos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    })
  },
  delete: (projectId: string, photoId: string) =>
    api.delete(`/projects/${projectId}/photos/${photoId}`),
}

/** V2.0 清理 API */
export const cleanupApi = {
  scan: (projectId: string) => api.post(`/projects/${projectId}/cleanup/scan`),
  execute: (projectId: string, photoIds: string[]) =>
    api.post(`/projects/${projectId}/cleanup/execute`, { photo_ids: photoIds }),
  reset: (projectId: string) => api.post(`/projects/${projectId}/cleanup/reset`),
  /** V2.1 清理历史 */
  history: (projectId: string) =>
    api.get(`/projects/${projectId}/cleanup/history`),
  exportReport: (projectId: string, historyId: string) =>
    api.get(`/projects/${projectId}/cleanup/history/${historyId}/export`),
}

/** V2.1 搜索 API */
export const searchApi = {
  search: (projectId: string, query: string) =>
    api.get(`/projects/${projectId}/search`, { params: { q: query } }),
}

export default api
