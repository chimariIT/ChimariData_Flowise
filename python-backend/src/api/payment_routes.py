"""
Payment Routes for Chimaridata Python Backend

Provides REST API endpoints for:
- Payment processing
- Stripe checkout sessions
- Payment verification
- Webhook handling
"""

from typing import Optional, Dict, Any
from datetime import datetime
import logging
import os

from fastapi import APIRouter, HTTPException, Depends, Header, status, Request
from pydantic import BaseModel, Field

# Stripe is optional - payment features will be disabled if not available
try:
    import stripe
    STRIPE_AVAILABLE = True
except ImportError:
    stripe = None
    STRIPE_AVAILABLE = False
    logging.warning("Stripe not installed. Payment features will be disabled.")

from ..auth.middleware import get_current_user, User
from ..db import get_db_context
from ..models.database import Project
from sqlalchemy import select

logger = logging.getLogger(__name__)

# Create router
router = APIRouter()

# Stripe configuration
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

if STRIPE_SECRET_KEY and STRIPE_AVAILABLE:
    stripe.api_key = STRIPE_SECRET_KEY


# ============================================================================
# Request/Response Models
# ============================================================================

class CreateCheckoutSessionRequest(BaseModel):
    """Request to create a Stripe checkout session"""
    project_id: str = Field(..., description="Project ID")
    amount_cents: int = Field(..., description="Amount in cents")
    currency: str = Field(default="usd", description="Currency code")
    success_url: str = Field(..., description="URL to redirect on success")
    cancel_url: str = Field(..., description="URL to redirect on cancel")


class CheckoutSessionResponse(BaseModel):
    """Response with checkout session details"""
    session_id: str
    checkout_url: str
    project_id: str
    amount_cents: int
    currency: str


class VerifySessionRequest(BaseModel):
    """Request to verify a checkout session"""
    session_id: str = Field(..., description="Stripe session ID")
    project_id: str = Field(..., description="Project ID")


class VerifySessionResponse(BaseModel):
    """Response with verification result"""
    success: bool
    paid: bool
    payment_status: str
    amount_cents: Optional[int] = None
    project_id: str


class PaymentStatusResponse(BaseModel):
    """Response with payment status for a project"""
    project_id: str
    is_paid: bool
    payment_status: str
    amount_cents: Optional[int] = None
    paid_at: Optional[str] = None


# ============================================================================
# Payment Endpoints
# ============================================================================

@router.post("/payment/create-checkout", response_model=CheckoutSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_checkout_session(request: CreateCheckoutSessionRequest):
    """
    Create a Stripe checkout session for project payment.

    Returns a checkout URL that the user should be redirected to
    complete the payment.
    """
    try:
        if not STRIPE_SECRET_KEY or not STRIPE_AVAILABLE:
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="Stripe is not configured or not installed. Install with: pip install stripe"
            )

        # Create Stripe checkout session
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": request.currency,
                    "product_data": {
                        "name": f"Analysis for Project {request.project_id}",
                        "description": "Data analysis and insights generation"
                    },
                    "unit_amount": request.amount_cents,
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=request.success_url,
            cancel_url=request.cancel_url,
            metadata={
                "project_id": request.project_id,
                "amount_cents": str(request.amount_cents)
            }
        )

        return CheckoutSessionResponse(
            session_id=checkout_session.id,
            checkout_url=checkout_session.url,
            project_id=request.project_id,
            amount_cents=request.amount_cents,
            currency=request.currency
        )

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Stripe error: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error creating checkout session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create checkout session: {str(e)}"
        )


@router.post("/payment/verify-session", response_model=VerifySessionResponse)
async def verify_checkout_session(request: VerifySessionRequest):
    """
    Verify a Stripe checkout session after payment completion.

    Called when the user is redirected back from the Stripe checkout
    to confirm payment status.
    """
    try:
        async with get_db_context() as session:
            # Query project
            project_stmt = select(Project).where(Project.id == request.project_id)
            project_result = await session.execute(project_stmt)
            project = project_result.scalar_one_or_none()

            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found"
                )

        if not STRIPE_SECRET_KEY:
            # Return success in development mode without Stripe
            # Update journey_progress to mark as paid
            async with get_db_context() as session:
                project_stmt = select(Project).where(Project.id == request.project_id)
                project_result = await session.execute(project_stmt)
                project = project_result.scalar_one_or_none()

                if project:
                    journey_progress = project.journey_progress or {}
                    journey_progress['payment'] = {
                        'isPaid': True,
                        'status': 'succeeded',
                        'sessionId': request.session_id,
                        'paidAt': datetime.utcnow().isoformat(),
                        'amountCents': 0
                    }
                    project.journey_progress = journey_progress
                    await session.commit()

            return VerifySessionResponse(
                success=True,
                paid=True,
                payment_status="succeeded",
                amount_cents=0,
                project_id=request.project_id
            )

        # Retrieve the session from Stripe
        if not STRIPE_AVAILABLE:
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="Stripe is not installed. Install with: pip install stripe"
            )

        checkout_session = stripe.checkout.Session.retrieve(request.session_id)

        # Get payment status
        payment_status = checkout_session.payment_status
        is_paid = payment_status == "paid"

        # Get amount if available
        amount_cents = None
        if is_paid and checkout_session.amount_total:
            amount_cents = checkout_session.amount_total

        # Update project payment status in database
        async with get_db_context() as session:
            project_stmt = select(Project).where(Project.id == request.project_id)
            project_result = await session.execute(project_stmt)
            project = project_result.scalar_one_or_none()

            if project:
                journey_progress = project.journey_progress or {}
                journey_progress['payment'] = {
                    'isPaid': is_paid,
                    'status': payment_status,
                    'sessionId': request.session_id,
                    'paidAt': datetime.utcnow().isoformat() if is_paid else None,
                    'amountCents': amount_cents
                }
                project.journey_progress = journey_progress
                await session.commit()

        return VerifySessionResponse(
            success=True,
            paid=is_paid,
            payment_status=payment_status,
            amount_cents=amount_cents,
            project_id=request.project_id
        )

    except stripe.error.InvalidRequestError as e:
        logger.error(f"Invalid session ID: {e}")
        return VerifySessionResponse(
            success=False,
            paid=False,
            payment_status="invalid",
            project_id=request.project_id
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to verify session: {str(e)}"
        )


@router.get("/projects/{project_id}/payment-status", response_model=PaymentStatusResponse)
async def get_payment_status(project_id: str):
    """
    Get payment status for a project.

    Returns whether the project has been paid for and the
    current payment status.
    """
    try:
        async with get_db_context() as session:
            # Query project
            project_stmt = select(Project).where(Project.id == project_id)
            project_result = await session.execute(project_stmt)
            project = project_result.scalar_one_or_none()

            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found"
                )

            # Read payment info from journey_progress
            journey_progress = project.journey_progress or {}
            payment_info = journey_progress.get('payment', {})
            cost_estimate = journey_progress.get('costEstimate', {})

            is_paid = payment_info.get('isPaid', False)
            payment_status = payment_info.get('status', 'pending')
            paid_at = payment_info.get('paidAt')
            amount_cents = cost_estimate.get('totalCostCents')

            return PaymentStatusResponse(
                project_id=project_id,
                is_paid=is_paid,
                payment_status=payment_status,
                amount_cents=amount_cents,
                paid_at=paid_at
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting payment status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get payment status: {str(e)}"
        )


@router.post("/payment/webhook")
async def stripe_webhook(request: Request):
    """
    Handle Stripe webhook events.

    Processes events from Stripe including:
    - checkout.session.completed
    - payment_intent.succeeded
    - payment_intent.failed
    """
    try:
        if not STRIPE_SECRET_KEY or not STRIPE_AVAILABLE:
            logger.warning("Stripe webhook received but Stripe is not configured or not installed")
            return {"received": True}

        # Get the raw payload
        payload = await request.body()
        sig_header = request.headers.get("stripe-signature")

        if not sig_header:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No stripe-signature header"
            )

        # Verify the webhook signature
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, STRIPE_WEBHOOK_SECRET
            )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid payload"
            )
        except Exception as e:
            # Catch any Stripe-specific exceptions when stripe is available
            if STRIPE_AVAILABLE and "stripe" in str(type(e)):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid signature"
                )
            else:
                # If stripe is not available, just log and continue
                logger.warning(f"Could not verify webhook signature: {e}")
                # Return early for development
                return {"received": True, "note": "Stripe not available, skipping signature verification"}

        # Handle the event
        event_type = event["type"]
        logger.info(f"Received Stripe webhook: {event_type}")

        if event_type == "checkout.session.completed":
            session = event["data"]["object"]
            project_id = session.get("metadata", {}).get("project_id")

            if project_id:
                # Update project as paid in database
                async with get_db_context() as db_session:
                    project_stmt = select(Project).where(Project.id == project_id)
                    project_result = await db_session.execute(project_stmt)
                    project = project_result.scalar_one_or_none()

                    if project:
                        journey_progress = project.journey_progress or {}
                        journey_progress['payment'] = {
                            'isPaid': True,
                            'status': 'succeeded',
                            'sessionId': session.id,
                            'paidAt': datetime.utcnow().isoformat(),
                            'amountCents': session.get('amount_total')
                        }
                        project.journey_progress = journey_progress
                        await db_session.commit()

                logger.info(f"Payment completed for project {project_id}")

        elif event_type == "payment_intent.succeeded":
            logger.info("Payment intent succeeded")

        elif event_type == "payment_intent.failed":
            logger.warning("Payment intent failed")

        return {"received": True, "event_type": event_type}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing webhook: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Webhook processing failed: {str(e)}"
        )


# ============================================================================
# Router Inclusion Helper
# ============================================================================

def include_payment_routes(app):
    """Include payment routes in the FastAPI app"""
    app.include_router(router, tags=["payment"])
    logger.info("Payment routes included")
