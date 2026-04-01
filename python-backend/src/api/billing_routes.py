"""
Billing API Routes

Endpoints for subscription management, billing, and payment processing.
"""

from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from ..services.billing_service import get_billing_service
from ..models.database import User, SubscriptionTier
from ..auth.middleware import get_current_user


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


class CreateCampaignRequest(BaseModel):
    """Request model for creating a billing campaign"""
    name: str = Field(..., description="Campaign name")
    code: str = Field(..., min_length=3, max_length=50, description="Promo code")
    discount_percentage: float = Field(..., ge=0, le=100, description="Discount percentage (0-100)")
    description: Optional[str] = None
    start_date: str = Field(..., description="Start date (ISO format)")
    end_date: Optional[str] = None
    max_uses: Optional[int] = Field(None, gt=0, description="Max uses (null = unlimited)")


class ApplyCampaignRequest(BaseModel):
    """Request model for applying a campaign code"""
    code: str = Field(..., min_length=3, max_length=50, description="Promo code to apply")


# ============================================================================
# Router
# ============================================================================

router = APIRouter(prefix="/billing", tags=["billing"])

# Get singleton billing service
billing_service = get_billing_service()


# ============================================================================
# Subscription Tier Endpoints
# ============================================================================


@router.get("/overview", response_model=dict)
async def get_billing_overview():
    """
    Get billing overview for admin dashboard

    Returns revenue, pending invoices, active campaigns, etc.
    """
    try:
        overview = await billing_service.get_admin_overview()
        return {
            "success": True,
            "data": overview
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tiers", response_model=dict)
async def get_tiers(active_only: bool = True):
    """
    Get all subscription tiers

    Query parameters:
        active_only: If True, return only active tiers
    """
    try:
        tiers = await billing_service.get_all_tiers(active_only=active_only)
        return {
            "success": True,
            "tiers": tiers,
            "count": len(tiers)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tiers", status_code=status.HTTP_201_CREATED, response_model=dict)
async def create_tier(request: CreateTierRequest):
    """
    Create a new subscription tier (admin only)

    Requires admin privileges in production.
    """
    try:
        tier_data = {
            "display_name": request.display_name,
            "monthly_price_usd": request.monthly_price_usd,
            "features": request.features,
            "analysis_limit": request.analysis_limit,
            "projects_limit": request.projects_limit,
            "stripe_price_id": request.stripe_price_id,
        }

        tier = await billing_service.create_tier(tier_data)
        return {
            "success": True,
            "data": tier,
            "message": "Subscription tier created successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/tiers/{tier_id}", response_model=dict)
async def update_tier(tier_id: str, request: UpdateTierRequest):
    """
    Update a subscription tier (admin only)

    Requires admin privileges in production.
    """
    try:
        # Build update data with only provided fields
        update_data = {}
        if request.monthly_price_usd is not None:
            update_data["monthly_price_usd"] = request.monthly_price_usd
        if request.features is not None:
            update_data["features"] = request.features
        if request.analysis_limit is not None:
            update_data["analysis_limit"] = request.analysis_limit
        if request.projects_limit is not None:
            update_data["projects_limit"] = request.projects_limit
        if request.stripe_price_id is not None:
            update_data["stripe_price_id"] = request.stripe_price_id
        if request.is_active is not None:
            update_data["is_active"] = request.is_active

        tier = await billing_service.update_tier(tier_id, update_data)

        if not tier:
            raise HTTPException(status_code=404, detail="Tier not found")

        return {
            "success": True,
            "data": tier,
            "message": "Subscription tier updated successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/tiers/{tier_id}", response_model=dict)
async def delete_tier(tier_id: str):
    """
    Delete a subscription tier (admin only)

    Requires admin privileges in production.
    """
    try:
        success = await billing_service.delete_tier(tier_id)

        if not success:
            raise HTTPException(status_code=404, detail="Tier not found")

        return {
            "success": True,
            "message": "Subscription tier deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Invoice Endpoints
# ============================================================================


@router.get("/invoices", response_model=dict)
async def get_invoices(user_id: str, limit: int = 10, offset: int = 0):
    """
    Get invoices for a user

    Query parameters:
        user_id: User ID
        limit: Maximum number of invoices to return
        offset: Offset for pagination
    """
    try:
        invoices = await billing_service.get_user_invoices(user_id, limit, offset)
        return {
            "success": True,
            "data": invoices,
            "count": len(invoices)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/invoices/{invoice_id}", response_model=dict)
async def get_invoice(invoice_id: str):
    """
    Get a specific invoice by ID

    In production, would check user permissions.
    """
    try:
        # For now, return a placeholder
        return {
            "success": True,
            "data": {
                "id": invoice_id,
                "status": "pending",
                "amount": 0.0,
            },
            "message": "Invoice retrieval not fully implemented"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/invoices/{invoice_id}/pay", response_model=dict)
async def mark_invoice_paid(invoice_id: str):
    """
    Mark an invoice as paid (admin only, or via Stripe webhook)

    Requires admin privileges in production.
    """
    try:
        result = await billing_service.mark_invoice_paid(invoice_id)

        if not result:
            raise HTTPException(status_code=404, detail="Invoice not found")

        return {
            "success": True,
            "data": result,
            "message": "Invoice marked as paid"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Billing Campaign Endpoints
# ============================================================================


@router.get("/campaigns", response_model=dict)
async def get_campaigns(active_only: bool = True):
    """
    Get all billing campaigns

    Query parameters:
        active_only: If True, return only active campaigns
    """
    try:
        campaigns = await billing_service.get_all_campaigns(active_only=active_only)
        return {
            "success": True,
            "data": campaigns,
            "count": len(campaigns)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/campaigns", status_code=status.HTTP_201_CREATED, response_model=dict)
async def create_campaign(request: CreateCampaignRequest, created_by: str = "system"):
    """
    Create a new billing campaign (admin only)

    Requires admin privileges in production.
    """
    try:
        campaign_data = {
            "name": request.name,
            "code": request.code,
            "discount_percentage": request.discount_percentage,
            "description": request.description,
            "start_date": request.start_date,
            "end_date": request.end_date,
            "max_uses": request.max_uses,
        }

        campaign = await billing_service.create_campaign(campaign_data, created_by)
        return {
            "success": True,
            "data": campaign,
            "message": "Billing campaign created successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/campaigns/apply", response_model=dict)
async def apply_campaign(
    request: ApplyCampaignRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Apply a billing campaign code to a user's subscription

    Requires authenticated user.
    """
    try:
        result = await billing_service.apply_campaign(request.code, current_user.id)

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/campaigns/{campaign_id}", response_model=dict)
async def update_campaign(campaign_id: str, request: CreateCampaignRequest):
    """
    Update a billing campaign (admin only)

    Requires admin privileges in production.
    """
    try:
        update_data = {}
        if request.name is not None:
            update_data["name"] = request.name
        if request.code is not None:
            update_data["code"] = request.code
        if request.discount_percentage is not None:
            update_data["discount_percentage"] = request.discount_percentage
        if request.description is not None:
            update_data["description"] = request.description
        if request.start_date is not None:
            update_data["start_date"] = request.start_date
        if request.end_date is not None:
            update_data["end_date"] = request.end_date
        if request.max_uses is not None:
            update_data["max_uses"] = request.max_uses

        campaign = await billing_service.update_campaign(campaign_id, update_data)

        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")

        return {
            "success": True,
            "data": campaign,
            "message": "Billing campaign updated successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/campaigns/{campaign_id}", response_model=dict)
async def delete_campaign(campaign_id: str):
    """
    Delete a billing campaign (admin only)

    Requires admin privileges in production.
    """
    try:
        success = await billing_service.delete_campaign(campaign_id)

        if not success:
            raise HTTPException(status_code=404, detail="Campaign not found")

        return {
            "success": True,
            "message": "Billing campaign deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Stripe Webhook Endpoint (Mock Implementation)
# ============================================================================


@router.post("/stripe/webhook", response_model=dict)
async def stripe_webhook():
    """
    Handle Stripe webhooks for payment events

    In production, this would:
    - Verify webhook signature
    - Process payment_intent.succeeded events
    - Process invoice.payment_succeeded events
    - Process customer.subscription.updated events
    - Update invoice statuses
    - Send email notifications
    """
    try:
        # Mock implementation - in production, integrate with actual Stripe SDK
        return {
            "success": True,
            "message": "Stripe webhook endpoint - requires actual Stripe integration",
            "note": "Events to handle: payment_intent.succeeded, invoice.payment_succeeded, customer.subscription.updated"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def include_billing_routes(app):
    """Include billing routes in the FastAPI app"""
    from fastapi import FastAPI

    app.include_router(router, prefix="/api/v1")
    return app
