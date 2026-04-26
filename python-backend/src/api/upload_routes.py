"""
Data Upload Routes

API endpoints for dataset upload and management.
Handles file uploads, schema detection, PII scanning,
and persists to the real datasets / project_datasets tables.
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel, ConfigDict, Field
import logging
from datetime import datetime
import json
import csv
import io
import os
from pathlib import Path

from sqlalchemy import text as sa_text

from ..auth.middleware import get_current_user, User
from ..db import get_db_context
from ..models.database import generate_uuid
from ..constants import (
    DATASET_DATA_ROW_CAP,
    DATASET_PREVIEW_ROWS,
    DATASET_MINI_PREVIEW_ROWS,
    ALLOWED_UPLOAD_TYPES,
    MAX_UPLOAD_FILE_SIZE_BYTES,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["upload"])  # No prefix — Vite proxy rewrites /api/* to /*

# Upload directory (relative to project root)
UPLOAD_DIR = Path("uploads/originals")

# MIME type mapping for validation
MIME_TYPE_MAP: Dict[str, str] = {
    "csv": "text/csv",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls": "application/vnd.ms-excel",
    "json": "application/json",
    "txt": "text/plain",
}


# ============================================================================
# Pydantic Models
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
    schema_: Dict[str, str] = Field(alias="schema")  # column name -> type mapping (matches Drizzle JSONB)
    preview: List[Dict[str, Any]]  # first 10 rows
    upload_timestamp: str
    message: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class DatasetInfo(BaseModel):
    """Dataset information"""
    id: str
    project_id: Optional[str] = None
    filename: str
    original_file_name: str
    source_type: str
    mime_type: str
    file_size: int
    record_count: int
    column_count: int
    schema_: Optional[Dict[str, str]] = Field(default=None, alias="schema")
    preview: Optional[List[Dict[str, Any]]] = None
    status: str = "ready"
    created_at: Optional[str] = None
    pii_scan_pending: bool = True

    model_config = ConfigDict(populate_by_name=True)


class MultiSourceUploadRequest(BaseModel):
    """Request for multi-source upload"""
    project_id: str
    source_type: str = "computer"
    files: List[str] = Field(default_factory=list)
    connection_config: Optional[Dict[str, Any]] = None


# ============================================================================
# File Parsing Helpers
# ============================================================================

def _detect_column_type(values: List[Any]) -> str:
    """
    Infer a column's data type from its values.

    Returns one of: numeric, integer, datetime, boolean, text
    """
    non_null = [v for v in values if v is not None and str(v).strip() != ""]
    if not non_null:
        return "text"

    # Check boolean
    bool_vals = {"true", "false", "0", "1", "yes", "no"}
    if all(str(v).strip().lower() in bool_vals for v in non_null):
        return "boolean"

    # Check integer
    int_count = 0
    for v in non_null:
        try:
            f = float(v)
            if f == int(f):
                int_count += 1
        except (ValueError, TypeError, OverflowError):
            break
    else:
        if int_count == len(non_null):
            return "integer"

    # Check numeric (float)
    try:
        for v in non_null:
            float(v)
        return "numeric"
    except (ValueError, TypeError):
        pass

    # Check datetime-ish (simple heuristic)
    from datetime import datetime as dt
    date_fmts = ["%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%m/%d/%Y", "%d/%m/%Y",
                 "%Y-%m-%d %H:%M:%S", "%m-%d-%Y"]
    for fmt in date_fmts:
        try:
            for v in non_null[:20]:
                dt.strptime(str(v).strip(), fmt)
            return "datetime"
        except (ValueError, TypeError):
            continue

    return "text"


def _parse_csv_bytes(raw: bytes) -> tuple[List[str], List[Dict[str, Any]]]:
    """Parse CSV bytes into (headers, rows_as_dicts). Rows capped at DATASET_DATA_ROW_CAP."""
    # Try to detect encoding; fallback to utf-8
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    rows: List[Dict[str, Any]] = []
    for i, row in enumerate(reader):
        if i >= DATASET_DATA_ROW_CAP:
            break
        # Convert empty strings to None for consistency
        cleaned = {}
        for k, v in row.items():
            if v is None or v.strip() == "":
                cleaned[k] = None
            else:
                cleaned[k] = v
        rows.append(cleaned)
    return list(headers), rows


def _parse_json_bytes(raw: bytes) -> tuple[List[str], List[Dict[str, Any]]]:
    """Parse JSON bytes (array of objects) into (headers, rows_as_dicts)."""
    data = json.loads(raw)
    if isinstance(data, dict):
        # Possibly wrapped: {"data": [...]} or similar
        for key in ("data", "rows", "records", "items", "results"):
            if key in data and isinstance(data[key], list):
                data = data[key]
                break
        else:
            # Single object -> wrap in list
            data = [data]
    if not isinstance(data, list):
        raise ValueError("JSON file must contain an array of objects")

    rows = data[:DATASET_DATA_ROW_CAP]
    headers = list(rows[0].keys()) if rows else []
    return headers, rows


def _parse_excel_bytes(raw: bytes) -> tuple[List[str], List[Dict[str, Any]]]:
    """Parse Excel bytes using openpyxl into (headers, rows_as_dicts)."""
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Excel parsing requires the openpyxl package. Install with: pip install openpyxl"
        )

    wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    ws = wb.active
    if ws is None:
        raise ValueError("Excel file has no active sheet")

    row_iter = ws.iter_rows(values_only=True)
    header_row = next(row_iter, None)
    if header_row is None:
        return [], []

    headers = [str(h) if h is not None else f"column_{i}" for i, h in enumerate(header_row)]
    rows: List[Dict[str, Any]] = []
    for i, row in enumerate(row_iter):
        if i >= DATASET_DATA_ROW_CAP:
            break
        row_dict = {}
        for j, val in enumerate(row):
            col = headers[j] if j < len(headers) else f"column_{j}"
            row_dict[col] = val
        rows.append(row_dict)

    wb.close()
    return headers, rows


def _build_schema(headers: List[str], rows: List[Dict[str, Any]]) -> Dict[str, str]:
    """Build a column-name -> type mapping by sampling the data."""
    schema: Dict[str, str] = {}
    sample_size = min(200, len(rows))
    for col in headers:
        sample_vals = [r.get(col) for r in rows[:sample_size]]
        schema[col] = _detect_column_type(sample_vals)
    return schema


def _make_json_safe(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Ensure all values are JSON-serialisable (handle datetime, Decimal, etc.)."""
    from decimal import Decimal
    safe = []
    for row in rows:
        clean: Dict[str, Any] = {}
        for k, v in row.items():
            if isinstance(v, datetime):
                clean[k] = v.isoformat()
            elif isinstance(v, Decimal):
                clean[k] = float(v)
            elif isinstance(v, bytes):
                clean[k] = v.decode("utf-8", errors="replace")
            else:
                clean[k] = v
        safe.append(clean)
    return safe


# ============================================================================
# Routes
# ============================================================================

@router.post("/projects/upload")
async def upload_create_project(
    file: UploadFile = File(...),
    name: str = Form(None),
    description: str = Form(None),
    journeyType: str = Form("non-tech"),
    isTrial: str = Form(None),
    piiHandled: str = Form(None),
    anonymizationApplied: str = Form(None),
    selectedColumns: str = Form(None),
    questions: str = Form(None),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a file and create a new project (no project_id needed).
    Frontend calls this when uploading without an existing project.
    Creates the project, then delegates to upload_dataset for file processing.
    """
    # Create project first
    from sqlalchemy import text as sa_text
    from ..db import get_db_context
    from ..models.database import generate_uuid
    project_id = generate_uuid()
    initial_progress = json.dumps({
        "journeyType": journeyType,
        "createdAt": datetime.utcnow().isoformat(),
        "status": "draft",
    })
    project_name = name or (file.filename or "Untitled Project").rsplit(".", 1)[0]
    async with get_db_context() as session:
        await session.execute(
            sa_text(
                "INSERT INTO projects "
                "(id, user_id, name, description, status, journey_type, "
                " journey_progress, created_at, updated_at) "
                "VALUES (:id, :user_id, :name, :description, 'draft', :journey_type, "
                " CAST(:journey_progress AS jsonb), NOW(), NOW())"
            ),
            {
                "id": project_id,
                "user_id": current_user.id,
                "name": project_name,
                "description": description,
                "journey_type": journeyType,
                "journey_progress": initial_progress,
            },
        )
        await session.commit()

    # Now process the upload
    return await upload_dataset(
        project_id=project_id,
        file=file,
        source_type="upload",
        current_user=current_user,
    )


@router.post("/projects/{project_id}/upload")
async def upload_dataset(
    project_id: str,
    file: UploadFile = File(...),
    source_type: str = Form("upload"),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a dataset file to a project.

    Accepts CSV, XLSX, JSON, and TXT files (max 100 MB).
    Parses the file, detects column types, stores file to disk,
    and persists metadata into the datasets and project_datasets tables.

    Returns dataset info with schema, preview, and record count.
    """
    # ── validate file extension ──────────────────────────────────────────
    original_name = file.filename or "unknown"
    ext = Path(original_name).suffix.lstrip(".").lower()
    if ext not in ALLOWED_UPLOAD_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '.{ext}'. Allowed: {ALLOWED_UPLOAD_TYPES}",
        )

    # ── read file bytes and validate size ────────────────────────────────
    raw_bytes = await file.read()
    file_size = len(raw_bytes)
    if file_size > MAX_UPLOAD_FILE_SIZE_BYTES:
        max_mb = MAX_UPLOAD_FILE_SIZE_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large ({file_size} bytes). Maximum allowed: {max_mb} MB",
        )
    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )

    # ── verify project exists and user owns it ───────────────────────────
    async with get_db_context() as session:
        result = await session.execute(
            sa_text("SELECT id FROM projects WHERE id = :pid AND user_id = :uid"),
            {"pid": project_id, "uid": current_user.id},
        )
        if result.first() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found or you do not have access",
            )

    # ── parse file ───────────────────────────────────────────────────────
    try:
        if ext == "csv" or ext == "txt":
            headers, rows = _parse_csv_bytes(raw_bytes)
        elif ext in ("xlsx", "xls"):
            headers, rows = _parse_excel_bytes(raw_bytes)
        elif ext == "json":
            headers, rows = _parse_json_bytes(raw_bytes)
        else:
            raise ValueError(f"Unsupported extension: {ext}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File parsing error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse file: {str(e)}",
        )

    if not headers:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File has no columns/headers",
        )

    # ── build schema & preview ───────────────────────────────────────────
    schema_map = _build_schema(headers, rows)
    record_count = len(rows)
    preview = _make_json_safe(rows[:DATASET_MINI_PREVIEW_ROWS])
    data_rows = _make_json_safe(rows)  # already capped at DATASET_DATA_ROW_CAP

    # ── resolve MIME type ────────────────────────────────────────────────
    mime_type = file.content_type or MIME_TYPE_MAP.get(ext, "application/octet-stream")

    # ── save file to disk ────────────────────────────────────────────────
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dataset_id = generate_uuid()
    safe_name = f"{project_id}_{dataset_id[:12]}.{ext}"
    storage_path = UPLOAD_DIR / safe_name
    try:
        storage_path.write_bytes(raw_bytes)
    except Exception as e:
        logger.error(f"Failed to write upload file: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save uploaded file to disk",
        )
    storage_uri = str(storage_path)

    # ── persist to datasets table ────────────────────────────────────────
    now = datetime.utcnow()
    now_iso = now.isoformat()

    try:
        async with get_db_context() as session:
            await session.execute(
                sa_text("""
                    INSERT INTO datasets (
                        id, user_id, source_type, original_file_name,
                        mime_type, file_size, storage_uri,
                        schema, record_count, preview, data,
                        pii_analysis, ingestion_metadata, status,
                        created_at, updated_at
                    ) VALUES (
                        :id, :user_id, :source_type, :original_file_name,
                        :mime_type, :file_size, :storage_uri,
                        :schema, :record_count, :preview, :data,
                        :pii_analysis, :ingestion_metadata, :status,
                        :created_at, :updated_at
                    )
                """),
                {
                    "id": dataset_id,
                    "user_id": current_user.id,
                    "source_type": source_type,
                    "original_file_name": original_name,
                    "mime_type": mime_type,
                    "file_size": file_size,
                    "storage_uri": storage_uri,
                    "schema": json.dumps(schema_map),
                    "record_count": record_count,
                    "preview": json.dumps(preview),
                    "data": json.dumps(data_rows),
                    "pii_analysis": None,
                    "ingestion_metadata": json.dumps({
                        "uploadedAt": now_iso,
                        "originalExtension": ext,
                        "columnCount": len(headers),
                        "headers": headers,
                    }),
                    "status": "ready",
                    "created_at": now,
                    "updated_at": now,
                },
            )

            # ── persist to project_datasets junction ─────────────────────
            junction_id = generate_uuid()
            await session.execute(
                sa_text("""
                    INSERT INTO project_datasets (id, project_id, dataset_id, role, added_at)
                    VALUES (:id, :project_id, :dataset_id, :role, :added_at)
                """),
                {
                    "id": junction_id,
                    "project_id": project_id,
                    "dataset_id": dataset_id,
                    "role": "primary",
                    "added_at": now,
                },
            )

            await session.commit()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Database insert failed for upload: {e}", exc_info=True)
        # Clean up the file we wrote
        try:
            storage_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to persist dataset: {str(e)}",
        )

    # ── return response ──────────────────────────────────────────────────
    return ORJSONResponse(content={
        "success": True,
        "dataset_id": dataset_id,
        "filename": original_name,
        "file_type": ext,
        "file_size": file_size,
        "record_count": record_count,
        "column_count": len(headers),
        "schema": schema_map,
        "preview": preview,
        "upload_timestamp": now_iso,
        "message": f"Successfully uploaded {original_name}",
    })


# ============================================================================
# List datasets for a project
# ============================================================================

@router.get("/projects/{project_id}/datasets")
async def get_project_datasets(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Get all datasets linked to a project via project_datasets junction.
    """
    async with get_db_context() as session:
        # Verify project ownership
        proj = await session.execute(
            sa_text("SELECT id FROM projects WHERE id = :pid AND user_id = :uid"),
            {"pid": project_id, "uid": current_user.id},
        )
        if proj.first() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        result = await session.execute(
            sa_text("""
                SELECT d.id, d.user_id, d.source_type, d.original_file_name,
                       d.mime_type, d.file_size, d.storage_uri,
                       d.schema, d.record_count, d.preview,
                       d.pii_analysis, d.ingestion_metadata, d.status,
                       d.created_at, d.updated_at,
                       pd.role, pd.added_at
                FROM datasets d
                JOIN project_datasets pd ON pd.dataset_id = d.id
                WHERE pd.project_id = :pid
                ORDER BY pd.added_at DESC
            """),
            {"pid": project_id},
        )
        rows = result.mappings().all()

    datasets = []
    for r in rows:
        schema_val = r["schema"]
        if isinstance(schema_val, str):
            schema_val = json.loads(schema_val)
        preview_val = r["preview"]
        if isinstance(preview_val, str):
            preview_val = json.loads(preview_val)

        datasets.append({
            "id": r["id"],
            "project_id": project_id,
            "filename": r["original_file_name"],
            "original_file_name": r["original_file_name"],
            "source_type": r["source_type"] or "upload",
            "mime_type": r["mime_type"],
            "file_size": r["file_size"] or 0,
            "record_count": r["record_count"] or 0,
            "column_count": len(schema_val) if schema_val else 0,
            "schema": schema_val,
            "preview": preview_val or [],
            "status": r["status"] or "ready",
            "role": r["role"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "pii_scan_pending": r["pii_analysis"] is None,
        })

    return ORJSONResponse(content=datasets)


# ============================================================================
# Get single dataset
# ============================================================================

@router.get("/datasets/{dataset_id}")
async def get_dataset(
    dataset_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Get details for a specific dataset.
    Verifies the user owns the dataset via user_id.
    """
    async with get_db_context() as session:
        result = await session.execute(
            sa_text("""
                SELECT id, user_id, source_type, original_file_name,
                       mime_type, file_size, storage_uri,
                       schema, record_count, preview, data,
                       pii_analysis, ingestion_metadata, status,
                       created_at, updated_at
                FROM datasets
                WHERE id = :did
            """),
            {"did": dataset_id},
        )
        row = result.mappings().first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset not found: {dataset_id}",
        )

    # Ownership check
    if row["user_id"] != current_user.id and not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this dataset",
        )

    schema_val = row["schema"]
    if isinstance(schema_val, str):
        schema_val = json.loads(schema_val)
    preview_val = row["preview"]
    if isinstance(preview_val, str):
        preview_val = json.loads(preview_val)

    # Find linked project via junction
    project_id = None
    async with get_db_context() as session:
        pd_result = await session.execute(
            sa_text("SELECT project_id FROM project_datasets WHERE dataset_id = :did LIMIT 1"),
            {"did": dataset_id},
        )
        pd_row = pd_result.first()
        if pd_row:
            project_id = pd_row[0]

    return ORJSONResponse(content={
        "id": row["id"],
        "project_id": project_id,
        "filename": row["original_file_name"],
        "original_file_name": row["original_file_name"],
        "source_type": row["source_type"] or "upload",
        "mime_type": row["mime_type"],
        "file_size": row["file_size"] or 0,
        "record_count": row["record_count"] or 0,
        "column_count": len(schema_val) if schema_val else 0,
        "schema": schema_val,
        "preview": preview_val or [],
        "status": row["status"] or "ready",
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "pii_scan_pending": row["pii_analysis"] is None,
    })


# ============================================================================
# Delete dataset
# ============================================================================

@router.delete("/datasets/{dataset_id}")
async def delete_dataset(
    dataset_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Delete a dataset and its file from disk.
    Removes the project_datasets junction row and the datasets row.
    """
    async with get_db_context() as session:
        # Fetch dataset
        result = await session.execute(
            sa_text("SELECT id, user_id, storage_uri FROM datasets WHERE id = :did"),
            {"did": dataset_id},
        )
        row = result.mappings().first()

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset not found: {dataset_id}",
            )

        if row["user_id"] != current_user.id and not getattr(current_user, "is_admin", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to delete this dataset",
            )

        # Delete junction rows first (FK cascade may handle this, but be explicit)
        await session.execute(
            sa_text("DELETE FROM project_datasets WHERE dataset_id = :did"),
            {"did": dataset_id},
        )

        # Delete dataset row
        await session.execute(
            sa_text("DELETE FROM datasets WHERE id = :did"),
            {"did": dataset_id},
        )
        await session.commit()

    # Clean up file on disk
    storage_uri = row["storage_uri"]
    if storage_uri:
        try:
            p = Path(storage_uri)
            if p.exists():
                p.unlink()
                logger.info(f"Deleted file: {storage_uri}")
        except Exception as e:
            logger.warning(f"Could not delete file {storage_uri}: {e}")

    return ORJSONResponse(content={
        "success": True,
        "dataset_id": dataset_id,
        "message": "Dataset deleted successfully",
    })


# ============================================================================
# Get dataset schema
# ============================================================================

@router.get("/projects/{project_id}/datasets/{dataset_id}/schema")
async def get_dataset_schema(
    project_id: str,
    dataset_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Get schema information for a dataset.
    """
    async with get_db_context() as session:
        # Verify project ownership
        proj = await session.execute(
            sa_text("SELECT id FROM projects WHERE id = :pid AND user_id = :uid"),
            {"pid": project_id, "uid": current_user.id},
        )
        if proj.first() is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this project",
            )

        # Get dataset linked to this project
        result = await session.execute(
            sa_text("""
                SELECT d.schema, d.record_count, d.source_type
                FROM datasets d
                JOIN project_datasets pd ON pd.dataset_id = d.id
                WHERE d.id = :did AND pd.project_id = :pid
            """),
            {"did": dataset_id, "pid": project_id},
        )
        row = result.mappings().first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset not found: {dataset_id}",
        )

    schema_val = row["schema"]
    if isinstance(schema_val, str):
        schema_val = json.loads(schema_val)

    return ORJSONResponse(content={
        "dataset_id": dataset_id,
        "project_id": project_id,
        "columns": schema_val or {},
        "record_count": row["record_count"],
        "file_type": row["source_type"],
    })


# ============================================================================
# Multi-source upload (placeholder)
# ============================================================================

@router.post("/projects/{project_id}/upload/multi-source")
async def upload_multi_source(
    project_id: str,
    request: MultiSourceUploadRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Upload data from multiple sources (Google Drive, S3, etc.).
    Currently returns configuration needed for external source auth.
    """
    supported_sources = ["computer", "google_drive", "onedrive", "s3", "url", "api"]
    if request.source_type not in supported_sources:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported source type. Supported: {supported_sources}",
        )

    if request.source_type == "computer":
        return ORJSONResponse(content={
            "error": "Use single upload endpoint for computer uploads",
        })

    return ORJSONResponse(content={
        "success": True,
        "project_id": project_id,
        "source_type": request.source_type,
        "status": "configuration_needed",
        "message": f"Configure {request.source_type} connection to proceed",
        "oauth_url": f"/api/v1/integrations/{request.source_type}/authorize",
    })


# ============================================================================
# Helper Routes
# ============================================================================

@router.get("/upload/supported-formats")
async def get_supported_formats():
    """Get list of supported file formats for upload."""
    return ORJSONResponse(content={
        "formats": MIME_TYPE_MAP,
        "allowed_extensions": ALLOWED_UPLOAD_TYPES,
    })


@router.get("/upload/max-file-size")
async def get_max_file_size():
    """Get maximum file size for upload."""
    return ORJSONResponse(content={
        "max_size_bytes": MAX_UPLOAD_FILE_SIZE_BYTES,
        "max_size_mb": MAX_UPLOAD_FILE_SIZE_BYTES // (1024 * 1024),
    })
