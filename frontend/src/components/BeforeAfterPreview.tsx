import type { CleanupGroup } from '../types'

interface Props {
  groups: CleanupGroup[]
}

function formatSize(bytes: number): string {
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024).toFixed(0) + ' KB'
}

export default function BeforeAfterPreview({ groups }: Props) {
  const allPhotos = groups.flatMap((g) => g.photos)
  const keepPhotos = allPhotos.filter((p) => p.cleanup_status === 'keep')
  const deletePhotos = allPhotos.filter((p) => p.cleanup_status === 'delete')
  const totalFreed = deletePhotos.reduce((s, p) => s + p.file_size, 0)

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      {/* 标题 */}
      <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
        <span>👁</span> 清理预览
        <span className="text-gray-300 mx-1">·</span>
        <span className="text-green-600">{keepPhotos.length} 张保留</span>
        <span className="text-gray-300 mx-1">·</span>
        <span className="text-red-500">{deletePhotos.length} 张删除</span>
        <span className="text-gray-300 mx-1">·</span>
        <span className="text-indigo-500">释放 {formatSize(totalFreed)}</span>
      </div>

      <div className="flex gap-3">
        {/* 将删除列 */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-red-500 font-medium mb-1.5 bg-red-50 rounded px-1.5 py-0.5 text-center">
            🗑 将删除
          </div>
          {deletePhotos.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">无</p>
          ) : (
            <div className="grid grid-cols-4 gap-1 opacity-60">
              {deletePhotos.slice(0, 12).map((p) => (
                <div key={p.id} className="aspect-square bg-gray-100 rounded overflow-hidden relative">
                  <img
                    src={`/api/projects/photos/${p.id}/file?thumb=true&size=100`}
                    alt={p.original_name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🖼</text></svg>'
                    }}
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-red-500/60 text-white text-[9px] truncate px-0.5 leading-tight">
                    {formatSize(p.file_size)}
                  </div>
                </div>
              ))}
              {deletePhotos.length > 12 && (
                <div className="aspect-square flex items-center justify-center bg-gray-50 rounded text-xs text-gray-400">
                  +{deletePhotos.length - 12}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 箭头 */}
        <div className="flex items-center shrink-0">
          <span className="text-xl text-gray-300">→</span>
        </div>

        {/* 将保留列 */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-green-600 font-medium mb-1.5 bg-green-50 rounded px-1.5 py-0.5 text-center">
            ✅ 将保留
          </div>
          {keepPhotos.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">无</p>
          ) : (
            <div className="grid grid-cols-4 gap-1">
              {keepPhotos.slice(0, 12).map((p) => (
                <div key={p.id} className="aspect-square bg-gray-100 rounded overflow-hidden relative">
                  <img
                    src={`/api/projects/photos/${p.id}/file?thumb=true&size=100`}
                    alt={p.original_name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🖼</text></svg>'
                    }}
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-green-500/60 text-white text-[9px] truncate px-0.5 leading-tight">
                    {formatSize(p.file_size)}
                  </div>
                </div>
              ))}
              {keepPhotos.length > 12 && (
                <div className="aspect-square flex items-center justify-center bg-gray-50 rounded text-xs text-gray-400">
                  +{keepPhotos.length - 12}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
