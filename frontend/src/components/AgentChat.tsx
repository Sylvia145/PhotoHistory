/** Agent 聊天面板 — 主容器
 *
 * P0-4 增强：对话中缩略图点击 → PhotoViewer 灯箱预览
 * P1-5 增强：会话列表 UI（切换/新建/重命名）
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAgentChat } from '../hooks/useAgentChat'
import AgentChatBubble from './AgentChatBubble'
import AgentToolCard from './AgentToolCard'
import AgentConfirmCard from './AgentConfirmCard'
import AgentSettingsModal from './AgentSettings'
import PhotoViewer from './PhotoViewer'
import type { PhotoBrief } from '../types/agent'
import type { Photo } from '../types'

interface Props {
  projectId?: string | null
  projectName?: string
  isOpen: boolean
  onClose: () => void
}

/** 从工具结果中提取照片列表（供 PhotoViewer 使用） */
function extractPhotosFromResult(
  result: unknown,
): PhotoBrief[] {
  if (!result || typeof result !== 'object') return []
  const data = result as Record<string, unknown>

  // 扫描结果：from groups[].photos[]
  if (data.groups) {
    const photos: PhotoBrief[] = []
    for (const g of data.groups as Array<Record<string, unknown>>) {
      if (g.photos) {
        for (const p of g.photos as Array<Record<string, unknown>>) {
          photos.push(p as unknown as PhotoBrief)
        }
      }
    }
    return photos
  }

  // 清理计划：from plan[].keep + plan[].delete
  if (data.plan) {
    const photos: PhotoBrief[] = []
    for (const g of data.plan as Array<Record<string, unknown>>) {
      if (g.keep) {
        for (const p of g.keep as Array<Record<string, unknown>>) {
          photos.push(p as unknown as PhotoBrief)
        }
      }
      if (g.delete) {
        for (const p of g.delete as Array<Record<string, unknown>>) {
          photos.push(p as unknown as PhotoBrief)
        }
      }
    }
    return photos
  }

  // 对比：photo_a + photo_b
  if (data.photo_a && data.photo_b) {
    return [
      data.photo_a as unknown as PhotoBrief,
      data.photo_b as unknown as PhotoBrief,
    ]
  }

  // 详情：单张照片
  if (data.thumbnail_url) {
    return [data as unknown as PhotoBrief]
  }

  return []
}

/** PhotoBrief → PhotoViewer 需要的 Photo 类型 */
function toViewerPhoto(pb: PhotoBrief): Photo {
  return {
    id: pb.id,
    project_id: '',
    original_name: pb.original_name,
    file_size: pb.file_size || 0,
    mime_type: pb.mime_type || 'image/jpeg',
    resolution_w: pb.resolution_w || null,
    resolution_h: pb.resolution_h || null,
    exif_datetime_original: pb.exif_datetime_original || null,
    exif_make: pb.exif_make || null,
    exif_model: pb.exif_model || null,
    exif_has_all: pb.exif_has_all ?? true,
    quality_status: pb.quality_status || 'ok',
    quality_reason: pb.quality_reason || null,
    ai_score_sharpness: pb.ai_score_sharpness ?? undefined,
    ai_score_aesthetic: pb.ai_score_aesthetic ?? undefined,
    ai_score_overall: pb.ai_score_overall ?? undefined,
    cleanup_status: pb.cleanup_status || null,
    cleanup_group_id: null,
    cleanup_group_rank: null,
    cleanup_reason: pb.cleanup_reason || null,
    dhash: null,
    source_type: pb.source_type || 'manual',
    uploaded_at: '',
  }
}

export default function AgentChatPanel({ projectId, projectName, isOpen, onClose }: Props) {
  const {
    messages,
    streaming,
    pendingConfirmation,
    usage,
    conversationId,
    conversation,
    error,
    sendMessage,
    confirmAction,
    cancelStream,
    startNewChat,
    loadConversation,
  } = useAgentChat({ projectId })

  const [input, setInput] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [conversationsOpen, setConversationsOpen] = useState(false)
  const [conversationList, setConversationList] = useState<Array<{ id: string; title?: string; updated_at?: string; message_count?: number }>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // P0-4: PhotoViewer 预览状态
  const [previewPhotos, setPreviewPhotos] = useState<Photo[]>([])
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  // 自动聚焦输入框
  useEffect(() => {
    if (isOpen && !streaming) {
      inputRef.current?.focus()
    }
  }, [isOpen, streaming])

  // P0-4: 缩略图点击 → PhotoViewer 预览
  const handlePreviewPhoto = useCallback((photoId: string) => {
    // 从所有已完成的消息中收集照片数据
    const allPhotos: PhotoBrief[] = []
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.toolBlocks) {
        for (const tb of msg.toolBlocks) {
          if (tb.result) {
            const extracted = extractPhotosFromResult(tb.result.result)
            allPhotos.push(...extracted)
          }
        }
      }
    }

    // 去重
    const seen = new Set<string>()
    const unique = allPhotos.filter((p) => {
      if (seen.has(p.id)) return false
      seen.add(p.id)
      return true
    })

    const idx = unique.findIndex((p) => p.id === photoId)
    setPreviewPhotos(unique.map(toViewerPhoto))
    setPreviewIndex(idx >= 0 ? idx : 0)
  }, [messages])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || streaming) return
    sendMessage(trimmed)
    setInput('')
  }, [input, streaming, sendMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  // 加载会话列表
  const loadConversationList = useCallback(async () => {
    try {
      const { getConversations } = await import('../api/agent')
      const res = await getConversations(projectId)
      const list = (res.conversations || []).map(c => ({
        id: c.id,
        title: c.title ?? undefined,
        updated_at: c.updated_at ?? undefined,
        message_count: c.message_count ?? undefined,
      }))
      setConversationList(list)
    } catch {
      // 静默失败
    }
  }, [projectId])

  const handleConversationsClick = useCallback(() => {
    const next = !conversationsOpen
    setConversationsOpen(next)
    if (next) loadConversationList()
  }, [conversationsOpen, loadConversationList])

  const handleSelectConversation = useCallback((id: string) => {
    loadConversation(id)
    setConversationsOpen(false)
  }, [loadConversation])

  if (!isOpen) return null

  const panel = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        zIndex: 9998,
        backgroundColor: '#fff',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ===== 顶部栏 ===== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid #f3f4f6',
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#1f2937' }}>
            🤖 AI 助手
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>
            {projectName ? `项目: ${projectName}` : 'PhotoHistory Agent'}
            {usage && ` · token: ${usage.input_tokens + usage.output_tokens}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {/* 会话列表按钮 (P1-5) */}
          <button
            onClick={handleConversationsClick}
            style={iconBtnStyle()}
            title="历史对话"
          >
            💬
          </button>
          <button
            onClick={() => setShowSettings(true)}
            style={iconBtnStyle()}
            title="设置"
          >
            ⚙️
          </button>
          <button
            onClick={startNewChat}
            style={iconBtnStyle()}
            title="新建对话"
          >
            ➕
          </button>
          <button
            onClick={onClose}
            style={iconBtnStyle()}
            title="关闭"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ===== 会话列表面板 (P1-5) ===== */}
      {conversationsOpen && (
        <div
          style={{
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#fafafa',
            maxHeight: 240,
            overflow: 'auto',
          }}
        >
          <div style={{
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 600,
            color: '#6b7280',
            borderBottom: '1px solid #f3f4f6',
          }}>
            📝 历史对话
          </div>
          {conversationList.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>
              暂无历史对话
            </div>
          ) : (
            conversationList.map((conv) => (
              <div
                key={conv.id}
                onClick={() => handleSelectConversation(conv.id)}
                style={{
                  padding: '10px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f3f4f6',
                  backgroundColor: conv.id === conversationId ? '#eff6ff' : 'transparent',
                  transition: 'background-color 0.15s',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
                  {conv.title || '未命名对话'}
                  {conv.id === conversationId && (
                    <span style={{ marginLeft: 8, fontSize: 10, color: '#6366f1' }}>● 当前</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                  {conv.message_count != null ? `${conv.message_count} 条消息` : ''}
                  {conv.updated_at ? ` · ${new Date(conv.updated_at).toLocaleDateString()}` : ''}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ===== 消息列表 ===== */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px',
          backgroundColor: '#fafafa',
        }}
      >
        {/* 空状态 */}
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              PhotoHistory AI 助手
            </div>
            <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.6, marginBottom: 16 }}>
              我可以帮你管理照片库，试试这些指令：
            </div>

            {/* P2-5: 首次使用建议问题气泡 */}
            <GuideBubble
              text="帮我清理这个项目的重复照片"
              onClick={() => { sendMessage('帮我清理这个项目的重复照片'); setInput(''); }}
            />
            <GuideBubble
              text="分析照片质量分布"
              onClick={() => { sendMessage('分析照片质量分布'); setInput(''); }}
            />
            <GuideBubble
              text="找出所有微信压缩图"
              onClick={() => { sendMessage('找出所有微信压缩图'); setInput(''); }}
            />
            <GuideBubble
              text="帮我按照拍摄日期整理照片"
              onClick={() => { sendMessage('帮我按照拍摄日期整理照片'); setInput(''); }}
            />

            <div style={{ marginTop: 12, fontSize: 11, color: '#d1d5db' }}>
              也可以直接输入你的问题
            </div>

            {/* API Key 未配置提示 */}
            {!hasApiKey() && (
              <div style={{
                marginTop: 20,
                padding: '12px 16px',
                borderRadius: 8,
                backgroundColor: '#fef3c7',
                border: '1px solid #fcd34d',
                fontSize: 13,
                color: '#92400e',
              }}>
                ⚠️ 尚未配置 API Key，请点击右上角 ⚙️ 设置
              </div>
            )}
          </div>
        )}

        {/* 消息渲染 */}
        {messages.map((msg) => {
          if (msg.role === 'tool') return null

          return (
            <div key={msg.id}>
              <AgentChatBubble message={msg} />

              {/* Tool 结果渲染 */}
              {msg.role === 'assistant' && msg.toolBlocks?.map((tb) => {
                const result = tb.result
                if (!result || result.status === 'running') return null
                return (
                  <AgentToolCard
                    key={tb.id}
                    toolBlock={tb}
                    result={result}
                    onPreviewPhoto={handlePreviewPhoto}
                  />
                )
              })}
            </div>
          )
        })}

        {/* 确认门卡片 */}
        {pendingConfirmation && (
          <AgentConfirmCard
            data={pendingConfirmation}
            onConfirm={confirmAction}
          />
        )}

        {/* 错误提示 */}
        {error && (
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
            ❌ {error}
            <button
              onClick={() => startNewChat()}
              style={{
                marginLeft: 8,
                background: 'none',
                border: 'none',
                color: '#991b1b',
                textDecoration: 'underline',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              重新开始
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ===== 底部输入区 ===== */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #f3f4f6',
          backgroundColor: '#fff',
        }}
      >
        {streaming && !pendingConfirmation && (
          <div style={{ marginBottom: 8, textAlign: 'center' }}>
            <button
              onClick={cancelStream}
              style={{
                padding: '4px 16px',
                borderRadius: 12,
                border: '1px solid #d1d5db',
                backgroundColor: '#fff',
                fontSize: 12,
                color: '#6b7280',
                cursor: 'pointer',
              }}
            >
              ⏸ 停止生成
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              pendingConfirmation
                ? '请确认或取消删除操作...'
                : streaming
                  ? 'Agent 正在思考中...'
                  : '输入消息，例如「帮我扫描重复照片」'
            }
            disabled={streaming || !!pendingConfirmation}
            rows={2}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              fontSize: 14,
              resize: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              backgroundColor: streaming ? '#f9fafb' : '#fff',
              color: streaming ? '#9ca3af' : '#1f2937',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming || !!pendingConfirmation}
            style={{
              alignSelf: 'flex-end',
              width: 44,
              height: 44,
              borderRadius: 12,
              border: 'none',
              backgroundColor:
                !input.trim() || streaming ? '#e5e7eb' : '#6366f1',
              color: '#fff',
              fontSize: 18,
              cursor:
                !input.trim() || streaming ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ➤
          </button>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          fontSize: 11,
          color: '#d1d5db',
        }}>
          <span>{streaming ? 'Agent 工作中...' : conversationId ? `会话: ${conversationId.slice(0, 8)}...` : '新对话'}</span>
          {usage && (
            <span>
              {usage.input_tokens + usage.output_tokens} tokens · {usage.tool_calls} 工具 · {(usage.elapsed_ms / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      </div>

      {/* 设置弹窗 */}
      {showSettings && (
        <AgentSettingsModal onClose={() => setShowSettings(false)} />
      )}

      {/* ===== P0-4: PhotoViewer 灯箱 ===== */}
      {previewIndex !== null && previewPhotos.length > 0 && (
        <PhotoViewer
          photos={previewPhotos}
          currentIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onNavigate={setPreviewIndex}
        />
      )}
    </div>
  )

  return createPortal(panel, document.body)
}

function iconBtnStyle(disabled?: boolean): React.CSSProperties {
  return {
    background: 'none',
    border: 'none',
    fontSize: 16,
    cursor: disabled ? 'default' : 'pointer',
    padding: '4px 6px',
    borderRadius: 6,
    color: disabled ? '#d1d5db' : '#6b7280',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
}

function hasApiKey(): boolean {
  try {
    const raw = localStorage.getItem('photohistory_agent_settings')
    if (!raw) return false
    const settings = JSON.parse(raw)
    return !!settings.apiKey
  } catch {
    return false
  }
}

/** P2-5: 建议问题气泡 — 点击自动填充并发送 */
function GuideBubble({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-block',
        margin: '4px 4px',
        padding: '8px 14px',
        borderRadius: 16,
        border: '1px solid #e5e7eb',
        backgroundColor: '#fff',
        color: '#374151',
        fontSize: 13,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#6366f1'
        e.currentTarget.style.color = '#6366f1'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#e5e7eb'
        e.currentTarget.style.color = '#374151'
      }}
    >
      💬 {text}
    </button>
  )
}
