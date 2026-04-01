"""
Integration Tests for Chimaridata Python Backend

Test Structure:
- tests/
  - __init__.py
  - conftest.py (pytest fixtures)
  - test_repositories/ (repository layer tests)
  - test_services/ (service layer tests)
  - test_api/ (API endpoint tests)
  - test_analysis_modules/ (analysis module tests)
  - fixtures/ (test data fixtures)
"""

import pytest
import asyncio
from typing import AsyncGenerator
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


@pytest.fixture(scope="session")
def event_loop() -> AsyncGenerator:
    """Create event loop for async tests"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def sample_project_data():
    """Sample project data for testing"""
    return {
        "id": "test-project-123",
        "name": "Test Project",
        "description": "A test project for integration testing",
        "user_id": "test-user-123",
        "journey_step": "upload",
        "journey_progress": {}
    }


@pytest.fixture
def sample_dataset_data():
    """Sample dataset data for testing"""
    return {
        "id": "test-dataset-123",
        "project_id": "test-project-123",
        "name": "Test Dataset",
        "source_type": "computer",
        "file_path": "/uploads/test.csv",
        "record_count": 100,
        "schema": {
            "columns": [
                {"name": "id", "type": "numeric"},
                {"name": "name", "type": "categorical"},
                {"name": "value", "type": "numeric"}
            ]
        }
    }


@pytest.fixture
def sample_user_data():
    """Sample user data for testing"""
    return {
        "id": "test-user-123",
        "email": "test@example.com",
        "name": "Test User",
        "is_admin": False
    }
