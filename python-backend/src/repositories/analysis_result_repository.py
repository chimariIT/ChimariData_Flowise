"""
Analysis Result Repository

Handles analysis result database operations.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from .base_repository import BaseRepository
from ..models.database import jsonb_dumps, jsonb_loads


class AnalysisResult(BaseRepository):
    """Analysis Result model"""

    def __init__(self):
        super().__init__()
        self.table_name = "analysis_results"
        self.id_field = "id"

    id: Optional[str] = None
    project_id: Optional[str] = None
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    analysis_type: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    status: Optional[str] = None
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    execution_time_ms: Optional[int] = None
    created_at: Optional[datetime] = None

    def _record_to_model(self, record) -> Optional['AnalysisResult']:
        """Convert database record to AnalysisResult model"""
        if record is None:
            return None

        result = AnalysisResult()
        result.id = record.get('id')
        result.project_id = record.get('project_id')
        result.user_id = record.get('user_id')
        result.session_id = record.get('session_id')
        result.analysis_type = record.get('analysis_type')
        result.data = jsonb_loads(record.get('data'))
        result.metadata = jsonb_loads(record.get('metadata'))
        result.status = record.get('status')
        result.error = record.get('error')
        result.started_at = record.get('started_at')
        result.completed_at = record.get('completed_at')
        result.execution_time_ms = record.get('execution_time_ms')
        result.created_at = record.get('created_at')
        return result

    def _model_to_dict(self, model: 'AnalysisResult') -> Dict[str, Any]:
        """Convert AnalysisResult model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'project_id': model.project_id,
            'user_id': model.user_id,
            'session_id': model.session_id,
            'analysis_type': model.analysis_type,
            'data': jsonb_dumps(model.data),
            'metadata': jsonb_dumps(model.metadata),
            'status': model.status,
            'error': model.error,
            'started_at': model.started_at,
            'completed_at': model.completed_at,
            'execution_time_ms': model.execution_time_ms,
            'created_at': model.created_at
        }


class AnalysisResultRepository(BaseRepository[AnalysisResult]):
    """Repository for analysis result operations"""

    def __init__(self):
        super().__init__()
        self.table_name = "analysis_results"
        self.id_field = "id"

    def _record_to_model(self, record) -> Optional[AnalysisResult]:
        """Convert database record to AnalysisResult model"""
        if record is None:
            return None

        result = AnalysisResult()
        result.id = record.get('id')
        result.project_id = record.get('project_id')
        result.user_id = record.get('user_id')
        result.session_id = record.get('session_id')
        result.analysis_type = record.get('analysis_type')
        result.data = jsonb_loads(record.get('data'))
        result.metadata = jsonb_loads(record.get('metadata'))
        result.status = record.get('status')
        result.error = record.get('error')
        result.started_at = record.get('started_at')
        result.completed_at = record.get('completed_at')
        result.execution_time_ms = record.get('execution_time_ms')
        result.created_at = record.get('created_at')
        return result

    def _model_to_dict(self, model: AnalysisResult) -> Dict[str, Any]:
        """Convert AnalysisResult model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'project_id': model.project_id,
            'user_id': model.user_id,
            'session_id': model.session_id,
            'analysis_type': model.analysis_type,
            'data': jsonb_dumps(model.data),
            'metadata': jsonb_dumps(model.metadata),
            'status': model.status,
            'error': model.error,
            'started_at': model.started_at,
            'completed_at': model.completed_at,
            'execution_time_ms': model.execution_time_ms,
            'created_at': model.created_at
        }

    async def find_by_project_id(
        self,
        project_id: str,
        limit: Optional[int] = None
    ) -> List[AnalysisResult]:
        """Find all analysis results for a project"""
        if limit:
            query = "SELECT * FROM analysis_results WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2"
            records = await self._db_manager.fetch(query, project_id, limit)
        else:
            query = "SELECT * FROM analysis_results WHERE project_id = $1 ORDER BY created_at DESC"
            records = await self._db_manager.fetch(query, project_id)

        return [self._record_to_model(r) for r in records]

    async def find_by_session_id(
        self,
        session_id: str
    ) -> List[AnalysisResult]:
        """Find all analysis results for a session"""
        query = "SELECT * FROM analysis_results WHERE session_id = $1 ORDER BY created_at DESC"
        records = await self._db_manager.fetch(query, session_id)
        return [self._record_to_model(r) for r in records]

    async def find_by_analysis_type(
        self,
        project_id: str,
        analysis_type: str,
        limit: int = 10
    ) -> List[AnalysisResult]:
        """Find analysis results by type"""
        query = """
            SELECT * FROM analysis_results
            WHERE project_id = $1 AND analysis_type = $2
            ORDER BY created_at DESC
            LIMIT $3
        """
        records = await self._db_manager.fetch(query, project_id, analysis_type, limit)
        return [self._record_to_model(r) for r in records]

    async def find_by_status(
        self,
        project_id: str,
        status: str,
        limit: int = 50
    ) -> List[AnalysisResult]:
        """Find analysis results by status"""
        query = """
            SELECT * FROM analysis_results
            WHERE project_id = $1 AND status = $2
            ORDER BY created_at DESC
            LIMIT $3
        """
        records = await self._db_manager.fetch(query, project_id, status, limit)
        return [self._record_to_model(r) for r in records]

    async def update_status(
        self,
        result_id: str,
        status: str
    ) -> Optional[AnalysisResult]:
        """Update analysis result status"""
        updates = {'status': status}
        if status == 'completed':
            updates['completed_at'] = datetime.utcnow()
        return await self.update(result_id, updates)

    async def update_result(
        self,
        result_id: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
        execution_time_ms: Optional[int] = None
    ) -> Optional[AnalysisResult]:
        """Update analysis result with data"""
        from ..models.database import jsonb_dumps
        updates = {
            'data': jsonb_dumps(data),
            'status': 'completed',
            'completed_at': datetime.utcnow()
        }
        if metadata:
            updates['metadata'] = jsonb_dumps(metadata)
        if execution_time_ms is not None:
            updates['execution_time_ms'] = execution_time_ms
        return await self.update(result_id, updates)

    async def update_error(
        self,
        result_id: str,
        error: str
    ) -> Optional[AnalysisResult]:
        """Update analysis result error"""
        return await self.update(result_id, {
            'error': error,
            'status': 'failed',
            'completed_at': datetime.utcnow()
        })

    @property
    def _db_manager(self):
        """Get database manager"""
        from ..models.database import db_manager
        return db_manager

def get_analysis_result_repository(db_manager=None) -> AnalysisResultRepository:
    """Get or create analysis result repository instance"""
    return AnalysisResultRepository()
