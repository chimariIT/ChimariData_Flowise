"""
Dataset Repository

Handles dataset-related database operations.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from .base_repository import BaseRepository
from ..models.database import jsonb_dumps, jsonb_loads


class Dataset(BaseRepository):
    """Dataset model"""

    def __init__(self):
        super().__init__()
        self.table_name = "datasets"
        self.id_field = "id"

    id: Optional[str] = None
    project_id: Optional[str] = None
    name: Optional[str] = None
    source_type: Optional[str] = None
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    record_count: Optional[int] = None
    schema: Optional[Dict[str, Any]] = None
    pii_analysis: Optional[Dict[str, Any]] = None
    pii_decision: Optional[Dict[str, Any]] = None
    embeddings_generated: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    def _record_to_model(self, record) -> Optional['Dataset']:
        """Convert database record to Dataset model"""
        if record is None:
            return None

        dataset = Dataset()
        dataset.id = record.get('id')
        dataset.project_id = record.get('project_id')
        dataset.name = record.get('name')
        dataset.source_type = record.get('source_type')
        dataset.file_path = record.get('file_path')
        dataset.file_size = record.get('file_size')
        dataset.record_count = record.get('record_count')
        dataset.schema = jsonb_loads(record.get('schema'))
        dataset.pii_analysis = jsonb_loads(record.get('pii_analysis'))
        dataset.pii_decision = jsonb_loads(record.get('pii_decision'))
        dataset.embeddings_generated = record.get('embeddings_generated')
        dataset.created_at = record.get('created_at')
        dataset.updated_at = record.get('updated_at')
        return dataset

    def _model_to_dict(self, model: 'Dataset') -> Dict[str, Any]:
        """Convert Dataset model to dictionary"""
        return {
            'id': model.id,
            'project_id': model.project_id,
            'name': model.name,
            'source_type': model.source_type,
            'file_path': model.file_path,
            'file_size': model.file_size,
            'record_count': model.record_count,
            'schema': jsonb_dumps(model.schema),
            'pii_analysis': jsonb_dumps(model.pii_analysis),
            'pii_decision': jsonb_dumps(model.pii_decision),
            'embeddings_generated': model.embeddings_generated,
            'created_at': model.created_at,
            'updated_at': model.updated_at
        }


class DatasetRepository(BaseRepository[Dataset]):
    """Repository for dataset operations"""

    def __init__(self):
        super().__init__()
        self.table_name = "datasets"
        self.id_field = "id"

    def _record_to_model(self, record) -> Optional[Dataset]:
        """Convert database record to Dataset model"""
        if record is None:
            return None

        dataset = Dataset()
        dataset.id = record.get('id')
        dataset.project_id = record.get('project_id')
        dataset.name = record.get('name')
        dataset.source_type = record.get('source_type')
        dataset.file_path = record.get('file_path')
        dataset.file_size = record.get('file_size')
        dataset.record_count = record.get('record_count')
        dataset.schema = jsonb_loads(record.get('schema'))
        dataset.pii_analysis = jsonb_loads(record.get('pii_analysis'))
        dataset.pii_decision = jsonb_loads(record.get('pii_decision'))
        dataset.embeddings_generated = record.get('embeddings_generated')
        dataset.created_at = record.get('created_at')
        dataset.updated_at = record.get('updated_at')
        return dataset

    def _model_to_dict(self, model: Dataset) -> Dict[str, Any]:
        """Convert Dataset model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'project_id': model.project_id,
            'name': model.name,
            'source_type': model.source_type,
            'file_path': model.file_path,
            'file_size': model.file_size,
            'record_count': model.record_count,
            'schema': jsonb_dumps(model.schema),
            'pii_analysis': jsonb_dumps(model.pii_analysis),
            'pii_decision': jsonb_dumps(model.pii_decision),
            'embeddings_generated': model.embeddings_generated,
            'created_at': model.created_at,
            'updated_at': model.updated_at
        }

    async def find_by_project_id(
        self,
        project_id: str,
        limit: Optional[int] = None
    ) -> List[Dataset]:
        """
        Find all datasets for a project

        Args:
            project_id: Project ID
            limit: Maximum number of datasets

        Returns:
            List of Dataset instances
        """
        if limit:
            query = "SELECT * FROM datasets WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2"
            records = await self._db_manager.fetch(query, project_id, limit)
        else:
            query = "SELECT * FROM datasets WHERE project_id = $1 ORDER BY created_at DESC"
            records = await self._db_manager.fetch(query, project_id)

        return [self._record_to_model(r) for r in records]

    async def find_by_source_type(
        self,
        source_type: str,
        project_id: Optional[str] = None
    ) -> List[Dataset]:
        """
        Find datasets by source type

        Args:
            source_type: Source type (computer, google_drive, etc.)
            project_id: Optional project ID filter

        Returns:
            List of Dataset instances
        """
        if project_id:
            query = "SELECT * FROM datasets WHERE source_type = $1 AND project_id = $2"
            records = await self._db_manager.fetch(query, source_type, project_id)
        else:
            query = "SELECT * FROM datasets WHERE source_type = $1"
            records = await self._db_manager.fetch(query, source_type)

        return [self._record_to_model(r) for r in records]

    async def update_pii_analysis(
        self,
        dataset_id: str,
        pii_analysis: Dict[str, Any]
    ) -> Optional[Dataset]:
        """
        Update PII analysis for a dataset

        Args:
            dataset_id: Dataset ID
            pii_analysis: PII analysis results

        Returns:
            Updated Dataset instance
        """
        from ..models.database import jsonb_dumps
        return await self.update(dataset_id, {'pii_analysis': jsonb_dumps(pii_analysis)})

    async def update_pii_decision(
        self,
        dataset_id: str,
        pii_decision: Dict[str, Any]
    ) -> Optional[Dataset]:
        """
        Update PII decision for a dataset

        Args:
            dataset_id: Dataset ID
            pii_decision: PII decision

        Returns:
            Updated Dataset instance
        """
        from ..models.database import jsonb_dumps
        return await self.update(dataset_id, {'pii_decision': jsonb_dumps(pii_decision)})

    async def update_schema(
        self,
        dataset_id: str,
        schema: Dict[str, Any]
    ) -> Optional[Dataset]:
        """
        Update schema for a dataset

        Args:
            dataset_id: Dataset ID
            schema: Dataset schema

        Returns:
            Updated Dataset instance
        """
        from ..models.database import jsonb_dumps
        return await self.update(dataset_id, {'schema': jsonb_dumps(schema)})

    async def set_embeddings_generated(
        self,
        dataset_id: str,
        generated: bool = True
    ) -> Optional[Dataset]:
        """
        Mark embeddings as generated for a dataset

        Args:
            dataset_id: Dataset ID
            generated: Whether embeddings are generated

        Returns:
            Updated Dataset instance
        """
        return await self.update(dataset_id, {'embeddings_generated': generated})

    async def find_without_embeddings(
        self,
        project_id: Optional[str] = None,
        limit: int = 100
    ) -> List[Dataset]:
        """
        Find datasets that don't have embeddings generated

        Args:
            project_id: Optional project ID filter
            limit: Maximum number of results

        Returns:
            List of Dataset instances
        """
        if project_id:
            query = """
                SELECT * FROM datasets
                WHERE embeddings_generated = FALSE AND project_id = $1
                LIMIT $2
            """
            records = await self._db_manager.fetch(query, project_id, limit)
        else:
            query = """
                SELECT * FROM datasets
                WHERE embeddings_generated = FALSE
                LIMIT $1
            """
            records = await self._db_manager.fetch(query, limit)

        return [self._record_to_model(r) for r in records]

    async def get_total_record_count(self, project_id: str) -> int:
        """
        Get total record count for a project

        Args:
            project_id: Project ID

        Returns:
            Total record count
        """
        query = "SELECT SUM(record_count) FROM datasets WHERE project_id = $1"
        result = await self._db_manager.fetchval(query, project_id)
        return int(result) if result else 0

    @property
    def _db_manager(self):
        """Get database manager"""
        from ..models.database import db_manager
        return db_manager


def get_dataset_repository(db_manager=None) -> DatasetRepository:
    """Get or create dataset repository instance"""
    return DatasetRepository()
