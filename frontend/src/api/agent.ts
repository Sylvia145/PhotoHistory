/** Agent SSE 客户端 — 与后端 /api/agent/chat 通信 */

import type { ChatRequest, SSEEvent } from '../types/agent'

const API_BASE = '/api/agent'

/**
 * 发送聊天消息，通过 SSE 流式接收响应。
 *
 * @param request 聊天请求
 * @param onEvent 每个 SSE 事件的回调
 * @param onError 错误回调
 * @param onDone 完成回调
 * @returns AbortController — 可用于取消请求
 */
export function sendChatMessage(
  request: ChatRequest,
  onEvent: (event: SSEEvent) => void,
  onError: (error: Error) => void,
  onDone: () => void,
): AbortController {
  const controller = new AbortController()

  fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`HTTP ${response.status}: ${text}`)
      }
      if (!response.body) {
        throw new Error('响应体为空')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          if (!part.trim()) continue
          const parsed = parseSSEEvent(part)
          if (parsed) {
            onEvent(parsed)
          }
        }
      }

      // 处理剩余 buffer
      if (buffer.trim()) {
        const parsed = parseSSEEvent(buffer)
        if (parsed) {
          onEvent(parsed)
        }
      }

      onDone()
    })
    .catch((err) => {
      if (err.name === 'AbortError') {
        onDone()
        return
      }
      onError(err instanceof Error ? err : new Error(String(err)))
    })

  return controller
}

/** 解析单个 SSE 事件块 */
function parseSSEEvent(text: string): SSEEvent | null {
  const lines = text.split('\n')
  let eventType = 'message'
  let dataStr = ''

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7).trim()
    } else if (line.startsWith('data: ')) {
      dataStr = line.slice(6)
    }
  }

  if (!dataStr) return null

  try {
    const data = JSON.parse(dataStr)
    return { event: eventType, data } as SSEEvent
  } catch {
    return null
  }
}

/** 获取会话列表 */
export async function getConversations(
  projectId?: string | null
): Promise<{ conversations: import('../types/agent').ConversationInfo[] }> {
  const params = new URLSearchParams()
  if (projectId) params.set('project_id', projectId)

  const res = await fetch(`${API_BASE}/conversations?${params.toString()}`)
  if (!res.ok) throw new Error(`获取会话列表失败: ${res.statusText}`)
  return res.json()
}

/** 获取会话消息历史 */
export async function getConversationMessages(
  conversationId: string
): Promise<{ messages: import('../types/agent').ChatMessage[] }> {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/messages`)
  if (!res.ok) throw new Error(`获取消息历史失败: ${res.statusText}`)
  return res.json()
}

/** 旧版默认模型值（用于自动迁移） */
const LEGACY_DEFAULT_MODEL = 'claude-sonnet-4-6'

/** 获取 Agent 设置（从 localStorage）。
 *
 * 重要：默认 model 为空字符串，表示使用后端配置的模型。
 * 只有当用户在前端设置面板中显式输入了模型名时才会覆盖后端配置。
 */
export function getAgentSettings(): import('../types/agent').AgentSettings {
  try {
    const raw = localStorage.getItem('photohistory_agent_settings')
    if (raw) {
      const settings = JSON.parse(raw)
      // 自动迁移：清除旧版默认模型值，避免覆盖后端正确配置
      if (settings.model === LEGACY_DEFAULT_MODEL) {
        settings.model = ''
        localStorage.setItem('photohistory_agent_settings', JSON.stringify(settings))
      }
      return settings
    }
  } catch { /* ignore */ }
  return {
    provider: 'anthropic',
    apiKey: '',
    model: '',
  }
}

/** 保存 Agent 设置到 localStorage */
export function saveAgentSettings(settings: import('../types/agent').AgentSettings): void {
  localStorage.setItem('photohistory_agent_settings', JSON.stringify(settings))
}
