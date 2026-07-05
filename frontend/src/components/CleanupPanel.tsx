import type { CleanupScanResult, CleanupExecuteResult } from '../types'

interface Props {
  result: CleanupScanResult | null
  onExecute: () => void
  onReset: () => void
  executing: boolean
  executeResult: CleanupExecuteResult | null
}

function formatSize(bytes: number): string {
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024).toFixed(0) + ' KB'
}

export default function CleanupPanel({
  result,
  onExecute,
  onReset,
  executing,
  executeResult,
}: Props) {
  // 已完成状态
  if (executeResult) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
        <p className="text-3xl mb-2">✅</p>
        <p className="text-lg font-semibold text-green-700">清理完成</p>
        <p className="text-sm text-green-600 mt-1">
          已删除 {executeResult.deleted_count} 张照片，
          释放 {formatSize(executeResult.space_freed)} 空间
        </p>
        {executeResult.failed_count > 0 && (
          <p className="text-sm text-amber-600 mt-1">
            {executeResult.failed_count} 张删除失败，请重试
          </p>
        )}
      </div>
    )
  }

  // 无扫描结果
  if (!result || result.groups.length === 0) {
    return null
  }

  // 清理计划
  return (
    <div className="bg-white rounded-lg shadow-sm border p-4 sticky top-4">
      <h3 className="font-semibold mb-3">📋 清理计划</h3>

      <div className="space-y-1.5 text-sm mb-4">
        <div className="flex justify-between">
          <span className="text-gray-500">相似组</span>
          <strong>{result.group_count}</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">保留</span>
          <strong className="text-green-600">{result.total_keep} 张</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">删除</span>
          <strong className="text-red-500">{result.total_delete} 张</strong>
        </div>
        <div className="flex justify-between border-t pt-1.5 mt-1.5">
          <span className="text-gray-500">预计释放</span>
          <strong className="text-indigo-600">
            {formatSize(result.total_space_saved)}
          </strong>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onExecute}
          disabled={executing || result.total_delete === 0}
          className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {executing ? '执行中...' : `确认删除 (${result.total_delete} 张)`}
        </button>
        <button
          onClick={onReset}
          disabled={executing}
          className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50 transition"
        >
          重置
        </button>
      </div>

      <p className="text-xs text-gray-400 mt-2">
        💡 点击照片可预览，点击 ✅/🗑 可切换保留/删除
      </p>
    </div>
  )
}
