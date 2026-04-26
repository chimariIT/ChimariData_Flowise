"""
Payment Routes for Chimaridata Python Backend

Real DB implementation using sa_text + get_db_context + ORJSONResponse pattern.

Endpoints:
- POST /payment/create-checkout-session — create Stripe checkout (or mock for dev)
- POST /payment/verify-session          — verify Stripe session status
- POST /payment/estimate-cost           — estimate cost for analysis
- GET  /projects/{id}/payment-status    — get payment status for a project
- POST /payment/webhook                 — handle Stripe webhook events
- GET  /pricing                         — return pricing overview
- GET  /pricing/tiers                   — return subscription tier details
- GET  /pricing/services                — return service pricing
- GET  /pricing/journeys                — return journey pricing info
- GET  /pricing/runtime-config          — return runtime pricing config
- POST /calculate-price                 — calculate price for analysis features
"""

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
import json
import logging
import os
import uuid

from fastapi import APIRouter, HTTPException, Depends, Header, Query, status, Request
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel, Field

# Stripe is optional - payment features will be disabled if not available
try:
    import stripe
    STRIPE_AVAILABLE = True
except ImportError:
    stripe = None
    STRIPE_AVAILABLE = False
    logging.warning("Stripe not installed. Payment features will be disabled.")

from sqlalchemy import text as sa_text

from ..db import get_db_context
from ..auth.middleware import get_current_user, require_admin, User as AuthUser

logger = logging.getLogger(__name__)

# Create router
router = APIRouter()

# Stripe configuration
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
MAX_WEBHOOK_TRACE_ENTRIES = 25

if STRIPE_SECRET_KEY and STRIPE_AVAILABLE:
    stripe.api_key = STRIPE_SECRET_KEY


# ============================================================================
# Default Pricing Tiers (fallback when DB has no subscription_tier_pricing rows)
# ============================================================================

DEFAULT_TIERS = [
    {
        "id": "trial",
        "name": "Free Trial",
        "type": "trial",
        "description": "Try the platform with limited features",
        "price": 0,
        "priceLabel": "$0/month",
        "features": [
            "1 file per month",
            "10MB max file size",
            "50MB total data volume",
            "5 AI insights per month",
            "3 analysis components",
            "5 visualizations",
            "CSV export",
            "Community support",
        ],
        "limits": {
            "analysesPerMonth": 3,
            "maxDataSizeMB": 10,
            "maxRecords": 50000,
            "aiQueries": 5,
            "supportLevel": "community",
            "customModels": False,
            "apiAccess": False,
            "teamCollaboration": False,
        },
        "recommended": False,
        "monthlyPrice": 0,
        "yearlyPrice": 0,
    },
    {
        "id": "professional",
        "name": "Professional",
        "type": "professional",
        "description": "For data-driven professionals and small teams",
        "price": 49,
        "priceLabel": "$49/month",
        "features": [
            "10 files per month",
            "100MB max file size",
            "1000MB total data volume",
            "100 AI insights per month",
            "20 analysis components",
            "50 visualizations",
            "Data transformation",
            "Statistical analysis",
            "PII detection",
            "Email support",
        ],
        "limits": {
            "analysesPerMonth": 20,
            "maxDataSizeMB": 100,
            "maxRecords": 1000000,
            "aiQueries": 100,
            "supportLevel": "email",
            "customModels": False,
            "apiAccess": False,
            "teamCollaboration": True,
        },
        "recommended": True,
        "monthlyPrice": 49,
        "yearlyPrice": 490,
    },
    {
        "id": "enterprise",
        "name": "Enterprise",
        "type": "enterprise",
        "description": "For large organizations with advanced needs",
        "price": 199,
        "priceLabel": "$199/month",
        "features": [
            "Unlimited files per month",
            "Unlimited file size",
            "Unlimited data volume",
            "Unlimited AI insights",
            "Unlimited analysis components",
            "Unlimited visualizations",
            "Data transformation",
            "Statistical analysis",
            "Advanced insights",
            "PII detection",
            "API access",
            "Priority support",
        ],
        "limits": {
            "analysesPerMonth": -1,
            "maxDataSizeMB": -1,
            "maxRecords": -1,
            "aiQueries": -1,
            "supportLevel": "priority",
            "customModels": True,
            "apiAccess": True,
            "teamCollaboration": True,
        },
        "recommended": False,
        "monthlyPrice": 199,
        "yearlyPrice": 1990,
    },
]

DEFAULT_SERVICE_PRICING = [
    {
        "id": "pay-per-analysis",
        "serviceType": "pay-per-analysis",
        "displayName": "Pay-Per-Analysis",
        "description": "Run a single analysis without a subscription",
        "basePrice": 2500,  # cents
        "currency": "usd",
        "isActive": True,
    },
    {
        "id": "expert-consultation",
        "serviceType": "expert-consultation",
        "displayName": "Expert Consultation",
        "description": "1-hour consultation with a data expert",
        "basePrice": 15000,  # cents
        "currency": "usd",
        "isActive": True,
    },
]

# Base cost per analysis type (cents)
ANALYSIS_COST_MAP = {
    "descriptive": 500,
    "correlation": 800,
    "regression": 1200,
    "clustering": 1500,
    "time_series": 1500,
    "classification": 2000,
    "sentiment": 1000,
    "text_analysis": 1000,
    "hypothesis_testing": 800,
    "statistical_tests": 800,
    "distribution_analysis": 600,
}


# ============================================================================
# Helpers
# ============================================================================

def _coerce_json_dict(value: Any) -> Dict[str, Any]:
    """Coerce DB JSON/JSONB payloads into a dictionary."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _append_payment_webhook_trace(payment_info: Dict[str, Any], trace_entry: Dict[str, Any]) -> None:
    existing_trace = payment_info.get("webhookTrace")
    if not isinstance(existing_trace, list):
        existing_trace = []

    existing_trace.append(trace_entry)
    payment_info["webhookTrace"] = existing_trace[-MAX_WEBHOOK_TRACE_ENTRIES:]


def _stripe_obj_to_dict(value: Any) -> Dict[str, Any]:
    """
    Convert Stripe SDK objects to plain dictionaries safely.
    """
    if isinstance(value, dict):
        return value
    if value is None:
        return {}

    to_dict_recursive = getattr(value, "to_dict_recursive", None)
    if callable(to_dict_recursive):
        try:
            converted = to_dict_recursive()
            return converted if isinstance(converted, dict) else {}
        except Exception:
            pass

    raw_data = getattr(value, "_data", None)
    if isinstance(raw_data, dict):
        return raw_data

    return {}


async def _get_project_for_user(project_id: str, current_user: AuthUser) -> Dict[str, Any]:
    """
    Fetch a project and enforce ownership (or admin) access.
    """
    async with get_db_context() as session:
        result = await session.execute(
            sa_text("SELECT * FROM projects WHERE id = :id"),
            {"id": project_id},
        )
        row = result.first()
        if row is None:
            raise HTTPException(status_code=404, detail="Project not found")
        project = dict(zip(result.keys(), row))

    owner_id = project.get("user_id")
    is_admin = bool(getattr(current_user, "is_admin", False))
    if owner_id and not is_admin and owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have access to this project")

    return project


async def _upsert_project_payment(project_id: str, payment_patch: Dict[str, Any]) -> Dict[str, Any]:
    """
    Merge payment fields into journey_progress.payment and persist.
    """
    async with get_db_context() as session:
        result = await session.execute(
            sa_text("SELECT journey_progress FROM projects WHERE id = :id"),
            {"id": project_id},
        )
        row = result.first()
        if row is None:
            raise HTTPException(status_code=404, detail="Project not found")

        journey_progress = _coerce_json_dict(row[0])
        payment_info = journey_progress.get("payment")
        if not isinstance(payment_info, dict):
            payment_info = {}

        payment_info.update(payment_patch)
        journey_progress["payment"] = payment_info

        await session.execute(
            sa_text(
                "UPDATE projects SET journey_progress = CAST(:jp AS jsonb), "
                "updated_at = NOW() WHERE id = :id"
            ),
            {"jp": json.dumps(journey_progress), "id": project_id},
        )
        await session.commit()

        return payment_info


async def _apply_webhook_payment_update(
    project_id: str,
    event_id: Optional[str],
    event_type: Optional[str],
    payment_patch: Dict[str, Any],
) -> bool:
    """
    Apply webhook payment update with idempotency guard based on event ID.
    Returns True when persisted, False when skipped (duplicate/missing project).
    """
    async with get_db_context() as session:
        result = await session.execute(
            sa_text("SELECT journey_progress FROM projects WHERE id = :id"),
            {"id": project_id},
        )
        row = result.first()
        if row is None:
            logger.warning(f"Webhook payment update skipped: project not found ({project_id})")
            return False

        journey_progress = _coerce_json_dict(row[0])
        payment_info = journey_progress.get("payment")
        if not isinstance(payment_info, dict):
            payment_info = {}

        processed_ids = payment_info.get("processedEventIds")
        if not isinstance(processed_ids, list):
            processed_ids = []

        if event_id and event_id in processed_ids:
            logger.info(f"Webhook event {event_id} already processed for project {project_id}")
            return False

        if event_id:
            processed_ids.append(event_id)
            payment_info["processedEventIds"] = processed_ids[-30:]

        payment_info["lastWebhookEventId"] = event_id
        payment_info["lastWebhookEventType"] = event_type
        payment_info["lastWebhookReceivedAt"] = _utc_now_iso()
        _append_payment_webhook_trace(
            payment_info,
            {
                "eventId": event_id,
                "eventType": event_type,
                "receivedAt": payment_info["lastWebhookReceivedAt"],
                "applied": True,
                "status": payment_patch.get("status"),
                "isPaid": payment_patch.get("isPaid"),
            },
        )

        payment_info.update(payment_patch)
        journey_progress["payment"] = payment_info

        await session.execute(
            sa_text(
                "UPDATE projects SET journey_progress = CAST(:jp AS jsonb), "
                "updated_at = NOW() WHERE id = :id"
            ),
            {"jp": json.dumps(journey_progress), "id": project_id},
        )
        await session.commit()

        return True


@router.get("/payment/webhook/diagnostics")
async def get_webhook_diagnostics(
    limit: int = Query(default=20, ge=1, le=100),
    admin_user: AuthUser = Depends(require_admin),
):
    """
    Admin diagnostics for Stripe webhook configuration and recent event traces.
    """
    stripe_configured = bool(STRIPE_SECRET_KEY and STRIPE_AVAILABLE)
    webhook_secret_configured = bool(STRIPE_WEBHOOK_SECRET.strip())

    stripe_mode = "unknown"
    if STRIPE_SECRET_KEY.startswith("sk_live_"):
        stripe_mode = "live"
    elif STRIPE_SECRET_KEY.startswith("sk_test_"):
        stripe_mode = "test"

    async with get_db_context() as session:
        result = await session.execute(
            sa_text(
                "SELECT id, name, journey_progress, updated_at "
                "FROM projects "
                "WHERE journey_progress ? 'payment' "
                "ORDER BY updated_at DESC "
                "LIMIT :limit"
            ),
            {"limit": limit},
        )
        rows = result.fetchall()
        keys = list(result.keys())

    recent_projects: List[Dict[str, Any]] = []
    for row in rows:
        project = dict(zip(keys, row))
        journey_progress = _coerce_json_dict(project.get("journey_progress"))
        payment_info = _coerce_json_dict(journey_progress.get("payment"))
        if not payment_info:
            continue

        processed_ids = payment_info.get("processedEventIds")
        webhook_trace = payment_info.get("webhookTrace")
        updated_at = project.get("updated_at")

        recent_projects.append(
            {
                "projectId": project.get("id"),
                "projectName": project.get("name"),
                "paymentStatus": payment_info.get("status"),
                "isPaid": payment_info.get("isPaid"),
                "lastWebhookEventType": payment_info.get("lastWebhookEventType"),
                "lastWebhookEventId": payment_info.get("lastWebhookEventId"),
                "lastWebhookReceivedAt": payment_info.get("lastWebhookReceivedAt"),
                "processedEventCount": len(processed_ids) if isinstance(processed_ids, list) else 0,
                "tracePreview": webhook_trace[-3:] if isinstance(webhook_trace, list) else [],
                "updatedAt": updated_at.isoformat() if isinstance(updated_at, datetime) else updated_at,
            }
        )

    return ORJSONResponse(
        content={
            "success": True,
            "data": {
                "stripeConfigured": stripe_configured,
                "webhookSecretConfigured": webhook_secret_configured,
                "stripeMode": stripe_mode,
                "signatureValidationEnabled": stripe_configured and webhook_secret_configured,
                "webhookPaths": [
                    "/api/payment/webhook",
                    "/api/v1/billing/stripe/webhook",
                ],
                "recentProjectWebhookActivity": recent_projects,
            },
        }
    )


async def _fetch_tiers_from_db() -> Optional[List[Dict[str, Any]]]:
    """Try to load subscription tiers from DB. Returns None if table missing or empty."""
    try:
        async with get_db_context() as session:
            result = await session.execute(
                sa_text(
                    "SELECT * FROM subscription_tier_pricing "
                    "WHERE is_active = true "
                    "ORDER BY monthly_price_usd ASC"
                )
            )
            rows = result.fetchall()
            if not rows:
                return None

            keys = list(result.keys())
            tiers = []
            for row in rows:
                r = dict(zip(keys, row))
                limits = r.get("limits") or {}
                features_obj = r.get("features") or {}
                journey_pricing = r.get("journey_pricing") or {}
                overage_pricing = r.get("overage_pricing") or {}

                monthly_usd = (r.get("monthly_price_usd") or 0) / 100
                yearly_usd = (r.get("yearly_price_usd") or 0) / 100

                features_list = [
                    f for f in [
                        "Unlimited files per month" if limits.get("maxFiles") == -1
                        else f"{limits.get('maxFiles')} file(s) per month" if limits.get("maxFiles") else None,
                        "Unlimited file size" if limits.get("maxFileSizeMB") == -1
                        else f"{limits.get('maxFileSizeMB')}MB max file size" if limits.get("maxFileSizeMB") else None,
                        "Data transformation" if features_obj.get("dataTransformation") else None,
                        "Statistical analysis" if features_obj.get("statisticalAnalysis") else None,
                        "Advanced insights" if features_obj.get("advancedInsights") else None,
                        "PII detection" if features_obj.get("piiDetection") else None,
                    ] if f
                ]

                tiers.append({
                    "id": r.get("id"),
                    "name": r.get("display_name") or r.get("id"),
                    "type": r.get("id"),
                    "description": r.get("description") or "",
                    "price": monthly_usd,
                    "priceLabel": f"${monthly_usd}/month",
                    "features": features_list,
                    "limits": {
                        "analysesPerMonth": limits.get("maxAnalysisComponents", 0),
                        "maxDataSizeMB": limits.get("maxFileSizeMB", 0),
                        "maxRecords": (limits.get("totalDataVolumeMB") or 0) * 1000,
                        "aiQueries": limits.get("aiInsights", 0),
                        "supportLevel": "email",
                        "customModels": False,
                        "apiAccess": r.get("id") == "enterprise",
                        "teamCollaboration": r.get("id") != "trial",
                    },
                    "recommended": r.get("id") == "professional",
                    "stripeProductId": r.get("stripe_product_id"),
                    "stripePriceId": r.get("stripe_monthly_price_id") or r.get("stripe_yearly_price_id"),
                    "journeyPricing": journey_pricing,
                    "monthlyPrice": monthly_usd,
                    "yearlyPrice": yearly_usd,
                    "overagePricing": overage_pricing,
                })

            return tiers
    except Exception as e:
        # Table may not exist yet
        logger.debug(f"Could not fetch tiers from DB (may not exist): {e}")
        return None


async def _fetch_service_pricing_from_db() -> Optional[List[Dict[str, Any]]]:
    """Try to load service pricing from DB. Returns None if table missing or empty."""
    try:
        async with get_db_context() as session:
            result = await session.execute(
                sa_text(
                    "SELECT * FROM service_pricing "
                    "WHERE is_active = true "
                    "ORDER BY display_name ASC"
                )
            )
            rows = result.fetchall()
            if not rows:
                return None

            keys = list(result.keys())
            return [dict(zip(keys, row)) for row in rows]
    except Exception as e:
        logger.debug(f"Could not fetch service pricing from DB: {e}")
        return None


# ============================================================================
# Payment Endpoints
# ============================================================================

@router.post("/payment/create-checkout-session")
async def create_checkout_session(
    request: Request,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Create a Stripe checkout session for project payment.

    In dev mode (no STRIPE_SECRET_KEY), returns a mock session that the
    frontend can use with verify-session to mark the project as paid.
    """
    try:
        body = await request.json()
        project_id = body.get("projectId")
        client_amount = body.get("amount")
        payment_method = body.get("paymentMethod", "card")

        if not project_id:
            raise HTTPException(status_code=400, detail="projectId is required")

        # Fetch project and enforce ownership access
        project = await _get_project_for_user(project_id, current_user)

        journey_progress = project.get("journey_progress") or {}
        locked_cost = journey_progress.get("lockedCostEstimate")

        # Determine amount
        if locked_cost and float(locked_cost) > 0:
            amount_cents = int(float(locked_cost) * 100)
        elif client_amount:
            amount_cents = int(float(client_amount) * 100)
        else:
            # Default minimal amount
            amount_cents = 2500

        journey_type = (
            journey_progress.get("journeyType")
            or journey_progress.get("journey_type")
            or project.get("journey_type")
            or "business"
        )

        # --- Real Stripe ---
        if STRIPE_SECRET_KEY and STRIPE_AVAILABLE:
            base_url = os.getenv("BASE_URL", "http://localhost:5173").rstrip("/")
            success_url = (
                f"{base_url}/journeys/{journey_type}/execute"
                f"?projectId={project_id}&payment=success&session_id={{CHECKOUT_SESSION_ID}}"
            )
            cancel_url = (
                f"{base_url}/journeys/{journey_type}/pricing"
                f"?projectId={project_id}&payment=cancelled"
            )

            checkout_session = stripe.checkout.Session.create(
                payment_method_types=["card"],
                line_items=[{
                    "price_data": {
                        "currency": "usd",
                        "product_data": {
                            "name": f"Analysis for Project {project_id}",
                            "description": "Data analysis and insights generation",
                        },
                        "unit_amount": amount_cents,
                    },
                    "quantity": 1,
                }],
                mode="payment",
                success_url=success_url,
                cancel_url=cancel_url,
                metadata={
                    "project_id": project_id,
                    "amount_cents": str(amount_cents),
                    "user_id": current_user.id,
                },
                payment_intent_data={
                    "metadata": {
                        "project_id": project_id,
                        "amount_cents": str(amount_cents),
                        "user_id": current_user.id,
                    }
                },
            )

            return ORJSONResponse(content={
                "id": checkout_session.id,
                "url": checkout_session.url,
                "projectId": project_id,
                "amountCents": amount_cents,
            })

        # --- Mock mode (no Stripe) ---
        mock_session_id = f"cs_mock_{uuid.uuid4().hex[:16]}"
        logger.info(
            f"[MOCK] Created mock checkout session {mock_session_id} "
            f"for project {project_id} (amount: {amount_cents} cents)"
        )

        # In mock mode, immediately mark as paid so the frontend flow works
        await _upsert_project_payment(
            project_id,
            {
                "isPaid": True,
                "status": "succeeded",
                "sessionId": mock_session_id,
                "paidAt": datetime.utcnow().isoformat(),
                "amountCents": amount_cents,
                "mock": True,
            },
        )

        mock_success_url = (
            f"/journeys/{journey_type}/execute"
            f"?projectId={project_id}&payment=success&session_id={mock_session_id}"
        )

        return ORJSONResponse(content={
            "id": mock_session_id,
            "projectId": project_id,
            "url": mock_success_url,
            "amountCents": amount_cents,
            "mock": True,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating checkout session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create checkout session: {e}")


@router.post("/payment/verify-session")
async def verify_checkout_session(
    request: Request,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Verify a Stripe checkout session after payment completion.

    Called when the user is redirected back from Stripe checkout.
    In mock mode, always returns success.
    """
    try:
        body = await request.json()
        session_id = body.get("sessionId")
        payment_intent_id = body.get("paymentIntentId")
        project_id = body.get("projectId")

        if not project_id:
            raise HTTPException(status_code=400, detail="projectId is required")

        # Verify project exists and enforce ownership access
        project = await _get_project_for_user(project_id, current_user)
        journey_progress = _coerce_json_dict(project.get("journey_progress"))
        existing_payment = journey_progress.get("payment")
        if not isinstance(existing_payment, dict):
            existing_payment = {}

        stripe_mode = bool(STRIPE_SECRET_KEY and STRIPE_AVAILABLE)
        has_real_session = bool(
            isinstance(session_id, str) and session_id and not session_id.startswith("cs_mock_")
        )
        has_real_intent = bool(
            isinstance(payment_intent_id, str) and payment_intent_id and not payment_intent_id.startswith("pi_mock_")
        )

        # --- Real Stripe verification ---
        if stripe_mode and (has_real_session or has_real_intent):
            try:
                resolved_session_id = session_id if has_real_session else existing_payment.get("sessionId")
                resolved_payment_intent_id = payment_intent_id if has_real_intent else existing_payment.get("paymentIntentId")
                payment_status = "pending"
                is_paid = False
                amount_cents = None

                if has_real_session:
                    checkout_session_raw = stripe.checkout.Session.retrieve(
                        session_id,
                        expand=["payment_intent"],
                    )
                    checkout_session = _stripe_obj_to_dict(checkout_session_raw)
                    checkout_metadata = _stripe_obj_to_dict(checkout_session.get("metadata"))

                    metadata_project_id = checkout_metadata.get("project_id")
                    metadata_user_id = checkout_metadata.get("user_id")

                    if metadata_project_id and str(metadata_project_id) != str(project_id):
                        raise HTTPException(status_code=403, detail="Checkout session does not belong to this project")
                    if metadata_user_id and metadata_user_id != current_user.id and not bool(current_user.is_admin):
                        raise HTTPException(status_code=403, detail="Checkout session does not belong to this user")

                    payment_status = str(checkout_session.get("payment_status") or "pending")
                    is_paid = payment_status == "paid"
                    amount_cents = checkout_session.get("amount_total")

                    payment_intent_obj = checkout_session.get("payment_intent")
                    if isinstance(payment_intent_obj, str):
                        resolved_payment_intent_id = payment_intent_obj
                    elif isinstance(payment_intent_obj, dict):
                        resolved_payment_intent_id = payment_intent_obj.get("id") or resolved_payment_intent_id
                        if amount_cents is None:
                            amount_cents = payment_intent_obj.get("amount_received") or payment_intent_obj.get("amount")
                    elif payment_intent_obj is not None:
                        payment_intent_dict = _stripe_obj_to_dict(payment_intent_obj)
                        if payment_intent_dict:
                            resolved_payment_intent_id = payment_intent_dict.get("id") or resolved_payment_intent_id
                            if amount_cents is None:
                                amount_cents = payment_intent_dict.get("amount_received") or payment_intent_dict.get("amount")

                if has_real_intent:
                    payment_intent_raw = stripe.PaymentIntent.retrieve(payment_intent_id)
                    payment_intent = _stripe_obj_to_dict(payment_intent_raw)
                    intent_metadata = _stripe_obj_to_dict(payment_intent.get("metadata"))
                    metadata_project_id = intent_metadata.get("project_id")
                    metadata_user_id = intent_metadata.get("user_id")

                    if metadata_project_id and str(metadata_project_id) != str(project_id):
                        raise HTTPException(status_code=403, detail="Payment intent does not belong to this project")
                    if metadata_user_id and metadata_user_id != current_user.id and not bool(current_user.is_admin):
                        raise HTTPException(status_code=403, detail="Payment intent does not belong to this user")

                    resolved_payment_intent_id = payment_intent.get("id") or resolved_payment_intent_id
                    payment_status = str(payment_intent.get("status") or payment_status)
                    is_paid = payment_status == "succeeded"
                    amount_cents = payment_intent.get("amount_received") or (
                        payment_intent.get("amount") if is_paid else amount_cents
                    )

                await _upsert_project_payment(
                    project_id,
                    {
                        "isPaid": is_paid,
                        "status": "succeeded" if is_paid else payment_status,
                        "sessionId": resolved_session_id,
                        "paymentIntentId": resolved_payment_intent_id,
                        "paidAt": datetime.utcnow().isoformat() if is_paid else None,
                        "amountCents": amount_cents,
                        "mock": False,
                    },
                )

                return ORJSONResponse(content={
                    "success": bool(is_paid),
                    "paid": bool(is_paid),
                    "paymentStatus": "paid" if is_paid else payment_status,
                    "amountCents": amount_cents,
                    "projectId": project_id,
                    "sessionId": resolved_session_id,
                    "paymentIntentId": resolved_payment_intent_id,
                })

            except HTTPException:
                raise
            except Exception as stripe_err:
                is_stripe_sdk_error = bool(
                    STRIPE_AVAILABLE
                    and getattr(stripe, "error", None)
                    and isinstance(stripe_err, stripe.error.StripeError)
                )
                if is_stripe_sdk_error:
                    logger.warning(f"Stripe verification failed: {stripe_err}")
                else:
                    logger.error(f"Stripe verification failed: {stripe_err}", exc_info=True)
                fallback_paid = bool(existing_payment.get("isPaid"))
                return ORJSONResponse(content={
                    "success": fallback_paid,
                    "paid": fallback_paid,
                    "paymentStatus": existing_payment.get("status", "invalid"),
                    "amountCents": existing_payment.get("amountCents"),
                    "projectId": project_id,
                    "sessionId": existing_payment.get("sessionId"),
                    "paymentIntentId": existing_payment.get("paymentIntentId"),
                })

        # --- Stripe configured but no verifiable payment ID ---
        # Do not auto-mark paid in real Stripe mode. Trust only existing persisted status.
        if stripe_mode:
            existing_paid = bool(existing_payment.get("isPaid"))
            return ORJSONResponse(content={
                "success": existing_paid,
                "paid": existing_paid,
                "paymentStatus": existing_payment.get("status", "pending"),
                "amountCents": existing_payment.get("amountCents"),
                "projectId": project_id,
                "sessionId": existing_payment.get("sessionId"),
                "paymentIntentId": existing_payment.get("paymentIntentId"),
            })

        # --- Mock / dev mode verification ---
        payment_info = existing_payment
        if not payment_info.get("isPaid"):
            payment_info = await _upsert_project_payment(
                project_id,
                {
                    "isPaid": True,
                    "status": "succeeded",
                    "sessionId": session_id or f"cs_mock_{uuid.uuid4().hex[:16]}",
                    "paymentIntentId": payment_intent_id,
                    "paidAt": datetime.utcnow().isoformat(),
                    "amountCents": 0,
                    "mock": True,
                },
            )

        return ORJSONResponse(content={
            "success": True,
            "paid": True,
            "paymentStatus": "paid",
            "amountCents": payment_info.get("amountCents", 0),
            "projectId": project_id,
            "sessionId": payment_info.get("sessionId"),
            "paymentIntentId": payment_info.get("paymentIntentId"),
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to verify session: {e}")


@router.post("/payment/estimate-cost")
async def estimate_cost(
    request: Request,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Estimate the cost of an analysis based on type, record count, and complexity.
    """
    try:
        body = await request.json()
        analysis_type = body.get("analysisType", "descriptive")
        record_count = body.get("recordCount", 0)
        complexity = body.get("complexity", "standard")

        if not analysis_type or record_count is None:
            raise HTTPException(status_code=400, detail="analysisType and recordCount are required")

        base_cost = ANALYSIS_COST_MAP.get(analysis_type, 500)

        # Scale by record count
        if record_count > 100000:
            scale = 2.0
        elif record_count > 10000:
            scale = 1.5
        elif record_count > 1000:
            scale = 1.2
        else:
            scale = 1.0

        # Complexity multiplier
        complexity_map = {"basic": 0.8, "standard": 1.0, "advanced": 1.5, "comprehensive": 2.0}
        complexity_mult = complexity_map.get(complexity, 1.0)

        total_cents = int(base_cost * scale * complexity_mult)

        return ORJSONResponse(content={
            "cost": total_cents / 100,
            "costCents": total_cents,
            "currency": "usd",
            "details": {
                "analysisType": analysis_type,
                "recordCount": record_count,
                "complexity": complexity,
                "baseCost": base_cost / 100,
                "scaleMultiplier": scale,
                "complexityMultiplier": complexity_mult,
            },
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error estimating cost: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to estimate cost: {e}")


@router.get("/projects/{project_id}/payment-status")
async def get_payment_status(
    project_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Get payment status for a project."""
    try:
        project = await _get_project_for_user(project_id, current_user)
        journey_progress = _coerce_json_dict(project.get("journey_progress"))
        payment_info = journey_progress.get("payment")
        if not isinstance(payment_info, dict):
            payment_info = {}

        cost_estimate = journey_progress.get("costEstimate")
        if not isinstance(cost_estimate, dict):
            cost_estimate = {}

        return ORJSONResponse(content={
            "projectId": project_id,
            "isPaid": payment_info.get("isPaid", False),
            "paymentStatus": payment_info.get("status", "pending"),
            "amountCents": payment_info.get("amountCents", cost_estimate.get("totalCostCents")),
            "paidAt": payment_info.get("paidAt"),
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting payment status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get payment status: {e}")


# ============================================================================
# Pricing Endpoints
# ============================================================================

@router.get("/pricing")
async def get_pricing():
    """
    Return pricing overview (used by home page).
    """
    try:
        db_tiers = await _fetch_tiers_from_db()
        tiers = db_tiers if db_tiers else DEFAULT_TIERS

        return ORJSONResponse(content={
            "success": True,
            "tiers": tiers,
            "source": "database" if db_tiers else "fallback",
        })
    except Exception as e:
        logger.error(f"Error getting pricing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get pricing: {e}")


@router.get("/pricing/tiers")
async def get_pricing_tiers(cycle: Optional[str] = Query("monthly")):
    """
    Get available subscription tiers.
    Returns tiers from database with fallback to in-memory defaults.
    """
    try:
        db_tiers = await _fetch_tiers_from_db()
        tiers = db_tiers if db_tiers else DEFAULT_TIERS

        # Adjust price labels for yearly billing
        if cycle == "yearly":
            for tier in tiers:
                yearly = tier.get("yearlyPrice", 0)
                tier["price"] = yearly
                tier["priceLabel"] = f"${yearly}/year"

        return ORJSONResponse(content={
            "success": True,
            "tiers": tiers,
            "billingCycle": cycle,
            "source": "database" if db_tiers else "fallback",
        })
    except Exception as e:
        logger.error(f"Error getting pricing tiers: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get pricing tiers: {e}")


@router.get("/pricing/services")
async def get_service_pricing():
    """
    Get per-service pricing (pay-per-analysis, consultation, etc.).
    """
    try:
        db_services = await _fetch_service_pricing_from_db()
        services = db_services if db_services else DEFAULT_SERVICE_PRICING

        return ORJSONResponse(content={
            "success": True,
            "services": services,
            "count": len(services),
            "source": "database" if db_services else "fallback",
        })
    except Exception as e:
        logger.error(f"Error getting service pricing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get service pricing: {e}")


@router.get("/pricing/journeys")
async def get_journey_pricing():
    """
    Get pricing information per journey type.
    """
    try:
        journey_pricing = {
            "non-tech": {
                "journeyType": "non-tech",
                "displayName": "Guided Essentials",
                "basePriceCents": 2500,
                "description": "AI-guided analysis for non-technical users",
                "included": True,
            },
            "business": {
                "journeyType": "business",
                "displayName": "Business Analysis",
                "basePriceCents": 4900,
                "description": "Industry-specific business analytics",
                "included": True,
            },
            "technical": {
                "journeyType": "technical",
                "displayName": "Advanced Statistical",
                "basePriceCents": 9900,
                "description": "Full-spectrum statistical and ML analysis",
                "included": True,
            },
            "consultation": {
                "journeyType": "consultation",
                "displayName": "Expert Consultation",
                "basePriceCents": 15000,
                "description": "Guided consultation with data strategy experts",
                "included": False,
            },
        }

        return ORJSONResponse(content={
            "success": True,
            "journeys": journey_pricing,
        })
    except Exception as e:
        logger.error(f"Error getting journey pricing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get journey pricing: {e}")


@router.get("/pricing/runtime-config")
async def get_runtime_pricing_config():
    """
    Return runtime pricing configuration for the frontend.
    """
    try:
        return ORJSONResponse(content={
            "success": True,
            "servicePricing": {
                "payPerAnalysis": 25,
                "expertConsultation": 150,
            },
            "currency": "usd",
            "trialDays": 14,
            "stripeEnabled": bool(STRIPE_SECRET_KEY),
        })
    except Exception as e:
        logger.error(f"Error getting runtime config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get runtime config: {e}")


@router.post("/calculate-price")
async def calculate_price(request: Request):
    """
    Calculate total price for a set of analysis features.
    """
    try:
        body = await request.json()
        features: List[str] = body.get("features", [])

        total_cents = 0
        breakdown = []
        for feature in features:
            cost = ANALYSIS_COST_MAP.get(feature, 500)
            total_cents += cost
            breakdown.append({"feature": feature, "costCents": cost})

        return ORJSONResponse(content={
            "success": True,
            "totalCents": total_cents,
            "total": total_cents / 100,
            "currency": "usd",
            "breakdown": breakdown,
        })
    except Exception as e:
        logger.error(f"Error calculating price: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to calculate price: {e}")


# ============================================================================
# Stripe Webhook
# ============================================================================

@router.post("/payment/webhook")
async def stripe_webhook(request: Request):
    """
    Handle Stripe webhook events.

    Processes:
    - checkout.session.completed
    - payment_intent.succeeded
    - payment_intent.failed
    """
    try:
        if not STRIPE_SECRET_KEY or not STRIPE_AVAILABLE:
            logger.warning("Stripe webhook received but Stripe is not configured")
            return ORJSONResponse(content={"received": True})

        payload = await request.body()
        sig_header = request.headers.get("stripe-signature")

        if not sig_header:
            raise HTTPException(status_code=400, detail="No stripe-signature header")

        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, STRIPE_WEBHOOK_SECRET
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid payload")
        except Exception as e:
            if STRIPE_AVAILABLE and "stripe" in str(type(e)).lower():
                raise HTTPException(status_code=400, detail="Invalid signature")
            logger.warning(f"Could not verify webhook signature: {e}")
            return ORJSONResponse(content={"received": True})

        event_payload = _stripe_obj_to_dict(event)
        event_type = event_payload.get("type")
        event_id = event_payload.get("id")
        event_data = _stripe_obj_to_dict(event_payload.get("data"))
        event_object = _stripe_obj_to_dict(event_data.get("object"))

        if not event_type:
            raise HTTPException(status_code=400, detail="Webhook event missing type")

        logger.info(f"Received Stripe webhook: {event_type} ({event_id})")

        if event_type == "checkout.session.completed":
            checkout_data = event_object
            metadata = _stripe_obj_to_dict(checkout_data.get("metadata"))
            project_id = metadata.get("project_id")

            if project_id:
                payment_intent_obj = checkout_data.get("payment_intent")
                payment_intent_id = (
                    payment_intent_obj.get("id")
                    if isinstance(payment_intent_obj, dict)
                    else payment_intent_obj
                )

                persisted = await _apply_webhook_payment_update(
                    project_id=project_id,
                    event_id=event_id,
                    event_type=event_type,
                    payment_patch={
                        "isPaid": True,
                        "status": "succeeded",
                        "sessionId": checkout_data.get("id"),
                        "paymentIntentId": payment_intent_id,
                        "paidAt": datetime.utcnow().isoformat(),
                        "amountCents": checkout_data.get("amount_total"),
                        "mock": False,
                        "lastWebhookEventType": event_type,
                    },
                )

                if persisted:
                    logger.info(f"Payment completed for project {project_id}")
            else:
                logger.warning("checkout.session.completed missing metadata.project_id")

        elif event_type == "payment_intent.succeeded":
            payment_intent = event_object
            metadata = _stripe_obj_to_dict(payment_intent.get("metadata"))
            project_id = metadata.get("project_id")

            if project_id:
                persisted = await _apply_webhook_payment_update(
                    project_id=project_id,
                    event_id=event_id,
                    event_type=event_type,
                    payment_patch={
                        "isPaid": True,
                        "status": "succeeded",
                        "paymentIntentId": payment_intent.get("id"),
                        "paidAt": datetime.utcnow().isoformat(),
                        "amountCents": payment_intent.get("amount_received") or payment_intent.get("amount"),
                        "mock": False,
                        "lastWebhookEventType": event_type,
                    },
                )
                if persisted:
                    logger.info(f"Payment intent succeeded for project {project_id}")
            else:
                logger.warning("payment_intent.succeeded missing metadata.project_id")

        elif event_type in {"payment_intent.payment_failed", "payment_intent.failed"}:
            payment_intent = event_object
            metadata = _stripe_obj_to_dict(payment_intent.get("metadata"))
            project_id = metadata.get("project_id")
            last_error = _stripe_obj_to_dict(payment_intent.get("last_payment_error"))

            if project_id:
                persisted = await _apply_webhook_payment_update(
                    project_id=project_id,
                    event_id=event_id,
                    event_type=event_type,
                    payment_patch={
                        "isPaid": False,
                        "status": "failed",
                        "paymentIntentId": payment_intent.get("id"),
                        "failedAt": datetime.utcnow().isoformat(),
                        "failureCode": last_error.get("code"),
                        "failureMessage": last_error.get("message"),
                        "mock": False,
                        "lastWebhookEventType": event_type,
                    },
                )
                if persisted:
                    logger.warning(f"Payment intent failed for project {project_id}")
            else:
                logger.warning("payment_intent.payment_failed missing metadata.project_id")

        return ORJSONResponse(content={"received": True, "event_type": event_type})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing webhook: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Webhook processing failed: {e}")


# ============================================================================
# Router Inclusion Helper
# ============================================================================

def include_payment_routes(app):
    """Include payment routes in the FastAPI app"""
    app.include_router(router, tags=["payment"])
    logger.info("Payment routes included")
