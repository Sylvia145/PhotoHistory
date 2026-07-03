import { useEffect, useCallback, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
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

  const photo = photos[currentIndex]

  // 切照片时重置
  useEffect(() => {
    setImgLoaded(false)
    setImgError(false)
    setScale(1)
    setPan({ x: 0, y: 0 })
  }, [currentIndex])

  // 键盘快捷键
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // 如果焦点在输入框里，不拦截
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (currentIndex > 0) onNavigate(currentIndex - 1)
          break
        case 'ArrowRight':
          e.preventDefault()
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

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  // 滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const delta = e.deltaY > 0 ? 1 / 1.3 : 1.3
    setScale((s) => Math.max(0.1, Math.min(10, s * delta)))
  }, [])

  // 拖拽平移
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (scale <= 1) return
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
      dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    },
    [scale, pan],
  )

  useEffect(() => {
    if (!isDragging) return
    const handleMove = (e: MouseEvent) => {
      setPan({
        x: dragStart.current.panX + (e.clientX - dragStart.current.x),
        y: dragStart.current.panY + (e.clientY - dragStart.current.y),
      })
    }
    const handleUp = () => setIsDragging(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isDragging])

  const resetZoom = useCallback(() => {
    setScale(1)
    setPan({ x: 0, y: 0 })
  }, [])

  if (!photo) return null

  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < photos.length - 1

  const content = (
    <div
      className="fixed inset-0"
      style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.93)' }}
      onClick={onClose}
    >
      {/* ===== 顶部工具栏 ===== */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 20,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)',
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, userSelect: 'none' }}>
          {currentIndex + 1} / {photos.length}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setScale((s) => Math.max(s / 1.5, 0.1))}
            disabled={scale <= 0.1}
            style={toolBtnStyle(scale <= 0.1)}
            title="缩小"
          >
            −
          </button>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, width: 44, textAlign: 'center', userSelect: 'none' }}>
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(s * 1.5, 10))}
            disabled={scale >= 10}
            style={toolBtnStyle(scale >= 10)}
            title="放大"
          >
            +
          </button>
          {scale !== 1 && (
            <button onClick={resetZoom} style={{ ...toolBtnStyle(false), fontSize: 12, padding: '2px 6px' }}>
              复位
            </button>
          )}
        </div>

        <button onClick={onClose} style={toolBtnStyle(false)} title="关闭 (ESC)">
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
          style={navBtnStyle('left')}
          title="上一张"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15,19 8,12 15,5" />
          </svg>
        </button>
      )}

      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNavigate(currentIndex + 1)
          }}
          style={navBtnStyle('right')}
          title="下一张"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9,5 16,12 9,19" />
          </svg>
        </button>
      )}

      {/* ===== 内容区 ===== */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          paddingLeft: 80,
          paddingRight: 80,
        }}
      >
        {/* 图片 */}
        <div
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
          }}
        >
          {!imgLoaded && !imgError && (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18, userSelect: 'none' }}>加载中...</div>
          )}
          {imgError && (
            <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', userSelect: 'none' }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🖼</div>
              <div style={{ fontSize: 14 }}>图片加载失败</div>
            </div>
          )}
          <img
            src={`/api/projects/photos/${photo.id}/file`}
            alt={photo.original_name}
            style={{
              maxWidth: '100%',
              maxHeight: '94vh',
              objectFit: 'contain',
              display: imgLoaded ? 'block' : 'none',
              transform: `scale(${scale}) translate(${pan.x / scale}px, ${pan.y / scale}px)`,
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            draggable={false}
          />
        </div>

        {/* 信息面板 */}
        <div
          style={{
            width: 256,
            backgroundColor: 'rgba(17,24,39,0.9)',
            borderTopRightRadius: 8,
            borderBottomRightRadius: 8,
            padding: 16,
            color: 'white',
            fontSize: 14,
            overflowY: 'auto',
            flexShrink: 0,
            maxHeight: '94vh',
            marginLeft: 8,
          }}
          className="hidden lg:block"
        >
          <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 12, wordBreak: 'break-all' }}>
            {photo.original_name}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <InfoRow label="拍摄时间" value={photo.exif_datetime_original?.replace('T', ' ') || '无'} />
            <InfoRow
              label="分辨率"
              value={photo.resolution_w && photo.resolution_h ? `${photo.resolution_w} × ${photo.resolution_h}` : '未知'}
            />
            <InfoRow label="文件大小" value={formatSize(photo.file_size)} />
            {photo.exif_make && (
              <InfoRow label="拍摄设备" value={[photo.exif_make, photo.exif_model].filter(Boolean).join(' ')} />
            )}
            <InfoRow label="来源" value={sourceLabels[photo.source_type] || photo.source_type} />
            <div>
              <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 2 }}>质量</div>
              <span
                style={{
                  display: 'inline-block',
                  padding: '1px 6px',
                  borderRadius: 4,
                  fontSize: 12,
                  ...(photo.quality_status === 'ok'
                    ? { backgroundColor: '#166534', color: '#bbf7d0' }
                    : photo.quality_status === 'warning'
                      ? { backgroundColor: '#854d0e', color: '#fef08a' }
                      : { backgroundColor: '#991b1b', color: '#fecaca' }),
                }}
              >
                {photo.quality_status === 'ok' ? '✅ 正常' : photo.quality_status === 'warning' ? '⚠️ 警告' : '❌ 异常'}
              </span>
              {photo.quality_reason && (
                <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>{photo.quality_reason}</div>
              )}
            </div>
            <InfoRow label="EXIF 信息" value={photo.exif_has_all ? '✅ 完整' : '⚠️ 缺失'} />
            {photo.dhash && (
              <div>
                <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 2 }}>感知哈希 (dHash)</div>
                <div style={{ color: '#9ca3af', fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                  {photo.dhash}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 2 }}>{label}</div>
      <div style={{ color: '#e5e7eb' }}>{value}</div>
    </div>
  )
}

function toolBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    background: 'none',
    border: 'none',
    color: disabled ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.7)',
    fontSize: 18,
    cursor: disabled ? 'default' : 'pointer',
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    userSelect: 'none',
  }
}

function navBtnStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    [side]: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    width: 56,
    height: 96,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    color: 'rgba(255,255,255,0.6)',
    userSelect: 'none',
  }
}
