/** Agent 消息气泡组件 — 用户消息、Agent 文本、流式效果 */

import type { ChatMessage } from '../types/agent'

interface Props {
  message: ChatMessage
}

const toolNameLabels: Record<string, string> = {
  list_projects: '📂 查询项目列表',
  scan_similar_groups: '🔍 扫描相似照片',
  get_photo_detail: '📷 查看照片详情',
  compare_two_photos: '⚖️ 对比照片',
  suggest_cleanup_plan: '📋 生成清理计划',
  execute_cleanup: '🗑 执行清理',
}

export default function AgentChatBubble({ message }: Props) {
  // === 用户消息 ===
  if (message.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div
          style={{
            maxWidth: '80%',
            padding: '10px 14px',
            borderRadius: 16,
            borderBottomRightRadius: 4,
            backgroundColor: '#6366f1',
            color: '#fff',
            fontSize: 14,
            lineHeight: 1.5,
            wordBreak: 'break-word',
          }}
        >
          {message.content}
        </div>
      </div>
    )
  }

  // === Tool 消息 ===
  if (message.role === 'tool') {
    return null // tool 消息不单独显示，通过 assistant 的 toolBlocks 展示
  }

  // === Assistant 消息 ===
  const isStreaming = message.status === 'streaming'
  const text = isStreaming ? message.streamingText || '' : message.content || ''
  const hasToolBlocks = message.toolBlocks && message.toolBlocks.length > 0

  return (
    <div style={{ marginBottom: 16 }}>
      {/* 文本气泡 */}
      {text && (
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <div
            style={{
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: 16,
              borderBottomLeftRadius: 4,
              backgroundColor: '#f3f4f6',
              color: '#1f2937',
              fontSize: 14,
              lineHeight: 1.6,
              wordBreak: 'break-word',
            }}
          >
            {text}
            {isStreaming && (
              <span
                style={{
                  display: 'inline-block',
                  width: 2,
                  height: 16,
                  backgroundColor: '#6366f1',
                  marginLeft: 2,
                  verticalAlign: 'text-bottom',
                  animation: 'blink 1s step-end infinite',
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* 流式等待（无文本时显示） */}
      {isStreaming && !text && !hasToolBlocks && (
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 16,
              borderBottomLeftRadius: 4,
              backgroundColor: '#f3f4f6',
              color: '#9ca3af',
              fontSize: 14,
            }}
          >
            <span className="thinking-dots">思考中</span>
          </div>
        </div>
      )}

      {/* 工具调用块 */}
      {hasToolBlocks && (
        <div style={{ marginTop: text ? 8 : 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {message.toolBlocks!.map((tb) => (
            <div key={tb.id}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 8,
                  backgroundColor:
                    tb.status === 'running' ? '#fef3c7' :
                    tb.status === 'error' ? '#fee2e2' :
                    tb.status === 'cancelled' ? '#f3f4f6' :
                    '#ecfdf5',
                  fontSize: 12,
                  color:
                    tb.status === 'running' ? '#92400e' :
                    tb.status === 'error' ? '#991b1b' :
                    tb.status === 'cancelled' ? '#6b7280' :
                    '#065f46',
                }}
              >
                <span>
                  {tb.status === 'running' ? '⏳' :
                   tb.status === 'error' ? '❌' :
                   tb.status === 'cancelled' ? '🚫' : '✅'}
                </span>
                <span>{toolNameLabels[tb.name] || tb.name}</span>
                {tb.status === 'running' && <Spinner />}
              </div>

              {/* P2-3: 骨架屏 — 工具调用中时显示灰色占位卡片 */}
              {tb.status === 'running' && (
                <SkeletonCard />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 微型旋转器 */
function Spinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        border: '2px solid #d4a574',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}
    />
  )
}

/** P2-3: 骨架屏 — 工具调用中的灰色占位卡片 */
function SkeletonCard() {
  return (
    <div
      style={{
        marginTop: 8,
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#f9fafb',
        border: '1px solid #e5e7eb',
        animation: 'skeletonPulse 1.5s ease-in-out infinite',
      }}
    >
      <div style={{
        width: '40%',
        height: 12,
        borderRadius: 4,
        backgroundColor: '#e5e7eb',
        marginBottom: 8,
      }} />
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
      }}>
        <div style={{
          height: 60,
          borderRadius: 6,
          backgroundColor: '#e5e7eb',
        }} />
        <div style={{
          height: 60,
          borderRadius: 6,
          backgroundColor: '#e5e7eb',
        }} />
      </div>
      <div style={{
        width: '60%',
        height: 10,
        borderRadius: 4,
        backgroundColor: '#e5e7eb',
        marginTop: 8,
      }} />
    </div>
  )
}
