"""
Billing Invoice Repository

Handles CRUD operations for billing invoices.
"""

from typing import Optional, List
from sqlalchemy import select, and_, desc
from .base_repository import BaseRepository
from ..models.database import (
    BillingInvoice as Model,
    generate_uuid,
    jsonb_loads,
)


class BillingInvoiceRepository(BaseRepository[Model]):
    """Repository for billing invoice CRUD operations"""

    def __init__(self, db_manager=None):
        super().__init__()
        self._db_manager = db_manager

    def _record_to_model(self, record: dict) -> Model:
        """Convert database record to model instance"""
        if not record:
            return None

        model = Model()
        model.id = record.get("id")
        model.user_id = record.get("user_id")
        model.tier_id = record.get("tier_id")
        model.amount = record.get("amount")
        model.currency = record.get("currency")
        model.status = record.get("status")
        model.stripe_invoice_id = record.get("stripe_invoice_id")
        model.billing_period_start = record.get("billing_period_start")
        model.billing_period_end = record.get("billing_period_end")
        model.created_at = record.get("created_at")
        model.paid_at = record.get("paid_at")
        model.due_at = record.get("due_at")
        return model

    def _model_to_dict(self, model: Model) -> dict:
        """Convert model instance to dictionary"""
        return {
            "id": model.id,
            "user_id": model.user_id,
            "tier_id": model.tier_id,
            "amount": model.amount,
            "currency": model.currency,
            "status": model.status,
            "stripe_invoice_id": model.stripe_invoice_id,
            "billing_period_start": model.billing_period_start.isoformat() if model.billing_period_start else None,
            "billing_period_end": model.billing_period_end.isoformat() if model.billing_period_end else None,
            "created_at": model.created_at.isoformat() if model.created_at else None,
            "paid_at": model.paid_at.isoformat() if model.paid_at else None,
            "due_at": model.due_at.isoformat() if model.due_at else None,
        }

    async def find_by_id(self, invoice_id: str) -> Optional[Model]:
        """Find an invoice by ID"""
        query = select(Model).where(Model.id == invoice_id)
        result = await self._db_manager.fetchrow(query)
        return self._record_to_model(result)

    async def find_by_user(self, user_id: str, limit: int = 10, offset: int = 0) -> List[Model]:
        """Get invoices for a user"""
        query = select(Model).where(
            Model.user_id == user_id
        ).order_by(desc(Model.created_at)).limit(limit).offset(offset)

        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def find_pending(self, user_id: str) -> List[Model]:
        """Get pending invoices for a user"""
        query = select(Model).where(
            and_(Model.user_id == user_id, Model.status == "pending")
        ).order_by(Model.due_at)

        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def find_overdue(self) -> List[Model]:
        """Get overdue invoices across all users"""
        from datetime import datetime, timedelta
        overdue_date = datetime.utcnow() - timedelta(days=1)

        query = select(Model).where(
            and_(
                Model.due_at < overdue_date,
                Model.status.in_(["pending", "failed"])
            )
        ).order_by(Model.due_at)

        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def create(self, model: Model) -> Model:
        """Create a new billing invoice"""
        if not model.id:
            model.id = generate_uuid()

        data = self._model_to_dict(model)
        columns = ", ".join(data.keys())
        placeholders = ", ".join(f"${i+1}" for i in range(len(data)))

        query = f"""
            INSERT INTO billing_invoices ({columns})
            VALUES ({placeholders})
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, *data.values())

        # Update model with generated values
        for key, value in data.items():
            setattr(model, key, value)

        return self._record_to_model(result)

    async def update_status(self, invoice_id: str, status: str, paid_at=None) -> Optional[Model]:
        """Update invoice status"""
        if paid_at:
            query = f"""
                UPDATE billing_invoices
                SET status = $1, paid_at = $2
                WHERE id = $3
                RETURNING *
            """
            result = await self._db_manager.fetchrow(query, status, paid_at, invoice_id)
        else:
            query = f"""
                UPDATE billing_invoices
                SET status = $1
                WHERE id = $2
                RETURNING *
            """
            result = await self._db_manager.fetchrow(query, status, invoice_id)

        return self._record_to_model(result)

    async def get_user_total_spend(self, user_id: str) -> float:
        """Get total spend for a user"""
        query = f"""
            SELECT COALESCE(SUM(amount), 0) as total
            FROM billing_invoices
            WHERE user_id = $1 AND status = 'paid'
        """
        result = await self._db_manager.fetchrow(query, user_id)
        return float(result.get("total", 0)) if result else 0.0


def get_billing_invoice_repository(db_manager=None) -> BillingInvoiceRepository:
    """Get or create billing invoice repository instance"""
    return BillingInvoiceRepository(db_manager)
