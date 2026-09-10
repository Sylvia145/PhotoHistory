/** Agent 聊天状态管理 Hook

核心职责:
1. 管理消息列表 + 流式消息更新
2. 管理 SSE 连接生命周期
3. 处理确认门（pendingConfirmation）
4. 工具调用状态追踪
*/

import { useState, useCallback, useRef } from 'react'
import type {
  ChatMessage,
  ToolCallBlock,
  ToolResult,
  ConfirmRequiredData,
  UsageStats,
  ConversationInfo,
} from '../types/agent'
import {
  sendChatMessage,
  getConversationMessages,
  getAgentSettings,
} from '../api/agent'

interface UseAgentChatOptions {
  projectId?: string | null
}

interface UseAgentChatReturn {
  messages: ChatMessage[]
  streaming: boolean
  pendingConfirmation: ConfirmRequiredData | null
  usage: UsageStats | null
  conversationId: string | null
  conversation: ConversationInfo | null
  error: string | null
  sendMessage: (text: string) => void
  confirmAction: (confirmed: boolean) => void
  cancelStream: () => void
  startNewChat: () => void
  loadConversation: (id: string) => Promise<void>
}

export function useAgentChat({ projectId }: UseAgentChatOptions = {}): UseAgentChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<ConfirmRequiredData | null>(null)
  const [usage, setUsage] = useState<UsageStats | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversation, setConversation] = useState<ConversationInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  // 保存当前的确认 tool_call_id（用于 confirmAction）
  const confirmIdRef = useRef<string | null>(null)

  const startNewChat = useCallback(() => {
    // 取消当前 SSE
    if (abortRef.current) {
      abortRef.current.abort()
    }
    setMessages([])
    setConversationId(null)
    setConversation(null)
    setUsage(null)
    setError(null)
    setPendingConfirmation(null)
    setStreaming(false)
  }, [])

  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setStreaming(false)
    setPendingConfirmation(null)
  }, [])

  const loadConversation = useCallback(async (id: string) => {
    startNewChat()
    try {
      const { messages: historyMsgs } = await getConversationMessages(id)
      setConversationId(id)
      const loaded: ChatMessage[] = historyMsgs.map((m) => ({
        ...m,
        status: 'done' as const,
        toolBlocks: m.tool_calls_json
          ? parseToolBlocks(m.tool_calls_json)
          : undefined,
      }))
      setMessages(loaded)
    } catch (e) {
      setError(`加载会话失败: ${e}`)
    }
  }, [startNewChat])

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || streaming) return

      setError(null)
      setStreaming(true)
      setPendingConfirmation(null)

      const settings = getAgentSettings()
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        status: 'done',
      }

      setMessages((prev) => [...prev, userMsg])

      // 创建 assistant 占位消息（流式文本）
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        streamingText: '',
        status: 'streaming',
        toolBlocks: [],
      }

      setMessages((prev) => [...prev, assistantMsg])

      const requestPayload = {
        message: text,
        project_id: projectId || null,
        conversation_id: conversationId,
        // 仅当用户手动设置了 API Key 时才覆盖后端配置
        // model 仅在用户显式填写时才发送（空字符串 = 使用后端默认配置）
        ...(settings.apiKey ? {
          provider: settings.provider || undefined,
          api_key: settings.apiKey,
          ...(settings.model ? { model: settings.model } : {}),
        } : {}),
      }

      const controller = sendChatMessage(
        requestPayload,
        // onEvent
        (event) => {
          switch (event.event) {
            case 'text_delta': {
              const td = event.data as { text: string }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? {
                        ...m,
                        streamingText: (m.streamingText || '') + td.text,
                        content: (m.streamingText || '') + td.text,
                      }
                    : m,
                ),
              )
              break
            }

            case 'tool_call': {
              const tc = event.data as { id: string; name: string; status: string }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? {
                        ...m,
                        toolBlocks: [
                          ...(m.toolBlocks || []),
                          {
                            id: tc.id,
                            name: tc.name,
                            input: {},
                            status: 'running' as const,
                          },
                        ],
                      }
                    : m,
                ),
              )
              break
            }

            case 'tool_result': {
              const tr = event.data as ToolResult
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? {
                        ...m,
                        toolBlocks: (m.toolBlocks || []).map((tb) =>
                          tb.id === tr.id
                            ? {
                                ...tb,
                                status: tr.status === 'error' ? 'error' : 'done',
                                result: tr,
                              }
                            : tb,
                        ),
                      }
                    : m,
                ),
              )
              break
            }

            case 'confirm_required': {
              const cr = event.data as ConfirmRequiredData
              confirmIdRef.current = cr.tool_call_id
              setPendingConfirmation(cr)
              break
            }

            case 'error': {
              const ed = event.data as { message: string }
              setError(ed.message)
              break
            }

            case 'done': {
              const dd = event.data as { conversation_id: string; conversation?: ConversationInfo; usage?: UsageStats }
              if (dd.conversation_id) {
                setConversationId(dd.conversation_id)
              }
              if (dd.conversation) {
                setConversation(dd.conversation)
              }
              if (dd.usage) {
                setUsage(dd.usage)
              }
              // 标记 assistant 消息完成
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, status: 'done', streamingText: undefined }
                    : m,
                ),
              )
              setStreaming(false)
              break
            }
          }
        },
        // onError
        (err) => {
          setError(err.message)
          setStreaming(false)
        },
        // onDone
        () => {
          setStreaming(false)
        },
      )

      abortRef.current = controller
    },
    [streaming, projectId, conversationId],
  )

  const confirmAction = useCallback(
    (confirmed: boolean) => {
      const toolCallId = confirmIdRef.current
      if (!toolCallId) return

      setPendingConfirmation(null)
      setStreaming(true)

      const settings = getAgentSettings()
      const requestPayload = {
        message: confirmed ? '确认删除' : '取消删除',
        project_id: projectId || null,
        conversation_id: conversationId,
        confirm_tool_call_id: toolCallId,
        confirm_result: confirmed,
        // 仅当用户手动设置了 API Key 时才覆盖后端配置
        // model 仅在用户显式填写时才发送（空字符串 = 使用后端默认配置）
        ...(settings.apiKey ? {
          provider: settings.provider || undefined,
          api_key: settings.apiKey,
          ...(settings.model ? { model: settings.model } : {}),
        } : {}),
      }

      // 发送确认
      fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.text()
        })
        .then(() => {
          setStreaming(false)
          // 确认响应不会自动触发新一轮对话
          // 用户需要再发送消息来继续
        })
        .catch((err) => {
          setError(`确认请求失败: ${err.message}`)
          setStreaming(false)
        })
    },
    [projectId, conversationId],
  )

  return {
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
  }
}

/** 从 tool_calls_json 解析 ToolCallBlock 数组 */
function parseToolBlocks(json: string): ToolCallBlock[] {
  try {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return arr.map((tc: Record<string, unknown>) => ({
      id: tc.id as string || '',
      name: tc.name as string || '',
      input: (tc.input as Record<string, unknown>) || {},
      status: 'done' as const,
    }))
  } catch {
    return []
  }
}
