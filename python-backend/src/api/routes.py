"""
FastAPI Routes for Chimaridata Python Backend

Provides REST API endpoints for:
- Project and dataset management
- Transformation execution
- Analysis orchestration
- Evidence chain queries
- Agentic workflow control
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

# Local imports
from ..models.schemas import (
    EvidenceChainQuery, EvidenceChainResponse, APIResponse,
    JourneyStep, TransformationPlan, TransformationResult,
    HealthStatus, AnalysisType, AgentType
)
from ..services.agent_orchestrator import get_orchestrator
from ..services.semantic_matching import (
    get_semantic_matcher, select_analysis_types_for_questions
)
from ..services.rag_evidence_chain import get_evidence_chain_service
from ..services.transformation_engine import (
    get_transformation_executor, BusinessDefinition
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create routers
router = APIRouter()
orchestrator_router = APIRouter(prefix="/orchestrator")
analysis_router = APIRouter(prefix="/analysis")
evidence_router = APIRouter(prefix="/evidence")
datasets_router = APIRouter(prefix="/datasets")
transformation_router = APIRouter(prefix="/transformations")


# ============================================================================
# Request/Response Models
# ============================================================================

class CreateSessionRequest(BaseModel):
    """Request to create a new orchestrator session"""
    project_id: str = Field(..., description="Project ID")
    user_id: str = Field(..., description="User ID")
    user_goals: List[str] = Field(..., description="User's analysis goals")
    user_questions: List[str] = Field(..., description="User's questions")


class SessionAdvanceRequest(BaseModel):
    """Request to advance a session"""
    user_input: Optional[Dict[str, Any]] = Field(None, description="User input for the step")


class RunAgentTaskRequest(BaseModel):
    """Request to run an explicit agent task through orchestrator runtime."""
    agent_type: str = Field(..., description="Agent type enum value")
    task: str = Field(..., min_length=1, description="Task instruction for the agent")
    context: Optional[Dict[str, Any]] = Field(None, description="Structured context payload")


class GenerateEmbeddingsRequest(BaseModel):
    """Request to generate column embeddings"""
    dataset_id: str = Field(..., description="Dataset ID")
    columns: List[Dict[str, Any]] = Field(..., description="Column definitions")


class QuestionMappingRequest(BaseModel):
    """Request to map questions to elements"""
    project_id: str = Field(..., description="Project ID")
    questions: List[str] = Field(..., description="Questions to map")
    datasets: List[str] = Field(..., description="Dataset IDs to search")
    user_goals: List[str] = Field(..., description="User goals")


class ExecuteAnalysisRequest(BaseModel):
    """Request to execute analysis"""
    project_id: str = Field(..., description="Project ID")
    user_id: str = Field(..., description="User ID")
    analysis_types: List[str] = Field(..., description="Analysis types to run")
    dataset_id: str = Field(..., description="Dataset ID to analyze")


# ============================================================================
# Health Check
# ============================================================================

@router.get("/health", response_model=HealthStatus)
async def health_check():
    """Health check endpoint"""
    return HealthStatus(
        status="healthy",
        version="1.0.0",
        timestamp=datetime.utcnow(),
        services={
            "orchestrator": "up",
            "semantic_matching": "up",
            "evidence_chain": "up",
            "transformation_engine": "up"
        }
    )


# ============================================================================
# Orchestrator Routes
# ============================================================================

@orchestrator_router.post("/session/create", response_model=APIResponse)
async def create_session(request: CreateSessionRequest):
    """
    Create a new orchestrator session

    Starts a new workflow with initial state
    """
    try:
        orchestrator = get_orchestrator()
        session_id = orchestrator.create_session(
            project_id=request.project_id,
            user_id=request.user_id,
            user_goals=request.user_goals,
            user_questions=request.user_questions
        )

        return APIResponse(
            success=True,
            message="Session created successfully",
            data={
                "session_id": session_id,
                "current_step": JourneyStep.UPLOAD.value,
                "message": f"Workflow started for {len(request.user_questions)} questions"
            }
        )
    except Exception as e:
        logger.error(f"Error creating session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@orchestrator_router.post("/session/{session_id}/advance", response_model=APIResponse)
async def advance_session(session_id: str, request: SessionAdvanceRequest):
    """
    Advance a session to the next step

    Executes the current workflow step and transitions to the next
    """
    try:
        orchestrator = get_orchestrator()
        result = orchestrator.advance_session(
            session_id=session_id,
            user_input=request.user_input
        )

        if "error" in result:
            return APIResponse(
                success=False,
                error=result["error"]
            )

        return APIResponse(
            success=True,
            message="Session advanced",
            data=result
        )
    except Exception as e:
        logger.error(f"Error advancing session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@orchestrator_router.get("/session/{session_id}/status", response_model=APIResponse)
async def get_session_status(session_id: str):
    """Get the current status of a session"""
    try:
        orchestrator = get_orchestrator()
        status = orchestrator.get_session_status(session_id)

        if "error" in status:
            raise HTTPException(status_code=404, detail=status["error"])

        return APIResponse(
            success=True,
            data=status
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@orchestrator_router.delete("/session/{session_id}", response_model=APIResponse)
async def cleanup_session(session_id: str):
    """Clean up a completed session"""
    try:
        orchestrator = get_orchestrator()
        success = orchestrator.cleanup_session(session_id)

        return APIResponse(
            success=success,
            message=f"Session {'cleaned up' if success else 'not found'}"
        )
    except Exception as e:
        logger.error(f"Error cleaning up session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@orchestrator_router.get("/workflow/graph", response_model=APIResponse)
async def get_workflow_graph():
    """Get the workflow graph structure for visualization"""
    try:
        orchestrator = get_orchestrator()
        graph = orchestrator.get_workflow_graph()

        return APIResponse(
            success=True,
            data=graph
        )
    except Exception as e:
        logger.error(f"Error getting workflow graph: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@orchestrator_router.post("/agent/run", response_model=APIResponse)
async def run_agent_task(request: RunAgentTaskRequest):
    """Run an explicit agent task (DeepAgent preferred with fallback runtime)."""
    try:
        normalized_agent_type = (request.agent_type or "").strip().lower()
        try:
            agent_type = AgentType(normalized_agent_type)
        except ValueError:
            allowed = [agent.value for agent in AgentType]
            raise HTTPException(
                status_code=400,
                detail=f"Invalid agent_type '{request.agent_type}'. Allowed values: {allowed}",
            )

        orchestrator = get_orchestrator()
        result = await orchestrator.run_agent_task(
            agent_type=agent_type,
            task=request.task,
            context=request.context or {},
        )

        if not result.get("success"):
            return APIResponse(
                success=False,
                error=str(result.get("error") or "Agent task failed"),
                data=result,
            )

        return APIResponse(
            success=True,
            message="Agent task completed",
            data=result,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running agent task: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Semantic Matching Routes
# ============================================================================

@router.post("/semantic/generate-embeddings", response_model=APIResponse)
async def generate_column_embeddings(request: GenerateEmbeddingsRequest):
    """
    Generate embeddings for dataset columns

    Enables RAG-based question-element matching
    """
    try:
        matcher = get_semantic_matcher()

        # Create column definitions from request
        from ..models.schemas import ColumnDefinition
        columns = [
            ColumnDefinition(**col) for col in request.columns
        ]

        # Generate embeddings
        documents = await matcher.column_generator.generate_column_embeddings(
            dataset_id=request.dataset_id,
            columns=columns
        )

        # Store embeddings
        await matcher.column_generator.store_column_embeddings(
            dataset_id=request.dataset_id,
            documents=documents
        )

        return APIResponse(
            success=True,
            message=f"Generated {len(documents)} column embeddings",
            data={"count": len(documents)}
        )
    except Exception as e:
        logger.error(f"Error generating embeddings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/semantic/map-questions", response_model=APIResponse)
async def map_questions_to_elements(request: QuestionMappingRequest):
    """
    Map questions to data elements using semantic matching

    Returns question-element mappings with relevance scores
    """
    try:
        matcher = get_semantic_matcher()

        mappings = await matcher.get_question_element_mappings(
            questions=request.questions,
            datasets=request.datasets,
            user_goals=request.user_goals
        )

        return APIResponse(
            success=True,
            message=f"Created {len(mappings)} question-element mappings",
            data=[m.dict() for m in mappings]
        )
    except Exception as e:
        logger.error(f"Error mapping questions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/semantic/select-analyses", response_model=APIResponse)
async def select_analyses(request: QuestionMappingRequest):
    """
    Select appropriate analysis types based on questions

    Returns list of analysis types to execute
    """
    try:
        matcher = get_semantic_matcher()
        mappings = await matcher.get_question_element_mappings(
            questions=request.questions,
            datasets=request.datasets,
            user_goals=request.user_goals
        )
        mapping_payload = [
            mapping.dict() if hasattr(mapping, "dict") else mapping
            for mapping in mappings
        ]

        analysis_types = select_analysis_types_for_questions(
            questions=request.questions,
            mappings=mapping_payload,
            user_goals=request.user_goals
        )

        return APIResponse(
            success=True,
            message=f"Selected {len(analysis_types)} analysis types",
            data={
                "analysis_types": analysis_types,
                "mapping_count": len(mapping_payload),
            }
        )
    except Exception as e:
        logger.error(f"Error selecting analyses: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Evidence Chain Routes
# ============================================================================

@evidence_router.post("/query", response_model=EvidenceChainResponse)
async def query_evidence_chain(query: EvidenceChainQuery):
    """
    Query the evidence chain

    Returns complete trace from question to insights/answers
    """
    try:
        service = get_evidence_chain_service()
        response = await service.query_chain(query)

        return response
    except Exception as e:
        logger.error(f"Error querying evidence chain: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@evidence_router.get("/project/{project_id}", response_model=APIResponse)
async def get_project_evidence_chain(project_id: str):
    """Get the complete evidence chain for a project"""
    try:
        service = get_evidence_chain_service()
        chain = service.get_chain_for_project(project_id)

        return APIResponse(
            success=True,
            data=[link.dict() for link in chain]
        )
    except Exception as e:
        logger.error(f"Error getting evidence chain: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@evidence_router.post("/generate-answer", response_model=APIResponse)
async def generate_rag_answer(
    project_id: str = Query(...),
    question: str = Query(...)
):
    """
    Generate an answer using RAG

    Retrieves relevant evidence and generates an answer
    """
    try:
        service = get_evidence_chain_service()
        result = await service.generate_answer(
            project_id=project_id,
            question=question
        )

        return APIResponse(
            success=True,
            message="Answer generated",
            data=result
        )
    except Exception as e:
        logger.error(f"Error generating answer: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Transformation Routes
# ============================================================================

@transformation_router.post("/compile", response_model=APIResponse)
async def compile_transformation_plan(plan: TransformationPlan):
    """
    Compile a transformation plan with business context

    Validates dependencies and applies business definitions
    """
    try:
        from ..services.transformation_engine import DependencyResolver, FormulaCompiler
        from ..services.transformation_engine import get_business_registry

        # Validate dependencies
        is_valid, errors = DependencyResolver.validate_dependencies(plan.steps)
        if not is_valid:
            return APIResponse(
                success=False,
                error="Dependency validation failed",
                errors=errors
            )

        # Compile formulas
        registry = get_business_registry()
        compiler = FormulaCompiler(registry)

        compiled_steps = []
        for step in plan.steps:
            compiled_step = compiler.compile_step(
                step,
                business_context=plan.business_context
            )
            compiled_steps.append(compiled_step)

        # Resolve execution order
        ordered_steps = DependencyResolver.resolve_dependencies(plan.steps)

        return APIResponse(
            success=True,
            message="Transformation plan compiled",
            data={
                "compiled_steps": compiled_steps,
                "execution_order": [s.step_id for s in ordered_steps],
                "estimated_runtime_ms": plan.estimated_runtime_ms
            }
        )
    except Exception as e:
        logger.error(f"Error compiling transformation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@transformation_router.post("/execute", response_model=TransformationResult)
async def execute_transformation_plan(plan: TransformationPlan):
    """
    Execute a transformation plan

    Applies transformations to the data
    """
    try:
        executor = get_transformation_executor()

        # In a real implementation, load datasets from storage
        datasets = {}  # Would load from database

        result = executor.execute_plan(
            plan=plan,
            datasets=datasets,
            business_context=plan.business_context
        )

        return result
    except Exception as e:
        logger.error(f"Error executing transformation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Analysis Routes
# ============================================================================

@analysis_router.post("/execute", response_model=APIResponse)
async def execute_analysis(request: ExecuteAnalysisRequest):
    """
    Execute analysis on a dataset

    Runs specified analysis types and returns results
    """
    raise HTTPException(
        status_code=410,
        detail=(
            "Deprecated endpoint. Use POST /api/v1/projects/{project_id}/analyze "
            "or POST /api/analysis-execution/execute for real analysis execution."
        ),
    )


@analysis_router.get("/types", response_model=APIResponse)
async def get_analysis_types():
    """Get available analysis types"""
    from ..models.schemas import AnalysisType

    types = [t.value for t in AnalysisType]
    descriptions = {
        AnalysisType.DESCRIPTIVE_STATS.value: "Basic statistics and data summary",
        AnalysisType.CORRELATION.value: "Correlation analysis between variables",
        AnalysisType.REGRESSION.value: "Linear and regression modeling",
        AnalysisType.CLUSTERING.value: "Unsupervised clustering analysis",
        AnalysisType.CLASSIFICATION.value: "Supervised classification modeling",
        AnalysisType.TIME_SERIES.value: "Time series forecasting",
        AnalysisType.STATISTICAL_TESTS.value: "Hypothesis testing",
        AnalysisType.TEXT_ANALYSIS.value: "Natural language text analysis",
        AnalysisType.GROUP_ANALYSIS.value: "Group comparison analysis"
    }

    return APIResponse(
        success=True,
        data=[
            {"type": t, "description": descriptions.get(t, "")}
            for t in types
        ]
    )


# ============================================================================
# Business Definitions Routes
# ============================================================================

@router.get("/business-definitions", response_model=APIResponse)
async def get_business_definitions(category: Optional[str] = None):
    """Get business definitions (metrics, formulas)"""
    try:
        from ..services.transformation_engine import get_business_registry

        registry = get_business_registry()

        if category:
            definitions = registry.list_by_category(category)
        else:
            definitions = list(registry.definitions.values())

        return APIResponse(
            success=True,
            data=[d.dict() for d in definitions]
        )
    except Exception as e:
        logger.error(f"Error getting business definitions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Include all routers in main app
# ============================================================================

def include_routes(app):
    """
    Include all routers in the FastAPI app

    Args:
        app: FastAPI application instance
    """
    # Import provider router
    from .provider_routes import router as provider_router

    # Include versioned routes
    app.include_router(router, prefix="/api/v1")
    app.include_router(orchestrator_router, prefix="/api/v1")
    app.include_router(analysis_router, prefix="/api/v1")
    app.include_router(evidence_router, prefix="/api/v1")
    app.include_router(datasets_router, prefix="/api/v1")
    app.include_router(transformation_router, prefix="/api/v1")
    app.include_router(provider_router, prefix="/api/v1")  # Provider management
