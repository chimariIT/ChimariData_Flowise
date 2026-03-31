"""
Data Verification Routes

API endpoints for data verification including PII detection and data quality checks.
"""

from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
import logging
from datetime import datetime
import pandas as pd
import os

from ..services.data_verification import get_verification_service, VerificationResult
from ..auth.middleware import get_current_user, User
from ..db import get_db_context
from ..models.database import Dataset, Project
from sqlalchemy import select
from ..constants import DATASET_DATA_ROW_CAP

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["verification"])


# ============================================================================
# Request/Response Models
# ============================================================================

class VerifyDatasetRequest(BaseModel):
    """Request to verify a dataset"""
    project_id: str = Field(..., description="Project ID")
    dataset_id: str = Field(..., description="Dataset ID to verify")
    data: Optional[Dict[str, Any]] = Field(None, description="Dataset data (if not already loaded)")


class VerificationResponse(BaseModel):
    """Response from verification"""
    success: bool
    result: Optional[VerificationResult] = None
    error: Optional[str] = None


class PIIDecisionRequest(BaseModel):
    """User decision on PII handling"""
    project_id: str
    dataset_id: str
    pii_decision: str = Field(..., description="Decision: 'allow', 'anonymize', or 'remove'")
    pii_fields: list[str] = Field(default_factory=list, description="Fields to apply decision to")


# ============================================================================
# Routes
# ============================================================================

@router.post("/projects/{project_id}/verify", response_model=VerificationResponse)
async def verify_project(
    project_id: str,
    request: Optional[VerifyDatasetRequest] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Verify project data for PII and quality issues.

    This endpoint:
    - Detects PII in dataset columns using Presidio
    - Assesses data quality (completeness, uniqueness, validity)
    - Generates recommendations for data handling

    Returns comprehensive verification report for user review.
    """
    try:
        verification_service = get_verification_service()

        # If request body provided, use its dataset_id
        dataset_id = request.dataset_id if request else None

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

            # Query dataset
            dataset_stmt = select(Dataset).where(Dataset.id == dataset_id)
            dataset_result = await session.execute(dataset_stmt)
            dataset = dataset_result.scalar_one_or_none()

            if not dataset:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Dataset not found: {dataset_id}"
                )

            # Load data from file
            data = None
            if dataset.file_path and os.path.exists(dataset.file_path):
                try:
                    # Read file based on source type or extension
                    if dataset.source_type == "csv" or dataset.file_path.endswith(".csv"):
                        df = pd.read_csv(dataset.file_path, nrows=DATASET_DATA_ROW_CAP)
                    elif dataset.source_type in ["xlsx", "xls"] or dataset.file_path.endswith((".xlsx", ".xls")):
                        df = pd.read_excel(dataset.file_path, nrows=DATASET_DATA_ROW_CAP)
                    elif dataset.source_type == "json" or dataset.file_path.endswith(".json"):
                        df = pd.read_json(dataset.file_path, nrows=DATASET_DATA_ROW_CAP)
                    else:
                        # Default to CSV
                        df = pd.read_csv(dataset.file_path, nrows=DATASET_DATA_ROW_CAP)

                    data = df

                except Exception as e:
                    logger.error(f"Error loading dataset file: {e}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Failed to load dataset file: {str(e)}"
                    )
            elif request and request.data:
                # Use provided data
                data = request.data

            if data is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No data available for verification"
                )

            # Run verification
            result = await verification_service.verify_dataset(
                project_id=project_id,
                dataset_id=dataset_id,
                data=data,
                schema=dataset.schema
            )

            # Update dataset with PII analysis
            pii_analysis_list = [field.dict() for field in result.pii_fields]
            dataset.pii_analysis = pii_analysis_list

            # Update journey progress with PII detection results
            journey_progress = project.journey_progress or {}
            journey_progress['piiDetection'] = {
                'detected': result.pii_detected,
                'fields': pii_analysis_list,
                'verifiedAt': datetime.utcnow().isoformat()
            }
            project.journey_progress = journey_progress

            await session.commit()

        return VerificationResponse(
            success=True,
            result=result
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Verification error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Verification failed: {str(e)}"
        )


@router.put("/projects/{project_id}/pii-decision")
async def record_pii_decision(
    project_id: str,
    decision: PIIDecisionRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Record user's decision on PII handling.

    After PII detection, user decides to:
    - allow: Keep PII data as-is
    - anonymize: Mask/hash PII fields
    - remove: Delete PII fields entirely

    This endpoint records the decision and applies it if needed.
    """
    try:
        # Validate decision
        valid_decisions = ["allow", "anonymize", "remove"]
        if decision.pii_decision not in valid_decisions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid decision. Must be one of: {valid_decisions}"
            )

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

            # Update dataset with PII decision
            dataset_stmt = select(Dataset).where(
                Dataset.id == decision.dataset_id,
                Dataset.project_id == project_id
            )
            dataset_result = await session.execute(dataset_stmt)
            dataset = dataset_result.scalar_one_or_none()

            if not dataset:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Dataset not found: {decision.dataset_id}"
                )

            # Store decision in dataset
            dataset.pii_decision = {
                'decision': decision.pii_decision,
                'fields': decision.pii_fields,
                'decidedAt': datetime.utcnow().isoformat()
            }

            # Store decision in journey progress (SSOT)
            journey_progress = project.journey_progress or {}
            journey_progress['piiDecision'] = {
                'decision': decision.pii_decision,
                'datasetId': decision.dataset_id,
                'fields': decision.pii_fields,
                'decidedAt': datetime.utcnow().isoformat(),
                'status': 'approved'
            }
            project.journey_progress = journey_progress

            await session.commit()

        return {
            "success": True,
            "message": f"PII decision recorded: {decision.pii_decision}",
            "project_id": project_id,
            "decision": decision.pii_decision,
            "affected_fields": decision.pii_fields
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PII decision error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record PII decision: {str(e)}"
        )


@router.get("/projects/{project_id}/verification-status")
async def get_verification_status(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get current verification status for a project.

    Returns whether PII review is complete and what decisions were made.
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

            # Read from journey_progress
            journey_progress = project.journey_progress or {}
            pii_decision = journey_progress.get('piiDecision', {})
            pii_detection = journey_progress.get('piiDetection', {})

            return {
                "success": True,
                "project_id": project_id,
                "verified": pii_decision.get('status') == 'approved',
                "pii_detected": pii_detection.get('detected', False),
                "pii_decision": pii_decision.get('decision'),
                "pii_decision_at": pii_decision.get('decidedAt'),
                "pii_fields": pii_detection.get('fields', [])
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Verification status error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get verification status: {str(e)}"
        )


@router.post("/datasets/{dataset_id}/profile")
async def profile_dataset(
    dataset_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Generate detailed profile for a dataset.

    Returns column statistics, types, and sample values.
    Useful for data exploration and understanding.
    """
    try:
        verification_service = get_verification_service()

        async with get_db_context() as session:
            # Query dataset
            dataset_stmt = select(Dataset).where(Dataset.id == dataset_id)
            dataset_result = await session.execute(dataset_stmt)
            dataset = dataset_result.scalar_one_or_none()

            if not dataset:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Dataset not found: {dataset_id}"
                )

            # Verify user owns the project
            project_stmt = select(Project).where(
                Project.id == dataset.project_id,
                Project.user_id == current_user.id
            )
            project_result = await session.execute(project_stmt)
            project = project_result.scalar_one_or_none()

            if not project:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have access to this dataset"
                )

            # Load data from file
            df = None
            if dataset.file_path and os.path.exists(dataset.file_path):
                try:
                    if dataset.source_type == "csv" or dataset.file_path.endswith(".csv"):
                        df = pd.read_csv(dataset.file_path, nrows=DATASET_DATA_ROW_CAP)
                    elif dataset.source_type in ["xlsx", "xls"] or dataset.file_path.endswith((".xlsx", ".xls")):
                        df = pd.read_excel(dataset.file_path, nrows=DATASET_DATA_ROW_CAP)
                    elif dataset.source_type == "json" or dataset.file_path.endswith(".json"):
                        df = pd.read_json(dataset.file_path, nrows=DATASET_DATA_ROW_CAP)
                    else:
                        df = pd.read_csv(dataset.file_path, nrows=DATASET_DATA_ROW_CAP)
                except Exception as e:
                    logger.error(f"Error loading dataset file: {e}")

            if df is None:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Could not load dataset for profiling"
                )

            # Profile columns
            column_profiles = verification_service._profile_columns(df)

            return {
                "success": True,
                "dataset_id": dataset_id,
                "project_id": dataset.project_id,
                "columns": column_profiles,
                "row_count": len(df),
                "column_count": len(df.columns),
                "file_size": dataset.file_size,
                "created_at": dataset.created_at.isoformat() if dataset.created_at else None
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Dataset profiling error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Profiling failed: {str(e)}"
        )


# ============================================================================
# Bulk Verification
# ============================================================================

@router.post("/projects/{project_id}/verify-all")
async def verify_all_datasets(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Verify all datasets in a project.

    Runs PII detection and quality checks on all datasets
    and returns aggregated results.
    """
    try:
        verification_service = get_verification_service()

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

            # Query all datasets for this project
            dataset_stmt = select(Dataset).where(
                Dataset.project_id == project_id
            )
            dataset_result = await session.execute(dataset_stmt)
            datasets = dataset_result.scalars().all()

            datasets_verified = 0
            pii_detected_in = []
            quality_scores = []

            for dataset in datasets:
                # Load data from file
                df = None
                if dataset.file_path and os.path.exists(dataset.file_path):
                    try:
                        if dataset.source_type == "csv" or dataset.file_path.endswith(".csv"):
                            df = pd.read_csv(dataset.file_path, nrows=DATASET_DATA_ROW_CAP)
                        elif dataset.source_type in ["xlsx", "xls"] or dataset.file_path.endswith((".xlsx", ".xls")):
                            df = pd.read_excel(dataset.file_path, nrows=DATASET_DATA_ROW_CAP)
                        elif dataset.source_type == "json" or dataset.file_path.endswith(".json"):
                            df = pd.read_json(dataset.file_path, nrows=DATASET_DATA_ROW_CAP)
                        else:
                            df = pd.read_csv(dataset.file_path, nrows=DATASET_DATA_ROW_CAP)
                    except Exception as e:
                        logger.warning(f"Could not load dataset {dataset.id}: {e}")
                        continue

                if df is None:
                    continue

                # Verify dataset
                result = await verification_service.verify_dataset(
                    project_id=project_id,
                    dataset_id=dataset.id,
                    data=df,
                    schema=dataset.schema
                )

                datasets_verified += 1

                # Update dataset with PII analysis
                pii_analysis_list = [field.dict() for field in result.pii_fields]
                dataset.pii_analysis = pii_analysis_list

                if result.pii_detected:
                    pii_detected_in.append({
                        "dataset_id": dataset.id,
                        "dataset_name": dataset.name,
                        "pii_fields": pii_analysis_list
                    })

                quality_scores.append({
                    "dataset_id": dataset.id,
                    "completeness": result.data_quality.completeness,
                    "uniqueness": result.data_quality.uniqueness,
                    "validity": result.data_quality.validity,
                    "overall_score": result.data_quality.overall_score
                })

            # Calculate overall quality
            if quality_scores:
                overall_completeness = sum(s["completeness"] for s in quality_scores) / len(quality_scores)
                overall_uniqueness = sum(s["uniqueness"] for s in quality_scores) / len(quality_scores)
                overall_validity = sum(s["validity"] for s in quality_scores) / len(quality_scores)
            else:
                overall_completeness = 0.0
                overall_uniqueness = 0.0
                overall_validity = 0.0

            # Update journey progress
            journey_progress = project.journey_progress or {}
            journey_progress['bulkVerification'] = {
                'datasetsVerified': datasets_verified,
                'piiDetectedIn': pii_detected_in,
                'verifiedAt': datetime.utcnow().isoformat()
            }
            project.journey_progress = journey_progress

            await session.commit()

        return {
            "success": True,
            "project_id": project_id,
            "datasets_verified": datasets_verified,
            "pii_detected_in": pii_detected_in,
            "overall_quality": {
                "completeness": round(overall_completeness, 3),
                "uniqueness": round(overall_uniqueness, 3),
                "validity": round(overall_validity, 3)
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Bulk verification error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bulk verification failed: {str(e)}"
        )
