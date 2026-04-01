"""
WebSocket Agent Bridge Package

Connects agent orchestrator events to WebSocket broadcasts for real-time UI updates.
"""

from .agent_bridge import WebSocketAgentBridge, initialize_agent_bridge

__all__ = [
    "WebSocketAgentBridge",
    "initialize_agent_bridge"
]
