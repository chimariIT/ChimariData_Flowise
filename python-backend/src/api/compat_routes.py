"""
Compatibility routes for frontend expectations in Python-backend mode.

These endpoints mirror legacy Node.js paths used by the React frontend:
- /admin/permissions
- /user/role-permissions
- /usage/*
- /analysis-execution/results/{project_id}
"""

from __future__ import annotations

from typing import Any, Dict, Optional
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import ORJSONResponse, JSONResponse
from sqlalchemy import text as sa_text

from ..auth.middleware import get_current_user, User as AuthUser
from ..db import get_db_context

logger = logging.getLogger(__name__)

router = APIRouter(tags=["compat"])


def _coerce_json(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def _subscription_limits(subscription_tier: str) -> Dict[str, Any]:
    tier = (subscription_tier or "trial").lower()

    # Keep this generous in Python compatibility mode to avoid artificial UX blocking.
    tier_limits = {
        "none": {
            "maxAiQueries": 50,
            "maxDataUploads": 5,
            "maxDataVolumeMB": 100,
            "maxProjects": 3,
            "maxVisualizations": 25,
            "canGenerateCode": False,
            "consultationMinutesIncluded": 0,
            "maxConcurrentProjects": 3,
            "maxDatasetSizeMB": 100,
            "maxAiQueriesPerMonth": 50,
            "maxVisualizationsPerProject": 25,
            "canUseAdvancedModels": False,
        },
        "trial": {
            "maxAiQueries": 100,
            "maxDataUploads": 10,
            "maxDataVolumeMB": 250,
            "maxProjects": 5,
            "maxVisualizations": 50,
            "canGenerateCode": False,
            "consultationMinutesIncluded": 0,
            "maxConcurrentProjects": 5,
            "maxDatasetSizeMB": 100,
            "maxAiQueriesPerMonth": 100,
            "maxVisualizationsPerProject": 50,
            "canUseAdvancedModels": False,
        },
        "starter": {
            "maxAiQueries": 300,
            "maxDataUploads": 30,
            "maxDataVolumeMB": 1024,
            "maxProjects": 20,
            "maxVisualizations": 200,
            "canGenerateCode": True,
            "consultationMinutesIncluded": 30,
            "maxConcurrentProjects": 20,
            "maxDatasetSizeMB": 250,
            "maxAiQueriesPerMonth": 300,
            "maxVisualizationsPerProject": 100,
            "canUseAdvancedModels": True,
        },
        "professional": {
            "maxAiQueries": 1000,
            "maxDataUploads": 100,
            "maxDataVolumeMB": 5120,
            "maxProjects": 100,
            "maxVisualizations": 1000,
            "canGenerateCode": True,
            "consultationMinutesIncluded": 120,
            "maxConcurrentProjects": 100,
            "maxDatasetSizeMB": 1024,
            "maxAiQueriesPerMonth": 1000,
            "maxVisualizationsPerProject": 250,
            "canUseAdvancedModels": True,
        },
        "enterprise": {
            "maxAiQueries": 10000,
            "maxDataUploads": 1000,
            "maxDataVolumeMB": 51200,
            "maxProjects": 1000,
            "maxVisualizations": 10000,
            "canGenerateCode": True,
            "consultationMinutesIncluded": 1000,
            "maxConcurrentProjects": 1000,
            "maxDatasetSizeMB": 10240,
            "maxAiQueriesPerMonth": 10000,
            "maxVisualizationsPerProject": 1000,
            "canUseAdvancedModels": True,
        },
    }
    return tier_limits.get(tier, tier_limits["trial"])


async def _fetch_user_record(user_id: str) -> Optional[Dict[str, Any]]:
    async with get_db_context() as session:
        result = await session.execute(
            sa_text("SELECT * FROM users WHERE id = :id"),
            {"id": user_id},
        )
        row = result.first()
        if row is None:
            return None
        return dict(zip(result.keys(), row))


def _build_permissions_payload(user_record: Optional[Dict[str, Any]], current_user: AuthUser) -> Dict[str, Any]:
    tier = (user_record or {}).get("subscription_tier", "trial")
    limits = _subscription_limits(tier)

    role_id = "admin" if current_user.is_admin else "user"
    role_name = "Administrator" if current_user.is_admin else "User"

    permissions = [
        "read:dashboard",
        "read:projects",
        "read:results",
        "read:billing",
    ]
    if current_user.is_admin:
        permissions.extend([
            "read:admin",
            "write:admin",
            "manage:users",
            "manage:billing",
            "manage:agents",
        ])

    return {
        "role": {
            "id": role_id,
            "name": role_name,
        },
        "permissions": permissions,
        "limits": limits,
        "subscriptionTier": tier,
        "isAdmin": bool(current_user.is_admin),
        "isSuperAdmin": False,
    }


@router.get("/admin/permissions")
async def get_admin_permissions(current_user: AuthUser = Depends(get_current_user)):
    """Compatibility endpoint consumed by dashboard/admin UI permission checks."""
    user_record = await _fetch_user_record(current_user.id)
    payload = _build_permissions_payload(user_record, current_user)
    return ORJSONResponse(content={"success": True, "data": payload})


@router.get("/user/role-permissions")
async def get_user_role_permissions(current_user: AuthUser = Depends(get_current_user)):
    """Compatibility endpoint for role/limits used by legacy frontend hooks."""
    user_record = await _fetch_user_record(current_user.id)
    if user_record is None:
        raise HTTPException(status_code=404, detail="User not found")

    tier = user_record.get("subscription_tier", "trial")
    limits = _subscription_limits(tier)

    permissions = {
        "id": f"user-perms-{current_user.id}",
        "userId": current_user.id,
        "canAccessNonTechJourney": True,
        "canAccessBusinessJourney": True,
        "canAccessTechnicalJourney": tier in {"starter", "professional", "enterprise", "trial"},
        "canRequestConsultation": True,
        "canAccessAdvancedAnalytics": tier in {"starter", "professional", "enterprise"},
        "canUseCustomAiKeys": tier in {"professional", "enterprise"},
        "canGenerateCode": bool(limits["canGenerateCode"]),
        "canAccessRawData": True,
        "canExportResults": True,
        "maxConcurrentProjects": limits["maxConcurrentProjects"],
        "maxDatasetSizeMB": limits["maxDatasetSizeMB"],
        "maxAiQueriesPerMonth": limits["maxAiQueriesPerMonth"],
        "maxVisualizationsPerProject": limits["maxVisualizationsPerProject"],
        "allowedAiProviders": ["google", "openai", "anthropic"],
        "canUseAdvancedModels": bool(limits["canUseAdvancedModels"]),
    }

    response = {
        "userRole": user_record.get("user_role", "non-tech"),
        "technicalLevel": user_record.get("technical_level", "beginner"),
        "subscriptionTier": tier,
        "industry": user_record.get("industry"),
        "preferredJourney": user_record.get("preferred_journey"),
        "onboardingCompleted": bool(user_record.get("onboarding_completed", False)),
        "permissions": permissions,
        "currentUsage": {
            "monthlyUploads": int(user_record.get("monthly_uploads") or 0),
            "monthlyDataVolume": int(user_record.get("monthly_data_volume") or 0),
            "monthlyAIInsights": int(user_record.get("monthly_ai_insights") or 0),
        },
        "limits": limits,
    }
    return ORJSONResponse(content=response)


@router.get("/usage/current")
async def get_current_usage(current_user: AuthUser = Depends(get_current_user)):
    user_record = await _fetch_user_record(current_user.id)
    if user_record is None:
        raise HTTPException(status_code=404, detail="User not found")

    tier = user_record.get("subscription_tier", "trial")
    limits = _subscription_limits(tier)

    usage = {
        "aiQueries": int(user_record.get("monthly_ai_insights") or 0),
        "dataUploads": int(user_record.get("monthly_uploads") or 0),
        "dataVolumeMB": int(user_record.get("monthly_data_volume") or 0),
        "projectsCreated": int(user_record.get("monthly_projects_created") or 0),
        "visualizationsGenerated": int(user_record.get("monthly_visualizations_generated") or 0),
        "codeGenerations": int(user_record.get("monthly_code_generations") or 0),
        "consultationMinutes": int(user_record.get("monthly_consultation_minutes") or 0),
    }

    return ORJSONResponse(content={"usage": usage, "limits": limits})


@router.post("/usage/check")
async def check_usage(request: Request, current_user: AuthUser = Depends(get_current_user)):
    body = await request.json()
    action = body.get("action")
    amount = int(body.get("amount", 1))

    user_record = await _fetch_user_record(current_user.id)
    if user_record is None:
        raise HTTPException(status_code=404, detail="User not found")

    tier = user_record.get("subscription_tier", "trial")
    limits = _subscription_limits(tier)

    usage_map = {
        "ai_query": int(user_record.get("monthly_ai_insights") or 0),
        "data_upload": int(user_record.get("monthly_uploads") or 0),
        "data_volume": int(user_record.get("monthly_data_volume") or 0),
        "project_creation": int(user_record.get("monthly_projects_created") or 0),
    }
    limit_map = {
        "ai_query": limits["maxAiQueries"],
        "data_upload": limits["maxDataUploads"],
        "data_volume": limits["maxDataVolumeMB"],
        "project_creation": limits["maxProjects"],
    }

    current_value = usage_map.get(action, 0)
    limit_value = limit_map.get(action, 1)
    new_value = current_value + amount
    allowed = new_value <= limit_value
    remaining = max(0, limit_value - current_value)
    percent_used = min(100, int((new_value / max(1, limit_value)) * 100))

    return ORJSONResponse(content={
        "allowed": allowed,
        "current": current_value,
        "requested": amount,
        "limit": limit_value,
        "remaining": remaining,
        "percentageUsed": percent_used,
    })


@router.post("/usage/track")
async def track_usage(request: Request, current_user: AuthUser = Depends(get_current_user)):
    """
    Lightweight usage tracking compatibility endpoint.
    For Python mode we return success and allow frontend UX flows to proceed.
    """
    body = await request.json()
    action = body.get("action", "unknown")

    return ORJSONResponse(content={
        "success": True,
        "usageResult": {
            "allowed": True,
            "action": action,
        },
    })


@router.get("/analysis-execution/results/{project_id}")
async def get_analysis_execution_results(
    project_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Compatibility endpoint used by dashboard-step.tsx.
    Returns shape: { success, results } plus execution/payment hints.
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

    if project.get("user_id") != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    journey_progress = _coerce_json(project.get("journey_progress"))
    execution_status = (
        journey_progress.get("executionStatus")
        or project.get("status")
        or "draft"
    )

    payment_info = _coerce_json(journey_progress.get("payment"))
    is_paid = bool(payment_info.get("isPaid")) or bool(project.get("is_paid"))

    analysis_results = project.get("analysis_results")
    if not isinstance(analysis_results, dict):
        analysis_results = _coerce_json(analysis_results)
    if not analysis_results:
        analysis_results = _coerce_json(journey_progress.get("analysisResults"))

    if not analysis_results:
        if execution_status in {"executing", "in_progress"}:
            return JSONResponse(
                status_code=202,
                content={
                    "success": False,
                    "status": "executing",
                    "executionStatus": "executing",
                    "message": "Analysis is still running. Results will be available shortly.",
                    "isPaid": is_paid,
                },
            )

        if execution_status == "failed":
            execution_error = journey_progress.get("executionError") or "Analysis execution failed"
            return JSONResponse(
                status_code=422,
                content={
                    "success": False,
                    "status": "failed",
                    "executionStatus": "failed",
                    "error": execution_error,
                    "message": "Analysis execution failed. Please retry from the Execute step.",
                    "isPaid": is_paid,
                },
            )

        # Non-failing fallback for projects that have not executed yet.
        analysis_results = {
            "projectId": project_id,
            "summary": {
                "totalAnalyses": 0,
                "dataRowsProcessed": 0,
                "qualityScore": 0,
                    "executionTime": "-",
                "datasetCount": 0,
                "confidence": 0,
            },
            "insights": [],
            "recommendations": [],
            "visualizations": [],
            "analysisTypes": [],
            "questionAnswers": {"answers": []},
            "isPreview": not is_paid,
            "paymentRequired": not is_paid,
            "paymentUrl": f"/projects/{project_id}/payment",
            "message": "No analysis results found for this project yet.",
        }
    else:
        analysis_results.setdefault("summary", {})
        analysis_results.setdefault("insights", [])
        analysis_results.setdefault("recommendations", [])
        analysis_results.setdefault("visualizations", [])
        analysis_results.setdefault("analysisTypes", [])
        analysis_results.setdefault("questionAnswers", {"answers": []})
        analysis_results.setdefault("isPreview", not is_paid)
        analysis_results.setdefault("paymentRequired", not is_paid)
        analysis_results.setdefault("paymentUrl", f"/projects/{project_id}/payment")

    return ORJSONResponse(content={
        "success": True,
        "results": analysis_results,
        "status": execution_status,
    })
