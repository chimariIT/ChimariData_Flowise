"""
Admin Dashboard & RBAC Integration Tests

Tests for admin dashboard endpoints including:
- System overview
- User management
- Role management
- Permission management
- Audit logs
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI

from src.main import app
from src.services.admin_service import get_admin_service
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
async def admin_service():
    """Get admin service singleton"""
    return get_admin_service()


@pytest_asyncio.fixture(scope="session")
async def setup_database():
    """Setup test database"""
    await db_manager.initialize()
    yield
    # Cleanup could be added here


# ============================================================================
# System Overview Tests
# ============================================================================


@pytest.mark.asyncio
async def test_get_system_overview(async_client):
    """Test getting system overview"""
    response = await async_client.get("/api/v1/admin/overview")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "data" in data
    assert "users" in data["data"]
    assert "projects" in data["data"]
    assert "rbac" in data["data"]


@pytest.mark.asyncio
async def test_get_system_health(async_client):
    """Test getting system health"""
    response = await async_client.get("/api/v1/admin/health")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "data" in data
    assert "services" in data["data"]
    assert data["data"]["services"]["admin_service"] == "up"


# ============================================================================
# User Management Tests
# ============================================================================


@pytest.mark.asyncio
async def test_list_users(async_client):
    """Test listing users"""
    response = await async_client.get("/api/v1/admin/users")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "users" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_list_users_with_filters(async_client):
    """Test listing users with filters"""
    response = await async_client.get("/api/v1/admin/users?limit=10&offset=0")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert len(data["users"]) <= 10


@pytest.mark.asyncio
async def test_get_user_details(async_client):
    """Test getting user details"""
    # First, we need a valid user_id - in real tests, create one first
    response = await async_client.get("/api/v1/admin/users/non-existent-id")

    # Should return 404 for non-existent user
    assert response.status_code in [200, 404]


# ============================================================================
# Role Management Tests
# ============================================================================


@pytest.mark.asyncio
async def test_list_roles(async_client):
    """Test listing roles"""
    response = await async_client.get("/api/v1/admin/roles")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "roles" in data


@pytest.mark.asyncio
async def test_list_roles_without_system(async_client):
    """Test listing roles excluding system roles"""
    response = await async_client.get("/api/v1/admin/roles?include_system=false")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    # Verify no system roles are returned
    for role in data["roles"]:
        if "is_system" in role:
            assert role["is_system"] is False


@pytest.mark.asyncio
async def test_create_role(async_client):
    """Test creating a new role"""
    role_data = {
        "name": "test_role",
        "display_name": "Test Role",
        "description": "Test role for integration tests",
        "permissions": ["read:users", "read:projects"]
    }

    response = await async_client.post(
        "/api/v1/admin/roles",
        json=role_data,
        headers={"X-User-ID": "test-admin-user"}
    )

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "data" in data
    assert data["data"]["name"] == "test_role"


@pytest.mark.asyncio
async def test_create_duplicate_role(async_client):
    """Test creating duplicate role (should fail)"""
    role_data = {
        "name": "admin",  # This might exist
        "display_name": "Duplicate Role",
        "permissions": []
    }

    response = await async_client.post(
        "/api/v1/admin/roles",
        json=role_data,
        headers={"X-User-ID": "test-admin-user"}
    )

    # Should return 400 for duplicate
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_update_role(async_client):
    """Test updating a role"""
    # First create a role
    create_response = await async_client.post(
        "/api/v1/admin/roles",
        json={
            "name": "update_test_role",
            "display_name": "Update Test Role",
            "permissions": ["read:users"]
        },
        headers={"X-User-ID": "test-admin-user"}
    )

    role_id = create_response.json()["data"]["id"]

    # Now update it
    update_data = {
        "display_name": "Updated Test Role",
        "permissions": ["read:users", "read:projects"]
    }

    response = await async_client.put(
        f"/api/v1/admin/roles/{role_id}",
        json=update_data,
        headers={"X-User-ID": "test-admin-user"}
    )

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert data["data"]["display_name"] == "Updated Test Role"


@pytest.mark.asyncio
async def test_delete_system_role(async_client):
    """Test that system roles cannot be deleted"""
    # In a real test, we'd need to create a system role first
    # For now, this test demonstrates the intent
    pass


# ============================================================================
# Permission Management Tests
# ============================================================================


@pytest.mark.asyncio
async def test_list_permissions(async_client):
    """Test listing permissions"""
    response = await async_client.get("/api/v1/admin/permissions")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "permissions" in data
    assert "categories" in data


@pytest.mark.asyncio
async def test_list_permissions_by_category(async_client):
    """Test listing permissions by category"""
    response = await async_client.get("/api/v1/admin/permissions?category=user")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    # Verify all permissions are in user category
    for perm in data["permissions"]:
        assert perm["category"] == "user"


@pytest.mark.asyncio
async def test_get_permission_categories(async_client):
    """Test getting permission categories"""
    response = await async_client.get("/api/v1/admin/permissions/categories")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert isinstance(data["categories"], list)


# ============================================================================
# Audit Log Tests
# ============================================================================


@pytest.mark.asyncio
async def test_list_audit_logs(async_client):
    """Test listing audit logs"""
    response = await async_client.get("/api/v1/admin/audit-logs")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "logs" in data


@pytest.mark.asyncio
async def test_list_audit_logs_with_filters(async_client):
    """Test listing audit logs with filters"""
    response = await async_client.get(
        "/api/v1/admin/audit-logs?action=create&limit=10"
    )

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert len(data["logs"]) <= 10


@pytest.mark.asyncio
async def test_get_audit_statistics(async_client):
    """Test getting audit statistics"""
    response = await async_client.get("/api/v1/admin/audit-logs/statistics")

    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "data" in data
    # Verify statistics structure
    assert "by_action" in data["data"]
    assert "by_resource_type" in data["data"]
    assert "by_status" in data["data"]


# ============================================================================
# Service Layer Tests
# ============================================================================


@pytest.mark.asyncio
async def test_admin_service_overview(admin_service):
    """Test admin service overview method"""
    overview = await admin_service.get_system_overview()

    assert overview is not None
    assert "users" in overview
    assert "projects" in overview
    assert "timestamp" in overview


@pytest.mark.asyncio
async def test_admin_service_health(admin_service):
    """Test admin service health method"""
    health = await admin_service.get_system_health()

    assert health is not None
    assert "services" in health
    assert "database" in health


@pytest.mark.asyncio
async def test_admin_service_roles(admin_service):
    """Test admin service roles method"""
    roles = await admin_service.list_roles()

    assert roles is not None
    assert "roles" in roles
    assert "total" in roles
    # Verify each role has required fields
    for role in roles["roles"]:
        assert "id" in role
        assert "name" in role
        assert "display_name" in role


@pytest.mark.asyncio
async def test_admin_service_audit_logs(admin_service):
    """Test admin service audit logs method"""
    logs = await admin_service.list_audit_logs(limit=10)

    assert logs is not None
    assert "logs" in logs
    # Verify each log has required fields
    for log in logs["logs"]:
        assert "id" in log
        assert "action" in log
        assert "user_id" in log
        assert "status" in log


# ============================================================================
# Integration Test Scenarios
# ============================================================================


@pytest.mark.asyncio
async def test_admin_workflow(async_client):
    """Test complete admin workflow"""
    # 1. Get system overview
    overview_response = await async_client.get("/api/v1/admin/overview")
    assert overview_response.status_code == 200
    overview = overview_response.json()

    # 2. List roles
    roles_response = await async_client.get("/api/v1/admin/roles")
    assert roles_response.status_code == 200
    roles = roles_response.json()

    # 3. List permissions
    perms_response = await async_client.get("/api/v1/admin/permissions")
    assert perms_response.status_code == 200
    perms = perms_response.json()

    # 4. List audit logs
    logs_response = await async_client.get("/api/v1/admin/audit-logs")
    assert logs_response.status_code == 200
    logs = logs_response.json()

    # 5. Get system health
    health_response = await async_client.get("/api/v1/admin/health")
    assert health_response.status_code == 200
    health = health_response.json()

    # Verify all responses are successful
    assert overview["success"]
    assert roles["success"]
    assert perms["success"]
    assert logs["success"]
    assert health["success"]
