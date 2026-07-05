import type { CleanupGroup, CleanupGroupPhoto } from '../types'

interface Props {
  group: CleanupGroup
  onToggle: (photoId: string, newStatus: 'keep' | 'delete') => void
  onPreview: (photoId: string) => void
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

function formatSize(bytes: number): string {
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024).toFixed(0) + ' KB'
}

export default function SimilarGroupCard({ group, onToggle, onPreview }: Props) {
  const keepPhotos = group.photos.filter((p) => p.cleanup_status === 'keep')
  const deletePhotos = group.photos.filter((p) => p.cleanup_status === 'delete')

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      {/* 组头 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="font-medium text-sm">
            📸 相似组 · {group.photo_count} 张
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              confidenceColors[group.confidence_label] || ''
            }`}
          >
            {confidenceLabels[group.confidence_label] || group.confidence_label}
          </span>
        </div>
        <div className="text-xs text-gray-400">
          保留 {group.keep_count} · 删除 {group.delete_count} · 释放{' '}
          {formatSize(group.estimated_space_saved)}
        </div>
      </div>

      {/* 保留行 */}
      {keepPhotos.length > 0 && (
        <div className="mb-2">
          <div className="text-xs font-medium text-green-600 mb-1">✅ 建议保留</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {keepPhotos.map((p) => (
              <PhotoCard
                key={p.id}
                photo={p}
                status="keep"
                onToggle={() => onToggle(p.id, 'delete')}
                onPreview={() => onPreview(p.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 删除行 */}
      {deletePhotos.length > 0 && (
        <div>
          <div className="text-xs font-medium text-red-500 mb-1">🗑 建议删除</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 opacity-60">
            {deletePhotos.map((p) => (
              <PhotoCard
                key={p.id}
                photo={p}
                status="delete"
                onToggle={() => onToggle(p.id, 'keep')}
                onPreview={() => onPreview(p.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PhotoCard({
  photo,
  status,
  onToggle,
  onPreview,
}: {
  photo: CleanupGroupPhoto
  status: 'keep' | 'delete'
  onToggle: () => void
  onPreview: () => void
}) {
  return (
    <div
      className={`relative rounded-lg overflow-hidden border-2 ${
        status === 'keep' ? 'border-green-400' : 'border-red-300'
      }`}
    >
      {/* 缩略图 */}
      <div
        className="w-full aspect-square bg-gray-100 overflow-hidden cursor-pointer"
        onClick={onPreview}
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

      {/* 信息 */}
      <div className="p-1.5">
        <div className="text-xs font-medium truncate leading-tight" title={photo.original_name}>
          {photo.original_name}
        </div>
        {photo.cleanup_reason && (
          <div className="text-xs text-gray-400 leading-tight mt-0.5" title={photo.cleanup_reason}>
            {photo.cleanup_reason.length > 35
              ? photo.cleanup_reason.slice(0, 35) + '...'
              : photo.cleanup_reason}
          </div>
        )}
        <div className="text-xs text-gray-400 leading-tight mt-0.5">
          {photo.exif_datetime_original?.split('T')[0] || '无时间'} ·{' '}
          {formatSize(photo.file_size)}
        </div>
        {photo.source_type === 'wechat_compressed' && (
          <span className="text-xs bg-amber-100 text-amber-600 px-1 rounded leading-tight mt-0.5 inline-block">
            ⚠️ 微信压缩
          </span>
        )}
      </div>

      {/* 切换按钮 */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className={`absolute top-1 right-1 w-6 h-6 rounded-full text-xs flex items-center justify-center shadow ${
          status === 'keep'
            ? 'bg-green-100 hover:bg-red-100'
            : 'bg-red-100 hover:bg-green-100'
        }`}
        title={status === 'keep' ? '改为删除' : '改为保留'}
      >
        {status === 'keep' ? '✅' : '🗑'}
      </button>
    </div>
  )
}
