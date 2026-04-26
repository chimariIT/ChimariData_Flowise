"""
DeepAgent runtime adapter.

Wraps LangChain DeepAgent creation/invocation behind a small interface so
the rest of the platform can opt in without tight package coupling.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional
import asyncio
import json
import logging
import os

logger = logging.getLogger(__name__)


def _is_truthy(value: Optional[str], default: bool) -> bool:
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


@dataclass
class DeepAgentInvocationResult:
    success: bool
    content: str
    raw: Any
    error: Optional[str] = None


class DeepAgentRuntime:
    """
    Optional runtime wrapper for `deepagents.create_deep_agent`.

    If DeepAgent is disabled or not installed, callers can safely fall back
    to existing agent implementations.
    """

    def __init__(
        self,
        llm: Any = None,
        *,
        enabled: Optional[bool] = None,
        default_model: str = "gpt-4o-mini",
    ) -> None:
        env_enabled = _is_truthy(os.getenv("ENABLE_DEEPAGENT"), default=True)
        self.enabled = enabled if enabled is not None else env_enabled
        self.llm = llm
        self.default_model = os.getenv("DEEPAGENT_MODEL") or default_model
        self._factory = None
        self._availability_error: Optional[str] = None
        self._agent_cache: Dict[str, Any] = {}

        self._init_factory()

    def _init_factory(self) -> None:
        if not self.enabled:
            self._availability_error = "disabled_by_config"
            return

        try:
            from deepagents import create_deep_agent
            self._factory = create_deep_agent
        except Exception as exc:  # pragma: no cover - import environment specific
            self._availability_error = str(exc)
            logger.warning("DeepAgent unavailable: %s", exc)

    @property
    def availability_error(self) -> Optional[str]:
        return self._availability_error

    def is_available(self) -> bool:
        return self.enabled and self._factory is not None

    def _cache_key(
        self,
        *,
        name: str,
        instructions: str,
        tools: List[Any],
        subagents: Optional[List[Dict[str, Any]]],
        model: Optional[Any],
    ) -> str:
        tool_names = [getattr(tool, "name", repr(tool)) for tool in (tools or [])]
        subagent_names = [
            str(subagent.get("name"))
            for subagent in (subagents or [])
            if isinstance(subagent, dict) and subagent.get("name")
        ]
        payload = {
            "name": name,
            "instructions": instructions,
            "tools": tool_names,
            "subagents": subagent_names,
            "model": str(model or self.llm or self.default_model),
        }
        return json.dumps(payload, sort_keys=True)

    def create_agent(
        self,
        *,
        name: str,
        instructions: str,
        tools: Optional[List[Any]] = None,
        subagents: Optional[List[Dict[str, Any]]] = None,
        model: Optional[Any] = None,
    ) -> Any:
        if not self.is_available():
            return None

        effective_tools = tools or []
        effective_subagents = subagents or []
        cache_key = self._cache_key(
            name=name,
            instructions=instructions,
            tools=effective_tools,
            subagents=effective_subagents,
            model=model,
        )
        cached = self._agent_cache.get(cache_key)
        if cached is not None:
            return cached

        effective_model = model or self.llm or self.default_model
        try:
            agent = self._factory(
                model=effective_model,
                system_prompt=instructions,
                tools=effective_tools,
                subagents=effective_subagents,
            )
        except TypeError:
            try:
                agent = self._factory(
                    model=effective_model,
                    instructions=instructions,
                    tools=effective_tools,
                    subagents=effective_subagents,
                )
            except TypeError:
                # Compatibility fallback for older DeepAgent signature variants.
                agent = self._factory(
                    model=effective_model,
                    prompt=instructions,
                    tools=effective_tools,
                    subagents=effective_subagents,
                )

        self._agent_cache[cache_key] = agent
        return agent

    async def invoke(self, agent: Any, user_message: str) -> DeepAgentInvocationResult:
        if agent is None:
            return DeepAgentInvocationResult(
                success=False,
                content="",
                raw=None,
                error="agent_not_initialized",
            )

        payload = {
            "messages": [
                {"role": "user", "content": user_message},
            ]
        }

        try:
            if hasattr(agent, "ainvoke"):
                raw = await agent.ainvoke(payload)
            elif hasattr(agent, "invoke"):
                raw = await asyncio.to_thread(agent.invoke, payload)
            else:
                return DeepAgentInvocationResult(
                    success=False,
                    content="",
                    raw=None,
                    error="agent_missing_invoke",
                )

            content = self._extract_text(raw)
            return DeepAgentInvocationResult(
                success=True,
                content=content,
                raw=raw,
            )
        except Exception as exc:
            logger.warning("DeepAgent invocation failed: %s", exc)
            return DeepAgentInvocationResult(
                success=False,
                content="",
                raw=None,
                error=str(exc),
            )

    def _extract_text(self, payload: Any) -> str:
        # DeepAgent typically returns a dict with a "messages" list.
        if isinstance(payload, dict):
            messages = payload.get("messages")
            if isinstance(messages, list) and messages:
                extracted = self._extract_text(messages[-1])
                if extracted:
                    return extracted

            content = payload.get("content")
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                parts: List[str] = []
                for item in content:
                    if isinstance(item, dict) and isinstance(item.get("text"), str):
                        parts.append(item["text"])
                    elif isinstance(item, str):
                        parts.append(item)
                if parts:
                    return "\n".join(parts).strip()

        if isinstance(payload, list) and payload:
            return self._extract_text(payload[-1])

        if hasattr(payload, "content"):
            content_value = getattr(payload, "content")
            if isinstance(content_value, str):
                return content_value
            if isinstance(content_value, list):
                parts = []
                for item in content_value:
                    if isinstance(item, dict) and isinstance(item.get("text"), str):
                        parts.append(item["text"])
                    elif isinstance(item, str):
                        parts.append(item)
                if parts:
                    return "\n".join(parts).strip()

        if isinstance(payload, str):
            return payload

        return str(payload) if payload is not None else ""
