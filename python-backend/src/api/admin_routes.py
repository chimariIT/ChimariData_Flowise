"""
Admin Dashboard API Routes

Endpoints for admin dashboard operations including:
- System overview
- User management with RBAC
- Role and permission management
- Audit log viewing
- Service configuration
"""

from fastapi import APIRouter, HTTPException, status, Header
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from ..services.admin_service import get_admin_service


# ============================================================================
# Request/Response Models
# ============================================================================


class CreateRoleRequest(BaseModel):
    """Request model for creating a role"""
    name: str = Field(..., min_length=2, max_length=100, description="Role name (unique)")
    display_name: str = Field(..., min_length=2, max_length=100, description="Display name")
    description: Optional[str] = Field(None, description="Role description")
    permissions: Optional[List[str]] = Field(default_factory=list, description="List of permissions")


class UpdateRoleRequest(BaseModel):
    """Request model for updating a role"""
    display_name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = None
    permissions: Optional[List[str]] = None


class AssignRoleRequest(BaseModel):
    """Request model for assigning a role to user"""
    role_id: str = Field(..., description="Role ID")
    expires_at: Optional[datetime] = Field(None, description="Optional expiry date")


class RevokeRoleRequest(BaseModel):
    """Request model for revoking a role from user"""
    role_id: str = Field(..., description="Role ID")


# ============================================================================
# Middleware for Admin Authorization
# ============================================================================


async def require_admin(user_id: str = Header(..., alias="X-User-ID")) -> dict:
    """
    Require admin authorization

    In production, this would verify JWT token and admin status.
    For now, returns user_id for development.

    Args:
        user_id: User ID from header

    Returns:
        User context dict
    """
    # TODO: In production, verify JWT and check is_admin flag
    return {"user_id": user_id, "is_admin": True}


# ============================================================================
# Router
# ============================================================================

router = APIRouter(prefix="/admin", tags=["admin"])

# Get singleton admin service
admin_service = get_admin_service()


# ============================================================================
# System Overview Endpoints
# ============================================================================


@router.get("/overview", response_model=dict)
async def get_system_overview():
    """
    Get system overview statistics for admin dashboard

    Returns counts and recent activity for:
    - Users
    - Projects
    - Datasets
    - RBAC (roles, permissions)
    - Billing (active tiers)
    - Recent activity
    """
    try:
        overview = await admin_service.get_system_overview()
        return {
            "success": True,
            "data": overview,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health", response_model=dict)
async def get_system_health():
    """
    Get system health status

    Returns health status for database and services
    """
    try:
        health = await admin_service.get_system_health()
        return {
            "success": True,
            "data": health,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# User Management Endpoints
# ============================================================================


@router.get("/users", response_model=dict)
async def list_users(
    limit: int = 50,
    offset: int = 0,
    filter_role: Optional[str] = None,
):
    """
    List users with optional role filter

    Args:
        limit: Maximum number of users (default: 50)
        offset: Number of users to skip (default: 0)
        filter_role: Optional role name to filter by

    Returns:
        List of users with their assigned roles
    """
    try:
        result = await admin_service.list_users(
            limit=limit,
            offset=offset,
            filter_role=filter_role,
        )
        return {
            "success": True,
            **result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{user_id}", response_model=dict)
async def get_user_details(user_id: str):
    """
    Get detailed information about a user

    Args:
        user_id: User ID

    Returns:
        User details including roles, permissions, and projects
    """
    try:
        user_details = await admin_service.get_user_details(user_id)

        if not user_details:
            raise HTTPException(status_code=404, detail="User not found")

        return {
            "success": True,
            "data": user_details,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/users/{user_id}/roles", status_code=status.HTTP_201_CREATED, response_model=dict)
async def assign_role_to_user(
    user_id: str,
    request: AssignRoleRequest,
    admin_context: dict = None,
):
    """
    Assign a role to a user

    Args:
        user_id: User ID
        request: Assignment request
        admin_context: Admin context (from auth middleware)

    Returns:
        Assignment result
    """
    try:
        # In production, admin_context comes from auth middleware
        assigned_by = admin_context.get("user_id", "system") if admin_context else "system"

        result = await admin_service.assign_role_to_user(
            user_id=user_id,
            role_id=request.role_id,
            assigned_by=assigned_by,
            expires_at=request.expires_at,
        )

        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/users/{user_id}/roles", response_model=dict)
async def revoke_role_from_user(
    user_id: str,
    request: RevokeRoleRequest,
    admin_context: dict = None,
):
    """
    Revoke a role from a user

    Args:
        user_id: User ID
        request: Revoke request
        admin_context: Admin context (from auth middleware)

    Returns:
        Revoke result
    """
    try:
        # In production, admin_context comes from auth middleware
        revoked_by = admin_context.get("user_id", "system") if admin_context else "system"

        result = await admin_service.revoke_role_from_user(
            user_id=user_id,
            role_id=request.role_id,
            revoked_by=revoked_by,
        )

        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Role Management Endpoints
# ============================================================================


@router.get("/roles", response_model=dict)
async def list_roles(
    include_system: bool = True,
    limit: int = 100,
    offset: int = 0,
):
    """
    List all roles

    Args:
        include_system: Include system roles (default: True)
        limit: Maximum number of roles (default: 100)
        offset: Number of roles to skip (default: 0)

    Returns:
        List of roles with user counts
    """
    try:
        result = await admin_service.list_roles(
            include_system=include_system,
            limit=limit,
            offset=offset,
        )
        return {
            "success": True,
            **result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/roles", status_code=status.HTTP_201_CREATED, response_model=dict)
async def create_role(
    request: CreateRoleRequest,
    admin_context: dict = None,
):
    """
    Create a new role

    Args:
        request: Role creation request
        admin_context: Admin context (from auth middleware)

    Returns:
        Created role
    """
    try:
        # In production, admin_context comes from auth middleware
        created_by = admin_context.get("user_id", "system") if admin_context else "system"

        result = await admin_service.create_role(
            name=request.name,
            display_name=request.display_name,
            description=request.description,
            permissions=request.permissions,
            created_by=created_by,
        )

        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/roles/{role_id}", response_model=dict)
async def update_role(
    role_id: str,
    request: UpdateRoleRequest,
    admin_context: dict = None,
):
    """
    Update a role

    Args:
        role_id: Role ID
        request: Update request
        admin_context: Admin context (from auth middleware)

    Returns:
        Updated role
    """
    try:
        # In production, admin_context comes from auth middleware
        updated_by = admin_context.get("user_id", "system") if admin_context else "system"

        # Build updates dict
        updates = {}
        if request.display_name is not None:
            updates["display_name"] = request.display_name
        if request.description is not None:
            updates["description"] = request.description
        if request.permissions is not None:
            updates["permissions"] = request.permissions

        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")

        result = await admin_service.update_role(
            role_id=role_id,
            updates=updates,
            updated_by=updated_by,
        )

        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/roles/{role_id}", response_model=dict)
async def delete_role(
    role_id: str,
    admin_context: dict = None,
):
    """
    Delete a role

    Args:
        role_id: Role ID
        admin_context: Admin context (from auth middleware)

    Returns:
        Delete result
    """
    try:
        # In production, admin_context comes from auth middleware
        deleted_by = admin_context.get("user_id", "system") if admin_context else "system"

        result = await admin_service.delete_role(
            role_id=role_id,
            deleted_by=deleted_by,
        )

        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Permission Management Endpoints
# ============================================================================


@router.get("/permissions", response_model=dict)
async def list_permissions(
    category: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
):
    """
    List all permissions

    Args:
        category: Optional category filter
        limit: Maximum number of permissions (default: 100)
        offset: Number of permissions to skip (default: 0)

    Returns:
        List of permissions by category
    """
    try:
        result = await admin_service.list_permissions(
            category=category,
            limit=limit,
            offset=offset,
        )
        return {
            "success": True,
            **result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/permissions/categories", response_model=dict)
async def get_permission_categories():
    """
    Get all permission categories

    Returns:
        List of unique category names
    """
    try:
        categories = await admin_service.get_permission_categories()
        return {
            "success": True,
            "categories": categories,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Audit Log Endpoints
# ============================================================================


@router.get("/audit-logs", response_model=dict)
async def list_audit_logs(
    limit: int = 100,
    offset: int = 0,
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    status: Optional[str] = None,
):
    """
    List audit logs with filters

    Args:
        limit: Maximum number of logs (default: 100)
        offset: Number of logs to skip (default: 0)
        user_id: Filter by user ID
        action: Filter by action type
        resource_type: Filter by resource type
        status: Filter by status

    Returns:
        List of audit logs
    """
    try:
        # Build filters
        filters = {}
        if user_id:
            filters["user_id"] = user_id
        if action:
            filters["action"] = action
        if resource_type:
            filters["resource_type"] = resource_type
        if status:
            filters["status"] = status

        result = await admin_service.list_audit_logs(
            filters=filters,
            limit=limit,
            offset=offset,
        )
        return {
            "success": True,
            **result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audit-logs/statistics", response_model=dict)
async def get_audit_log_statistics(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
):
    """
    Get audit log statistics

    Args:
        start_date: Optional start date
        end_date: Optional end date

    Returns:
        Statistics including counts by action, resource type, and status
    """
    try:
        stats = await admin_service.get_audit_log_statistics(
            start_date=start_date,
            end_date=end_date,
        )
        return {
            "success": True,
            "data": stats,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def include_admin_routes(app):
    """Include admin routes in the FastAPI app"""
    from fastapi import FastAPI

    app.include_router(router, prefix="/api/v1")
    return app
