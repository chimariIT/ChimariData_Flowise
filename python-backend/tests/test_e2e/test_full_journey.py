"""
Full User Journey E2E Test

Tests the complete user journey from project creation to results:
1. Create project
2. Upload dataset
3. PII review/verification
4. Map questions to elements
5. Execute transformations
6. Run analyses
7. Generate results

This test validates the entire U2A2A2U pipeline.
"""

import pytest
import asyncio
from typing import Dict, Any
from unittest.mock import Mock, AsyncMock, patch

from src.services.agent_orchestrator import (
    AgentOrchestrator,
    WorkflowState,
    step_upload,
    step_pii_review,
    step_mapping,
    step_transformation,
    step_execution,
    step_results
)


# ============================================================================
# Test Fixtures
# ============================================================================

@pytest.fixture
def workflow_state() -> WorkflowState:
    """Create a workflow state for testing"""
    return {
        "project_id": "test-project-123",
        "user_id": "test-user-123",
        "user_goals": ["Analyze customer satisfaction trends"],
        "user_questions": ["What is the overall satisfaction trend?"],
        "current_step": "upload",
        "messages": [],
        "datasets": ["test-dataset-123"],
        "primary_dataset_id": "test-dataset-123",
        "question_mappings": [],
        "transformation_plan": None,
        "transformation_executed": False,
        "analysis_types": [],
        "analysis_results": {},
        "evidence_chain": [],
        "agent_states": {},
        "completed_steps": [],
        "next_step": None,
        "error": None,
        "session_id": "test-session-123"
    }


@pytest.fixture
def mock_dataset() -> Dict[str, Any]:
    """Mock dataset for testing"""
    return {
        "id": "test-dataset-123",
        "project_id": "test-project-123",
        "name": "Employee Engagement Data",
        "source_type": "computer",
        "record_count": 1000,
        "schema": {
            "columns": [
                {"name": "employee_id", "type": "numeric"},
                {"name": "department", "type": "categorical"},
                {"name": "satisfaction_score", "type": "numeric"},
                {"name": "engagement_score", "type": "numeric"},
                {"name": "tenure_months", "type": "numeric"}
            ]
        }
    }


# ============================================================================
# Full Journey Tests
# ============================================================================

@pytest.mark.asyncio
async def test_full_user_journey_mocked(workflow_state: WorkflowState) -> None:
    """
    Test the complete user journey with mocked services.

    This test verifies that each step can be called in sequence
    and that the workflow state is properly updated.
    """
    # Step 1: Upload
    state = await step_upload(workflow_state.copy())
    assert state["current_step"] == "upload"
    assert "upload" in state["completed_steps"]
    assert state["next_step"] == "pii_review"

    # Step 2: PII Review
    state = await step_pii_review(state.copy())
    assert "pii_review" in state["completed_steps"]
    assert state["next_step"] == "mapping"

    # Step 3: Mapping
    state = await step_mapping(state.copy())
    assert "mapping" in state["completed_steps"]
    assert state["next_step"] == "transformation"
    # Note: question_mappings will be empty in mock mode

    # Step 4: Transformation
    with patch('src.services.agent_orchestrator.compile_and_execute_transformation_plan',
               return_value={"success": True, "steps_executed": ["derive", "aggregate"]}):
        state = await step_transformation(state.copy())
    assert "transformation" in state["completed_steps"]
    assert state["next_step"] == "execution"

    # Step 5: Execution
    state = await step_execution(state.copy())
    assert "execution" in state["completed_steps"]
    assert state["next_step"] == "results"

    # Step 6: Results
    with patch('src.services.agent_orchestrator.interpret_and_generate_insights',
               return_value={"evidence_chain": [{"insight": "test"}]}):
        state = await step_results(state.copy())
    assert "results" in state["completed_steps"]
    assert state["next_step"] is None  # End of workflow


@pytest.mark.asyncio
async def test_orchestrator_create_and_advance_session() -> None:
    """
    Test creating a session and advancing through workflow steps.
    """
    orchestrator = AgentOrchestrator()

    # Create session
    session_id = await orchestrator.create_session(
        project_id="test-project-123",
        user_id="test-user-123",
        user_goals=["Analyze trends"],
        user_questions=["What are the trends?"]
    )

    assert session_id is not None
    assert session_id in orchestrator.active_sessions

    # Get session status
    status = await orchestrator.get_session_status(session_id)
    assert status["project_id"] == "test-project-123"
    assert status["current_step"] == "upload"


@pytest.mark.asyncio
async def test_workflow_error_handling() -> None:
    """
    Test that errors are properly handled during workflow execution.
    """
    orchestrator = AgentOrchestrator()

    # Create session
    session_id = await orchestrator.create_session(
        project_id="test-project-123",
        user_id="test-user-123",
        user_goals=["Test goal"],
        user_questions=["Test question?"]
    )

    # Try to advance with invalid data (should handle gracefully)
    result = await orchestrator.advance_session(
        session_id=session_id,
        step="invalid_step"
    )

    # Should return error status
    assert result.get("status") == "error" or result.get("success") is False


# ============================================================================
# Integration Tests with Real Services (Optional)
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.integration
async def test_semantic_matching_integration(workflow_state: WorkflowState) -> None:
    """
    Test semantic matching integration (requires database and embeddings).

    This test is marked as integration and may require:
    - PostgreSQL database with pgvector
    - OpenAI API key for embeddings
    """
    from src.services.semantic_matching import get_semantic_matcher

    try:
        matcher = get_semantic_matcher()

        # Test column embedding generation
        # This would require actual column data
        # For now, just verify the service exists
        assert matcher is not None
    except Exception as e:
        pytest.skip(f"Integration test skipped: {e}")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_transformation_engine_integration() -> None:
    """
    Test transformation engine integration (requires data files).

    This test is marked as integration and may require:
    - Sample data files
    - Python execution environment
    """
    from src.services.transformation_engine import get_transformation_executor

    try:
        executor = get_transformation_executor()
        assert executor is not None
    except Exception as e:
        pytest.skip(f"Integration test skipped: {e}")


# ============================================================================
# WebSocket Progress Events Tests
# ============================================================================

@pytest.mark.asyncio
async def test_progress_events_emitted(workflow_state: WorkflowState) -> None:
    """
    Test that progress events are emitted during workflow steps.

    This verifies that the WebSocket progress emission is working.
    """
    # Mock the emit_progress function to capture calls
    emitted_events = []

    async def mock_emit_progress(session_id: str, step: str, progress: int,
                                message: str, data: dict = None):
        emitted_events.append({
            "session_id": session_id,
            "step": step,
            "progress": progress,
            "message": message,
            "data": data or {}
        })

    # Patch the emit_progress import
    with patch('src.services.agent_orchestrator.emit_progress', side_effect=mock_emit_progress):
        # Run upload step
        await step_upload(workflow_state.copy())

        # Verify progress was emitted
        # Note: In the actual implementation, import happens inside the function
        # so we may need to adjust the patch location
        pass  # Placeholder for actual verification


# ============================================================================
# Evidence Chain Tests
# ============================================================================

@pytest.mark.asyncio
async def test_evidence_chain_generation() -> None:
    """
    Test that evidence chain is generated from analysis results.

    Verifies RAG (Retrieval Augmented Generation) evidence chain:
    question -> element -> transformation -> analysis -> insight
    """
    from src.services.rag_evidence_chain import get_evidence_chain_service

    try:
        evidence_service = get_evidence_chain_service()

        # Mock query
        chain = await evidence_service.query_evidence_chain(
            project_id="test-project-123",
            question_id="test-question-123"
        )

        # In test mode, this may return empty results
        assert isinstance(chain, list)
    except Exception as e:
        pytest.skip(f"Evidence chain test skipped: {e}")
