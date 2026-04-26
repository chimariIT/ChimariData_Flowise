"""
Semantic Mapping Routes

API endpoints for semantic question-to-element mapping.
Uses vector embeddings and LangChain for intelligent matching.
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import logging
from datetime import datetime
import uuid
import hashlib

from ..auth.middleware import get_current_user, User
from ..services.semantic_matching import (
    get_question_element_mappings,
    select_analysis_types_for_questions,
    get_semantic_matcher,
    SemanticConfig
)
from ..db import get_db_context
from ..models.database import QuestionMapping, ColumnEmbedding, Project, Dataset
from sqlalchemy import select, delete, func

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/semantic", tags=["semantic"])  # /semantic/* routes


# ============================================================================
# Models
# ============================================================================

class QuestionElementMapping(BaseModel):
    """Mapping from question to data element"""
    question_id: str
    question_text: str
    element_id: str
    element_name: str
    confidence: float
    semantic_similarity: float
    business_relevance: float
    transformation_hints: List[str] = Field(default_factory=list)


class GenerateEmbeddingsRequest(BaseModel):
    """Request to generate embeddings for dataset columns"""
    project_id: str
    dataset_id: str
    columns: List[Dict[str, Any]]


class SelectAnalysesRequest(BaseModel):
    """Request to select analysis types based on questions"""
    questions: List[str]
    mappings: List[Dict[str, Any]]
    user_goals: List[str] = Field(default_factory=list)


class MapQuestionsRequest(BaseModel):
    """Request to map questions to data elements"""
    project_id: str
    questions: List[str] = Field(..., description="User questions to map")
    datasets: List[str] = Field(default_factory=list, description="Dataset IDs to search")
    user_goals: List[str] = Field(default_factory=list, description="User analysis goals")
    threshold: float = Field(default=0.7, ge=0, le=1, description="Minimum similarity threshold")


# ============================================================================
# Routes
# ============================================================================

@router.post("/map-questions", response_model=Dict[str, Any])
async def map_questions_to_elements(
    request: MapQuestionsRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Map user questions to data elements using semantic matching.

    Uses vector embeddings and cosine similarity to find the most relevant
    data elements (columns) for each user question.

    This is a core part of the U2A2A2U pipeline, connecting user intent
    to actual data columns.
    """
    try:
        async with get_db_context() as session:
            # Verify project ownership
            project_stmt = select(Project).where(
                Project.id == request.project_id,
                Project.user_id == current_user.id
            )
            project_result = await session.execute(project_stmt)
            project = project_result.scalar_one_or_none()

            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found"
                )

        mappings = await get_question_element_mappings(
            questions=request.questions,
            datasets=request.datasets,
            user_goals=request.user_goals
        )

        # Convert to dict format
        mappings_dict = [
            m.dict() if hasattr(m, 'dict') else m
            for m in mappings
        ]

        # Store mappings in database
        async with get_db_context() as session:
            # Generate stable question IDs using SHA-256 hash
            for mapping in mappings_dict:
                question_text = mapping.get('question_text', '')
                question_id = hashlib.sha256(question_text.encode()).hexdigest()[:64]

                # Check if mapping already exists
                existing_stmt = select(QuestionMapping).where(
                    QuestionMapping.project_id == request.project_id,
                    QuestionMapping.question_id == question_id
                )
                existing_result = await session.execute(existing_stmt)
                existing_mapping = existing_result.scalar_one_or_none()

                if existing_mapping:
                    # Update existing mapping
                    existing_mapping.related_elements = mapping.get('elements', [])
                    existing_mapping.related_columns = mapping.get('columns', [])
                    existing_mapping.recommended_analyses = mapping.get('analysis_types', [])
                    existing_mapping.confidence = mapping.get('confidence', 0.0)
                else:
                    # Create new mapping
                    new_mapping = QuestionMapping(
                        id=str(uuid.uuid4()),
                        project_id=request.project_id,
                        question_id=question_id,
                        question_text=question_text,
                        question_embedding=None,  # Could be populated later
                        related_elements=mapping.get('elements', []),
                        related_columns=mapping.get('columns', []),
                        recommended_analyses=mapping.get('analysis_types', []),
                        confidence=mapping.get('confidence', 0.0),
                        business_context=mapping.get('business_context')
                    )
                    session.add(new_mapping)

            await session.commit()

        # Store in journey_progress
        async with get_db_context() as session:
            project_stmt = select(Project).where(Project.id == request.project_id)
            project_result = await session.execute(project_stmt)
            project = project_result.scalar_one_or_none()

            if project:
                journey_progress = project.journey_progress or {}
                journey_progress['questionMappings'] = mappings_dict
                journey_progress['mappingsGeneratedAt'] = datetime.utcnow().isoformat()
                project.journey_progress = journey_progress
                await session.commit()

        return {
            "success": True,
            "project_id": request.project_id,
            "mappings": mappings_dict,
            "count": len(mappings_dict),
            "timestamp": datetime.utcnow().isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Semantic mapping error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Semantic mapping failed: {str(e)}"
        )


@router.post("/select-analyses", response_model=Dict[str, Any])
async def select_analyses(
    request: SelectAnalysesRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Select appropriate analysis types based on questions.

    Analyzes question intent to determine which analysis types are needed.
    """
    try:
        analysis_types = select_analysis_types_for_questions(
            questions=request.questions,
            mappings=request.mappings,
            user_goals=request.user_goals
        )

        return {
            "success": True,
            "analysis_types": analysis_types,
            "count": len(analysis_types),
            "recommended_for_questions": {
                q: analysis_types[:3]  # Top 3 per question
                for q in request.questions
            }
        }

    except Exception as e:
        logger.error(f"Analysis selection error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis selection failed: {str(e)}"
        )


@router.post("/generate-embeddings", response_model=Dict[str, Any])
async def generate_column_embeddings(
    request: GenerateEmbeddingsRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Generate vector embeddings for dataset columns.

    Creates embeddings for column names, descriptions, and sample values
    to enable semantic search and matching.
    """
    try:
        from ..services.semantic_matching import SemanticMatcher

        async with get_db_context() as session:
            # Verify dataset ownership
            dataset_stmt = select(Dataset).join(Project).where(
                Dataset.id == request.dataset_id,
                Dataset.project_id == request.project_id,
                Project.user_id == current_user.id
            )
            dataset_result = await session.execute(dataset_stmt)
            dataset = dataset_result.scalar_one_or_none()

            if not dataset:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Dataset not found"
                )

            # Update dataset embeddings_generated flag
            dataset.embeddings_generated = True
            await session.commit()

        matcher = get_semantic_matcher()

        # Generate embeddings
        documents = await matcher.column_generator.generate_column_embeddings(
            dataset_id=request.dataset_id,
            columns=request.columns
        )

        # Store embeddings in database
        async with get_db_context() as session:
            for doc in documents:
                # Check if embedding already exists
                existing_stmt = select(ColumnEmbedding).where(
                    ColumnEmbedding.dataset_id == request.dataset_id,
                    ColumnEmbedding.column_name == doc.get('column_name')
                )
                existing_result = await session.execute(existing_stmt)
                existing_embedding = existing_result.scalar_one_or_none()

                if existing_embedding:
                    # Update existing embedding
                    existing_embedding.embedding = doc.get('embedding')
                    existing_embedding.embedding_model = doc.get('model', 'unknown')
                else:
                    # Create new embedding
                    new_embedding = ColumnEmbedding(
                        id=str(uuid.uuid4()),
                        dataset_id=request.dataset_id,
                        column_name=doc.get('column_name'),
                        embedding=doc.get('embedding'),
                        embedding_model=doc.get('model', 'unknown')
                    )
                    session.add(new_embedding)

            await session.commit()

        # Update journey_progress
        async with get_db_context() as session:
            project_stmt = select(Project).where(Project.id == request.project_id)
            project_result = await session.execute(project_stmt)
            project = project_result.scalar_one_or_none()

            if project:
                journey_progress = project.journey_progress or {}
                journey_progress['embeddingsGenerated'] = True
                journey_progress['embeddingsGeneratedAt'] = datetime.utcnow().isoformat()
                journey_progress['columnsIndexed'] = len(documents)
                project.journey_progress = journey_progress
                await session.commit()

        return {
            "success": True,
            "dataset_id": request.dataset_id,
            "embeddings_generated": len(documents),
            "message": f"Generated embeddings for {len(documents)} columns"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Embedding generation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Embedding generation failed: {str(e)}"
        )


@router.get("/projects/{project_id}/mappings")
async def get_project_mappings(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get all question-element mappings for a project.

    Returns stored mappings from previous semantic matching.
    """
    try:
        async with get_db_context() as session:
            # Verify project ownership
            project_stmt = select(Project).where(
                Project.id == project_id,
                Project.user_id == current_user.id
            )
            project_result = await session.execute(project_stmt)
            project = project_result.scalar_one_or_none()

            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found"
                )

            # Query mappings for this project
            mapping_stmt = select(QuestionMapping).where(
                QuestionMapping.project_id == project_id
            ).order_by(QuestionMapping.created_at.desc())

            mapping_result = await session.execute(mapping_stmt)
            mappings = mapping_result.scalars().all()

            # Convert to response format
            mappings_list = []
            for mapping in mappings:
                mappings_list.append({
                    "id": mapping.id,
                    "question_id": mapping.question_id,
                    "question_text": mapping.question_text,
                    "related_elements": mapping.related_elements or [],
                    "related_columns": mapping.related_columns or [],
                    "recommended_analyses": mapping.recommended_analyses or [],
                    "confidence": mapping.confidence,
                    "business_context": mapping.business_context,
                    "created_at": mapping.created_at.isoformat() if mapping.created_at else None
                })

            return {
                "success": True,
                "project_id": project_id,
                "mappings": mappings_list,
                "count": len(mappings_list)
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching mappings: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch mappings: {str(e)}"
        )


@router.put("/projects/{project_id}/mappings")
async def update_mappings(
    project_id: str,
    mappings: List[Dict[str, Any]],
    current_user: User = Depends(get_current_user)
):
    """
    Update or override question-element mappings.

    Allows users to manually adjust mappings from auto-generated results.
    """
    try:
        async with get_db_context() as session:
            # Verify project ownership
            project_stmt = select(Project).where(
                Project.id == project_id,
                Project.user_id == current_user.id
            )
            project_result = await session.execute(project_stmt)
            project = project_result.scalar_one_or_none()

            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found"
                )

            # Delete existing mappings for this project
            delete_stmt = delete(QuestionMapping).where(
                QuestionMapping.project_id == project_id
            )
            await session.execute(delete_stmt)

            # Create new mappings
            for mapping in mappings:
                question_text = mapping.get('question_text', '')
                question_id = hashlib.sha256(question_text.encode()).hexdigest()[:64]

                new_mapping = QuestionMapping(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    question_id=question_id,
                    question_text=question_text,
                    question_embedding=None,
                    related_elements=mapping.get('related_elements', []),
                    related_columns=mapping.get('related_columns', []),
                    recommended_analyses=mapping.get('recommended_analyses', []),
                    confidence=mapping.get('confidence', 0.0),
                    business_context=mapping.get('business_context')
                )
                session.add(new_mapping)

            await session.commit()

        return {
            "success": True,
            "project_id": project_id,
            "mappings_updated": len(mappings),
            "message": f"Updated {len(mappings)} mappings"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating mappings: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update mappings: {str(e)}"
        )


@router.delete("/projects/{project_id}/mappings")
async def clear_mappings(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Clear all mappings for a project.

    Removes stored mappings to start fresh.
    """
    try:
        async with get_db_context() as session:
            # Verify project ownership
            project_stmt = select(Project).where(
                Project.id == project_id,
                Project.user_id == current_user.id
            )
            project_result = await session.execute(project_stmt)
            project = project_result.scalar_one_or_none()

            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found"
                )

            # Delete all mappings for this project
            delete_stmt = delete(QuestionMapping).where(
                QuestionMapping.project_id == project_id
            )
            result = await session.execute(delete_stmt)

            # Clear from journey_progress
            journey_progress = project.journey_progress or {}
            journey_progress['questionMappings'] = []
            project.journey_progress = journey_progress

            await session.commit()

        return {
            "success": True,
            "project_id": project_id,
            "message": "Mappings cleared",
            "mappings_deleted": result.rowcount if result else 0
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error clearing mappings: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clear mappings: {str(e)}"
        )


# ============================================================================
# Semantic Search
# ============================================================================

@router.post("/search/columns")
async def search_columns(
    project_id: str,
    query: str,
    limit: int = 10,
    current_user: User = Depends(get_current_user)
):
    """
    Search for columns using natural language.

    Uses semantic search to find columns relevant to the query.
    """
    try:
        from ..services.semantic_matching import SemanticMatcher

        matcher = get_semantic_matcher()

        # Search for columns matching the query
        results = await matcher.search_columns(
            project_id=project_id,
            query=query,
            limit=limit
        )

        return {
            "success": True,
            "query": query,
            "results": results,
            "count": len(results)
        }

    except Exception as e:
        logger.error(f"Column search error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Column search failed: {str(e)}"
        )


@router.get("/projects/{project_id}/semantic-status")
async def get_semantic_status(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get semantic matching status for a project.

    Returns whether embeddings are generated and mapping is ready.
    """
    try:
        async with get_db_context() as session:
            # Verify project ownership
            project_stmt = select(Project).where(
                Project.id == project_id,
                Project.user_id == current_user.id
            )
            project_result = await session.execute(project_stmt)
            project = project_result.scalar_one_or_none()

            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found"
                )

            # Count embeddings for this project's datasets
            embedding_stmt = select(func.count(ColumnEmbedding.id)).join(
                Dataset, ColumnEmbedding.dataset_id == Dataset.id
            ).where(Dataset.project_id == project_id)

            embedding_result = await session.execute(embedding_stmt)
            columns_indexed = embedding_result.scalar() or 0

            # Count mappings for this project
            mapping_stmt = select(func.count(QuestionMapping.id)).where(
                QuestionMapping.project_id == project_id
            )
            mapping_result = await session.execute(mapping_stmt)
            mappings_count = mapping_result.scalar() or 0

            # Check journey_progress
            journey_progress = project.journey_progress or {}
            embeddings_generated = journey_progress.get('embeddingsGenerated', False)
            mappings_generated = journey_progress.get('mappingsGeneratedAt', None)

            return {
                "success": True,
                "project_id": project_id,
                "embeddings_generated": embeddings_generated or columns_indexed > 0,
                "columns_indexed": columns_indexed,
                "mappings_count": mappings_count,
                "ready_for_mapping": columns_indexed > 0,
                "last_mapping": mappings_generated
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Semantic status error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get semantic status: {str(e)}"
        )


# ============================================================================
# Business Context Integration
# ============================================================================

@router.post("/apply-business-context")
async def apply_business_context(
    project_id: str,
    business_context: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """
    Apply business context to improve mapping accuracy.

    Business context includes industry, region, and domain knowledge
    that helps interpret questions and data elements correctly.
    """
    try:
        from ..services.semantic_matching import SemanticMatcher

        matcher = get_semantic_matcher()

        # Update business context
        await matcher.set_business_context(
            project_id=project_id,
            context=business_context
        )

        return {
            "success": True,
            "project_id": project_id,
            "message": "Business context applied",
            "context": business_context
        }

    except Exception as e:
        logger.error(f"Business context error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to apply business context: {str(e)}"
        )
