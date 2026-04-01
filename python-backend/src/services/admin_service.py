"""
Admin Dashboard Service

Service for admin dashboard operations including:
- System overview and statistics
- User management with RBAC
- Role and permission management
- Audit log viewing
- Service configuration
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from ..repositories.audit_log_repository import get_audit_log_repository
from ..repositories.role_repository import get_role_repository
from ..repositories.permission_repository import get_permission_repository
from ..repositories.user_role_repository import get_user_role_repository
from ..repositories.user_repository import get_user_repository
from ..repositories.project_repository import get_project_repository
from ..repositories.dataset_repository import get_dataset_repository
from ..repositories.subscription_tier_repository import get_subscription_tier_repository
from ..models.database import db_manager, Role, Permission, UserRole, generate_uuid


class AdminService:
    """
    Admin dashboard service for system administration

    Provides:
    - System overview and statistics
    - User management with RBAC
    - Role and permission management
    - Audit log viewing
    - Service configuration
    """

    def __init__(
        self,
        audit_log_repo=None,
        role_repo=None,
        permission_repo=None,
        user_role_repo=None,
        user_repo=None,
        project_repo=None,
        dataset_repo=None,
        tier_repo=None,
    ):
        self.audit_log_repo = audit_log_repo or get_audit_log_repository(db_manager)
        self.role_repo = role_repo or get_role_repository(db_manager)
        self.permission_repo = permission_repo or get_permission_repository(db_manager)
        self.user_role_repo = user_role_repo or get_user_role_repository(db_manager)
        self.user_repo = user_repo or get_user_repository(db_manager)
        self.project_repo = project_repo or get_project_repository(db_manager)
        self.dataset_repo = dataset_repo or get_dataset_repository(db_manager)
        self.tier_repo = tier_repo or get_subscription_tier_repository(db_manager)

    # ========================================================================
    # System Overview
    # ========================================================================

    async def get_system_overview(self) -> Dict[str, Any]:
        """
        Get system overview statistics for dashboard

        Returns:
            System overview with counts and statistics
        """
        # Get counts
        total_users = await self.user_repo.count()
        total_projects = await self.project_repo.count()
        total_datasets = await self.dataset_repo.count()
        total_roles = await self.role_repo.count()
        total_permissions = await self.permission_repo.count()

        # Get recent activity
        recent_logs = await self.audit_log_repo.find_recent(hours=24, limit=10)

        # Get active subscriptions
        active_tiers = await self.tier_repo.find_all()
        active_tiers = [t for t in active_tiers if t.is_active]

        return {
            "users": {
                "total": total_users,
                "recent_24h": len([l for l in recent_logs if l.action == "login"]),
            },
            "projects": {
                "total": total_projects,
            },
            "datasets": {
                "total": total_datasets,
            },
            "rbac": {
                "total_roles": total_roles,
                "total_permissions": total_permissions,
            },
            "billing": {
                "active_tiers": len(active_tiers),
            },
            "recent_activity": [
                {
                    "id": log.id,
                    "action": log.action,
                    "resource_type": log.resource_type,
                    "user_id": log.user_id,
                    "created_at": log.created_at.isoformat() if log.created_at else None,
                }
                for log in recent_logs
            ],
            "timestamp": datetime.utcnow().isoformat(),
        }

    async def get_system_health(self) -> Dict[str, Any]:
        """
        Get system health status

        Returns:
            Health status for various components
        """
        # Check database
        db_health = await db_manager.health_status() if hasattr(db_manager, 'health_status') else {"status": "unknown"}

        return {
            "database": db_health.get("status", "unknown"),
            "services": {
                "admin": "up",
                "rbac": "up",
                "audit_logging": "up",
            },
            "timestamp": datetime.utcnow().isoformat(),
        }

    # ========================================================================
    # User Management
    # ========================================================================

    async def list_users(
        self,
        limit: int = 50,
        offset: int = 0,
        filter_role: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List users with optional role filter

        Args:
            limit: Maximum number of users
            offset: Number of users to skip
            filter_role: Optional role name to filter by

        Returns:
            List of users with their roles
        """
        users = await self.user_repo.find_all(limit=limit, offset=offset)

        # Get roles for each user if filtering by role
        if filter_role:
            filtered_users = []
            for user in users:
                user_roles = await self.user_role_repo.find_by_user(user.id)
                for ur in user_roles:
                    role = await self.role_repo.find_by_id(ur.role_id)
                    if role and role.name == filter_role:
                        filtered_users.append(user)
                        break
            users = filtered_users

        # Enrich with role information
        user_data = []
        for user in users:
            user_dict = {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "is_admin": user.is_admin,
                "created_at": user.created_at.isoformat() if user.created_at else None,
            }

            # Get user roles
            user_roles = await self.user_role_repo.find_by_user(user.id)
            role_list = []
            for ur in user_roles:
                role = await self.role_repo.find_by_id(ur.role_id)
                if role:
                    role_list.append({
                        "id": role.id,
                        "name": role.name,
                        "display_name": role.display_name,
                        "assigned_at": ur.assigned_at.isoformat() if ur.assigned_at else None,
                        "expires_at": ur.expires_at.isoformat() if ur.expires_at else None,
                    })
            user_dict["roles"] = role_list

            user_data.append(user_dict)

        total = await self.user_repo.count() if not filter_role else len(user_data)

        return {
            "users": user_data,
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    async def get_user_details(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed information about a user

        Args:
            user_id: User ID

        Returns:
            User details with roles and permissions
        """
        user = await self.user_repo.find_by_id(user_id)
        if not user:
            return None

        # Get user roles
        user_roles = await self.user_role_repo.find_by_user(user_id)
        role_list = []
        all_permissions = set()

        for ur in user_roles:
            role = await self.role_repo.find_by_id(ur.role_id)
            if role:
                role_data = {
                    "id": role.id,
                    "name": role.name,
                    "display_name": role.display_name,
                    "description": role.description,
                    "permissions": role.permissions,
                    "is_system": role.is_system,
                    "assigned_at": ur.assigned_at.isoformat() if ur.assigned_at else None,
                    "expires_at": ur.expires_at.isoformat() if ur.expires_at else None,
                }
                role_list.append(role_data)
                all_permissions.update(role.permissions)

        # Get user projects
        projects = await self.project_repo.find_by_user(user_id)
        project_list = [
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "journey_step": p.journey_step,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in projects
        ]

        return {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "is_admin": user.is_admin,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "roles": role_list,
            "permissions": list(all_permissions),
            "projects": project_list,
        }

    async def assign_role_to_user(
        self,
        user_id: str,
        role_id: str,
        assigned_by: str,
        expires_at: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Assign a role to a user

        Args:
            user_id: User ID
            role_id: Role ID
            assigned_by: Admin user ID
            expires_at: Optional expiry datetime

        Returns:
            Assignment result
        """
        # Check if user exists
        user = await self.user_repo.find_by_id(user_id)
        if not user:
            return {"success": False, "error": "User not found"}

        # Check if role exists
        role = await self.role_repo.find_by_id(role_id)
        if not role:
            return {"success": False, "error": "Role not found"}

        # Check if already assigned
        existing = await self.user_role_repo.find_by_user_and_role(user_id, role_id)
        if existing:
            return {"success": False, "error": "Role already assigned to user"}

        # Create assignment
        assignment = UserRole()
        assignment.user_id = user_id
        assignment.role_id = role_id
        assignment.assigned_by = assigned_by
        assignment.expires_at = expires_at

        result = await self.user_role_repo.create(assignment)

        # Log the action
        await self._log_action(
            user_id=assigned_by,
            action="assign_role",
            resource_type="user_role",
            resource_id=result.id,
            details={
                "user_id": user_id,
                "role_id": role_id,
                "role_name": role.name,
                "expires_at": expires_at.isoformat() if expires_at else None,
            },
        )

        return {
            "success": True,
            "assignment_id": result.id,
            "message": f"Role '{role.display_name}' assigned to user",
        }

    async def revoke_role_from_user(
        self,
        user_id: str,
        role_id: str,
        revoked_by: str,
    ) -> Dict[str, Any]:
        """
        Revoke a role from a user

        Args:
            user_id: User ID
            role_id: Role ID
            revoked_by: Admin user ID

        Returns:
            Revoke result
        """
        # Check if assignment exists
        existing = await self.user_role_repo.find_by_user_and_role(user_id, role_id)
        if not existing:
            return {"success": False, "error": "Role not assigned to user"}

        # Get role info for logging
        role = await self.role_repo.find_by_id(role_id)

        # Delete assignment
        await self.user_role_repo.delete_by_user_and_role(user_id, role_id)

        # Log the action
        await self._log_action(
            user_id=revoked_by,
            action="revoke_role",
            resource_type="user_role",
            resource_id=existing.id,
            details={
                "user_id": user_id,
                "role_id": role_id,
                "role_name": role.name if role else "unknown",
            },
        )

        return {
            "success": True,
            "message": f"Role '{role.display_name if role else 'Unknown'}' revoked from user",
        }

    # ========================================================================
    # Role Management
    # ========================================================================

    async def list_roles(
        self,
        include_system: bool = True,
        limit: int = 100,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        List all roles

        Args:
            include_system: Include system roles
            limit: Maximum number of roles
            offset: Number of roles to skip

        Returns:
            List of roles with user counts
        """
        roles = await self.role_repo.find_all(
            include_system=include_system,
            limit=limit,
            offset=offset,
        )

        # Enrich with user counts
        role_data = []
        for role in roles:
            user_count = await self.user_role_repo.count_users_by_role(role.id)
            role_data.append({
                "id": role.id,
                "name": role.name,
                "display_name": role.display_name,
                "description": role.description,
                "permissions": role.permissions,
                "is_system": role.is_system,
                "user_count": user_count,
                "created_at": role.created_at.isoformat() if role.created_at else None,
            })

        total = await self.role_repo.count() if include_system else 0

        return {
            "roles": role_data,
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    async def create_role(
        self,
        name: str,
        display_name: str,
        description: Optional[str] = None,
        permissions: Optional[List[str]] = None,
        created_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a new role

        Args:
            name: Role name (unique)
            display_name: Display name
            description: Optional description
            permissions: List of permissions
            created_by: Creator user ID

        Returns:
            Created role
        """
        # Check if role name already exists
        existing = await self.role_repo.find_by_name(name)
        if existing:
            return {"success": False, "error": "Role name already exists"}

        role = Role()
        role.name = name
        role.display_name = display_name
        role.description = description
        role.permissions = permissions or []
        role.is_system = False

        result = await self.role_repo.create(role)

        # Log the action
        if created_by:
            await self._log_action(
                user_id=created_by,
                action="create_role",
                resource_type="role",
                resource_id=result.id,
                details={
                    "name": name,
                    "display_name": display_name,
                    "permissions": permissions,
                },
            )

        return {
            "success": True,
            "role": {
                "id": result.id,
                "name": result.name,
                "display_name": result.display_name,
                "description": result.description,
                "permissions": result.permissions,
            },
        }

    async def update_role(
        self,
        role_id: str,
        updates: Dict[str, Any],
        updated_by: str,
    ) -> Dict[str, Any]:
        """
        Update a role

        Args:
            role_id: Role ID
            updates: Dictionary of updates
            updated_by: Admin user ID

        Returns:
            Updated role
        """
        role = await self.role_repo.find_by_id(role_id)
        if not role:
            return {"success": False, "error": "Role not found"}

        # Update fields
        for key, value in updates.items():
            if hasattr(role, key):
                setattr(role, key, value)

        result = await self.role_repo.update(role)

        # Log the action
        await self._log_action(
            user_id=updated_by,
            action="update_role",
            resource_type="role",
            resource_id=role_id,
            details={"updates": updates},
        )

        return {
            "success": True,
            "role": {
                "id": result.id,
                "name": result.name,
                "display_name": result.display_name,
                "description": result.description,
                "permissions": result.permissions,
            },
        }

    async def delete_role(
        self,
        role_id: str,
        deleted_by: str,
    ) -> Dict[str, Any]:
        """
        Delete a role

        Args:
            role_id: Role ID
            deleted_by: Admin user ID

        Returns:
            Delete result
        """
        role = await self.role_repo.find_by_id(role_id)
        if not role:
            return {"success": False, "error": "Role not found"}

        # Check for users with this role
        user_count = await self.user_role_repo.count_users_by_role(role_id)
        if user_count > 0:
            return {
                "success": False,
                "error": f"Cannot delete role with {user_count} assigned users",
            }

        # Delete role
        await self.role_repo.delete(role_id)

        # Log the action
        await self._log_action(
            user_id=deleted_by,
            action="delete_role",
            resource_type="role",
            resource_id=role_id,
            details={"name": role.name},
        )

        return {
            "success": True,
            "message": f"Role '{role.display_name}' deleted",
        }

    # ========================================================================
    # Permission Management
    # ========================================================================

    async def list_permissions(
        self,
        category: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        List all permissions

        Args:
            category: Optional category filter
            limit: Maximum number of permissions
            offset: Number of permissions to skip

        Returns:
            List of permissions
        """
        permissions = await self.permission_repo.find_all(
            category=category,
            limit=limit,
            offset=offset,
        )

        permission_data = [
            {
                "id": p.id,
                "name": p.name,
                "display_name": p.display_name,
                "description": p.description,
                "category": p.category,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in permissions
        ]

        # Get categories
        categories = await self.permission_repo.get_categories()

        return {
            "permissions": permission_data,
            "categories": categories,
            "total": len(permissions),
            "limit": limit,
            "offset": offset,
        }

    async def get_permission_categories(self) -> List[str]:
        """
        Get all permission categories

        Returns:
            List of category names
        """
        return await self.permission_repo.get_categories()

    # ========================================================================
    # Audit Log Management
    # ========================================================================

    async def list_audit_logs(
        self,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        List audit logs with filters

        Args:
            filters: Dictionary of filters (user_id, action, resource_type, etc.)
            limit: Maximum number of logs
            offset: Number of logs to skip

        Returns:
            List of audit logs
        """
        logs = await self.audit_log_repo.search(
            filters=filters or {},
            limit=limit,
            offset=offset,
        )

        log_data = [
            {
                "id": log.id,
                "user_id": log.user_id,
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "details": log.details,
                "ip_address": log.ip_address,
                "status": log.status,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ]

        return {
            "logs": log_data,
            "total": len(log_data),
            "limit": limit,
            "offset": offset,
        }

    async def get_audit_log_statistics(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Get audit log statistics

        Args:
            start_date: Optional start date
            end_date: Optional end date

        Returns:
            Statistics dictionary
        """
        return await self.audit_log_repo.get_statistics(
            start_date=start_date,
            end_date=end_date,
        )

    # ========================================================================
    # Helper Methods
    # ========================================================================

    async def _log_action(
        self,
        user_id: str,
        action: str,
        resource_type: str,
        resource_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        status: str = "success",
    ):
        """
        Log an admin action

        Args:
            user_id: User ID
            action: Action type
            resource_type: Resource type
            resource_id: Resource ID
            details: Additional details
            status: Status
        """
        from ..models.database import AuditLog

        log = AuditLog()
        log.user_id = user_id
        log.action = action
        log.resource_type = resource_type
        log.resource_id = resource_id
        log.details = details or {}
        log.status = status

        await self.audit_log_repo.create(log)


# Singleton instance
_admin_service_instance: Optional[AdminService] = None


def get_admin_service() -> AdminService:
    """Get or create admin service singleton instance"""
    global _admin_service_instance
    if _admin_service_instance is None:
        _admin_service_instance = AdminService()
    return _admin_service_instance
