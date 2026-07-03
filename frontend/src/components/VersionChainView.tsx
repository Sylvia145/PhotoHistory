import type { Photo } from '../types'

interface ChainData {
  root_photo: Photo | null
  versions: Photo[]
  overall_confidence: number
  confidence_label: string
}

interface Props {
  chains: ChainData[]
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

export default function VersionChainView({ chains }: Props) {
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

          {/* 线性版本链展示 */}
          <div className="flex items-center flex-wrap gap-2 overflow-x-auto pb-2">
            {chain.versions.map((photo, pi) => (
              <div key={photo.id} className="flex items-center gap-2 shrink-0">
                {pi > 0 && (
                  <span className="text-gray-300 text-lg">→</span>
                )}
                <div className="bg-gray-50 rounded-lg px-3 py-2 border text-center min-w-[100px]">
                  <div className="text-xs font-medium truncate max-w-[120px]" title={photo.original_name}>
                    {photo.original_name}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {photo.exif_datetime_original?.split('T')[0] || '无时间'}
                  </div>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    {pi === 0 && <span className="text-xs bg-blue-100 text-blue-600 px-1 rounded">原图</span>}
                    {pi === chain.versions.length - 1 && pi > 0 && (
                      <span className="text-xs bg-purple-100 text-purple-600 px-1 rounded">最新</span>
                    )}
                    {!photo.exif_has_all && <span className="text-xs" title="EXIF不完整">⚠️</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {photo.resolution_w}x{photo.resolution_h} · {formatSize(photo.file_size)}
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
