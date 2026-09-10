/** Agent 工具结果卡片 — 根据工具名渲染不同的结果展示
 *
 * P0-3 增强：所有卡片嵌入缩略图渲染，支持点击预览照片。
 */

import { useState } from 'react'
import type { ToolCallBlock, ToolResult, PhotoBrief } from '../types/agent'

interface Props {
  toolBlock: ToolCallBlock
  result: ToolResult
  onPreviewPhoto?: (photoId: string) => void
}

export default function AgentToolCard({ toolBlock, result, onPreviewPhoto }: Props) {
  const data = result.result as Record<string, unknown> | undefined
  const isError = result.status === 'error' || (data && 'error' in data)

  if (isError) {
    return (
      <div
        style={{
          marginTop: 8,
          padding: '10px 14px',
          borderRadius: 8,
          backgroundColor: '#fee2e2',
          border: '1px solid #fecaca',
          fontSize: 13,
          color: '#991b1b',
        }}
      >
        {data?.error as string || '工具执行出错'}
      </div>
    )
  }

  switch (toolBlock.name) {
    case 'list_projects':
      return <ListProjectsCard data={data} />
    case 'scan_similar_groups':
      return <ScanResultCard data={data} onPreviewPhoto={onPreviewPhoto} />
    case 'suggest_cleanup_plan':
      return <CleanupPlanCard data={data} onPreviewPhoto={onPreviewPhoto} />
    case 'get_photo_detail':
      return <PhotoDetailCard data={data} onPreviewPhoto={onPreviewPhoto} />
    case 'compare_two_photos':
      return <CompareCard data={data} onPreviewPhoto={onPreviewPhoto} />
    case 'execute_cleanup':
      return <ExecuteResultCard data={data} />
    default:
      return (
        <div
          style={{
            marginTop: 8,
            padding: '10px 14px',
            borderRadius: 8,
            backgroundColor: '#f3f4f6',
            fontSize: 12,
            color: '#6b7280',
            maxHeight: 200,
            overflow: 'auto',
          }}
        >
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )
  }
}

/* ═══════════════════════════════════════════════════════════════
 * 通用组件
 * ═══════════════════════════════════════════════════════════════ */

function CardBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 8,
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#f9fafb',
        border: '1px solid #e5e7eb',
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: unknown; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#9ca3af' }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 15, color: color || '#1f2937' }}>
        {String(value ?? '-')}
      </div>
    </div>
  )
}

/** 缩略图组件 — 点击可触发 PhotoViewer 预览 */
function ThumbImg({
  url,
  alt,
  onClick,
  size = 80,
  borderColor,
}: {
  url?: string
  alt: string
  onClick?: () => void
  size?: number
  borderColor?: string
}) {
  const [err, setErr] = useState(false)

  if (err || !url) {
    return (
      <div
        onClick={onClick}
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          backgroundColor: '#f3f4f6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size > 60 ? 28 : 20,
          color: '#d1d5db',
          flexShrink: 0,
          cursor: onClick ? 'pointer' : 'default',
          border: borderColor ? `2px solid ${borderColor}` : undefined,
        }}
      >
        🖼
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onClick={onClick}
      onError={() => setErr(true)}
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        objectFit: 'cover',
        backgroundColor: '#f3f4f6',
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
        border: borderColor ? `2px solid ${borderColor}` : undefined,
      }}
    />
  )
}

/** 将后端数据转为 PhotoBrief */
function asPhotoBrief(obj: Record<string, unknown> | undefined): PhotoBrief {
  if (!obj) return { id: '', original_name: '', file_url: '', thumbnail_url: '' }
  return {
    id: obj.id as string || '',
    original_name: obj.original_name as string || '',
    file_url: obj.file_url as string || '',
    thumbnail_url: obj.thumbnail_url as string || '',
    file_size_mb: obj.file_size_mb as number,
    resolution: obj.resolution as string,
    ai_score_overall: obj.ai_score_overall as number | null,
    source_type_label: obj.source_type_label as string,
    cleanup_status: obj.cleanup_status as string,
    cleanup_reason: obj.cleanup_reason as string,
    exif_datetime_original: obj.exif_datetime_original as string,
  }
}

/* ═══════════════════════════════════════════════════════════════
 * list_projects
 * ═══════════════════════════════════════════════════════════════ */

function ListProjectsCard({ data }: { data?: Record<string, unknown> }) {
  const projects = data?.projects as Array<Record<string, unknown>> | undefined
  return (
    <CardBox>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#374151' }}>
        📂 我的项目（{data?.total as number || 0} 个）
      </div>
      {(projects || []).map((p, i) => (
        <div
          key={p.id as string || i}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 0',
            borderBottom: i < (projects?.length || 0) - 1 ? '1px solid #e5e7eb' : 'none',
          }}
        >
          <span style={{ fontWeight: 500, color: '#1f2937' }}>{p.name as string}</span>
          <span style={{ color: '#6b7280', fontSize: 12 }}>{p.photo_count as number} 张照片</span>
        </div>
      ))}
    </CardBox>
  )
}

/* ═══════════════════════════════════════════════════════════════
 * scan_similar_groups — P0-3 增强：相似组缩略图网格
 * ═══════════════════════════════════════════════════════════════ */

function ScanResultCard({
  data,
  onPreviewPhoto,
}: {
  data?: Record<string, unknown>
  onPreviewPhoto?: (photoId: string) => void
}) {
  const groups = data?.groups as Array<Record<string, unknown>> | undefined

  return (
    <CardBox>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#374151' }}>
        🔍 扫描完成 — 发现 {data?.group_count as number || 0} 组相似照片
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
        <Stat label="相似组" value={data?.group_count as number} />
        <Stat label="可释放" value={`${data?.total_space_saved_mb as number || 0} MB`} />
        <Stat label="建议保留" value={data?.total_keep as number} color="#059669" />
        <Stat label="建议删除" value={data?.total_delete as number} color="#dc2626" />
      </div>
      {groups && groups.length > 0 && (
        <details style={{ fontSize: 12 }} open>
          <summary style={{ cursor: 'pointer', color: '#6366f1', fontWeight: 500 }}>
            查看 {groups.length} 个相似组详情
          </summary>
          <div style={{ marginTop: 8 }}>
            {groups.map((g, i) => {
              const photos = (g.photos as Array<Record<string, unknown>> | undefined) || []
              const count = Math.min(photos.length, 4)
              return (
                <div
                  key={g.group_id as string || i}
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px solid #f3f4f6',
                  }}
                >
                  <div style={{ fontWeight: 500, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>
                      组 {i + 1} · {g.confidence_label as string}
                    </span>
                    <span style={{ color: '#6b7280', fontSize: 11 }}>
                      保留{g.keep_count as number}/删除{g.delete_count as number}
                    </span>
                  </div>

                  {/* 缩略图网格 */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${count}, 1fr)`,
                      gap: 6,
                    }}
                  >
                    {photos.slice(0, 4).map((p, j) => {
                      const pb = asPhotoBrief(p)
                      return (
                        <div key={j} style={{ textAlign: 'center' }}>
                          <ThumbImg
                            url={pb.thumbnail_url}
                            alt={pb.original_name}
                            size={70}
                            borderColor={
                              pb.cleanup_status === 'keep' ? '#059669' :
                              pb.cleanup_status === 'delete' ? '#dc2626' :
                              undefined
                            }
                            onClick={() => onPreviewPhoto?.(pb.id)}
                          />
                          <div style={{ fontSize: 10, marginTop: 2 }}>
                            {pb.cleanup_status === 'keep' ? '✅' : '🗑'}
                            {pb.ai_score_overall != null && (
                              <span style={{ color: '#6366f1' }}>
                                {' '}{pb.ai_score_overall.toFixed(1)}
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 9,
                              color: '#9ca3af',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 70,
                            }}
                          >
                            {pb.original_name}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {photos.length > 4 && (
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                      ...还有 {photos.length - 4} 张
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </details>
      )}
    </CardBox>
  )
}

/* ═══════════════════════════════════════════════════════════════
 * suggest_cleanup_plan — P0-3 + P1-1 增强：缩略图 + 可视化
 * ═══════════════════════════════════════════════════════════════ */

function CleanupPlanCard({
  data,
  onPreviewPhoto,
}: {
  data?: Record<string, unknown>
  onPreviewPhoto?: (photoId: string) => void
}) {
  const summary = data?.summary as Record<string, unknown> | undefined
  const plan = data?.plan as Array<Record<string, unknown>> | undefined

  return (
    <CardBox>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#374151' }}>
        📋 清理计划
      </div>
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
          <Stat label="相似组" value={summary.groups as number} />
          <Stat label="可释放" value={`${summary.space_mb as number || 0} MB`} />
          <Stat label="保留" value={summary.keep as number} color="#059669" />
          <Stat label="删除" value={summary.delete as number} color="#dc2626" />
        </div>
      )}

      {(plan || []).slice(0, 5).map((g, i) => {
        const keepPhotos = (g.keep as Array<Record<string, unknown>>) || []
        const deletePhotos = (g.delete as Array<Record<string, unknown>>) || []
        const allPhotos = [...keepPhotos, ...deletePhotos]

        return (
          <div
            key={i}
            style={{
              padding: '10px 0',
              borderBottom: '1px solid #f3f4f6',
            }}
          >
            {/* 组标题 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
                fontSize: 12,
              }}
            >
              <span style={{ fontWeight: 600 }}>
                组 {i + 1}
              </span>
              <span
                style={{
                  padding: '1px 8px',
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 500,
                  backgroundColor:
                    g.confidence === 'HIGH' ? '#ecfdf5' :
                    g.confidence === 'MEDIUM' ? '#fef3c7' :
                    '#fee2e2',
                  color:
                    g.confidence === 'HIGH' ? '#065f46' :
                    g.confidence === 'MEDIUM' ? '#92400e' :
                    '#991b1b',
                }}
              >
                {g.confidence as string}
              </span>
              <span style={{ color: '#6b7280' }}>{g.action as string}</span>
              <span style={{ color: '#6366f1', fontSize: 11 }}>{g.space_mb as number} MB</span>
            </div>

            {/* 照片缩略图网格 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(allPhotos.length, 4)}, 1fr)`,
                gap: 6,
              }}
            >
              {allPhotos.slice(0, 4).map((p, j) => {
                const pb = asPhotoBrief(p)
                const isKeep = pb.cleanup_status === 'keep'
                return (
                  <div key={j} style={{ textAlign: 'center' }}>
                    <ThumbImg
                      url={pb.thumbnail_url}
                      alt={pb.original_name}
                      size={64}
                      borderColor={isKeep ? '#059669' : '#dc2626'}
                      onClick={() => onPreviewPhoto?.(pb.id)}
                    />
                    <div style={{ fontSize: 10, marginTop: 2 }}>
                      {isKeep ? '✅ 保留' : '🗑 删除'}
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        color: '#9ca3af',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 64,
                      }}
                      title={pb.original_name}
                    >
                      {pb.original_name}
                    </div>
                    {pb.cleanup_reason && (
                      <div style={{ fontSize: 9, color: '#6b7280', marginTop: 1 }}>
                        💡 {pb.cleanup_reason.length > 15
                          ? pb.cleanup_reason.slice(0, 15) + '…'
                          : pb.cleanup_reason}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </CardBox>
  )
}

/* ═══════════════════════════════════════════════════════════════
 * get_photo_detail — P0-3 增强：顶部缩略图
 * ═══════════════════════════════════════════════════════════════ */

function PhotoDetailCard({
  data,
  onPreviewPhoto,
}: {
  data?: Record<string, unknown>
  onPreviewPhoto?: (photoId: string) => void
}) {
  const pb = asPhotoBrief(data)

  return (
    <CardBox>
      {/* 大缩略图 */}
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <ThumbImg
          url={pb.thumbnail_url?.replace('size=200', 'size=400')}
          alt={pb.original_name}
          size={120}
          onClick={() => onPreviewPhoto?.(pb.id)}
        />
      </div>

      <div style={{ fontWeight: 600, marginBottom: 6, color: '#374151' }}>
        📷 {data?.original_name as string}
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div>📏 {data?.resolution as string || '未知'}</div>
        <div>💾 {data?.file_size_mb != null ? `${data.file_size_mb} MB` : '未知'}</div>
        <div>🤖 AI 综合评分: {data?.ai_score_overall != null ? `${(data.ai_score_overall as number).toFixed(1)}/10` : '无'}</div>
        {data?.ai_score_sharpness != null && (
          <div>🔍 清晰度: {(data.ai_score_sharpness as number).toFixed(1)} · 美学: {(data?.ai_score_aesthetic as number)?.toFixed(1) || '-'}</div>
        )}
        <div>📅 {data?.exif_datetime_original as string || '无拍摄时间'}</div>
        <div>🏷 {data?.source_type_label as string || data?.source_type as string || '未知来源'}</div>
        {(data?.exif_make as string) && <div>📱 {String(data?.exif_make)} {String(data?.exif_model)}</div>}
        {(data?.cleanup_reason as string) && (
          <div style={{ color: '#6366f1' }}>💡 {String(data?.cleanup_reason)}</div>
        )}
      </div>
    </CardBox>
  )
}

/* ═══════════════════════════════════════════════════════════════
 * compare_two_photos — P0-3 + P1-2 增强：并排缩略图 + 差异标注
 * ═══════════════════════════════════════════════════════════════ */

/** 对比数据的明确类型接口 */
interface CompareData {
  dhash_distance?: number | null
  verdict?: string | null
  verdict_detail?: string | null
  size_ratio?: number | null
  res_diff_mp?: number | null
  time_diff_seconds?: number | null
  quality_comparison?: { score_a?: number; score_b?: number; difference?: number; winner?: string } | null
  suggestion?: string | null
}

function CompareCard({
  data,
  onPreviewPhoto,
}: {
  data?: Record<string, unknown>
  onPreviewPhoto?: (photoId: string) => void
}) {
  const comp = (data?.comparison ?? {}) as CompareData
  const quality = comp.quality_comparison
  const a = asPhotoBrief(data?.photo_a as Record<string, unknown>)
  const b = asPhotoBrief(data?.photo_b as Record<string, unknown>)

  const verdictColor =
    comp.verdict === '高度相似 — 确认同源' ? '#ecfdf5' :
    comp.verdict === '可能相似 — 建议人工判断' ? '#fef3c7' :
    '#fee2e2'
  const verdictTextColor =
    comp.verdict === '高度相似 — 确认同源' ? '#065f46' :
    comp.verdict === '可能相似 — 建议人工判断' ? '#92400e' :
    '#991b1b'

  return (
    <CardBox>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#374151' }}>
        ⚖️ 对比结果
      </div>

      {/* 判定标签 */}
      <div style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 600,
        marginBottom: 10,
        backgroundColor: verdictColor,
        color: verdictTextColor,
      }}>
        {comp.verdict}
      </div>

      {/* 并排缩略图 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontWeight: 500, color: '#6366f1', fontSize: 12, marginBottom: 4 }}>照片 A</div>
          <ThumbImg
            url={a.thumbnail_url}
            alt={a.original_name}
            size={100}
            onClick={() => onPreviewPhoto?.(a.id)}
            borderColor={
              quality?.winner === 'A' ? '#059669' : undefined
            }
          />
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{a.original_name}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>
            {a.file_size_mb != null ? `${a.file_size_mb} MB` : ''}
            {a.resolution ? ` · ${a.resolution}` : ''}
          </div>
          {a.ai_score_overall != null && (
            <div style={{ fontSize: 11, color: '#6366f1' }}>
              AI 评分: {a.ai_score_overall.toFixed(1)}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', fontSize: 20, color: '#d1d5db' }}>VS</div>

        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontWeight: 500, color: '#6366f1', fontSize: 12, marginBottom: 4 }}>照片 B</div>
          <ThumbImg
            url={b.thumbnail_url}
            alt={b.original_name}
            size={100}
            onClick={() => onPreviewPhoto?.(b.id)}
            borderColor={
              quality?.winner === 'B' ? '#059669' : undefined
            }
          />
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{b.original_name}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>
            {b.file_size_mb != null ? `${b.file_size_mb} MB` : ''}
            {b.resolution ? ` · ${b.resolution}` : ''}
          </div>
          {b.ai_score_overall != null && (
            <div style={{ fontSize: 11, color: '#6366f1' }}>
              AI 评分: {b.ai_score_overall.toFixed(1)}
            </div>
          )}
        </div>
      </div>

      {/* 差异标注 */}
      <CompareDetail comp={comp} />
      {/* 质量对比 */}
      {quality?.winner && (
        <div style={{
          marginTop: 8,
          padding: '6px 10px',
          borderRadius: 8,
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          fontSize: 12,
          color: '#166534',
        }}>
          质量对比: A {String(quality.score_a)} vs B {String(quality.score_b)}
          {quality.winner === 'A' ? ' → A 更优' : quality.winner === 'B' ? ' → B 更优' : ' → 持平'}
        </div>
      )}
    </CardBox>
  )
}

/* ═══════════════════════════════════════════════════════════════
 * execute_cleanup
 * ═══════════════════════════════════════════════════════════════ */

/** 对比详情组件 */
function CompareDetail({ comp }: { comp: CompareData }) {
  const dhashDist = comp.dhash_distance ?? 0
  const hasDhash = comp.dhash_distance != null
  const sizeRatioVal = comp.size_ratio ?? 0
  const hasSize = comp.size_ratio != null
  const resDiffMpVal = comp.res_diff_mp ?? 0
  const hasRes = comp.res_diff_mp != null
  const suggestion = comp.suggestion ?? ''

  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: 8,
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        fontSize: 12,
        lineHeight: 1.8,
      }}
    >
      {hasDhash && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
            <span>相似度</span>
            <span>汉明距离 {dhashDist}</span>
          </div>
          <div style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: '#e5e7eb',
            marginTop: 4,
            marginBottom: 4,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, dhashDist * 3.3)}%`,
              borderRadius: 3,
              backgroundColor:
                dhashDist <= 10 ? '#059669' :
                dhashDist <= 20 ? '#d97706' :
                '#dc2626',
            }} />
          </div>
          <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 6 }}>
            ≤10 高度相似 ｜ 11-20 可能相似 ｜ &gt;20 不相似
          </div>
        </div>
      )}

      {hasSize && (
        <div>
          <span style={{ color: '#6b7280' }}>大小比: </span>
          照片 A 是 B 的 {sizeRatioVal.toFixed(1)} 倍
        </div>
      )}
      {hasRes && (
        <div>
          <span style={{ color: '#6b7280' }}>分辨率差: </span>
          {resDiffMpVal} MP
        </div>
      )}
      {suggestion && (
        <div style={{
          marginTop: 6,
          padding: '4px 8px',
          borderRadius: 6,
          backgroundColor: '#eff6ff',
          color: '#1e40af',
          fontSize: 11,
        }}>
          📋 {suggestion}
        </div>
      )}
    </div>
  )
}

function ExecuteResultCard({ data }: { data?: Record<string, unknown> }) {
  const summary = data?.summary as Record<string, unknown> | undefined
  return (
    <CardBox>
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#374151' }}>
        🗑 清理执行完成
      </div>
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <Stat label="已删除" value={summary.deleted_count as number} color="#dc2626" />
          <Stat label="释放空间" value={`${summary.space_freed_mb as number || 0} MB`} />
          <Stat label="失败" value={summary.failed_count as number} color="#d97706" />
          <Stat label="操作前/后" value={`${summary.photo_count_before as number}→${summary.photo_count_after as number}`} />
        </div>
      )}
    </CardBox>
  )
}
