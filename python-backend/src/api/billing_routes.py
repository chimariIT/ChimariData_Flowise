"""
Billing API Routes

Real DB implementation using raw SQL (sa_text) against the Drizzle-created
PostgreSQL schema.  Does NOT use the SQLAlchemy ORM models because those
don't match the actual table columns.

Pattern: sa_text + get_db_context + ORJSONResponse.
"""

from typing import List, Optional
from datetime import datetime
import logging

from fastapi import APIRouter, HTTPException, status, Depends, Request
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel, Field

from sqlalchemy import text as sa_text

from ..db import get_db_context
from ..auth.middleware import get_current_user, require_admin, User


logger = logging.getLogger(__name__)


# ============================================================================
# Request/Response Models
# ============================================================================


class CreateTierRequest(BaseModel):
    """Request model for creating a subscription tier"""
    display_name: str = Field(..., description="Display name for the tier")
    monthly_price_usd: float = Field(..., gt=0, description="Monthly price in USD")
    features: List[str] = Field(default_factory=list, description="List of features")
    analysis_limit: Optional[int] = Field(None, gt=0, description="Max analyses per month")
    projects_limit: Optional[int] = Field(None, gt=0, description="Max concurrent projects")
    stripe_price_id: Optional[str] = Field(None, description="Stripe price ID")


class UpdateTierRequest(BaseModel):
    """Request model for updating a subscription tier"""
    monthly_price_usd: Optional[float] = Field(None, gt=0)
    features: Optional[List[str]] = None
    analysis_limit: Optional[int] = Field(None, gt=0)
    projects_limit: Optional[int] = Field(None, gt=0)
    stripe_price_id: Optional[str] = None
    is_active: Optional[bool] = None


class ApplyCampaignRequest(BaseModel):
    """Request model for applying a campaign code"""
    code: str = Field(..., min_length=3, max_length=50, description="Promo code to apply")


# ============================================================================
# Helpers
# ============================================================================

def _row_to_dict(row) -> dict:
    """Convert a SQLAlchemy Row to a plain dict."""
    return dict(row._mapping) if row else {}


def _serialize_value(v):
    """Make a single value JSON-safe."""
    if isinstance(v, datetime):
        return v.isoformat()
    return v


def _serialize_row(row_dict: dict) -> dict:
    """Convert a raw DB row dict to JSON-safe dict."""
    return {k: _serialize_value(v) for k, v in row_dict.items()}


# ============================================================================
# Router
# ============================================================================

router = APIRouter(prefix="/billing", tags=["billing"])


# ============================================================================
# Subscription Status (authenticated user)
# ============================================================================


@router.get("/subscription-status")
async def get_subscription_status(
    current_user: User = Depends(get_current_user),
):
    """
    Get the current user's subscription tier and status.
    """
    try:
        async with get_db_context() as session:
            result = await session.execute(
                sa_text(
                    "SELECT subscription_tier, subscription_status, "
                    "       is_admin, created_at, updated_at "
                    "FROM users WHERE id = :user_id"
                ),
                {"user_id": current_user.id},
            )
            row = result.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        data = _row_to_dict(row)
        return ORJSONResponse(content={
            "success": True,
            "data": {
                "subscriptionTier": data.get("subscription_tier", "free"),
                "subscriptionStatus": data.get("subscription_status", "active"),
                "isAdmin": data.get("is_admin", False),
                "createdAt": _serialize_value(data.get("created_at")),
                "updatedAt": _serialize_value(data.get("updated_at")),
            },
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get subscription status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Quota Status (authenticated user)
# ============================================================================


@router.get("/quota-status")
async def get_quota_status(
    current_user: User = Depends(get_current_user),
):
    """
    Get the current user's monthly usage quotas.
    """
    try:
        async with get_db_context() as session:
            result = await session.execute(
                sa_text(
                    "SELECT subscription_tier, "
                    "       monthly_uploads, monthly_ai_insights, "
                    "       monthly_analysis_components "
                    "FROM users WHERE id = :user_id"
                ),
                {"user_id": current_user.id},
            )
            row = result.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        data = _row_to_dict(row)
        tier = data.get("subscription_tier", "free")

        # Define tier quota limits (matches Node.js backend defaults)
        tier_limits = {
            "free":       {"uploads": 3,  "aiInsights": 5,   "analysisComponents": 10},
            "starter":    {"uploads": 10, "aiInsights": 25,  "analysisComponents": 50},
            "pro":        {"uploads": 50, "aiInsights": 100, "analysisComponents": 500},
            "enterprise": {"uploads": -1, "aiInsights": -1,  "analysisComponents": -1},
        }
        limits = tier_limits.get(tier, tier_limits["free"])

        return ORJSONResponse(content={
            "success": True,
            "data": {
                "tier": tier,
                "usage": {
                    "uploads": data.get("monthly_uploads", 0) or 0,
                    "aiInsights": data.get("monthly_ai_insights", 0) or 0,
                    "analysisComponents": data.get("monthly_analysis_components", 0) or 0,
                },
                "limits": limits,
            },
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get quota status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Trial Credits (authenticated user)
# ============================================================================


@router.get("/trial-credits")
async def get_trial_credits(
    current_user: User = Depends(get_current_user),
):
    """
    Get the current user's trial credit balance.
    """
    try:
        async with get_db_context() as session:
            result = await session.execute(
                sa_text(
                    "SELECT trial_credits, trial_credits_used "
                    "FROM users WHERE id = :user_id"
                ),
                {"user_id": current_user.id},
            )
            row = result.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        data = _row_to_dict(row)
        total = data.get("trial_credits", 0) or 0
        used = data.get("trial_credits_used", 0) or 0

        return ORJSONResponse(content={
            "success": True,
            "data": {
                "trialCredits": total,
                "trialCreditsUsed": used,
                "trialCreditsRemaining": max(total - used, 0),
            },
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get trial credits: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Subscription Tiers (public)
# ============================================================================


@router.get("/tiers")
async def get_tiers(active_only: bool = True):
    """
    Get all subscription tiers from subscription_tier_pricing table.
    """
    try:
        where_clause = "WHERE is_active = true" if active_only else ""

        async with get_db_context() as session:
            result = await session.execute(
                sa_text(
                    f"SELECT id, name, display_name, description, "
                    f"       monthly_price_usd, yearly_price_usd, "
                    f"       features, limits, is_active, created_at "
                    f"FROM subscription_tier_pricing "
                    f"{where_clause} "
                    f"ORDER BY monthly_price_usd ASC NULLS FIRST"
                )
            )
            rows = result.fetchall()

        tiers = [_serialize_row(_row_to_dict(r)) for r in rows]

        return ORJSONResponse(content={
            "success": True,
            "tiers": tiers,
            "count": len(tiers),
        })
    except Exception as e:
        logger.error(f"Failed to get tiers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Invoices (authenticated user)
# ============================================================================


@router.get("/invoices")
async def get_invoices(
    current_user: User = Depends(get_current_user),
    limit: int = 10,
    offset: int = 0,
):
    """
    Get invoices for the authenticated user from billing_invoices table.
    """
    try:
        async with get_db_context() as session:
            result = await session.execute(
                sa_text(
                    "SELECT * FROM billing_invoices "
                    "WHERE user_id = :user_id "
                    "ORDER BY created_at DESC "
                    "LIMIT :limit OFFSET :offset"
                ),
                {"user_id": current_user.id, "limit": limit, "offset": offset},
            )
            rows = result.fetchall()

            # Also get total count for pagination
            count_result = await session.execute(
                sa_text(
                    "SELECT COUNT(*) as total FROM billing_invoices "
                    "WHERE user_id = :user_id"
                ),
                {"user_id": current_user.id},
            )
            total = count_result.scalar() or 0

        invoices = [_serialize_row(_row_to_dict(r)) for r in rows]

        return ORJSONResponse(content={
            "success": True,
            "data": invoices,
            "count": len(invoices),
            "total": total,
        })
    except Exception as e:
        logger.error(f"Failed to get invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/invoices/{invoice_id}")
async def get_invoice(
    invoice_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Get a specific invoice by ID (must belong to current user or admin).
    """
    try:
        async with get_db_context() as session:
            result = await session.execute(
                sa_text(
                    "SELECT * FROM billing_invoices WHERE id = :invoice_id"
                ),
                {"invoice_id": invoice_id},
            )
            row = result.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Invoice not found")

        invoice = _row_to_dict(row)

        # Ownership check: must be the user's invoice or user must be admin
        if invoice.get("user_id") != current_user.id and not current_user.is_admin:
            raise HTTPException(status_code=403, detail="Not authorized to view this invoice")

        return ORJSONResponse(content={
            "success": True,
            "data": _serialize_row(invoice),
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get invoice {invoice_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Billing Overview (admin only)
# ============================================================================


@router.get("/overview")
async def get_billing_overview(
    admin_user: User = Depends(require_admin),
):
    """
    Get billing overview for admin dashboard.
    Revenue, subscriber counts, etc.
    """
    try:
        async with get_db_context() as session:
            # Active subscriber count by tier
            tier_result = await session.execute(
                sa_text(
                    "SELECT subscription_tier, COUNT(*) as count "
                    "FROM users "
                    "WHERE subscription_status = 'active' "
                    "GROUP BY subscription_tier"
                )
            )
            tier_rows = tier_result.fetchall()
            subscribers_by_tier = {
                r._mapping["subscription_tier"]: r._mapping["count"]
                for r in tier_rows
            }

            # Total revenue from paid invoices
            revenue_result = await session.execute(
                sa_text(
                    "SELECT COALESCE(SUM(amount), 0) as total_revenue "
                    "FROM billing_invoices "
                    "WHERE status = 'paid'"
                )
            )
            total_revenue = revenue_result.scalar() or 0

            # Pending invoices count
            pending_result = await session.execute(
                sa_text(
                    "SELECT COUNT(*) FROM billing_invoices WHERE status = 'pending'"
                )
            )
            pending_count = pending_result.scalar() or 0

        return ORJSONResponse(content={
            "success": True,
            "data": {
                "subscribersByTier": subscribers_by_tier,
                "totalRevenue": float(total_revenue),
                "pendingInvoices": pending_count,
            },
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get billing overview: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Stripe Webhook Endpoint (compatibility alias)
# ============================================================================


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    """
    Compatibility alias for legacy billing webhook path.
    Delegates to the canonical Stripe webhook handler with signature validation.
    """
    from .payment_routes import stripe_webhook as payment_webhook
    return await payment_webhook(request)


# ============================================================================
# Include helper
# ============================================================================


def include_billing_routes(app):
    """Include billing routes in the FastAPI app"""
    app.include_router(router, prefix="/api/v1")
    return app
