"""
API Layer Tests - Billing Routes

Tests billing endpoints including subscription tiers, invoices, and campaigns.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from pydantic import BaseModel


class CreateTierRequest(BaseModel):
    """Test request for creating a tier"""
    display_name: str = "Basic"
    monthly_price_usd: float = 9.99
    features: list[str] = ["10 analyses/month", "3 concurrent projects"]
    analysis_limit: int = 10
    projects_limit: int = 3


@pytest.fixture
async def app():
    """Create FastAPI app fixture"""
    from src import main
    return main.app


@pytest.mark.asyncio
class TestBillingRoutes:
    """Test cases for billing routes"""

    async def test_get_billing_overview(self, app):
        """Test getting billing overview"""
        # Test at root path without /api/v1 prefix since app includes it
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/billing/overview")

            assert response.status_code == 200
            data = response.json()

            assert data["success"] is True
            assert "data" in data
            assert "total_revenue" in data["data"]
            assert "active_campaigns_count" in data["data"]

    @pytest.mark.asyncio
    async def test_get_tiers(self, app):
        """Test getting all subscription tiers"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/billing/tiers")

            assert response.status_code == 200
            data = response.json()

            assert data["success"] is True
            assert "tiers" in data
            assert "count" in data
            assert isinstance(data["tiers"], list)

    @pytest.mark.asyncio
    async def test_get_tiers_inactive(self, app):
        """Test getting all subscription tiers including inactive"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/billing/tiers", params={"active_only": "false"})

            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_create_campaign(self, app):
        """Test creating a billing campaign"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            request_data = {
                "name": "Summer Sale",
                "code": "SUMMER24",
                "discount_percentage": 20.0,
                "description": "20% off for summer",
                "start_date": "2024-06-01",
                "end_date": "2024-08-31",
                "max_uses": 100,
            }

            response = await client.post("/api/v1/billing/campaigns", json=request_data)

            assert response.status_code == 201
            data = response.json()

            assert data["success"] is True
            assert "data" in data
            assert data["data"]["code"] == "SUMMER24"

    @pytest.mark.asyncio
    async def test_get_campaigns(self, app):
        """Test getting all campaigns"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/billing/campaigns")

            assert response.status_code == 200
            data = response.json()

            assert data["success"] is True
            assert "data" in data
            assert "count" in data

    @pytest.mark.asyncio
    async def test_stripe_webhook(self, app):
        """Test Stripe webhook endpoint"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/v1/billing/stripe/webhook", json={})

            assert response.status_code == 200
            data = response.json()

            assert data["success"] is True
            assert "message" in data

    @pytest.mark.asyncio
    async def test_health_check_includes_billing(self, app):
        """Test that health check includes billing service"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health")

            assert response.status_code == 200
            data = response.json()

            services = data.get("services", {})
            assert "billing_service" in services
            assert services["billing_service"] == "up"
