"""
User Role Repository

Handles CRUD operations for user role assignments (RBAC).
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from sqlalchemy import select, and_, or_
from .base_repository import BaseRepository
from ..models.database import (
    UserRole as UserRoleModel,
    generate_uuid,
)


class UserRoleRepository(BaseRepository[UserRoleModel]):
    """Repository for user role assignment CRUD operations"""

    def __init__(self, db_manager=None):
        super().__init__()
        self.table_name = "user_roles"
        self._db_manager = db_manager

    def _record_to_model(self, record: dict) -> Optional[UserRoleModel]:
        """Convert database record to model instance"""
        if not record:
            return None

        model = UserRoleModel()
        model.id = record.get("id")
        model.user_id = record.get("user_id")
        model.role_id = record.get("role_id")
        model.assigned_by = record.get("assigned_by")
        model.assigned_at = record.get("assigned_at")
        model.expires_at = record.get("expires_at")
        return model

    def _model_to_dict(self, model: UserRoleModel) -> dict:
        """Convert model instance to dictionary"""
        return {
            "id": model.id,
            "user_id": model.user_id,
            "role_id": model.role_id,
            "assigned_by": model.assigned_by,
            "assigned_at": model.assigned_at.isoformat() if model.assigned_at else None,
            "expires_at": model.expires_at.isoformat() if model.expires_at else None,
        }

    async def find_by_id(self, assignment_id: str) -> Optional[UserRoleModel]:
        """Find a user role assignment by ID"""
        query = select(UserRoleModel).where(UserRoleModel.id == assignment_id)
        result = await self._db_manager.fetchrow(query)
        return self._record_to_model(result)

    async def find_by_user(
        self,
        user_id: str,
        include_expired: bool = False
    ) -> List[UserRoleModel]:
        """Find all role assignments for a user"""
        query = select(UserRoleModel).where(
            UserRoleModel.user_id == user_id
        )

        if not include_expired:
            # Filter out expired roles
            query = query.where(
                or_(
                    UserRoleModel.expires_at.is_(None),
                    UserRoleModel.expires_at > datetime.utcnow()
                )
            )

        query = query.order_by(UserRoleModel.assigned_at.desc())
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def find_by_role(
        self,
        role_id: str,
        include_expired: bool = False
    ) -> List[UserRoleModel]:
        """Find all users with a specific role"""
        query = select(UserRoleModel).where(
            UserRoleModel.role_id == role_id
        )

        if not include_expired:
            query = query.where(
                or_(
                    UserRoleModel.expires_at.is_(None),
                    UserRoleModel.expires_at > datetime.utcnow()
                )
            )

        query = query.order_by(UserRoleModel.assigned_at.desc())
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def find_by_user_and_role(
        self,
        user_id: str,
        role_id: str
    ) -> Optional[UserRoleModel]:
        """Find a specific user-role assignment"""
        query = select(UserRoleModel).where(
            and_(
                UserRoleModel.user_id == user_id,
                UserRoleModel.role_id == role_id
            )
        )
        result = await self._db_manager.fetchrow(query)
        return self._record_to_model(result)

    async def find_expired(self, limit: int = 100) -> List[UserRoleModel]:
        """Find expired role assignments"""
        query = select(UserRoleModel).where(
            UserRoleModel.expires_at < datetime.utcnow()
        ).order_by(UserRoleModel.expires_at).limit(limit)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def find_all(
        self,
        user_id: Optional[str] = None,
        role_id: Optional[str] = None,
        include_expired: bool = False,
        limit: int = 100,
        offset: int = 0
    ) -> List[UserRoleModel]:
        """Get all user role assignments with optional filters"""
        query = select(UserRoleModel)
        conditions = []

        if user_id:
            conditions.append(UserRoleModel.user_id == user_id)
        if role_id:
            conditions.append(UserRoleModel.role_id == role_id)

        if conditions:
            query = query.where(and_(*conditions))

        if not include_expired:
            query = query.where(
                or_(
                    UserRoleModel.expires_at.is_(None),
                    UserRoleModel.expires_at > datetime.utcnow()
                )
            )

        query = query.order_by(UserRoleModel.assigned_at.desc()).limit(limit).offset(offset)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def create(self, model: UserRoleModel) -> UserRoleModel:
        """Create a new user role assignment"""
        if not model.id:
            model.id = generate_uuid()

        # Set assigned_at if not set
        if not model.assigned_at:
            model.assigned_at = datetime.utcnow()

        data = self._model_to_dict(model)
        columns = ", ".join(data.keys())
        placeholders = ", ".join(f"${i+1}" for i in range(len(data)))

        query = f"""
            INSERT INTO user_roles ({columns})
            VALUES ({placeholders})
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, *data.values())

        # Update model with generated values
        for key, value in data.items():
            setattr(model, key, value)

        return self._record_to_model(result)

    async def update(self, model: UserRoleModel) -> Optional[UserRoleModel]:
        """Update an existing user role assignment"""
        if not model.id:
            return None

        data = self._model_to_dict(model)
        data.pop("id", None)
        data.pop("user_id", None)
        data.pop("role_id", None)
        data.pop("assigned_at", None)
        data.pop("assigned_by", None)

        if not data:
            return model

        set_clauses = [f"{key} = ${i+1}" for i, key in enumerate(data.keys())]
        query = f"""
            UPDATE user_roles
            SET {", ".join(set_clauses)}
            WHERE id = ${len(data) + 1}
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, *data.values())

        # Update model with new values
        for key, value in data.items():
            setattr(model, key, value)

        return self._record_to_model(result)

    async def delete(self, assignment_id: str) -> bool:
        """Delete a user role assignment"""
        query = f"DELETE FROM user_roles WHERE id = $1 RETURNING id"
        result = await self._db_manager.execute(query, assignment_id)
        return result is not None

    async def delete_by_user_and_role(
        self,
        user_id: str,
        role_id: str
    ) -> bool:
        """Delete a specific user-role assignment"""
        query = f"""
            DELETE FROM user_roles
            WHERE user_id = $1 AND role_id = $2
            RETURNING id
        """
        result = await self._db_manager.execute(query, user_id, role_id)
        return result is not None

    async def revoke_expired_roles(self) -> int:
        """Delete all expired role assignments"""
        query = f"""
            DELETE FROM user_roles
            WHERE expires_at < CURRENT_TIMESTAMP
            RETURNING id
        """
        result = await self._db_manager.fetch(query)
        return len(result)

    async def count_users_by_role(self, role_id: str) -> int:
        """Count users with a specific role (excluding expired)"""
        query = select(UserRoleModel).where(
            and_(
                UserRoleModel.role_id == role_id,
                or_(
                    UserRoleModel.expires_at.is_(None),
                    UserRoleModel.expires_at > datetime.utcnow()
                )
            )
        )
        result = await self._db_manager.fetch(query)
        return len(result)

    async def count_roles_by_user(self, user_id: str) -> int:
        """Count roles for a specific user (excluding expired)"""
        query = select(UserRoleModel).where(
            and_(
                UserRoleModel.user_id == user_id,
                or_(
                    UserRoleModel.expires_at.is_(None),
                    UserRoleModel.expires_at > datetime.utcnow()
                )
            )
        )
        result = await self._db_manager.fetch(query)
        return len(result)


def get_user_role_repository(db_manager=None) -> UserRoleRepository:
    """Get or create user role repository instance"""
    return UserRoleRepository(db_manager)
