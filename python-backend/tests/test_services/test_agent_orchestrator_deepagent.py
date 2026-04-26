import pytest

from src.models.schemas import AgentType
from src.services.agent_orchestrator import AgentOrchestrator
from src.services.deepagent_runtime import DeepAgentInvocationResult


class _CapturingDeepRuntime:
    def __init__(self) -> None:
        self.enabled = True
        self.availability_error = None
        self.last_create_kwargs = None
        self.last_user_message = None

    def is_available(self) -> bool:
        return True

    def create_agent(self, **kwargs):
        self.last_create_kwargs = kwargs
        class _AgentObject:
            def invoke(self, payload):
                return payload

        return _AgentObject()

    async def invoke(self, agent, user_message: str) -> DeepAgentInvocationResult:
        self.last_user_message = user_message
        return DeepAgentInvocationResult(
            success=True,
            content="DeepAgent completed task",
            raw={"messages": [{"role": "assistant", "content": "DeepAgent completed task"}]},
            error=None,
        )


def test_project_manager_builds_specialist_subagents() -> None:
    orchestrator = AgentOrchestrator()
    fake_runtime = _CapturingDeepRuntime()
    orchestrator.deepagent_runtime = fake_runtime  # type: ignore[assignment]

    _ = orchestrator.create_agent_with_tools(AgentType.PROJECT_MANAGER)

    assert fake_runtime.last_create_kwargs is not None
    subagents = fake_runtime.last_create_kwargs.get("subagents", [])
    subagent_names = [item.get("name") for item in subagents if isinstance(item, dict)]
    assert "data_engineer" in subagent_names
    assert "data_scientist" in subagent_names
    assert "business_agent" in subagent_names


@pytest.mark.asyncio
async def test_run_agent_task_prefers_deepagent_runtime() -> None:
    orchestrator = AgentOrchestrator()
    fake_runtime = _CapturingDeepRuntime()
    orchestrator.deepagent_runtime = fake_runtime  # type: ignore[assignment]

    result = await orchestrator.run_agent_task(
        agent_type=AgentType.DATA_SCIENTIST,
        task="Explain which metric is best grounded.",
        context={"projectId": "proj_123"},
    )

    assert result.get("success") is True
    assert result.get("runtime") == "deepagent"
    assert "DeepAgent completed task" in str(result.get("response", ""))
    assert "Context JSON" in str(fake_runtime.last_user_message)
