import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { projectsApi, photosApi, analysisApi, cleanupApi, searchApi } from '../api/client'
import type { Photo, CleanupScanResult, CleanupExecuteResult } from '../types'
import PhotoUpload from '../components/PhotoUpload'
import VersionChainView from '../components/VersionChainView'
import PhotoViewer from '../components/PhotoViewer'
import PhotoCompare from '../components/PhotoCompare'
import SimilarGroupCard from '../components/SimilarGroupCard'
import CleanupPanel from '../components/CleanupPanel'
import SearchBar from '../components/SearchBar'
import CleanupHistoryPanel from '../components/CleanupHistoryPanel'

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
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [highlightPhotoId, setHighlightPhotoId] = useState<string | null>(null)

  // ===== V2.0 清理状态 =====
  const [scanResult, setScanResult] = useState<CleanupScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [executeResult, setExecuteResult] = useState<CleanupExecuteResult | null>(null)

  // ===== V2.1 搜索状态 =====
  const [searchResults, setSearchResults] = useState<Photo[] | null>(null)
  const [searching, setSearching] = useState(false)

  // ===== V2.1 对比状态 =====
  const [comparePhotos, setComparePhotos] = useState<[Photo, Photo] | null>(null)
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set())
  const [showHistory, setShowHistory] = useState(false)

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

  // ===== V2.0: 扫描相似照片 =====
  const handleScan = async () => {
    if (!id) return
    setScanning(true)
    setExecuteResult(null)
    try {
      const res = await cleanupApi.scan(id)
      setScanResult(res.data)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '扫描失败')
    } finally {
      setScanning(false)
    }
  }

  // ===== V2.0: 切换单张照片的 keep/delete 状态 =====
  const handleToggle = useCallback(
    (photoId: string, newStatus: 'keep' | 'delete') => {
      setScanResult((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          total_keep: prev.total_keep + (newStatus === 'keep' ? 1 : -1),
          total_delete: prev.total_delete + (newStatus === 'delete' ? 1 : -1),
          groups: prev.groups.map((g) => {
            const photo = g.photos.find((p) => p.id === photoId)
            if (!photo || photo.cleanup_status === newStatus) return g

            const oldStatus = photo.cleanup_status
            const updatedPhotos = g.photos.map((p) =>
              p.id === photoId ? { ...p, cleanup_status: newStatus } : p
            )

            const newKeep = updatedPhotos.filter((p) => p.cleanup_status === 'keep')
            const newDelete = updatedPhotos.filter((p) => p.cleanup_status === 'delete')

            return {
              ...g,
              keep_count: newKeep.length,
              delete_count: newDelete.length,
              estimated_space_saved: newDelete.reduce((s, p) => s + p.file_size, 0),
              photos: updatedPhotos,
            }
          }),
        }
      })
    },
    [],
  )

  // ===== V2.0: 执行清理 =====
  const handleExecute = async () => {
    if (!id || !scanResult) return
    const deleteIds = scanResult.groups
      .flatMap((g) => g.photos)
      .filter((p) => p.cleanup_status === 'delete')
      .map((p) => p.id)
    if (deleteIds.length === 0) return
    if (!confirm(`确认删除 ${deleteIds.length} 张照片？此操作不可撤销。`)) return

    setExecuting(true)
    try {
      const res = await cleanupApi.execute(id, deleteIds)
      setExecuteResult(res.data)
      setScanResult(null)
      await fetchData()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '执行失败')
    } finally {
      setExecuting(false)
    }
  }

  // ===== V2.0: 重置清理 =====
  const handleReset = async () => {
    if (!id) return
    try {
      await cleanupApi.reset(id)
      setScanResult(null)
      setExecuteResult(null)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '重置失败')
    }
  }

  // ===== V2.1: 自然语言搜索 =====
  const handleSearch = useCallback(
    async (query: string) => {
      if (!id) return
      setSearching(true)
      try {
        const res = await searchApi.search(id, query)
        setSearchResults(res.data || [])
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    },
    [id],
  )

  const handleClearSearch = useCallback(() => {
    setSearchResults(null)
    setSearching(false)
  }, [])

  // 决定当前显示的照片列表
  const displayPhotos = searchResults ?? photos

  // ===== V2.1: 对比选择 =====
  const handleCompareSelect = useCallback((photoId: string) => {
    setSelectedForCompare((prev) => {
      const next = new Set(prev)
      if (next.has(photoId)) {
        next.delete(photoId)
      } else if (next.size < 2) {
        next.add(photoId)
      } else {
        // 已有 2 张选中，替换最早选中的
        const [first] = next
        next.delete(first)
        next.add(photoId)
      }
      return next
    })
  }, [])

  const handleCompareOpen = useCallback(() => {
    const ids = Array.from(selectedForCompare)
    if (ids.length !== 2) return
    const allPhotos = scanResult
      ? (scanResult.groups.flatMap((g) => g.photos) as unknown as Photo[])
      : displayPhotos
    const a = allPhotos.find((p) => p.id === ids[0])
    const b = allPhotos.find((p) => p.id === ids[1])
    if (a && b) {
      setComparePhotos([a, b])
    }
  }, [selectedForCompare, scanResult, displayPhotos])

  const handleCompareClose = useCallback(() => {
    setComparePhotos(null)
  }, [])

  // 从预览照片计算其在全量列表中的索引
  const getPreviewIndex = useCallback(
    (photoId: string): number => {
      if (scanResult) {
        const allPhotos = scanResult.groups.flatMap((g) => g.photos)
        return allPhotos.findIndex((p) => p.id === photoId)
      }
      return displayPhotos.findIndex((p) => p.id === photoId)
    },
    [displayPhotos, scanResult],
  )

  // 版本链节点点击 → 打开预览
  const handlePhotoClick = useCallback(
    (photoId: string) => {
      const idx = getPreviewIndex(photoId)
      if (idx !== -1) setPreviewIndex(idx)
    },
    [getPreviewIndex],
  )

  // 跳转到照片列表并高亮
  const handleScrollToPhoto = useCallback((photoId: string) => {
    setHighlightPhotoId(photoId)
    setTimeout(() => {
      const el = document.getElementById(`photo-${photoId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 60)
    setTimeout(() => setHighlightPhotoId(null), 2500)
  }, [])

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
          {photos.length >= 2 && !scanResult && !executeResult && (
            <button
              onClick={handleScan}
              disabled={scanning}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {scanning ? '扫描中...' : '🔍 扫描相似照片'}
            </button>
          )}
          {/* 传统分析按钮（次优先级） */}
          {photos.length >= 2 && scanResult && (
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"
            >
              ↩ 重置
            </button>
          )}
          {photos.length >= 2 && !scanResult && !executeResult && (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition"
            >
              {analyzing ? '分析中...' : '📊 版本分析'}
            </button>
          )}
          {/* V2.1 对比按钮 */}
          {photos.length >= 2 && !scanResult && !executeResult && (
            <div className="flex gap-1">
              <button
                onClick={handleCompareOpen}
                disabled={selectedForCompare.size !== 2}
                className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed transition text-sm"
              >
                🔍 对比 ({selectedForCompare.size}/2)
              </button>
              {selectedForCompare.size > 0 && (
                <button
                  onClick={() => setSelectedForCompare(new Set())}
                  className="px-2 py-2 text-gray-400 hover:text-gray-600 text-sm"
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showUpload && (
        <div className="mb-8">
          <PhotoUpload projectId={id!} onUploaded={fetchData} />
        </div>
      )}

      {/* ===== V2.1 搜索栏 ===== */}
      {!scanResult && !executeResult && photos.length > 0 && (
        <div className="mb-4">
          <SearchBar
            onSearch={handleSearch}
            onClear={handleClearSearch}
            searching={searching}
            resultCount={searchResults?.length ?? null}
          />
        </div>
      )}

      {/* ===== V2.0 清理结果视图 ===== */}
      {scanResult && !executeResult && (
        <div className="flex gap-6">
          {/* 左侧: 相似组列表 */}
          <div className="flex-1 space-y-4">
            {scanResult.groups.map((group) => (
              <SimilarGroupCard
                key={group.group_id}
                group={group}
                onToggle={handleToggle}
                onPreview={(photoId) => {
                  const idx = getPreviewIndex(photoId)
                  if (idx !== -1) setPreviewIndex(idx)
                }}
              />
            ))}
          </div>

          {/* 右侧: 清理面板 */}
          <div className="w-72 shrink-0">
            <CleanupPanel
              result={scanResult}
              onExecute={handleExecute}
              onReset={handleReset}
              executing={executing}
              executeResult={executeResult}
            />
          </div>
        </div>
      )}

      {/* ===== 清理完成 ===== */}
      {executeResult && (
        <div className="mb-6">
          <CleanupPanel
            result={null}
            onExecute={() => {}}
            onReset={handleReset}
            executing={false}
            executeResult={executeResult}
          />
          <div className="mt-4 text-center">
            <button
              onClick={() => {
                setExecuteResult(null)
                fetchData()
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              刷新照片列表
            </button>
          </div>
        </div>
      )}

      {/* ===== 未扫描时显示原有视图 ===== */}
      {!scanResult && !executeResult && (
        <>
          {photos.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border p-12 text-center text-gray-400">
              <p className="text-5xl mb-3">🖼</p>
              <p className="text-lg">还没有照片</p>
              <p className="text-sm mt-1">点击「上传照片」开始</p>
            </div>
          ) : searchResults !== null && searchResults.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border p-12 text-center text-gray-400">
              <p className="text-5xl mb-3">🔍</p>
              <p className="text-lg">未找到匹配照片</p>
              <p className="text-sm mt-1">试试：iPhone、竖屏、大于5MB、2026年6月</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 版本链视图 */}
              {chains.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border p-6">
                  <h2 className="font-bold text-lg mb-4">
                    📊 版本分析结果（{chains.length} 条版本链 · {photos.length} 张照片）
                  </h2>
                  <VersionChainView
                    chains={chains}
                    onPhotoClick={handlePhotoClick}
                    onScrollToPhoto={handleScrollToPhoto}
                    highlightPhotoId={highlightPhotoId}
                  />
                </div>
              )}

              <div className="bg-white rounded-lg shadow-sm border p-6">
                <h2 className="font-bold text-lg mb-4">
                  照片列表
                  {searchResults !== null && (
                    <span className="text-sm font-normal text-gray-400 ml-2">
                      搜索：{searchResults.length} 张匹配
                    </span>
                  )}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {displayPhotos.map((p, idx) => (
                    <div
                      key={p.id}
                      id={`photo-${p.id}`}
                      className={`group relative cursor-pointer rounded-lg transition-all duration-300 ${
                        highlightPhotoId === p.id
                          ? 'ring-2 ring-indigo-400 ring-offset-2 animate-highlight-pulse'
                          : ''
                      }`}
                      onClick={() => setPreviewIndex(idx)}
                    >
                      <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden relative">
                        <img
                          src={`/api/projects/photos/${p.id}/file?thumb=true&size=200`}
                          alt={p.original_name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🖼</text></svg>'
                          }}
                        />
                        {/* V2.1 对比选择框 */}
                        {(selectedForCompare.size > 0 || selectedForCompare.has(p.id)) && (
                          <div
                            className={`absolute top-1 left-1 w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition ${
                              selectedForCompare.has(p.id)
                                ? 'bg-indigo-500 border-indigo-500'
                                : 'bg-white/70 border-gray-300 hover:border-indigo-400'
                            }`}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCompareSelect(p.id)
                            }}
                          >
                            {selectedForCompare.has(p.id) && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20,6 9,17 4,12" />
                              </svg>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="mt-1 text-xs truncate">{p.original_name}</div>
                      <div className="text-xs text-gray-400">
                        {p.exif_datetime_original?.split('T')[0] || '无时间'} ·{' '}
                        {p.exif_has_all ? '✅' : '⚠️'}
                      </div>

                      {/* 下载按钮 */}
                      <a
                        href={`/api/projects/photos/${p.id}/file?download=true`}
                        download={p.original_name}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-1 right-8 bg-white/80 rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-blue-100"
                        title="下载"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                          <polyline points="7,10 12,15 17,10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </a>

                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
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
        </>
      )}

      {/* ===== V2.1 清理历史 ===== */}
      {!scanResult && !executeResult && photos.length > 0 && (
        <div className="mt-6">
          {!showHistory ? (
            <button
              onClick={() => setShowHistory(true)}
              className="text-sm text-gray-400 hover:text-indigo-600 transition flex items-center gap-1"
            >
              📋 查看清理历史
            </button>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div />
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-sm text-gray-400 hover:text-gray-600 transition"
                >
                  收起 ✕
                </button>
              </div>
              <CleanupHistoryPanel projectId={id!} />
            </div>
          )}
        </div>
      )}

      {/* 照片预览灯箱（始终可用） */}
      {previewIndex !== null && (
        <PhotoViewer
          photos={
            scanResult
              ? (scanResult.groups.flatMap((g) => g.photos) as unknown as Photo[])
              : displayPhotos
          }
          currentIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onNavigate={(idx) => setPreviewIndex(idx)}
        />
      )}

      {/* V2.1 并排对比视图 */}
      {comparePhotos && (
        <PhotoCompare photos={comparePhotos} onClose={handleCompareClose} />
      )}
    </div>
  )
}
