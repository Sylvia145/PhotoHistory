"""PhotoHistory MCP Server 模块

将 PhotoHistory 核心功能封装为 MCP 工具，
供 Claude Code/Desktop 等 Agent 平台调用。
"""

from .server import create_mcp_server, mcp

__all__ = ["create_mcp_server", "mcp"]
