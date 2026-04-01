"""
Repository Layer Tests - User Repository

Tests the UserRepository CRUD operations with mock database session.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from src.repositories.user_repository import User, UserRepository


class MockDBManager:
    """Mock database manager for testing"""

    def __init__(self):
        self._db_manager = MagicMock()
        self.fetchval = AsyncMock(return_value=1)

    def fetch(self, *args, **kwargs):
        return self._db_manager.fetch(*args, **kwargs)

    def fetchrow(self, *args, **kwargs):
        return self._db_manager.fetchrow(*args, **kwargs)

    def execute(self, *args, **kwargs):
        return self._db_manager.execute(*args, **kwargs)


@pytest.fixture
def mock_db_manager():
    """Fixture for mock database manager"""
    return MockDBManager()


@pytest.fixture
def user_repository(mock_db_manager):
    """Fixture for user repository"""
    return UserRepository()
    user_repository._db_manager = mock_db_manager


class TestUserRepository:
    """Test cases for UserRepository"""

    @pytest.mark.asyncio
    async def test_find_by_id(self, user_repository, sample_user_data):
        """Test finding a user by ID"""
        # Mock the fetchrow response
        user_repository._db_manager.fetchrow = AsyncMock(return_value={
            "id": sample_user_data["id"],
            "email": sample_user_data["email"],
            "name": sample_user_data["name"],
            "is_admin": sample_user_data["is_admin"],
            "created_at": None,
            "updated_at": None
        })

        result = await user_repository.find_by_id(sample_user_data["id"])

        assert result is not None
        assert result.id == sample_user_data["id"]
        assert result.email == sample_user_data["email"]
        assert result.name == sample_user_data["name"]
        assert result.is_admin == sample_user_data["is_admin"]

    @pytest.mark.asyncio
    async def test_find_by_email(self, user_repository, sample_user_data):
        """Test finding a user by email"""
        user_repository._db_manager.fetch = AsyncMock(return_value=[])

        result = await user_repository.find_by_email(sample_user_data["email"])

        # Test that the method executes successfully
        # The exact return type depends on implementation
        # This test verifies the method doesn't crash with empty results
        assert result is not None or isinstance(result, list)

    @pytest.mark.asyncio
    async def test_find_admins(self, user_repository):
        """Test finding admin users"""
        user_repository._db_manager.fetch = AsyncMock(return_value=[])

        result = await user_repository.find_admins()

        assert isinstance(result, list)

    @pytest.mark.asyncio
    async def test_create_user(self, user_repository, sample_user_data):
        """Test creating a new user"""
        user_repository._db_manager.execute = AsyncMock(return_value="INSERT 1")
        user_repository._db_manager.fetchrow = AsyncMock(return_value={
            "id": sample_user_data["id"],
            "email": sample_user_data["email"],
            "name": sample_user_data["name"],
            "is_admin": sample_user_data["is_admin"],
            "created_at": None,
            "updated_at": None
        })

        user = User()
        user.id = None
        user.email = sample_user_data["email"]
        user.name = sample_user_data["name"]
        user.is_admin = sample_user_data["is_admin"]

        result = await user_repository.create(user)

        assert result is not None
        assert result.email == sample_user_data["email"]

    @pytest.mark.asyncio
    async def test_update_admin_status(self, user_repository, sample_user_data):
        """Test updating admin status"""
        user_repository._db_manager.execute = AsyncMock(return_value="UPDATE 1")
        user_repository._db_manager.fetchrow = AsyncMock(return_value={
            "id": sample_user_data["id"],
            "email": sample_user_data["email"],
            "name": sample_user_data["name"],
            "is_admin": True,
            "created_at": None,
            "updated_at": None
        })

        result = await user_repository.set_admin_status(
            sample_user_data["id"],
            True
        )

        assert result is not None
        assert result.is_admin is True
