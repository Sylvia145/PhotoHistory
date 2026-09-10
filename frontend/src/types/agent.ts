/** Agent 聊天系统类型 */

/** 聊天请求 */
export interface ChatRequest {
  conversation_id?: string | null
  project_id?: string | null
  message: string
  confirm_tool_call_id?: string | null
  confirm_result?: boolean | null
  provider?: string | null
  api_key?: string | null
  model?: string | null
}

/** 对话历史中的单条消息 */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls_json?: string | null      // assistant 消息的 tool_use blocks JSON
  tool_name?: string | null            // tool 消息对应的工具名
  tool_call_id?: string | null
  usage_json?: string | null
  created_at?: string

  // === 前端渲染扩展字段 ===
  /** 流式文本（仅 streaming 中的 assistant 消息） */
  streamingText?: string
  /** 工具调用块（从 tool_calls_json 解析） */
  toolBlocks?: ToolCallBlock[]
  /** 工具执行结果（tool 消息解析） */
  toolResult?: ToolResult
  /** 消息状态 */
  status?: 'streaming' | 'done' | 'error'
}

/** LLM 工具调用块 */
export interface ToolCallBlock {
  id: string
  name: string
  input: Record<string, unknown>
  status: 'running' | 'done' | 'error' | 'cancelled'
  result?: ToolResult
}

/** 工具执行结果 */
export interface ToolResult {
  id: string
  name: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  result?: unknown
}

/** SSE 事件 */
export interface SSEEvent {
  event: 'text_delta' | 'tool_call' | 'tool_result' | 'confirm_required' | 'error' | 'done'
  data: TextDeltaData | ToolCallData | ToolResultData | ConfirmRequiredData | ErrorData | DoneData
}

export interface TextDeltaData {
  text: string
}

export interface ToolCallData {
  id: string
  name: string
  status: string
}

export interface ToolResultData {
  id: string
  name: string
  status: 'done' | 'error' | 'cancelled'
  result?: unknown
}

/** 照片简要信息（供 Agent 组件渲染） */
export interface PhotoBrief {
  id: string
  original_name: string
  file_url: string
  thumbnail_url: string
  file_size?: number
  file_size_mb?: number
  resolution?: string | null
  resolution_w?: number | null
  resolution_h?: number | null
  ai_score_overall?: number | null
  ai_score_sharpness?: number | null
  ai_score_aesthetic?: number | null
  exif_datetime_original?: string | null
  exif_make?: string | null
  exif_model?: string | null
  source_type?: string | null
  source_type_label?: string | null
  cleanup_status?: string | null
  cleanup_reason?: string | null
  quality_status?: string | null
  quality_reason?: string | null
  mime_type?: string
  exif_has_all?: boolean
}

export interface ConfirmRequiredData {
  tool_call_id: string
  tool_name: string
  summary: string
  details?: PhotoBrief[]
  total_size_mb?: number
  count?: number
}

export interface ErrorData {
  message: string
}

export interface DoneData {
  conversation_id: string
  conversation?: ConversationInfo
  usage?: UsageStats
}

/** 会话信息 */
export interface ConversationInfo {
  id: string
  project_id?: string | null
  title?: string | null
  provider?: string
  model?: string
  message_count?: number
  created_at?: string
  updated_at?: string
}

/** 用量统计 */
export interface UsageStats {
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  tool_calls: number
  iterations: number
  elapsed_ms: number
}

/** Agent 设置（localStorage 持久化） */
export interface AgentSettings {
  provider: 'anthropic' | 'openai_compat'
  apiKey: string
  model: string
}
