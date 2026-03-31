"""
Role Repository

Handles CRUD operations for roles (RBAC).
"""

from typing import Optional, List, Dict, Any
from sqlalchemy import select, and_
from .base_repository import BaseRepository
from ..models.database import (
    Role as RoleModel,
    generate_uuid,
)


class RoleRepository(BaseRepository[RoleModel]):
    """Repository for role CRUD operations"""

    def __init__(self, db_manager=None):
        super().__init__()
        self.table_name = "roles"
        self._db_manager = db_manager

    def _record_to_model(self, record: dict) -> Optional[RoleModel]:
        """Convert database record to model instance"""
        if not record:
            return None

        model = RoleModel()
        model.id = record.get("id")
        model.name = record.get("name")
        model.display_name = record.get("display_name")
        model.description = record.get("description")
        model.permissions = record.get("permissions", [])
        model.is_system = record.get("is_system", False)
        model.created_at = record.get("created_at")
        model.updated_at = record.get("updated_at")
        return model

    def _model_to_dict(self, model: RoleModel) -> dict:
        """Convert model instance to dictionary"""
        return {
            "id": model.id,
            "name": model.name,
            "display_name": model.display_name,
            "description": model.description,
            "permissions": model.permissions,
            "is_system": model.is_system,
            "created_at": model.created_at.isoformat() if model.created_at else None,
            "updated_at": model.updated_at.isoformat() if model.updated_at else None,
        }

    async def find_by_id(self, role_id: str) -> Optional[RoleModel]:
        """Find a role by ID"""
        query = select(RoleModel).where(RoleModel.id == role_id)
        result = await self._db_manager.fetchrow(query)
        return self._record_to_model(result)

    async def find_by_name(self, name: str) -> Optional[RoleModel]:
        """Find a role by name"""
        query = select(RoleModel).where(RoleModel.name == name)
        result = await self._db_manager.fetchrow(query)
        return self._record_to_model(result)

    async def find_all(
        self,
        include_system: bool = True,
        limit: int = 100,
        offset: int = 0
    ) -> List[RoleModel]:
        """Get all roles"""
        query = select(RoleModel)

        if not include_system:
            query = query.where(RoleModel.is_system == False)

        query = query.order_by(RoleModel.name).limit(limit).offset(offset)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def find_system_roles(self) -> List[RoleModel]:
        """Get all system roles"""
        query = select(RoleModel).where(
            RoleModel.is_system == True
        ).order_by(RoleModel.name)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def search(
        self,
        query: str,
        limit: int = 20
    ) -> List[RoleModel]:
        """Search roles by name or display name"""
        search_pattern = f"%{query}%"
        sql_query = select(RoleModel).where(
            RoleModel.name.ilike(search_pattern) |
            RoleModel.display_name.ilike(search_pattern)
        ).limit(limit)
        result = await self._db_manager.fetch(sql_query)
        return self._record_list_to_model_list(result)

    async def create(self, model: RoleModel) -> RoleModel:
        """Create a new role"""
        if not model.id:
            model.id = generate_uuid()

        data = self._model_to_dict(model)
        columns = ", ".join(data.keys())
        placeholders = ", ".join(f"${i+1}" for i in range(len(data)))

        query = f"""
            INSERT INTO roles ({columns})
            VALUES ({placeholders})
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, *data.values())

        # Update model with generated values
        for key, value in data.items():
            setattr(model, key, value)

        return self._record_to_model(result)

    async def update(self, model: RoleModel) -> Optional[RoleModel]:
        """Update an existing role"""
        if not model.id:
            return None

        # Cannot update system roles
        existing = await self.find_by_id(model.id)
        if existing and existing.is_system:
            raise ValueError("Cannot update system roles")

        data = self._model_to_dict(model)
        data.pop("id", None)
        data.pop("created_at", None)

        if not data:
            return model

        set_clauses = [f"{key} = ${i+1}" for i, key in enumerate(data.keys())]
        query = f"""
            UPDATE roles
            SET {", ".join(set_clauses)}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${len(data) + 1}
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, *data.values())

        # Update model with new values
        for key, value in data.items():
            setattr(model, key, value)

        return self._record_to_model(result)

    async def delete(self, role_id: str) -> bool:
        """Delete a role"""
        # Cannot delete system roles
        role = await self.find_by_id(role_id)
        if role and role.is_system:
            raise ValueError("Cannot delete system roles")

        query = f"DELETE FROM roles WHERE id = $1 RETURNING id"
        result = await self._db_manager.execute(query, role_id)
        return result is not None

    async def add_permission(
        self,
        role_id: str,
        permission: str
    ) -> Optional[RoleModel]:
        """Add a permission to a role"""
        role = await self.find_by_id(role_id)
        if not role:
            return None

        if permission not in role.permissions:
            role.permissions.append(permission)
            return await self.update(role)

        return role

    async def remove_permission(
        self,
        role_id: str,
        permission: str
    ) -> Optional[RoleModel]:
        """Remove a permission from a role"""
        role = await self.find_by_id(role_id)
        if not role:
            return None

        if permission in role.permissions:
            role.permissions.remove(permission)
            return await self.update(role)

        return role

    async def check_permission(
        self,
        role_id: str,
        permission: str
    ) -> bool:
        """Check if a role has a specific permission"""
        role = await self.find_by_id(role_id)
        return role and permission in role.permissions


def get_role_repository(db_manager=None) -> RoleRepository:
    """Get or create role repository instance"""
    return RoleRepository(db_manager)
