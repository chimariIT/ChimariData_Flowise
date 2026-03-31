"""
Insight Repository

Handles insight database operations.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from .base_repository import BaseRepository
from ..models.database import jsonb_dumps, jsonb_loads


class Insight(BaseRepository):
    """Insight model"""

    def __init__(self):
        super().__init__()
        self.table_name = "insights"
        self.id_field = "id"

    id: Optional[str] = None
    project_id: Optional[str] = None
    session_id: Optional[str] = None
    analysis_result_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    significance: Optional[str] = None
    evidence: Optional[Dict[str, Any]] = None
    data_elements_used: Optional[List[str]] = None
    confidence: Optional[float] = None
    generated_by: Optional[str] = None
    created_at: Optional[datetime] = None

    def _record_to_model(self, record) -> Optional['Insight']:
        """Convert database record to Insight model"""
        if record is None:
            return None

        insight = Insight()
        insight.id = record.get('id')
        insight.project_id = record.get('project_id')
        insight.session_id = record.get('session_id')
        insight.analysis_result_id = record.get('analysis_result_id')
        insight.title = record.get('title')
        insight.description = record.get('description')
        insight.significance = record.get('significance')
        insight.evidence = jsonb_loads(record.get('evidence'))
        insight.data_elements_used = jsonb_loads(record.get('data_elements_used'))
        insight.confidence = record.get('confidence')
        insight.generated_by = record.get('generated_by')
        insight.created_at = record.get('created_at')
        return insight

    def _model_to_dict(self, model: 'Insight') -> Dict[str, Any]:
        """Convert Insight model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'project_id': model.project_id,
            'session_id': model.session_id,
            'analysis_result_id': model.analysis_result_id,
            'title': model.title,
            'description': model.description,
            'significance': model.significance,
            'evidence': jsonb_dumps(model.evidence),
            'data_elements_used': jsonb_dumps(model.data_elements_used),
            'confidence': model.confidence,
            'generated_by': model.generated_by,
            'created_at': model.created_at
        }


class InsightRepository(BaseRepository[Insight]):
    """Repository for insight operations"""

    def __init__(self):
        super().__init__()
        self.table_name = "insights"
        self.id_field = "id"

    def _record_to_model(self, record) -> Optional[Insight]:
        """Convert database record to Insight model"""
        if record is None:
            return None

        insight = Insight()
        insight.id = record.get('id')
        insight.project_id = record.get('project_id')
        insight.session_id = record.get('session_id')
        insight.analysis_result_id = record.get('analysis_result_id')
        insight.title = record.get('title')
        insight.description = record.get('description')
        insight.significance = record.get('significance')
        insight.evidence = jsonb_loads(record.get('evidence'))
        insight.data_elements_used = jsonb_loads(record.get('data_elements_used'))
        insight.confidence = record.get('confidence')
        insight.generated_by = record.get('generated_by')
        insight.created_at = record.get('created_at')
        return insight

    def _model_to_dict(self, model: Insight) -> Dict[str, Any]:
        """Convert Insight model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'project_id': model.project_id,
            'session_id': model.session_id,
            'analysis_result_id': model.analysis_result_id,
            'title': model.title,
            'description': model.description,
            'significance': model.significance,
            'evidence': jsonb_dumps(model.evidence),
            'data_elements_used': jsonb_dumps(model.data_elements_used),
            'confidence': model.confidence,
            'generated_by': model.generated_by,
            'created_at': model.created_at
        }

    async def find_by_project_id(
        self,
        project_id: str,
        limit: Optional[int] = None
    ) -> List[Insight]:
        """Find all insights for a project"""
        if limit:
            query = "SELECT * FROM insights WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2"
            records = await self._db_manager.fetch(query, project_id, limit)
        else:
            query = "SELECT * FROM insights WHERE project_id = $1 ORDER BY created_at DESC"
            records = await self._db_manager.fetch(query, project_id)

        return [self._record_to_model(r) for r in records]

    async def find_by_significance(
        self,
        project_id: str,
        significance: str,
        limit: int = 10
    ) -> List[Insight]:
        """Find insights by significance level"""
        query = """
            SELECT * FROM insights
            WHERE project_id = $1 AND significance = $2
            ORDER BY confidence DESC
            LIMIT $3
        """
        records = await self._db_manager.fetch(query, project_id, significance, limit)
        return [self._record_to_model(r) for r in records]

    async def find_by_generated_by(
        self,
        project_id: str,
        generated_by: str,
        limit: int = 20
    ) -> List[Insight]:
        """Find insights by generator (data_scientist, business_agent)"""
        query = """
            SELECT * FROM insights
            WHERE project_id = $1 AND generated_by = $2
            ORDER BY created_at DESC
            LIMIT $3
        """
        records = await self._db_manager.fetch(query, project_id, generated_by, limit)
        return [self._record_to_model(r) for r in records]

    async def find_high_significance(
        self,
        project_id: str,
        limit: int = 5
    ) -> List[Insight]:
        """Find high significance insights"""
        query = """
            SELECT * FROM insights
            WHERE project_id = $1 AND significance = 'high'
            ORDER BY confidence DESC
            LIMIT $2
        """
        records = await self._db_manager.fetch(query, project_id, limit)
        return [self._record_to_model(r) for r in records]

    @property
    def _db_manager(self):
        """Get database manager"""
        from ..models.database import db_manager
        return db_manager

def get_insight_repository(db_manager=None) -> InsightRepository:
    """Get or create insight repository instance"""
    return InsightRepository()
