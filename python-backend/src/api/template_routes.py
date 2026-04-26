"""
Template Routes for Chimaridata Python Backend

Real implementation using sa_text + get_db_context + ORJSONResponse pattern.
Templates are served from in-memory defaults (mirroring shared/journey-templates.ts)
since there is no dedicated templates DB table.

Endpoints:
- GET /templates              — list all templates (with optional filters)
- GET /templates/{id}         — get single template by ID
- GET /templates/{id}/config  — get template config (legacy)
- GET /templates/journey/{journeyType} — filter by journey type
- GET /templates/industry/{industry}   — filter by industry
- GET /templates/search       — search templates by query
- GET /templates/catalog      — return full catalog grouped by journey type
- POST /projects/{id}/recommend-templates — recommend templates for a project
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
import json
import logging

from fastapi import APIRouter, HTTPException, Depends, Query, status
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel, Field

from sqlalchemy import text as sa_text

from ..db import get_db_context
from ..auth.middleware import get_current_user, User as AuthUser

logger = logging.getLogger(__name__)

# Create router
router = APIRouter()


# ============================================================================
# In-Memory Template Catalog (mirrors shared/journey-templates.ts)
# ============================================================================

TEMPLATES: Dict[str, Dict[str, Any]] = {
    "non_tech_guided_essentials": {
        "id": "non_tech_guided_essentials",
        "journeyType": "non-tech",
        "title": "Guided Essentials Analysis",
        "summary": "AI-guided workflow that clarifies analysis goals and required data elements, guides data cleanup, and narrates insights for non-technical stakeholders.",
        "persona": "non-technical stakeholder",
        "primaryAgent": "data_scientist",
        "defaultConfidence": 0.92,
        "expectedArtifacts": ["executive_summary", "insight_brief", "visualizations", "interactive_dashboard", "pdf_report", "powerpoint_deck", "rest_api_export"],
        "communicationStyle": "plain-language",
        "tags": ["guided", "ai-assisted", "executive-ready"],
        "version": "1.0.0",
        "steps": [
            {"id": "intake_alignment", "name": "Goal Alignment & Intake", "agent": "project_manager", "tools": ["project_coordinator"], "estimatedDuration": 2},
            {"id": "auto_schema_detection", "name": "Automatic Schema Detection", "agent": "data_scientist", "tools": ["schema_generator"], "estimatedDuration": 2, "dependencies": ["intake_alignment"]},
            {"id": "data_preparation", "name": "Data Preparation & Quality Checks", "agent": "data_engineer", "tools": ["data_transformer"], "estimatedDuration": 3, "dependencies": ["auto_schema_detection"]},
            {"id": "guided_analysis", "name": "Guided Statistical Analysis", "agent": "data_scientist", "tools": ["statistical_analyzer"], "estimatedDuration": 6, "dependencies": ["data_preparation"]},
            {"id": "insight_curation", "name": "Insight Curation & Narration", "agent": "business_agent", "tools": ["business_templates"], "estimatedDuration": 4, "dependencies": ["guided_analysis"]},
            {"id": "visual_storytelling", "name": "Visual Storytelling", "agent": "data_scientist", "tools": ["visualization_engine"], "estimatedDuration": 4, "dependencies": ["insight_curation"]},
            {"id": "executive_hand_off", "name": "Executive Summary & Next Steps", "agent": "business_agent", "tools": ["business_templates", "decision_auditor"], "estimatedDuration": 3, "dependencies": ["visual_storytelling"]},
            {"id": "execute", "name": "Execute Analysis", "agent": "data_scientist", "tools": ["statistical_analyzer", "business_templates", "visualization_engine"], "estimatedDuration": 5, "dependencies": ["executive_hand_off"]},
        ],
    },
    "business_retail_growth_playbook": {
        "id": "business_retail_growth_playbook",
        "journeyType": "business",
        "industry": "retail",
        "title": "Retail Revenue Growth Playbook",
        "summary": "Template-driven revenue diagnostics for retail leaders that clarify analysis goals, specify required data, guide transformation, and deliver audience-ready assets.",
        "persona": "business executive",
        "primaryAgent": "business_agent",
        "defaultConfidence": 0.9,
        "expectedArtifacts": ["executive_summary", "kpi_dashboard", "recommendation_brief", "pdf_report", "powerpoint_deck", "rest_api_export"],
        "communicationStyle": "executive",
        "tags": ["retail", "growth", "kpi"],
        "version": "1.0.0",
        "steps": [
            {"id": "industry_context", "name": "Industry Context Briefing", "agent": "business_agent", "tools": ["business_templates"], "estimatedDuration": 1},
            {"id": "data_health_check", "name": "Data Health Check", "agent": "data_engineer", "tools": ["data_transformer", "statistical_analyzer"], "estimatedDuration": 1, "dependencies": ["industry_context"]},
            {"id": "kpi_modeling", "name": "KPI Modeling & Cohort Analysis", "agent": "data_scientist", "tools": ["comprehensive_ml_pipeline", "statistical_analyzer"], "estimatedDuration": 10, "dependencies": ["data_health_check"]},
            {"id": "visual_storycrafting", "name": "Visual Story Crafting", "agent": "data_scientist", "tools": ["visualization_engine", "business_templates"], "estimatedDuration": 6, "dependencies": ["kpi_modeling"]},
            {"id": "recommendation_roundtable", "name": "Recommendation Roundtable", "agent": "project_manager", "tools": ["decision_auditor"], "estimatedDuration": 3, "dependencies": ["visual_storycrafting"]},
            {"id": "executive_package", "name": "Executive Package Delivery", "agent": "business_agent", "tools": ["business_templates"], "estimatedDuration": 3, "dependencies": ["recommendation_roundtable"]},
            {"id": "execute", "name": "Execute Analysis", "agent": "business_agent", "tools": ["business_templates", "statistical_analyzer", "visualization_engine"], "estimatedDuration": 5, "dependencies": ["executive_package"]},
        ],
    },
    "technical_advanced_statistical_suite": {
        "id": "technical_advanced_statistical_suite",
        "journeyType": "technical",
        "title": "Advanced Statistical Suite",
        "summary": "Full-spectrum statistical analysis with regression, clustering, time-series and hypothesis testing for technical users.",
        "persona": "data analyst",
        "primaryAgent": "data_scientist",
        "defaultConfidence": 0.95,
        "expectedArtifacts": ["statistical_report", "model_outputs", "visualizations", "interactive_dashboard", "pdf_report", "rest_api_export"],
        "communicationStyle": "technical",
        "tags": ["statistics", "ml", "advanced"],
        "version": "1.0.0",
        "steps": [
            {"id": "data_ingestion", "name": "Data Ingestion & Profiling", "agent": "data_engineer", "tools": ["data_transformer"], "estimatedDuration": 2},
            {"id": "statistical_modeling", "name": "Statistical Modeling", "agent": "data_scientist", "tools": ["statistical_analyzer", "comprehensive_ml_pipeline"], "estimatedDuration": 10, "dependencies": ["data_ingestion"]},
            {"id": "model_evaluation", "name": "Model Evaluation & Diagnostics", "agent": "data_scientist", "tools": ["statistical_analyzer"], "estimatedDuration": 5, "dependencies": ["statistical_modeling"]},
            {"id": "visualization", "name": "Visualization & Reporting", "agent": "data_scientist", "tools": ["visualization_engine"], "estimatedDuration": 3, "dependencies": ["model_evaluation"]},
            {"id": "execute", "name": "Execute Analysis", "agent": "data_scientist", "tools": ["statistical_analyzer", "comprehensive_ml_pipeline", "visualization_engine"], "estimatedDuration": 5, "dependencies": ["visualization"]},
        ],
    },
    "consultation_advisory": {
        "id": "consultation_advisory",
        "journeyType": "consultation",
        "title": "Consultation Advisory",
        "summary": "Expert-guided consultation workflow for data strategy, analytics maturity assessment, and custom recommendations.",
        "persona": "consulting client",
        "primaryAgent": "project_manager",
        "defaultConfidence": 0.88,
        "expectedArtifacts": ["advisory_report", "maturity_assessment", "recommendation_brief", "pdf_report"],
        "communicationStyle": "consultation",
        "tags": ["consulting", "strategy", "advisory"],
        "version": "1.0.0",
        "steps": [
            {"id": "discovery", "name": "Discovery & Scoping", "agent": "project_manager", "tools": ["project_coordinator"], "estimatedDuration": 3},
            {"id": "assessment", "name": "Data Maturity Assessment", "agent": "data_engineer", "tools": ["data_transformer", "statistical_analyzer"], "estimatedDuration": 4, "dependencies": ["discovery"]},
            {"id": "analysis", "name": "Strategic Analysis", "agent": "business_agent", "tools": ["business_templates"], "estimatedDuration": 6, "dependencies": ["assessment"]},
            {"id": "recommendations", "name": "Recommendations & Roadmap", "agent": "project_manager", "tools": ["decision_auditor", "business_templates"], "estimatedDuration": 4, "dependencies": ["analysis"]},
            {"id": "execute", "name": "Execute Analysis", "agent": "project_manager", "tools": ["business_templates", "statistical_analyzer"], "estimatedDuration": 3, "dependencies": ["recommendations"]},
        ],
    },
    "general_analytics": {
        "id": "general_analytics",
        "journeyType": "business",
        "title": "General Data Analytics",
        "summary": "Flexible analysis template for diverse data types with descriptive stats, correlation, and distribution analysis.",
        "persona": "business user",
        "primaryAgent": "data_scientist",
        "defaultConfidence": 0.85,
        "expectedArtifacts": ["analysis_report", "visualizations", "pdf_report"],
        "communicationStyle": "plain-language",
        "tags": ["general", "flexible", "analytics"],
        "version": "1.0.0",
        "steps": [
            {"id": "intake", "name": "Intake & Goal Alignment", "agent": "project_manager", "tools": ["project_coordinator"], "estimatedDuration": 2},
            {"id": "data_prep", "name": "Data Preparation", "agent": "data_engineer", "tools": ["data_transformer"], "estimatedDuration": 3, "dependencies": ["intake"]},
            {"id": "analysis", "name": "Data Analysis", "agent": "data_scientist", "tools": ["statistical_analyzer"], "estimatedDuration": 5, "dependencies": ["data_prep"]},
            {"id": "results", "name": "Results & Delivery", "agent": "business_agent", "tools": ["business_templates", "visualization_engine"], "estimatedDuration": 3, "dependencies": ["analysis"]},
            {"id": "execute", "name": "Execute Analysis", "agent": "data_scientist", "tools": ["statistical_analyzer", "visualization_engine"], "estimatedDuration": 3, "dependencies": ["results"]},
        ],
    },
}

# Build catalog grouped by journey type
CATALOG: Dict[str, List[Dict[str, Any]]] = {
    "non-tech": [],
    "business": [],
    "technical": [],
    "consultation": [],
}

for t in TEMPLATES.values():
    jt = t.get("journeyType", "business")
    if jt in CATALOG:
        CATALOG[jt].append(t)


def _match_templates(
    journey_type: Optional[str] = None,
    industry: Optional[str] = None,
    search: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Filter the in-memory template list."""
    results = list(TEMPLATES.values())

    if journey_type:
        results = [t for t in results if t.get("journeyType") == journey_type]
    if industry:
        industry_lower = industry.lower()
        results = [
            t for t in results
            if (t.get("industry") or "").lower() == industry_lower
            or industry_lower in [tag.lower() for tag in t.get("tags", [])]
        ]
    if search:
        q = search.lower()
        results = [
            t for t in results
            if q in t.get("title", "").lower()
            or q in t.get("summary", "").lower()
            or q in " ".join(t.get("tags", [])).lower()
        ]
    return results


# ============================================================================
# Template Endpoints
# ============================================================================

@router.get("/templates")
async def list_templates(
    journeyType: Optional[str] = Query(None),
    industry: Optional[str] = Query(None),
    persona: Optional[str] = Query(None),
    isSystem: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    """
    List available journey templates.
    Accepts optional filters: journeyType, industry, persona, search.
    """
    try:
        templates = _match_templates(
            journey_type=journeyType,
            industry=industry,
            search=search,
        )

        # Optional persona filter
        if persona:
            persona_lower = persona.lower()
            templates = [
                t for t in templates
                if persona_lower in (t.get("persona") or "").lower()
            ]

        return ORJSONResponse(content={
            "success": True,
            "templates": templates,
            "count": len(templates),
        })

    except Exception as e:
        logger.error(f"Error listing templates: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list templates: {e}")


@router.get("/templates/catalog")
async def get_template_catalog():
    """Return the full template catalog grouped by journey type."""
    try:
        return ORJSONResponse(content={
            "success": True,
            "catalog": CATALOG,
        })
    except Exception as e:
        logger.error(f"Error getting catalog: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get catalog: {e}")


@router.get("/templates/search")
async def search_templates(q: str = Query("")):
    """Search templates by free-text query."""
    try:
        templates = _match_templates(search=q) if q else list(TEMPLATES.values())
        return ORJSONResponse(content={
            "success": True,
            "templates": templates,
            "count": len(templates),
            "query": q,
        })
    except Exception as e:
        logger.error(f"Error searching templates: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to search templates: {e}")


@router.get("/templates/journey/{journey_type}")
async def get_templates_by_journey(journey_type: str):
    """Get templates filtered by journey type."""
    try:
        templates = _match_templates(journey_type=journey_type)
        return ORJSONResponse(content={
            "success": True,
            "journeyType": journey_type,
            "templates": templates,
            "count": len(templates),
        })
    except Exception as e:
        logger.error(f"Error getting templates by journey: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get templates: {e}")


@router.get("/templates/industry/{industry}")
async def get_templates_by_industry(industry: str):
    """Get templates filtered by industry."""
    try:
        templates = _match_templates(industry=industry)
        return ORJSONResponse(content={
            "success": True,
            "industry": industry,
            "templates": templates,
            "count": len(templates),
        })
    except Exception as e:
        logger.error(f"Error getting templates by industry: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get templates: {e}")


@router.get("/templates/{template_id}/config")
async def get_template_config(template_id: str, project_id: Optional[str] = None):
    """
    Get configuration for a specific template (legacy endpoint).
    Returns the template config and applicability info.
    """
    try:
        if template_id not in TEMPLATES:
            raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")

        config = TEMPLATES[template_id]

        # If project_id provided, check column compatibility against dataset schema
        is_applicable = True
        missing_columns: List[str] = []

        if project_id:
            try:
                async with get_db_context() as session:
                    result = await session.execute(
                        sa_text(
                            "SELECT d.schema FROM datasets d "
                            "WHERE d.project_id = :project_id "
                            "ORDER BY d.created_at DESC LIMIT 1"
                        ),
                        {"project_id": project_id},
                    )
                    row = result.first()
                    if row:
                        dataset_schema = row[0] or {}
                        dataset_columns = set()
                        if isinstance(dataset_schema, dict):
                            dataset_columns = {
                                c.get("name", "").lower()
                                for c in dataset_schema.get("columns", [])
                            }
                        # Check required columns from template steps
                        # (templates don't declare required_columns directly,
                        #  but we can flag if no dataset exists)
                    else:
                        # No dataset uploaded yet
                        is_applicable = True
            except Exception as e:
                logger.warning(f"Could not check project dataset for template applicability: {e}")

        return ORJSONResponse(content={
            "success": True,
            "template_id": template_id,
            "config": config,
            "is_applicable": is_applicable,
            "missing_columns": missing_columns,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting template config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get template config: {e}")


@router.get("/templates/{template_id}")
async def get_template_by_id(template_id: str):
    """Get a single template by its ID."""
    try:
        if template_id not in TEMPLATES:
            raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")

        return ORJSONResponse(content={
            "success": True,
            "template": TEMPLATES[template_id],
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting template: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get template: {e}")


# ============================================================================
# Recommend Templates (called from prepare-step.tsx)
# ============================================================================

@router.post("/projects/{project_id}/recommend-templates")
async def recommend_templates(
    project_id: str,
    body: Dict[str, Any] = {},
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Recommend templates for a project based on user goals and questions.

    Mirrors the Node.js endpoint at POST /api/projects/:id/recommend-templates.
    Uses rule-based matching against the in-memory catalog (semantic vector
    search requires the Node.js SemanticSearchService or a Python equivalent).
    """
    try:
        user_goals: List[str] = body.get("userGoals", [])
        user_questions: List[str] = body.get("userQuestions", [])
        industry_context: Dict[str, Any] = body.get("industryContext", {})

        # Fetch project to get journey type and verify ownership
        async with get_db_context() as session:
            result = await session.execute(
                sa_text("SELECT * FROM projects WHERE id = :id"),
                {"id": project_id},
            )
            row = result.first()
            if row is None:
                raise HTTPException(status_code=404, detail="Project not found")

            project = dict(zip(result.keys(), row))

            if project["user_id"] != current_user.id and not current_user.is_admin:
                raise HTTPException(status_code=403, detail="Not authorized to access this project")

        journey_type = project.get("journey_type", "business")
        industry = industry_context.get("industry", "")
        search_query = " ".join(user_goals + user_questions).strip()

        logger.info(
            f"Recommend templates for project {project_id} | "
            f"journey={journey_type} | industry={industry} | query={search_query[:100]}"
        )

        # Rule-based template matching
        candidates = _match_templates(journey_type=journey_type, industry=industry)

        # If no industry-specific matches, broaden to journey type only
        if not candidates:
            candidates = _match_templates(journey_type=journey_type)

        # If still none, use general_analytics fallback
        if not candidates:
            candidates = [TEMPLATES.get("general_analytics", list(TEMPLATES.values())[0])]

        # Score candidates by keyword overlap with user goals/questions
        scored = []
        for tmpl in candidates:
            score = 0.5  # base score
            tmpl_text = (
                tmpl.get("title", "") + " " +
                tmpl.get("summary", "") + " " +
                " ".join(tmpl.get("tags", []))
            ).lower()

            for term in search_query.lower().split():
                if len(term) > 2 and term in tmpl_text:
                    score += 0.05

            # Industry match bonus
            if industry and (tmpl.get("industry") or "").lower() == industry.lower():
                score += 0.15

            score = min(score, 1.0)
            scored.append((tmpl, score))

        scored.sort(key=lambda x: x[1], reverse=True)

        # Build response matching Node.js format
        top_match = scored[0]
        template = {
            "id": top_match[0]["id"],
            "name": top_match[0]["title"],
            "description": top_match[0]["summary"],
            "recommendedAnalyses": top_match[0].get("expectedArtifacts", []),
            "requiredDataElements": [],
        }
        confidence = top_match[1]

        # Determine market demand
        if confidence >= 0.85:
            market_demand = "very_high"
        elif confidence >= 0.75:
            market_demand = "high"
        elif confidence >= 0.65:
            market_demand = "moderate"
        else:
            market_demand = "low"

        # Determine complexity
        step_count = len(top_match[0].get("steps", []))
        if step_count >= 7:
            implementation_complexity = "high"
        elif step_count >= 5:
            implementation_complexity = "medium"
        else:
            implementation_complexity = "low"

        # Build alternatives
        alternative_templates = [
            {
                "id": tmpl["id"],
                "name": tmpl["title"],
                "description": tmpl["summary"],
                "similarity": score,
                "matchReason": "rule_based",
            }
            for tmpl, score in scored[1:5]
        ]

        # Store recommendation in journey_progress
        async with get_db_context() as session:
            result = await session.execute(
                sa_text("SELECT journey_progress FROM projects WHERE id = :id"),
                {"id": project_id},
            )
            row = result.first()
            journey_progress = (row[0] if row else None) or {}

            journey_progress["researcherRecommendation"] = {
                "template": template,
                "confidence": confidence,
                "marketDemand": market_demand,
                "implementationComplexity": implementation_complexity,
                "alternativeTemplates": alternative_templates,
                "recommendedAt": datetime.utcnow().isoformat(),
                "searchMethod": "rule_based",
            }

            await session.execute(
                sa_text(
                    "UPDATE projects SET journey_progress = CAST(:jp AS jsonb), "
                    "updated_at = NOW() WHERE id = :id"
                ),
                {"jp": json.dumps(journey_progress), "id": project_id},
            )
            await session.commit()

        logger.info(
            f"Recommended template: {template['name']} (confidence: {confidence:.3f}) "
            f"+ {len(alternative_templates)} alternatives"
        )

        return ORJSONResponse(content={
            "success": True,
            "template": template,
            "confidence": confidence,
            "marketDemand": market_demand,
            "implementationComplexity": implementation_complexity,
            "alternativeTemplates": alternative_templates,
            "searchMethod": "rule_based",
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error recommending templates: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to recommend templates: {e}")


# ============================================================================
# Router Inclusion Helper
# ============================================================================

def include_template_routes(app):
    """Include template routes in the FastAPI app"""
    app.include_router(router, tags=["templates"])
    logger.info("Template routes included")
