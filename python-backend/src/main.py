"""
Chimaridata Python Backend - Main Application

FastAPI application with:
- LangGraph-based agentic orchestration
- RAG evidence chain
- Semantic matching
- Transformation engine
- Real-time WebSocket support

Architecture: Python + LangChain + Pydantic + FastAPI + PostgreSQL
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator, Dict, Optional, Any, Set, List
import logging
import os
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import dotenv_values
import uvicorn

# Load environment variables with explicit precedence:
# 1) repository root (.env, .env.development)
# 2) python-backend/.env (highest precedence for backend-specific overrides)
_SRC_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _SRC_DIR.parent
_ROOT_DIR = _BACKEND_DIR.parent


def _merge_env_file(path: Path, *, override: bool) -> None:
    """Merge dotenv values into process env, skipping empty values."""
    if not path.exists():
        return

    values = dotenv_values(path)
    for key, raw_value in values.items():
        if not key:
            continue
        if raw_value is None:
            continue

        value = str(raw_value).strip()
        if value == "":
            continue

        if override or key not in os.environ:
            os.environ[key] = value


_merge_env_file(_ROOT_DIR / ".env", override=False)
_merge_env_file(_ROOT_DIR / ".env.development", override=True)
_merge_env_file(_BACKEND_DIR / ".env", override=True)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# Configuration
# ============================================================================

class Settings:
    """Application settings"""

    # Server
    HOST: str = os.getenv("PYTHON_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PYTHON_PORT", "8000"))

    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/chimaridata"
    )

    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    REDIS_ENABLED: bool = os.getenv("REDIS_ENABLED", "false").lower() == "true"

    # AI/LLM
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    DEFAULT_LLM_MODEL: str = os.getenv("DEFAULT_LLM_MODEL", "gpt-4")
    DEFAULT_EMBEDDING_MODEL: str = os.getenv(
        "DEFAULT_EMBEDDING_MODEL",
        "text-embedding-3-small"
    )

    # Vector Store
    USE_PGVECTOR: bool = os.getenv("USE_PGVECTOR", "true").lower() == "true"
    VECTOR_STORE_PATH: str = os.getenv("VECTOR_STORE_PATH", "./vector_stores")

    # Environment
    ENVIRONMENT: str = os.getenv("NODE_ENV", "development")
    DEBUG: bool = ENVIRONMENT == "development"

    # CORS
    ALLOWED_ORIGINS: list = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]


settings = Settings()

# ============================================================================
# FastAPI Application
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """
    Lifespan context manager for startup and shutdown events
    """
    # Startup
    logger.info("=" * 60)
    logger.info("Chimaridata Python Backend Starting")
    logger.info("=" * 60)
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"Debug mode: {settings.DEBUG}")
    logger.info(f"Database: PostgreSQL with pgvector")
    logger.info(f"Vector store: {'PGVector' if settings.USE_PGVECTOR else 'FAISS'}")
    logger.info(f"LLM provider: OpenAI ({settings.DEFAULT_LLM_MODEL})")

    # Initialize services
    await initialize_services()

    logger.info("Services initialized successfully")
    logger.info("Ready to accept connections")

    yield

    # Shutdown
    logger.info("Shutting down gracefully...")
    await cleanup_services()
    logger.info("Shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="Chimaridata Python Backend",
    description="Data Science-as-a-Service platform with LangChain orchestration",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Service Initialization
# ============================================================================

async def initialize_services():
    """
    Initialize all services

    Called on application startup
    """
    # Initialize database first (other services may depend on it)
    from .db import init_database, check_database_health
    try:
        init_database(
            database_url=settings.DATABASE_URL,
            pool_size=5,
            max_overflow=10
        )
        logger.info("Database connection initialized")

        # Check database health
        db_health = await check_database_health()
        if db_health["status"] == "healthy":
            logger.info(f"Database health check passed: {db_health['latency_ms']}ms latency")
        else:
            logger.warning(f"Database health check warning: {db_health['message']}")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        # Continue anyway for development (services may work without DB)

    # Import services to initialize singletons
    from .services.agent_orchestrator import get_orchestrator
    from .services.semantic_matching import get_semantic_matcher
    from .services.rag_evidence_chain import get_evidence_chain_service
    from .services.transformation_engine import (
        get_transformation_executor, get_business_registry
    )

    # Initialize orchestrator
    orchestrator = get_orchestrator()
    logger.info("Agent orchestrator initialized")

    # Initialize WebSocket agent bridge
    from .websocket import initialize_agent_bridge
    agent_bridge = initialize_agent_bridge(connection_manager)
    agent_bridge.initialize(
        orchestrator=orchestrator,
        analysis_orchestrator=None  # Will be initialized when needed
    )
    logger.info("WebSocket agent bridge initialized")

    # Store in app state for access by routes
    app.state.agent_bridge = agent_bridge
    app.state.orchestrator = orchestrator

    # Initialize semantic matcher
    matcher = get_semantic_matcher()
    logger.info("Semantic matching service initialized")

    # Initialize evidence chain service
    evidence_service = get_evidence_chain_service()
    logger.info("Evidence chain service initialized")

    # Initialize transformation engine
    executor = get_transformation_executor()
    logger.info("Transformation engine initialized")

    # Register predefined business definitions
    registry = get_business_registry()
    logger.info(f"Business definitions registry: {len(registry.definitions)} definitions")

    if getattr(app.state, "routes_registered", False):
        logger.info("API routes already registered")
        validate_environment()
        return

    # Include API routes
    from .api.routes import include_routes
    include_routes(app)
    logger.info("API routes included")

    # Include billing routes (after app is fully created)
    from .api.billing_routes import router as billing_router
    app.include_router(billing_router, prefix="/api/v1")
    app.include_router(billing_router)  # Also mount at root for Vite proxy rewrite (/api/billing/* → /billing/*)
    logger.info("Billing routes included")

    # Include knowledge routes (after app is fully created)
    from .api.knowledge_routes import router as knowledge_router
    app.include_router(knowledge_router, prefix="/api/v1")
    app.include_router(knowledge_router)  # Also mount at root for Vite proxy rewrite
    logger.info("Knowledge routes included")

    # Include admin routes (after app is fully created)
    from .api.admin_routes import router as admin_router
    app.include_router(admin_router, prefix="/api/v1")
    app.include_router(admin_router)  # Also mount at root for Vite proxy rewrite
    logger.info("Admin routes included")

    # Include verification routes (after app is fully created)
    from .api.verification_routes import router as verification_router
    app.include_router(verification_router)
    logger.info("Verification routes included")

    # Include upload routes (after app is fully created)
    from .api.upload_routes import router as upload_router
    app.include_router(upload_router)
    logger.info("Upload routes included")

    # Include data ingestion routes (database, API, cloud connectors)
    from .api.data_ingestion_routes import router as data_ingestion_router
    app.include_router(data_ingestion_router)
    logger.info("Data ingestion routes included")

    # Include transformation routes (after app is fully created)
    from .api.transformation_routes import router as transformation_router
    app.include_router(transformation_router)
    logger.info("Transformation routes included")

    # Include analysis execution routes (after app is fully created)
    from .api.analysis_routes import router as analysis_router, legacy_router as analysis_legacy_router
    app.include_router(analysis_router)
    app.include_router(analysis_legacy_router)
    logger.info("Analysis execution routes included (with legacy compatibility)")

    # Include results and dashboard routes (after app is fully created)
    from .api.results_routes import router as results_router
    app.include_router(results_router)
    logger.info("Results routes included")

    # Include semantic mapping routes (after app is fully created)
    from .api.semantic_routes import router as semantic_router
    app.include_router(semantic_router)
    logger.info("Semantic routes included")

    # Include project routes (after app is fully created)
    from .api.project_routes import include_project_routes
    include_project_routes(app)
    logger.info("Project routes included")

    # Include payment routes (after app is fully created)
    from .api.payment_routes import include_payment_routes
    include_payment_routes(app)
    logger.info("Payment routes included")

    # Include template routes (after app is fully created)
    from .api.template_routes import include_template_routes
    include_template_routes(app)
    logger.info("Template routes included")

    # Include agent pipeline routes (U2A2A2U pipeline)
    from .api.agent_pipeline_routes import include_agent_pipeline_routes
    include_agent_pipeline_routes(app)
    logger.info("Agent pipeline routes included")

    # Include auth routes (after app is fully created)
    # These are at /api/auth/* to match frontend expectations
    from .api.auth_routes import include_auth_routes
    include_auth_routes(app)
    logger.info("Auth routes included")

    # Include compatibility routes for legacy frontend paths in Python mode
    from .api.compat_routes import router as compat_router
    app.include_router(compat_router)
    logger.info("Compatibility routes included")
    app.state.routes_registered = True

    # Validate required environment variables
    validate_environment()


async def cleanup_services():
    """
    Cleanup services on shutdown

    Called on application shutdown
    """
    from .db import close_database
    await close_database()
    logger.info("Database connections closed")


def validate_environment():
    """
    Validate required environment variables

    Raises error if critical variables are missing
    """
    errors = []

    if not settings.OPENAI_API_KEY:
        errors.append("OPENAI_API_KEY is required for embeddings and LLM")

    if not settings.DATABASE_URL:
        errors.append("DATABASE_URL is required")

    if errors:
        error_msg = "Environment validation failed:\n" + "\n".join(f"  - {e}" for e in errors)
        logger.error(error_msg)
        raise RuntimeError(error_msg)

    logger.info("Environment validation passed")


def register_routes_without_startup() -> None:
    """
    Register API routers without requiring FastAPI lifespan startup.

    This keeps tests (which may instantiate ASGITransport without lifespan)
    and runtime route availability consistent.
    """
    if getattr(app.state, "routes_registered", False):
        return

    from .api.routes import include_routes
    from .api.billing_routes import router as billing_router
    from .api.knowledge_routes import router as knowledge_router
    from .api.admin_routes import router as admin_router
    from .api.verification_routes import router as verification_router
    from .api.upload_routes import router as upload_router
    from .api.data_ingestion_routes import router as data_ingestion_router
    from .api.transformation_routes import router as transformation_router
    from .api.analysis_routes import router as analysis_router, legacy_router as analysis_legacy_router
    from .api.results_routes import router as results_router
    from .api.semantic_routes import router as semantic_router
    from .api.project_routes import include_project_routes
    from .api.payment_routes import include_payment_routes
    from .api.template_routes import include_template_routes
    from .api.agent_pipeline_routes import include_agent_pipeline_routes
    from .api.auth_routes import include_auth_routes
    from .api.compat_routes import router as compat_router

    include_routes(app)
    app.include_router(billing_router, prefix="/api/v1")
    app.include_router(billing_router)
    app.include_router(knowledge_router, prefix="/api/v1")
    app.include_router(knowledge_router)
    app.include_router(admin_router, prefix="/api/v1")
    app.include_router(admin_router)
    app.include_router(verification_router)
    app.include_router(upload_router)
    app.include_router(data_ingestion_router)
    app.include_router(transformation_router)
    app.include_router(analysis_router)
    app.include_router(analysis_legacy_router)
    app.include_router(results_router)
    app.include_router(semantic_router)
    include_project_routes(app)
    include_payment_routes(app)
    include_template_routes(app)
    include_agent_pipeline_routes(app)
    include_auth_routes(app)
    app.include_router(compat_router)

    app.state.routes_registered = True
    logger.info("API routes pre-registered")


register_routes_without_startup()


# ============================================================================
# WebSocket Support for Real-time Updates
# ============================================================================

class ConnectionManager:
    """
    Enhanced WebSocket connection manager with project/user routing.

    Supports multiple broadcast strategies:
    - Session-specific: Send to a specific session
    - Project-specific: Send to all sessions viewing a project
    - User-specific: Send to all sessions for a user
    - Global: Send to all connected sessions
    """

    def __init__(self):
        # Core storage
        self.active_connections: Dict[str, WebSocket] = {}
        self.session_info: Dict[str, Dict[str, Any]] = {}

        # Index mappings for efficient broadcasting
        self.project_connections: Dict[str, Set[str]] = {}  # project_id -> session_ids
        self.user_connections: Dict[str, Set[str]] = {}     # user_id -> session_ids

    async def connect(
        self,
        websocket: WebSocket,
        session_id: str,
        project_id: Optional[str] = None,
        user_id: Optional[str] = None
    ):
        """
        Connect a new WebSocket with optional context.

        Args:
            websocket: The WebSocket connection
            session_id: Unique session identifier
            project_id: Optional project ID for project-based routing
            user_id: Optional user ID for user-based routing
        """
        await websocket.accept()

        # Store connection
        self.active_connections[session_id] = websocket

        # Store session metadata
        self.session_info[session_id] = {
            "project_id": project_id,
            "user_id": user_id,
            "connected_at": datetime.utcnow().isoformat()
        }

        # Index by project
        if project_id:
            if project_id not in self.project_connections:
                self.project_connections[project_id] = set()
            self.project_connections[project_id].add(session_id)

        # Index by user
        if user_id:
            if user_id not in self.user_connections:
                self.user_connections[user_id] = set()
            self.user_connections[user_id].add(session_id)

        logger.info(f"WebSocket connected: session_id={session_id}, project_id={project_id}, user_id={user_id}")

    def disconnect(self, session_id: str):
        """
        Disconnect a WebSocket and clean up all indexes.
        """
        # Get session info before cleanup
        info = self.session_info.get(session_id, {})
        project_id = info.get("project_id")
        user_id = info.get("user_id")

        # Remove from active connections
        if session_id in self.active_connections:
            del self.active_connections[session_id]

        # Remove from session info
        if session_id in self.session_info:
            del self.session_info[session_id]

        # Remove from project index
        if project_id and project_id in self.project_connections:
            self.project_connections[project_id].discard(session_id)
            if not self.project_connections[project_id]:
                del self.project_connections[project_id]

        # Remove from user index
        if user_id and user_id in self.user_connections:
            self.user_connections[user_id].discard(session_id)
            if not self.user_connections[user_id]:
                del self.user_connections[user_id]

        logger.info(f"WebSocket disconnected: session_id={session_id}")

    async def send_message(self, session_id: str, message: dict):
        """
        Send a message to a specific session.

        Returns False if session not found or send failed.
        """
        if session_id not in self.active_connections:
            return False

        try:
            websocket = self.active_connections[session_id]
            await websocket.send_json(message)
            return True
        except Exception as e:
            logger.warning(f"Failed to send message to session {session_id}: {e}")
            self.disconnect(session_id)
            return False

    async def broadcast(self, message: dict):
        """
        Broadcast a message to all connected sessions.

        Automatically cleans up disconnected sessions.
        """
        disconnected = []
        for session_id, websocket in self.active_connections.items():
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.warning(f"Broadcast failed for session {session_id}: {e}")
                disconnected.append(session_id)

        # Clean up disconnected sessions
        for session_id in disconnected:
            self.disconnect(session_id)

    async def broadcast_to_project(self, project_id: str, message: dict):
        """
        Broadcast a message to all sessions viewing a specific project.

        Args:
            project_id: Project ID to broadcast to
            message: Message to broadcast
        """
        if project_id not in self.project_connections:
            logger.debug(f"No connections for project {project_id}")
            return

        session_ids = list(self.project_connections[project_id])
        for session_id in session_ids:
            await self.send_message(session_id, message)

    async def broadcast_to_user(self, user_id: str, message: dict):
        """
        Broadcast a message to all sessions for a specific user.

        Args:
            user_id: User ID to broadcast to
            message: Message to broadcast
        """
        if user_id not in self.user_connections:
            logger.debug(f"No connections for user {user_id}")
            return

        session_ids = list(self.user_connections[user_id])
        for session_id in session_ids:
            await self.send_message(session_id, message)

    def get_connection_count(self) -> int:
        """Get total number of active connections."""
        return len(self.active_connections)

    def get_project_connections(self, project_id: str) -> int:
        """Get number of connections for a specific project."""
        return len(self.project_connections.get(project_id, set()))

    def get_user_connections(self, user_id: str) -> int:
        """Get number of connections for a specific user."""
        return len(self.user_connections.get(user_id, set()))


connection_manager = ConnectionManager()


# ============================================================================
# Progress Broadcasting Helper
# ============================================================================

async def emit_progress(
    session_id: str,
    step: str,
    progress: int,
    message: str,
    data: Optional[Dict[str, Any]] = None
):
    """
    Emit a progress update via WebSocket.

    This function is called by agents and services to broadcast
    progress updates to connected clients.

    Args:
        session_id: Session ID to send progress to
        step: Current workflow step
        progress: Progress percentage (0-100)
        message: Human-readable progress message
        data: Optional additional data
    """
    await connection_manager.send_message(session_id, {
        "type": "progress",
        "session_id": session_id,
        "step": step,
        "progress": progress,
        "message": message,
        "data": data or {},
        "timestamp": datetime.utcnow().isoformat()
    })


async def emit_error(
    session_id: str,
    step: str,
    error: str,
    data: Optional[Dict[str, Any]] = None
):
    """
    Emit an error message via WebSocket.

    Args:
        session_id: Session ID to send error to
        step: Current workflow step
        error: Error message
        data: Optional additional data
    """
    await connection_manager.send_message(session_id, {
        "type": "error",
        "session_id": session_id,
        "step": step,
        "error": error,
        "data": data or {},
        "timestamp": datetime.utcnow().isoformat()
    })


async def emit_completion(
    session_id: str,
    step: str,
    message: str,
    results: Optional[Dict[str, Any]] = None
):
    """
    Emit a completion message via WebSocket.

    Args:
        session_id: Session ID to send completion to
        step: Completed workflow step
        message: Human-readable completion message
        results: Optional results data
    """
    await connection_manager.send_message(session_id, {
        "type": "complete",
        "session_id": session_id,
        "step": step,
        "message": message,
        "results": results or {},
        "timestamp": datetime.utcnow().isoformat()
    })


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    session_id: str,
    token: Optional[str] = None,
    project_id: Optional[str] = None
):
    """
    Enhanced WebSocket endpoint for real-time workflow updates.

    Query Parameters:
    - token: Optional JWT token for authentication
    - project_id: Optional project ID for project-based routing

    Clients connect to receive updates about:
    - Workflow progress
    - Analysis execution status
    - Agent orchestration events
    - Error messages
    - Completion notifications

    Authentication:
    - If token is provided, it will be verified and user_id extracted
    - If project_id is provided, updates will be broadcast to all viewers of that project
    """
    # Authenticate if token provided
    user_id = None
    if token:
        try:
            from .auth.middleware import decode_token
            token_data = decode_token(token)
            user_id = token_data.user_id
            logger.info(f"WebSocket authenticated: user_id={user_id}")
        except Exception as e:
            logger.warning(f"WebSocket authentication failed: {e}")
            # Continue without authentication for development

    # Connect with context
    await connection_manager.connect(
        websocket,
        session_id,
        project_id=project_id,
        user_id=user_id
    )

    # Send welcome message
    await connection_manager.send_message(session_id, {
        "type": "connection_established",
        "status": "connected",
        "session_id": session_id,
        "project_id": project_id,
        "user_id": user_id,
        "timestamp": datetime.utcnow().isoformat(),
        "message": "WebSocket connection established"
    })

    try:
        while True:
            # Keep connection alive and handle client messages
            data = await websocket.receive_json()

            # Handle different message types
            message_type = data.get("type")

            if message_type == "ping":
                # Respond to keepalive
                await connection_manager.send_message(
                    session_id,
                    {"type": "pong", "timestamp": datetime.utcnow().isoformat()}
                )

            elif message_type == "subscribe":
                # Subscribe to project updates (supports both project_id and channels payload)
                subscribe_project_id = data.get("project_id")
                channels: List[str] = []
                if not subscribe_project_id:
                    raw_channels = data.get("channels") or []
                    if isinstance(raw_channels, list):
                        channels = [str(c) for c in raw_channels]
                        for channel in channels:
                            if channel.startswith("project:"):
                                subscribe_project_id = channel.split(":", 1)[1]
                                break

                if subscribe_project_id:
                    # Update connection's project association
                    info = connection_manager.session_info.get(session_id, {})
                    old_project_id = info.get("project_id")

                    # Update indexes
                    if old_project_id and old_project_id in connection_manager.project_connections:
                        connection_manager.project_connections[old_project_id].discard(session_id)

                    if subscribe_project_id not in connection_manager.project_connections:
                        connection_manager.project_connections[subscribe_project_id] = set()
                    connection_manager.project_connections[subscribe_project_id].add(session_id)

                    info["project_id"] = subscribe_project_id

                    await connection_manager.send_message(session_id, {
                        "type": "subscription_confirmed",
                        "data": {
                            "channels": channels or [f"project:{subscribe_project_id}"],
                            "project_id": subscribe_project_id,
                        },
                        "timestamp": datetime.utcnow().isoformat()
                    })
                    logger.info(f"Session {session_id} subscribed to project {subscribe_project_id}")

            elif message_type == "unsubscribe":
                unsubscribe_project_id = data.get("project_id")
                channels: List[str] = []
                raw_channels = data.get("channels") or []
                if isinstance(raw_channels, list):
                    channels = [str(c) for c in raw_channels]
                    if not unsubscribe_project_id:
                        for channel in channels:
                            if channel.startswith("project:"):
                                unsubscribe_project_id = channel.split(":", 1)[1]
                                break

                if unsubscribe_project_id and unsubscribe_project_id in connection_manager.project_connections:
                    connection_manager.project_connections[unsubscribe_project_id].discard(session_id)
                    if not connection_manager.project_connections[unsubscribe_project_id]:
                        del connection_manager.project_connections[unsubscribe_project_id]

                await connection_manager.send_message(session_id, {
                    "type": "unsubscription_confirmed",
                    "data": {
                        "channels": channels or ([f"project:{unsubscribe_project_id}"] if unsubscribe_project_id else []),
                        "project_id": unsubscribe_project_id,
                    },
                    "timestamp": datetime.utcnow().isoformat()
                })

            elif message_type == "broadcast":
                # Broadcast message to project (if authorized)
                if project_id or data.get("project_id"):
                    broadcast_project_id = data.get("project_id", project_id)
                    message = data.get("message", {})
                    await connection_manager.broadcast_to_project(broadcast_project_id, message)

            else:
                logger.warning(f"Unknown message type: {message_type}")

    except WebSocketDisconnect:
        connection_manager.disconnect(session_id)
        logger.info(f"WebSocket disconnected normally: session_id={session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        connection_manager.disconnect(session_id)


# ============================================================================
# Global Error Handlers
# ============================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Handle all uncaught exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "detail": str(exc) if settings.DEBUG else None
        }
    )


@app.exception_handler(ValueError)
async def validation_exception_handler(request, exc):
    """Handle validation errors"""
    logger.warning(f"Validation error: {exc}")
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": "Validation error",
            "detail": str(exc)
        }
    )


# ============================================================================
# Root and Health Endpoints
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "name": "Chimaridata Python Backend",
        "version": "1.0.0",
        "status": "running",
        "environment": settings.ENVIRONMENT,
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """
    Health check endpoint

    Returns service health status including database connectivity.
    """
    from .db import check_database_health

    # Check database health
    db_health = await check_database_health()

    # Determine overall status
    overall_status = "healthy" if db_health["status"] == "healthy" else "degraded"

    return {
        "status": overall_status,
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
        "services": {
            "api": "up",
            "database": db_health["status"],
            "database_latency_ms": db_health.get("latency_ms"),
            "orchestrator": "up",
            "semantic_matching": "up",
            "evidence_chain": "up",
            "transformation_engine": "up",
            "billing_service": "up",
            "knowledge_service": "up",
            "admin_service": "up"
        },
        "timestamp": datetime.utcnow().isoformat()
    }


# ============================================================================
# Development Helpers
# ============================================================================

@app.get("/config")
async def get_config():
    """
    Get current configuration (development only)

    WARNING: Do not expose in production
    """
    if not settings.DEBUG:
        return {"error": "Not available in production"}

    return {
        "environment": settings.ENVIRONMENT,
        "database_configured": bool(settings.DATABASE_URL),
        "redis_enabled": settings.REDIS_ENABLED,
        "vector_store": "PGVector" if settings.USE_PGVECTOR else "FAISS",
        "llm_model": settings.DEFAULT_LLM_MODEL
    }


# ============================================================================
# Main Entry Point
# ============================================================================

def main():
    """
    Main entry point for running the application

    Usage:
        python main.py
        python main.py --host 0.0.0.0 --port 8000
        python main.py --reload
    """
    import argparse

    parser = argparse.ArgumentParser(description="Chimaridata Python Backend")
    parser.add_argument(
        "--host",
        default=settings.HOST,
        help=f"Host to bind to (default: {settings.HOST})"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=settings.PORT,
        help=f"Port to bind to (default: {settings.PORT})"
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload for development"
    )

    args = parser.parse_args()

    # Run with uvicorn
    uvicorn.run(
        "src.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info"
    )


if __name__ == "__main__":
    main()
