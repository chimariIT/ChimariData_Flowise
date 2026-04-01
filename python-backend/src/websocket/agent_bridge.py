"""
WebSocket Agent Bridge

Bridges agent orchestrator events to WebSocket broadcasts for real-time UI updates.
"""

import logging
from typing import Optional, Any, Dict
from datetime import datetime

logger = logging.getLogger(__name__)


class WebSocketAgentBridge:
    """Bridge between agent orchestrator and WebSocket broadcasts."""

    def __init__(self, connection_manager):
        self.connection_manager = connection_manager
        self.orchestrator = None
        self.analysis_orchestrator = None
        self._listeners_registered = False

    def initialize(self, orchestrator, analysis_orchestrator=None):
        self.orchestrator = orchestrator
        self.analysis_orchestrator = analysis_orchestrator
        self._register_listeners()
        logger.info("WebSocket Agent Bridge initialized")

    def _register_listeners(self):
        if self.orchestrator:
            if hasattr(self.orchestrator, 'on'):
                self.orchestrator.on('progress', self._on_workflow_progress)
                self.orchestrator.on('error', self._on_workflow_error)
                self.orchestrator.on('complete', self._on_workflow_complete)
                logger.info("Registered workflow event listeners")
        self._listeners_registered = True

    async def _on_workflow_progress(self, event: Dict[str, Any]):
        try:
            session_id = event.get('session_id')
            project_id = event.get('project_id')
            if not session_id and not project_id:
                return
            message = {
                "type": "workflow:progress",
                "session_id": session_id,
                "project_id": project_id,
                "step": event.get('step', 'unknown'),
                "progress": event.get('progress', 0),
                "message": event.get('message', ''),
                "data": event.get('data', {}),
                "timestamp": datetime.utcnow().isoformat()
            }
            if session_id:
                await self.connection_manager.send_message(session_id, message)
            elif project_id:
                await self.connection_manager.broadcast_to_project(project_id, message)
        except Exception as e:
            logger.error(f"Error handling workflow progress: {e}", exc_info=True)

    async def _on_workflow_error(self, event: Dict[str, Any]):
        try:
            session_id = event.get('session_id')
            project_id = event.get('project_id')
            message = {
                "type": "workflow:error",
                "session_id": session_id,
                "project_id": project_id,
                "step": event.get('step', 'unknown'),
                "error": event.get('error', 'Unknown error'),
                "data": event.get('data', {}),
                "timestamp": datetime.utcnow().isoformat()
            }
            if session_id:
                await self.connection_manager.send_message(session_id, message)
            elif project_id:
                await self.connection_manager.broadcast_to_project(project_id, message)
        except Exception as e:
            logger.error(f"Error handling workflow error: {e}", exc_info=True)

    async def _on_workflow_complete(self, event: Dict[str, Any]):
        try:
            session_id = event.get('session_id')
            project_id = event.get('project_id')
            message = {
                "type": "workflow:complete",
                "session_id": session_id,
                "project_id": project_id,
                "step": event.get('step', 'unknown'),
                "message": event.get('message', 'Workflow completed'),
                "results": event.get('results', {}),
                "timestamp": datetime.utcnow().isoformat()
            }
            if session_id:
                await self.connection_manager.send_message(session_id, message)
            elif project_id:
                await self.connection_manager.broadcast_to_project(project_id, message)
        except Exception as e:
            logger.error(f"Error handling workflow complete: {e}", exc_info=True)

    async def emit_analysis_progress(self, project_id: str, analysis_type: str, progress: int, message: str, data: Optional[Dict[str, Any]] = None):
        message_data = {
            "type": "analysis:progress",
            "project_id": project_id,
            "analysis_type": analysis_type,
            "progress": progress,
            "message": message,
            "data": data or {},
            "timestamp": datetime.utcnow().isoformat()
        }
        await self.connection_manager.broadcast_to_project(project_id, message_data)

    async def emit_analysis_started(self, project_id: str, analysis_type: str, analysis_id: str):
        message_data = {
            "type": "analysis:started",
            "project_id": project_id,
            "analysis_type": analysis_type,
            "analysis_id": analysis_id,
            "timestamp": datetime.utcnow().isoformat()
        }
        await self.connection_manager.broadcast_to_project(project_id, message_data)

    async def emit_analysis_completed(self, project_id: str, analysis_type: str, analysis_id: str, results: Dict[str, Any]):
        message_data = {
            "type": "analysis:completed",
            "project_id": project_id,
            "analysis_type": analysis_type,
            "analysis_id": analysis_id,
            "results": results,
            "timestamp": datetime.utcnow().isoformat()
        }
        await self.connection_manager.broadcast_to_project(project_id, message_data)

    async def emit_transformation_progress(self, project_id: str, transformation_id: str, progress: int, message: str):
        message_data = {
            "type": "transformation:progress",
            "project_id": project_id,
            "transformation_id": transformation_id,
            "progress": progress,
            "message": message,
            "timestamp": datetime.utcnow().isoformat()
        }
        await self.connection_manager.broadcast_to_project(project_id, message_data)

    async def emit_agent_message(self, project_id: str, agent_name: str, message: str, message_type: str = "info"):
        message_data = {
            "type": "agent:message",
            "project_id": project_id,
            "agent_name": agent_name,
            "message": message,
            "message_type": message_type,
            "timestamp": datetime.utcnow().isoformat()
        }
        await self.connection_manager.broadcast_to_project(project_id, message_data)


_agent_bridge: Optional[WebSocketAgentBridge] = None


def initialize_agent_bridge(connection_manager) -> WebSocketAgentBridge:
    global _agent_bridge
    if _agent_bridge is None:
        _agent_bridge = WebSocketAgentBridge(connection_manager)
        logger.info("Agent bridge initialized")
    return _agent_bridge


def get_agent_bridge() -> Optional[WebSocketAgentBridge]:
    return _agent_bridge
