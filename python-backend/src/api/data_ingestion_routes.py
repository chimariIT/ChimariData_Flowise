"""
Data Ingestion Routes

API endpoints for ingesting data from external sources:
- PostgreSQL, MySQL, MongoDB databases
- REST APIs and GraphQL endpoints

The frontend connector UIs (DatabaseConnectorTab, APIConnectorTab) call
POST /api/data-ingestion/ingest which the Vite proxy rewrites to
POST /data-ingestion/ingest on this router.
"""

import json
import logging
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(tags=["data-ingestion"])

# Row cap to prevent huge data imports
DATASET_ROW_CAP = 10_000

# DML keywords to reject for SQL safety (read-only enforcement)
BLOCKED_SQL_KEYWORDS = {"INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "CREATE", "GRANT", "REVOKE"}


class IngestRequest(BaseModel):
    """Data source ingestion request from frontend connector tabs"""
    sourceType: str = Field(..., description="postgresql, mysql, mongodb, rest_api, graphql")
    projectId: str = Field(..., description="Project to associate the dataset with")
    config: Dict[str, Any] = Field(..., description="Source-specific connection config")
    label: Optional[str] = Field(None, description="Display label for the dataset")


class IngestResponse(BaseModel):
    """Response from data ingestion"""
    success: bool
    message: str
    datasetId: Optional[str] = None
    recordCount: int = 0
    schema: Optional[Dict[str, str]] = None
    preview: Optional[List[Dict]] = None
    error: Optional[str] = None


def _validate_sql_readonly(query: str) -> None:
    """Reject SQL queries that modify data"""
    tokens = query.upper().split()
    for token in tokens:
        if token in BLOCKED_SQL_KEYWORDS:
            raise ValueError(f"SQL query contains blocked keyword: {token}. Only SELECT queries are allowed.")


def _infer_column_types(rows: List[Dict]) -> Dict[str, str]:
    """Infer column types from sample data"""
    if not rows:
        return {}

    schema = {}
    sample = rows[0]
    for key, value in sample.items():
        if isinstance(value, bool):
            schema[key] = "boolean"
        elif isinstance(value, int):
            schema[key] = "integer"
        elif isinstance(value, float):
            schema[key] = "number"
        elif isinstance(value, (list, dict)):
            schema[key] = "json"
        else:
            schema[key] = "string"
    return schema


async def _ingest_postgresql(config: Dict[str, Any]) -> List[Dict]:
    """Ingest data from PostgreSQL using asyncpg"""
    import asyncpg

    query = config.get("query", "SELECT 1")
    _validate_sql_readonly(query)

    # Add LIMIT if not present
    if "LIMIT" not in query.upper():
        query = f"{query} LIMIT {DATASET_ROW_CAP}"

    conn = await asyncpg.connect(
        host=config.get("host", "localhost"),
        port=int(config.get("port", 5432)),
        database=config.get("database", ""),
        user=config.get("username", ""),
        password=config.get("password", ""),
        ssl=config.get("ssl", False) and "require" or None,
        timeout=30,
    )
    try:
        records = await conn.fetch(query)
        return [dict(r) for r in records[:DATASET_ROW_CAP]]
    finally:
        await conn.close()


async def _ingest_mysql(config: Dict[str, Any]) -> List[Dict]:
    """Ingest data from MySQL using aiomysql"""
    import aiomysql

    query = config.get("query", "SELECT 1")
    _validate_sql_readonly(query)

    if "LIMIT" not in query.upper():
        query = f"{query} LIMIT {DATASET_ROW_CAP}"

    conn = await aiomysql.connect(
        host=config.get("host", "localhost"),
        port=int(config.get("port", 3306)),
        db=config.get("database", ""),
        user=config.get("username", ""),
        password=config.get("password", ""),
        connect_timeout=30,
    )
    try:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(query)
            rows = await cur.fetchall()
            return list(rows[:DATASET_ROW_CAP])
    finally:
        conn.close()


async def _ingest_mongodb(config: Dict[str, Any]) -> List[Dict]:
    """Ingest data from MongoDB using motor"""
    import motor.motor_asyncio

    connection_string = config.get("connectionString", "mongodb://localhost:27017")
    database_name = config.get("database", "")
    collection_name = config.get("collection", "")
    query_filter = config.get("queryFilter", "{}")
    limit = min(int(config.get("limit", DATASET_ROW_CAP)), DATASET_ROW_CAP)

    if not database_name or not collection_name:
        raise ValueError("Database name and collection name are required for MongoDB")

    # Parse query filter
    try:
        filter_dict = json.loads(query_filter) if isinstance(query_filter, str) else query_filter
    except json.JSONDecodeError:
        filter_dict = {}

    client = motor.motor_asyncio.AsyncIOMotorClient(connection_string, serverSelectionTimeoutMS=30000)
    try:
        db = client[database_name]
        collection = db[collection_name]
        cursor = collection.find(filter_dict).limit(limit)
        rows = []
        async for doc in cursor:
            doc["_id"] = str(doc.get("_id", ""))
            rows.append(doc)
        return rows
    finally:
        client.close()


async def _ingest_rest_api(config: Dict[str, Any]) -> List[Dict]:
    """Ingest data from a REST API using httpx"""
    import httpx

    url = config.get("url", "")
    method = config.get("method", "GET").upper()
    headers = config.get("headers", {})
    body = config.get("body")

    # Handle auth
    auth_type = config.get("auth", {}).get("type", "none")
    if auth_type == "bearer":
        token = config.get("auth", {}).get("token", "")
        headers["Authorization"] = f"Bearer {token}"
    elif auth_type == "basic":
        import base64
        username = config.get("auth", {}).get("username", "")
        password = config.get("auth", {}).get("password", "")
        encoded = base64.b64encode(f"{username}:{password}".encode()).decode()
        headers["Authorization"] = f"Basic {encoded}"
    elif auth_type == "api_key":
        key_name = config.get("auth", {}).get("headerName", "X-API-Key")
        key_value = config.get("auth", {}).get("apiKey", "")
        headers[key_name] = key_value

    async with httpx.AsyncClient(timeout=30.0) as client:
        if method == "GET":
            response = await client.get(url, headers=headers)
        elif method == "POST":
            response = await client.post(url, headers=headers, json=body if body else None)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")

        response.raise_for_status()
        data = response.json()

    # Normalize to list of dicts
    if isinstance(data, list):
        return data[:DATASET_ROW_CAP]
    elif isinstance(data, dict):
        # Try common response wrappers
        for key in ("data", "results", "items", "records", "rows"):
            if key in data and isinstance(data[key], list):
                return data[key][:DATASET_ROW_CAP]
        # Single object — wrap in list
        return [data]
    else:
        raise ValueError(f"Unexpected response type: {type(data).__name__}")


async def _ingest_graphql(config: Dict[str, Any]) -> List[Dict]:
    """Ingest data from a GraphQL endpoint using httpx"""
    import httpx

    url = config.get("url", "")
    query = config.get("query", "")
    variables = config.get("variables", {})
    headers = config.get("headers", {"Content-Type": "application/json"})

    # Handle auth
    auth_type = config.get("auth", {}).get("type", "none")
    if auth_type == "bearer":
        headers["Authorization"] = f"Bearer {config.get('auth', {}).get('token', '')}"
    elif auth_type == "api_key":
        key_name = config.get("auth", {}).get("headerName", "X-API-Key")
        headers[key_name] = config.get("auth", {}).get("apiKey", "")

    if isinstance(variables, str):
        try:
            variables = json.loads(variables)
        except json.JSONDecodeError:
            variables = {}

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url,
            headers=headers,
            json={"query": query, "variables": variables},
        )
        response.raise_for_status()
        result = response.json()

    # Extract data from GraphQL response
    if "errors" in result and result["errors"]:
        raise ValueError(f"GraphQL errors: {result['errors'][0].get('message', 'Unknown error')}")

    data = result.get("data", {})

    # Find the first list in the data response
    for key, value in data.items():
        if isinstance(value, list):
            return value[:DATASET_ROW_CAP]
        elif isinstance(value, dict):
            # Nested query — look one level deeper
            for subkey, subvalue in value.items():
                if isinstance(subvalue, list):
                    return subvalue[:DATASET_ROW_CAP]

    # No list found — return single dict
    return [data] if data else []


# Dispatch table
_INGEST_HANDLERS = {
    "postgresql": _ingest_postgresql,
    "mysql": _ingest_mysql,
    "mongodb": _ingest_mongodb,
    "rest_api": _ingest_rest_api,
    "graphql": _ingest_graphql,
}


@router.post("/data-ingestion/ingest", response_model=IngestResponse)
async def ingest_data_source(request: IngestRequest):
    """
    Ingest data from an external source (database, API, etc.)

    Called by frontend DatabaseConnectorTab and APIConnectorTab via
    apiClient.ingestDataSource() → POST /api/data-ingestion/ingest
    (Vite proxy strips /api prefix)
    """
    handler = _INGEST_HANDLERS.get(request.sourceType)
    if not handler:
        supported = ", ".join(_INGEST_HANDLERS.keys())
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported source type: {request.sourceType}. Supported: {supported}"
        )

    try:
        logger.info(f"Ingesting data from {request.sourceType} for project {request.projectId}")
        rows = await handler(request.config)

        if not rows:
            return IngestResponse(
                success=True,
                message="Query returned no data",
                recordCount=0,
                schema={},
                preview=[],
            )

        # Infer schema and prepare response
        schema = _infer_column_types(rows)
        dataset_id = str(uuid.uuid4())
        preview = rows[:20]  # First 20 rows for preview

        logger.info(f"Ingested {len(rows)} rows from {request.sourceType}, schema: {list(schema.keys())}")

        return IngestResponse(
            success=True,
            message=f"Successfully ingested {len(rows)} records from {request.sourceType}",
            datasetId=dataset_id,
            recordCount=len(rows),
            schema=schema,
            preview=preview,
        )

    except ValueError as e:
        logger.warning(f"Validation error during ingestion: {e}")
        return IngestResponse(success=False, message=str(e), error=str(e))
    except Exception as e:
        logger.error(f"Ingestion failed for {request.sourceType}: {e}", exc_info=True)
        return IngestResponse(
            success=False,
            message=f"Failed to connect to {request.sourceType}: {str(e)}",
            error=str(e),
        )


@router.post("/data-ingestion/test-connection")
async def test_connection(request: IngestRequest):
    """Test connectivity to a data source without importing data"""
    handler = _INGEST_HANDLERS.get(request.sourceType)
    if not handler:
        return {"success": False, "error": f"Unsupported source type: {request.sourceType}"}

    try:
        # For databases, run a minimal query to test connection
        test_config = {**request.config}
        if request.sourceType in ("postgresql", "mysql"):
            test_config["query"] = "SELECT 1"
        elif request.sourceType == "mongodb":
            test_config["limit"] = 1

        await handler(test_config)
        return {"success": True, "message": f"Successfully connected to {request.sourceType}"}
    except Exception as e:
        return {"success": False, "error": str(e)}
