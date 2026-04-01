"""
Analysis Execution Routes

API endpoints for analysis execution with progress tracking.
Handles analysis submission, status checking, and results retrieval.
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import logging
from datetime import datetime
import uuid
import asyncio
import json
import subprocess
import sys
from pathlib import Path

from ..auth.middleware import get_current_user, User
from ..db import get_db_context
from ..models.database import AnalysisResult, Project, Dataset
from sqlalchemy import select, and_
from ..services.analysis_orchestrator import AnalysisOrchestrator, AnalysisContext

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["analysis"])


# ============================================================================
# Models
# ============================================================================

class AnalysisConfig(BaseModel):
    """Configuration for analysis execution"""
    project_id: str
    analysis_types: List[str] = Field(..., description="Types of analysis to execute")
    dataset_id: Optional[str] = None
    target_column: Optional[str] = None
    feature_columns: Optional[List[str]] = None
    parameters: Dict[str, Any] = Field(default_factory=dict)
    business_context: Optional[Dict[str, Any]] = None


class AnalysisExecution(BaseModel):
    """Analysis execution record"""
    execution_id: str
    project_id: str
    status: str  # pending, running, completed, failed, cancelled
    progress: int = 0
    current_step: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    results: Optional[Dict[str, Any]] = None
    estimated_duration_ms: Optional[int] = None


class AnalysisProgress(BaseModel):
    """Progress update for analysis"""
    execution_id: str
    status: str
    progress: int
    current_step: str
    message: str
    timestamp: datetime
    data: Optional[Dict[str, Any]] = None


class AnalysisResults(BaseModel):
    """Complete analysis results"""
    execution_id: str
    project_id: str
    analysis_types: List[str]
    results: Dict[str, Any]
    insights: List[Dict[str, Any]]
    evidence_chain: List[Dict[str, Any]]
    artifacts: List[Dict[str, Any]]
    completed_at: datetime


class AnalysisRequest(BaseModel):
    """Request to execute analysis"""
    project_id: str
    questions: List[str] = Field(..., description="User questions to answer")
    user_goals: List[str] = Field(default_factory=list, description="Analysis goals")
    analysis_types: Optional[List[str]] = None
    config: Optional[Dict[str, Any]] = None


# ============================================================================
# Active Executions Store (in-memory for demo, use Redis in production)
# ============================================================================

_active_executions: Dict[str, AnalysisExecution] = {}


# ============================================================================
# Analysis Execution Service
# ============================================================================

class AnalysisExecutionService:
    """Service for managing analysis execution"""

    def __init__(self):
        self.analysis_modules = {
            "descriptive_stats": "analysis_modules.descriptive_stats",
            "correlation": "analysis_modules.correlation_analysis",
            "regression": "analysis_modules.regression_analysis",
            "clustering": "analysis_modules.clustering_analysis",
            "time_series": "analysis_modules.time_series_analysis",
            "statistical_tests": "analysis_modules.statistical_tests",
            "classification": "analysis_modules.classification_analysis",
            "eda": "analysis_modules.eda_analysis"
        }

    async def create_execution(
        self,
        project_id: str,
        analysis_types: List[str],
        config: Dict[str, Any]
    ) -> str:
        """Create a new analysis execution and return execution ID"""
        execution_id = f"exec_{uuid.uuid4().hex}"

        execution = AnalysisExecution(
            execution_id=execution_id,
            project_id=project_id,
            status="pending",
            progress=0,
            started_at=datetime.utcnow(),
            estimated_duration_ms=len(analysis_types) * 30000  # 30s per analysis
        )

        _active_executions[execution_id] = execution
        return execution_id

    async def execute_analysis(
        self,
        execution_id: str,
        project_id: str,
        analysis_types: List[str],
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute analysis and emit progress updates"""
        try:
            execution = _active_executions.get(execution_id)
            if not execution:
                raise ValueError(f"Execution not found: {execution_id}")

            execution.status = "running"
            execution.progress = 10

            # Execute each analysis type
            results = {}
            total_steps = len(analysis_types)

            for i, analysis_type in enumerate(analysis_types):
                execution.current_step = f"Running {analysis_type}"
                execution.progress = 10 + int((i / total_steps) * 80)

                # Emit progress
                await self._emit_progress(
                    project_id,
                    execution_id,
                    f"Executing {analysis_type}...",
                    execution.progress
                )

                # Run analysis (mock for now, would call actual module)
                result = await self._run_analysis_module(
                    analysis_type,
                    project_id,
                    config
                )
                results[analysis_type] = result

            execution.status = "completed"
            execution.progress = 100
            execution.completed_at = datetime.utcnow()
            execution.results = results

            await self._emit_completion(
                project_id,
                execution_id,
                "Analysis complete",
                results
            )

            return {
                "success": True,
                "execution_id": execution_id,
                "results": results
            }

        except Exception as e:
            logger.error(f"Analysis execution error: {e}", exc_info=True)
            execution = _active_executions.get(execution_id)
            if execution:
                execution.status = "failed"
                execution.error = str(e)
                execution.completed_at = datetime.utcnow()

            await self._emit_error(
                project_id,
                execution_id,
                f"Analysis failed: {str(e)}"
            )

            raise

    async def _run_analysis_module(
        self,
        analysis_type: str,
        project_id: str,
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Run a specific analysis module

        Executes the appropriate Python analysis module and returns results.
        Modules are executed as subprocesses with stdin/stdout communication.
        """
        # Map analysis type to module file
        module_map = {
            "descriptive_stats": "descriptive_stats.py",
            "descriptive": "descriptive_stats.py",
            "correlation": "correlation_analysis.py",
            "regression": "regression_analysis.py",
            "clustering": "clustering_analysis.py",
            "time_series": "time_series_analysis.py",
            "statistical_tests": "statistical_tests.py",
            "classification": "classification_analysis.py",
            "eda": "eda_analysis.py",
            "comparative": "statistical_tests.py"  # Uses same module
        }

        # Get module file
        module_file = module_map.get(analysis_type)
        if not module_file:
            logger.warning(f"Unknown analysis type: {analysis_type}, returning placeholder")
            return {
                "analysis_type": analysis_type,
                "success": True,
                "status": "completed",
                "data": {},
                "message": f"Analysis type {analysis_type} not yet implemented"
            }

        # Get dataset data
        dataset_id = config.get("dataset_id")
        if not dataset_id:
            # Get first dataset for project
            async with get_db_context() as session:
                dataset_stmt = select(Dataset).where(
                    Dataset.project_id == project_id
                ).limit(1)
                dataset_result = await session.execute(dataset_stmt)
                dataset = dataset_result.scalar_one_or_none()

                if not dataset:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="No dataset found for project"
                    )
                dataset_id = dataset.id

        # Load dataset data
        async with get_db_context() as session:
            dataset_stmt = select(Dataset).where(Dataset.id == dataset_id)
            dataset_result = await session.execute(dataset_stmt)
            dataset = dataset_result.scalar_one_or_none()

            if not dataset:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Dataset not found: {dataset_id}"
                )

            # Use transformed data if available, otherwise use original data
            if dataset.ingestion_metadata and dataset.ingestion_metadata.get("transformedData"):
                data = dataset.ingestion_metadata["transformedData"]
            elif dataset.metadata and dataset.metadata.get("transformedData"):
                data = dataset.metadata["transformedData"]
            elif dataset.data:
                data = dataset.data
            elif dataset.preview:
                # Fallback to preview if no full data
                data = dataset.preview
                logger.warning(f"Using preview data for dataset {dataset_id}")
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No data available in dataset"
                )

        # Get PII columns to exclude
        pii_columns = []
        if dataset.pii_analysis:
            pii_columns = [field.get("field") for field in dataset.pii_analysis if field.get("field")]

        # Prepare input config for module
        input_config = {
            "data": data[:1000],  # Limit to 1000 rows for processing
            "project_id": project_id,
            "dataset_id": dataset_id,
            "pii_columns_to_exclude": pii_columns,
            "analysis_type": analysis_type,
            **config
        }

        # Get module path
        module_path = Path(__file__).parent.parent / "analysis_modules" / module_file

        if not module_path.exists():
            logger.error(f"Module not found: {module_path}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Analysis module not found: {module_file}"
            )

        try:
            # Run module as subprocess
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                str(module_path),
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            # Send input config
            input_json = json.dumps(input_config)
            stdout, stderr = await process.communicate(input=input_json.encode())

            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                logger.error(f"Analysis module failed: {error_msg}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Analysis execution failed: {error_msg}"
                )

            # Parse output
            try:
                result = json.loads(stdout.decode())
                logger.info(f"Analysis {analysis_type} completed successfully")
                return result
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse module output: {e}")
                # Try to find last valid JSON
                output_str = stdout.decode()
                last_brace = output_str.rfind("}")
                if last_brace != -1:
                    try:
                        result = json.loads(output_str[:last_brace + 1])
                        return result
                    except:
                        pass
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to parse analysis output: {str(e)}"
                )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error running analysis module: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Analysis execution error: {str(e)}"
            )

    async def _emit_progress(
        self,
        project_id: str,
        execution_id: str,
        message: str,
        progress: int
    ):
        """Emit progress via WebSocket"""
        try:
            from ..main import emit_progress
            await emit_progress(
                session_id=project_id,
                step="analysis_execution",
                progress=progress,
                message=f"[{execution_id}] {message}",
                data={"execution_id": execution_id}
            )
        except Exception as e:
            logger.warning(f"Could not emit progress: {e}")

    async def _emit_completion(
        self,
        project_id: str,
        execution_id: str,
        message: str,
        results: Dict[str, Any]
    ):
        """Emit completion via WebSocket"""
        try:
            from ..main import emit_completion
            await emit_completion(
                session_id=project_id,
                step="analysis_execution",
                message=message,
                results={"execution_id": execution_id, "results": results}
            )
        except Exception as e:
            logger.warning(f"Could not emit completion: {e}")

    async def _emit_error(
        self,
        project_id: str,
        execution_id: str,
        error: str
    ):
        """Emit error via WebSocket"""
        try:
            from ..main import emit_error
            await emit_error(
                session_id=project_id,
                step="analysis_execution",
                error=error,
                data={"execution_id": execution_id}
            )
        except Exception as e:
            logger.warning(f"Could not emit error: {e}")


# Singleton instance
_analysis_service = None


def get_analysis_service() -> AnalysisExecutionService:
    """Get the singleton analysis service instance"""
    global _analysis_service
    if _analysis_service is None:
        _analysis_service = AnalysisExecutionService()
    return _analysis_service


# ============================================================================
# Routes
# ============================================================================

@router.post("/projects/{project_id}/analyze")
async def execute_analysis(
    project_id: str,
    request: AnalysisRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """
    Execute analysis on project data.

    This is the main analysis endpoint. It:
    1. Creates an analysis execution
    2. Runs selected analysis types
    3. Emits progress updates via WebSocket
    4. Returns results when complete

    Can run in background for long-running analyses.
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

        service = get_analysis_service()

        # Determine analysis types (auto-select from questions if not provided)
        if request.analysis_types:
            analysis_types = request.analysis_types
        else:
            # Auto-select from questions using semantic matching
            from ..services.semantic_matching import select_analysis_types_for_questions
            analysis_types = select_analysis_types_for_questions(
                questions=request.questions,
                mappings=[],
                user_goals=request.user_goals
            )

        # Create execution
        execution_id = await service.create_execution(
            project_id=project_id,
            analysis_types=analysis_types,
            config=request.config or {}
        )

        # Create AnalysisResult record in database
        async with get_db_context() as session:
            # For now, create one record per analysis execution
            # In production, might create separate records per analysis type
            for analysis_type in analysis_types:
                analysis_result = AnalysisResult(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    user_id=current_user.id,
                    session_id=execution_id,
                    analysis_type=analysis_type,
                    status="pending",
                    config=request.config or {},
                    results=None,
                    error=None,
                    started_at=datetime.utcnow()
                )
                session.add(analysis_result)

            await session.commit()

        # Execute analysis (in background)
        async def run_analysis():
            try:
                result = await service.execute_analysis(
                    execution_id=execution_id,
                    project_id=project_id,
                    analysis_types=analysis_types,
                    config=request.config or {}
                )

                # Update AnalysisResult records with completion status
                async with get_db_context() as session:
                    for analysis_type in analysis_types:
                        stmt = select(AnalysisResult).where(
                            and_(
                                AnalysisResult.session_id == execution_id,
                                AnalysisResult.analysis_type == analysis_type
                            )
                        )
                        result_obj = await session.execute(stmt)
                        analysis_result = result_obj.scalar_one_or_none()

                        if analysis_result:
                            analysis_result.status = "completed"
                            analysis_result.results = result.get("results", {}).get(analysis_type)
                            analysis_result.completed_at = datetime.utcnow()

                    await session.commit()

            except Exception as e:
                # Update AnalysisResult records with error status
                async with get_db_context() as session:
                    stmt = select(AnalysisResult).where(
                        AnalysisResult.session_id == execution_id
                    )
                    result_obj = await session.execute(stmt)
                    analysis_results = result_obj.scalars().all()

                    for analysis_result in analysis_results:
                        analysis_result.status = "failed"
                        analysis_result.error = str(e)
                        analysis_result.completed_at = datetime.utcnow()

                    await session.commit()

                logger.error(f"Background analysis error: {e}", exc_info=True)

        background_tasks.add_task(run_analysis)

        return {
            "success": True,
            "execution_id": execution_id,
            "project_id": project_id,
            "analysis_types": analysis_types,
            "status": "running",
            "estimated_duration_ms": _active_executions[execution_id].estimated_duration_ms,
            "message": "Analysis started"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analysis execution error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {str(e)}"
        )


@router.get("/projects/{project_id}/analyses")
async def get_project_analyses(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get all analysis executions for a project.

    Returns history of analyses with their status.
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

            # Query analysis results for this project
            analysis_stmt = select(AnalysisResult).where(
                AnalysisResult.project_id == project_id
            ).order_by(AnalysisResult.started_at.desc())

            analysis_result = await session.execute(analysis_stmt)
            analyses = analysis_result.scalars().all()

            # Group by session_id (execution_id)
            executions = {}
            for analysis in analyses:
                session_id = analysis.session_id or "unknown"
                if session_id not in executions:
                    executions[session_id] = {
                        "execution_id": session_id,
                        "project_id": project_id,
                        "started_at": analysis.started_at.isoformat() if analysis.started_at else None,
                        "completed_at": None,
                        "status": "running",
                        "analysis_types": [],
                        "errors": []
                    }

                # Add analysis type
                if analysis.analysis_type:
                    executions[session_id]["analysis_types"].append(analysis.analysis_type)

                # Update status if all analyses in session are complete
                if analysis.status == "completed":
                    executions[session_id]["status"] = "completed"
                    if analysis.completed_at:
                        executions[session_id]["completed_at"] = analysis.completed_at.isoformat()
                elif analysis.status == "failed":
                    executions[session_id]["status"] = "failed"
                    if analysis.error:
                        executions[session_id]["errors"].append(analysis.error)

            executions_list = list(executions.values())

            return {
                "success": True,
                "project_id": project_id,
                "executions": executions_list,
                "count": len(executions_list)
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching analyses: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch analyses: {str(e)}"
        )


@router.get("/analyses/{execution_id}/status")
async def get_analysis_status(
    execution_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get status of an analysis execution.

    Returns current progress and status.
    """
    try:
        async with get_db_context() as session:
            # Query analysis results for this execution
            analysis_stmt = select(AnalysisResult).where(
                AnalysisResult.session_id == execution_id
            )
            analysis_result = await session.execute(analysis_stmt)
            analyses = analysis_result.scalars().all()

            if not analyses:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Execution not found: {execution_id}"
                )

            # Verify user owns the project
            project = None
            if analyses:
                project_stmt = select(Project).where(
                    Project.id == analyses[0].project_id,
                    Project.user_id == current_user.id
                )
                project_result = await session.execute(project_stmt)
                project = project_result.scalar_one_or_none()

            if not project:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have access to this execution"
                )

            # Aggregate status
            total_analyses = len(analyses)
            completed = sum(1 for a in analyses if a.status == "completed")
            failed = sum(1 for a in analyses if a.status == "failed")
            running = sum(1 for a in analyses if a.status == "running")
            pending = sum(1 for a in analyses if a.status == "pending")

            # Determine overall status
            if failed > 0:
                overall_status = "failed"
            elif completed == total_analyses:
                overall_status = "completed"
            elif running > 0:
                overall_status = "running"
            else:
                overall_status = "pending"

            progress = int((completed / total_analyses) * 100) if total_analyses > 0 else 0

            return {
                "execution_id": execution_id,
                "status": overall_status,
                "progress": progress,
                "total_analyses": total_analyses,
                "completed": completed,
                "failed": failed,
                "running": running,
                "pending": pending,
                "started_at": analyses[0].started_at.isoformat() if analyses and analyses[0].started_at else None,
                "completed_at": max((a.completed_at for a in analyses if a.completed_at), default=None).isoformat() if any(a.completed_at for a in analyses) else None,
                "analyses": [
                    {
                        "id": a.id,
                        "analysis_type": a.analysis_type,
                        "status": a.status,
                        "error": a.error
                    }
                    for a in analyses
                ]
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching status: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch status: {str(e)}"
        )


@router.post("/analyses/{execution_id}/cancel")
async def cancel_analysis(
    execution_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Cancel a running analysis execution.

    Stops execution and returns partial results if available.
    """
    try:
        async with get_db_context() as session:
            # Query analysis results for this execution
            analysis_stmt = select(AnalysisResult).where(
                AnalysisResult.session_id == execution_id
            )
            analysis_result = await session.execute(analysis_stmt)
            analyses = analysis_result.scalars().all()

            if not analyses:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Execution not found: {execution_id}"
                )

            # Verify user owns the project
            project = None
            if analyses:
                project_stmt = select(Project).where(
                    Project.id == analyses[0].project_id,
                    Project.user_id == current_user.id
                )
                project_result = await session.execute(project_stmt)
                project = project_result.scalar_one_or_none()

            if not project:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to cancel this execution"
                )

            # Check if any analysis can be cancelled
            can_cancel = any(a.status in ["pending", "running"] for a in analyses)

            if not can_cancel:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot cancel execution: no pending or running analyses"
                )

            # Update all analyses to cancelled
            for analysis in analyses:
                if analysis.status in ["pending", "running"]:
                    analysis.status = "cancelled"
                    analysis.completed_at = datetime.utcnow()

            await session.commit()

            # Also update in-memory execution if exists
            execution = _active_executions.get(execution_id)
            if execution and hasattr(execution, 'status'):
                execution.status = "cancelled"
                execution.completed_at = datetime.utcnow()

        return {
            "success": True,
            "execution_id": execution_id,
            "status": "cancelled",
            "message": "Analysis cancelled"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cancel error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cancel: {str(e)}"
        )


@router.get("/projects/{project_id}/results")
async def get_analysis_results(
    project_id: str,
    execution_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Get analysis results for a project.

    Returns latest results or results from specific execution.
    """
    try:
        # If execution_id provided, get that execution
        if execution_id:
            execution = _active_executions.get(execution_id)
        else:
            # Get latest completed execution for project
            project_executions = [
                e for e in _active_executions.values()
                if e.project_id == project_id and e.status == "completed"
            ]
            execution = project_executions[-1] if project_executions else None

        if not execution:
            return {
                "success": True,
                "project_id": project_id,
                "results": None,
                "message": "No results available yet"
            }

        return {
            "success": True,
            "execution_id": execution.execution_id if hasattr(execution, 'execution_id') else execution_id,
            "project_id": project_id,
            "results": execution.results if hasattr(execution, 'results') else None,
            "status": execution.status if hasattr(execution, 'status') else "unknown",
            "completed_at": execution.completed_at if hasattr(execution, 'completed_at') else None
        }

    except Exception as e:
        logger.error(f"Error fetching results: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch results: {str(e)}"
        )


# ============================================================================
# Analysis Types
# ============================================================================

@router.get("/analysis/types")
async def get_analysis_types():
    """
    Get available analysis types.

    Returns list of analysis types with descriptions and requirements.
    """
    analysis_types = [
        {
            "id": "descriptive_stats",
            "name": "Descriptive Statistics",
            "description": "Mean, median, mode, std dev, quartiles",
            "required_columns": [],
            "optional_columns": []
        },
        {
            "id": "correlation",
            "name": "Correlation Analysis",
            "description": "Correlation matrix and significant correlations",
            "required_columns": ["numeric"],
            "optional_columns": []
        },
        {
            "id": "regression",
            "name": "Regression Analysis",
            "description": "Linear, logistic regression",
            "required_columns": ["target", "features"],
            "optional_columns": []
        },
        {
            "id": "clustering",
            "name": "Clustering Analysis",
            "description": "K-means, hierarchical clustering",
            "required_columns": ["features"],
            "optional_columns": []
        },
        {
            "id": "time_series",
            "name": "Time Series Analysis",
            "description": "Trend, seasonality, forecasting",
            "required_columns": ["date", "value"],
            "optional_columns": []
        },
        {
            "id": "statistical_tests",
            "name": "Statistical Tests",
            "description": "T-tests, ANOVA, chi-square",
            "required_columns": [],
            "optional_columns": ["group"]
        },
        {
            "id": "classification",
            "name": "Classification Analysis",
            "description": "Decision tree, random forest, logistic regression",
            "required_columns": ["target", "features"],
            "optional_columns": []
        },
        {
            "id": "eda",
            "name": "Exploratory Data Analysis",
            "description": "Data distribution, outliers, patterns",
            "required_columns": [],
            "optional_columns": []
        }
    ]

    return {
        "success": True,
        "analysis_types": analysis_types
    }


# ============================================================================
# Quick Analysis (for interactive exploration)
# ============================================================================

@router.post("/projects/{project_id}/quick-analysis")
async def quick_analysis(
    project_id: str,
    column: str,
    current_user: User = Depends(get_current_user)
):
    """
    Perform quick exploratory analysis on a single column.

    Fast analysis for data exploration.
    """
    try:
        return {
            "success": True,
            "project_id": project_id,
            "column": column,
            "analysis": {
                "type": "numeric",
                "histogram": [],
                "statistics": {},
                "outliers": []
            }
        }

    except Exception as e:
        logger.error(f"Quick analysis error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Quick analysis failed: {str(e)}"
        )


# ============================================================================
# Legacy API Compatibility (for frontend migration)
# ============================================================================

class LegacyAnalysisRequest(BaseModel):
    """Legacy analysis request format from Node.js backend"""
    projectId: str
    analysisTypes: List[str] = Field(..., description="Types of analysis to execute")
    analysisPath: Optional[List[str]] = None
    questionAnswerMapping: Optional[Dict[str, Any]] = None
    previewOnly: bool = False
    config: Optional[Dict[str, Any]] = None


# Create a separate router for legacy endpoints without /api/v1 prefix
legacy_router = APIRouter(tags=["analysis-legacy"])


@legacy_router.post("/api/analysis-execution/execute")
async def execute_analysis_legacy(
    request: LegacyAnalysisRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """
    Legacy analysis execution endpoint for frontend compatibility.

    This endpoint provides compatibility with the existing frontend which
    expects the Node.js backend API format. It translates requests to the
    new Python backend format using the agent orchestrator.
    """
    try:
        from ..services.agent_orchestrator import get_orchestrator

        orchestrator = get_orchestrator()

        # Extract user goals and questions from config
        user_goals = request.config.get("user_goals", []) if request.config else []
        user_questions = request.config.get("questions", []) if request.config else []

        # Create orchestrator session
        session_id = orchestrator.create_session(
            project_id=request.projectId,
            user_id=str(current_user.id) if current_user else "unknown",
            user_goals=user_goals,
            user_questions=user_questions
        )

        # Add analysis types to session state
        session = orchestrator.get_session(session_id)
        if session and request.analysisTypes:
            session["analysis_types"] = request.analysisTypes
            session["question_mappings"] = (
                request.questionAnswerMapping.get("mappings", [])
                if request.questionAnswerMapping else []
            )

        # Execute workflow in background
        async def run_analysis_workflow():
            try:
                # Advance through all workflow steps
                result = orchestrator.advance_session(session_id)
                logger.info(f"Workflow completed for session {session_id}: {result}")
            except Exception as e:
                logger.error(f"Workflow error for session {session_id}: {e}", exc_info=True)

        # Add background task
        background_tasks.add_task(run_analysis_workflow)

        # Return immediate response with execution details
        return {
            "success": True,
            "execution_id": session_id,
            "project_id": request.projectId,
            "status": "running",
            "results": {
                "analyses": [],
                "insights": [],
                "artifacts": [],
                "evidence_chain": []
            },
            "workflow": {
                "execution_id": session_id,
                "status": "running",
                "steps": ["upload", "pii_review", "mapping", "transformation", "execution", "results"]
            }
        }

    except Exception as e:
        logger.error(f"Analysis execution error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis execution failed: {str(e)}"
        )


@legacy_router.get("/api/projects/{project_id}/analysis-status")
async def get_project_analysis_status(project_id: str):
    """
    Get analysis status for a project (legacy endpoint).
    """
    try:
        # Find active executions for this project
        executions = [
            e for e in _active_executions.values()
            if e.project_id == project_id
        ]

        if not executions:
            return {
                "success": True,
                "project_id": project_id,
                "status": "not_started",
                "executions": []
            }

        # Return the most recent execution
        latest_execution = max(executions, key=lambda e: e.started_at)

        return {
            "success": True,
            "project_id": project_id,
            "status": latest_execution.status,
            "execution": latest_execution.dict() if hasattr(latest_execution, 'dict') else latest_execution
        }

    except Exception as e:
        logger.error(f"Error getting status: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get status: {str(e)}"
        )
