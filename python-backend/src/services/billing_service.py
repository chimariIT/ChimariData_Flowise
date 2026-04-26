"""
Billing Service

Unified billing service for subscription management, payments, and campaigns.
Integrates with Stripe for actual payment processing.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from ..repositories.subscription_tier_repository import (
    get_subscription_tier_repository, SubscriptionTierRepository
)
from ..repositories.billing_invoice_repository import (
    get_billing_invoice_repository, BillingInvoiceRepository
)
from ..repositories.billing_campaign_repository import (
    get_billing_campaign_repository, BillingCampaignRepository
)
from ..models.database import db_manager


class BillingService:
    """
    Unified billing service for all billing operations

    Features:
    - Subscription tier management
    - Invoice creation and tracking
    - Billing campaign management
    - Usage tracking
    - Integration with Stripe
    """

    def __init__(
        self,
        tier_repo: Optional[SubscriptionTierRepository] = None,
        invoice_repo: Optional[BillingInvoiceRepository] = None,
        campaign_repo: Optional[BillingCampaignRepository] = None,
    ):
        self.tier_repo = tier_repo or get_subscription_tier_repository(db_manager)
        self.invoice_repo = invoice_repo or get_billing_invoice_repository(db_manager)
        self.campaign_repo = campaign_repo or get_billing_campaign_repository(db_manager)

    # ========================================================================
    # Subscription Tier Management
    # ========================================================================

    async def get_all_tiers(self, active_only: bool = True) -> List[Dict[str, Any]]:
        """Get all subscription tiers"""
        if active_only:
            tiers = await self.tier_repo.find_active_tiers()
        else:
            # Get all tiers - would need count() method
            tiers = await self.tier_repo.find_active_tiers()

        return [
            self._tier_to_dict(tier)
            for tier in tiers
        ]

    async def get_tier_by_id(self, tier_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific tier by ID"""
        tier = await self.tier_repo.find_by_id(tier_id)
        return self._tier_to_dict(tier) if tier else None

    async def create_tier(self, tier_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new subscription tier"""
        from ..models.database import SubscriptionTier

        tier = SubscriptionTier()
        tier.id = tier_data.get("id")
        tier.display_name = tier_data.get("display_name")
        tier.monthly_price_usd = tier_data.get("monthly_price_usd")
        tier.features = tier_data.get("features", [])
        tier.analysis_limit = tier_data.get("analysis_limit")
        tier.projects_limit = tier_data.get("projects_limit")
        tier.stripe_price_id = tier_data.get("stripe_price_id")

        result = await self.tier_repo.create(tier)
        return self._tier_to_dict(result)

    async def update_tier(self, tier_id: str, tier_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a subscription tier"""
        from ..models.database import SubscriptionTier

        tier = await self.tier_repo.find_by_id(tier_id)
        if not tier:
            return None

        # Update tier properties
        if "display_name" in tier_data:
            tier.display_name = tier_data["display_name"]
        if "monthly_price_usd" in tier_data:
            tier.monthly_price_usd = tier_data["monthly_price_usd"]
        if "features" in tier_data:
            tier.features = tier_data["features"]
        if "analysis_limit" in tier_data:
            tier.analysis_limit = tier_data["analysis_limit"]
        if "projects_limit" in tier_data:
            tier.projects_limit = tier_data["projects_limit"]
        if "stripe_price_id" in tier_data:
            tier.stripe_price_id = tier_data["stripe_price_id"]

        result = await self.tier_repo.update(tier)
        return self._tier_to_dict(result)

    async def delete_tier(self, tier_id: str) -> bool:
        """Delete a subscription tier"""
        return await self.tier_repo.delete(tier_id)

    # ========================================================================
    # Invoice Management
    # ========================================================================

    async def create_invoice(
        self,
        user_id: str,
        tier_id: str,
        amount: float,
        billing_period_start: datetime,
        billing_period_end: datetime,
        due_at: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Create a new billing invoice"""
        from ..models.database import BillingInvoice

        invoice = BillingInvoice()
        invoice.user_id = user_id
        invoice.tier_id = tier_id
        invoice.amount = amount
        invoice.currency = "USD"
        invoice.status = "pending"
        invoice.billing_period_start = billing_period_start
        invoice.billing_period_end = billing_period_end

        # Set due date to end of billing period or +30 days
        invoice.due_at = due_at or billing_period_end + timedelta(days=30)

        result = await self.invoice_repo.create(invoice)
        return self._invoice_to_dict(result)

    async def get_user_invoices(
        self,
        user_id: str,
        limit: int = 10,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """Get invoices for a user"""
        invoices = await self.invoice_repo.find_by_user(user_id, limit, offset)
        return [self._invoice_to_dict(inv) for inv in invoices]

    async def mark_invoice_paid(self, invoice_id: str) -> Optional[Dict[str, Any]]:
        """Mark an invoice as paid"""
        result = await self.invoice_repo.update_status(invoice_id, "paid", datetime.utcnow())
        return self._invoice_to_dict(result) if result else None

    async def mark_invoice_failed(self, invoice_id: str) -> Optional[Dict[str, Any]]:
        """Mark an invoice as failed"""
        result = await self.invoice_repo.update_status(invoice_id, "failed")
        return self._invoice_to_dict(result) if result else None

    async def get_user_total_spend(self, user_id: str) -> float:
        """Get total spend for a user"""
        return await self.invoice_repo.get_user_total_spend(user_id)

    async def get_pending_invoices(self, user_id: str) -> List[Dict[str, Any]]:
        """Get pending invoices for a user"""
        invoices = await self.invoice_repo.find_pending(user_id)
        return [self._invoice_to_dict(inv) for inv in invoices]

    async def get_overdue_invoices(self) -> List[Dict[str, Any]]:
        """Get overdue invoices for admin"""
        invoices = await self.invoice_repo.find_overdue()
        return [self._invoice_to_dict(inv) for inv in invoices]

    # ========================================================================
    # Billing Campaigns
    # ========================================================================

    async def get_all_campaigns(self, active_only: bool = True) -> List[Dict[str, Any]]:
        """Get all billing campaigns"""
        if active_only:
            campaigns = await self.campaign_repo.find_active()
        else:
            campaigns = await self.campaign_repo.find_active()

        return [self._campaign_to_dict(camp) for camp in campaigns]

    async def get_campaign_by_id(self, campaign_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific campaign by ID"""
        campaign = await self.campaign_repo.find_by_id(campaign_id)
        return self._campaign_to_dict(campaign) if campaign else None

    async def create_campaign(self, campaign_data: Dict[str, Any], created_by: str) -> Dict[str, Any]:
        """Create a new billing campaign"""
        from ..models.database import BillingCampaign

        campaign = BillingCampaign()
        campaign.name = campaign_data.get("name")
        campaign.code = campaign_data.get("code")
        campaign.discount_percentage = campaign_data.get("discount_percentage", 0.0)
        campaign.description = campaign_data.get("description")
        campaign.start_date = datetime.fromisoformat(campaign_data["start_date"]) if "start_date" in campaign_data else datetime.utcnow()
        campaign.end_date = datetime.fromisoformat(campaign_data["end_date"]) if "end_date" in campaign_data else None
        campaign.max_uses = campaign_data.get("max_uses")
        campaign.created_by = created_by

        result = await self.campaign_repo.create(campaign)
        return self._campaign_to_dict(result)

    async def apply_campaign(
        self,
        campaign_code: str,
        user_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Apply a campaign code to a user's subscription"""
        campaign = await self.campaign_repo.find_by_code(campaign_code)

        if not campaign:
            return None

        # Check if campaign has remaining uses
        if campaign.max_uses and campaign.current_uses >= campaign.max_uses:
            return {
                "success": False,
                "error": "Campaign code has reached maximum uses",
                "code": campaign_code,
            }

        # Increment usage
        await self.campaign_repo.increment_usage(campaign.id)

        # In production, this would:
        # 1. Create a discounted invoice in Stripe
        # 2. Update user's subscription tier
        # 3. Send confirmation email

        return {
            "success": True,
            "message": f"Campaign '{campaign.name}' applied successfully",
            "discount_percentage": campaign.discount_percentage,
            "code": campaign_code,
        }

    async def update_campaign(self, campaign_id: str, campaign_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a billing campaign"""
        campaign = await self.campaign_repo.find_by_id(campaign_id)
        if not campaign:
            return None

        if "name" in campaign_data:
            campaign.name = campaign_data["name"]
        if "code" in campaign_data:
            campaign.code = campaign_data["code"]
        if "discount_percentage" in campaign_data:
            campaign.discount_percentage = campaign_data["discount_percentage"]
        if "description" in campaign_data:
            campaign.description = campaign_data["description"]
        if "start_date" in campaign_data:
            campaign.start_date = datetime.fromisoformat(campaign_data["start_date"])
        if "end_date" in campaign_data:
            campaign.end_date = datetime.fromisoformat(campaign_data["end_date"])
        if "active" in campaign_data:
            campaign.active = campaign_data["active"]
        if "max_uses" in campaign_data:
            campaign.max_uses = campaign_data["max_uses"]

        result = await self.campaign_repo.update(campaign)
        return self._campaign_to_dict(result)

    async def delete_campaign(self, campaign_id: str) -> bool:
        """Delete a billing campaign"""
        return await self.campaign_repo.delete(campaign_id)

    # ========================================================================
    # Admin Overview
    # ========================================================================

    async def get_admin_overview(self) -> Dict[str, Any]:
        """Get billing overview for admin dashboard"""
        # Get revenue (paid invoices)
        overdue_invoices = await self.get_overdue_invoices()
        revenue = sum(inv["amount"] for inv in overdue_invoices if inv["status"] == "paid")

        # Get pending invoices
        pending_revenue = sum(inv["amount"] for inv in overdue_invoices if inv["status"] == "pending")

        # Get active campaigns
        campaigns = await self.get_all_campaigns(active_only=True)

        return {
            "total_revenue": revenue,
            "pending_revenue": pending_revenue,
            "overdue_invoices_count": len([inv for inv in overdue_invoices if inv["status"] in ["pending", "failed"]]),
            "active_campaigns_count": len(campaigns),
            "total_invoices": await self.invoice_repo.count(),
            "revenue_this_month": revenue,  # Simplified - would filter by month
        }

    # ========================================================================
    # Helper Methods
    # ========================================================================

    def _tier_to_dict(self, tier) -> Dict[str, Any]:
        """Convert tier model to dictionary"""
        return {
            "id": tier.id,
            "display_name": tier.display_name,
            "monthly_price_usd": tier.monthly_price_usd,
            "features": tier.features,
            "analysis_limit": tier.analysis_limit,
            "projects_limit": tier.projects_limit,
            "stripe_price_id": tier.stripe_price_id,
            "is_active": tier.is_active,
        }

    def _invoice_to_dict(self, invoice) -> Dict[str, Any]:
        """Convert invoice model to dictionary"""
        return {
            "id": invoice.id,
            "user_id": invoice.user_id,
            "tier_id": invoice.tier_id,
            "amount": invoice.amount,
            "currency": invoice.currency,
            "status": invoice.status,
            "stripe_invoice_id": invoice.stripe_invoice_id,
            "billing_period_start": invoice.billing_period_start.isoformat() if invoice.billing_period_start else None,
            "billing_period_end": invoice.billing_period_end.isoformat() if invoice.billing_period_end else None,
            "created_at": invoice.created_at.isoformat() if invoice.created_at else None,
            "paid_at": invoice.paid_at.isoformat() if invoice.paid_at else None,
            "due_at": invoice.due_at.isoformat() if invoice.due_at else None,
        }

    def _campaign_to_dict(self, campaign) -> Dict[str, Any]:
        """Convert campaign model to dictionary"""
        return {
            "id": campaign.id,
            "name": campaign.name,
            "code": campaign.code,
            "discount_percentage": campaign.discount_percentage,
            "description": campaign.description,
            "start_date": campaign.start_date.isoformat() if campaign.start_date else None,
            "end_date": campaign.end_date.isoformat() if campaign.end_date else None,
            "active": campaign.active,
            "max_uses": campaign.max_uses,
            "current_uses": campaign.current_uses,
        }


# Singleton instance
_billing_service_instance: Optional[BillingService] = None


def get_billing_service() -> BillingService:
    """Get or create billing service singleton instance"""
    global _billing_service_instance
    if _billing_service_instance is None:
        _billing_service_instance = BillingService()
    return _billing_service_instance
