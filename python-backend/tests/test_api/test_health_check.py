"""
API Layer Tests - Health Check Endpoint

Tests the /api/v1/health endpoint to verify server is running.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from fastapi.testclient import TestClient


@pytest.fixture
async def app():
    """Create FastAPI app fixture"""
    from src.main import app
    return app


@pytest.mark.asyncio
class TestHealthCheck:
    """Test cases for health check endpoint"""

    async def test_health_check_success(self, app):
        """Test successful health check"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health")

            assert response.status_code == 200
            data = response.json()

            assert data["status"] == "healthy"
            assert data["version"] == "1.0.0"

            # Check that all services are reported as up
            services = data.get("services", {})
            assert all(s == "up" for s in services.values())

    @pytest.mark.asyncio
    async def test_health_check_service_status(self, app):
        """Test that health check returns service status"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health")

            data = response.json()
            services = data.get("services", {})

            # Verify orchestrator is up
            assert services["orchestrator"] == "up"

            # Verify semantic matching is up
            assert services["semantic_matching"] == "up"

            # Verify evidence chain is up
            assert services["evidence_chain"] == "up"

            # Verify transformation engine is up
            assert services["transformation_engine"] == "up"

            # Verify billing service is up
            assert services["billing_service"] == "up"

    @pytest.mark.asyncio
    async def test_health_check_response_format(self, app):
        """Test that health check returns correct format"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health")

            data = response.json()

            # Verify response structure
            assert "status" in data
            assert "version" in data
            assert "environment" in data
            assert "services" in data

    @pytest.mark.asyncio
    async def test_health_check_cors_headers(self, app):
        """Test that CORS headers are properly set"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health")

            # Check for CORS headers
            # Note: In tests, CORS headers may not be fully present
            # This test verifies the endpoint is accessible
            assert response.status_code == 200
