"""
Billing Campaign Repository

Handles CRUD operations for billing campaigns.
"""

from typing import Optional, List
from sqlalchemy import select, and_
from .base_repository import BaseRepository
from ..models.database import (
    BillingCampaign as Model,
    generate_uuid,
)


class BillingCampaignRepository(BaseRepository[Model]):
    """Repository for billing campaign CRUD operations"""

    def __init__(self, db_manager=None):
        super().__init__()
        self._db_manager = db_manager

    def _record_to_model(self, record: dict) -> Model:
        """Convert database record to model instance"""
        if not record:
            return None

        model = Model()
        model.id = record.get("id")
        model.name = record.get("name")
        model.code = record.get("code")
        model.discount_percentage = record.get("discount_percentage")
        model.description = record.get("description")
        model.start_date = record.get("start_date")
        model.end_date = record.get("end_date")
        model.active = record.get("active", True)
        model.max_uses = record.get("max_uses")
        model.current_uses = record.get("current_uses", 0)
        model.created_by = record.get("created_by")
        model.created_at = record.get("created_at")
        model.updated_at = record.get("updated_at")
        return model

    def _model_to_dict(self, model: Model) -> dict:
        """Convert model instance to dictionary"""
        return {
            "id": model.id,
            "name": model.name,
            "code": model.code,
            "discount_percentage": model.discount_percentage,
            "description": model.description,
            "start_date": model.start_date.isoformat() if model.start_date else None,
            "end_date": model.end_date.isoformat() if model.end_date else None,
            "active": model.active,
            "max_uses": model.max_uses,
            "current_uses": model.current_uses,
            "created_by": model.created_by,
            "created_at": model.created_at.isoformat() if model.created_at else None,
            "updated_at": model.updated_at.isoformat() if model.updated_at else None,
        }

    async def find_by_id(self, campaign_id: str) -> Optional[Model]:
        """Find a campaign by ID"""
        query = select(Model).where(Model.id == campaign_id)
        result = await self._db_manager.fetchrow(query)
        return self._record_to_model(result)

    async def find_by_code(self, code: str) -> Optional[Model]:
        """Find an active campaign by code"""
        query = select(Model).where(
            and_(
                Model.code == code,
                Model.active == True
            )
        )
        result = await self._db_manager.fetchrow(query)
        return self._record_to_model(result)

    async def find_active(self) -> List[Model]:
        """Get all active campaigns"""
        query = select(Model).where(
            and_(Model.active == True, Model.current_uses < Model.max_uses)
        ).order_by(Model.created_at)

        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def create(self, model: Model) -> Model:
        """Create a new billing campaign"""
        if not model.id:
            model.id = generate_uuid()

        data = self._model_to_dict(model)
        columns = ", ".join(data.keys())
        placeholders = ", ".join(f"${i+1}" for i in range(len(data)))

        query = f"""
            INSERT INTO billing_campaigns ({columns})
            VALUES ({placeholders})
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, *data.values())

        # Update model with generated values
        for key, value in data.items():
            setattr(model, key, value)

        return self._record_to_model(result)

    async def update(self, model: Model) -> Model:
        """Update an existing billing campaign"""
        data = self._model_to_dict(model)
        data.pop("id", None)  # Don't update ID
        data.pop("created_at", None)  # Don't update created timestamp
        data.pop("created_by", None)  # Don't update creator

        if not data:
            return model

        set_clauses = [f"{key} = ${i+1}" for i, key in enumerate(data.keys())]
        query = f"""
            UPDATE billing_campaigns
            SET {", ".join(set_clauses)}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${len(data) + 1}
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, *data.values(), model.id)

        # Update model with new values
        for key, value in data.items():
            setattr(model, key, value)

        return self._record_to_model(result)

    async def increment_usage(self, campaign_id: str) -> Optional[Model]:
        """Increment campaign usage count"""
        query = f"""
            UPDATE billing_campaigns
            SET current_uses = current_uses + 1
            WHERE id = $1 AND (max_uses IS NULL OR current_uses < max_uses)
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, campaign_id)
        return self._record_to_model(result)

    async def delete(self, campaign_id: str) -> bool:
        """Delete a billing campaign"""
        query = f"DELETE FROM billing_campaigns WHERE id = $1 RETURNING id"
        result = await self._db_manager.execute(query, campaign_id)
        return result is not None


def get_billing_campaign_repository(db_manager=None) -> BillingCampaignRepository:
    """Get or create billing campaign repository instance"""
    return BillingCampaignRepository(db_manager)
