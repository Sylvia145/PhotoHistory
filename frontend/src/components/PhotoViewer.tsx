import { useEffect, useCallback, useState, useRef } from 'react'
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
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const imgContainerRef = useRef<HTMLDivElement>(null)

  const photo = photos[currentIndex]

  // 切照片 / 关闭时重置缩放状态
  useEffect(() => {
    setImgLoaded(false)
    setImgError(false)
    setScale(1)
    setPan({ x: 0, y: 0 })
  }, [currentIndex])

  // 键盘快捷键
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowLeft':
          if (currentIndex > 0) onNavigate(currentIndex - 1)
          break
        case 'ArrowRight':
          if (currentIndex < photos.length - 1) onNavigate(currentIndex + 1)
          break
        case '+':
        case '=':
          setScale((s) => Math.min(s * 1.5, 10))
          break
        case '-':
          setScale((s) => Math.max(s / 1.5, 0.1))
          break
        case '0':
          setScale(1)
          setPan({ x: 0, y: 0 })
          break
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

  // 鼠标滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation()
    const delta = e.deltaY > 0 ? 1 / 1.3 : 1.3
    setScale((s) => Math.max(0.1, Math.min(10, s * delta)))
  }, [])

  // 拖拽平移（缩放 > 1 时）
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (scale <= 1) return
      e.stopPropagation()
      setIsDragging(true)
      dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    },
    [scale, pan],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return
      setPan({
        x: dragStart.current.panX + (e.clientX - dragStart.current.x),
        y: dragStart.current.panY + (e.clientY - dragStart.current.y),
      })
    },
    [isDragging],
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // 缩放复位
  const resetZoom = useCallback(() => {
    setScale(1)
    setPan({ x: 0, y: 0 })
  }, [])

  if (!photo) return null

  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < photos.length - 1

  return (
    <div className="fixed inset-0 z-50 bg-black/92" onClick={onClose}>
      {/* ===== 顶部工具栏 ===== */}
      <div
        className="absolute top-0 left-0 right-0 h-12 flex items-center justify-between px-4 z-20 bg-gradient-to-b from-black/60 to-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 左侧：计数器 */}
        <span className="text-white/70 text-sm select-none">
          {currentIndex + 1} / {photos.length}
        </span>

        {/* 中间：缩放控制 */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setScale((s) => Math.max(s / 1.5, 0.1))}
            disabled={scale <= 0.1}
            className="text-white/70 hover:text-white disabled:opacity-30 w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition text-lg select-none"
            title="缩小 (-)"
          >
            −
          </button>
          <span className="text-white/60 text-xs w-12 text-center select-none">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(s * 1.5, 10))}
            disabled={scale >= 10}
            className="text-white/70 hover:text-white disabled:opacity-30 w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition text-lg select-none"
            title="放大 (+)"
          >
            +
          </button>
          {scale !== 1 && (
            <button
              onClick={resetZoom}
              className="text-white/50 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/10 transition select-none"
              title="复位 (0)"
            >
              复位
            </button>
          )}
        </div>

        {/* 右侧：关闭按钮 */}
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition text-xl select-none"
          title="关闭 (ESC)"
        >
          ✕
        </button>
      </div>

      {/* ===== 导航箭头 ===== */}
      {hasPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNavigate(currentIndex - 1)
          }}
          className="absolute left-0 top-1/2 -translate-y-1/2 text-white/60 hover:text-white z-20 w-14 h-24 flex items-center justify-center hover:bg-white/5 transition select-none"
          title="上一张 (←)"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNavigate(currentIndex + 1)
          }}
          className="absolute right-0 top-1/2 -translate-y-1/2 text-white/60 hover:text-white z-20 w-14 h-24 flex items-center justify-center hover:bg-white/5 transition select-none"
          title="下一张 (→)"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* ===== 主要内容区 ===== */}
      <div
        className="flex h-full items-center justify-center px-16"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 图片区域 */}
        <div
          ref={imgContainerRef}
          className={`flex items-center justify-center min-w-0 ${scale > 1 ? 'cursor-grab' : ''} ${isDragging ? 'cursor-grabbing' : ''}`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ overflow: 'hidden' }}
        >
          {/* 加载中 */}
          {!imgLoaded && !imgError && (
            <div className="text-white/40 text-lg animate-pulse select-none">加载中...</div>
          )}

          {/* 加载失败 */}
          {imgError && (
            <div className="text-white/40 text-center p-8 select-none">
              <div className="text-5xl mb-2">🖼</div>
              <div className="text-sm">图片加载失败</div>
            </div>
          )}

          <img
            src={`/api/projects/photos/${photo.id}/file`}
            alt={photo.original_name}
            className="max-w-full max-h-[94vh] object-contain select-none"
            style={{
              transform: `scale(${scale}) translate(${pan.x / scale}px, ${pan.y / scale}px)`,
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              display: imgLoaded ? 'block' : 'none',
            }}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            draggable={false}
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* 信息面板 */}
        <div className="w-64 bg-gray-900/90 rounded-r-lg p-4 text-white text-sm overflow-y-auto shrink-0 max-h-[94vh] ml-2 hidden lg:block">
          <h3 className="font-bold text-base mb-3 break-all" title={photo.original_name}>
            {photo.original_name}
          </h3>

          <div className="space-y-2.5">
            <div>
              <div className="text-gray-500 text-xs mb-0.5">拍摄时间</div>
              <div className="text-gray-200">
                {photo.exif_datetime_original
                  ? photo.exif_datetime_original.replace('T', ' ')
                  : '无'}
              </div>
            </div>

            <div>
              <div className="text-gray-500 text-xs mb-0.5">分辨率</div>
              <div className="text-gray-200">
                {photo.resolution_w && photo.resolution_h
                  ? `${photo.resolution_w} × ${photo.resolution_h}`
                  : '未知'}
              </div>
            </div>

            <div>
              <div className="text-gray-500 text-xs mb-0.5">文件大小</div>
              <div className="text-gray-200">{formatSize(photo.file_size)}</div>
            </div>

            {photo.exif_make && (
              <div>
                <div className="text-gray-500 text-xs mb-0.5">拍摄设备</div>
                <div className="text-gray-200">
                  {[photo.exif_make, photo.exif_model].filter(Boolean).join(' ')}
                </div>
              </div>
            )}

            <div>
              <div className="text-gray-500 text-xs mb-0.5">来源</div>
              <div className="text-gray-200">{sourceLabels[photo.source_type] || photo.source_type}</div>
            </div>

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

            <div>
              <div className="text-gray-500 text-xs mb-0.5">EXIF 信息</div>
              <div className="text-gray-200">{photo.exif_has_all ? '✅ 完整' : '⚠️ 缺失'}</div>
            </div>

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
