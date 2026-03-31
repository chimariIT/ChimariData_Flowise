"""
Evidence Link Repository

Handles evidence chain link database operations.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from .base_repository import BaseRepository
from ..models.database import jsonb_dumps, jsonb_loads


class EvidenceLink(BaseRepository):
    """Evidence Link model"""

    def __init__(self):
        super().__init__()
        self.table_name = "evidence_links"
        self.id_field = "id"

    id: Optional[str] = None
    project_id: Optional[str] = None
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    link_type: Optional[str] = None
    confidence: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None

    def _record_to_model(self, record) -> Optional['EvidenceLink']:
        """Convert database record to EvidenceLink model"""
        if record is None:
            return None

        link = EvidenceLink()
        link.id = record.get('id')
        link.project_id = record.get('project_id')
        link.source_type = record.get('source_type')
        link.source_id = record.get('source_id')
        link.target_type = record.get('target_type')
        link.target_id = record.get('target_id')
        link.link_type = record.get('link_type')
        link.confidence = record.get('confidence')
        link.metadata = jsonb_loads(record.get('metadata'))
        link.created_at = record.get('created_at')
        return link

    def _model_to_dict(self, model: 'EvidenceLink') -> Dict[str, Any]:
        """Convert EvidenceLink model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'project_id': model.project_id,
            'source_type': model.source_type,
            'source_id': model.source_id,
            'target_type': model.target_type,
            'target_id': model.target_id,
            'link_type': model.link_type,
            'confidence': model.confidence,
            'metadata': jsonb_dumps(model.metadata),
            'created_at': model.created_at
        }


class EvidenceLinkRepository(BaseRepository[EvidenceLink]):
    """Repository for evidence link operations"""

    def __init__(self):
        super().__init__()
        self.table_name = "evidence_links"
        self.id_field = "id"

    def _record_to_model(self, record) -> Optional[EvidenceLink]:
        """Convert database record to EvidenceLink model"""
        if record is None:
            return None

        link = EvidenceLink()
        link.id = record.get('id')
        link.project_id = record.get('project_id')
        link.source_type = record.get('source_type')
        link.source_id = record.get('source_id')
        link.target_type = record.get('target_type')
        link.target_id = record.get('target_id')
        link.link_type = record.get('link_type')
        link.confidence = record.get('confidence')
        link.metadata = jsonb_loads(record.get('metadata'))
        link.created_at = record.get('created_at')
        return link

    def _model_to_dict(self, model: EvidenceLink) -> Dict[str, Any]:
        """Convert EvidenceLink model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'project_id': model.project_id,
            'source_type': model.source_type,
            'source_id': model.source_id,
            'target_type': model.target_type,
            'target_id': model.target_id,
            'link_type': model.link_type,
            'confidence': model.confidence,
            'metadata': jsonb_dumps(model.metadata),
            'created_at': model.created_at
        }

    async def find_by_project_id(
        self,
        project_id: str,
        limit: Optional[int] = None
    ) -> List[EvidenceLink]:
        """Find all evidence links for a project"""
        if limit:
            query = "SELECT * FROM evidence_links WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2"
            records = await self._db_manager.fetch(query, project_id, limit)
        else:
            query = "SELECT * FROM evidence_links WHERE project_id = $1 ORDER BY created_at DESC"
            records = await self._db_manager.fetch(query, project_id)

        return [self._record_to_model(r) for r in records]

    async def find_by_source(
        self,
        project_id: str,
        source_type: str,
        source_id: str
    ) -> List[EvidenceLink]:
        """Find evidence links by source"""
        query = """
            SELECT * FROM evidence_links
            WHERE project_id = $1 AND source_type = $2 AND source_id = $3
            ORDER BY created_at DESC
        """
        records = await self._db_manager.fetch(query, project_id, source_type, source_id)
        return [self._record_to_model(r) for r in records]

    async def find_by_target(
        self,
        project_id: str,
        target_type: str,
        target_id: str
    ) -> List[EvidenceLink]:
        """Find evidence links by target"""
        query = """
            SELECT * FROM evidence_links
            WHERE project_id = $1 AND target_type = $2 AND target_id = $3
            ORDER BY created_at DESC
        """
        records = await self._db_manager.fetch(query, project_id, target_type, target_id)
        return [self._record_to_model(r) for r in records]

    async def find_chain(
        self,
        project_id: str,
        start_type: str,
        start_id: str,
        max_depth: int = 5
    ) -> List[EvidenceLink]:
        """Find evidence chain starting from a source"""
        # This is a simplified chain traversal
        query = """
            SELECT * FROM evidence_links
            WHERE project_id = $1
            ORDER BY created_at ASC
            LIMIT $2
        """
        records = await self._db_manager.fetch(query, project_id, 1000)

        # Build chain by following links
        chain = []
        current_type = start_type
        current_id = start_id

        for _ in range(max_depth):
            found = False
            for record in records:
                link = self._record_to_model(record)
                if link and link.source_type == current_type and link.source_id == current_id:
                    chain.append(link)
                    current_type = link.target_type
                    current_id = link.target_id
                    found = True
                    break
            if not found:
                break

        return chain

    @property
    def _db_manager(self):
        """Get database manager"""
        from ..models.database import db_manager
        return db_manager

def get_evidence_link_repository(db_manager=None) -> EvidenceLinkRepository:
    """Get or create evidence link repository instance"""
    return EvidenceLinkRepository()
