"""
Audit Log Repository

Handles CRUD operations for audit logs.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy import select, and_, or_
from .base_repository import BaseRepository
from ..models.database import (
    AuditLog as AuditLogModel,
    generate_uuid,
)


class AuditLogRepository(BaseRepository[AuditLogModel]):
    """Repository for audit log CRUD operations"""

    def __init__(self, db_manager=None):
        super().__init__()
        self.table_name = "audit_logs"
        self._db_manager = db_manager

    def _record_to_model(self, record: dict) -> Optional[AuditLogModel]:
        """Convert database record to model instance"""
        if not record:
            return None

        model = AuditLogModel()
        model.id = record.get("id")
        model.user_id = record.get("user_id")
        model.action = record.get("action")
        model.resource_type = record.get("resource_type")
        model.resource_id = record.get("resource_id")
        model.details = record.get("details", {})
        model.ip_address = record.get("ip_address")
        model.user_agent = record.get("user_agent")
        model.status = record.get("status")
        model.created_at = record.get("created_at")
        return model

    def _model_to_dict(self, model: AuditLogModel) -> dict:
        """Convert model instance to dictionary"""
        return {
            "id": model.id,
            "user_id": model.user_id,
            "action": model.action,
            "resource_type": model.resource_type,
            "resource_id": model.resource_id,
            "details": model.details,
            "ip_address": model.ip_address,
            "user_agent": model.user_agent,
            "status": model.status,
            "created_at": model.created_at.isoformat() if model.created_at else None,
        }

    async def find_by_id(self, log_id: str) -> Optional[AuditLogModel]:
        """Find an audit log by ID"""
        query = select(AuditLogModel).where(AuditLogModel.id == log_id)
        result = await self._db_manager.fetchrow(query)
        return self._record_to_model(result)

    async def find_by_user(
        self,
        user_id: str,
        limit: int = 100,
        offset: int = 0
    ) -> List[AuditLogModel]:
        """Find audit logs for a specific user"""
        query = select(AuditLogModel).where(
            AuditLogModel.user_id == user_id
        ).order_by(AuditLogModel.created_at.desc()).limit(limit).offset(offset)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def find_by_action(
        self,
        action: str,
        limit: int = 100
    ) -> List[AuditLogModel]:
        """Find audit logs by action type"""
        query = select(AuditLogModel).where(
            AuditLogModel.action == action
        ).order_by(AuditLogModel.created_at.desc()).limit(limit)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def find_by_resource(
        self,
        resource_type: str,
        resource_id: Optional[str] = None,
        limit: int = 100
    ) -> List[AuditLogModel]:
        """Find audit logs by resource"""
        conditions = [AuditLogModel.resource_type == resource_type]
        if resource_id:
            conditions.append(AuditLogModel.resource_id == resource_id)

        query = select(AuditLogModel).where(
            and_(*conditions)
        ).order_by(AuditLogModel.created_at.desc()).limit(limit)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def find_by_date_range(
        self,
        start_date: datetime,
        end_date: datetime,
        limit: int = 100,
        offset: int = 0
    ) -> List[AuditLogModel]:
        """Find audit logs within a date range"""
        query = select(AuditLogModel).where(
            and_(
                AuditLogModel.created_at >= start_date,
                AuditLogModel.created_at <= end_date
            )
        ).order_by(AuditLogModel.created_at.desc()).limit(limit).offset(offset)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def find_recent(
        self,
        hours: int = 24,
        limit: int = 100
    ) -> List[AuditLogModel]:
        """Find recent audit logs"""
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        query = select(AuditLogModel).where(
            AuditLogModel.created_at >= cutoff
        ).order_by(AuditLogModel.created_at.desc()).limit(limit)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def create(self, model: AuditLogModel) -> AuditLogModel:
        """Create a new audit log"""
        if not model.id:
            model.id = generate_uuid()

        data = self._model_to_dict(model)
        columns = ", ".join(data.keys())
        placeholders = ", ".join(f"${i+1}" for i in range(len(data)))

        query = f"""
            INSERT INTO audit_logs ({columns})
            VALUES ({placeholders})
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, *data.values())

        # Update model with generated values
        for key, value in data.items():
            setattr(model, key, value)

        return self._record_to_model(result)

    async def search(
        self,
        filters: Dict[str, Any],
        limit: int = 100,
        offset: int = 0
    ) -> List[AuditLogModel]:
        """Search audit logs with filters"""
        conditions = []

        # Build conditions from filters
        if "user_id" in filters:
            conditions.append(AuditLogModel.user_id == filters["user_id"])
        if "action" in filters:
            conditions.append(AuditLogModel.action == filters["action"])
        if "resource_type" in filters:
            conditions.append(AuditLogModel.resource_type == filters["resource_type"])
        if "resource_id" in filters:
            conditions.append(AuditLogModel.resource_id == filters["resource_id"])
        if "status" in filters:
            conditions.append(AuditLogModel.status == filters["status"])
        if "start_date" in filters:
            conditions.append(AuditLogModel.created_at >= filters["start_date"])
        if "end_date" in filters:
            conditions.append(AuditLogModel.created_at <= filters["end_date"])

        query = select(AuditLogModel)

        if conditions:
            query = query.where(and_(*conditions))

        query = query.order_by(AuditLogModel.created_at.desc()).limit(limit).offset(offset)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def get_statistics(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Get audit log statistics"""
        conditions = []

        if start_date:
            conditions.append(AuditLogModel.created_at >= start_date)
        if end_date:
            conditions.append(AuditLogModel.created_at <= end_date)

        query = select(AuditLogModel)

        if conditions:
            query = query.where(and_(*conditions))

        result = await self._db_manager.fetch(query)

        # Calculate statistics
        stats = {
            "total_logs": len(result),
            "by_action": {},
            "by_resource_type": {},
            "by_status": {},
        }

        for log in result:
            # Count by action
            action = log.get("action", "unknown")
            stats["by_action"][action] = stats["by_action"].get(action, 0) + 1

            # Count by resource type
            resource_type = log.get("resource_type", "unknown")
            stats["by_resource_type"][resource_type] = stats["by_resource_type"].get(resource_type, 0) + 1

            # Count by status
            status = log.get("status", "unknown")
            stats["by_status"][status] = stats["by_status"].get(status, 0) + 1

        return stats


def get_audit_log_repository(db_manager=None) -> AuditLogRepository:
    """Get or create audit log repository instance"""
    return AuditLogRepository(db_manager)
