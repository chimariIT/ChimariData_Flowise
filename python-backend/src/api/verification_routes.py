"""
Data Verification Routes

Real DB implementation using raw SQL (sa_text) against the Drizzle-created
PostgreSQL schema.  Does NOT use the SQLAlchemy ORM models because those
don't match the actual table columns.

Pattern: same as project_routes.py -- sa_text + get_db_context + ORJSONResponse.

Routes:
  GET  /projects/{id}/data-quality    -- compute quality metrics from dataset data
  GET  /projects/{id}/pii-analysis    -- return stored PII analysis
  GET  /projects/{id}/schema-analysis -- return stored schema
  PUT  /projects/{id}/verify          -- mark project as verified
  POST /projects/{id}/verify          -- run PII + quality verification (existing)
  PUT  /projects/{id}/pii-decision    -- record PII decision (existing)
  GET  /projects/{id}/verification-status -- get verification status (existing)
  POST /datasets/{id}/profile         -- profile dataset columns (existing)
  POST /projects/{id}/verify-all      -- bulk verify all datasets (existing)
"""

from typing import Optional, Dict, Any, List
from datetime import datetime
import json
import logging

from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel, Field

from sqlalchemy import text as sa_text

from ..db import get_db_context
from ..auth.middleware import get_current_user, User as AuthUser

logger = logging.getLogger(__name__)

router = APIRouter(tags=["verification"])  # No prefix — Vite proxy rewrites /api/* to /*


# ============================================================================
# Helpers
# ============================================================================

async def _check_ownership(session, project_id: str, user: AuthUser) -> dict:
    """Fetch project and verify ownership.  Raises 404 / 403."""
    result = await session.execute(
        sa_text("SELECT * FROM projects WHERE id = :id"),
        {"id": project_id},
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")
    project = dict(zip(result.keys(), row))
    if project["user_id"] != user.id and not getattr(user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized to access this project")
    return project


async def _get_project_datasets(session, project_id: str) -> list:
    """Fetch all datasets linked to a project via the project_datasets junction."""
    result = await session.execute(
        sa_text(
            "SELECT d.* "
            "FROM datasets d "
            "INNER JOIN project_datasets pd ON pd.dataset_id = d.id "
            "WHERE pd.project_id = :project_id "
            "ORDER BY d.created_at DESC"
        ),
        {"project_id": project_id},
    )
    rows = result.fetchall()
    keys = result.keys()
    return [dict(zip(keys, r)) for r in rows]


def _parse_json_col(val):
    """Safely parse a JSONB column that may already be a dict/list or a string."""
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except (json.JSONDecodeError, TypeError):
        return None


def _build_user_context(user: AuthUser) -> Dict[str, Any]:
    """Build a frontend-compatible user context envelope."""
    return {
        "userId": getattr(user, "id", None),
        "userRole": getattr(user, "user_role", None) or "non-tech",
        "subscriptionTier": getattr(user, "subscription_tier", None) or "trial",
        "isAdmin": bool(getattr(user, "is_admin", False)),
    }


def _error_response(status_code: int, message: str) -> ORJSONResponse:
    """Consistent API error envelope for frontend/test compatibility."""
    return ORJSONResponse(
        status_code=status_code,
        content={"success": False, "error": message},
    )


def _normalize_pii_entries(raw_entries: Any) -> List[Dict[str, Any]]:
    """Normalize mixed PII payloads into {column, types, riskLevel} objects."""
    entries = raw_entries if isinstance(raw_entries, list) else []
    normalized: List[Dict[str, Any]] = []

    for entry in entries:
        if not isinstance(entry, dict):
            continue

        column = (
            entry.get("column")
            or entry.get("field")
            or entry.get("field_name")
            or entry.get("columnName")
        )
        if not column:
            continue

        entry_types = entry.get("types")
        if isinstance(entry_types, list):
            types = [str(t) for t in entry_types if t]
        else:
            fallback_type = entry.get("type") or entry.get("piiType") or "sensitive"
            types = [str(fallback_type)]

        risk_level = str(
            entry.get("riskLevel")
            or entry.get("risk")
            or entry.get("severity")
            or "low"
        ).lower()

        normalized.append({
            "column": str(column),
            "types": types,
            "riskLevel": risk_level,
        })

    # Deduplicate by column while preserving highest observed risk.
    risk_order = {"high": 3, "medium": 2, "low": 1}
    merged: Dict[str, Dict[str, Any]] = {}
    for item in normalized:
        column = item["column"]
        current = merged.get(column)
        if not current:
            merged[column] = item
            continue
        current_types = set(current.get("types", []))
        current_types.update(item.get("types", []))
        current["types"] = sorted(current_types)
        if risk_order.get(item["riskLevel"], 0) > risk_order.get(current.get("riskLevel", "low"), 0):
            current["riskLevel"] = item["riskLevel"]

    return list(merged.values())


def _extract_schema_details(schema: Any) -> List[Dict[str, Any]]:
    """Extract normalized column detail objects from varying schema shapes."""
    details: List[Dict[str, Any]] = []

    if isinstance(schema, dict):
        for column_name, spec in schema.items():
            if isinstance(spec, dict):
                column_type = spec.get("type") or spec.get("dataType") or "unknown"
            elif isinstance(spec, str):
                column_type = spec
            else:
                column_type = "unknown"
            details.append({
                "name": str(column_name),
                "type": str(column_type),
            })
        return details

    if isinstance(schema, list):
        for entry in schema:
            if isinstance(entry, dict):
                column_name = entry.get("name") or entry.get("column") or entry.get("field")
                if not column_name:
                    continue
                column_type = entry.get("type") or entry.get("dataType") or "unknown"
                details.append({
                    "name": str(column_name),
                    "type": str(column_type),
                })
        return details

    return details


def _compute_data_quality(data_rows: list, schema: Optional[dict] = None) -> dict:
    """
    Compute quality metrics from dataset data rows (list of dicts).

    Returns:
      completeness     -- fraction of non-null values across all cells
      duplicateRows    -- number of duplicate rows
      nullCounts       -- {column: count_of_nulls}
      columnCompleteness -- {column: fraction_non_null}
      totalRows        -- int
      totalColumns     -- int
      qualityScore     -- weighted average (completeness 60%, uniqueness 40%)
    """
    if not data_rows:
        return {
            "completeness": 0,
            "duplicateRows": 0,
            "nullCounts": {},
            "columnCompleteness": {},
            "totalRows": 0,
            "totalColumns": 0,
            "qualityScore": 0,
        }

    total_rows = len(data_rows)

    # Determine columns from first row (or schema)
    if schema and isinstance(schema, dict):
        columns = list(schema.keys())
    else:
        columns = list(data_rows[0].keys()) if data_rows else []

    total_columns = len(columns)
    total_cells = total_rows * total_columns if total_columns else 1

    # Count nulls per column
    null_counts: Dict[str, int] = {col: 0 for col in columns}
    for row in data_rows:
        for col in columns:
            val = row.get(col)
            if val is None or (isinstance(val, str) and val.strip() == ""):
                null_counts[col] += 1

    total_nulls = sum(null_counts.values())
    completeness = (total_cells - total_nulls) / total_cells if total_cells > 0 else 0

    # Column-level completeness
    column_completeness = {}
    for col in columns:
        col_total = total_rows if total_rows > 0 else 1
        column_completeness[col] = round((col_total - null_counts[col]) / col_total, 4)

    # Duplicate rows -- serialise each row to a tuple of values for hashing
    seen = set()
    duplicate_count = 0
    for row in data_rows:
        key = tuple(str(row.get(c, "")) for c in columns)
        if key in seen:
            duplicate_count += 1
        else:
            seen.add(key)

    uniqueness = (total_rows - duplicate_count) / total_rows if total_rows > 0 else 1

    # Weighted quality score: completeness 60%, uniqueness 40%
    quality_score = round(completeness * 0.6 + uniqueness * 0.4, 4)

    return {
        "completeness": round(completeness, 4),
        "duplicateRows": duplicate_count,
        "nullCounts": null_counts,
        "columnCompleteness": column_completeness,
        "totalRows": total_rows,
        "totalColumns": total_columns,
        "qualityScore": quality_score,
    }


# ============================================================================
# Request / Response Models
# ============================================================================

class VerifyDatasetRequest(BaseModel):
    """Request to run PII + quality verification on a dataset."""
    project_id: str = Field(..., description="Project ID")
    dataset_id: str = Field(..., description="Dataset ID to verify")
    data: Optional[Dict[str, Any]] = Field(None, description="Dataset data (if not already loaded)")


class PIIDecisionRequest(BaseModel):
    """User decision on PII handling."""
    project_id: str
    dataset_id: str
    pii_decision: str = Field(..., description="Decision: 'allow', 'anonymize', or 'remove'")
    pii_fields: list[str] = Field(default_factory=list, description="Fields to apply decision to")


# ============================================================================
# 1. GET /projects/{project_id}/data-quality
# ============================================================================

@router.get("/projects/{project_id}/data-quality")
async def get_data_quality(
    project_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Calculate real quality metrics from dataset data.

    Reads the `data` JSONB column from all project datasets and computes
    completeness, null counts, duplicate rows, and a weighted quality score.
    """
    try:
        user_context = _build_user_context(current_user)
        async with get_db_context() as session:
            await _check_ownership(session, project_id, current_user)
            datasets = await _get_project_datasets(session, project_id)

        if not datasets:
            empty_quality = _compute_data_quality([])
            return ORJSONResponse(content={
                "success": True,
                "project_id": project_id,
                "datasets": [],
                "overall": empty_quality,
                "qualityScore": 0,
                "metrics": {
                    "completeness": 0,
                    "uniqueness": 0,
                    "validity": 0,
                },
                "issues": ["No dataset is linked to this project yet."],
                "recommendations": ["Upload a dataset to begin quality validation."],
                "assessedBy": "data_engineer_agent",
                "userContext": user_context,
                "metadata": {
                    "generatedAt": datetime.utcnow().isoformat(),
                    "recordCount": 0,
                },
            })

        per_dataset = []
        all_rows: list = []

        for ds in datasets:
            data_rows = _parse_json_col(ds.get("data")) or []
            schema = _parse_json_col(ds.get("schema"))
            quality = _compute_data_quality(data_rows, schema)
            per_dataset.append({
                "dataset_id": ds["id"],
                "name": ds.get("original_file_name") or ds.get("name", ""),
                "record_count": ds.get("record_count") or len(data_rows),
                "quality": quality,
            })
            all_rows.extend(data_rows)

        overall = _compute_data_quality(all_rows)
        completeness_pct = round(float(overall.get("completeness", 0)) * 100, 2)
        uniqueness_pct = (
            round(
                ((overall.get("totalRows", 0) - overall.get("duplicateRows", 0)) / overall.get("totalRows", 1))
                * 100,
                2,
            )
            if overall.get("totalRows", 0) > 0
            else 0
        )
        quality_score_pct = round(float(overall.get("qualityScore", 0)) * 100, 2)
        validity_pct = completeness_pct

        issues: List[str] = []
        recommendations: List[str] = []
        if completeness_pct < 85:
            issues.append("Missing values are reducing data completeness.")
            recommendations.append("Fill or remove fields with high missing-value rates before analysis.")
        if overall.get("duplicateRows", 0) > 0:
            issues.append(f"Found {overall['duplicateRows']} duplicate records.")
            recommendations.append("Deduplicate records to improve confidence in trend and cohort analysis.")
        if not issues:
            recommendations.append("Data quality is healthy. Proceed to schema and privacy review.")

        return ORJSONResponse(content={
            "success": True,
            "project_id": project_id,
            "datasets": per_dataset,
            "overall": overall,
            "qualityScore": quality_score_pct,
            "metrics": {
                "completeness": completeness_pct,
                "uniqueness": uniqueness_pct,
                "validity": validity_pct,
            },
            "issues": issues,
            "recommendations": recommendations,
            "assessedBy": "data_engineer_agent",
            "userContext": user_context,
            "metadata": {
                "generatedAt": datetime.utcnow().isoformat(),
                "recordCount": overall.get("totalRows", 0),
            },
        })

    except HTTPException as exc:
        if exc.status_code == 403:
            return _error_response(403, "Access denied")
        if exc.status_code == 404:
            return _error_response(404, "Project not found")
        raise
    except Exception as e:
        logger.error(f"data-quality error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to compute data quality: {e}")


# ============================================================================
# 2. GET /projects/{project_id}/pii-analysis
# ============================================================================

@router.get("/projects/{project_id}/pii-analysis")
async def get_pii_analysis(
    project_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Return PII analysis from dataset pii_analysis JSONB column.

    Also includes PII detection/decision info from project journey_progress.
    """
    try:
        user_context = _build_user_context(current_user)
        async with get_db_context() as session:
            project = await _check_ownership(session, project_id, current_user)
            datasets = await _get_project_datasets(session, project_id)

        journey = _parse_json_col(project.get("journey_progress")) or {}

        per_dataset = []
        aggregated_pii: List[Dict[str, Any]] = []
        for ds in datasets:
            pii = _parse_json_col(ds.get("pii_analysis"))
            normalized_pii = _normalize_pii_entries(pii)
            aggregated_pii.extend(normalized_pii)
            per_dataset.append({
                "dataset_id": ds["id"],
                "name": ds.get("original_file_name") or ds.get("name", ""),
                "pii_analysis": pii,
                "detectedPII": normalized_pii,
            })

        journey_detection = journey.get("piiDetection", {})
        aggregated_pii.extend(_normalize_pii_entries(journey_detection.get("fields")))
        detected_pii = _normalize_pii_entries(aggregated_pii)

        risk_order = {"high": 3, "medium": 2, "low": 1}
        overall_risk = "low"
        for item in detected_pii:
            if risk_order.get(item.get("riskLevel", "low"), 0) > risk_order.get(overall_risk, 0):
                overall_risk = item.get("riskLevel", "low")

        return ORJSONResponse(content={
            "success": True,
            "project_id": project_id,
            "datasets": per_dataset,
            "piiDetection": journey.get("piiDetection"),
            "piiDecision": journey.get("piiDecision"),
            "detectedPII": detected_pii,
            "riskLevel": overall_risk,
            "assessedBy": "data_verification_service_enhanced",
            "userContext": user_context,
        })

    except HTTPException as exc:
        if exc.status_code == 403:
            return _error_response(403, "Access denied")
        if exc.status_code == 404:
            return _error_response(404, "Project not found")
        raise
    except Exception as e:
        logger.error(f"pii-analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get PII analysis: {e}")


# ============================================================================
# 3. GET /projects/{project_id}/schema-analysis
# ============================================================================

@router.get("/projects/{project_id}/schema-analysis")
async def get_schema_analysis(
    project_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Return schema from dataset schema JSONB column.

    Returns per-dataset schema info including column names, types,
    and record counts.
    """
    try:
        user_context = _build_user_context(current_user)
        async with get_db_context() as session:
            await _check_ownership(session, project_id, current_user)
            datasets = await _get_project_datasets(session, project_id)

        per_dataset = []
        combined_column_details: List[Dict[str, Any]] = []
        for ds in datasets:
            schema = _parse_json_col(ds.get("schema"))
            preview = _parse_json_col(ds.get("preview"))
            schema_details = _extract_schema_details(schema)
            combined_column_details.extend(schema_details)
            per_dataset.append({
                "dataset_id": ds["id"],
                "name": ds.get("original_file_name") or ds.get("name", ""),
                "schema": schema,
                "record_count": ds.get("record_count"),
                "preview": preview[:5] if preview else [],
                "columnDetails": schema_details,
            })

        # Aggregate schema overview for frontend widgets.
        columns_by_name: Dict[str, Dict[str, Any]] = {}
        for item in combined_column_details:
            name = item.get("name")
            if not name:
                continue
            columns_by_name[name] = item

        column_details = list(columns_by_name.values())
        column_names = sorted([c["name"] for c in column_details])
        column_types: Dict[str, int] = {}
        for c in column_details:
            col_type = str(c.get("type") or "unknown")
            column_types[col_type] = column_types.get(col_type, 0) + 1

        recommendations: List[str] = []
        total_columns = len(column_details)
        if total_columns == 0:
            recommendations.append("Upload and profile a dataset to generate schema recommendations.")
        else:
            if column_types.get("unknown", 0) > 0:
                recommendations.append("Review columns with unknown types and assign explicit formats.")
            if not any(t in column_types for t in ("number", "numeric", "integer", "float", "double")):
                recommendations.append("No numeric columns detected; confirm that measure columns were parsed correctly.")
            recommendations.append("Schema profile is ready. Continue to mapping and transformation review.")

        return ORJSONResponse(content={
            "success": True,
            "project_id": project_id,
            "datasets": per_dataset,
            "totalColumns": total_columns,
            "columnNames": column_names,
            "columnTypes": column_types,
            "columnDetails": column_details,
            "recommendations": recommendations,
            "assessedBy": "data_verification_service_enhanced",
            "userContext": user_context,
        })

    except HTTPException as exc:
        if exc.status_code == 403:
            return _error_response(403, "Access denied")
        if exc.status_code == 404:
            return _error_response(404, "Project not found")
        raise
    except Exception as e:
        logger.error(f"schema-analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get schema analysis: {e}")


# ============================================================================
# 4. PUT /projects/{project_id}/verify  -- mark project as verified
# ============================================================================

@router.put("/projects/{project_id}/verify")
async def verify_project_put(
    project_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Update project status to verified.

    Sets journey_step to 'verified' and records the verification timestamp
    in journey_progress.
    """
    try:
        async with get_db_context() as session:
            project = await _check_ownership(session, project_id, current_user)

            # Merge into existing journey_progress
            journey = _parse_json_col(project.get("journey_progress")) or {}
            journey["verification"] = {
                "verified": True,
                "verifiedAt": datetime.utcnow().isoformat(),
                "verifiedBy": current_user.id,
            }

            await session.execute(
                sa_text(
                    "UPDATE projects "
                    "SET journey_step = :step, "
                    "    journey_progress = :jp, "
                    "    updated_at = NOW() "
                    "WHERE id = :id"
                ),
                {
                    "step": "verified",
                    "jp": json.dumps(journey),
                    "id": project_id,
                },
            )
            await session.commit()

        return ORJSONResponse(content={
            "success": True,
            "project_id": project_id,
            "journey_step": "verified",
            "message": "Project data verified successfully",
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"verify (PUT) error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to verify project: {e}")


# ============================================================================
# 5. POST /projects/{project_id}/verify  -- run PII + quality verification
# ============================================================================

@router.post("/projects/{project_id}/verify")
async def verify_project_post(
    project_id: str,
    request: Optional[VerifyDatasetRequest] = None,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Verify project data for PII and quality issues.

    Runs verification service over dataset data and persists results
    into the dataset pii_analysis column and project journey_progress.
    """
    try:
        from ..services.data_verification import get_verification_service
        import pandas as pd
        import os
        from ..constants import DATASET_DATA_ROW_CAP

        verification_service = get_verification_service()
        dataset_id = request.dataset_id if request else None

        async with get_db_context() as session:
            project = await _check_ownership(session, project_id, current_user)

            if not dataset_id:
                raise HTTPException(status_code=400, detail="dataset_id is required")

            # Fetch dataset
            ds_result = await session.execute(
                sa_text("SELECT * FROM datasets WHERE id = :id"),
                {"id": dataset_id},
            )
            ds_row = ds_result.first()
            if ds_row is None:
                raise HTTPException(status_code=404, detail=f"Dataset not found: {dataset_id}")
            ds = dict(zip(ds_result.keys(), ds_row))

            # Try to load data: file first, then DB data column, then request body
            data = None
            storage_uri = ds.get("storage_uri") or ds.get("file_path")
            if storage_uri and os.path.exists(storage_uri):
                try:
                    source_type = ds.get("source_type", "")
                    if source_type == "csv" or storage_uri.endswith(".csv"):
                        data = pd.read_csv(storage_uri, nrows=DATASET_DATA_ROW_CAP)
                    elif source_type in ("xlsx", "xls") or storage_uri.endswith((".xlsx", ".xls")):
                        data = pd.read_excel(storage_uri, nrows=DATASET_DATA_ROW_CAP)
                    elif source_type == "json" or storage_uri.endswith(".json"):
                        data = pd.read_json(storage_uri, nrows=DATASET_DATA_ROW_CAP)
                    else:
                        data = pd.read_csv(storage_uri, nrows=DATASET_DATA_ROW_CAP)
                except Exception as e:
                    logger.warning(f"Could not load file {storage_uri}: {e}")

            if data is None:
                # Fallback to DB data column
                db_data = _parse_json_col(ds.get("data"))
                if db_data and isinstance(db_data, list) and len(db_data) > 0:
                    data = pd.DataFrame(db_data[:DATASET_DATA_ROW_CAP])

            if data is None and request and request.data:
                data = request.data

            if data is None:
                raise HTTPException(status_code=400, detail="No data available for verification")

            # Run verification
            schema_col = _parse_json_col(ds.get("schema"))
            result = await verification_service.verify_dataset(
                project_id=project_id,
                dataset_id=dataset_id,
                data=data,
                schema=schema_col,
            )

            # Persist PII analysis on dataset
            pii_list = [field.dict() for field in result.pii_fields]
            await session.execute(
                sa_text(
                    "UPDATE datasets SET pii_analysis = :pii, updated_at = NOW() "
                    "WHERE id = :id"
                ),
                {"pii": json.dumps(pii_list), "id": dataset_id},
            )

            # Persist to journey_progress
            journey = _parse_json_col(project.get("journey_progress")) or {}
            journey["piiDetection"] = {
                "detected": result.pii_detected,
                "fields": pii_list,
                "verifiedAt": datetime.utcnow().isoformat(),
            }
            await session.execute(
                sa_text(
                    "UPDATE projects SET journey_progress = :jp, updated_at = NOW() "
                    "WHERE id = :id"
                ),
                {"jp": json.dumps(journey), "id": project_id},
            )

            await session.commit()

        return ORJSONResponse(content={
            "success": True,
            "result": result.dict() if hasattr(result, "dict") else result,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"verify (POST) error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Verification failed: {e}")


# ============================================================================
# 6. PUT /projects/{project_id}/pii-decision
# ============================================================================

@router.put("/projects/{project_id}/pii-decision")
async def record_pii_decision(
    project_id: str,
    decision: PIIDecisionRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    """Record user's decision on PII handling (allow / anonymize / remove)."""
    try:
        valid_decisions = ("allow", "anonymize", "remove")
        if decision.pii_decision not in valid_decisions:
            raise HTTPException(status_code=400, detail=f"Invalid decision. Must be one of: {list(valid_decisions)}")

        async with get_db_context() as session:
            project = await _check_ownership(session, project_id, current_user)

            # Verify dataset belongs to project
            ds_result = await session.execute(
                sa_text(
                    "SELECT d.id FROM datasets d "
                    "INNER JOIN project_datasets pd ON pd.dataset_id = d.id "
                    "WHERE pd.project_id = :pid AND d.id = :did"
                ),
                {"pid": project_id, "did": decision.dataset_id},
            )
            if ds_result.first() is None:
                raise HTTPException(status_code=404, detail=f"Dataset not found: {decision.dataset_id}")

            # Store decision on dataset
            pii_dec = {
                "decision": decision.pii_decision,
                "fields": decision.pii_fields,
                "decidedAt": datetime.utcnow().isoformat(),
            }
            await session.execute(
                sa_text(
                    "UPDATE datasets SET pii_decision = :dec, updated_at = NOW() "
                    "WHERE id = :id"
                ),
                {"dec": json.dumps(pii_dec), "id": decision.dataset_id},
            )

            # Store in journey_progress (SSOT)
            journey = _parse_json_col(project.get("journey_progress")) or {}
            journey["piiDecision"] = {
                "decision": decision.pii_decision,
                "datasetId": decision.dataset_id,
                "fields": decision.pii_fields,
                "decidedAt": pii_dec["decidedAt"],
                "status": "approved",
            }
            await session.execute(
                sa_text(
                    "UPDATE projects SET journey_progress = :jp, updated_at = NOW() "
                    "WHERE id = :id"
                ),
                {"jp": json.dumps(journey), "id": project_id},
            )
            await session.commit()

        return ORJSONResponse(content={
            "success": True,
            "message": f"PII decision recorded: {decision.pii_decision}",
            "project_id": project_id,
            "decision": decision.pii_decision,
            "affected_fields": decision.pii_fields,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"pii-decision error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to record PII decision: {e}")


# ============================================================================
# 7. GET /projects/{project_id}/verification-status
# ============================================================================

@router.get("/projects/{project_id}/verification-status")
async def get_verification_status(
    project_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Get current verification status for a project."""
    try:
        async with get_db_context() as session:
            project = await _check_ownership(session, project_id, current_user)

        journey = _parse_json_col(project.get("journey_progress")) or {}
        pii_decision = journey.get("piiDecision", {})
        pii_detection = journey.get("piiDetection", {})

        return ORJSONResponse(content={
            "success": True,
            "project_id": project_id,
            "verified": pii_decision.get("status") == "approved",
            "pii_detected": pii_detection.get("detected", False),
            "pii_decision": pii_decision.get("decision"),
            "pii_decision_at": pii_decision.get("decidedAt"),
            "pii_fields": pii_detection.get("fields", []),
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"verification-status error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get verification status: {e}")


# ============================================================================
# 8. POST /datasets/{dataset_id}/profile
# ============================================================================

@router.post("/datasets/{dataset_id}/profile")
async def profile_dataset(
    dataset_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Generate detailed column profile for a dataset."""
    try:
        from ..services.data_verification import get_verification_service
        import pandas as pd
        import os
        from ..constants import DATASET_DATA_ROW_CAP

        verification_service = get_verification_service()

        async with get_db_context() as session:
            # Fetch dataset
            ds_result = await session.execute(
                sa_text("SELECT * FROM datasets WHERE id = :id"),
                {"id": dataset_id},
            )
            ds_row = ds_result.first()
            if ds_row is None:
                raise HTTPException(status_code=404, detail=f"Dataset not found: {dataset_id}")
            ds = dict(zip(ds_result.keys(), ds_row))

            # Verify ownership via project
            project_id = ds.get("project_id")
            if not project_id:
                # Use junction table to find project
                pj_result = await session.execute(
                    sa_text(
                        "SELECT project_id FROM project_datasets WHERE dataset_id = :did LIMIT 1"
                    ),
                    {"did": dataset_id},
                )
                pj_row = pj_result.first()
                if pj_row:
                    project_id = pj_row[0]

            if project_id:
                await _check_ownership(session, project_id, current_user)
            else:
                # Check user_id on dataset directly
                if ds.get("user_id") != current_user.id and not getattr(current_user, "is_admin", False):
                    raise HTTPException(status_code=403, detail="Not authorized")

        # Load data
        df = None
        storage_uri = ds.get("storage_uri") or ds.get("file_path")
        if storage_uri and os.path.exists(storage_uri):
            try:
                source_type = ds.get("source_type", "")
                if source_type == "csv" or storage_uri.endswith(".csv"):
                    df = pd.read_csv(storage_uri, nrows=DATASET_DATA_ROW_CAP)
                elif source_type in ("xlsx", "xls") or storage_uri.endswith((".xlsx", ".xls")):
                    df = pd.read_excel(storage_uri, nrows=DATASET_DATA_ROW_CAP)
                elif source_type == "json" or storage_uri.endswith(".json"):
                    df = pd.read_json(storage_uri, nrows=DATASET_DATA_ROW_CAP)
                else:
                    df = pd.read_csv(storage_uri, nrows=DATASET_DATA_ROW_CAP)
            except Exception as e:
                logger.warning(f"Could not load file {storage_uri}: {e}")

        if df is None:
            # Fallback to DB data column
            db_data = _parse_json_col(ds.get("data"))
            if db_data and isinstance(db_data, list) and len(db_data) > 0:
                df = pd.DataFrame(db_data[:DATASET_DATA_ROW_CAP])

        if df is None:
            raise HTTPException(status_code=500, detail="Could not load dataset for profiling")

        column_profiles = verification_service._profile_columns(df)

        return ORJSONResponse(content={
            "success": True,
            "dataset_id": dataset_id,
            "project_id": project_id,
            "columns": column_profiles,
            "row_count": len(df),
            "column_count": len(df.columns),
            "file_size": ds.get("file_size"),
            "created_at": ds["created_at"].isoformat() if isinstance(ds.get("created_at"), datetime) else ds.get("created_at"),
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"profile error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Profiling failed: {e}")


# ============================================================================
# 9. POST /projects/{project_id}/verify-all  -- bulk verification
# ============================================================================

@router.post("/projects/{project_id}/verify-all")
async def verify_all_datasets(
    project_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Verify all datasets in a project.
    Runs PII detection and quality checks on every linked dataset.
    """
    try:
        from ..services.data_verification import get_verification_service
        import pandas as pd
        import os
        from ..constants import DATASET_DATA_ROW_CAP

        verification_service = get_verification_service()

        async with get_db_context() as session:
            project = await _check_ownership(session, project_id, current_user)
            datasets = await _get_project_datasets(session, project_id)

            datasets_verified = 0
            pii_detected_in: List[dict] = []
            quality_scores: List[dict] = []

            for ds in datasets:
                # Load data
                df = None
                storage_uri = ds.get("storage_uri") or ds.get("file_path")
                if storage_uri and os.path.exists(storage_uri):
                    try:
                        source_type = ds.get("source_type", "")
                        if source_type == "csv" or storage_uri.endswith(".csv"):
                            df = pd.read_csv(storage_uri, nrows=DATASET_DATA_ROW_CAP)
                        elif source_type in ("xlsx", "xls") or storage_uri.endswith((".xlsx", ".xls")):
                            df = pd.read_excel(storage_uri, nrows=DATASET_DATA_ROW_CAP)
                        elif source_type == "json" or storage_uri.endswith(".json"):
                            df = pd.read_json(storage_uri, nrows=DATASET_DATA_ROW_CAP)
                        else:
                            df = pd.read_csv(storage_uri, nrows=DATASET_DATA_ROW_CAP)
                    except Exception as e:
                        logger.warning(f"Could not load dataset {ds['id']}: {e}")

                if df is None:
                    db_data = _parse_json_col(ds.get("data"))
                    if db_data and isinstance(db_data, list) and len(db_data) > 0:
                        df = pd.DataFrame(db_data[:DATASET_DATA_ROW_CAP])

                if df is None:
                    continue

                schema_col = _parse_json_col(ds.get("schema"))
                result = await verification_service.verify_dataset(
                    project_id=project_id,
                    dataset_id=ds["id"],
                    data=df,
                    schema=schema_col,
                )

                datasets_verified += 1

                pii_list = [field.dict() for field in result.pii_fields]
                await session.execute(
                    sa_text(
                        "UPDATE datasets SET pii_analysis = :pii, updated_at = NOW() "
                        "WHERE id = :id"
                    ),
                    {"pii": json.dumps(pii_list), "id": ds["id"]},
                )

                if result.pii_detected:
                    pii_detected_in.append({
                        "dataset_id": ds["id"],
                        "dataset_name": ds.get("original_file_name") or ds.get("name", ""),
                        "pii_fields": pii_list,
                    })

                quality_scores.append({
                    "dataset_id": ds["id"],
                    "completeness": result.data_quality.completeness,
                    "uniqueness": result.data_quality.uniqueness,
                    "validity": result.data_quality.validity,
                    "overall_score": result.data_quality.overall_score,
                })

            # Aggregate quality
            if quality_scores:
                avg_completeness = sum(s["completeness"] for s in quality_scores) / len(quality_scores)
                avg_uniqueness = sum(s["uniqueness"] for s in quality_scores) / len(quality_scores)
                avg_validity = sum(s["validity"] for s in quality_scores) / len(quality_scores)
            else:
                avg_completeness = avg_uniqueness = avg_validity = 0.0

            # Update journey_progress
            journey = _parse_json_col(project.get("journey_progress")) or {}
            journey["bulkVerification"] = {
                "datasetsVerified": datasets_verified,
                "piiDetectedIn": pii_detected_in,
                "verifiedAt": datetime.utcnow().isoformat(),
            }
            await session.execute(
                sa_text(
                    "UPDATE projects SET journey_progress = :jp, updated_at = NOW() "
                    "WHERE id = :id"
                ),
                {"jp": json.dumps(journey), "id": project_id},
            )
            await session.commit()

        return ORJSONResponse(content={
            "success": True,
            "project_id": project_id,
            "datasets_verified": datasets_verified,
            "pii_detected_in": pii_detected_in,
            "overall_quality": {
                "completeness": round(avg_completeness, 3),
                "uniqueness": round(avg_uniqueness, 3),
                "validity": round(avg_validity, 3),
            },
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"verify-all error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Bulk verification failed: {e}")


# ============================================================================
# Router Inclusion Helper
# ============================================================================

def include_verification_routes(app):
    """Include verification routes in the FastAPI app."""
    app.include_router(router, tags=["verification"])
    logger.info("Verification routes included")
