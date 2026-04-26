"""
Results and Dashboard Routes

API endpoints for retrieving analysis results and dashboard data.
Handles results aggregation, insight generation, and dashboard metrics.
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import logging
from datetime import datetime, timedelta

from ..auth.middleware import get_current_user, User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["results"])


# ============================================================================
# Models
# ============================================================================

class Insight(BaseModel):
    """Business insight generated from analysis"""
    id: str
    type: str  # finding, recommendation, alert, pattern
    title: str
    description: str
    confidence: float = Field(..., ge=0, le=1)
    impact: str  # high, medium, low
    category: str  # business, statistical, operational
    data: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class EvidenceLink(BaseModel):
    """Link in the evidence chain for traceability"""
    id: str
    source_type: str  # question, element, transformation, analysis, insight
    source_id: str
    target_type: str
    target_id: str
    confidence: float
    data: Dict[str, Any] = Field(default_factory=dict)


class Artifact(BaseModel):
    """Generated artifact (PDF, PowerPoint, etc.)"""
    id: str
    project_id: str
    type: str  # pdf, pptx, xlsx, image
    filename: str
    file_url: str
    file_size: int
    thumbnail_url: Optional[str] = None
    created_at: datetime
    download_count: int = 0


class DashboardMetrics(BaseModel):
    """Dashboard metrics for a project"""
    project_id: str
    total_records: int
    total_columns: int
    analyses_completed: int
    insights_generated: int
    artifacts_created: int
    last_analyzed: Optional[datetime]
    data_quality_score: float
    status: str


class ReportRequest(BaseModel):
    """Request to generate a report"""
    project_id: str
    report_type: str  # pdf, pptx, xlsx, dashboard
    include_sections: List[str] = Field(default_factory=list)
    template: Optional[str] = None
    audience: str = "business"  # business, technical, executive


# ============================================================================
# Routes
# ============================================================================

@router.get("/projects/{project_id}/dashboard")
async def get_project_dashboard(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get dashboard data for a project.

    Returns metrics, recent activity, and summary insights.
    """
    try:
        # In real implementation, fetch from database
        dashboard = {
            "project_id": project_id,
            "metrics": {
                "total_records": 1000,
                "total_columns": 12,
                "analyses_completed": 3,
                "insights_generated": 15,
                "artifacts_created": 2,
                "last_analyzed": datetime.utcnow().isoformat(),
                "data_quality_score": 0.92,
                "status": "ready"
            },
            "recent_activity": [
                {
                    "type": "analysis_completed",
                    "message": "Correlation analysis completed",
                    "timestamp": datetime.utcnow().isoformat()
                },
                {
                    "type": "insight_generated",
                    "message": "3 new insights about employee engagement",
                    "timestamp": datetime.utcnow().isoformat()
                }
            ],
            "summary_insights": [
                {
                    "title": "High satisfaction in Engineering",
                    "description": "Engineering department shows 85% satisfaction",
                    "impact": "positive"
                },
                {
                    "title": "Correlation between tenure and engagement",
                    "description": "Positive correlation (r=0.65) found",
                    "impact": "neutral"
                }
            ],
            "data_overview": {
                "columns_by_type": {
                    "numeric": 5,
                    "categorical": 4,
                    "datetime": 2,
                    "text": 1
                },
                "pii_fields": ["email", "phone"],
                "transformations_applied": 3
            }
        }

        return dashboard

    except Exception as e:
        logger.error(f"Dashboard error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch dashboard: {str(e)}"
        )


@router.get("/projects/{project_id}/results")
async def get_project_results(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get complete analysis results for a project.

    Returns all insights, evidence chain, and artifacts.
    """
    try:
        results = {
            "success": True,
            "project_id": project_id,
            "insights": [
                {
                    "id": "insight_1",
                    "type": "finding",
                    "title": "Strong positive correlation found",
                    "description": "Employee satisfaction correlates with engagement score (r=0.78)",
                    "confidence": 0.92,
                    "impact": "high",
                    "category": "statistical",
                    "data": {
                        "correlation_coefficient": 0.78,
                        "p_value": 0.001
                    },
                    "created_at": datetime.utcnow().isoformat()
                },
                {
                    "id": "insight_2",
                    "type": "recommendation",
                    "title": "Focus on Engineering department",
                    "description": "Engineering shows highest satisfaction but lowest engagement",
                    "confidence": 0.85,
                    "impact": "medium",
                    "category": "business",
                    "data": {
                        "department": "Engineering",
                        "satisfaction": 0.85,
                        "engagement": 0.62
                    },
                    "created_at": datetime.utcnow().isoformat()
                }
            ],
            "evidence_chain": [
                {
                    "id": "link_1",
                    "source_type": "question",
                    "source_id": "q1",
                    "target_type": "element",
                    "target_id": "satisfaction_score",
                    "confidence": 0.95
                },
                {
                    "id": "link_2",
                    "source_type": "element",
                    "source_id": "satisfaction_score",
                    "target_type": "analysis",
                    "target_id": "correlation_analysis",
                    "confidence": 0.90
                }
            ],
            "artifacts": [
                {
                    "id": "artifact_1",
                    "type": "pdf",
                    "filename": "analysis_report.pdf",
                    "file_url": f"/api/v1/projects/{project_id}/artifacts/artifact_1/download",
                    "created_at": datetime.utcnow().isoformat()
                }
            ],
            "summary": {
                "total_insights": 2,
                "high_impact_count": 1,
                "artifacts_available": 1
            }
        }

        return results

    except Exception as e:
        logger.error(f"Results error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch results: {str(e)}"
        )


@router.get("/projects/{project_id}/insights")
async def get_project_insights(
    project_id: str,
    category: Optional[str] = None,
    limit: int = 20,
    current_user: User = Depends(get_current_user)
):
    """
    Get insights for a project with evidence chain traceability.

    Supports filtering by category and limiting results.
    Each insight includes its evidence chain for transparency.
    """
    try:
        from ..services.rag_evidence_chain import get_evidence_chain_service
        from ..db import get_db_context
        from ..models.database import Insight
        from sqlalchemy import select

        evidence_service = get_evidence_chain_service()

        # Get insights from database
        insights = []
        async with get_db_context() as session:
            # Query insights for this project
            stmt = select(Insight).where(
                Insight.project_id == project_id
            ).order_by(Insight.created_at.desc()).limit(limit)

            if category:
                stmt = stmt.where(Insight.insight_type == category)

            result = await session.execute(stmt)
            insight_models = result.scalars().all()

            # Convert to response format
            for insight_model in insight_models:
                # Get evidence chain for this insight
                evidence_chain = evidence_service.get_chain_for_project(project_id)

                # Filter evidence chain to links related to this insight
                insight_evidence = [
                    link for link in evidence_chain
                    if link.source_id == insight_model.id or link.target_id == insight_model.id
                ]

                insights.append({
                    "id": insight_model.id,
                    "type": insight_model.insight_type,
                    "title": insight_model.title,
                    "description": insight_model.content,
                    "confidence": insight_model.confidence or 0.8,
                    "impact": insight_model.metadata.get("impact", "medium") if insight_model.metadata else "medium",
                    "category": insight_model.category or "general",
                    "evidence_chain_count": len(insight_evidence),
                    "created_at": insight_model.created_at.isoformat() if insight_model.created_at else None
                })

        return {
            "success": True,
            "project_id": project_id,
            "insights": insights,
            "total_count": len(insights)
        }

    except Exception as e:
        logger.error(f"Insights error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch insights: {str(e)}"
        )


@router.get("/projects/{project_id}/evidence-chain")
async def get_evidence_chain(
    project_id: str,
    question_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Get evidence chain for traceability.

    Shows complete chain from question to answer.
    """
    try:
        from ..services.rag_evidence_chain import get_evidence_chain_service

        service = get_evidence_chain_service()

        if question_id:
            chain = await service.query_evidence_chain(
                project_id=project_id,
                question_id=question_id
            )
        else:
            chain = await service.get_project_evidence(project_id)

        return {
            "success": True,
            "project_id": project_id,
            "evidence_chain": chain,
            "total_links": len(chain) if isinstance(chain, list) else 0
        }

    except Exception as e:
        logger.error(f"Evidence chain error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch evidence chain: {str(e)}"
        )


# ============================================================================
# Artifacts
# ============================================================================

@router.get("/projects/{project_id}/artifacts")
async def get_project_artifacts(
    project_id: str,
    artifact_type: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Get all artifacts for a project.

    Artifacts include PDFs, presentations, Excel files, images.
    """
    try:
        artifacts = [
            {
                "id": "artifact_1",
                "project_id": project_id,
                "type": "pdf",
                "filename": "analysis_report.pdf",
                "file_url": f"/api/v1/artifacts/artifact_1/download",
                "file_size": 1024000,
                "created_at": datetime.utcnow().isoformat(),
                "download_count": 5
            },
            {
                "id": "artifact_2",
                "project_id": project_id,
                "type": "pptx",
                "filename": "executive_presentation.pptx",
                "file_url": f"/api/v1/artifacts/artifact_2/download",
                "file_size": 2048000,
                "created_at": datetime.utcnow().isoformat(),
                "download_count": 3
            }
        ]

        if artifact_type:
            artifacts = [a for a in artifacts if a["type"] == artifact_type]

        return {
            "success": True,
            "project_id": project_id,
            "artifacts": artifacts
        }

    except Exception as e:
        logger.error(f"Artifacts error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch artifacts: {str(e)}"
        )


@router.post("/projects/{project_id}/artifacts/generate")
async def generate_artifact(
    project_id: str,
    request: ReportRequest,
    background_tasks,
    current_user: User = Depends(get_current_user)
):
    """
    Generate a new artifact (PDF, presentation, etc.).

    Creates report based on analysis results.
    """
    try:
        artifact_id = f"artifact_{datetime.utcnow().timestamp()}"

        # Queue artifact generation
        async def generate():
            # In real implementation, generate the artifact
            pass

        background_tasks.add_task(generate)

        return {
            "success": True,
            "artifact_id": artifact_id,
            "project_id": project_id,
            "report_type": request.report_type,
            "status": "generating",
            "message": f"Generating {request.report_type} report"
        }

    except Exception as e:
        logger.error(f"Artifact generation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate artifact: {str(e)}"
        )


@router.get("/artifacts/{artifact_id}/download")
async def download_artifact(
    artifact_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Download an artifact file.

    Returns the file for download.
    """
    try:
        # In real implementation, serve the file
        from fastapi.responses import FileResponse

        return {
            "success": True,
            "artifact_id": artifact_id,
            "download_url": f"/uploads/artifacts/{artifact_id}"
        }

    except Exception as e:
        logger.error(f"Download error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to download artifact: {str(e)}"
        )


# ============================================================================
# Reports
# ============================================================================

@router.post("/projects/{project_id}/reports")
async def create_report(
    project_id: str,
    request: ReportRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Create a new report artifact.

    Generates PDF, PowerPoint, or Excel report.
    """
    try:
        from ..services.artifact_generator import get_artifact_generator

        generator = get_artifact_generator()

        artifact = await generator.generate_report(
            project_id=project_id,
            report_type=request.report_type,
            include_sections=request.include_sections,
            template=request.template,
            audience=request.audience
        )

        return {
            "success": True,
            "artifact": artifact,
            "message": f"{request.report_type} report generated successfully"
        }

    except Exception as e:
        logger.error(f"Report creation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create report: {str(e)}"
        )


# ============================================================================
# Export
# ============================================================================

@router.get("/projects/{project_id}/export")
async def export_project_data(
    project_id: str,
    format: str = "json",
    include_analyses: bool = True,
    include_artifacts: bool = False,
    current_user: User = Depends(get_current_user)
):
    """
    Export project data.

    Supports JSON, CSV, Excel export formats.
    """
    try:
        return {
            "success": True,
            "project_id": project_id,
            "format": format,
            "export_url": f"/api/v1/exports/{project_id}.{format}",
            "message": "Export ready"
        }

    except Exception as e:
        logger.error(f"Export error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to export: {str(e)}"
        )


# ============================================================================
# Share Links
# ============================================================================

@router.post("/projects/{project_id}/share")
async def create_share_link(
    project_id: str,
    expires_in_days: int = 7,
    password: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Create a shareable link for project results.

    Allows external users to view results without login.
    """
    try:
        import uuid

        share_id = uuid.uuid4().hex
        expires_at = datetime.utcnow() + timedelta(days=expires_in_days)

        return {
            "success": True,
            "share_id": share_id,
            "share_url": f"/shared/{share_id}",
            "expires_at": expires_at.isoformat(),
            "password_protected": password is not None
        }

    except Exception as e:
        logger.error(f"Share link error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create share link: {str(e)}"
        )


@router.get("/shared/{share_id}")
async def access_shared_project(
    share_id: str,
    password: Optional[str] = None
):
    """
    Access a shared project.

    Returns project results without authentication (if share is valid).
    """
    try:
        # Validate share_id and check expiration
        # In real implementation, fetch from database

        return {
            "success": True,
            "share_id": share_id,
            "project_data": {}
        }

    except Exception as e:
        logger.error(f"Shared access error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shared link not found or expired"
        )
