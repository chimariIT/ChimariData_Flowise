"""
Subscription Tier Repository

Handles CRUD operations for subscription tiers.
"""

from typing import Optional, List
from sqlalchemy import select, and_, or_
from .base_repository import BaseRepository
from ..models.database import (
    SubscriptionTier as Model,
    generate_uuid,
    jsonb_dumps,
    jsonb_loads,
)


class SubscriptionTierRepository(BaseRepository[Model]):
    """Repository for subscription tier CRUD operations"""

    def __init__(self, db_manager=None):
        super().__init__()
        # Store db_manager if needed, though not used by BaseRepository
        self._db_manager = db_manager

    def _record_to_model(self, record: dict) -> Model:
        """Convert database record to model instance"""
        if not record:
            return None

        model = Model()
        model.id = record.get("id")
        model.display_name = record.get("display_name")
        model.monthly_price_usd = record.get("monthly_price_usd")
        model.features = jsonb_loads(record.get("features", "[]"))
        model.analysis_limit = record.get("analysis_limit")
        model.projects_limit = record.get("projects_limit")
        model.stripe_price_id = record.get("stripe_price_id")
        model.is_active = record.get("is_active", True)
        return model

    def _model_to_dict(self, model: Model) -> dict:
        """Convert model instance to dictionary"""
        return {
            "id": model.id,
            "display_name": model.display_name,
            "monthly_price_usd": model.monthly_price_usd,
            "features": model.features,
            "analysis_limit": model.analysis_limit,
            "projects_limit": model.projects_limit,
            "stripe_price_id": model.stripe_price_id,
            "is_active": model.is_active,
            "created_at": model.created_at.isoformat() if model.created_at else None,
            "updated_at": model.updated_at.isoformat() if model.updated_at else None,
        }

    async def find_active_tiers(self) -> List[Model]:
        """Get all active subscription tiers"""
        query = select(Model).where(Model.is_active == True).order_by(Model.monthly_price_usd)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def find_by_id(self, tier_id: str) -> Optional[Model]:
        """Find a tier by ID"""
        query = select(Model).where(Model.id == tier_id)
        result = await self._db_manager.fetchrow(query)
        return self._record_to_model(result)

    async def find_by_code(self, code: str) -> Optional[Model]:
        """Find a tier by stripe price ID"""
        query = select(Model).where(Model.stripe_price_id == code)
        result = await self._db_manager.fetchrow(query)
        return self._record_to_model(result)

    async def create(self, model: Model) -> Model:
        """Create a new subscription tier"""
        if not model.id:
            model.id = generate_uuid()

        data = self._model_to_dict(model)
        columns = ", ".join(data.keys())
        placeholders = ", ".join(f"${i+1}" for i in range(len(data)))

        query = f"""
            INSERT INTO subscription_tiers ({columns})
            VALUES ({placeholders})
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, *data.values())

        # Update model with generated values
        for key, value in data.items():
            setattr(model, key, value)

        return self._record_to_model(result)

    async def update(self, model: Model) -> Model:
        """Update an existing subscription tier"""
        data = self._model_to_dict(model)
        data.pop("id", None)  # Don't update ID
        data.pop("created_at", None)  # Don't update created timestamp

        if not data:
            return model

        set_clauses = [f"{key} = ${i+1}" for i, key in enumerate(data.keys())]
        query = f"""
            UPDATE subscription_tiers
            SET {", ".join(set_clauses)}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${len(data) + 1}
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, *data.values(), model.id)

        # Update model with new values
        for key, value in data.items():
            setattr(model, key, value)

        return self._record_to_model(result)

    async def delete(self, tier_id: str) -> bool:
        """Delete a subscription tier"""
        query = f"DELETE FROM subscription_tiers WHERE id = $1 RETURNING id"
        result = await self._db_manager.execute(query, tier_id)
        return result is not None

    async def count_active(self) -> int:
        """Count active subscription tiers"""
        query = select(Model).where(Model.is_active == True)
        result = await self._db_manager.fetchrow(query)
        return result.get("count", 0) if result else 0


# Convenience function to get repository instance
def get_subscription_tier_repository(db_manager=None) -> SubscriptionTierRepository:
    """Get or create subscription tier repository instance"""
    return SubscriptionTierRepository(db_manager)
