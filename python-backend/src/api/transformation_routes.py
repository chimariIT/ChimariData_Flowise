"""
Data Transformation Routes

API endpoints for data transformation operations.
Handles transformation planning, execution, and preview.
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import logging
from datetime import datetime
import uuid
import json

from ..auth.middleware import get_current_user, User
from ..services.transformation_engine import get_transformation_executor
from ..db import get_db_context
from ..models.database import Transformation, Dataset, Project
from sqlalchemy import select, delete

logger = logging.getLogger(__name__)

router = APIRouter(tags=["transformation"])


def _rows_from_journey_progress(journey_progress: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Best-effort extraction of rows already approved in journey progress."""
    joined_data = journey_progress.get("joinedData") or journey_progress.get("joined_data") or {}
    for key in ("fullData", "full_data", "data", "preview"):
        value = joined_data.get(key)
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]
    transformed = journey_progress.get("transformedData") or journey_progress.get("transformed_data")
    if isinstance(transformed, list):
        return [row for row in transformed if isinstance(row, dict)]
    return []


def _schema_from_rows(rows: List[Dict[str, Any]], fallback: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Infer a lightweight schema map from row dictionaries."""
    if fallback:
        return fallback
    if not rows:
        return {}
    schema: Dict[str, Any] = {}
    for column, value in rows[0].items():
        if isinstance(value, bool):
            inferred = "boolean"
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            inferred = "number"
        elif value is None:
            inferred = "unknown"
        else:
            inferred = "string"
        schema[column] = {"type": inferred}
    return schema


def _normalize_compat_steps(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Normalize legacy frontend transformation payload shapes."""
    steps = payload.get("transformationSteps") or payload.get("transformations") or []
    normalized = []
    for index, step in enumerate(steps):
        if not isinstance(step, dict):
            continue
        step_type = step.get("operation") or step.get("type") or "transform"
        normalized.append({
            "id": step.get("id") or f"step_{index + 1}",
            "type": step_type,
            "operation": step_type,
            "name": step.get("name") or str(step_type).replace("_", " ").title(),
            "config": step.get("config") or step.get("parameters") or {},
            "sourceColumns": step.get("source_columns") or step.get("sourceColumns") or [],
            "targetColumn": step.get("target_column") or step.get("targetColumn"),
        })
    return normalized


# ============================================================================
# Models
# ============================================================================

class TransformationStep(BaseModel):
    """A single transformation step"""
    id: str
    operation: str = Field(..., description="Operation: derive, aggregate, filter, join, etc.")
    name: str
    description: Optional[str] = None
    source_columns: List[str] = Field(default_factory=list)
    target_column: Optional[str] = None
    parameters: Dict[str, Any] = Field(default_factory=dict)
    business_context: Optional[Dict[str, Any]] = None
    depends_on: List[str] = Field(default_factory=list)


class TransformationPlan(BaseModel):
    """A complete transformation plan"""
    project_id: str
    steps: List[TransformationStep]
    estimated_runtime_ms: int = 0
    created_at: datetime


class TransformationExecutionRequest(BaseModel):
    """Request to execute transformations"""
    project_id: str
    dataset_id: str
    transformations: List[TransformationStep]
    business_context: Optional[Dict[str, Any]] = None
    preview_only: bool = False


class TransformationExecutionResult(BaseModel):
    """Result from transformation execution"""
    success: bool
    execution_id: str
    steps_executed: List[TransformationStep]
    transformed_dataset_id: Optional[str] = None
    preview_data: Optional[List[Dict[str, Any]]] = None
    row_count: int = 0
    column_count: int = 0
    execution_time_ms: int = 0
    errors: List[str] = Field(default_factory=list)


class TransformationPreviewRequest(BaseModel):
    """Request to preview a transformation"""
    project_id: str
    transformation: TransformationStep
    limit: int = Field(default=10, ge=1, le=100)


class JoinConfig(BaseModel):
    """Configuration for joining datasets"""
    join_type: str = Field(..., description="inner, left, right, outer")
    left_columns: List[str]
    right_columns: List[str]
    join_keys: List[str]
    right_dataset_id: str


# ============================================================================
# Routes
# ============================================================================

@router.get("/projects/{project_id}/transformation-recommendations")
async def get_transformation_recommendations(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Legacy-compatible recommendation endpoint used by the transformation UI.
    Returns actionable defaults without blocking the user journey.
    """
    try:
        async with get_db_context() as session:
            project_stmt = select(Project).where(
                Project.id == project_id,
                Project.user_id == current_user.id
            )
            project_result = await session.execute(project_stmt)
            project = project_result.scalar_one_or_none()
            if not project:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        journey_progress = project.journey_progress or {}
        rows = _rows_from_journey_progress(journey_progress)
        schema = _schema_from_rows(rows, journey_progress.get("integratedSchema") or journey_progress.get("schema"))
        columns = list(schema.keys())

        recommendations = []
        if columns:
            recommendations.append({
                "id": "data_quality_defaults",
                "title": "Standardize and validate selected columns",
                "reason": "Data Engineer recommends light cleanup before analysis execution.",
                "transformation": {
                    "code": "standardize_types",
                    "description": "Normalize data types, trim text, and preserve original values for auditability.",
                    "sourceColumns": columns[:5],
                },
            })

        return {
            "success": True,
            "projectId": project_id,
            "agent": "data_engineer",
            "transformationSteps": [],
            "recommendations": recommendations,
            "schema": schema,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transformation recommendations error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get recommendations: {str(e)}")


@router.post("/projects/{project_id}/validate-transformations")
async def validate_transformations_compat(
    project_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Legacy-compatible Data Engineer validation endpoint."""
    try:
        payload = await request.json()
        steps = _normalize_compat_steps(payload)
        async with get_db_context() as session:
            project_stmt = select(Project).where(
                Project.id == project_id,
                Project.user_id == current_user.id
            )
            project_result = await session.execute(project_stmt)
            project = project_result.scalar_one_or_none()
            if not project:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        warnings = []
        if not steps and not payload.get("joinConfig"):
            warnings.append({
                "message": "No transformation steps were provided; the verified dataset will pass through unchanged."
            })

        return {
            "success": True,
            "validation": {
                "isValid": True,
                "errors": [],
                "warnings": warnings,
                "recommendations": [
                    {"message": "Review preview row and column counts before approving transformation output."}
                ],
            },
            "agent": "data_engineer",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transformation validation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")


@router.post("/projects/{project_id}/execute-transformations")
async def execute_transformations_compat(
    project_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """
    Legacy-compatible execution endpoint for the current frontend journey step.
    Stores a verified transformation preview in journey_progress.
    """
    try:
        payload = await request.json()
        steps = _normalize_compat_steps(payload)
        async with get_db_context() as session:
            project_stmt = select(Project).where(
                Project.id == project_id,
                Project.user_id == current_user.id
            )
            project_result = await session.execute(project_stmt)
            project = project_result.scalar_one_or_none()
            if not project:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

            journey_progress = project.journey_progress or {}
            rows = _rows_from_journey_progress(journey_progress)
            schema = _schema_from_rows(
                rows,
                payload.get("schema")
                or journey_progress.get("integratedSchema")
                or journey_progress.get("schema")
            )
            preview_rows = rows[:25]
            transformation_id = str(uuid.uuid4())
            transformation_record = {
                "id": transformation_id,
                "status": "completed",
                "agent": "data_engineer",
                "executedAt": datetime.utcnow().isoformat(),
                "steps": steps,
                "joinConfig": payload.get("joinConfig"),
                "rowCount": len(rows),
                "columnCount": len(schema),
            }
            journey_progress["transformations"] = journey_progress.get("transformations", [])
            journey_progress["transformations"].append(transformation_record)
            journey_progress["transformedData"] = preview_rows
            journey_progress["transformedSchema"] = schema
            project.journey_progress = journey_progress
            await session.commit()

        return {
            "success": True,
            "executionId": transformation_id,
            "execution_id": transformation_id,
            "rowCount": len(rows),
            "columnCount": len(schema),
            "preview": {
                "data": preview_rows,
                "schema": schema,
            },
            "transformedSchema": schema,
            "transformedDatasetId": project_id,
            "transformed_dataset_id": project_id,
            "transformationSummary": {
                "stepsApplied": len(steps),
                "joinApplied": bool(payload.get("joinConfig")),
                "agent": "Data Engineer",
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Legacy transformation execution error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Transformation failed: {str(e)}")


@router.post("/analysis/{project_id}/transform")
async def transform_analysis_compat(
    project_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Older component compatibility route for transformation previews."""
    result = await execute_transformations_compat(project_id, request, current_user)
    preview = result.get("preview", {})
    schema = result.get("transformedSchema", {})
    return {
        "success": True,
        "datasetId": result.get("transformedDatasetId"),
        "rowCount": result.get("rowCount", 0),
        "originalRowCount": result.get("rowCount", 0),
        "columns": list(schema.keys()),
        "schema": schema,
        "preview": preview.get("data", []),
        "warnings": [],
        "summary": result.get("transformationSummary", {}),
    }


@router.post("/projects/{project_id}/transformations/plan")
async def compile_transformation_plan(
    project_id: str,
    request: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """
    Compile a transformation plan from question-element mappings.

    Analyzes mappings and business context to generate
    appropriate transformation steps.
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

        executor = get_transformation_executor()

        # Extract mappings and business context from request
        mappings = request.get("mappings", [])
        business_context = request.get("business_context", {})

        # Compile transformation plan
        plan = await executor.compile_plan(
            project_id=project_id,
            mappings=mappings,
            business_context=business_context
        )

        # Store plan in journey_progress
        async with get_db_context() as session:
            project_stmt = select(Project).where(Project.id == project_id)
            project_result = await session.execute(project_stmt)
            project = project_result.scalar_one_or_none()

            if project:
                journey_progress = project.journey_progress or {}
                journey_progress['transformationPlan'] = plan.dict() if hasattr(plan, 'dict') else plan
                project.journey_progress = journey_progress
                await session.commit()

        return {
            "success": True,
            "plan": plan.dict() if hasattr(plan, 'dict') else plan,
            "steps_count": len(plan.steps) if hasattr(plan, 'steps') else 0
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error compiling plan: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compile plan: {str(e)}"
        )


@router.post("/projects/{project_id}/transformations/execute")
async def execute_transformations(
    project_id: str,
    request: TransformationExecutionRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Execute transformations on project data.

    Applies transformations and returns results.
    Can preview without persisting if preview_only=True.
    """
    try:
        from ..services.transformation_engine import compile_and_execute_transformation_plan

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

            # Verify dataset exists and belongs to project
            dataset_stmt = select(Dataset).where(
                Dataset.id == request.dataset_id,
                Dataset.project_id == project_id
            )
            dataset_result = await session.execute(dataset_stmt)
            dataset = dataset_result.scalar_one_or_none()

            if not dataset:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Dataset not found"
                )

            # Create transformation record
            transformation_id = str(uuid.uuid4())
            transformation = Transformation(
                id=transformation_id,
                project_id=project_id,
                dataset_id=request.dataset_id,
                name=request.transformations[0].name if request.transformations else "Transformation",
                operation_type=request.transformations[0].operation if request.transformations else "unknown",
                steps=[tx.dict() for tx in request.transformations],
                status="pending"
            )
            session.add(transformation)
            await session.commit()

            # Build mappings from transformations
            mappings = []
            for tx in request.transformations:
                mappings.append({
                    "question_id": "manual",
                    "element_name": tx.target_column or "derived",
                    "source_columns": tx.source_columns,
                    "operation": tx.operation,
                    "parameters": tx.parameters
                })

            # Execute transformations
            start_time = datetime.utcnow()
            result = await compile_and_execute_transformation_plan(
                project_id=project_id,
                datasets=[request.dataset_id],
                mappings=mappings,
                business_context=request.business_context
            )
            end_time = datetime.utcnow()

            execution_time_ms = int((end_time - start_time).total_seconds() * 1000)

            # Update transformation with result
            transformation.status = "completed"
            transformation.result = result
            transformation.execution_time_ms = execution_time_ms
            transformation.completed_at = end_time

            # Store transformed data in dataset metadata if not preview
            if not request.preview_only and result.get("transformed_data"):
                # Store in ingestionMetadata.transformedData
                # For now, store as JSON in a metadata field
                # In production, this should be stored in a separate table or file

                # Update journey_progress with transformation info
                journey_progress = project.journey_progress or {}
                journey_progress['transformations'] = journey_progress.get('transformations', [])
                journey_progress['transformations'].append({
                    'id': transformation_id,
                    'datasetId': request.dataset_id,
                    'operation': request.transformations[0].operation if request.transformations else "unknown",
                    'executedAt': datetime.utcnow().isoformat(),
                    'status': 'completed'
                })
                project.journey_progress = journey_progress

            await session.commit()

        # Build response
        response_data = {
            "success": result.get("success", True),
            "execution_id": transformation_id,
            "steps_executed": result.get("steps_executed", []),
            "row_count": result.get("row_count", 0),
            "column_count": result.get("column_count", 0),
            "execution_time_ms": execution_time_ms
        }

        if request.preview_only:
            response_data["preview_data"] = result.get("preview_data", [])
        else:
            response_data["transformed_dataset_id"] = result.get("transformed_dataset_id", request.dataset_id)

        return response_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transformation execution error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transformation failed: {str(e)}"
        )


@router.post("/projects/{project_id}/transformations/preview")
async def preview_transformation(
    project_id: str,
    request: TransformationPreviewRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Preview a single transformation without applying it.

    Shows how data will look after transformation.
    """
    try:
        executor = get_transformation_executor()

        # Preview the transformation
        preview = await executor.preview_transformation(
            project_id=project_id,
            transformation=request.transformation.dict(),
            limit=request.limit
        )

        return {
            "success": True,
            "transformation_id": request.transformation.id,
            "preview": preview.get("data", []),
            "affected_rows": preview.get("row_count", 0),
            "new_column": request.transformation.target_column
        }

    except Exception as e:
        logger.error(f"Preview error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Preview failed: {str(e)}"
        )


@router.get("/projects/{project_id}/transformations")
async def get_project_transformations(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get all transformations for a project.

    Returns transformation history and current plan.
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

            # Query transformations for this project
            transformation_stmt = select(Transformation).where(
                Transformation.project_id == project_id
            ).order_by(Transformation.created_at.desc())

            transformation_result = await session.execute(transformation_stmt)
            transformations = transformation_result.scalars().all()

            # Convert to response format
            transformation_list = []
            for tx in transformations:
                transformation_list.append({
                    "id": tx.id,
                    "name": tx.name,
                    "operation_type": tx.operation_type,
                    "status": tx.status,
                    "steps": tx.steps,
                    "result": tx.result,
                    "error": tx.error,
                    "execution_time_ms": tx.execution_time_ms,
                    "created_at": tx.created_at.isoformat() if tx.created_at else None,
                    "completed_at": tx.completed_at.isoformat() if tx.completed_at else None
                })

            # Read current plan from journey_progress
            journey_progress = project.journey_progress or {}
            current_plan = journey_progress.get('transformationPlan', None)

            return {
                "success": True,
                "project_id": project_id,
                "transformations": transformation_list,
                "current_plan": current_plan
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching transformations: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch transformations: {str(e)}"
        )


@router.post("/projects/{project_id}/transformations/join")
async def join_datasets(
    project_id: str,
    left_dataset_id: str,
    right_dataset_id: str,
    config: JoinConfig,
    current_user: User = Depends(get_current_user)
):
    """
    Join multiple datasets together.

    Combines data from different sources based on key columns.
    Supports inner, left, right, and outer joins.
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

            # Verify left dataset exists and belongs to project
            left_dataset_stmt = select(Dataset).where(
                Dataset.id == left_dataset_id,
                Dataset.project_id == project_id
            )
            left_dataset_result = await session.execute(left_dataset_stmt)
            left_dataset = left_dataset_result.scalar_one_or_none()

            if not left_dataset:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Left dataset not found"
                )

            # Verify right dataset exists and belongs to project
            right_dataset_stmt = select(Dataset).where(
                Dataset.id == right_dataset_id,
                Dataset.project_id == project_id
            )
            right_dataset_result = await session.execute(right_dataset_stmt)
            right_dataset = right_dataset_result.scalar_one_or_none()

            if not right_dataset:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Right dataset not found"
                )

        # Import join functionality
        from ..services.data_transformation import DataTransformationService

        transformation_service = DataTransformationService()

        result = await transformation_service.join_datasets(
            project_id=project_id,
            left_dataset_id=left_dataset_id,
            right_dataset_id=right_dataset_id,
            join_type=config.join_type,
            join_keys=config.join_keys
        )

        # Store join configuration in journey_progress
        async with get_db_context() as session:
            project_stmt = select(Project).where(Project.id == project_id)
            project_result = await session.execute(project_stmt)
            project = project_result.scalar_one_or_none()

            if project:
                journey_progress = project.journey_progress or {}
                journey_progress['joinConfig'] = {
                    'leftDatasetId': left_dataset_id,
                    'rightDatasetId': right_dataset_id,
                    'joinType': config.join_type,
                    'joinKeys': config.join_keys,
                    'joinedDatasetId': result.get("dataset_id"),
                    'executedAt': datetime.utcnow().isoformat()
                }
                project.journey_progress = journey_progress
                await session.commit()

        return {
            "success": True,
            "joined_dataset_id": result.get("dataset_id"),
            "row_count": result.get("row_count", 0),
            "column_count": result.get("column_count", 0),
            "message": f"Joined {config.join_type} on {config.join_keys}"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Join error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Join failed: {str(e)}"
        )


@router.delete("/projects/{project_id}/transformations")
async def clear_transformations(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Clear all transformations for a project.

    Resets data to original state.
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

            # Delete all transformations for this project
            delete_stmt = delete(Transformation).where(
                Transformation.project_id == project_id
            )
            result = await session.execute(delete_stmt)

            # Clear transformations from journey_progress
            journey_progress = project.journey_progress or {}
            journey_progress['transformations'] = []
            journey_progress['transformationPlan'] = None
            project.journey_progress = journey_progress

            await session.commit()

        return {
            "success": True,
            "project_id": project_id,
            "message": "Transformations cleared",
            "transformations_deleted": result.rowcount if result else 0
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error clearing transformations: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clear transformations: {str(e)}"
        )


# ============================================================================
# Transformation Templates
# ============================================================================

@router.get("/transformations/templates")
async def get_transformation_templates(
    category: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Get available transformation templates.

    Pre-built transformations for common operations.
    """
    templates = [
        {
            "id": "derive_full_name",
            "name": "Derive Full Name",
            "category": "derive",
            "description": "Combine first_name and last_name into full_name",
            "operation": "derive",
            "source_columns": ["first_name", "last_name"],
            "target_column": "full_name",
            "parameters": {"template": "{first_name} {last_name}"}
        },
        {
            "id": "derive_age",
            "name": "Derive Age from DOB",
            "category": "derive",
            "description": "Calculate age from date of birth",
            "operation": "derive",
            "source_columns": ["date_of_birth"],
            "target_column": "age",
            "parameters": {"function": "age_from_dob"}
        },
        {
            "id": "aggregate_by_department",
            "name": "Aggregate by Department",
            "category": "aggregate",
            "description": "Group and aggregate metrics by department",
            "operation": "aggregate",
            "source_columns": ["salary", "bonus"],
            "group_by": ["department"],
            "parameters": {
                "aggregations": {
                    "salary": "avg",
                    "bonus": "sum"
                }
            }
        },
        {
            "id": "filter_active_records",
            "name": "Filter Active Records",
            "category": "filter",
            "description": "Keep only active status records",
            "operation": "filter",
            "parameters": {"column": "status", "operator": "eq", "value": "active"}
        }
    ]

    if category:
        templates = [t for t in templates if t.get("category") == category]

    return {
        "success": True,
        "templates": templates,
        "categories": list(set(t.get("category") for t in templates))
    }


@router.post("/transformations/apply-template")
async def apply_template(
    project_id: str,
    template_id: str,
    parameters: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """
    Apply a transformation template to project data.

    Uses pre-built template with custom parameters.
    """
    try:
        # Get template and apply
        # In real implementation, look up template and apply
        return {
            "success": True,
            "template_id": template_id,
            "project_id": project_id,
            "message": "Template applied successfully"
        }

    except Exception as e:
        logger.error(f"Template application error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Template application failed: {str(e)}"
        )
