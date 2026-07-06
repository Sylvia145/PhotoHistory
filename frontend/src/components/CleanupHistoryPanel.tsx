import { useState, useEffect } from 'react'
import { cleanupApi } from '../api/client'
import type { CleanupHistoryRecord } from '../types'

interface Props {
  projectId: string
}

function formatSize(bytes: number): string {
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024).toFixed(0) + ' KB'
}

function formatDate(iso: string | null): string {
  if (!iso) return '未知'
  try {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function CleanupHistoryPanel({ projectId }: Props) {
  const [records, setRecords] = useState<CleanupHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const res = await cleanupApi.history(projectId)
      setRecords(res.data || [])
    } catch {
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const handleExport = async (historyId: string) => {
    try {
      const res = await cleanupApi.exportReport(projectId, historyId)
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cleanup_report_${historyId.slice(0, 8)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('导出失败')
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400 py-2">加载清理历史...</p>
  }

  if (records.length === 0) {
    return (
      <div className="text-sm text-gray-400 text-center py-6">
        <p>暂无清理记录</p>
        <p className="text-xs mt-1">执行清理后会自动记录</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="font-semibold">📋 清理历史</h3>
        <span className="text-xs text-gray-400">{records.length} 次记录</span>
      </div>
      <div className="divide-y">
        {records.map((r) => (
          <div key={r.id}>
            <div
              className="p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition"
              onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
            >
              {/* 时间 + 概要 */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{formatDate(r.executed_at)}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  删除 <strong className="text-red-500">{r.deleted_count}</strong> 张 ·
                  释放 <strong className="text-indigo-500">{formatSize(r.space_freed)}</strong> ·
                  从 {r.photo_count_before} 张 → {r.photo_count_after} 张
                </div>
              </div>

              {/* 操作按钮 */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleExport(r.id)
                }}
                className="text-xs px-2 py-1 bg-gray-100 hover:bg-indigo-100 hover:text-indigo-700 rounded transition shrink-0"
                title="导出报告"
              >
                📥 导出
              </button>
              <span className="text-gray-300 text-sm shrink-0">
                {expandedId === r.id ? '▾' : '▸'}
              </span>
            </div>

            {/* 展开详情 */}
            {expandedId === r.id && r.details && r.details.length > 0 && (
              <div className="px-4 pb-3 bg-gray-50">
                <div className="text-xs text-gray-500 mb-2">已删除照片：</div>
                <div className="space-y-1">
                  {r.details.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="truncate text-gray-600" title={d.original_name}>
                        🗑 {d.original_name}
                      </span>
                      <span className="text-gray-400 shrink-0 ml-2">
                        {d.file_size ? formatSize(d.file_size) : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
