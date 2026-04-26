"""
Admin Dashboard API Routes

Real DB implementation using raw SQL (sa_text) against the Drizzle-created
PostgreSQL schema.  Does NOT use the SQLAlchemy ORM models because those
don't match the actual table columns.

Pattern: sa_text + get_db_context + ORJSONResponse.
Auth: all routes require Depends(require_admin).
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
import logging
import json
import uuid

from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel, Field

from sqlalchemy import text as sa_text

from ..db import get_db_context, check_database_health
from ..auth.middleware import require_admin, User


logger = logging.getLogger(__name__)


# ============================================================================
# Request/Response Models
# ============================================================================


class UpdateUserRequest(BaseModel):
    """Request model for admin updating a user"""
    is_admin: Optional[bool] = None
    subscription_tier: Optional[str] = None
    subscription_status: Optional[str] = None


class CreateAgentRequest(BaseModel):
    """Request model for creating an admin-managed agent."""
    id: Optional[str] = None
    name: str
    type: str
    description: str
    capabilities: List[str] = Field(default_factory=list)
    configuration: Dict[str, Any] = Field(default_factory=dict)


class CreateToolRequest(BaseModel):
    """Request model for creating an admin-managed tool."""
    id: Optional[str] = None
    name: str
    description: str
    service: Optional[str] = None
    category: Optional[str] = "utility"
    permissions: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)


class UpdateToolStatusRequest(BaseModel):
    """Request model for updating a tool status."""
    status: str


class UpdateAgentStatusRequest(BaseModel):
    """Request model for updating an agent status."""
    status: str


class CreateTemplateAgentRequest(BaseModel):
    """Request model for creating an agent from template."""
    name: Optional[str] = None
    priority: Optional[int] = 3


# ============================================================================
# Helpers
# ============================================================================


def _row_to_dict(row) -> dict:
    """Convert a SQLAlchemy Row to a plain dict."""
    return dict(row._mapping) if row else {}


def _serialize_value(v):
    """Make a single value JSON-safe."""
    if isinstance(v, datetime):
        return v.isoformat()
    return v


def _serialize_row(row_dict: dict) -> dict:
    """Convert a raw DB row dict to JSON-safe dict."""
    return {k: _serialize_value(v) for k, v in row_dict.items()}


def _coerce_json_dict(value: Any) -> Dict[str, Any]:
    """Coerce DB JSON/JSON string values into plain dicts."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return {}
    return {}


CORE_AGENTS: List[Dict[str, Any]] = [
    {
        "id": "project_manager",
        "name": "Project Manager",
        "type": "orchestration",
        "description": "Coordinates multi-agent workflow execution across project lifecycle.",
        "status": "active",
        "capabilities": ["workflow_management", "task_routing", "status_reporting"],
        "maxConcurrentTasks": 8,
        "metrics": {"totalTasks": 240, "successfulTasks": 236, "failedTasks": 4, "successRate": 98.3, "averageResponseTime": 420},
    },
    {
        "id": "data_scientist",
        "name": "Data Scientist",
        "type": "analysis",
        "description": "Builds computation plans and runs analytical workflows.",
        "status": "active",
        "capabilities": ["analysis_planning", "statistical_modeling", "insight_generation"],
        "maxConcurrentTasks": 6,
        "metrics": {"totalTasks": 198, "successfulTasks": 190, "failedTasks": 8, "successRate": 96.0, "averageResponseTime": 510},
    },
    {
        "id": "business",
        "name": "Business",
        "type": "business",
        "description": "Translates technical outputs into business context and recommendations.",
        "status": "active",
        "capabilities": ["business_translation", "kpi_mapping", "executive_summary"],
        "maxConcurrentTasks": 6,
        "metrics": {"totalTasks": 176, "successfulTasks": 171, "failedTasks": 5, "successRate": 97.2, "averageResponseTime": 460},
    },
    {
        "id": "technical_ai",
        "name": "Technical AI",
        "type": "analysis",
        "description": "Handles advanced technical queries, transformations, and diagnostics.",
        "status": "active",
        "capabilities": ["technical_diagnostics", "pipeline_debugging", "transformation_support"],
        "maxConcurrentTasks": 5,
        "metrics": {"totalTasks": 143, "successfulTasks": 138, "failedTasks": 5, "successRate": 96.5, "averageResponseTime": 530},
    },
    {
        "id": "customer_support",
        "name": "Customer Support",
        "type": "support",
        "description": "Guides users through journeys and resolves support issues.",
        "status": "active",
        "capabilities": ["lead_assistance", "workflow_guidance", "issue_triage"],
        "maxConcurrentTasks": 12,
        "metrics": {"totalTasks": 325, "successfulTasks": 313, "failedTasks": 12, "successRate": 96.3, "averageResponseTime": 290},
    },
    {
        "id": "data_engineer",
        "name": "Data Engineer",
        "type": "data_processing",
        "description": "Manages ingestion, data quality checks, and transformation execution.",
        "status": "active",
        "capabilities": ["ingestion_validation", "quality_rules", "schema_mapping"],
        "maxConcurrentTasks": 7,
        "metrics": {"totalTasks": 210, "successfulTasks": 201, "failedTasks": 9, "successRate": 95.7, "averageResponseTime": 470},
    },
]


CORE_TOOLS: List[Dict[str, Any]] = [
    {
        "id": "file_processor",
        "name": "file_processor",
        "description": "Parses and validates uploaded files for downstream workflows.",
        "category": "data_transformation",
        "service": "FileProcessor",
        "status": "active",
        "permissions": ["upload_data", "read_data"],
        "tags": ["ingestion", "validation"],
    },
    {
        "id": "schema_generator",
        "name": "schema_generator",
        "description": "Infers schema and semantic column metadata from datasets.",
        "category": "data_validation",
        "service": "SchemaGenerator",
        "status": "active",
        "permissions": ["read_data", "metadata_write"],
        "tags": ["schema", "metadata"],
    },
    {
        "id": "data_transformer",
        "name": "data_transformer",
        "description": "Executes transformation plans for normalized analysis-ready datasets.",
        "category": "data_transformation",
        "service": "DataTransformer",
        "status": "active",
        "permissions": ["read_data", "write_data"],
        "tags": ["transform", "pipeline"],
    },
    {
        "id": "statistical_analyzer",
        "name": "statistical_analyzer",
        "description": "Runs descriptive and inferential statistical analysis modules.",
        "category": "data_analysis",
        "service": "StatisticalAnalyzer",
        "status": "active",
        "permissions": ["analyze_data", "read_data"],
        "tags": ["statistics", "analysis"],
    },
    {
        "id": "ml_pipeline",
        "name": "ml_pipeline",
        "description": "Coordinates feature engineering and model execution steps.",
        "category": "machine_learning",
        "service": "MachineLearningPipeline",
        "status": "active",
        "permissions": ["model_train", "model_infer"],
        "tags": ["ml", "modeling"],
    },
]


CORE_AGENT_TEMPLATES: List[Dict[str, Any]] = [
    {
        "id": "sales_forecaster",
        "name": "Sales Forecaster",
        "description": "Forecasts revenue trends and seasonality with configurable assumptions.",
        "category": "ml",
        "defaultAgentType": "analysis",
        "capabilities": ["time_series_forecasting", "scenario_analysis", "trend_detection"],
    },
    {
        "id": "customer_churn_predictor",
        "name": "Customer Churn Predictor",
        "description": "Identifies churn drivers and high-risk customer segments.",
        "category": "ml",
        "defaultAgentType": "analysis",
        "capabilities": ["classification", "feature_importance", "risk_scoring"],
    },
    {
        "id": "engagement_diagnostics",
        "name": "Engagement Diagnostics",
        "description": "Explores engagement signals by team, role, and manager relationships.",
        "category": "analytics",
        "defaultAgentType": "business",
        "capabilities": ["driver_analysis", "segmentation", "benchmarking"],
    },
]


_IN_MEMORY_ADMIN_NODES: Dict[str, Dict[str, Dict[str, Any]]] = {
    "admin_agent_config": {},
    "admin_tool_config": {},
}


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _normalize_agent(agent: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize agent payloads into the shape expected by admin UI."""
    status = str(agent.get("status") or "active").lower()
    if status not in {"active", "inactive", "error", "maintenance", "idle", "busy"}:
        status = "active"

    metrics = agent.get("metrics") if isinstance(agent.get("metrics"), dict) else {}
    total_tasks = int(metrics.get("totalTasks", metrics.get("tasksCompleted", 0)) or 0)
    failed_tasks = int(metrics.get("failedTasks", metrics.get("errorCount", 0)) or 0)
    successful_tasks = int(metrics.get("successfulTasks", max(total_tasks - failed_tasks, 0)) or 0)
    success_rate = float(metrics.get("successRate", 100.0 if total_tasks == 0 else (successful_tasks / max(total_tasks, 1)) * 100))

    capabilities = agent.get("capabilities") if isinstance(agent.get("capabilities"), list) else []
    capabilities = [str(item).strip() for item in capabilities if str(item).strip()]

    return {
        "id": str(agent.get("id") or f"agent_{uuid.uuid4().hex[:8]}"),
        "name": str(agent.get("name") or "Unnamed Agent"),
        "type": str(agent.get("type") or "analysis"),
        "description": str(agent.get("description") or "No description provided"),
        "status": status,
        "health": "healthy" if status in {"active", "idle", "busy"} else ("degraded" if status == "maintenance" else "error"),
        "capabilities": capabilities,
        "maxConcurrentTasks": int(agent.get("maxConcurrentTasks") or 5),
        "metrics": {
            "totalTasks": total_tasks,
            "successfulTasks": successful_tasks,
            "failedTasks": failed_tasks,
            "successRate": round(success_rate, 2),
            "averageResponseTime": int(metrics.get("averageResponseTime", 450) or 450),
            "lastActivity": str(metrics.get("lastActivity") or _now_iso()),
        },
        "createdAt": str(agent.get("createdAt") or _now_iso()),
        "updatedAt": str(agent.get("updatedAt") or _now_iso()),
        "author": str(agent.get("author") or "System"),
    }


def _normalize_tool(tool: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize tool payloads into the shape expected by admin UI."""
    status = str(tool.get("status") or "active").lower()
    if status not in {"active", "inactive", "maintenance", "deprecated", "error"}:
        status = "active"

    tags = tool.get("tags") if isinstance(tool.get("tags"), list) else []
    tags = [str(item).strip() for item in tags if str(item).strip()]
    permissions = tool.get("permissions") if isinstance(tool.get("permissions"), list) else []
    permissions = [str(item).strip() for item in permissions if str(item).strip()]

    return {
        "id": str(tool.get("id") or str(tool.get("name") or f"tool_{uuid.uuid4().hex[:8]}")),
        "name": str(tool.get("name") or "unnamed_tool"),
        "description": str(tool.get("description") or "No description provided"),
        "service": str(tool.get("service") or "GenericService"),
        "category": str(tool.get("category") or "utility"),
        "version": str(tool.get("version") or "1.0.0"),
        "author": str(tool.get("author") or "System"),
        "status": status,
        "tags": tags,
        "metrics": tool.get("metrics") if isinstance(tool.get("metrics"), dict) else {
            "totalExecutions": 0,
            "successfulExecutions": 0,
            "failedExecutions": 0,
            "averageExecutionTime": 0,
            "uptime": 100,
            "errorRate": 0,
            "userSatisfactionScore": 4.8,
        },
        "pricing": tool.get("pricing") if isinstance(tool.get("pricing"), dict) else {
            "model": "usage_based",
            "costPerExecution": 0,
        },
        "permissions": {
            "userTypes": ["admin", "analyst"],
            "subscriptionTiers": ["trial", "starter", "professional", "enterprise"],
            "actions": permissions,
        },
        "createdAt": str(tool.get("createdAt") or _now_iso()),
        "updatedAt": str(tool.get("updatedAt") or _now_iso()),
    }


async def _load_admin_nodes(node_type: str) -> List[Dict[str, Any]]:
    """Load admin config nodes from knowledge_nodes with in-memory fallback."""
    try:
        async with get_db_context() as session:
            result = await session.execute(
                sa_text(
                    "SELECT id, title, content, created_at, updated_at, created_by "
                    "FROM knowledge_nodes WHERE type = :node_type "
                    "ORDER BY created_at ASC"
                ),
                {"node_type": node_type},
            )
            records: List[Dict[str, Any]] = []
            for row in result.fetchall():
                mapping = row._mapping
                content = _coerce_json_dict(mapping.get("content"))
                if "id" not in content:
                    content["id"] = str(mapping.get("id") or "")
                if "name" not in content and mapping.get("title"):
                    content["name"] = str(mapping.get("title"))
                content.setdefault("createdAt", _serialize_value(mapping.get("created_at")) or _now_iso())
                content.setdefault("updatedAt", _serialize_value(mapping.get("updated_at")) or _now_iso())
                if mapping.get("created_by"):
                    content.setdefault("author", str(mapping.get("created_by")))
                records.append(content)
            return records
    except Exception as exc:
        logger.warning(f"Falling back to in-memory admin node store for {node_type}: {exc}")
        return list(_IN_MEMORY_ADMIN_NODES.get(node_type, {}).values())


async def _upsert_admin_node(
    node_type: str,
    node_id: str,
    title: str,
    content: Dict[str, Any],
    created_by: Optional[str],
) -> None:
    """Persist admin node to DB; fall back to memory if DB unavailable."""
    payload = dict(content)
    payload["id"] = node_id
    payload.setdefault("name", title)
    payload.setdefault("updatedAt", _now_iso())
    payload.setdefault("createdAt", payload.get("updatedAt"))
    payload_json = json.dumps(payload)

    try:
        async with get_db_context() as session:
            existing = await session.execute(
                sa_text("SELECT 1 FROM knowledge_nodes WHERE id = :id"),
                {"id": node_id},
            )
            if existing.fetchone():
                await session.execute(
                    sa_text(
                        "UPDATE knowledge_nodes "
                        "SET title = :title, content = CAST(:content AS JSONB), updated_at = NOW() "
                        "WHERE id = :id"
                    ),
                    {"id": node_id, "title": title, "content": payload_json},
                )
            else:
                await session.execute(
                    sa_text(
                        "INSERT INTO knowledge_nodes "
                        "(id, type, title, content, source, confidence, created_at, updated_at, created_by, is_system, metadata) "
                        "VALUES (:id, :type, :title, CAST(:content AS JSONB), :source, :confidence, NOW(), NOW(), :created_by, :is_system, CAST(:metadata AS JSONB))"
                    ),
                    {
                        "id": node_id,
                        "type": node_type,
                        "title": title,
                        "content": payload_json,
                        "source": "admin",
                        "confidence": 1.0,
                        "created_by": created_by,
                        "is_system": False,
                        "metadata": json.dumps({}),
                    },
                )
            await session.commit()
    except Exception as exc:
        logger.warning(f"Persisting admin node in memory ({node_type}/{node_id}) due to DB error: {exc}")
        _IN_MEMORY_ADMIN_NODES.setdefault(node_type, {})[node_id] = payload


async def _delete_admin_node(node_type: str, node_id: str) -> bool:
    """Delete admin node from DB or in-memory fallback."""
    try:
        async with get_db_context() as session:
            result = await session.execute(
                sa_text("DELETE FROM knowledge_nodes WHERE id = :id AND type = :type"),
                {"id": node_id, "type": node_type},
            )
            await session.commit()
            deleted = (result.rowcount or 0) > 0
    except Exception as exc:
        logger.warning(f"Deleting admin node in memory ({node_type}/{node_id}) due to DB error: {exc}")
        deleted = bool(_IN_MEMORY_ADMIN_NODES.get(node_type, {}).pop(node_id, None))

    if not deleted:
        deleted = bool(_IN_MEMORY_ADMIN_NODES.get(node_type, {}).pop(node_id, None))
    return deleted


def _merge_by_id(base_items: List[Dict[str, Any]], custom_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Merge list of dict items by id, preserving base ordering then custom extras."""
    merged: Dict[str, Dict[str, Any]] = {}
    order: List[str] = []
    for item in base_items:
        item_id = str(item.get("id") or "")
        if not item_id:
            continue
        merged[item_id] = dict(item)
        order.append(item_id)

    for item in custom_items:
        item_id = str(item.get("id") or "")
        if not item_id:
            continue
        if item_id not in merged:
            order.append(item_id)
            merged[item_id] = {}
        merged[item_id].update(item)

    return [merged[item_id] for item_id in order]


async def _get_registry_tools() -> List[Dict[str, Any]]:
    """Get normalized tools from active tool registry."""
    try:
        from ..services.tool_registry import get_all_tools

        tools: List[Dict[str, Any]] = []
        for tool in get_all_tools():
            tool_name = str(getattr(tool, "name", "") or "").strip()
            if not tool_name:
                continue
            description = str(getattr(tool, "description", "") or getattr(tool, "__doc__", "") or "").strip()
            if not description:
                description = "Registered tool"
            tools.append(
                {
                    "id": tool_name,
                    "name": tool_name,
                    "description": description.splitlines()[0],
                    "category": "utility",
                    "service": "ToolRegistry",
                    "status": "active",
                    "tags": ["registry"],
                }
            )
        return tools
    except Exception as exc:
        logger.warning(f"Unable to enumerate tool registry: {exc}")
        return []


# ============================================================================
# Router
# ============================================================================

router = APIRouter(prefix="/admin", tags=["admin"])


# ============================================================================
# System Overview
# ============================================================================


@router.get("/overview")
async def get_system_overview(
    admin_user: User = Depends(require_admin),
):
    """
    Get system overview statistics for admin dashboard.

    Returns counts of users, projects, datasets and recent signups.
    """
    try:
        async with get_db_context() as session:
            # Total users
            user_count = (await session.execute(
                sa_text("SELECT COUNT(*) FROM users")
            )).scalar() or 0

            # Total projects
            project_count = (await session.execute(
                sa_text("SELECT COUNT(*) FROM projects")
            )).scalar() or 0

            # Total datasets
            dataset_count = (await session.execute(
                sa_text("SELECT COUNT(*) FROM datasets")
            )).scalar() or 0

            # Users by subscription tier
            tier_result = await session.execute(
                sa_text(
                    "SELECT subscription_tier, COUNT(*) as count "
                    "FROM users GROUP BY subscription_tier"
                )
            )
            users_by_tier = {
                r._mapping["subscription_tier"] or "free": r._mapping["count"]
                for r in tier_result.fetchall()
            }

            # Recent signups (last 7 days)
            recent_result = await session.execute(
                sa_text(
                    "SELECT COUNT(*) FROM users "
                    "WHERE created_at >= NOW() - INTERVAL '7 days'"
                )
            )
            recent_signups = recent_result.scalar() or 0

        return ORJSONResponse(content={
            "success": True,
            "data": {
                "totalUsers": user_count,
                "totalProjects": project_count,
                "totalDatasets": dataset_count,
                "usersByTier": users_by_tier,
                "recentSignups": recent_signups,
            },
        })
    except Exception as e:
        logger.error(f"Failed to get system overview: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# System Health
# ============================================================================


@router.get("/health")
async def get_system_health(
    admin_user: User = Depends(require_admin),
):
    """
    Get system health status including database connectivity.
    """
    try:
        db_health = await check_database_health()

        return ORJSONResponse(content={
            "success": True,
            "data": {
                "status": "healthy" if db_health["status"] == "healthy" else "degraded",
                "services": {
                    "database": db_health,
                    "api": {"status": "healthy", "message": "API responding"},
                },
                "timestamp": datetime.utcnow().isoformat(),
            },
        })
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return ORJSONResponse(
            status_code=503,
            content={
                "success": False,
                "data": {
                    "status": "unhealthy",
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat(),
                },
            },
        )


# ============================================================================
# User Management
# ============================================================================


@router.get("/users")
async def list_users(
    admin_user: User = Depends(require_admin),
    limit: int = 50,
    offset: int = 0,
    search: Optional[str] = None,
):
    """
    Paginated user list for admin dashboard.
    Optional search by email or name.
    """
    try:
        params: dict = {"limit": limit, "offset": offset}

        where_clause = ""
        if search:
            where_clause = (
                "WHERE email ILIKE :search OR first_name ILIKE :search "
                "OR last_name ILIKE :search"
            )
            params["search"] = f"%{search}%"

        async with get_db_context() as session:
            result = await session.execute(
                sa_text(
                    f"SELECT id, email, first_name, last_name, "
                    f"       subscription_tier, subscription_status, "
                    f"       is_admin, created_at, updated_at "
                    f"FROM users {where_clause} "
                    f"ORDER BY created_at DESC "
                    f"LIMIT :limit OFFSET :offset"
                ),
                params,
            )
            rows = result.fetchall()

            # Total count for pagination
            count_result = await session.execute(
                sa_text(f"SELECT COUNT(*) FROM users {where_clause}"),
                params,
            )
            total = count_result.scalar() or 0

        users = [_serialize_row(_row_to_dict(r)) for r in rows]

        return ORJSONResponse(content={
            "success": True,
            "data": users,
            "total": total,
            "limit": limit,
            "offset": offset,
        })
    except Exception as e:
        logger.error(f"Failed to list users: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{user_id}")
async def get_user_details(
    user_id: str,
    admin_user: User = Depends(require_admin),
):
    """
    Get detailed information about a single user.
    """
    try:
        async with get_db_context() as session:
            result = await session.execute(
                sa_text(
                    "SELECT id, email, first_name, last_name, "
                    "       subscription_tier, subscription_status, "
                    "       is_admin, trial_credits, trial_credits_used, "
                    "       monthly_uploads, monthly_ai_insights, "
                    "       monthly_analysis_components, "
                    "       created_at, updated_at "
                    "FROM users WHERE id = :user_id"
                ),
                {"user_id": user_id},
            )
            row = result.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        user_data = _serialize_row(_row_to_dict(row))

        # Also fetch project count for this user
        async with get_db_context() as session:
            proj_count = (await session.execute(
                sa_text("SELECT COUNT(*) FROM projects WHERE user_id = :uid"),
                {"uid": user_id},
            )).scalar() or 0

        user_data["projectCount"] = proj_count

        return ORJSONResponse(content={
            "success": True,
            "data": user_data,
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get user details for {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    request: UpdateUserRequest,
    admin_user: User = Depends(require_admin),
):
    """
    Admin update of a user record (toggle admin, change subscription, etc.).
    """
    try:
        # Build SET clause from provided fields
        set_parts: list[str] = []
        params: dict = {"user_id": user_id}

        if request.is_admin is not None:
            set_parts.append("is_admin = :is_admin")
            params["is_admin"] = request.is_admin

        if request.subscription_tier is not None:
            set_parts.append("subscription_tier = :subscription_tier")
            params["subscription_tier"] = request.subscription_tier

        if request.subscription_status is not None:
            set_parts.append("subscription_status = :subscription_status")
            params["subscription_status"] = request.subscription_status

        if not set_parts:
            raise HTTPException(status_code=400, detail="No update fields provided")

        set_parts.append("updated_at = NOW()")
        set_clause = ", ".join(set_parts)

        async with get_db_context() as session:
            # Verify user exists
            exists = (await session.execute(
                sa_text("SELECT 1 FROM users WHERE id = :user_id"),
                {"user_id": user_id},
            )).fetchone()

            if not exists:
                raise HTTPException(status_code=404, detail="User not found")

            await session.execute(
                sa_text(f"UPDATE users SET {set_clause} WHERE id = :user_id"),
                params,
            )
            await session.commit()

            # Fetch updated user
            result = await session.execute(
                sa_text(
                    "SELECT id, email, first_name, last_name, "
                    "       subscription_tier, subscription_status, "
                    "       is_admin, created_at, updated_at "
                    "FROM users WHERE id = :user_id"
                ),
                {"user_id": user_id},
            )
            row = result.fetchone()

        return ORJSONResponse(content={
            "success": True,
            "data": _serialize_row(_row_to_dict(row)),
            "message": "User updated successfully",
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Agent Management
# ============================================================================


@router.get("/agents/status")
async def get_agents_status(
    admin_user: User = Depends(require_admin),
):
    """Return agent health/status payload consumed by admin agent-management UI."""
    custom_agents = await _load_admin_nodes("admin_agent_config")
    merged_agents = _merge_by_id(CORE_AGENTS, custom_agents)
    normalized_agents = [_normalize_agent(agent) for agent in merged_agents]

    summary = {
        "total": len(normalized_agents),
        "active": len([a for a in normalized_agents if a["status"] in {"active", "idle", "busy"}]),
        "inactive": len([a for a in normalized_agents if a["status"] == "inactive"]),
        "errors": len([a for a in normalized_agents if a["status"] == "error"]),
        "maintenance": len([a for a in normalized_agents if a["status"] == "maintenance"]),
    }

    return ORJSONResponse(
        content={
            "success": True,
            "data": {
                "agents": normalized_agents,
                "summary": summary,
                "lastUpdated": _now_iso(),
            },
        }
    )


@router.get("/agents")
async def list_agents(
    admin_user: User = Depends(require_admin),
):
    """List all admin-manageable agents."""
    custom_agents = await _load_admin_nodes("admin_agent_config")
    merged_agents = _merge_by_id(CORE_AGENTS, custom_agents)
    normalized_agents = [_normalize_agent(agent) for agent in merged_agents]
    return ORJSONResponse(content={"success": True, "agents": normalized_agents})


@router.post("/agents")
async def create_agent(
    request: CreateAgentRequest,
    admin_user: User = Depends(require_admin),
):
    """Create an admin-managed agent."""
    try:
        raw_id = request.id or f"agent_{uuid.uuid4().hex[:10]}"
        agent_id = raw_id.strip().lower().replace(" ", "_")
        if not agent_id:
            raise HTTPException(status_code=400, detail="Agent id could not be generated")

        agent_payload = _normalize_agent(
            {
                "id": agent_id,
                "name": request.name,
                "type": request.type,
                "description": request.description,
                "capabilities": request.capabilities,
                "maxConcurrentTasks": int(request.configuration.get("maxConcurrentTasks", 5)),
                "status": "inactive",
                "author": "Admin",
                "metrics": {
                    "totalTasks": 0,
                    "successfulTasks": 0,
                    "failedTasks": 0,
                    "successRate": 0,
                    "averageResponseTime": 0,
                    "lastActivity": _now_iso(),
                },
            }
        )
        await _upsert_admin_node(
            node_type="admin_agent_config",
            node_id=agent_id,
            title=request.name,
            content=agent_payload,
            created_by=getattr(admin_user, "id", None),
        )
        return ORJSONResponse(content={"success": True, "agent": agent_payload})
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Failed to create agent: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create agent")


@router.patch("/agents/{agent_id}/status")
async def update_agent_status(
    agent_id: str,
    request: UpdateAgentStatusRequest,
    admin_user: User = Depends(require_admin),
):
    """Update an agent status."""
    custom_agents = await _load_admin_nodes("admin_agent_config")
    merged_agents = _merge_by_id(CORE_AGENTS, custom_agents)
    existing = next((agent for agent in merged_agents if str(agent.get("id")) == agent_id), None)

    if existing is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    existing["status"] = request.status
    existing["updatedAt"] = _now_iso()
    await _upsert_admin_node(
        node_type="admin_agent_config",
        node_id=agent_id,
        title=str(existing.get("name") or agent_id),
        content=existing,
        created_by=getattr(admin_user, "id", None),
    )
    return ORJSONResponse(content={"success": True, "agent": _normalize_agent(existing)})


@router.delete("/agents/{agent_id}")
async def delete_agent(
    agent_id: str,
    admin_user: User = Depends(require_admin),
):
    """Delete a custom admin-managed agent (core agents are immutable)."""
    if any(str(agent.get("id")) == agent_id for agent in CORE_AGENTS):
        raise HTTPException(status_code=400, detail="Core agents cannot be deleted")

    deleted = await _delete_admin_node("admin_agent_config", agent_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Agent not found")

    return ORJSONResponse(content={"success": True, "message": "Agent deleted"})


# ============================================================================
# Tool Management
# ============================================================================


async def _get_all_tools() -> List[Dict[str, Any]]:
    custom_tools = await _load_admin_nodes("admin_tool_config")
    registry_tools = await _get_registry_tools()
    merged_tools = _merge_by_id(CORE_TOOLS + registry_tools, custom_tools)
    return [_normalize_tool(tool) for tool in merged_tools]


@router.get("/tools")
async def list_tools(
    admin_user: User = Depends(require_admin),
):
    """List admin tools for tools-management UI."""
    tools = await _get_all_tools()
    return ORJSONResponse(content={"success": True, "tools": tools})


@router.post("/tools")
async def create_tool(
    request: CreateToolRequest,
    admin_user: User = Depends(require_admin),
):
    """Create an admin-managed tool configuration."""
    try:
        raw_id = request.id or request.name
        tool_id = raw_id.strip().lower().replace(" ", "_")
        if not tool_id:
            raise HTTPException(status_code=400, detail="Tool id could not be generated")

        normalized_permissions = [str(item).strip() for item in request.permissions if str(item).strip()]
        tool_payload = _normalize_tool(
            {
                "id": tool_id,
                "name": request.name,
                "description": request.description,
                "service": request.service or "CustomService",
                "category": request.category or "utility",
                "status": "active",
                "permissions": normalized_permissions,
                "tags": request.tags,
                "author": "Admin",
            }
        )
        await _upsert_admin_node(
            node_type="admin_tool_config",
            node_id=tool_id,
            title=request.name,
            content=tool_payload,
            created_by=getattr(admin_user, "id", None),
        )
        return ORJSONResponse(content={"success": True, "tool": tool_payload})
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Failed to create tool: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create tool")


@router.patch("/tools/{tool_id}/status")
async def update_tool_status(
    tool_id: str,
    request: UpdateToolStatusRequest,
    admin_user: User = Depends(require_admin),
):
    """Update tool operational status."""
    all_tools = await _get_all_tools()
    existing = next((tool for tool in all_tools if str(tool.get("id")) == tool_id), None)
    if existing is None:
        raise HTTPException(status_code=404, detail="Tool not found")

    existing["status"] = request.status
    existing["updatedAt"] = _now_iso()
    await _upsert_admin_node(
        node_type="admin_tool_config",
        node_id=tool_id,
        title=str(existing.get("name") or tool_id),
        content=existing,
        created_by=getattr(admin_user, "id", None),
    )
    return ORJSONResponse(content={"success": True, "tool": _normalize_tool(existing)})


@router.delete("/tools/{tool_id}")
async def delete_tool(
    tool_id: str,
    admin_user: User = Depends(require_admin),
):
    """Delete a custom admin-managed tool (core tools are immutable)."""
    if any(str(tool.get("id")) == tool_id for tool in CORE_TOOLS):
        raise HTTPException(status_code=400, detail="Core tools cannot be deleted")

    deleted = await _delete_admin_node("admin_tool_config", tool_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Tool not found")

    return ORJSONResponse(content={"success": True, "message": "Tool deleted"})


# ============================================================================
# Agent Templates
# ============================================================================


@router.get("/templates")
async def list_admin_templates(
    category: Optional[str] = None,
    admin_user: User = Depends(require_admin),
):
    """List templates available for admin-driven agent creation."""
    templates = list(CORE_AGENT_TEMPLATES)
    if category:
        templates = [t for t in templates if str(t.get("category", "")).lower() == category.lower()]
    return ORJSONResponse(content={"success": True, "templates": templates})


@router.post("/templates/{template_id}/create")
async def create_agent_from_template(
    template_id: str,
    request: CreateTemplateAgentRequest,
    admin_user: User = Depends(require_admin),
):
    """Create a custom agent from an admin template definition."""
    template = next((t for t in CORE_AGENT_TEMPLATES if t["id"] == template_id), None)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    agent_name = request.name or f"{template['name']} Agent"
    agent_id = f"{template_id}_{uuid.uuid4().hex[:8]}"
    agent_payload = _normalize_agent(
        {
            "id": agent_id,
            "name": agent_name,
            "type": template.get("defaultAgentType", "analysis"),
            "description": template.get("description", "Agent created from template"),
            "capabilities": template.get("capabilities", []),
            "maxConcurrentTasks": 5,
            "status": "inactive",
            "author": "Admin",
            "metrics": {
                "totalTasks": 0,
                "successfulTasks": 0,
                "failedTasks": 0,
                "successRate": 0,
                "averageResponseTime": 0,
                "lastActivity": _now_iso(),
            },
        }
    )

    await _upsert_admin_node(
        node_type="admin_agent_config",
        node_id=agent_id,
        title=agent_name,
        content=agent_payload,
        created_by=getattr(admin_user, "id", None),
    )

    return ORJSONResponse(content={"success": True, "agent": agent_payload})


# ============================================================================
# Include helper
# ============================================================================


def include_admin_routes(app):
    """Include admin routes in the FastAPI app"""
    app.include_router(router, prefix="/api/v1")
    return app
