"""
User Repository

Handles user-related database operations.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from .base_repository import BaseRepository
from ..models.database import jsonb_dumps, jsonb_loads


class User(BaseRepository):
    """User model"""

    def __init__(self):
        super().__init__()
        self.table_name = "users"
        self.id_field = "id"

    id: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    is_admin: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    def _record_to_model(self, record) -> Optional['User']:
        """Convert database record to User model"""
        if record is None:
            return None

        user = User()
        user.id = record.get('id')
        user.email = record.get('email')
        user.name = record.get('name')
        user.is_admin = record.get('is_admin')
        user.created_at = record.get('created_at')
        user.updated_at = record.get('updated_at')
        return user

    def _model_to_dict(self, model: 'User') -> Dict[str, Any]:
        """Convert User model to dictionary"""
        return {
            'id': model.id,
            'email': model.email,
            'name': model.name,
            'is_admin': model.is_admin,
            'created_at': model.created_at,
            'updated_at': model.updated_at
        }


class UserRepository(BaseRepository[User]):
    """Repository for user operations"""

    def __init__(self):
        super().__init__()
        self.table_name = "users"
        self.id_field = "id"

    def _record_to_model(self, record) -> Optional[User]:
        """Convert database record to User model"""
        if record is None:
            return None

        user = User()
        user.id = record.get('id')
        user.email = record.get('email')
        user.name = record.get('name')
        user.is_admin = record.get('is_admin')
        user.created_at = record.get('created_at')
        user.updated_at = record.get('updated_at')
        return user

    def _model_to_dict(self, model: User) -> Dict[str, Any]:
        """Convert User model to dictionary"""
        return {
            'id': model.id,
            'email': model.email,
            'name': model.name,
            'is_admin': model.is_admin,
            'created_at': model.created_at,
            'updated_at': model.updated_at
        }

    async def find_by_email(self, email: str) -> Optional[User]:
        """
        Find a user by email address

        Args:
            email: User email

        Returns:
            User instance or None
        """
        query = "SELECT * FROM users WHERE email = $1"
        record = await self._db_manager.fetchrow(query, email)
        return self._record_to_model(record)

    async def find_admins(self) -> List[User]:
        """
        Find all admin users

        Returns:
            List of User instances
        """
        query = "SELECT * FROM users WHERE is_admin = TRUE"
        records = await self._db_manager.fetch(query)
        return [self._record_to_model(r) for r in records]

    async def set_admin_status(self, user_id: str, is_admin: bool) -> Optional[User]:
        """
        Update admin status for a user

        Args:
            user_id: User ID
            is_admin: New admin status

        Returns:
            Updated User instance
        """
        return await self.update(user_id, {'is_admin': is_admin})

    @property
    def _db_manager(self):
        """Get database manager"""
        from ..models.database import db_manager
        return db_manager


def get_user_repository(db_manager=None) -> UserRepository:
    """Get or create user repository instance"""
    return UserRepository()
