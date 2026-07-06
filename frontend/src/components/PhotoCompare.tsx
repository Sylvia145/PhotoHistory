import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Photo } from '../types'

interface Props {
  photos: [Photo, Photo]
  onClose: () => void
}

type CompareMode = 'side-by-side' | 'overlay'

function formatSize(bytes: number): string {
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024).toFixed(0) + ' KB'
}

export default function PhotoCompare({ photos, onClose }: Props) {
  const [mode, setMode] = useState<CompareMode>('side-by-side')
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [sliderPos, setSliderPos] = useState(50) // overlay 分割百分比
  const [isDragging, setIsDragging] = useState(false)
  const [imgALoaded, setImgALoaded] = useState(false)
  const [imgBLoaded, setImgBLoaded] = useState(false)
  const [imgAError, setImgAError] = useState(false)
  const [imgBError, setImgBError] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  // 切换模式时重置
  useEffect(() => {
    setScale(1)
    setPan({ x: 0, y: 0 })
    setSliderPos(50)
  }, [mode])

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'Tab':
          e.preventDefault()
          setMode((m) => (m === 'side-by-side' ? 'overlay' : 'side-by-side'))
          break
        case '+':
        case '=':
          setScale((s) => Math.min(10, s * 1.5))
          break
        case '-':
          setScale((s) => Math.max(0.1, s / 1.5))
          break
        case '0':
          setScale(1)
          setPan({ x: 0, y: 0 })
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // 滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 1 / 1.3 : 1.3
    setScale((s) => Math.max(0.1, Math.min(10, s * delta)))
  }, [])

  // 平移拖拽
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (scale <= 1) return
      setIsDragging(true)
      dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    },
    [scale, pan],
  )

  useEffect(() => {
    if (!isDragging) return
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy })
    }
    const handleUp = () => setIsDragging(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isDragging])

  // Overlay 滑块拖拽
  const handleSliderDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const startX = e.clientX
    const startPos = sliderPos
    const containerWidth = (e.target as HTMLElement).closest('.compare-container')?.clientWidth || window.innerWidth

    const handleMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const newPos = Math.max(5, Math.min(95, startPos + (dx / containerWidth) * 100))
      setSliderPos(newPos)
    }
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [sliderPos])

  const [a, b] = photos
  const transformStr = scale !== 1 || pan.x !== 0 || pan.y !== 0
    ? `scale(${scale}) translate(${pan.x / scale}px, ${pan.y / scale}px)`
    : 'none'

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
      zIndex: 10000, display: 'flex', flexDirection: 'column',
    }}>
      {/* 顶部工具栏 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        background: 'linear-gradient(rgba(0,0,0,0.7), transparent)',
        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        {/* 照片名称 */}
        <span style={{ color: '#fff', fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          🅰 {a.original_name}
        </span>
        <span style={{ color: '#888' }}>vs</span>
        <span style={{ color: '#fff', fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          🅱 {b.original_name}
        </span>

        <div style={{ flex: 1 }} />

        {/* 模式切换 */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.1)', borderRadius: 6, overflow: 'hidden' }}>
          <button
            onClick={() => setMode('side-by-side')}
            style={{
              padding: '4px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
              background: mode === 'side-by-side' ? 'rgba(255,255,255,0.25)' : 'transparent',
              color: '#fff', transition: 'background 0.15s',
            }}
          >
            左右并排
          </button>
          <button
            onClick={() => setMode('overlay')}
            style={{
              padding: '4px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
              background: mode === 'overlay' ? 'rgba(255,255,255,0.25)' : 'transparent',
              color: '#fff', transition: 'background 0.15s',
            }}
          >
            滑动叠加
          </button>
        </div>

        {/* 缩放控制 */}
        <span style={{ color: '#aaa', fontSize: 12 }}>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(10, s * 1.5))} style={toolBtnStyle}>+</button>
        <button onClick={() => setScale(s => Math.max(0.1, s / 1.5))} style={toolBtnStyle}>−</button>
        <button onClick={() => { setScale(1); setPan({ x: 0, y: 0 }) }} style={toolBtnStyle}>⟲</button>

        <button onClick={onClose} style={{ ...toolBtnStyle, fontSize: 18, padding: '4px 10px' }}>✕</button>
      </div>

      {/* 图片区域 */}
      <div
        className="compare-container"
        style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
      >
        {mode === 'side-by-side' ? (
          /* 左右并排模式 */
          <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            {/* 左图 */}
            <div style={{ flex: 1, position: 'relative', borderRight: '1px solid rgba(255,255,255,0.15)', overflow: 'hidden' }}>
              <div style={{
                width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transform: transformStr, transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
              }}>
                {!imgALoaded && !imgAError && <span style={{ color: '#888', fontSize: 14 }}>加载中...</span>}
                {imgAError && <span style={{ color: '#888' }}>🖼 图片加载失败</span>}
                <img
                  src={`/api/photos/${a.id}/file`}
                  alt={a.original_name}
                  style={{
                    maxWidth: '90%', maxHeight: '85vh', objectFit: 'contain',
                    display: imgALoaded ? 'block' : 'none', pointerEvents: 'none',
                  }}
                  onLoad={() => setImgALoaded(true)}
                  onError={() => setImgAError(true)}
                />
              </div>
              <span style={{ position: 'absolute', bottom: 8, left: 12, color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>🅰</span>
            </div>

            {/* 右图 */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <div style={{
                width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transform: transformStr, transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
              }}>
                {!imgBLoaded && !imgBError && <span style={{ color: '#888', fontSize: 14 }}>加载中...</span>}
                {imgBError && <span style={{ color: '#888' }}>🖼 图片加载失败</span>}
                <img
                  src={`/api/photos/${b.id}/file`}
                  alt={b.original_name}
                  style={{
                    maxWidth: '90%', maxHeight: '85vh', objectFit: 'contain',
                    display: imgBLoaded ? 'block' : 'none', pointerEvents: 'none',
                  }}
                  onLoad={() => setImgBLoaded(true)}
                  onError={() => setImgBError(true)}
                />
              </div>
              <span style={{ position: 'absolute', bottom: 8, right: 12, color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>🅱</span>
            </div>
          </div>
        ) : (
          /* 滑动叠加模式 */
          <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            {/* 底层: 照片 B (完整显示) */}
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#111',
            }}>
              {!imgBLoaded && !imgBError && <span style={{ color: '#888' }}>加载中...</span>}
              {imgBError && <span style={{ color: '#888' }}>🖼 图片加载失败</span>}
              <img
                src={`/api/photos/${b.id}/file`}
                alt={b.original_name}
                style={{ maxWidth: '95%', maxHeight: '85vh', objectFit: 'contain', display: imgBLoaded ? 'block' : 'none', pointerEvents: 'none' }}
                onLoad={() => setImgBLoaded(true)}
                onError={() => setImgBError(true)}
              />
              <span style={{ position: 'absolute', bottom: 8, right: 12, color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>🅱 底层</span>
            </div>

            {/* 上层: 照片 A (clip 显示) */}
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              clipPath: `inset(0 ${100 - sliderPos}% 0 0)`, background: '#1a1a1a',
            }}>
              {!imgALoaded && !imgAError && <span style={{ color: '#888' }}>加载中...</span>}
              {imgAError && <span style={{ color: '#888' }}>🖼 图片加载失败</span>}
              <img
                src={`/api/photos/${a.id}/file`}
                alt={a.original_name}
                style={{ maxWidth: '95%', maxHeight: '85vh', objectFit: 'contain', display: imgALoaded ? 'block' : 'none', pointerEvents: 'none' }}
                onLoad={() => setImgALoaded(true)}
                onError={() => setImgAError(true)}
              />
              <span style={{ position: 'absolute', bottom: 8, left: 12, color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>🅰 上层</span>
            </div>

            {/* 可拖拽分割线 */}
            <div
              style={{
                position: 'absolute', top: 0, bottom: 0, left: `${sliderPos}%`,
                width: 3, marginLeft: -1.5, background: '#fff',
                boxShadow: '0 0 8px rgba(0,0,0,0.5)', cursor: 'ew-resize', zIndex: 5,
              }}
              onMouseDown={handleSliderDown}
            >
              {/* 手柄 */}
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: 36, height: 36, borderRadius: '50%', background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)', cursor: 'ew-resize',
              }}>
                <span style={{ fontSize: 16, color: '#555' }}>⟷</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部信息栏 */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
        padding: '16px 24px 20px', display: 'flex', gap: 24, justifyContent: 'center',
      }}>
        <CompareCell label="文件名" valueA={a.original_name} valueB={b.original_name} />
        <CompareCell label="文件大小" valueA={formatSize(a.file_size)} valueB={formatSize(b.file_size)} />
        <CompareCell
          label="分辨率"
          valueA={a.resolution_w ? `${a.resolution_w}×${a.resolution_h}` : '未知'}
          valueB={b.resolution_w ? `${b.resolution_w}×${b.resolution_h}` : '未知'}
        />
        <CompareCell
          label="拍摄时间"
          valueA={a.exif_datetime_original?.split('T')[0] || '无'}
          valueB={b.exif_datetime_original?.split('T')[0] || '无'}
        />
        <CompareCell label="设备" valueA={a.exif_model || '无'} valueB={b.exif_model || '无'} />
        <CompareCell
          label="EXIF"
          valueA={a.exif_has_all ? '✅ 完整' : '⚠️ 缺失'}
          valueB={b.exif_has_all ? '✅ 完整' : '⚠️ 缺失'}
        />
      </div>
    </div>,
    document.body,
  )
}

function CompareCell({ label, valueA, valueB }: { label: string; valueA: string; valueB: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 80 }}>
      <div style={{ color: '#888', fontSize: 10, marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: '#e5e7eb', fontSize: 12, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={valueA}>
        🅰 {valueA}
      </div>
      <div style={{ color: '#d1d5db', fontSize: 12, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={valueB}>
        🅱 {valueB}
      </div>
    </div>
  )
}

const toolBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none',
  padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 14,
  transition: 'background 0.15s',
}
