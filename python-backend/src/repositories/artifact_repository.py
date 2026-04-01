"""
Artifact Repository

Handles artifact (PDFs, presentations) database operations.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from .base_repository import BaseRepository
from ..models.database import jsonb_dumps, jsonb_loads


class Artifact(BaseRepository):
    """Artifact model"""

    def __init__(self):
        super().__init__()
        self.table_name = "artifacts"
        self.id_field = "id"

    id: Optional[str] = None
    project_id: Optional[str] = None
    session_id: Optional[str] = None
    type: Optional[str] = None
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None
    download_count: Optional[int] = None
    created_at: Optional[datetime] = None

    def _record_to_model(self, record) -> Optional['Artifact']:
        """Convert database record to Artifact model"""
        if record is None:
            return None

        artifact = Artifact()
        artifact.id = record.get('id')
        artifact.project_id = record.get('project_id')
        artifact.session_id = record.get('session_id')
        artifact.type = record.get('type')
        artifact.file_path = record.get('file_path')
        artifact.file_size = record.get('file_size')
        artifact.metadata = jsonb_loads(record.get('metadata'))
        artifact.download_count = record.get('download_count')
        artifact.created_at = record.get('created_at')
        return artifact

    def _model_to_dict(self, model: 'Artifact') -> Dict[str, Any]:
        """Convert Artifact model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'project_id': model.project_id,
            'session_id': model.session_id,
            'type': model.type,
            'file_path': model.file_path,
            'file_size': model.file_size,
            'metadata': jsonb_dumps(model.metadata),
            'download_count': model.download_count,
            'created_at': model.created_at
        }


class ArtifactRepository(BaseRepository[Artifact]):
    """Repository for artifact operations"""

    def __init__(self):
        super().__init__()
        self.table_name = "artifacts"
        self.id_field = "id"

    def _record_to_model(self, record) -> Optional[Artifact]:
        """Convert database record to Artifact model"""
        if record is None:
            return None

        artifact = Artifact()
        artifact.id = record.get('id')
        artifact.project_id = record.get('project_id')
        artifact.session_id = record.get('session_id')
        artifact.type = record.get('type')
        artifact.file_path = record.get('file_path')
        artifact.file_size = record.get('file_size')
        artifact.metadata = jsonb_loads(record.get('metadata'))
        artifact.download_count = record.get('download_count')
        artifact.created_at = record.get('created_at')
        return artifact

    def _model_to_dict(self, model: Artifact) -> Dict[str, Any]:
        """Convert Artifact model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'project_id': model.project_id,
            'session_id': model.session_id,
            'type': model.type,
            'file_path': model.file_path,
            'file_size': model.file_size,
            'metadata': jsonb_dumps(model.metadata),
            'download_count': model.download_count,
            'created_at': model.created_at
        }

    async def find_by_project_id(
        self,
        project_id: str,
        limit: Optional[int] = None
    ) -> List[Artifact]:
        """Find all artifacts for a project"""
        if limit:
            query = "SELECT * FROM artifacts WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2"
            records = await self._db_manager.fetch(query, project_id, limit)
        else:
            query = "SELECT * FROM artifacts WHERE project_id = $1 ORDER BY created_at DESC"
            records = await self._db_manager.fetch(query, project_id)

        return [self._record_to_model(r) for r in records]

    async def find_by_session_id(
        self,
        session_id: str
    ) -> List[Artifact]:
        """Find all artifacts for a session"""
        query = "SELECT * FROM artifacts WHERE session_id = $1 ORDER BY created_at DESC"
        records = await self._db_manager.fetch(query, session_id)
        return [self._record_to_model(r) for r in records]

    async def find_by_type(
        self,
        project_id: str,
        artifact_type: str,
        limit: int = 10
    ) -> List[Artifact]:
        """Find artifacts by type"""
        query = """
            SELECT * FROM artifacts
            WHERE project_id = $1 AND type = $2
            ORDER BY created_at DESC
            LIMIT $3
        """
        records = await self._db_manager.fetch(query, project_id, artifact_type, limit)
        return [self._record_to_model(r) for r in records]

    async def increment_download_count(self, artifact_id: str) -> Optional[Artifact]:
        """Increment download count for an artifact"""
        query = """
            UPDATE artifacts
            SET download_count = download_count + 1
            WHERE id = $1
            RETURNING *
        """
        record = await self._db_manager.fetchrow(query, artifact_id)
        return self._record_to_model(record)

    @property
    def _db_manager(self):
        """Get database manager"""
        from ..models.database import db_manager
        return db_manager

def get_artifact_repository(db_manager=None) -> ArtifactRepository:
    """Get or create artifact repository instance"""
    return ArtifactRepository()
