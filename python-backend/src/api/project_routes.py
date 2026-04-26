"""
Project Routes for Chimaridata Python Backend

Real DB implementation using raw SQL (sa_text) against the Drizzle-created
PostgreSQL schema.  Does NOT use the SQLAlchemy ORM models because those
don't match the actual table columns.

Pattern: same as auth_routes.py — sa_text + get_db_context + ORJSONResponse.
"""

from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum
import json
import logging
import uuid

from fastapi import APIRouter, HTTPException, Depends, Body, status
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel, Field, ConfigDict

from sqlalchemy import text as sa_text

from ..db import get_db_context
from ..auth.middleware import get_current_user, User as AuthUser

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================================================
# Constants
# ============================================================================

VALID_JOURNEY_TYPES = {"non-tech", "business", "technical", "consultation", "custom"}
JOURNEY_TYPE_ALIASES = {
    # Non-technical guided aliases (legacy + frontend variants)
    "ai_guided": "non-tech",
    "ai-guided": "non-tech",
    "guided": "non-tech",
    "nontech": "non-tech",
    "non_tech": "non-tech",
    "nontechnical": "non-tech",
    "non-technical": "non-tech",
    # Technical aliases
    "tech": "technical",
    "technical_ai": "technical",
    "technical-ai": "technical",
    # Consultation aliases
    "expert_consultation": "consultation",
    "expert-consultation": "consultation",
}


def _normalize_journey_type(journey_type: str) -> str:
    """Normalize journey type values from legacy/frontend aliases."""
    normalized = (journey_type or "").strip().lower().replace(" ", "-")
    normalized = JOURNEY_TYPE_ALIASES.get(normalized, normalized)

    if normalized not in VALID_JOURNEY_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid journeyType. Must be one of: "
                f"{', '.join(sorted(VALID_JOURNEY_TYPES))}"
            ),
        )

    return normalized


# ============================================================================
# Pydantic Request Models
# ============================================================================

class CreateProjectRequest(BaseModel):
    """Request to create a new project"""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    journeyType: str = Field(default="business", alias="journey_type")

    model_config = ConfigDict(populate_by_name=True)


class UpdateProjectRequest(BaseModel):
    """Request to update a project — all fields optional"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[str] = None
    journeyType: Optional[str] = Field(None, alias="journey_type")

    model_config = ConfigDict(populate_by_name=True)


class ProgressUpdate(BaseModel):
    """Accepts any JSONB fields for atomic merge into journey_progress"""
    model_config = ConfigDict(extra="allow")


class LinkDatasetRequest(BaseModel):
    """Request to link a dataset to a project"""
    datasetId: str = Field(..., alias="dataset_id")
    role: str = "primary"

    model_config = ConfigDict(populate_by_name=True)


class AgentRecommendationsRequest(BaseModel):
    """Request payload for project-level agent recommendations."""
    goals: str
    questions: List[str]
    dataSource: Optional[str] = "upload"


# ============================================================================
# Helpers
# ============================================================================

def _serialize_row(row: dict) -> dict:
    """Convert a raw DB row dict to JSON-safe camelCase dict."""
    def _val(v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    return {
        "id": row.get("id"),
        "userId": row.get("user_id"),
        "name": row.get("name"),
        "description": row.get("description"),
        "status": row.get("status"),
        "journeyType": row.get("journey_type"),
        "journeyProgress": row.get("journey_progress") or {},
        "analysisResults": row.get("analysis_results"),
        "executionState": row.get("execution_state") or {},
        "lockedCostEstimate": (
            float(row["locked_cost_estimate"])
            if row.get("locked_cost_estimate") is not None
            else None
        ),
        "costBreakdown": row.get("cost_breakdown"),
        "createdAt": _val(row.get("created_at")),
        "updatedAt": _val(row.get("updated_at")),
    }


async def _fetch_project(session, project_id: str) -> Optional[dict]:
    """Fetch a single project row as dict, or None."""
    result = await session.execute(
        sa_text("SELECT * FROM projects WHERE id = :id"),
        {"id": project_id},
    )
    row = result.first()
    if row is None:
        return None
    return dict(zip(result.keys(), row))


async def _check_ownership(session, project_id: str, user: AuthUser) -> dict:
    """Fetch project and verify ownership.  Raises 404 / 403."""
    project = await _fetch_project(session, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if project["user_id"] != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to access this project")
    return project


def _build_agent_recommendations(goals: str, questions: List[str]) -> Dict[str, Any]:
    """
    Build lightweight, deterministic recommendations when full agent orchestration
    is unavailable on the Python compatibility endpoint.
    """
    lowered_questions = " ".join(q.lower() for q in questions)
    question_count = len(questions)

    if question_count <= 2:
        estimated_rows = 1000
    elif question_count <= 5:
        estimated_rows = 5000
    else:
        estimated_rows = 15000

    complexity = "moderate"
    complexity_markers = ("predict", "forecast", "segment", "cluster", "driver", "causal", "regression")
    if any(marker in lowered_questions for marker in complexity_markers) or question_count >= 6:
        complexity = "high"
    elif question_count <= 1:
        complexity = "low"

    recommended_analyses: List[str] = ["descriptive_stats"]
    if any(token in lowered_questions for token in ("trend", "over time", "month", "quarter", "year")):
        recommended_analyses.append("time_series")
    if any(token in lowered_questions for token in ("compare", "relationship", "driver", "impact", "correlation")):
        recommended_analyses.append("correlation")
    if any(token in lowered_questions for token in ("predict", "forecast", "regression", "influence")):
        recommended_analyses.append("regression")
    if any(token in lowered_questions for token in ("segment", "cluster", "cohort")):
        recommended_analyses.append("clustering")

    # Keep deterministic order and uniqueness.
    seen = set()
    recommended_analyses = [a for a in recommended_analyses if not (a in seen or seen.add(a))]

    if complexity == "high":
        estimated_processing_time = "5-10 minutes"
    elif complexity == "moderate":
        estimated_processing_time = "2-5 minutes"
    else:
        estimated_processing_time = "1-2 minutes"

    return {
        "expectedDataSize": str(estimated_rows),
        "analysisComplexity": complexity,
        "rationale": (
            f"Recommendations generated from {question_count} question(s) and stated goal."
        ),
        "confidence": 0.84 if complexity == "high" else 0.88,
        "dataEngineering": {
            "estimatedRows": estimated_rows,
            "estimatedColumns": 12 if complexity == "low" else (24 if complexity == "moderate" else 40),
            "dataCharacteristics": {
                "questionCount": question_count,
                "goalProvided": bool(goals and goals.strip()),
            },
        },
        "dataScience": {
            "recommendedAnalyses": recommended_analyses,
            "suggestedVisualizations": (
                ["bar_chart", "line_chart", "heatmap"]
                if complexity != "low"
                else ["bar_chart", "table_summary"]
            ),
            "estimatedProcessingTime": estimated_processing_time,
        },
    }


# ============================================================================
# 1. GET /projects — list user's projects
# ============================================================================

@router.get("/projects")
async def list_projects(current_user: AuthUser = Depends(get_current_user)):
    """Return all projects belonging to the authenticated user."""
    try:
        async with get_db_context() as session:
            result = await session.execute(
                sa_text(
                    "SELECT * FROM projects WHERE user_id = :user_id "
                    "ORDER BY created_at DESC"
                ),
                {"user_id": current_user.id},
            )
            rows = result.fetchall()
            projects = [
                _serialize_row(dict(zip(result.keys(), r))) for r in rows
            ]

        return ORJSONResponse(content={"success": True, "projects": projects})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing projects: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list projects: {e}")


# ============================================================================
# 2. POST /projects — create project
# ============================================================================

@router.post("/projects")
async def create_project(
    request: CreateProjectRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    """Create a new project owned by the authenticated user."""
    try:
        journey_type = _normalize_journey_type(request.journeyType)

        project_id = str(uuid.uuid4())
        now_iso = datetime.utcnow().isoformat()
        initial_progress = json.dumps({
            "journeyType": journey_type,
            "createdAt": now_iso,
            "status": "draft",
        })

        async with get_db_context() as session:
            await session.execute(
                sa_text(
                    "INSERT INTO projects "
                    "(id, user_id, name, description, status, journey_type, "
                    " journey_progress, created_at, updated_at) "
                    "VALUES (:id, :user_id, :name, :description, 'draft', :journey_type, "
                    " CAST(:journey_progress AS jsonb), NOW(), NOW())"
                ),
                {
                    "id": project_id,
                    "user_id": current_user.id,
                    "name": request.name,
                    "description": request.description,
                    "journey_type": journey_type,
                    "journey_progress": initial_progress,
                },
            )
            await session.commit()

            # Fetch the created row to return full data
            project = await _fetch_project(session, project_id)

        return ORJSONResponse(
            content={
                "success": True,
                "project": _serialize_row(project) if project else {"id": project_id},
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating project: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create project: {e}")


# ============================================================================
# 2b. POST /projects/{project_id}/agent-recommendations
# ============================================================================

@router.post("/projects/{project_id}/agent-recommendations")
async def get_agent_recommendations(
    project_id: str,
    request: AgentRecommendationsRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    """Return agent-style recommendations for data requirements and analysis complexity."""
    try:
        if not request.goals or not request.questions:
            raise HTTPException(status_code=400, detail="Goals and questions are required")

        async with get_db_context() as session:
            await _check_ownership(session, project_id, current_user)

        recommendations = _build_agent_recommendations(request.goals, request.questions)

        return ORJSONResponse(content={
            "success": True,
            "recommendations": recommendations,
            "metadata": {
                "generatedAt": datetime.utcnow().isoformat(),
                "agents": ["data_engineer", "data_scientist"],
                "dataSource": request.dataSource or "upload",
            },
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating agent recommendations: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate recommendations: {e}")


# ============================================================================
# 3. GET /projects/{project_id} — get single project
# ============================================================================

@router.get("/projects/{project_id}")
async def get_project(
    project_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Return a single project with ownership check."""
    try:
        async with get_db_context() as session:
            project = await _check_ownership(session, project_id, current_user)

        return ORJSONResponse(
            content={"success": True, "project": _serialize_row(project)}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting project: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get project: {e}")


# ============================================================================
# 4. PUT /projects/{project_id} — update project
# ============================================================================

@router.put("/projects/{project_id}")
async def update_project(
    project_id: str,
    request: UpdateProjectRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    """Update project fields (name, description, status, journeyType)."""
    try:
        async with get_db_context() as session:
            await _check_ownership(session, project_id, current_user)

            # Build dynamic SET clause from provided fields
            set_clauses = ["updated_at = NOW()"]
            params: Dict[str, Any] = {"id": project_id}

            if request.name is not None:
                set_clauses.append("name = :name")
                params["name"] = request.name
            if request.description is not None:
                set_clauses.append("description = :description")
                params["description"] = request.description
            if request.status is not None:
                set_clauses.append("status = :status")
                params["status"] = request.status
            if request.journeyType is not None:
                normalized_journey_type = _normalize_journey_type(request.journeyType)
                set_clauses.append("journey_type = :journey_type")
                params["journey_type"] = normalized_journey_type

            sql = f"UPDATE projects SET {', '.join(set_clauses)} WHERE id = :id"
            await session.execute(sa_text(sql), params)
            await session.commit()

            # Return updated row
            project = await _fetch_project(session, project_id)

        return ORJSONResponse(
            content={"success": True, "project": _serialize_row(project) if project else None}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating project: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update project: {e}")


# ============================================================================
# 5. DELETE /projects/{project_id} — delete project
# ============================================================================

@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Delete a project and its dataset links."""
    try:
        async with get_db_context() as session:
            await _check_ownership(session, project_id, current_user)

            # Remove junction rows first
            await session.execute(
                sa_text("DELETE FROM project_datasets WHERE project_id = :id"),
                {"id": project_id},
            )
            # Remove the project itself
            await session.execute(
                sa_text("DELETE FROM projects WHERE id = :id"),
                {"id": project_id},
            )
            await session.commit()

        return ORJSONResponse(content={"success": True, "message": "Project deleted"})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting project: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete project: {e}")


# ============================================================================
# 6. PUT /projects/{project_id}/progress — atomic JSONB merge
# ============================================================================

@router.put("/projects/{project_id}/progress")
async def update_progress(
    project_id: str,
    progress: Dict[str, Any] = Body(...),
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Atomic merge into journey_progress using PostgreSQL || operator.
    Existing keys not in the payload are preserved.
    """
    try:
        async with get_db_context() as session:
            await _check_ownership(session, project_id, current_user)

            await session.execute(
                sa_text(
                    "UPDATE projects "
                    "SET journey_progress = COALESCE(journey_progress, CAST('{}' AS jsonb)) || CAST(:new_progress AS jsonb), "
                    "    updated_at = NOW() "
                    "WHERE id = :id"
                ),
                {"id": project_id, "new_progress": json.dumps(progress)},
            )
            await session.commit()

            # Return the merged journey_progress
            project = await _fetch_project(session, project_id)
            jp = (project.get("journey_progress") or {}) if project else {}

        return ORJSONResponse(
            content={"success": True, "journeyProgress": jp}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating progress: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update progress: {e}")


# ============================================================================
# 7. GET /projects/{project_id}/datasets — linked datasets
# ============================================================================

@router.get("/projects/{project_id}/datasets")
async def get_project_datasets(
    project_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Return datasets linked to this project via the project_datasets junction."""
    try:
        async with get_db_context() as session:
            await _check_ownership(session, project_id, current_user)

            result = await session.execute(
                sa_text(
                    "SELECT d.*, pd.role, pd.added_at "
                    "FROM datasets d "
                    "INNER JOIN project_datasets pd ON pd.dataset_id = d.id "
                    "WHERE pd.project_id = :project_id "
                    "ORDER BY pd.added_at DESC"
                ),
                {"project_id": project_id},
            )
            rows = result.fetchall()
            keys = result.keys()
            datasets = []
            for r in rows:
                row_dict = dict(zip(keys, r))
                # Serialize datetime fields
                for k, v in row_dict.items():
                    if isinstance(v, datetime):
                        row_dict[k] = v.isoformat()
                datasets.append(row_dict)

        return ORJSONResponse(content={"success": True, "datasets": datasets})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting project datasets: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get project datasets: {e}")


# ============================================================================
# 8. POST /projects/{project_id}/datasets — link dataset to project
# ============================================================================

@router.post("/projects/{project_id}/datasets")
async def link_dataset(
    project_id: str,
    request: LinkDatasetRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    """Link an existing dataset to this project."""
    try:
        async with get_db_context() as session:
            await _check_ownership(session, project_id, current_user)

            link_id = str(uuid.uuid4())
            await session.execute(
                sa_text(
                    "INSERT INTO project_datasets (id, project_id, dataset_id, role, added_at) "
                    "VALUES (:id, :project_id, :dataset_id, :role, NOW()) "
                    "ON CONFLICT DO NOTHING"
                ),
                {
                    "id": link_id,
                    "project_id": project_id,
                    "dataset_id": request.datasetId,
                    "role": request.role,
                },
            )
            await session.commit()

        return ORJSONResponse(
            content={"success": True, "message": "Dataset linked to project"}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error linking dataset: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to link dataset: {e}")


# ============================================================================
# 9. GET /projects/{project_id}/checkpoints — from journey_progress
# ============================================================================

@router.get("/projects/{project_id}/checkpoints")
async def get_checkpoints(
    project_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Return checkpoints stored inside journey_progress."""
    try:
        async with get_db_context() as session:
            project = await _check_ownership(session, project_id, current_user)

        jp = project.get("journey_progress") or {}
        checkpoints = jp.get("checkpoints", [])

        return ORJSONResponse(
            content={"success": True, "checkpoints": checkpoints}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting checkpoints: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get checkpoints: {e}")


# ============================================================================
# 10. GET /projects/{project_id}/cost-estimate — from journey_progress
# ============================================================================

@router.post("/projects/{project_id}/checkpoints")
async def create_checkpoint(
    project_id: str,
    payload: Dict[str, Any] = Body(default_factory=dict),
    current_user: AuthUser = Depends(get_current_user),
):
    """Create a user-visible checkpoint inside journey_progress."""
    try:
        async with get_db_context() as session:
            project = await _check_ownership(session, project_id, current_user)
            jp = project.get("journey_progress") or {}
            checkpoint = {
                "id": payload.get("id") or str(uuid.uuid4()),
                "projectId": project_id,
                "stage": payload.get("stage") or payload.get("stepName") or "review",
                "agentId": payload.get("agentId") or payload.get("agentType") or "project_manager",
                "agentType": payload.get("agentType") or payload.get("agentId") or "project_manager",
                "stepName": payload.get("stepName") or payload.get("stage") or "review",
                "status": payload.get("status") or "waiting_approval",
                "message": payload.get("message") or "Review and approve the proposed workflow step.",
                "data": payload.get("data") or {"artifacts": payload.get("artifacts", [])},
                "requiresUserInput": payload.get("requiresUserInput", True),
                "userVisible": payload.get("userVisible", True),
                "timestamp": datetime.utcnow().isoformat(),
            }
            checkpoints = jp.get("checkpoints", [])
            checkpoints.append(checkpoint)
            jp["checkpoints"] = checkpoints
            await session.execute(
                sa_text(
                    "UPDATE projects SET journey_progress = CAST(:jp AS jsonb), "
                    "updated_at = NOW() WHERE id = :id"
                ),
                {"jp": json.dumps(jp), "id": project_id},
            )
            await session.commit()

        return ORJSONResponse(content={"success": True, "checkpoint": checkpoint})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating checkpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create checkpoint: {e}")


@router.post("/projects/{project_id}/checkpoints/{checkpoint_id}/feedback")
async def submit_checkpoint_feedback(
    project_id: str,
    checkpoint_id: str,
    payload: Dict[str, Any] = Body(default_factory=dict),
    current_user: AuthUser = Depends(get_current_user),
):
    """Record approval/rejection feedback for a checkpoint."""
    try:
        async with get_db_context() as session:
            project = await _check_ownership(session, project_id, current_user)
            jp = project.get("journey_progress") or {}
            checkpoints = jp.get("checkpoints", [])
            matched = None
            for checkpoint in checkpoints:
                if checkpoint.get("id") == checkpoint_id:
                    approved = bool(payload.get("approved"))
                    checkpoint["status"] = "approved" if approved else "rejected"
                    checkpoint["userFeedback"] = payload.get("feedback", "")
                    checkpoint["respondedAt"] = datetime.utcnow().isoformat()
                    matched = checkpoint
                    break

            if matched is None:
                raise HTTPException(status_code=404, detail="Checkpoint not found")

            jp["checkpoints"] = checkpoints
            await session.execute(
                sa_text(
                    "UPDATE projects SET journey_progress = CAST(:jp AS jsonb), "
                    "updated_at = NOW() WHERE id = :id"
                ),
                {"jp": json.dumps(jp), "id": project_id},
            )
            await session.commit()

        return ORJSONResponse(content={"success": True, "checkpoint": matched})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting checkpoint feedback: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to submit checkpoint feedback: {e}")


@router.get("/projects/{project_id}/cost-estimate")
async def get_cost_estimate(
    project_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Return cost estimate from journey_progress + locked_cost_estimate column."""
    try:
        async with get_db_context() as session:
            project = await _check_ownership(session, project_id, current_user)

        jp = project.get("journey_progress") or {}
        cost_estimate = jp.get("costEstimate", {})
        payment_info = jp.get("payment", {})
        locked = project.get("locked_cost_estimate")

        return ORJSONResponse(content={
            "success": True,
            "projectId": project_id,
            "totalCostCents": cost_estimate.get("totalCostCents", 0),
            "lockedCostEstimate": float(locked) if locked is not None else None,
            "breakdown": cost_estimate.get("breakdown", {}),
            "costBreakdown": project.get("cost_breakdown"),
            "currency": "USD",
            "isPaid": payment_info.get("isPaid", False),
            "paymentStatus": payment_info.get("status", "pending"),
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting cost estimate: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get cost estimate: {e}")


# ============================================================================
# 11. GET /projects/{project_id}/required-data-elements
# ============================================================================

@router.get("/projects/{project_id}/required-data-elements")
async def get_required_data_elements(
    project_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Return required data elements from journey_progress.requirementsDocument."""
    try:
        async with get_db_context() as session:
            project = await _check_ownership(session, project_id, current_user)

        jp = project.get("journey_progress") or {}
        requirements_doc = jp.get("requirementsDocument", {})

        # Backward compatibility for legacy shape while preserving new document contract
        required_elements = requirements_doc.get("requiredElements")
        if not required_elements and requirements_doc.get("requiredDataElements"):
            required_elements = [
                {
                    "name": el.get("elementName"),
                    "type": el.get("dataType"),
                    "description": el.get("description"),
                    "priority": "required" if el.get("required", True) else "optional",
                }
                for el in requirements_doc.get("requiredDataElements", [])
            ]

        optional_elements = requirements_doc.get("optionalElements")
        if not optional_elements and requirements_doc.get("optionalDataElements"):
            optional_elements = [
                {
                    "name": el.get("elementName"),
                    "type": el.get("dataType"),
                    "description": el.get("description"),
                }
                for el in requirements_doc.get("optionalDataElements", [])
            ]

        mapped_questions = requirements_doc.get("questionMappings")
        if not mapped_questions and requirements_doc.get("questionAnswerMapping"):
            mapped_questions = [
                {
                    "question": qm.get("questionText"),
                    "requiredColumns": qm.get("requiredDataElements", []),
                    "analysisType": (qm.get("recommendedAnalyses") or ["descriptive_stats"])[0],
                }
                for qm in requirements_doc.get("questionAnswerMapping", [])
            ]

        return ORJSONResponse(content={
            "success": True,
            "projectId": project_id,
            "document": requirements_doc,
            "requiredElements": required_elements or [],
            "optionalElements": optional_elements or [],
            "mappedQuestions": mapped_questions or [],
            "confidenceScore": requirements_doc.get("confidenceScore", 0.0),
            "requirementsLocked": jp.get("requirementsLocked", False),
            "requirementsLockedAt": jp.get("requirementsLockedAt"),
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting required data elements: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get required data elements: {e}")


# ============================================================================
# 12. GET /projects/{project_id}/journey-state
# ============================================================================

@router.get("/projects/{project_id}/journey-state")
async def get_journey_state(
    project_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Return full journey state for the project."""
    try:
        async with get_db_context() as session:
            project = await _check_ownership(session, project_id, current_user)

        jp = project.get("journey_progress") or {}
        execution_state = project.get("execution_state") or {}

        return ORJSONResponse(content={
            "success": True,
            "projectId": project_id,
            "journeyProgress": jp,
            "executionState": execution_state,
            "status": project.get("status", "draft"),
            "journeyType": project.get("journey_type"),
            "currentStep": jp.get("currentStep", "upload"),
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting journey state: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get journey state: {e}")


# ============================================================================
# Router Inclusion Helper
# ============================================================================

def include_project_routes(app):
    """Include project routes in the FastAPI app"""
    app.include_router(router, tags=["projects"])
    logger.info("Project routes included")
