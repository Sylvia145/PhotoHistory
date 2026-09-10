"""Provider 工厂 — 根据配置返回对应的 ChatProvider 实例"""

import logging

from config import LLM_PROVIDER, ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENAI_BASE_URL

logger = logging.getLogger(__name__)


def get_provider():
    """根据环境变量 LLM_PROVIDER 返回对应的 Provider 实例。

    Returns:
        实现了 ChatProvider 协议的 Provider 实例

    Raises:
        ValueError: 未配置 API Key 或 Provider 不支持
    """
    if LLM_PROVIDER == "anthropic":
        from .anthropic import AnthropicProvider
        return AnthropicProvider(api_key=ANTHROPIC_API_KEY)

    elif LLM_PROVIDER == "openai_compat":
        from .openai_compat import OpenAICompatProvider
        return OpenAICompatProvider(
            api_key=OPENAI_API_KEY,
            base_url=OPENAI_BASE_URL,
        )

    else:
        raise ValueError(
            f"不支持的 LLM Provider: {LLM_PROVIDER}。"
            f"支持: anthropic, openai_compat。"
            f"请设置环境变量 PHOTOHISTORY_LLM_PROVIDER。"
        )
