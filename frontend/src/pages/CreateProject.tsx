import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { projectsApi } from '../api/client'

export default function CreateProject() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError(null)
    try {
      const res = await projectsApi.create({ name: name.trim(), description: description.trim() || undefined })
      navigate(`/projects/${res.data.id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '创建失败')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link to="/" className="text-sm text-indigo-600 hover:underline mb-4 inline-block">
        ◀ 返回项目列表
      </Link>
      <h1 className="text-2xl font-bold mb-6">新建项目</h1>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            项目名称 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            required
            placeholder="例如：咖啡馆探店修图"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">描述（可选）</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="简单描述这个项目的修图目标..."
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none resize-none"
          />
        </div>

        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
          <p>💡 提示：</p>
          <p>· 创建项目后，从微信「文件传输助手」把修图各版本保存到电脑</p>
          <p>· 然后在项目详情页上传这些照片</p>
          <p>· 微信传输时请勾选「原图」以保证质量</p>
        </div>

        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="w-full py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? '创建中...' : '创建项目'}
        </button>
      </form>
    </div>
  )
}
