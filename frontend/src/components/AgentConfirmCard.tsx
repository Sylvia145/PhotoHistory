/** Agent 确认卡片 — 破坏性操作（删除照片）的用户确认门
 *
 * P0-3 增强：渲染待删照片缩略图网格，让用户"看到"即将删除的每张照片。
 */

import { useState, useEffect, useRef } from 'react'
import type { ConfirmRequiredData, PhotoBrief } from '../types/agent'

interface Props {
  data: ConfirmRequiredData
  onConfirm: (confirmed: boolean) => void
  timeout?: number
}

export default function AgentConfirmCard({ data, onConfirm, timeout = 120 }: Props) {
  const [countdown, setCountdown] = useState(timeout)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          onConfirm(false) // 超时自动取消
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [timeout, onConfirm])

  const photos = data.details || []

  return (
    <div
      style={{
        marginTop: 8,
        padding: 14,
        borderRadius: 10,
        backgroundColor: '#fef2f2',
        border: '2px solid #fecaca',
      }}
    >
      {/* 标题 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>⚠️</span>
        <div>
          <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 14, marginBottom: 4 }}>
            确认删除操作
          </div>
          <div style={{ fontSize: 13, color: '#7f1d1d', lineHeight: 1.5 }}>
            {data.summary}
          </div>
        </div>
      </div>

      {/* 待删照片缩略图网格 */}
      {photos.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#7f1d1d', marginBottom: 8 }}>
            📸 即将删除 {photos.length} 张照片：
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(photos.length, 3)}, 1fr)`,
              gap: 8,
            }}
          >
            {photos.map((p, i) => (
              <ThumbnailCard key={p.id || i} photo={p} />
            ))}
          </div>
        </div>
      )}

      {/* 操作区 */}
      <div
        style={{
          padding: '8px 0',
          borderTop: '1px solid #fecaca',
          borderBottom: '1px solid #fecaca',
          marginBottom: 10,
          fontSize: 12,
          color: '#7f1d1d',
        }}
      >
        📊 将释放 {data.total_size_mb != null ? `${data.total_size_mb} MB` : '未知'} 空间
        <span style={{ display: 'block', color: '#9ca3af', marginTop: 2 }}>
          🔄 可在 30 分钟内从回收站恢复（即将推出）
        </span>
      </div>

      {/* 按钮 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            if (timerRef.current) clearInterval(timerRef.current)
            onConfirm(true)
          }}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: '#dc2626',
            color: '#fff',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          ✅ 确认删除 ({data.count || photos.length}张)
        </button>
        <button
          onClick={() => {
            if (timerRef.current) clearInterval(timerRef.current)
            onConfirm(false)
          }}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            backgroundColor: '#fff',
            color: '#374151',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          ❌ 取消
        </button>
      </div>

      <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: '#9ca3af' }}>
        {countdown > 0 ? `⏱ ${countdown} 秒后自动取消` : '已自动取消'}
      </div>
    </div>
  )
}

/** 单张缩略图卡片 */
function ThumbnailCard({ photo }: { photo: PhotoBrief }) {
  const [imgError, setImgError] = useState(false)

  return (
    <div
      style={{
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
      }}
    >
      {/* 缩略图 */}
      <div
        style={{
          width: '100%',
          aspectRatio: '1',
          backgroundColor: '#f3f4f6',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!imgError ? (
          <img
            src={photo.thumbnail_url}
            alt={photo.original_name}
            loading="lazy"
            onError={() => setImgError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <span style={{ fontSize: 24, color: '#d1d5db' }}>🖼</span>
        )}
      </div>

      {/* 信息 */}
      <div style={{ padding: '6px 8px', fontSize: 11, lineHeight: 1.4 }}>
        <div
          style={{
            fontWeight: 500,
            color: '#1f2937',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={photo.original_name}
        >
          {photo.original_name}
        </div>
        <div style={{ color: '#9ca3af' }}>
          {photo.file_size_mb != null ? `${photo.file_size_mb} MB` : ''}
          {photo.resolution ? ` · ${photo.resolution}` : ''}
        </div>
        {photo.ai_score_overall != null && (
          <div style={{ color: '#6366f1', fontSize: 10 }}>
            AI 评分: {photo.ai_score_overall.toFixed(1)}
          </div>
        )}
        {photo.cleanup_reason && (
          <div style={{ color: '#6b7280', fontSize: 10, marginTop: 1 }}>
            💡 {photo.cleanup_reason}
          </div>
        )}
      </div>
    </div>
  )
}
