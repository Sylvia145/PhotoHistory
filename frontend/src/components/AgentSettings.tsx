/** Agent 设置面板 — LLM Provider + API Key + Model 配置 */

import { useState, useEffect } from 'react'
import { getAgentSettings, saveAgentSettings } from '../api/agent'
import type { AgentSettings } from '../types/agent'

interface Props {
  onClose: () => void
}

export default function AgentSettingsModal({ onClose }: Props) {
  const [settings, setSettings] = useState<AgentSettings>(getAgentSettings())
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  // 保存到 localStorage
  const handleSave = () => {
    saveAgentSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        backgroundColor: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 400,
          maxHeight: '90vh',
          backgroundColor: '#fff',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>⚙️ Agent 设置</h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: '#9ca3af',
            }}
          >
            ✕
          </button>
        </div>

        {/* Provider 选择 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            LLM Provider
          </label>
          <select
            value={settings.provider}
            onChange={(e) => setSettings({ ...settings, provider: e.target.value as 'anthropic' | 'openai_compat' })}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              fontSize: 14,
              backgroundColor: '#fff',
            }}
          >
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai_compat">OpenAI Compatible</option>
          </select>
        </div>

        {/* API Key */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            API Key
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={settings.apiKey}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              placeholder={settings.provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                fontSize: 14,
              }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                backgroundColor: '#fff',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        {/* Model */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            模型
          </label>
          <input
            type="text"
            value={settings.model}
            onChange={(e) => setSettings({ ...settings, model: e.target.value })}
            placeholder="留空使用后端默认 (gpt-5.4)"
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              fontSize: 14,
            }}
          />
        </div>

        {/* 提示信息 */}
        <div style={{
          padding: '8px 12px',
          borderRadius: 8,
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          fontSize: 12,
          color: '#166534',
          marginBottom: 16,
        }}>
          💡 API Key 仅保存在浏览器本地 (localStorage)，不会发送到 PhotoHistory 服务器（除了用于当前会话的 API 调用）。
        </div>

        {/* 保存按钮 */}
        <button
          onClick={handleSave}
          style={{
            width: '100%',
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: saved ? '#059669' : '#6366f1',
            color: '#fff',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            transition: 'background-color 0.2s',
          }}
        >
          {saved ? '✅ 已保存' : '💾 保存设置'}
        </button>
      </div>
    </div>
  )
}
