"""
Question Mapping Repository

Handles question-to-element mapping database operations.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from .base_repository import BaseRepository
from ..models.database import jsonb_dumps, jsonb_loads


class QuestionMapping(BaseRepository):
    """Question Mapping model"""

    def __init__(self):
        super().__init__()
        self.table_name = "question_mappings"
        self.id_field = "id"

    id: Optional[str] = None
    project_id: Optional[str] = None
    question_id: Optional[str] = None
    question_text: Optional[str] = None
    question_embedding: Optional[List[float]] = None
    related_elements: Optional[List[Dict[str, Any]]] = None
    related_columns: Optional[List[str]] = None
    recommended_analyses: Optional[List[str]] = None
    intent_type: Optional[str] = None
    confidence: Optional[float] = None
    created_at: Optional[datetime] = None

    def _record_to_model(self, record) -> Optional['QuestionMapping']:
        """Convert database record to QuestionMapping model"""
        if record is None:
            return None

        mapping = QuestionMapping()
        mapping.id = record.get('id')
        mapping.project_id = record.get('project_id')
        mapping.question_id = record.get('question_id')
        mapping.question_text = record.get('question_text')
        mapping.question_embedding = jsonb_loads(record.get('question_embedding'))
        mapping.related_elements = jsonb_loads(record.get('related_elements'))
        mapping.related_columns = jsonb_loads(record.get('related_columns'))
        mapping.recommended_analyses = jsonb_loads(record.get('recommended_analyses'))
        mapping.intent_type = record.get('intent_type')
        mapping.confidence = record.get('confidence')
        mapping.created_at = record.get('created_at')
        return mapping

    def _model_to_dict(self, model: 'QuestionMapping') -> Dict[str, Any]:
        """Convert QuestionMapping model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'project_id': model.project_id,
            'question_id': model.question_id,
            'question_text': model.question_text,
            'question_embedding': jsonb_dumps(model.question_embedding),
            'related_elements': jsonb_dumps(model.related_elements),
            'related_columns': jsonb_dumps(model.related_columns),
            'recommended_analyses': jsonb_dumps(model.recommended_analyses),
            'intent_type': model.intent_type,
            'confidence': model.confidence,
            'created_at': model.created_at
        }


class QuestionMappingRepository(BaseRepository[QuestionMapping]):
    """Repository for question mapping operations"""

    def __init__(self):
        super().__init__()
        self.table_name = "question_mappings"
        self.id_field = "id"

    def _record_to_model(self, record) -> Optional[QuestionMapping]:
        """Convert database record to QuestionMapping model"""
        if record is None:
            return None

        mapping = QuestionMapping()
        mapping.id = record.get('id')
        mapping.project_id = record.get('project_id')
        mapping.question_id = record.get('question_id')
        mapping.question_text = record.get('question_text')
        mapping.question_embedding = jsonb_loads(record.get('question_embedding'))
        mapping.related_elements = jsonb_loads(record.get('related_elements'))
        mapping.related_columns = jsonb_loads(record.get('related_columns'))
        mapping.recommended_analyses = jsonb_loads(record.get('recommended_analyses'))
        mapping.intent_type = record.get('intent_type')
        mapping.confidence = record.get('confidence')
        mapping.created_at = record.get('created_at')
        return mapping

    def _model_to_dict(self, model: QuestionMapping) -> Dict[str, Any]:
        """Convert QuestionMapping model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'project_id': model.project_id,
            'question_id': model.question_id,
            'question_text': model.question_text,
            'question_embedding': jsonb_dumps(model.question_embedding),
            'related_elements': jsonb_dumps(model.related_elements),
            'related_columns': jsonb_dumps(model.related_columns),
            'recommended_analyses': jsonb_dumps(model.recommended_analyses),
            'intent_type': model.intent_type,
            'confidence': model.confidence,
            'created_at': model.created_at
        }

    async def find_by_project_id(
        self,
        project_id: str,
        limit: Optional[int] = None
    ) -> List[QuestionMapping]:
        """Find all question mappings for a project"""
        if limit:
            query = "SELECT * FROM question_mappings WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2"
            records = await self._db_manager.fetch(query, project_id, limit)
        else:
            query = "SELECT * FROM question_mappings WHERE project_id = $1 ORDER BY created_at DESC"
            records = await self._db_manager.fetch(query, project_id)

        return [self._record_to_model(r) for r in records]

    async def find_by_question_id(
        self,
        question_id: str,
        project_id: Optional[str] = None
    ) -> Optional[QuestionMapping]:
        """Find a question mapping by question ID"""
        if project_id:
            query = "SELECT * FROM question_mappings WHERE question_id = $1 AND project_id = $2"
            record = await self._db_manager.fetchrow(query, question_id, project_id)
        else:
            query = "SELECT * FROM question_mappings WHERE question_id = $1"
            record = await self._db_manager.fetchrow(query, question_id)

        return self._record_to_model(record)

    async def find_by_intent_type(
        self,
        project_id: str,
        intent_type: str,
        limit: int = 10
    ) -> List[QuestionMapping]:
        """Find question mappings by intent type"""
        query = """
            SELECT * FROM question_mappings
            WHERE project_id = $1 AND intent_type = $2
            ORDER BY confidence DESC
            LIMIT $3
        """
        records = await self._db_manager.fetch(query, project_id, intent_type, limit)
        return [self._record_to_model(r) for r in records]

    async def search_by_text(
        self,
        project_id: str,
        search_text: str,
        limit: int = 10
    ) -> List[QuestionMapping]:
        """Search question mappings by text"""
        term = f"%{search_text}%"
        query = """
            SELECT * FROM question_mappings
            WHERE project_id = $1 AND question_text ILIKE $2
            ORDER BY confidence DESC
            LIMIT $3
        """
        records = await self._db_manager.fetch(query, project_id, term, limit)
        return [self._record_to_model(r) for r in records]

    @property
    def _db_manager(self):
        """Get database manager"""
        from ..models.database import db_manager
        return db_manager

def get_question_mapping_repository(db_manager=None) -> QuestionMappingRepository:
    """Get or create question mapping repository instance"""
    return QuestionMappingRepository()
