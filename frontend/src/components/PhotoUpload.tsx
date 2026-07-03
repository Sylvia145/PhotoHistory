import { useState, useRef } from 'react'
import { photosApi } from '../api/client'

interface Props {
  projectId: string
  onUploaded: () => void
}

interface UploadItem {
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

export default function PhotoUpload({ projectId, onUploaded }: Props) {
  const [items, setItems] = useState<UploadItem[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const newItems: UploadItem[] = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .map((f) => ({ file: f, status: 'pending' as const }))
    setItems((prev) => [...prev, ...newItems])
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    addFiles(e.dataTransfer.files)
  }

  const uploadAll = async () => {
    const pending = items.filter((i) => i.status === 'pending')
    if (pending.length === 0) return

    // 逐张上传，以便追踪每张的状态
    for (let i = 0; i < items.length; i++) {
      if (items[i].status !== 'pending') continue
      setItems((prev) => prev.map((item, idx) =>
        idx === i ? { ...item, status: 'uploading' as const } : item
      ))
      try {
        await photosApi.upload(projectId, [items[i].file])
        setItems((prev) => prev.map((item, idx) =>
          idx === i ? { ...item, status: 'success' as const } : item
        ))
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '上传失败'
        setItems((prev) => prev.map((item, idx) =>
          idx === i ? { ...item, status: 'error' as const, error: msg } : item
        ))
      }
    }

    onUploaded()
  }

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h3 className="font-semibold mb-4">上传照片</h3>

      {/* 拖拽区域 */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition"
      >
        <p className="text-3xl mb-2">📤</p>
        <p className="text-gray-500">拖拽照片到此处，或点击选择文件</p>
        <p className="text-xs text-gray-400 mt-1">支持批量上传 · 单文件最大 50MB</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {/* 上传队列 */}
      {items.length > 0 && (
        <div className="mt-4 space-y-2">
          {items.map((item, idx) => (
            <div
              key={idx}
              className={`flex items-center justify-between px-3 py-2 rounded text-sm ${
                item.status === 'error' ? 'bg-red-50' :
                item.status === 'success' ? 'bg-green-50' : 'bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span>
                  {item.status === 'uploading' && '⏳'}
                  {item.status === 'success' && '✅'}
                  {item.status === 'error' && '❌'}
                  {item.status === 'pending' && '📄'}
                </span>
                <span className="truncate">{item.file.name}</span>
                <span className="text-gray-400 text-xs">
                  {(item.file.size / 1024 / 1024).toFixed(1)} MB
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {item.error && (
                  <span className="text-red-500 text-xs">{item.error}</span>
                )}
                {item.status === 'pending' && (
                  <button onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-500">
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}

          <button
            onClick={uploadAll}
            disabled={!items.some((i) => i.status === 'pending')}
            className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            开始上传
          </button>
        </div>
      )}

      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
        💡 微信传输时请勾选「原图」，压缩图将被自动拒绝
      </div>
    </div>
  )
}
