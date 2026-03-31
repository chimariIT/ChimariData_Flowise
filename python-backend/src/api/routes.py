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
from uuid import uuid4
import uuid
import logging

from fastapi import APIRouter, HTTPException, Depends, Query, status, UploadFile
from pydantic import BaseModel, Field

# LangChain imports
from langchain_openai import ChatOpenAI

# Local imports
from ..models.schemas import (
    DatasetCreate, Dataset, AnalysisRequest, AnalysisResult,
    EvidenceChainQuery, EvidenceChainResponse, APIResponse,
    OrchestratorState, JourneyStep, JourneyState,
    QuestionElementMapping, TransformationPlan, TransformationResult,
    HealthStatus, AnalysisType
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
        # Create mock mappings for analysis selection
        mock_mappings = [
            {
                "question_id": f"q_{i}",
                "question_text": q,
                "recommended_analyses": ["descriptive_stats"]
            }
            for i, q in enumerate(request.questions)
        ]

        analysis_types = select_analysis_types_for_questions(
            questions=request.questions,
            mappings=mock_mappings,
            user_goals=request.user_goals
        )

        return APIResponse(
            success=True,
            message=f"Selected {len(analysis_types)} analysis types",
            data={"analysis_types": analysis_types}
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
    try:
        # In a real implementation, this would:
        # 1. Load the dataset
        # 2. Execute analysis scripts
        # 3. Return standardized results

        # For now, return mock response
        results = {
            analysis_type: {
                "success": True,
                "data": {},
                "metadata": {"execution_time_ms": 1000}
            }
            for analysis_type in request.analysis_types
        }

        return APIResponse(
            success=True,
            message=f"Executed {len(request.analysis_types)} analyses",
            data=results
        )
    except Exception as e:
        logger.error(f"Error executing analysis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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
# Legacy Compatibility Routes
# For backward compatibility with existing Node.js client
# ============================================================================

class ProjectCreateRequest(BaseModel):
    """Legacy project creation request"""
    name: str = Field(..., description="Project name")
    description: Optional[str] = Field(None, description="Project description")
    journeyType: Optional[str] = Field(None, description="Journey type")

class DatasetCreateLegacy(BaseModel):
    """Legacy dataset creation request"""
    name: str = Field(..., description="Dataset name")
    description: Optional[str] = Field(None, description="Dataset description")
    sourceType: str = Field(..., description="Source type")
    sourceUri: Optional[str] = Field(None, description="Source URI")


@router.post("/projects/upload", response_model=APIResponse)
async def legacy_upload(
    file: UploadFile,
    name: Optional[str] = None,
    description: Optional[str] = None,
    questions: Optional[str] = None,
    isTrial: Optional[bool] = None,
    piiHandled: Optional[bool] = None,
    anonymizationApplied: Optional[bool] = None,
    selectedColumns: Optional[str] = None,
    journeyType: Optional[str] = None
):
    """
    Legacy upload endpoint for compatibility with existing client

    Matches the existing Node.js backend's `/api/projects/upload` endpoint
    """
    try:
        # In a real implementation, this would:
        # 1. Save the uploaded file
        # 2. Detect PII
        # 3. Infer schema
        # 4. Store in database

        # For now, return a mock response
        return APIResponse(
            success=True,
            message="File uploaded successfully",
            data={
                "dataset_id": str(uuid.uuid4()),
                "name": name,
                "size": file.size if file else 0,
                "file_name": file.filename if file else ""
            }
        )
    except Exception as e:
        logger.error(f"Error in legacy upload: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects", response_model=APIResponse)
async def legacy_get_projects():
    """Legacy get projects endpoint"""
    try:
        # Mock response - in production would fetch from database
        return APIResponse(
            success=True,
            data=[]
        )
    except Exception as e:
        logger.error(f"Error getting projects: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects", response_model=APIResponse)
async def legacy_create_project(project: ProjectCreateRequest):
    """Legacy create project endpoint"""
    try:
        # Mock response - in production would create in database
        return APIResponse(
            success=True,
            message="Project created",
            data={
                "id": str(uuid.uuid4()),
                "name": project.name,
                "description": project.description,
                "journey_type": project.journeyType
            }
        )
    except Exception as e:
        logger.error(f"Error creating project: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/datasets", response_model=APIResponse)
async def legacy_get_datasets():
    """Legacy get datasets endpoint"""
    try:
        return APIResponse(
            success=True,
            data=[]
        )
    except Exception as e:
        logger.error(f"Error getting datasets: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/datasets/{dataset_id}", response_model=APIResponse)
async def legacy_get_dataset(dataset_id: str):
    """Legacy get dataset endpoint"""
    try:
        return APIResponse(
            success=True,
            data={"id": dataset_id}
        )
    except Exception as e:
        logger.error(f"Error getting dataset: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}", response_model=APIResponse)
async def legacy_get_project(project_id: str):
    """Legacy get project endpoint"""
    try:
        return APIResponse(
            success=True,
            data={"id": project_id, "journey_state": {}}
        )
    except Exception as e:
        logger.error(f"Error getting project: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}/datasets", response_model=APIResponse)
async def legacy_get_project_datasets(project_id: str):
    """Legacy get project datasets endpoint"""
    try:
        return APIResponse(
            success=True,
            data=[]
        )
    except Exception as e:
        logger.error(f"Error getting project datasets: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/projects/{project_id}", response_model=APIResponse)
async def legacy_delete_project(project_id: str):
    """Legacy delete project endpoint"""
    try:
        return APIResponse(
            success=True,
            message="Project deleted"
        )
    except Exception as e:
        logger.error(f"Error deleting project: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/projects/{project_id}/schema", response_model=APIResponse)
async def legacy_update_schema(project_id: str, schema: Dict[str, Any]):
    """Legacy update project schema endpoint"""
    try:
        return APIResponse(
            success=True,
            message="Schema updated",
            data=schema
        )
    except Exception as e:
        logger.error(f"Error updating schema: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_id}/datasets", response_model=APIResponse)
async def legacy_add_dataset_to_project(project_id: str, datasetId: str, role: Optional[str] = None):
    """Legacy add dataset to project endpoint"""
    try:
        return APIResponse(
            success=True,
            message="Dataset added to project"
        )
    except Exception as e:
        logger.error(f"Error adding dataset to project: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/projects/{project_id}/datasets/{dataset_id}", response_model=APIResponse)
async def legacy_remove_dataset_from_project(project_id: str, dataset_id: str):
    """Legacy remove dataset from project endpoint"""
    try:
        return APIResponse(
            success=True,
            message="Dataset removed from project"
        )
    except Exception as e:
        logger.error(f"Error removing dataset: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/project-session/current", response_model=APIResponse)
async def legacy_get_project_session(journeyType: Optional[str] = None):
    """Legacy get project session endpoint"""
    try:
        return APIResponse(
            success=True,
            data={
                "session_id": str(uuid.uuid4()),
                "current_step": "upload",
                "journey_type": journeyType
            }
        )
    except Exception as e:
        logger.error(f"Error getting project session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# More legacy compatibility endpoints

@router.get("/pricing", response_model=APIResponse)
async def legacy_get_pricing():
    """Legacy get pricing endpoint"""
    try:
        return APIResponse(
            success=True,
            data={
                "free": {"analyses": 5, "storage_mb": 100},
                "pro": {"analyses": 50, "storage_mb": 1000, "price_usd": 29}
            }
        )
    except Exception as e:
        logger.error(f"Error getting pricing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create-payment-intent", response_model=APIResponse)
async def legacy_create_payment_intent(features: List[str], projectId: str):
    """Legacy create payment intent endpoint"""
    try:
        return APIResponse(
            success=True,
            data={
                "intent_id": str(uuid.uuid4()),
                "status": "created"
            }
        )
    except Exception as e:
        logger.error(f"Error creating payment intent: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}/journey-state", response_model=APIResponse)
async def legacy_get_journey_state(project_id: str):
    """Legacy get journey state endpoint"""
    try:
        return APIResponse(
            success=True,
            data={
                "journeyState": {},
                "currentStep": "upload"
            }
        )
    except Exception as e:
        logger.error(f"Error getting journey state: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/projects/{project_id}/progress", response_model=APIResponse)
async def legacy_update_progress(project_id: str, progress: Dict[str, Any]):
    """Legacy update project progress endpoint"""
    try:
        return APIResponse(
            success=True,
            message="Progress updated"
        )
    except Exception as e:
        logger.error(f"Error updating progress: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}/artifacts", response_model=APIResponse)
async def legacy_get_artifacts(project_id: str):
    """Legacy get project artifacts endpoint"""
    try:
        return APIResponse(
            success=True,
            data=[]
        )
    except Exception as e:
        logger.error(f"Error getting artifacts: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}/export", response_model=APIResponse)
async def legacy_export_project(project_id: str, format: str = "pdf"):
    """Legacy export project endpoint"""
    try:
        return APIResponse(
            success=True,
            data={
                "download_url": f"/api/v1/projects/{project_id}/export?format={format}"
            }
        )
    except Exception as e:
        logger.error(f"Error exporting project: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Authentication endpoints for legacy compatibility

class LoginRequest(BaseModel):
    """Login request"""
    email: str = Field(..., description="Email")
    password: str = Field(..., description="Password")


class RegisterRequest(BaseModel):
    """Registration request"""
    email: str = Field(..., description="Email")
    name: str = Field(..., description="Name")
    password: str = Field(..., description="Password")


@router.post("/auth/login", response_model=APIResponse)
async def legacy_login(request: LoginRequest):
    """Legacy login endpoint"""
    try:
        # Mock implementation - in production would verify credentials
        return APIResponse(
            success=True,
            message="Login successful",
            data={
                "token": "mock_jwt_token_12345",
                "user": {
                    "id": str(uuid.uuid4()),
                    "email": request.email,
                    "name": request.email.split('@')[0],
                    "is_admin": False
                }
            }
        )
    except Exception as e:
        logger.error(f"Error in login: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auth/register", response_model=APIResponse)
async def legacy_register(request: RegisterRequest):
    """Legacy registration endpoint"""
    try:
        # Mock implementation - in production would create user
        return APIResponse(
            success=True,
            message="Registration successful",
            data={
                "user_id": str(uuid.uuid4()),
                "email": request.email,
                "name": request.name
            }
        )
    except Exception as e:
        logger.error(f"Error in registration: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auth/refresh", response_model=APIResponse)
async def legacy_auth_refresh():
    """Legacy auth refresh endpoint"""
    try:
        # Mock implementation
        return APIResponse(
            success=True,
            message="Token refreshed",
            data={
                "token": "mock_refreshed_token_12345"
            }
        )
    except Exception as e:
        logger.error(f"Error refreshing token: {e}", exc_info=True)
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
    app.include_router(provider_router, prefix="/api/v1")  # NEW: Provider management

    # Include legacy compatibility routes (without /api/v1 prefix)
    # These match the existing Node.js client's API structure
    # Note: The main `router` object already has the legacy routes,
    # so we include it directly without a prefix to match the client's expected paths
    app.include_router(router, tags=["legacy"])
