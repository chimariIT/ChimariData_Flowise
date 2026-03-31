"""
Transformation Repository

Handles transformation database operations.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from .base_repository import BaseRepository
from ..models.database import jsonb_dumps, jsonb_loads


class Transformation(BaseRepository):
    """Transformation model"""

    def __init__(self):
        super().__init__()
        self.table_name = "transformations"
        self.id_field = "id"

    id: Optional[str] = None
    project_id: Optional[str] = None
    dataset_id: Optional[str] = None
    name: Optional[str] = None
    operation_type: Optional[str] = None
    steps: Optional[List[Dict[str, Any]]] = None
    status: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    execution_time_ms: Optional[int] = None
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    def _record_to_model(self, record) -> Optional['Transformation']:
        """Convert database record to Transformation model"""
        if record is None:
            return None

        trans = Transformation()
        trans.id = record.get('id')
        trans.project_id = record.get('project_id')
        trans.dataset_id = record.get('dataset_id')
        trans.name = record.get('name')
        trans.operation_type = record.get('operation_type')
        trans.steps = jsonb_loads(record.get('steps'))
        trans.status = record.get('status')
        trans.result = jsonb_loads(record.get('result'))
        trans.error = record.get('error')
        trans.execution_time_ms = record.get('execution_time_ms')
        trans.created_at = record.get('created_at')
        trans.completed_at = record.get('completed_at')
        return trans

    def _model_to_dict(self, model: 'Transformation') -> Dict[str, Any]:
        """Convert Transformation model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'project_id': model.project_id,
            'dataset_id': model.dataset_id,
            'name': model.name,
            'operation_type': model.operation_type,
            'steps': jsonb_dumps(model.steps),
            'status': model.status,
            'result': jsonb_dumps(model.result),
            'error': model.error,
            'execution_time_ms': model.execution_time_ms,
            'created_at': model.created_at,
            'completed_at': model.completed_at
        }


class TransformationRepository(BaseRepository[Transformation]):
    """Repository for transformation operations"""

    def __init__(self):
        super().__init__()
        self.table_name = "transformations"
        self.id_field = "id"

    def _record_to_model(self, record) -> Optional[Transformation]:
        """Convert database record to Transformation model"""
        if record is None:
            return None

        trans = Transformation()
        trans.id = record.get('id')
        trans.project_id = record.get('project_id')
        trans.dataset_id = record.get('dataset_id')
        trans.name = record.get('name')
        trans.operation_type = record.get('operation_type')
        trans.steps = jsonb_loads(record.get('steps'))
        trans.status = record.get('status')
        trans.result = jsonb_loads(record.get('result'))
        trans.error = record.get('error')
        trans.execution_time_ms = record.get('execution_time_ms')
        trans.created_at = record.get('created_at')
        trans.completed_at = record.get('completed_at')
        return trans

    def _model_to_dict(self, model: Transformation) -> Dict[str, Any]:
        """Convert Transformation model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'project_id': model.project_id,
            'dataset_id': model.dataset_id,
            'name': model.name,
            'operation_type': model.operation_type,
            'steps': jsonb_dumps(model.steps),
            'status': model.status,
            'result': jsonb_dumps(model.result),
            'error': model.error,
            'execution_time_ms': model.execution_time_ms,
            'created_at': model.created_at,
            'completed_at': model.completed_at
        }

    async def find_by_project_id(
        self,
        project_id: str,
        limit: Optional[int] = None
    ) -> List[Transformation]:
        """Find all transformations for a project"""
        if limit:
            query = "SELECT * FROM transformations WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2"
            records = await self._db_manager.fetch(query, project_id, limit)
        else:
            query = "SELECT * FROM transformations WHERE project_id = $1 ORDER BY created_at DESC"
            records = await self._db_manager.fetch(query, project_id)

        return [self._record_to_model(r) for r in records]

    async def find_by_dataset_id(
        self,
        dataset_id: str,
        limit: Optional[int] = None
    ) -> List[Transformation]:
        """Find all transformations for a dataset"""
        if limit:
            query = "SELECT * FROM transformations WHERE dataset_id = $1 ORDER BY created_at DESC LIMIT $2"
            records = await self._db_manager.fetch(query, dataset_id, limit)
        else:
            query = "SELECT * FROM transformations WHERE dataset_id = $1 ORDER BY created_at DESC"
            records = await self._db_manager.fetch(query, dataset_id)

        return [self._record_to_model(r) for r in records]

    async def find_by_status(
        self,
        project_id: str,
        status: str,
        limit: int = 50
    ) -> List[Transformation]:
        """Find transformations by status"""
        query = """
            SELECT * FROM transformations
            WHERE project_id = $1 AND status = $2
            ORDER BY created_at DESC
            LIMIT $3
        """
        records = await self._db_manager.fetch(query, project_id, status, limit)
        return [self._record_to_model(r) for r in records]

    async def update_status(
        self,
        transformation_id: str,
        status: str
    ) -> Optional[Transformation]:
        """Update transformation status"""
        updates = {'status': status}
        if status == 'completed':
            updates['completed_at'] = datetime.utcnow()
        return await self.update(transformation_id, updates)

    async def update_result(
        self,
        transformation_id: str,
        result: Dict[str, Any],
        execution_time_ms: Optional[int] = None
    ) -> Optional[Transformation]:
        """Update transformation result"""
        from ..models.database import jsonb_dumps
        updates = {
            'result': jsonb_dumps(result),
            'status': 'completed',
            'completed_at': datetime.utcnow()
        }
        if execution_time_ms is not None:
            updates['execution_time_ms'] = execution_time_ms
        return await self.update(transformation_id, updates)

    async def update_error(
        self,
        transformation_id: str,
        error: str
    ) -> Optional[Transformation]:
        """Update transformation error"""
        return await self.update(transformation_id, {
            'error': error,
            'status': 'failed',
            'completed_at': datetime.utcnow()
        })

    @property
    def _db_manager(self):
        """Get database manager"""
        from ..models.database import db_manager
        return db_manager

def get_transformation_repository(db_manager=None) -> TransformationRepository:
    """Get or create transformation repository instance"""
    return TransformationRepository()
