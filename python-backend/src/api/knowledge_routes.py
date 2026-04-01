"""
Knowledge Base API Routes

Endpoints for knowledge graph, analysis patterns, and template feedback.
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Optional
from ..services.knowledge_service import get_knowledge_service


# ============================================================================
# Request/Response Models
# ============================================================================


class SearchRequest(BaseModel):
    """Request model for knowledge search"""
    query: str = Field(..., min_length=2, description="Search query")
    node_types: Optional[List[str]] = Field(None, description="Filter by node types")
    limit: int = Field(10, ge=1, le=50, description="Maximum results")


class CreatePatternRequest(BaseModel):
    """Request model for creating analysis pattern"""
    name: str = Field(..., description="Pattern name")
    analysis_type: str = Field(..., description="Analysis type (correlation, regression, clustering, etc.)")
    parameters: Optional[dict] = Field(None, description="Typical parameters for this pattern")
    description: Optional[str] = None


class AddFeedbackRequest(BaseModel):
    """Request model for adding template feedback"""
    template_id: str = Field(..., description="Template ID")
    rating: int = Field(..., ge=1, le=5, description="Rating (1-5 stars)")
    feedback_text: str = Field(..., min_length=10, description="User feedback")
    suggested_improvements: Optional[str] = Field(None, description="Suggested improvements")


# ============================================================================
# Router
# ============================================================================

router = APIRouter(prefix="/knowledge", tags=["knowledge"])

# Get singleton knowledge service
knowledge_service = get_knowledge_service()


# ============================================================================
# Knowledge Search Endpoints
# ============================================================================


@router.post("/search", response_model=dict)
async def search_knowledge(request: SearchRequest):
    """
    Search knowledge base for relevant information

    Supports semantic search with embeddings in production.
    Currently uses text matching on node titles.
    """
    try:
        results = await knowledge_service.search_knowledge(
            query=request.query,
            limit=request.limit,
            node_types=request.node_types,
        )

        return {
            "success": True,
            "query": request.query,
            "results": results,
            "count": len(results),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/nodes/{node_id}/related", response_model=dict)
async def get_related_nodes(node_id: str, max_depth: int = 2):
    """
    Get nodes related to a given node via the knowledge graph

    Args:
        node_id: ID of the starting node
        max_depth: Maximum depth to traverse the graph

    Returns:
        Graph of related nodes with relationship information
    """
    try:
        nodes = await knowledge_service.get_related_nodes(node_id, max_depth)

        return {
            "success": True,
            "node_id": node_id,
            "max_depth": max_depth,
            "results": nodes,
            "count": len(nodes),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Analysis Pattern Endpoints
# ============================================================================


@router.get("/patterns/{analysis_type}", response_model=dict)
async def get_analysis_patterns(analysis_type: str, limit: int = 20):
    """
    Get analysis patterns for a specific type

    Args:
        analysis_type: Type of analysis (correlation, regression, clustering, etc.)
        limit: Maximum number of patterns

    Returns:
        List of analysis patterns
    """
    try:
        pattern = await knowledge_service.get_analysis_pattern(analysis_type, limit=limit)

        if not pattern:
            raise HTTPException(status_code=404, detail="Analysis pattern not found")

        return {
            "success": True,
            "data": pattern,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/patterns", status_code=status.HTTP_201_CREATED, response_model=dict)
async def create_analysis_pattern(request: CreatePatternRequest, user_id: str = "system"):
    """
    Create a new analysis pattern

    In production, would automatically create patterns from successful analyses.
    """
    try:
        result = await knowledge_service.learn_from_analysis({
            "name": request.name,
            "analysis_type": request.analysis_type,
            "parameters": request.parameters or {},
            "description": request.description,
        })

        return {
            "success": True,
            "data": result,
            "message": "Analysis pattern created",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/patterns/most-used", response_model=dict)
async def get_most_used_patterns(limit: int = 10):
    """
    Get most frequently used analysis patterns

    Args:
        limit: Maximum number of patterns

    Returns:
        List of most used patterns
    """
    try:
        patterns = await knowledge_service.learn_from_analysis({})

        return {
            "success": True,
            "data": patterns,
            "count": len(patterns),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Template Feedback Endpoints
# ============================================================================


@router.get("/templates/{template_id}/feedback", response_model=dict)
async def get_template_feedback(template_id: str, limit: int = 20):
    """
    Get feedback for a specific template

    Args:
        template_id: ID of the template
        limit: Maximum number of feedback records

    Returns:
        List of feedback records
    """
    try:
        feedback = await knowledge_service.get_template_feedback(template_id, limit)

        return {
            "success": True,
            "template_id": template_id,
            "feedback": feedback,
            "count": len(feedback),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/templates/{template_id}/feedback", response_model=dict)
async def add_feedback(request: AddFeedbackRequest, user_id: str = "system"):
    """
    Add user feedback for a template

    In production, would:
    - Track user satisfaction with templates
    - Suggest improvements based on feedback
    """
    try:
        result = await knowledge_service.add_feedback(
            template_id=request.template_id,
            user_id=user_id,
            rating=request.rating,
            feedback_text=request.feedback_text,
            suggested_improvements=request.suggested_improvements,
        )

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/templates/feedback/helpful", response_model=dict)
async def get_helpful_feedback(limit: int = 20):
    """
    Get helpful feedback for admin review

    Args:
        limit: Maximum number of feedback records

    Returns:
        List of helpful feedback records
    """
    try:
        feedback = await knowledge_service.get_helpful_feedback(limit)

        return {
            "success": True,
            "feedback": feedback,
            "count": len(feedback),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Seeding Endpoints
# ============================================================================


@router.post("/seed", response_model=dict)
async def seed_knowledge_base():
    """
    Seed knowledge base with initial industry knowledge

    In production, would load knowledge from YAML files and create nodes/edges.
    Currently returns placeholder summary.
    """
    try:
        result = await knowledge_service.seed_knowledge_base()

        return {
            "success": True,
            "data": result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def include_knowledge_routes(app):
    """Include knowledge routes in the FastAPI app"""
    from fastapi import FastAPI

    app.include_router(router, prefix="/api/v1")
    return app
