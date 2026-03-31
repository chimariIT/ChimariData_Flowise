"""
Data Upload Routes

API endpoints for dataset upload and management.
Handles file uploads, schema detection, and PII scanning.
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import logging
from datetime import datetime
import uuid
import os
from pathlib import Path

from ..auth.middleware import get_current_user, User
from ..db import get_db_context
from ..models.database import Dataset, Project
from sqlalchemy import select, delete
from ..constants import (
    DATASET_DATA_ROW_CAP,
    DATASET_PREVIEW_ROWS,
    DATASET_MINI_PREVIEW_ROWS,
    ALLOWED_UPLOAD_TYPES,
    MAX_UPLOAD_FILE_SIZE_BYTES
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["upload"])


# ============================================================================
# Models
# ============================================================================

class UploadResponse(BaseModel):
    """Response from dataset upload"""
    success: bool
    dataset_id: str
    filename: str
    file_type: str
    file_size: int
    record_count: int
    column_count: int
    schema: List[Dict[str, Any]]
    preview: List[Dict[str, Any]]
    upload_timestamp: datetime
    message: Optional[str] = None


class DatasetInfo(BaseModel):
    """Dataset information"""
    id: str
    project_id: str
    name: str
    filename: str
    file_type: str
    file_size: int
    record_count: int
    column_count: int
    schema: List[Dict[str, Any]]
    preview: List[Dict[str, Any]]
    created_at: datetime
    pii_scan_pending: bool = True


class MultiSourceUploadRequest(BaseModel):
    """Request for multi-source upload"""
    project_id: str
    source_type: str = "computer"  # computer, google_drive, onedrive, s3, etc.
    files: List[str] = Field(default_factory=list)
    connection_config: Optional[Dict[str, Any]] = None


class DataSourceConfig(BaseModel):
    """Configuration for external data sources"""
    source_type: str
    connection_params: Dict[str, Any]
    refresh_token: Optional[str] = None


# ============================================================================
# Data Upload Service
# ============================================================================

class DataUploadService:
    """Service for handling data uploads"""

    def __init__(self):
        self.upload_dir = "uploads/originals"
        self.supported_formats = {
            "csv": "text/csv",
            "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "xls": "application/vnd.ms-excel",
            "json": "application/json",
            "parquet": "application/octet-stream"
        }

    async def save_upload(
        self,
        file: UploadFile,
        project_id: str,
        user_id: str,
        source_type: str = "computer"
    ) -> UploadResponse:
        """
        Save uploaded file and process dataset.

        Args:
            file: Uploaded file
            project_id: Project ID
            user_id: User ID
            source_type: Source type (computer, google_drive, etc.)

        Returns:
            UploadResponse with dataset info
        """
        # Verify project exists and user owns it
        async with get_db_context() as session:
            project_stmt = select(Project).where(
                Project.id == project_id,
                Project.user_id == user_id
            )
            project_result = await session.execute(project_stmt)
            project = project_result.scalar_one_or_none()

            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found"
                )

        # Create unique filename
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{project_id}_{uuid.uuid4().hex[:12]}{file_ext}"
        file_path = Path(self.upload_dir) / unique_filename

        # Ensure upload directory exists
        file_path.parent.mkdir(parents=True, exist_ok=True)

        # Save file
        try:
            with open(file_path, "wb") as buffer:
                content = await file.read()
                buffer.write(content)
                file_size = len(content)
        except Exception as e:
            logger.error(f"Failed to save file: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save file: {str(e)}"
            )

        # Process file to extract schema and preview
        schema, preview, record_count = await self._process_file(file_path)

        # Generate dataset ID
        dataset_id = str(uuid.uuid4())

        # Create dataset record in database
        async with get_db_context() as session:
            dataset = Dataset(
                id=dataset_id,
                project_id=project_id,
                name=file.filename,
                source_type=source_type,
                file_path=str(file_path),
                file_size=file_size,
                record_count=record_count,
                schema=schema,
                pii_analysis=None,
                pii_decision=None,
                embeddings_generated=False,
                created_at=datetime.utcnow()
            )
            session.add(dataset)
            await session.commit()

        return UploadResponse(
            success=True,
            dataset_id=dataset_id,
            filename=file.filename,
            file_type=file_ext[1:] if file_ext else "unknown",
            file_size=file_size,
            record_count=record_count,
            column_count=len(schema),
            schema=schema,
            preview=preview,
            upload_timestamp=datetime.utcnow(),
            message=f"Successfully uploaded {file.filename}"
        )

    async def _process_file(
        self,
        file_path: str
    ) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]], int]:
        """
        Process uploaded file to extract schema, preview, and row count.

        Returns:
            Tuple of (schema, preview, record_count)
        """
        import pandas as pd

        file_ext = Path(file_path).suffix.lower()

        try:
            # Read file based on extension
            if file_ext == ".csv":
                df = pd.read_csv(file_path, nrows=DATASET_DATA_ROW_CAP)
            elif file_ext in [".xlsx", ".xls"]:
                df = pd.read_excel(file_path, nrows=DATASET_DATA_ROW_CAP)
            elif file_ext == ".json":
                df = pd.read_json(file_path, nrows=DATASET_DATA_ROW_CAP)
            elif file_ext == ".parquet":
                df = pd.read_parquet(file_path)
            else:
                raise ValueError(f"Unsupported file format: {file_ext}")

            # Extract schema
            schema = []
            for col in df.columns:
                dtype = str(df[col].dtype)
                if dtype == "object":
                    # Check if it's actually a datetime or numeric
                    if df[col].nunique() < len(df) * 0.5:
                        # Possibly categorical
                        schema.append({
                            "name": col,
                            "type": "categorical",
                            "nullable": df[col].isnull().any(),
                            "unique_count": int(df[col].nunique())
                        })
                    else:
                        schema.append({
                            "name": col,
                            "type": "text",
                            "nullable": df[col].isnull().any()
                        })
                elif "int" in dtype or "float" in dtype:
                    schema.append({
                        "name": col,
                        "type": "numeric",
                        "nullable": df[col].isnull().any()
                    })
                elif "datetime" in dtype:
                    schema.append({
                        "name": col,
                        "type": "datetime",
                        "nullable": df[col].isnull().any()
                    })
                else:
                    schema.append({
                        "name": col,
                        "type": dtype,
                        "nullable": df[col].isnull().any()
                    })

            # Get preview (first 10 rows, convert to dict)
            preview_df = df.head(10)
            preview = preview_df.where(pd.notnull(preview_df), None).to_dict("records")

            return schema, preview, len(df)

        except Exception as e:
            logger.error(f"Error processing file: {e}")
            # Return empty schema on error
            return [], [], 0


# Singleton instance
_upload_service = None


def get_upload_service() -> DataUploadService:
    """Get the singleton upload service instance"""
    global _upload_service
    if _upload_service is None:
        _upload_service = DataUploadService()
    return _upload_service


# ============================================================================
# Routes
# ============================================================================

@router.post("/projects/{project_id}/upload", response_model=UploadResponse)
async def upload_dataset(
    project_id: str,
    file: UploadFile = File(...),
    source_type: str = Form("computer"),
    multi_source: bool = Form(False),
    current_user: User = Depends(get_current_user)
):
    """
    Upload a dataset to a project.

    Supports:
    - CSV files
    - Excel files (.xlsx, .xls)
    - JSON files
    - Parquet files

    Returns dataset information including schema and preview.
    """
    try:
        upload_service = get_upload_service()

        result = await upload_service.save_upload(
            file=file,
            project_id=project_id,
            user_id=current_user.id,
            source_type=source_type
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(e)}"
        )


@router.post("/projects/{project_id}/upload/multi-source")
async def upload_multi_source(
    project_id: str,
    request: MultiSourceUploadRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Upload data from multiple sources.

    Supports:
    - Google Drive
    - OneDrive
    - S3
    - URLs
    - Other cloud storage

    Integration with external sources via OAuth or API keys.
    """
    try:
        # Validate source type
        supported_sources = ["computer", "google_drive", "onedrive", "s3", "url", "api"]
        if request.source_type not in supported_sources:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported source type. Supported: {supported_sources}"
            )

        # Process based on source type
        if request.source_type == "computer":
            return {"error": "Use single upload endpoint for computer uploads"}

        # For external sources, return configuration needed
        return {
            "success": True,
            "project_id": project_id,
            "source_type": request.source_type,
            "status": "configuration_needed",
            "message": f"Configure {request.source_type} connection to proceed",
            "oauth_url": f"/api/v1/integrations/{request.source_type}/authorize"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Multi-source upload error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Multi-source upload failed: {str(e)}"
        )


@router.get("/projects/{project_id}/datasets", response_model=List[DatasetInfo])
async def get_project_datasets(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get all datasets for a project.

    Returns list of datasets with their schemas and metadata.
    """
    try:
        async with get_db_context() as session:
            # Verify project exists and user owns it
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

            # Query datasets for this project
            dataset_stmt = select(Dataset).where(
                Dataset.project_id == project_id
            ).order_by(Dataset.created_at.desc())

            dataset_result = await session.execute(dataset_stmt)
            datasets = dataset_result.scalars().all()

            # Convert to response format
            dataset_infos = []
            for dataset in datasets:
                dataset_infos.append(DatasetInfo(
                    id=dataset.id,
                    project_id=dataset.project_id,
                    name=dataset.name,
                    filename=dataset.name,
                    file_type=dataset.source_type or "unknown",
                    file_size=dataset.file_size or 0,
                    record_count=dataset.record_count or 0,
                    column_count=len(dataset.schema) if dataset.schema else 0,
                    schema=dataset.schema or [],
                    preview=[],  # Preview not stored in DB, could be loaded from file
                    created_at=dataset.created_at,
                    pii_scan_pending=dataset.pii_analysis is None
                ))

            return dataset_infos

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching datasets: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch datasets: {str(e)}"
        )


@router.get("/datasets/{dataset_id}", response_model=DatasetInfo)
async def get_dataset(
    dataset_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get details for a specific dataset.

    Includes schema, preview, and metadata.
    """
    try:
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

            # Load preview from file if exists
            preview = []
            if dataset.file_path and os.path.exists(dataset.file_path):
                try:
                    import pandas as pd
                    df = pd.read_csv(dataset.file_path, nrows=DATASET_MINI_PREVIEW_ROWS)
                    preview = df.where(pd.notnull(df), None).to_dict("records")
                except Exception as e:
                    logger.warning(f"Could not load preview from file: {e}")

            return DatasetInfo(
                id=dataset.id,
                project_id=dataset.project_id,
                name=dataset.name,
                filename=dataset.name,
                file_type=dataset.source_type or "unknown",
                file_size=dataset.file_size or 0,
                record_count=dataset.record_count or 0,
                column_count=len(dataset.schema) if dataset.schema else 0,
                schema=dataset.schema or [],
                preview=preview,
                created_at=dataset.created_at,
                pii_scan_pending=dataset.pii_analysis is None
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching dataset: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch dataset: {str(e)}"
        )


@router.delete("/datasets/{dataset_id}")
async def delete_dataset(
    dataset_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Delete a dataset.

    Removes dataset and all associated data.
    """
    try:
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
                    detail="You do not have permission to delete this dataset"
                )

            # Delete file from filesystem
            file_path = dataset.file_path
            if file_path and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    logger.info(f"Deleted file: {file_path}")
                except Exception as e:
                    logger.warning(f"Could not delete file {file_path}: {e}")

            # Delete dataset from database
            delete_stmt = delete(Dataset).where(Dataset.id == dataset_id)
            await session.execute(delete_stmt)
            await session.commit()

            return {
                "success": True,
                "dataset_id": dataset_id,
                "message": "Dataset deleted successfully"
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting dataset: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete dataset: {str(e)}"
        )


@router.get("/projects/{project_id}/datasets/{dataset_id}/schema")
async def get_dataset_schema(
    project_id: str,
    dataset_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get schema information for a dataset.

    Returns column definitions with types and sample values.
    """
    try:
        async with get_db_context() as session:
            # Query dataset
            dataset_stmt = select(Dataset).where(
                Dataset.id == dataset_id,
                Dataset.project_id == project_id
            )
            dataset_result = await session.execute(dataset_stmt)
            dataset = dataset_result.scalar_one_or_none()

            if not dataset:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Dataset not found: {dataset_id}"
                )

            # Verify user owns the project
            project_stmt = select(Project).where(
                Project.id == project_id,
                Project.user_id == current_user.id
            )
            project_result = await session.execute(project_stmt)
            project = project_result.scalar_one_or_none()

            if not project:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have access to this dataset"
                )

            return {
                "dataset_id": dataset_id,
                "project_id": project_id,
                "columns": dataset.schema or [],
                "record_count": dataset.record_count,
                "file_type": dataset.source_type
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching schema: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch schema: {str(e)}"
        )


# ============================================================================
# Helper Routes
# ============================================================================

@router.get("/upload/supported-formats")
async def get_supported_formats():
    """
    Get list of supported file formats for upload.

    Returns format extensions and MIME types.
    """
    upload_service = get_upload_service()
    return {
        "formats": upload_service.supported_formats
    }


@router.get("/upload/max-file-size")
async def get_max_file_size():
    """
    Get maximum file size for upload.

    Returns size in bytes and human-readable format.
    """
    max_size = 100 * 1024 * 1024  # 100MB
    return {
        "max_size_bytes": max_size,
        "max_size_mb": 100
    }
