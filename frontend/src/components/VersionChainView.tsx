import type { Photo } from '../types'

interface ChainData {
  root_photo: Photo | null
  versions: Photo[]
  overall_confidence: number
  confidence_label: string
}

interface Props {
  chains: ChainData[]
  onPhotoClick: (photoId: string) => void
  onScrollToPhoto: (photoId: string) => void
  highlightPhotoId: string | null
}

const confidenceColors: Record<string, string> = {
  HIGH: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-red-100 text-red-700',
}

const confidenceLabels: Record<string, string> = {
  HIGH: '高置信度',
  MEDIUM: '中置信度',
  LOW: '⚠ 低置信度',
}

export default function VersionChainView({
  chains,
  onPhotoClick,
  onScrollToPhoto,
  highlightPhotoId,
}: Props) {
  if (chains.length === 0) return null

  return (
    <div className="space-y-6">
      {chains.map((chain, ci) => (
        <div key={ci} className="border rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-medium text-sm">版本链 #{ci + 1}</span>
            <span className="text-xs text-gray-400">{chain.versions.length} 个版本</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${confidenceColors[chain.confidence_label] || ''}`}>
              {confidenceLabels[chain.confidence_label] || chain.confidence_label}
            </span>
          </div>

          {/* 线性版本链展示（含缩略图） */}
          <div className="flex items-center flex-wrap gap-2 overflow-x-auto pb-2">
            {chain.versions.map((photo, pi) => (
              <div key={photo.id} className="flex items-center gap-2 shrink-0">
                {pi > 0 && (
                  <span className="text-gray-300 text-lg shrink-0">→</span>
                )}
                <div
                  className={`relative bg-white rounded-lg border shadow-sm overflow-hidden w-28 sm:w-36 hover:shadow-md transition-shadow flex flex-col group ${
                    highlightPhotoId === photo.id
                      ? 'ring-2 ring-indigo-400 ring-offset-2 animate-highlight-pulse'
                      : 'border-gray-200'
                  }`}
                >
                  {/* 缩略图区域 */}
                  <div
                    className="w-full h-20 sm:h-24 bg-gray-100 overflow-hidden cursor-pointer shrink-0"
                    onClick={() => onPhotoClick(photo.id)}
                  >
                    <img
                      src={`/api/projects/photos/${photo.id}/file?thumb=true&size=200`}
                      alt={photo.original_name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🖼</text></svg>'
                      }}
                    />
                  </div>

                  {/* 文字信息 — 统一高度 */}
                  <div className="p-1.5 sm:p-2 flex flex-col gap-0.5 flex-1">
                    <div className="text-xs font-medium truncate leading-tight" title={photo.original_name}>
                      {photo.original_name}
                    </div>
                    <div className="text-xs text-gray-400 leading-tight h-4">
                      {photo.exif_datetime_original?.split('T')[0] || '无时间'}
                    </div>
                    <div className="flex items-center gap-1 h-5">
                      {pi === 0 && (
                        <span className="text-xs bg-blue-100 text-blue-600 px-1 rounded leading-tight">原图</span>
                      )}
                      {pi === chain.versions.length - 1 && pi > 0 && (
                        <span className="text-xs bg-purple-100 text-purple-600 px-1 rounded leading-tight">最新</span>
                      )}
                      {!photo.exif_has_all && (
                        <span className="text-xs" title="EXIF不完整">⚠️</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 leading-tight">
                      {photo.resolution_w}x{photo.resolution_h} · {formatSize(photo.file_size)}
                    </div>
                  </div>

                  {/* hover 覆盖层 */}
                  <div className="absolute inset-0 bg-gray-900/70 rounded-lg flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onPhotoClick(photo.id)
                      }}
                      className="px-3 py-1.5 bg-white/20 text-white text-xs rounded-md hover:bg-white/30 transition"
                    >
                      🔍 预览
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onScrollToPhoto(photo.id)
                      }}
                      className="px-3 py-1.5 bg-white/20 text-white text-xs rounded-md hover:bg-white/30 transition"
                    >
                      📍 定位
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {chains.some(c => c.confidence_label === 'LOW') && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
          ⚠️ 部分版本链置信度较低，建议手动确认版本关系是否正确
        </div>
      )}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + 'MB'
  return (bytes / 1024).toFixed(0) + 'KB'
}
