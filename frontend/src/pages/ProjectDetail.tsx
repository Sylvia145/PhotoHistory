import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { projectsApi, photosApi, analysisApi } from '../api/client'
import type { Photo } from '../types'
import PhotoUpload from '../components/PhotoUpload'
import VersionChainView from '../components/VersionChainView'

interface ChainData {
  root_photo: Photo | null
  versions: Photo[]
  overall_confidence: number
  confidence_label: string
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<{ name: string; description: string | null } | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [chains, setChains] = useState<ChainData[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  const fetchData = useCallback(async () => {
    if (!id) return
    setError(null)
    try {
      const [projRes, photoRes] = await Promise.all([
        projectsApi.get(id),
        photosApi.list(id),
      ])
      setProject(projRes.data)
      setPhotos(photoRes.data || [])

      // 尝试获取已有分析结果
      try {
        const chainRes = await analysisApi.versionChain(id)
        setChains(chainRes.data?.chains || [])
      } catch {
        setChains([])
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleAnalyze = async () => {
    if (!id) return
    setAnalyzing(true)
    try {
      const res = await analysisApi.analyze(id)
      setChains(res.data?.chains || [])
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '分析失败')
    } finally {
      setAnalyzing(false)
    }
  }

  if (loading) return <p className="text-gray-400">加载中...</p>
  if (error) return <div className="text-red-500">{error}</div>
  if (!project) return <div className="text-gray-400">项目不存在</div>

  return (
    <div>
      <Link to="/" className="text-sm text-indigo-600 hover:underline mb-4 inline-block">
        ◀ 返回项目列表
      </Link>

      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {project.description && <p className="text-gray-500 mt-1">{project.description}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            {showUpload ? '收起' : '📤 上传照片'}
          </button>
          {photos.length >= 2 && (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {analyzing ? '分析中...' : '🔍 分析版本'}
            </button>
          )}
        </div>
      </div>

      {showUpload && (
        <div className="mb-8">
          <PhotoUpload projectId={id!} onUploaded={fetchData} />
        </div>
      )}

      {/* 照片列表 */}
      {photos.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center text-gray-400">
          <p className="text-5xl mb-3">🖼</p>
          <p className="text-lg">还没有照片</p>
          <p className="text-sm mt-1">点击「上传照片」开始</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 版本链视图 */}
          {chains.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="font-bold text-lg mb-4">
                📊 版本分析结果（{chains.length} 条版本链 · {photos.length} 张照片）
              </h2>
              <VersionChainView chains={chains} />
            </div>
          )}

          {/* 照片缩略图网格 */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="font-bold text-lg mb-4">照片列表</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {photos.map((p) => (
                <div key={p.id} className="group relative">
                  <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                    <img
                      src={`/api/projects/photos/${p.id}/file?thumb=true&size=200`}
                      alt={p.original_name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🖼</text></svg>'
                      }}
                    />
                  </div>
                  <div className="mt-1 text-xs truncate">{p.original_name}</div>
                  <div className="text-xs text-gray-400">
                    {p.exif_datetime_original?.split('T')[0] || '无时间'} ·
                    {p.exif_has_all ? '✅' : '⚠️'}
                  </div>
                  <button
                    onClick={async () => {
                      if (!id) return
                      if (!confirm(`删除「${p.original_name}」？`)) return
                      try {
                        await photosApi.delete(id, p.id)
                        fetchData()
                      } catch (e: unknown) {
                        alert(e instanceof Error ? e.message : '删除失败')
                      }
                    }}
                    className="absolute top-1 right-1 bg-white/80 rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition hover:bg-red-100"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
