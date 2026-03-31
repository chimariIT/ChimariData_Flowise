"""
Project Repository

Handles project-related database operations.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from .base_repository import BaseRepository
from ..models.database import jsonb_dumps, jsonb_loads


class Project(BaseRepository):
    """Project model"""

    def __init__(self):
        super().__init__()
        self.table_name = "projects"
        self.id_field = "id"

    id: Optional[str] = None
    user_id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    industry: Optional[str] = None
    journey_step: Optional[str] = None
    journey_progress: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    def _record_to_model(self, record) -> Optional['Project']:
        """Convert database record to Project model"""
        if record is None:
            return None

        project = Project()
        project.id = record.get('id')
        project.user_id = record.get('user_id')
        project.name = record.get('name')
        project.description = record.get('description')
        project.industry = record.get('industry')
        project.journey_step = record.get('journey_step')
        project.journey_progress = jsonb_loads(record.get('journey_progress'))
        project.created_at = record.get('created_at')
        project.updated_at = record.get('updated_at')
        return project

    def _model_to_dict(self, model: 'Project') -> Dict[str, Any]:
        """Convert Project model to dictionary"""
        return {
            'id': model.id,
            'user_id': model.user_id,
            'name': model.name,
            'description': model.description,
            'industry': model.industry,
            'journey_step': model.journey_step,
            'journey_progress': jsonb_dumps(model.journey_progress),
            'created_at': model.created_at,
            'updated_at': model.updated_at
        }


class ProjectRepository(BaseRepository[Project]):
    """Repository for project operations"""

    def __init__(self):
        super().__init__()
        self.table_name = "projects"
        self.id_field = "id"

    def _record_to_model(self, record) -> Optional[Project]:
        """Convert database record to Project model"""
        if record is None:
            return None

        project = Project()
        project.id = record.get('id')
        project.user_id = record.get('user_id')
        project.name = record.get('name')
        project.description = record.get('description')
        project.industry = record.get('industry')
        project.journey_step = record.get('journey_step')
        project.journey_progress = jsonb_loads(record.get('journey_progress'))
        project.created_at = record.get('created_at')
        project.updated_at = record.get('updated_at')
        return project

    def _model_to_dict(self, model: Project) -> Dict[str, Any]:
        """Convert Project model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'user_id': model.user_id,
            'name': model.name,
            'description': model.description,
            'industry': model.industry,
            'journey_step': model.journey_step,
            'journey_progress': jsonb_dumps(model.journey_progress),
            'created_at': model.created_at,
            'updated_at': model.updated_at
        }

    async def find_by_user_id(
        self,
        user_id: str,
        limit: Optional[int] = None
    ) -> List[Project]:
        """
        Find all projects for a user

        Args:
            user_id: User ID
            limit: Maximum number of projects

        Returns:
            List of Project instances
        """
        if limit:
            query = "SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2"
            records = await self._db_manager.fetch(query, user_id, limit)
        else:
            query = "SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC"
            records = await self._db_manager.fetch(query, user_id)

        return [self._record_to_model(r) for r in records]

    async def find_by_journey_step(
        self,
        journey_step: str,
        limit: Optional[int] = None
    ) -> List[Project]:
        """
        Find projects at a specific journey step

        Args:
            journey_step: Journey step name
            limit: Maximum number of projects

        Returns:
            List of Project instances
        """
        if limit:
            query = "SELECT * FROM projects WHERE journey_step = $1 LIMIT $2"
            records = await self._db_manager.fetch(query, journey_step, limit)
        else:
            query = "SELECT * FROM projects WHERE journey_step = $1"
            records = await self._db_manager.fetch(query, journey_step)

        return [self._record_to_model(r) for r in records]

    async def update_journey_step(
        self,
        project_id: str,
        journey_step: str
    ) -> Optional[Project]:
        """
        Update the journey step for a project

        Args:
            project_id: Project ID
            journey_step: New journey step

        Returns:
            Updated Project instance
        """
        return await self.update(project_id, {'journey_step': journey_step})

    async def update_journey_progress(
        self,
        project_id: str,
        updates: Dict[str, Any]
    ) -> Optional[Project]:
        """
        Update journey progress for a project

        Args:
            project_id: Project ID
            updates: Dictionary of progress updates

        Returns:
            Updated Project instance
        """
        # Get existing progress
        project = await self.find_by_id(project_id)
        if project and project.journey_progress:
            # Merge with existing progress
            merged = {**project.journey_progress, **updates}
            return await self.update(project_id, {'journey_progress': merged})
        else:
            return await self.update(project_id, {'journey_progress': updates})

    async def find_by_industry(
        self,
        industry: str,
        limit: Optional[int] = None
    ) -> List[Project]:
        """
        Find projects by industry

        Args:
            industry: Industry name
            limit: Maximum number of projects

        Returns:
            List of Project instances
        """
        if limit:
            query = "SELECT * FROM projects WHERE industry = $1 LIMIT $2"
            records = await self._db_manager.fetch(query, industry, limit)
        else:
            query = "SELECT * FROM projects WHERE industry = $1"
            records = await self._db_manager.fetch(query, industry)

        return [self._record_to_model(r) for r in records]

    async def search(
        self,
        search_term: str,
        user_id: Optional[str] = None,
        limit: int = 20
    ) -> List[Project]:
        """
        Search projects by name or description

        Args:
            search_term: Search term
            user_id: Optional user ID filter
            limit: Maximum number of results

        Returns:
            List of matching Project instances
        """
        term = f"%{search_term}%"

        if user_id:
            query = """
                SELECT * FROM projects
                WHERE user_id = $1
                AND (name ILIKE $2 OR description ILIKE $2)
                ORDER BY created_at DESC
                LIMIT $3
            """
            records = await self._db_manager.fetch(query, user_id, term, limit)
        else:
            query = """
                SELECT * FROM projects
                WHERE name ILIKE $1 OR description ILIKE $1
                ORDER BY created_at DESC
                LIMIT $2
            """
            records = await self._db_manager.fetch(query, term, limit)

        return [self._record_to_model(r) for r in records]

    @property
    def _db_manager(self):
        """Get database manager"""
        from ..models.database import db_manager
        return db_manager


def get_project_repository(db_manager=None) -> ProjectRepository:
    """Get or create project repository instance"""
    return ProjectRepository()
