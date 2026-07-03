import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { projectsApi } from '../api/client'
import type { ProjectDetail as ProjectDetailType } from '../types'
import PhotoUpload from '../components/PhotoUpload'

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<ProjectDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  const fetchProject = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await projectsApi.get(id)
      setProject(res.data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProject()
  }, [id])

  if (loading) return <p className="text-gray-400">加载中...</p>
  if (error) return <div className="text-red-500">{error}</div>
  if (!project) return <div className="text-gray-400">项目不存在</div>

  return (
    <div>
      <Link to="/" className="text-sm text-indigo-600 hover:underline mb-4 inline-block">
        ◀ 返回项目列表
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {project.description && (
            <p className="text-gray-500 mt-1">{project.description}</p>
          )}
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          {showUpload ? '收起上传' : '📤 上传照片'}
        </button>
      </div>

      {showUpload && (
        <div className="mb-8">
          <PhotoUpload projectId={project.id} onUploaded={fetchProject} />
        </div>
      )}

      {/* 照片列表 + 版本链 — 后续阶段实现 */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        {project.photo_count === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-3xl mb-2">🖼</p>
            <p>还没有照片，点击「上传照片」开始</p>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <p>照片列表和版本链将在下一阶段实现</p>
          </div>
        )}
      </div>
    </div>
  )
}
