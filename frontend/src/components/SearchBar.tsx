import { useState, useEffect, useRef, useCallback } from 'react'

interface Props {
  onSearch: (query: string) => void
  onClear: () => void
  searching: boolean
  resultCount: number | null  // null = 未搜索
}

const SUGGESTIONS = [
  { label: '📱 iPhone 拍摄', query: 'iPhone' },
  { label: '📐 竖屏照片', query: '竖屏' },
  { label: '🖼 横屏照片', query: '横屏' },
  { label: '💾 大于5MB', query: '大于5MB' },
  { label: '📷 原图', query: '原图' },
  { label: '🗓 2026年6月', query: '2026年6月' },
  { label: '⚠️ 微信压缩', query: '微信' },
]

export default function SearchBar({ onSearch, onClear, searching, resultCount }: Props) {
  const [value, setValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const handleChange = useCallback(
    (q: string) => {
      setValue(q)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (q.trim()) {
        debounceRef.current = setTimeout(() => onSearch(q.trim()), 300)
      } else {
        onClear()
      }
    },
    [onSearch, onClear],
  )

  const handleClear = useCallback(() => {
    setValue('')
    onClear()
    inputRef.current?.focus()
  }, [onClear])

  // 清理 debounce
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // 键盘快捷方式: Ctrl+K 聚焦搜索
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const hasResults = resultCount !== null

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          {/* 搜索图标 */}
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
            🔍
          </span>

          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="搜索照片…（iPhone、竖屏、大于5MB、2026年6月）"
            className="w-full pl-9 pr-16 py-2 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent
                       placeholder:text-gray-400"
          />

          {/* 右侧状态区 */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searching && (
              <span className="text-gray-400 text-xs animate-spin">⏳</span>
            )}
            {hasResults && !searching && (
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                {resultCount} 张
              </span>
            )}
            {value && (
              <button
                onClick={handleClear}
                className="text-gray-400 hover:text-gray-600 text-xs px-1"
              >
                ✕
              </button>
            )}
            <span className="text-xs text-gray-300 bg-gray-50 px-1 rounded hidden sm:inline">
              Ctrl+K
            </span>
          </div>
        </div>
      </div>

      {/* 搜索建议下拉 */}
      {showSuggestions && !value && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-2">
          <div className="text-xs text-gray-400 px-2 py-1">试试这样搜索：</div>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.query}
                onClick={() => handleChange(s.query)}
                className="text-xs px-2.5 py-1.5 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600
                           rounded-md transition border border-gray-100 hover:border-indigo-200"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 无结果提示 */}
      {hasResults && resultCount === 0 && !searching && (
        <div className="mt-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          未找到匹配照片。试试：<strong>iPhone</strong>、<strong>竖屏</strong>、<strong>大于5MB</strong>
        </div>
      )}
    </div>
  )
}
