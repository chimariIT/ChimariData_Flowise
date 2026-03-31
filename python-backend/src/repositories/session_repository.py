"""
Session Repository

Handles orchestrator session database operations.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from .base_repository import BaseRepository
from ..models.database import jsonb_dumps, jsonb_loads


class Session(BaseRepository):
    """Session model"""

    def __init__(self):
        super().__init__()
        self.table_name = "sessions"
        self.id_field = "id"

    id: Optional[str] = None
    user_id: Optional[str] = None
    project_id: Optional[str] = None
    current_step: Optional[str] = None
    state: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    def _record_to_model(self, record) -> Optional['Session']:
        """Convert database record to Session model"""
        if record is None:
            return None

        session = Session()
        session.id = record.get('id')
        session.user_id = record.get('user_id')
        session.project_id = record.get('project_id')
        session.current_step = record.get('current_step')
        session.state = jsonb_loads(record.get('state'))
        session.created_at = record.get('created_at')
        session.updated_at = record.get('updated_at')
        return session

    def _model_to_dict(self, model: 'Session') -> Dict[str, Any]:
        """Convert Session model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'user_id': model.user_id,
            'project_id': model.project_id,
            'current_step': model.current_step,
            'state': jsonb_dumps(model.state),
            'created_at': model.created_at,
            'updated_at': model.updated_at
        }


class SessionRepository(BaseRepository[Session]):
    """Repository for session operations"""

    def __init__(self):
        super().__init__()
        self.table_name = "sessions"
        self.id_field = "id"

    def _record_to_model(self, record) -> Optional[Session]:
        """Convert database record to Session model"""
        if record is None:
            return None

        session = Session()
        session.id = record.get('id')
        session.user_id = record.get('user_id')
        session.project_id = record.get('project_id')
        session.current_step = record.get('current_step')
        session.state = jsonb_loads(record.get('state'))
        session.created_at = record.get('created_at')
        session.updated_at = record.get('updated_at')
        return session

    def _model_to_dict(self, model: Session) -> Dict[str, Any]:
        """Convert Session model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'user_id': model.user_id,
            'project_id': model.project_id,
            'current_step': model.current_step,
            'state': jsonb_dumps(model.state),
            'created_at': model.created_at,
            'updated_at': model.updated_at
        }

    async def find_by_project_id(
        self,
        project_id: str,
        limit: Optional[int] = None
    ) -> List[Session]:
        """Find all sessions for a project"""
        if limit:
            query = "SELECT * FROM sessions WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2"
            records = await self._db_manager.fetch(query, project_id, limit)
        else:
            query = "SELECT * FROM sessions WHERE project_id = $1 ORDER BY created_at DESC"
            records = await self._db_manager.fetch(query, project_id)

        return [self._record_to_model(r) for r in records]

    async def find_active(
        self,
        project_id: str,
        limit: int = 10
    ) -> List[Session]:
        """Find active sessions (not completed)"""
        query = """
            SELECT * FROM sessions
            WHERE project_id = $1 AND current_step != 'completed'
            ORDER BY updated_at DESC
            LIMIT $2
        """
        records = await self._db_manager.fetch(query, project_id, limit)
        return [self._record_to_model(r) for r in records]

    async def find_by_step(
        self,
        project_id: str,
        current_step: str
    ) -> List[Session]:
        """Find sessions by current step"""
        query = """
            SELECT * FROM sessions
            WHERE project_id = $1 AND current_step = $2
            ORDER BY created_at DESC
        """
        records = await self._db_manager.fetch(query, project_id, current_step)
        return [self._record_to_model(r) for r in records]

    async def update_step(
        self,
        session_id: str,
        current_step: str
    ) -> Optional[Session]:
        """Update session step"""
        return await self.update(session_id, {
            'current_step': current_step,
            'updated_at': datetime.utcnow()
        })

    async def update_state(
        self,
        session_id: str,
        state_updates: Dict[str, Any]
    ) -> Optional[Session]:
        """Update session state (merge with existing)"""
        session = await self.find_by_id(session_id)
        if session and session.state:
            merged = {**session.state, **state_updates}
        else:
            merged = state_updates

        from ..models.database import jsonb_dumps
        return await self.update(session_id, {
            'state': jsonb_dumps(merged),
            'updated_at': datetime.utcnow()
        })

    async def cleanup_old_sessions(
        self,
        days: int = 30,
        project_id: Optional[str] = None
    ) -> int:
        """Delete old sessions"""
        if project_id:
            query = """
                DELETE FROM sessions
                WHERE project_id = $1 AND updated_at < NOW() - INTERVAL '%s days'
            """ % days
            result = await self._db_manager.execute(query, project_id)
        else:
            query = """
                DELETE FROM sessions
                WHERE updated_at < NOW() - INTERVAL '%s days'
            """ % days
            result = await self._db_manager.execute(query)

        return int(result.split()[1]) if result else 0

    @property
    def _db_manager(self):
        """Get database manager"""
        from ..models.database import db_manager
        return db_manager

def get_session_repository(db_manager=None) -> SessionRepository:
    """Get or create session repository instance"""
    return SessionRepository()
