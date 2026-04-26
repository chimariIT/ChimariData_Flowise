"""
Guardrail tests for AI query endpoint behavior.
"""

import pytest
from fastapi import HTTPException

from src.api.agent_pipeline_routes import (
    AIQueryRequest,
    AuthUser,
    _build_ai_query_prompt,
    _normalize_ai_mode,
    ai_query,
)


@pytest.mark.asyncio
async def test_ai_query_requires_real_provider(monkeypatch):
    monkeypatch.setattr("src.api.agent_pipeline_routes._has_llm_provider", lambda: False)

    request = AIQueryRequest(query="What if churn rises 5%?", mode="what_if", strictGrounding=True)
    user = AuthUser(id="u1", email="user@test.com", is_admin=False)

    with pytest.raises(HTTPException) as exc:
        await ai_query(request, user)

    assert exc.value.status_code == 503
    assert "AI providers are not configured" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_ai_query_strict_mode_requires_project_id(monkeypatch):
    monkeypatch.setattr("src.api.agent_pipeline_routes._has_llm_provider", lambda: True)

    request = AIQueryRequest(query="What if revenue drops by region?", mode="what_if", strictGrounding=True)
    user = AuthUser(id="u1", email="user@test.com", is_admin=False)

    with pytest.raises(HTTPException) as exc:
        await ai_query(request, user)

    assert exc.value.status_code == 400
    assert "projectId is required" in str(exc.value.detail)


def test_what_if_prompt_enforces_grounding_rules():
    prompt = _build_ai_query_prompt(
        query="What if engagement improves for Team A?",
        mode=_normalize_ai_mode("what_if"),
        project_context_text="Project context: Demo",
        available_columns=["engagement_score", "team_name", "quarter"],
        question_profile={"metricConcept": "engagement_score"},
        strict_grounding=True,
    )

    assert "Never invent columns" in prompt
    assert "Grounding Check" in prompt
    assert "engagement_score" in prompt
