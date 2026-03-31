"""
Knowledge Base Integration Tests

Tests for knowledge base endpoints including:
- Knowledge search
- Knowledge graph operations
- Analysis patterns
- Template feedback
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI

from src.main import app
from src.services.knowledge_service import get_knowledge_service
from src.models.database import db_manager


@pytest_asyncio.fixture
async def async_client():
    """Create async test client"""
    async with AsyncClient(
        transport=ASGITransport(app),
        base_url="http://test"
    ) as client:
        yield client


@pytest_asyncio.fixture
async def knowledge_service():
    """Get knowledge service singleton"""
    return get_knowledge_service()


@pytest_asyncio.fixture(scope="session")
async def setup_database():
    """Setup test database"""
    await db_manager.initialize()
    yield
    # Cleanup could be added here


# ============================================================================
# Knowledge Search Tests
# ============================================================================


@pytest.mark.asyncio
async def test_search_knowledge(async_client):
    """Test knowledge base search"""
    response = await async_client.post(
        "/api/v1/knowledge/search",
        json={
            "query": "data analysis",
            "node_types": ["analysis_type"],
            "limit": 10
        }
    )

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "results" in data
    assert "query" in data


@pytest.mark.asyncio
async def test_search_knowledge_empty_query(async_client):
    """Test knowledge search with empty query (should fail validation)"""
    response = await async_client.post(
        "/api/v1/knowledge/search",
        json={
            "query": "",  # Empty query
            "limit": 10
        }
    )

    # Should return 422 for validation error
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_search_knowledge_with_node_types(async_client):
    """Test knowledge search with node type filter"""
    response = await async_client.post(
        "/api/v1/knowledge/search",
        json={
            "query": "regulation",
            "node_types": ["regulation"],
            "limit": 5
        }
    )

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    # Verify all results are regulations
    for node in data.get("results", []):
        assert node["type"] == "regulation"


# ============================================================================
# Knowledge Graph Tests
# ============================================================================


@pytest.mark.asyncio
async def test_get_related_nodes(async_client):
    """Test getting related knowledge nodes"""
    # In a real test, we'd need a valid node_id
    # For now, test with a fake ID
    response = await async_client.get("/api/v1/knowledge/nodes/fake-id/related?max_depth=2")

    # Should not crash (may return 404)
    assert response.status_code in [200, 404]


@pytest.mark.asyncio
async def test_get_related_nodes_invalid_depth(async_client):
    """Test getting related nodes with invalid depth"""
    response = await async_client.get("/api/v1/knowledge/nodes/fake-id/related?max_depth=invalid")

    # Should return 422 for validation error
    assert response.status_code == 422


# ============================================================================
# Analysis Pattern Tests
# ============================================================================


@pytest.mark.asyncio
async def test_get_analysis_patterns(async_client):
    """Test getting analysis patterns"""
    response = await async_client.get("/api/v1/knowledge/patterns/correlation?limit=10")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "data" in data


@pytest.mark.asyncio
async def test_get_analysis_patterns_not_found(async_client):
    """Test getting non-existent analysis pattern"""
    response = await async_client.get("/api/v1/knowledge/patterns/non_existent_type")

    # Should return 404
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_analysis_pattern(async_client):
    """Test creating a new analysis pattern"""
    pattern_data = {
        "name": "test_correlation_pattern",
        "analysis_type": "correlation",
        "parameters": {
            "min_samples": 100,
            "confidence_threshold": 0.95
        },
        "description": "Test pattern for integration tests"
    }

    response = await async_client.post(
        "/api/v1/knowledge/patterns",
        json=pattern_data
    )

    assert response.status_code == 201
    data = response.json()

    assert data["success"] is True
    assert "data" in data


@pytest.mark.asyncio
async def test_get_most_used_patterns(async_client):
    """Test getting most used patterns"""
    response = await async_client.get("/api/v1/knowledge/patterns/most-used?limit=10")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "data" in data


# ============================================================================
# Template Feedback Tests
# ============================================================================


@pytest.mark.asyncio
async def test_get_template_feedback(async_client):
    """Test getting template feedback"""
    response = await async_client.get("/api/v1/knowledge/templates/template-id-123/feedback")

    assert response.status_code in [200, 404]  # 404 if template not found


@pytest.mark.asyncio
async def test_add_template_feedback(async_client):
    """Test adding template feedback"""
    feedback_data = {
        "template_id": "template-id-123",
        "rating": 5,
        "feedback_text": "Great template! Very helpful.",
        "suggested_improvements": "Add more examples"
    }

    response = await async_client.post(
        "/api/v1/knowledge/templates/template-id-123/feedback",
        json=feedback_data
    )

    assert response.status_code in [200, 201]
    data = response.json()

    assert data["success"] is True


@pytest.mark.asyncio
async def test_add_template_feedback_invalid_rating(async_client):
    """Test adding feedback with invalid rating"""
    feedback_data = {
        "template_id": "template-id-123",
        "rating": 6,  # Invalid: should be 1-5
        "feedback_text": "Invalid rating test"
    }

    response = await async_client.post(
        "/api/v1/knowledge/templates/template-id-123/feedback",
        json=feedback_data
    )

    # Should return 422 for validation error
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_helpful_feedback(async_client):
    """Test getting helpful feedback"""
    response = await async_client.get("/api/v1/knowledge/templates/feedback/helpful?limit=10")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "feedback" in data


# ============================================================================
# Service Layer Tests
# ============================================================================


@pytest.mark.asyncio
async def test_knowledge_service_search(knowledge_service):
    """Test knowledge service search method"""
    results = await knowledge_service.search_knowledge(
        query="test query",
        limit=5
    )

    assert isinstance(results, list)
    # Verify structure
    if results:
        assert all("id" in r for r in results)
        assert all("type" in r for r in results)


@pytest.mark.asyncio
async def test_knowledge_service_get_pattern(knowledge_service):
    """Test knowledge service get pattern method"""
    pattern = await knowledge_service.get_analysis_pattern(
        analysis_type="correlation",
        name="test_pattern",
        limit=10
    )

    assert pattern is not None
    assert "id" in pattern
    assert "analysis_type" in pattern


@pytest.mark.asyncio
async def test_knowledge_service_learn_from_analysis(knowledge_service):
    """Test knowledge service learn from analysis method"""
    result = await knowledge_service.learn_from_analysis({
        "name": "integration_test_pattern",
        "analysis_type": "regression",
        "parameters": {"test": True},
        "description": "Pattern created from integration test"
    })

    assert result is not None
    assert "pattern_id" in result
    assert "success_rate" in result


@pytest.mark.asyncio
async def test_knowledge_service_add_feedback(knowledge_service):
    """Test knowledge service add feedback method"""
    result = await knowledge_service.add_feedback(
        template_id="test-template-id",
        user_id="test-user-id",
        rating=4,
        feedback_text="Test feedback",
        suggested_improvements="None"
    )

    assert result is not None
    assert "feedback_id" in result
    assert "rating" in result


@pytest.mark.asyncio
async def test_knowledge_service_seed(knowledge_service):
    """Test knowledge service seed method"""
    result = await knowledge_service.seed_knowledge_base()

    assert result is not None
    # Should return seeding statistics
    assert "nodes_created" in result
    assert "edges_created" in result
    assert "patterns_created" in result


# ============================================================================
# Integration Test Scenarios
# ============================================================================


@pytest.mark.asyncio
async def test_knowledge_workflow(async_client):
    """Test complete knowledge base workflow"""
    # 1. Search for information
    search_response = await async_client.post(
        "/api/v1/knowledge/search",
        json={"query": "correlation analysis", "limit": 5}
    )
    assert search_response.status_code == 200

    # 2. Get analysis patterns
    patterns_response = await async_client.get("/api/v1/knowledge/patterns/correlation")
    assert patterns_response.status_code == 200

    # 3. Get helpful feedback for review
    feedback_response = await async_client.get("/api/v1/knowledge/templates/feedback/helpful")
    assert feedback_response.status_code == 200

    # Verify all operations completed successfully
    assert search_response.json()["success"]
    assert patterns_response.json()["success"]
    assert feedback_response.json()["success"]
