"""
Template Routes for Chimaridata Python Backend

Provides REST API endpoints for:
- Journey template management
- Template configuration
- Template application
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
import logging

from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Create router
router = APIRouter()


# ============================================================================
# Request/Response Models
# ============================================================================

class TemplateConfig(BaseModel):
    """Template configuration"""
    template_id: str
    name: str
    journey_type: str
    description: str
    analysis_types: List[str]
    required_columns: List[str]
    optional_columns: List[str]
    default_parameters: Dict[str, Any]
    steps: List[Dict[str, Any]]


class TemplateConfigResponse(BaseModel):
    """Response with template configuration"""
    template_id: str
    config: TemplateConfig
    is_applicable: bool
    missing_columns: List[str]


class TemplateListResponse(BaseModel):
    """Response with available templates"""
    journey_type: str
    templates: List[TemplateConfig]


class ApplyTemplateRequest(BaseModel):
    """Request to apply a template to a project"""
    project_id: str = Field(..., description="Project ID")
    template_id: str = Field(..., description="Template ID")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Override parameters")


class ApplyTemplateResponse(BaseModel):
    """Response after applying template"""
    project_id: str
    template_id: str
    applied: bool
    journey_state: Dict[str, Any]
    warnings: List[str]


# ============================================================================
# Template Definitions (In-memory for now, should be in database)
# ============================================================================

TEMPLATES: Dict[str, TemplateConfig] = {
    "hr-engagement": TemplateConfig(
        template_id="hr-engagement",
        name="HR Engagement Analysis",
        journey_type="business",
        description="Analyze employee engagement survey data",
        analysis_types=["descriptive", "correlation", "clustering"],
        required_columns=["employee_id", "department", "engagement_score"],
        optional_columns=["tenure", "salary", "manager_id", "location"],
        default_parameters={
            "target_column": "engagement_score",
            "group_by": ["department"]
        },
        steps=[
            {"step": "upload", "name": "Upload Data"},
            {"step": "verify", "name": "Verify Data"},
            {"step": "transform", "name": "Transform Data"},
            {"step": "analyze", "name": "Run Analysis"},
            {"step": "results", "name": "View Results"}
        ]
    ),
    "sales-performance": TemplateConfig(
        template_id="sales-performance",
        name="Sales Performance Analysis",
        journey_type="business",
        description="Analyze sales team performance metrics",
        analysis_types=["descriptive", "regression", "time_series"],
        required_columns=["salesperson_id", "revenue", "period"],
        optional_columns=["region", "product", "quota", "calls_made"],
        default_parameters={
            "target_column": "revenue",
            "time_column": "period"
        },
        steps=[
            {"step": "upload", "name": "Upload Data"},
            {"step": "verify", "name": "Verify Data"},
            {"step": "transform", "name": "Transform Data"},
            {"step": "analyze", "name": "Run Analysis"},
            {"step": "results", "name": "View Results"}
        ]
    ),
    "customer-satisfaction": TemplateConfig(
        template_id="customer-satisfaction",
        name="Customer Satisfaction Analysis",
        journey_type="business",
        description="Analyze customer satisfaction survey responses",
        analysis_types=["descriptive", "sentiment", "clustering"],
        required_columns=["customer_id", "satisfaction_score"],
        optional_columns=["feedback_text", "category", "nps_score"],
        default_parameters={
            "target_column": "satisfaction_score"
        },
        steps=[
            {"step": "upload", "name": "Upload Data"},
            {"step": "verify", "name": "Verify Data"},
            {"step": "transform", "name": "Transform Data"},
            {"step": "analyze", "name": "Run Analysis"},
            {"step": "results", "name": "View Results"}
        ]
    )
}


# ============================================================================
# Template Endpoints
# ============================================================================

@router.get("/templates/{template_id}/config", response_model=TemplateConfigResponse)
async def get_template_config(template_id: str, project_id: Optional[str] = None):
    """
    Get configuration for a specific template.

    Returns the template configuration and checks if it's applicable
    to the given project (if project_id is provided).
    """
    try:
        if template_id not in TEMPLATES:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Template '{template_id}' not found"
            )

        config = TEMPLATES[template_id]

        # For now, always say it's applicable
        # TODO: Check project schema against required columns
        is_applicable = True
        missing_columns = []

        return TemplateConfigResponse(
            template_id=template_id,
            config=config,
            is_applicable=is_applicable,
            missing_columns=missing_columns
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting template config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get template config: {str(e)}"
        )


@router.get("/templates", response_model=TemplateListResponse)
async def list_templates(journey_type: Optional[str] = None):
    """
    List available journey templates.

    Returns all templates or filters by journey type.
    """
    try:
        templates = list(TEMPLATES.values())

        if journey_type:
            templates = [t for t in templates if t.journey_type == journey_type]

        return TemplateListResponse(
            journey_type=journey_type or "all",
            templates=templates
        )

    except Exception as e:
        logger.error(f"Error listing templates: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list templates: {str(e)}"
        )


@router.post("/projects/{project_id}/templates/{template_id}/apply", response_model=ApplyTemplateResponse)
async def apply_template(project_id: str, template_id: str, request: ApplyTemplateRequest = None):
    """
    Apply a journey template to a project.

    Configures the project with the template's analysis types,
    steps, and parameters.
    """
    try:
        if template_id not in TEMPLATES:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Template '{template_id}' not found"
            )

        config = TEMPLATES[template_id]

        # TODO: Apply template to project in database
        # This would involve:
        # 1. Setting journey type
        # 2. Configuring analysis types
        # 3. Setting up step sequence
        # 4. Storing template parameters

        warnings = []

        return ApplyTemplateResponse(
            project_id=project_id,
            template_id=template_id,
            applied=True,
            journey_state={
                "journey_type": config.journey_type,
                "analysis_types": config.analysis_types,
                "steps": config.steps,
                "parameters": config.default_parameters
            },
            warnings=warnings
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error applying template: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to apply template: {str(e)}"
        )


# ============================================================================
# Router Inclusion Helper
# ============================================================================

def include_template_routes(app):
    """Include template routes in the FastAPI app"""
    app.include_router(router, tags=["templates"])
    logger.info("Template routes included")
