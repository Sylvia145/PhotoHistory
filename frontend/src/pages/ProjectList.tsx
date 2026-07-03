import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { projectsApi } from '../api/client'
import type { Project } from '../types'

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProjects = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await projectsApi.list()
      setProjects(res.data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除项目「${name}」吗？\n项目内的所有照片也会被删除。`)) return
    try {
      await projectsApi.delete(id)
      setProjects((prev) => prev.filter((p) => p.id !== id))
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '删除失败')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">我的项目</h1>
        <Link
          to="/projects/new"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          + 新建项目
        </Link>
      </div>

      {loading && <p className="text-gray-400">加载中...</p>}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 mb-4">
          {error}
          <button onClick={fetchProjects} className="ml-4 underline">重试</button>
        </div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <p className="text-5xl mb-4">📷</p>
          <p className="text-lg mb-2">还没有项目</p>
          <p className="text-sm">点击「新建项目」开始管理你的照片版本</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <div key={p.id} className="bg-white rounded-lg shadow-sm border p-5 hover:shadow-md transition">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-lg truncate">{p.name}</h3>
              <button
                onClick={() => handleDelete(p.id, p.name)}
                className="text-gray-300 hover:text-red-500 text-sm ml-2 shrink-0"
                title="删除项目"
              >
                🗑
              </button>
            </div>
            {p.description && (
              <p className="text-sm text-gray-500 mb-3 line-clamp-2">{p.description}</p>
            )}
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{p.photo_count} 张照片</span>
              <span>{new Date(p.updated_at).toLocaleDateString('zh-CN')}</span>
            </div>
            <Link
              to={`/projects/${p.id}`}
              className="mt-3 block text-center py-2 bg-gray-50 rounded text-sm text-indigo-600 hover:bg-indigo-50 transition"
            >
              打开项目
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
