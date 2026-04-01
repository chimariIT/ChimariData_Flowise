"""
Billing Integration Tests

Tests for billing endpoints including:
- Subscription tiers
- Invoices
- Campaigns
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI

from src.main import app
from src.services.billing_service import get_billing_service
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
async def billing_service():
    """Get billing service singleton"""
    return get_billing_service()


@pytest_asyncio.fixture(scope="session")
async def setup_database():
    """Setup test database"""
    await db_manager.initialize()
    yield
    # Cleanup could be added here


# ============================================================================
# Subscription Tier Tests
# ============================================================================


@pytest.mark.asyncio
async def test_get_subscription_tiers(async_client):
    """Test getting subscription tiers"""
    response = await async_client.get("/api/v1/billing/tiers")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "data" in data


@pytest.mark.asyncio
async def test_create_subscription_tier(async_client):
    """Test creating a subscription tier"""
    tier_data = {
        "display_name": "Test Tier",
        "monthly_price_usd": 9.99,
        "features": [
            "Basic analysis features",
            "10 projects",
            "100 analyses per month"
        ],
        "analysis_limit": 100,
        "projects_limit": 10
    }

    response = await async_client.post(
        "/api/v1/billing/tiers",
        json=tier_data,
        headers={"X-User-ID": "test-admin-user"}
    )

    assert response.status_code == 200 or response.status_code == 201
    data = response.json()

    # Check for duplicate name error
    if response.status_code != 200:
        assert "error" in data


@pytest.mark.asyncio
async def test_create_subscription_tier_invalid_price(async_client):
    """Test creating tier with invalid price"""
    tier_data = {
        "display_name": "Invalid Tier",
        "monthly_price_usd": -10.00,  # Negative price
        "features": [],
    }

    response = await async_client.post(
        "/api/v1/billing/tiers",
        json=tier_data,
        headers={"X-User-ID": "test-admin-user"}
    )

    # Should return 422 for validation error
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_update_subscription_tier(async_client):
    """Test updating a subscription tier"""
    # First, we need to create a tier
    create_response = await async_client.post(
        "/api/v1/billing/tiers",
        json={
            "display_name": "Update Test Tier",
            "monthly_price_usd": 19.99,
            "features": ["Updated features"]
        },
        headers={"X-User-ID": "test-admin-user"}
    )

    assert create_response.status_code == 200
    tier_id = create_response.json()["data"]["id"]

    # Now update it
    update_data = {
        "display_name": "Updated Tier Name",
        "monthly_price_usd": 29.99
    }

    response = await async_client.put(
        f"/api/v1/billing/tiers/{tier_id}",
        json=update_data,
        headers={"X-User-ID": "test-admin-user"}
    )

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True


@pytest.mark.asyncio
async def test_delete_subscription_tier(async_client):
    """Test deleting a subscription tier"""
    # Create a tier first
    create_response = await async_client.post(
        "/api/v1/billing/tiers",
        json={
            "display_name": "Deletable Tier",
            "monthly_price_usd": 5.00,
            "features": []
        },
        headers={"X-User-ID": "test-admin-user"}
    )

    assert create_response.status_code == 200
    tier_id = create_response.json()["data"]["id"]

    # Now delete it
    response = await async_client.delete(
        f"/api/v1/billing/tiers/{tier_id}",
        headers={"X-User-ID": "test-admin-user"}
    )

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "message" in data


# ============================================================================
# Invoice Tests
# ============================================================================


@pytest.mark.asyncio
async def test_list_invoices(async_client):
    """Test listing invoices"""
    response = await async_client.get("/api/v1/billing/invoices?limit=10&offset=0")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "invoices" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_list_invoices_by_status(async_client):
    """Test listing invoices by status"""
    response = await async_client.get("/api/v1/billing/invoices?status=paid")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    # Verify all invoices are paid
    for invoice in data.get("invoices", []):
        assert invoice.get("status") == "paid"


@pytest.mark.asyncio
async def test_list_invoices_by_user(async_client):
    """Test listing invoices by user"""
    response = await async_client.get("/api/v1/billing/invoices?user_id=test-user-id")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True


# ============================================================================
# Campaign Tests
# ============================================================================


@pytest.mark.asyncio
async def test_list_campaigns(async_client):
    """Test listing campaigns"""
    response = await async_client.get("/api/v1/billing/campaigns")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "campaigns" in data


@pytest.mark.asyncio
async def test_list_active_campaigns(async_client):
    """Test listing only active campaigns"""
    response = await async_client.get("/api/v1/billing/campaigns?active=true")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    # Verify all campaigns are active
    for campaign in data.get("campaigns", []):
        assert campaign.get("active") is True


@pytest.mark.asyncio
async def test_create_campaign(async_client):
    """Test creating a new campaign"""
    from datetime import datetime, timedelta

    campaign_data = {
        "name": "Test Campaign",
        "code": "TEST2026",
        "discount_percentage": 25.0,
        "description": "Test discount for integration testing",
        "start_date": (datetime.utcnow() - timedelta(days=1)).isoformat(),
        "end_date": (datetime.utcnow() + timedelta(days=30)).isoformat(),
        "max_uses": 100
    }

    response = await async_client.post(
        "/api/v1/billing/campaigns",
        json=campaign_data,
        headers={"X-User-ID": "test-admin-user"}
    )

    assert response.status_code == 200 or response.status_code == 201
    data = response.json()

    # Check for duplicate code error
    if response.status_code != 200:
        assert "error" in data


@pytest.mark.asyncio
async def test_create_campaign_invalid_dates(async_client):
    """Test creating campaign with invalid dates"""
    campaign_data = {
        "name": "Invalid Dates Campaign",
        "code": "INVALID2026",
        "discount_percentage": 10.0,
        "start_date": "2026-03-10",  # Start after end
        "end_date": "2026-03-01"     # End before start
    }

    response = await async_client.post(
        "/api/v1/billing/campaigns",
        json=campaign_data,
        headers={"X-User-ID": "test-admin-user"}
    )

    # Should return 422 for validation error
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_update_campaign(async_client):
    """Test updating a campaign"""
    # First, create a campaign
    create_response = await async_client.post(
        "/api/v1/billing/campaigns",
        json={
            "name": "Update Test Campaign",
            "code": "UPDATETEST",
            "discount_percentage": 20.0,
            "start_date": "2026-03-01T00:00:00Z",
            "end_date": "2026-04-01T00:00:00Z",
            "max_uses": 500
        },
        headers={"X-User-ID": "test-admin-user"}
    )

    assert create_response.status_code == 200
    campaign_id = create_response.json()["data"]["id"]

    # Now update it
    update_data = {
        "discount_percentage": 30.0,
        "max_uses": 1000
    }

    response = await async_client.put(
        f"/api/v1/billing/campaigns/{campaign_id}",
        json=update_data,
        headers={"X-User-ID": "test-admin-user"}
    )

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True


@pytest.mark.asyncio
async def test_delete_campaign(async_client):
    """Test deleting a campaign"""
    # Create a campaign first
    create_response = await async_client.post(
        "/api/v1/billing/campaigns",
        json={
            "name": "Deletable Campaign",
            "code": "DELTEST2026",
            "discount_percentage": 15.0,
            "start_date": "2026-03-01T00:00:00Z",
            "end_date": "2026-04-01T00:00:00Z"
        },
        headers={"X-User-ID": "test-admin-user"}
    )

    assert create_response.status_code == 200
    campaign_id = create_response.json()["data"]["id"]

    # Now delete it
    response = await async_client.delete(
        f"/api/v1/billing/campaigns/{campaign_id}",
        headers={"X-User-ID": "test-admin-user"}
    )

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "message" in data


# ============================================================================
# Service Layer Tests
# ============================================================================


@pytest.mark.asyncio
async def test_billing_service_get_tiers(billing_service):
    """Test billing service get tiers method"""
    tiers = await billing_service.get_subscription_tiers()

    assert tiers is not None
    assert isinstance(tiers, list)


@pytest.mark.asyncio
async def test_billing_service_create_tier(billing_service):
    """Test billing service create tier method"""
    result = await billing_service.create_subscription_tier({
        "display_name": "Service Test Tier",
        "monthly_price_usd": 14.99,
        "features": ["Feature 1", "Feature 2"],
        "analysis_limit": 50,
        "projects_limit": 5
    })

    assert result is not None
    assert "tier_id" in result


@pytest.mark.asyncio
async def test_billing_service_get_invoices(billing_service):
    """Test billing service get invoices method"""
    invoices = await billing_service.list_invoices(limit=10)

    assert invoices is not None
    assert isinstance(invoices, list)


@pytest.mark.asyncio
async def test_billing_service_get_campaigns(billing_service):
    """Test billing service get campaigns method"""
    campaigns = await billing_service.list_campaigns(active=True)

    assert campaigns is not None
    assert isinstance(campaigns, list)


# ============================================================================
# Integration Test Scenarios
# ============================================================================


@pytest.mark.asyncio
async def test_billing_workflow(async_client):
    """Test complete billing workflow"""
    # 1. Get subscription tiers
    tiers_response = await async_client.get("/api/v1/billing/tiers")
    assert tiers_response.status_code == 200

    # 2. Get invoices
    invoices_response = await async_client.get("/api/v1/billing/invoices?limit=5")
    assert invoices_response.status_code == 200

    # 3. Get active campaigns
    campaigns_response = await async_client.get("/api/v1/billing/campaigns?active=true")
    assert campaigns_response.status_code == 200

    # 4. Create a test campaign
    campaign_response = await async_client.post(
        "/api/v1/billing/campaigns",
        json={
            "name": "Integration Test Campaign",
            "code": "INTEGTEST",
            "discount_percentage": 10.0,
            "start_date": "2026-03-07T00:00:00Z",
            "end_date": "2026-04-07T00:00:00Z"
        },
        headers={"X-User-ID": "test-admin-user"}
    )
    assert campaign_response.status_code == 200

    # Verify all operations completed successfully
    assert tiers_response.json()["success"]
    assert invoices_response.json()["success"]
    assert campaigns_response.json()["success"]
    assert campaign_response.json()["success"]
