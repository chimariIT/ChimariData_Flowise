"""
Project Routes for Chimaridata Python Backend

Provides REST API endpoints for:
- Project management
- Required data elements
- Project planning
- Cost estimation
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
import logging
import uuid

from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field

from ..auth.middleware import get_current_user, User
from ..db import get_db_context
from ..models.database import Project
from sqlalchemy import select

logger = logging.getLogger(__name__)

# Create router
router = APIRouter()


# ============================================================================
# Request/Response Models
# ============================================================================

class RequiredDataElementsRequest(BaseModel):
    """Request for required data elements"""
    project_id: str = Field(..., description="Project ID")
    journey_type: str = Field(default="non-tech", description="Journey type")
    user_questions: List[str] = Field(default_factory=list, description="User questions")


class RequiredDataElementsResponse(BaseModel):
    """Response with required data elements"""
    project_id: str
    required_elements: List[Dict[str, Any]]
    optional_elements: List[Dict[str, Any]]
    mapped_questions: List[Dict[str, Any]]
    confidence_score: float


class ProjectPlanRequest(BaseModel):
    """Request for project plan"""
    project_id: str = Field(..., description="Project ID")
    journey_type: str = Field(default="non-tech", description="Journey type")
    user_goals: List[str] = Field(default_factory=list, description="User goals")
    user_questions: List[str] = Field(default_factory=list, description="User questions")


class ProjectPlanResponse(BaseModel):
    """Response with project plan"""
    project_id: str
    journey_type: str
    analysis_types: List[str]
    required_steps: List[Dict[str, Any]]
    estimated_duration_minutes: int
    data_requirements: Dict[str, Any]


class CostEstimateRequest(BaseModel):
    """Request for cost estimate"""
    project_id: str = Field(..., description="Project ID")
    analysis_types: List[str] = Field(default_factory=list, description="Analysis types")
    dataset_size: int = Field(default=0, description="Dataset size in rows")


class CostEstimateResponse(BaseModel):
    """Response with cost estimate"""
    project_id: str
    total_cost_cents: int
    breakdown: Dict[str, Any]
    currency: str = "USD"
    is_paid: bool = False
    payment_status: str = "pending"


class AnalysisScenarioRequest(BaseModel):
    """Request for analysis scenario suggestions"""
    project_id: str = Field(..., description="Project ID")
    dataset_id: str = Field(..., description="Dataset ID")
    user_goals: List[str] = Field(default_factory=list, description="User goals")


class CreateProjectRequest(BaseModel):
    """Request to create a new project"""
    user_id: str = Field(..., description="User ID")
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    industry: Optional[str] = None
    journey_type: str = "business"


class CreateProjectResponse(BaseModel):
    """Response after creating project"""
    success: bool
    project_id: str
    name: str
    journey_step: str


class AnalysisScenarioResponse(BaseModel):
    """Response with analysis scenario suggestions"""
    project_id: str
    recommended_scenarios: List[Dict[str, Any]]
    confidence_scores: List[float]


# ============================================================================
# Project Endpoints
# ============================================================================

@router.get("/projects/{project_id}/required-data-elements", response_model=RequiredDataElementsResponse)
async def get_required_data_elements(
    project_id: str,
    journey_type: str = Query("non-tech", description="Journey type"),
    current_user: User = Depends(get_current_user)
):
    """
    Get required data elements for a project based on journey type and questions.

    Analyzes the project's datasets and user questions to determine
    which data elements are required for the analysis.
    """
    try:
        async with get_db_context() as session:
            # Query project
            stmt = select(Project).where(Project.id == project_id)
            result = await session.execute(stmt)
            project = result.scalar_one_or_none()

            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found"
                )

            # Extract requirements from journey_progress (SSOT)
            journey_progress = project.journey_progress or {}
            requirements_doc = journey_progress.get("requirementsDocument", {})

            return RequiredDataElementsResponse(
                project_id=project_id,
                required_elements=requirements_doc.get("requiredElements", []),
                optional_elements=requirements_doc.get("optionalElements", []),
                mapped_questions=requirements_doc.get("questionMappings", []),
                confidence_score=requirements_doc.get("confidenceScore", 0.0)
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting required data elements: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get required data elements: {str(e)}"
        )


@router.get("/projects/{project_id}/plan", response_model=ProjectPlanResponse)
async def get_project_plan(
    project_id: str,
    journey_type: str = Query("non-tech", description="Journey type"),
    current_user: User = Depends(get_current_user)
):
    """
    Get the analysis plan for a project.

    Returns the planned analysis types, required steps, and
    estimated duration based on the journey type.
    """
    try:
        async with get_db_context() as session:
            # Query project
            stmt = select(Project).where(Project.id == project_id)
            result = await session.execute(stmt)
            project = result.scalar_one_or_none()

            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found"
                )

            # Extract plan from journey_progress
            journey_progress = project.journey_progress or {}
            analysis_plan = journey_progress.get("analysisPlan", {})

            return ProjectPlanResponse(
                project_id=project_id,
                journey_type=journey_type,
                analysis_types=analysis_plan.get("analysisTypes", ["descriptive", "correlation"]),
                required_steps=analysis_plan.get("requiredSteps", []),
                estimated_duration_minutes=analysis_plan.get("estimatedDurationMinutes", 5),
                data_requirements=analysis_plan.get("dataRequirements", {})
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting project plan: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get project plan: {str(e)}"
        )


@router.get("/projects/{project_id}/cost-estimate", response_model=CostEstimateResponse)
async def get_cost_estimate(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get cost estimate for a project.

    Returns the estimated cost in cents based on the analysis types
    and dataset size.
    """
    try:
        async with get_db_context() as session:
            # Query project
            stmt = select(Project).where(Project.id == project_id)
            result = await session.execute(stmt)
            project = result.scalar_one_or_none()

            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found"
                )

            # Extract payment info from journey_progress
            journey_progress = project.journey_progress or {}
            payment_info = journey_progress.get("payment", {})
            cost_estimate = journey_progress.get("costEstimate", {})

            return CostEstimateResponse(
                project_id=project_id,
                total_cost_cents=cost_estimate.get("totalCostCents", 0),
                breakdown=cost_estimate.get("breakdown", {
                    "base_analysis": 0,
                    "advanced_analysis": 0,
                    "artifacts": 0
                }),
                currency="USD",
                is_paid=payment_info.get("isPaid", False),
                payment_status=payment_info.get("status", "pending")
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting cost estimate: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get cost estimate: {str(e)}"
        )


@router.post("/projects", response_model=CreateProjectResponse)
async def create_project(
    request: CreateProjectRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Create a new project.

    Creates a project record in the database and initializes
    the journey progress structure.
    """
    try:
        async with get_db_context() as session:
            # Generate project ID
            project_id = str(uuid.uuid4())

            # Create project with initial journey progress
            project = Project(
                id=project_id,
                user_id=request.user_id,
                name=request.name,
                description=request.description,
                industry=request.industry,
                journey_step="upload",
                journey_progress={
                    "journeyType": request.journey_type,
                    "createdAt": datetime.utcnow().isoformat(),
                    "status": "draft"
                },
                created_at=datetime.utcnow()
            )

            session.add(project)
            await session.commit()
            await session.refresh(project)

            return CreateProjectResponse(
                success=True,
                project_id=project.id,
                name=project.name,
                journey_step=project.journey_step or "upload"
            )

    except Exception as e:
        logger.error(f"Error creating project: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create project: {str(e)}"
        )


@router.get("/projects")
async def list_projects(
    user_id: str = Query(..., description="User ID to filter projects"),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user)
):
    """
    List projects for a user.

    Returns all projects belonging to the specified user.
    """
    try:
        async with get_db_context() as session:
            stmt = select(Project).where(
                Project.user_id == user_id
            ).order_by(Project.created_at.desc()).limit(limit)

            result = await session.execute(stmt)
            projects = result.scalars().all()

            return {
                "success": True,
                "projects": [
                    {
                        "id": p.id,
                        "name": p.name,
                        "description": p.description,
                        "industry": p.industry,
                        "journey_step": p.journey_step,
                        "created_at": p.created_at.isoformat() if p.created_at else None
                    }
                    for p in projects
                ],
                "count": len(projects)
            }

    except Exception as e:
        logger.error(f"Error listing projects: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list projects: {str(e)}"
        )


@router.get("/projects/{project_id}")
async def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get a project by ID.

    Returns full project details including journey progress.
    """
    try:
        async with get_db_context() as session:
            stmt = select(Project).where(Project.id == project_id)
            result = await session.execute(stmt)
            project = result.scalar_one_or_none()

            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found"
                )

            return {
                "success": True,
                "project": {
                    "id": project.id,
                    "name": project.name,
                    "description": project.description,
                    "industry": project.industry,
                    "journey_step": project.journey_step,
                    "journey_progress": project.journey_progress,
                    "created_at": project.created_at.isoformat() if project.created_at else None,
                    "updated_at": project.updated_at.isoformat() if project.updated_at else None
                }
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting project: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get project: {str(e)}"
        )


@router.post("/analysis/suggest-scenarios", response_model=AnalysisScenarioResponse)
async def suggest_analysis_scenarios(request: AnalysisScenarioRequest):
    """
    Suggest analysis scenarios based on project data.

    Analyzes the dataset and user goals to recommend appropriate
    analysis scenarios.
    """
    try:
        # TODO: Implement actual scenario suggestion logic
        # For now, return placeholder scenarios
        return AnalysisScenarioResponse(
            project_id=request.project_id,
            recommended_scenarios=[
                {
                    "id": "descriptive",
                    "name": "Descriptive Statistics",
                    "description": "Basic statistical summary",
                    "analysis_types": ["descriptive"]
                },
                {
                    "id": "correlation",
                    "name": "Correlation Analysis",
                    "description": "Explore relationships between variables",
                    "analysis_types": ["correlation"]
                }
            ],
            confidence_scores=[0.9, 0.8]
        )
    except Exception as e:
        logger.error(f"Error suggesting scenarios: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to suggest scenarios: {str(e)}"
        )


# ============================================================================
# Router Inclusion Helper
# ============================================================================

def include_project_routes(app):
    """Include project routes in the FastAPI app"""
    app.include_router(router, tags=["projects"])
    logger.info("Project routes included")
