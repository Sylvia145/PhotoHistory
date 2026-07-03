import { useEffect, useCallback, useState } from 'react'
import type { Photo } from '../types'

interface Props {
  photos: Photo[]
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
}

const sourceLabels: Record<string, string> = {
  manual: '手动上传',
  wechat_original: '微信原图',
  wechat_compressed: '微信压缩',
}

function formatSize(bytes: number): string {
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024).toFixed(0) + ' KB'
}

export default function PhotoViewer({ photos, currentIndex, onClose, onNavigate }: Props) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const photo = photos[currentIndex]

  // 切照片时重置加载状态
  useEffect(() => {
    setImgLoaded(false)
    setImgError(false)
  }, [currentIndex])

  // 键盘快捷键
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        onNavigate(currentIndex - 1)
      } else if (e.key === 'ArrowRight' && currentIndex < photos.length - 1) {
        onNavigate(currentIndex + 1)
      }
    },
    [currentIndex, photos.length, onClose, onNavigate],
  )

  // 挂载/卸载键盘监听和滚动锁
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  if (!photo) return null

  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < photos.length - 1

  return (
    <div
      className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center"
      onClick={onClose}
    >
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/60 hover:text-white text-3xl z-10 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition"
        title="关闭 (ESC)"
      >
        ✕
      </button>

      {/* 计数器 */}
      <div className="absolute top-4 left-4 text-white/50 text-sm z-10">
        {currentIndex + 1} / {photos.length}
      </div>

      {/* 左箭头 */}
      {hasPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNavigate(currentIndex - 1)
          }}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white text-5xl z-10 w-12 h-20 flex items-center justify-center rounded-lg hover:bg-white/10 transition"
          title="上一张 (←)"
        >
          ‹
        </button>
      )}

      {/* 右箭头 */}
      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNavigate(currentIndex + 1)
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white text-5xl z-10 w-12 h-20 flex items-center justify-center rounded-lg hover:bg-white/10 transition"
          title="下一张 (→)"
        >
          ›
        </button>
      )}

      {/* 主要内容区：图片 + 信息面板 */}
      <div
        className="flex gap-0 max-w-[92vw] max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 图片区域 */}
        <div className="flex items-center justify-center min-w-0 bg-black/30 rounded-l-lg">
          {/* 加载中 */}
          {!imgLoaded && !imgError && (
            <div className="text-white/40 text-lg animate-pulse">加载中...</div>
          )}

          {/* 加载失败 */}
          {imgError && (
            <div className="text-white/40 text-center p-8">
              <div className="text-5xl mb-2">🖼</div>
              <div className="text-sm">图片加载失败</div>
            </div>
          )}

          <img
            src={`/api/projects/photos/${photo.id}/file`}
            alt={photo.original_name}
            className={`max-w-full max-h-[88vh] object-contain rounded-l-lg ${imgLoaded ? 'block' : 'hidden'}`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        </div>

        {/* 信息面板 */}
        <div className="w-64 bg-gray-900/90 rounded-r-lg p-4 text-white text-sm overflow-y-auto shrink-0 max-h-[88vh]">
          <h3 className="font-bold text-base mb-3 break-all" title={photo.original_name}>
            {photo.original_name}
          </h3>

          <div className="space-y-2.5">
            {/* 拍摄时间 */}
            <div>
              <div className="text-gray-500 text-xs mb-0.5">拍摄时间</div>
              <div className="text-gray-200">
                {photo.exif_datetime_original
                  ? photo.exif_datetime_original.replace('T', ' ')
                  : '无'}
              </div>
            </div>

            {/* 分辨率 */}
            <div>
              <div className="text-gray-500 text-xs mb-0.5">分辨率</div>
              <div className="text-gray-200">
                {photo.resolution_w && photo.resolution_h
                  ? `${photo.resolution_w} × ${photo.resolution_h}`
                  : '未知'}
              </div>
            </div>

            {/* 文件大小 */}
            <div>
              <div className="text-gray-500 text-xs mb-0.5">文件大小</div>
              <div className="text-gray-200">{formatSize(photo.file_size)}</div>
            </div>

            {/* 设备 */}
            {photo.exif_make && (
              <div>
                <div className="text-gray-500 text-xs mb-0.5">拍摄设备</div>
                <div className="text-gray-200">
                  {[photo.exif_make, photo.exif_model].filter(Boolean).join(' ')}
                </div>
              </div>
            )}

            {/* 来源 */}
            <div>
              <div className="text-gray-500 text-xs mb-0.5">来源</div>
              <div className="text-gray-200">{sourceLabels[photo.source_type] || photo.source_type}</div>
            </div>

            {/* 质量状态 */}
            <div>
              <div className="text-gray-500 text-xs mb-0.5">质量</div>
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-xs ${
                  photo.quality_status === 'ok'
                    ? 'bg-green-800 text-green-200'
                    : photo.quality_status === 'warning'
                      ? 'bg-yellow-800 text-yellow-200'
                      : 'bg-red-800 text-red-200'
                }`}
              >
                {photo.quality_status === 'ok' ? '✅ 正常' : photo.quality_status === 'warning' ? '⚠️ 警告' : '❌ 异常'}
              </span>
              {photo.quality_reason && (
                <div className="text-gray-500 text-xs mt-1">{photo.quality_reason}</div>
              )}
            </div>

            {/* EXIF */}
            <div>
              <div className="text-gray-500 text-xs mb-0.5">EXIF 信息</div>
              <div className="text-gray-200">{photo.exif_has_all ? '✅ 完整' : '⚠️ 缺失'}</div>
            </div>

            {/* dHash */}
            {photo.dhash && (
              <div>
                <div className="text-gray-500 text-xs mb-0.5">感知哈希 (dHash)</div>
                <div className="text-gray-400 font-mono text-xs break-all">{photo.dhash}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
