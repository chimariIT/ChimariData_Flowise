"""
Permission Repository

Handles CRUD operations for system permissions.
"""

from typing import Optional, List
from sqlalchemy import select, or_
from .base_repository import BaseRepository
from ..models.database import (
    Permission as PermissionModel,
    generate_uuid,
)


class PermissionRepository(BaseRepository[PermissionModel]):
    """Repository for permission CRUD operations"""

    def __init__(self, db_manager=None):
        super().__init__()
        self.table_name = "permissions"
        self._db_manager = db_manager

    def _record_to_model(self, record: dict) -> Optional[PermissionModel]:
        """Convert database record to model instance"""
        if not record:
            return None

        model = PermissionModel()
        model.id = record.get("id")
        model.name = record.get("name")
        model.display_name = record.get("display_name")
        model.description = record.get("description")
        model.category = record.get("category")
        model.created_at = record.get("created_at")
        return model

    def _model_to_dict(self, model: PermissionModel) -> dict:
        """Convert model instance to dictionary"""
        return {
            "id": model.id,
            "name": model.name,
            "display_name": model.display_name,
            "description": model.description,
            "category": model.category,
            "created_at": model.created_at.isoformat() if model.created_at else None,
        }

    async def find_by_id(self, permission_id: str) -> Optional[PermissionModel]:
        """Find a permission by ID"""
        query = select(PermissionModel).where(PermissionModel.id == permission_id)
        result = await self._db_manager.fetchrow(query)
        return self._record_to_model(result)

    async def find_by_name(self, name: str) -> Optional[PermissionModel]:
        """Find a permission by name"""
        query = select(PermissionModel).where(PermissionModel.name == name)
        result = await self._db_manager.fetchrow(query)
        return self._record_to_model(result)

    async def find_by_category(
        self,
        category: str,
        limit: int = 100
    ) -> List[PermissionModel]:
        """Get permissions by category"""
        query = select(PermissionModel).where(
            PermissionModel.category == category
        ).order_by(PermissionModel.name).limit(limit)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def find_all(
        self,
        category: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[PermissionModel]:
        """Get all permissions"""
        query = select(PermissionModel)

        if category:
            query = query.where(PermissionModel.category == category)

        query = query.order_by(PermissionModel.category, PermissionModel.name).limit(limit).offset(offset)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def get_categories(self) -> List[str]:
        """Get all unique permission categories"""
        query = select(PermissionModel.category).distinct().where(
            PermissionModel.category.isnot(None)
        ).order_by(PermissionModel.category)
        result = await self._db_manager.fetch(query)
        return [row.get("category") for row in result if row.get("category")]

    async def search(
        self,
        query: str,
        limit: int = 20
    ) -> List[PermissionModel]:
        """Search permissions by name or display name"""
        search_pattern = f"%{query}%"
        sql_query = select(PermissionModel).where(
            PermissionModel.name.ilike(search_pattern) |
            PermissionModel.display_name.ilike(search_pattern)
        ).limit(limit)
        result = await self._db_manager.fetch(sql_query)
        return self._record_list_to_model_list(result)

    async def create(self, model: PermissionModel) -> PermissionModel:
        """Create a new permission"""
        if not model.id:
            model.id = generate_uuid()

        data = self._model_to_dict(model)
        columns = ", ".join(data.keys())
        placeholders = ", ".join(f"${i+1}" for i in range(len(data)))

        query = f"""
            INSERT INTO permissions ({columns})
            VALUES ({placeholders})
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, *data.values())

        # Update model with generated values
        for key, value in data.items():
            setattr(model, key, value)

        return self._record_to_model(result)

    async def update(self, model: PermissionModel) -> Optional[PermissionModel]:
        """Update an existing permission"""
        if not model.id:
            return None

        data = self._model_to_dict(model)
        data.pop("id", None)
        data.pop("created_at", None)

        if not data:
            return model

        set_clauses = [f"{key} = ${i+1}" for i, key in enumerate(data.keys())]
        query = f"""
            UPDATE permissions
            SET {", ".join(set_clauses)}
            WHERE id = ${len(data) + 1}
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, *data.values())

        # Update model with new values
        for key, value in data.items():
            setattr(model, key, value)

        return self._record_to_model(result)

    async def delete(self, permission_id: str) -> bool:
        """Delete a permission"""
        query = f"DELETE FROM permissions WHERE id = $1 RETURNING id"
        result = await self._db_manager.execute(query, permission_id)
        return result is not None


def get_permission_repository(db_manager=None) -> PermissionRepository:
    """Get or create permission repository instance"""
    return PermissionRepository(db_manager)
