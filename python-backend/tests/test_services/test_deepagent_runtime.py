import pytest

from src.services.deepagent_runtime import DeepAgentRuntime


class _DummyAgent:
    def __init__(self) -> None:
        self.calls = []

    def invoke(self, payload):
        self.calls.append(payload)
        return {"messages": [{"role": "assistant", "content": "grounded response"}]}


def test_runtime_disabled_by_config() -> None:
    runtime = DeepAgentRuntime(enabled=False)
    assert runtime.is_available() is False
    assert runtime.availability_error == "disabled_by_config"


def test_create_agent_uses_cache() -> None:
    runtime = DeepAgentRuntime(enabled=False)
    runtime.enabled = True

    created = []

    def _factory(**kwargs):
        created.append(kwargs)
        return _DummyAgent()

    runtime._factory = _factory

    agent_a = runtime.create_agent(
        name="data_scientist",
        instructions="You are a data scientist.",
        tools=[],
        subagents=[],
    )
    agent_b = runtime.create_agent(
        name="data_scientist",
        instructions="You are a data scientist.",
        tools=[],
        subagents=[],
    )

    assert agent_a is agent_b
    assert len(created) == 1
    assert created[0]["system_prompt"] == "You are a data scientist."


@pytest.mark.asyncio
async def test_runtime_invocation_extracts_text() -> None:
    runtime = DeepAgentRuntime(enabled=False)
    runtime.enabled = True
    runtime._factory = lambda **_: _DummyAgent()

    agent = runtime.create_agent(
        name="customer_support",
        instructions="You are support.",
        tools=[],
        subagents=[],
    )
    result = await runtime.invoke(agent, "How do I upload data?")

    assert result.success is True
    assert "grounded response" in result.content
    assert isinstance(result.raw, dict)
