"""
SQLAlchemy Database Models

Defines all database tables for the Python backend.
Uses SQLAlchemy ORM with asyncpg driver for PostgreSQL.

Pydantic is used separately for:
- Validating data types and structure
- Serializing data (e.g., to JSON)
- Generating API documentation

Tables:
- users
- projects
- datasets
- question_mappings
- transformations
- analysis_results
- insights
- evidence_links
- artifacts
- sessions
- business_definitions
- column_embeddings
"""

from datetime import datetime
from typing import Optional, List, Dict, Any

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    ForeignKey, Text, JSON, Index, Float,
    Numeric, BigInteger, create_engine, text
)
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.sql import func
from sqlalchemy.ext.asyncio import (
    create_async_engine, AsyncSession,
    async_sessionmaker
)

# Configure logging
import logging
logger = logging.getLogger(__name__)

# Database URL - will be loaded from environment
DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/chimaridata"


# ============================================================================
# Base Class
# ============================================================================

Base = declarative_base()


# ============================================================================
# User Table
# ============================================================================

class User(Base):
    """User accounts"""
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False)
    name = Column(String(255))
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=False), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    datasets = relationship("Dataset", back_populates="owner")
    sessions = relationship("Session", back_populates="owner")
    insights = relationship("Insight", back_populates="owner")


# ============================================================================
# Project Table
# ============================================================================

class Project(Base):
    """Project records"""
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    industry = Column(String(100))
    journey_step = Column(String(50))
    journey_progress = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=False), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    datasets = relationship("Dataset", back_populates="project")
    sessions = relationship("Session", back_populates="project")
    insights = relationship("Insight", back_populates="project")
    artifacts = relationship("Artifact", back_populates="project")

    # Indexes
    __table_args__ = (
        Index('ix_projects_user_id', 'user_id'),
        Index('ix_projects_journey_step', 'journey_step'),
    )


# ============================================================================
# Dataset Table
# ============================================================================

class Dataset(Base):
    """Dataset records"""
    __tablename__ = "datasets"

    id = Column(String(36), primary_key=True, index=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    source_type = Column(String(50))  # computer, google_drive, onedrive, icloud, rest_api
    file_path = Column(Text)
    file_size = Column(BigInteger)
    record_count = Column(Integer)
    schema = Column(JSON, nullable=True)
    pii_analysis = Column(JSON, nullable=True)
    pii_decision = Column(JSON, nullable=True)
    embeddings_generated = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=False), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="datasets")
    owner = relationship("User", back_populates="datasets", foreign_keys=[project_id])
    transformations = relationship("Transformation", back_populates="dataset")
    analysis_results = relationship("AnalysisResult", back_populates="dataset")
    column_embeddings = relationship("ColumnEmbedding", back_populates="dataset")

    # Indexes
    __table_args__ = (
        Index('ix_datasets_project_id', 'project_id'),
        Index('ix_datasets_source_type', 'source_type'),
    )


# ============================================================================
# Question Mapping Table
# ============================================================================

class QuestionMapping(Base):
    """Question to element mappings"""
    __tablename__ = "question_mappings"

    id = Column(String(36), primary_key=True, index=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    question_id = Column(String(64))
    question_text = Column(Text, nullable=False)
    question_embedding = Column(JSON, nullable=True)
    related_elements = Column(JSON, nullable=True)
    related_columns = Column(JSON, nullable=True)
    recommended_analyses = Column(JSON, nullable=True)
    intent_type = Column(String(50))
    confidence = Column(Float)
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)

    # Relationships
    project = relationship("Project")

    # Indexes
    __table_args__ = (
        Index('ix_question_mappings_project_id', 'project_id'),
        Index('ix_question_mappings_question_id', 'question_id'),
    )


# ============================================================================
# Transformation Table
# ============================================================================

class Transformation(Base):
    """Transformation records"""
    __tablename__ = "transformations"

    id = Column(String(36), primary_key=True, index=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    dataset_id = Column(String(36), ForeignKey("datasets.id"), nullable=False)
    name = Column(String(255), nullable=False)
    operation_type = Column(String(50))
    steps = Column(JSON, nullable=True)
    status = Column(String(20), default="pending")
    result = Column(JSON, nullable=True)
    error = Column(Text)
    execution_time_ms = Column(Integer)
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)
    completed_at = Column(DateTime(timezone=False))

    # Relationships
    project = relationship("Project")
    dataset = relationship("Dataset", back_populates="transformations")

    # Indexes
    __table_args__ = (
        Index('ix_transformations_project_id', 'project_id'),
        Index('ix_transformations_dataset_id', 'dataset_id'),
        Index('ix_transformations_status', 'status'),
    )


# ============================================================================
# Analysis Result Table
# ============================================================================

class AnalysisResult(Base):
    """Analysis execution results"""
    __tablename__ = "analysis_results"

    id = Column(String(36), primary_key=True, index=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    session_id = Column(String(36), ForeignKey("sessions.id"))
    analysis_type = Column(String(50))
    data = Column(JSON, nullable=True)
    data_metadata = Column("metadata", JSON, nullable=True)
    status = Column(String(20), default="pending")
    error = Column(Text)
    started_at = Column(DateTime(timezone=False), default=datetime.utcnow)
    completed_at = Column(DateTime(timezone=False))
    execution_time_ms = Column(Integer)
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)

    # Relationships
    project = relationship("Project")
    user = relationship("User")
    session = relationship("Session", back_populates="analysis_results")
    dataset = relationship("Dataset", back_populates="analysis_results", foreign_keys=[project_id])

    # Indexes
    __table_args__ = (
        Index('ix_analysis_results_project_id', 'project_id'),
        Index('ix_analysis_results_user_id', 'user_id'),
        Index('ix_analysis_results_session_id', 'session_id'),
        Index('ix_analysis_results_analysis_type', 'analysis_type'),
    )


# ============================================================================
# Insight Table
# ============================================================================

class Insight(Base):
    """Generated insights"""
    __tablename__ = "insights"

    id = Column(String(36), primary_key=True, index=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    session_id = Column(String(36), ForeignKey("sessions.id"))
    analysis_result_id = Column(String(36), ForeignKey("analysis_results.id"))
    title = Column(String(200), nullable=False)
    description = Column(Text)
    significance = Column(String(20))  # low, medium, high
    evidence = Column(JSON, nullable=True)
    data_elements_used = Column(JSON, nullable=True)
    confidence = Column(Float)
    generated_by = Column(String(50))  # data_scientist, business_agent
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="insights")
    session = relationship("Session")
    owner = relationship("User", back_populates="insights")
    evidence_links = relationship("EvidenceLink", back_populates="insight")

    # Indexes
    __table_args__ = (
        Index('ix_insights_project_id', 'project_id'),
        Index('ix_insights_session_id', 'session_id'),
        Index('ix_insights_significance', 'significance'),
    )


# ============================================================================
# Evidence Link Table
# ============================================================================

class EvidenceLink(Base):
    """Links in the evidence chain"""
    __tablename__ = "evidence_links"

    id = Column(String(36), primary_key=True, index=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    source_type = Column(String(20))  # question, element, transformation, insight, answer
    source_id = Column(String(64))
    target_type = Column(String(20))
    target_id = Column(String(64))
    link_type = Column(String(50))
    confidence = Column(Float)
    data_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)

    # Relationships
    project = relationship("Project")
    insight = relationship("Insight", foreign_keys=[project_id])

    # Indexes
    __table_args__ = (
        Index('ix_evidence_links_project_id', 'project_id'),
    )


# ============================================================================
# Artifact Table
# ============================================================================

class Artifact(Base):
    """Analysis artifacts (PDFs, presentations)"""
    __tablename__ = "artifacts"

    id = Column(String(36), primary_key=True, index=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    session_id = Column(String(36), ForeignKey("sessions.id"), nullable=False)
    type = Column(String(20))  # pdf, presentation, dashboard_data
    file_path = Column(Text)
    file_size = Column(BigInteger)
    data_metadata = Column("metadata", JSON, nullable=True)
    download_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="artifacts")
    session = relationship("Session")

    # Indexes
    __table_args__ = (
        Index('ix_artifacts_project_id', 'project_id'),
        Index('ix_artifacts_session_id', 'session_id'),
    )


# ============================================================================
# Session Table (for orchestrator state)
# ============================================================================

class Session(Base):
    """Orchestrator session state"""
    __tablename__ = "sessions"

    id = Column(String(36), primary_key=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    current_step = Column(String(50))
    state = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=False), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="sessions")
    owner = relationship("User", back_populates="sessions")
    question_mappings = relationship("QuestionMapping", back_populates="session")
    transformations = relationship("Transformation", back_populates="session")
    analysis_results = relationship("AnalysisResult", back_populates="session")

    # Indexes
    __table_args__ = (
        Index('ix_sessions_user_id', 'user_id'),
        Index('ix_sessions_project_id', 'project_id'),
    )


# ============================================================================
# Business Definition Table
# ============================================================================

class BusinessDefinition(Base):
    """Business metric/formula definitions"""
    __tablename__ = "business_definitions"

    id = Column(String(36), primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False)
    description = Column(Text)
    formula = Column(Text)
    source_columns = Column(JSON)
    category = Column(String(100))
    industry = Column(String(100))
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)

    # Indexes
    __table_args__ = (
        Index('ix_business_definitions_name', 'name'),
        Index('ix_business_definitions_category', 'category'),
    )


# ============================================================================
# Column Embedding Table
# ============================================================================

class ColumnEmbedding(Base):
    """Vector embeddings for columns"""
    __tablename__ = "column_embeddings"

    id = Column(String(36), primary_key=True, index=True)
    dataset_id = Column(String(36), ForeignKey("datasets.id"), nullable=False)
    column_name = Column(String(255), nullable=False)
    embedding = Column(JSON)  # Vector as list of floats
    embedding_model = Column(String(50))
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)

    # Relationships
    dataset = relationship("Dataset", back_populates="column_embeddings")

    # Indexes for fast similarity search
    __table_args__ = (
        Index('ix_column_embeddings_dataset_id', 'dataset_id'),
        Index('ix_column_embeddings_column_name', 'column_name'),
        Index('ix_column_embeddings_model', 'embedding_model'),
    )


# ============================================================================
# Billing Tables
# ============================================================================

class SubscriptionTier(Base):
    """Subscription tier definitions"""
    __tablename__ = "subscription_tiers"

    id = Column(String(36), primary_key=True, index=True)
    display_name = Column(String(100), nullable=False)
    monthly_price_usd = Column(Float, nullable=False)
    features = Column(JSON, nullable=True)  # List of features
    analysis_limit = Column(Integer, nullable=True)  # Max analyses per month
    projects_limit = Column(Integer, nullable=True)  # Max concurrent projects
    stripe_price_id = Column(String(100))  # Stripe price ID for actual billing
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=False), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Indexes
    __table_args__ = (
        Index('ix_subscription_tiers_active', 'is_active'),
    )


class BillingInvoice(Base):
    """Billing invoices for users"""
    __tablename__ = "billing_invoices"

    id = Column(String(36), primary_key=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    tier_id = Column(String(36), ForeignKey("subscription_tiers.id"))
    amount = Column(Float, nullable=False)
    currency = Column(String(3), default="USD")
    status = Column(String(20), nullable=False)  # pending, paid, failed, refunded
    stripe_invoice_id = Column(String(100))  # Link to Stripe invoice
    billing_period_start = Column(DateTime(timezone=False))
    billing_period_end = Column(DateTime(timezone=False))
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)
    paid_at = Column(DateTime(timezone=True))  # When invoice was paid
    due_at = Column(DateTime(timezone=True))  # When payment is due

    # Relationships
    user = relationship("User", backref="invoices")
    tier = relationship("SubscriptionTier")

    # Indexes
    __table_args__ = (
        Index('ix_billing_invoices_user_id', 'user_id'),
        Index('ix_billing_invoices_status', 'status'),
        Index('ix_billing_invoices_due', 'due_at'),
    )


class BillingCampaign(Base):
    """Promotional campaigns for billing"""
    __tablename__ = "billing_campaigns"

    id = Column(String(36), primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(50), nullable=False, unique=True)  # Promo code
    discount_percentage = Column(Float, default=0.0)
    description = Column(Text)
    start_date = Column(DateTime(timezone=False), nullable=False)
    end_date = Column(DateTime(timezone=False), nullable=False)
    active = Column(Boolean, default=True)
    max_uses = Column(Integer, default=None)  # None = unlimited
    current_uses = Column(Integer, default=0)
    created_by = Column(String(36), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=False), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Indexes
    __table_args__ = (
        Index('ix_billing_campaigns_code', 'code'),
        Index('ix_billing_campaigns_active', 'active'),
    )


class AuditLog(Base):
    """Audit log for admin actions"""
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    action = Column(String(50), nullable=False, index=True)  # create, update, delete, login, etc.
    resource_type = Column(String(50), nullable=False)  # project, dataset, user, billing, etc.
    resource_id = Column(String(36))  # ID of affected resource
    details = Column(JSON, default={})
    ip_address = Column(String(45))
    user_agent = Column(String(500))
    status = Column(String(20), default="success")  # success, failure, error
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow, index=True)

    # Relationships
    user = relationship("User", backref="audit_logs")

    # Indexes
    __table_args__ = (
        Index('ix_audit_logs_user_id', 'user_id'),
        Index('ix_audit_logs_action', 'action'),
        Index('ix_audit_logs_resource', 'resource_type'),
        Index('ix_audit_logs_created', 'created_at'),
    )


# ============================================================================
# Knowledge Base Tables
# ============================================================================

class KnowledgeNode(Base):
    """Knowledge graph nodes (industry, regulation, template, analysis_type, etc.)"""
    __tablename__ = "knowledge_nodes"

    id = Column(String(36), primary_key=True, index=True)
    type = Column(String(50), nullable=False, index=True)  # industry, regulation, template, analysis_type, question_pattern, column_pattern
    title = Column(String(200), nullable=False)
    content = Column(JSON, nullable=False)  # Knowledge content
    source = Column(String(100))  # Source of knowledge (document, manual, auto-generated)
    confidence = Column(Float, default=1.0)  # Confidence score (0-1)
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=False), default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(36), ForeignKey("users.id"))
    is_system = Column(Boolean, default=False)  # System-generated vs user-created
    node_metadata = Column("metadata", JSON, default={})  # Additional metadata

    # Relationships
    creator = relationship("User", backref="knowledge_nodes")

    # Indexes
    __table_args__ = (
        Index('ix_knowledge_nodes_type', 'type'),
        Index('ix_knowledge_nodes_source', 'source'),
        Index('ix_knowledge_nodes_confidence', 'confidence'),
    )


class KnowledgeEdge(Base):
    """Knowledge graph edges (relationships between nodes)"""
    __tablename__ = "knowledge_edges"

    id = Column(String(36), primary_key=True, index=True)
    from_node_id = Column(String(36), ForeignKey("knowledge_nodes.id"), nullable=False, index=True)
    to_node_id = Column(String(36), ForeignKey("knowledge_nodes.id"), nullable=False, index=True)
    relationship = Column(String(50), nullable=False)  # relates_to, requires, recommends, similar_to, causes
    weight = Column(Float, default=1.0)  # Edge weight for ranking
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)
    created_by = Column(String(36), ForeignKey("users.id"))

    # Indexes
    __table_args__ = (
        Index('ix_knowledge_edges_from', 'from_node_id'),
        Index('ix_knowledge_edges_to', 'to_node_id'),
        Index('ix_knowledge_edges_relationship', 'relationship'),
    )


class AnalysisPattern(Base):
    """Analysis patterns learned from successful analyses"""
    __tablename__ = "analysis_patterns"

    id = Column(String(36), primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    analysis_type = Column(String(50), nullable=False)  # correlation, regression, clustering, etc.
    success_rate = Column(Float, default=0.0)  # Success rate (0-1)
    usage_count = Column(Integer, default=0)  # How many times used
    confidence = Column(Float, default=1.0)  # Confidence in pattern
    parameters = Column(JSON, default={})  # Typical parameters for this pattern
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)
    created_by = Column(String(36), ForeignKey("users.id"))
    is_active = Column(Boolean, default=True)

    # Indexes
    __table_args__ = (
        Index('ix_analysis_patterns_type', 'analysis_type'),
        Index('ix_analysis_patterns_success_rate', 'success_rate'),
    )


class TemplateFeedback(Base):
    """User feedback on journey templates"""
    __tablename__ = "template_feedback"

    id = Column(String(36), primary_key=True, index=True)
    template_id = Column(String(36), nullable=False)  # ID of the template
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    rating = Column(Integer, nullable=False)  # Rating (1-5 stars)
    feedback_text = Column(Text, nullable=True)
    suggested_improvements = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)
    is_helpful = Column(Boolean, default=False)  # Admin marked as helpful

    # Indexes
    __table_args__ = (
        Index('ix_template_feedback_template', 'template_id'),
        Index('ix_template_feedback_user_id', 'user_id'),
        Index('ix_template_feedback_rating', 'rating'),
    )


# ============================================================================
# RBAC Tables (Role-Based Access Control)
# ============================================================================

class Role(Base):
    """User roles for RBAC"""
    __tablename__ = "roles"

    id = Column(String(36), primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    display_name = Column(String(100), nullable=False)
    description = Column(Text)
    permissions = Column(JSON, default=[])  # List of permission strings
    is_system = Column(Boolean, default=False)  # System roles cannot be deleted
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=False), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user_roles = relationship("UserRole", back_populates="role")

    # Indexes
    __table_args__ = (
        Index('ix_roles_name', 'name'),
        Index('ix_roles_is_system', 'is_system'),
    )


class UserRole(Base):
    """User role assignments"""
    __tablename__ = "user_roles"

    id = Column(String(36), primary_key=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    role_id = Column(String(36), ForeignKey("roles.id"), nullable=False, index=True)
    assigned_by = Column(String(36), ForeignKey("users.id"))  # Admin who assigned the role
    assigned_at = Column(DateTime(timezone=False), default=datetime.utcnow)
    expires_at = Column(DateTime(timezone=False))  # Optional expiry for temporary roles

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    role = relationship("Role", back_populates="user_roles")
    assigner = relationship("User", foreign_keys=[assigned_by])

    # Indexes
    __table_args__ = (
        Index('ix_user_roles_user', 'user_id'),
        Index('ix_user_roles_role', 'role_id'),
        Index('ix_user_roles_expires', 'expires_at'),
    )


class Permission(Base):
    """System permissions"""
    __tablename__ = "permissions"

    id = Column(String(36), primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    display_name = Column(String(100), nullable=False)
    description = Column(Text)
    category = Column(String(50))  # user, project, dataset, billing, admin, system
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)

    # Indexes
    __table_args__ = (
        Index('ix_permissions_name', 'name'),
        Index('ix_permissions_category', 'category'),
    )


# ============================================================================
# pgvector Extension (for vector search)
# ============================================================================

# Note: pgvector extension can be added separately
# The JSON columns in ColumnEmbedding store embeddings for RAG and semantic matching
# For production, consider adding vector columns with pgvector for faster similarity search


# ============================================================================
# Database Utility Functions
# ============================================================================

# Global engine and session maker
_engine = None
_async_session_maker = None


def get_engine(database_url: Optional[str] = None) -> Any:
    """
    Create database engine with connection pool

    Args:
        database_url: Optional database URL

    Returns:
        SQLAlchemy async engine
    """
    global _engine
    if _engine is None:
        url = database_url or DATABASE_URL

        # Configure async engine with connection pool
        _engine = create_async_engine(
            url,
            echo=False,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
            pool_recycle=3600,
        )
        logger.info(f"Database engine initialized: {url}")

    return _engine


def get_session_maker() -> Any:
    """
    Get async session factory

    Returns:
        Async session maker
    """
    global _async_session_maker
    if _async_session_maker is None:
        _async_session_maker = async_sessionmaker(
            get_engine(),
            class_=AsyncSession,
            expire_on_commit=False
        )
    return _async_session_maker


async def init_db():
    """
    Initialize database tables

    Creates all tables with proper indexes
    """
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created")


async def drop_db():
    """
    Drop all tables (USE WITH CAUTION)
    """
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    logger.warning("All database tables dropped")


async def close_db():
    """
    Close database connection
    """
    global _engine
    if _engine:
        await _engine.dispose()
        _engine = None
        logger.info("Database connection closed")


async def get_db() -> Any:
    """
    Dependency injection for database session

    Used in FastAPI routes:
        @app.get("/endpoint")
        async def endpoint(db: AsyncSession = Depends(get_db)):
            ...
    """
    async for session in get_session_maker():
        yield session


async def health_check() -> Dict[str, Any]:
    """
    Check database health

    Returns:
        Health status dict
    """
    try:
        async with get_db() as session:
            # Simple query to test connection
            await session.execute("SELECT 1")

        return {
            "status": "healthy",
            "driver": "asyncpg",
            "orm": "sqlalchemy",
            "pool_size": get_engine().pool.size(),
            "pool_overflow": get_engine().pool.overflow(),
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


def generate_uuid() -> str:
    """Generate a new UUID string"""
    import uuid
    return str(uuid.uuid4())


# ============================================================================
# Database Manager (for backward compatibility)
# ============================================================================

class DatabaseManager:
    """Simple database manager for backward compatibility with asyncpg-like interface"""

    def __init__(self, database_url: Optional[str] = None):
        self.engine = None
        self.session_factory = None
        self.database_url = database_url or DATABASE_URL
        self._connection = None

    async def initialize(self):
        """Initialize database connection"""
        self.engine = get_engine(self.database_url)
        self.session_factory = get_session_maker()
        await init_db()

    async def close(self):
        """Close database connection"""
        await close_db()

    async def get_session(self) -> AsyncSession:
        """Get a new session"""
        async for session in get_session_maker():
            yield session

    def health_status(self) -> Dict[str, Any]:
        """Get health status"""
        return health_check()

    # ========================================================================
    # Asyncpg-like interface methods for backward compatibility with repositories
    # ========================================================================

    def _prepare_query(self, query):
        """
        Prepare query for execution.

        Handles both SQLAlchemy select() objects and raw SQL strings.
        """
        # Check if it's a SQLAlchemy Core statement (has compile method)
        if hasattr(query, 'compile'):
            # It's a SQLAlchemy statement (select, insert, etc.)
            return query, None
        # Otherwise assume it's a raw SQL string
        return text(query), "raw_sql"

    async def fetch(self, query, *args) -> List[Dict[str, Any]]:
        """
        Execute a query and return all results as a list of dicts.

        Compatible with asyncpg's fetch() method.
        Handles both SQLAlchemy select() objects and raw SQL strings.
        """
        # Import here to avoid circular imports
        from ..db import get_db_context
        prepared_query, query_type = self._prepare_query(query)
        async with get_db_context() as session:
            # For raw SQL, pass args as tuple; for SQLAlchemy queries, no args needed
            if query_type == "raw_sql":
                result = await session.execute(prepared_query, args if args else ())
            else:
                result = await session.execute(prepared_query)
            # Convert result to list of dicts
            columns = result.keys()
            rows = result.fetchall()
            return [dict(zip(columns, row)) for row in rows]

    async def fetchrow(self, query, *args) -> Optional[Dict[str, Any]]:
        """
        Execute a query and return the first result as a dict.

        Compatible with asyncpg's fetchrow() method.
        Handles both SQLAlchemy select() objects and raw SQL strings.
        """
        # Import here to avoid circular imports
        from ..db import get_db_context
        prepared_query, query_type = self._prepare_query(query)
        async with get_db_context() as session:
            # For raw SQL, pass args as tuple; for SQLAlchemy queries, no args needed
            if query_type == "raw_sql":
                result = await session.execute(prepared_query, args if args else ())
            else:
                result = await session.execute(prepared_query)
            row = result.first()
            if row:
                return dict(zip(result.keys(), row))
            return None

    async def fetchval(self, query, *args, column: int = 0) -> Any:
        """
        Execute a query and return a single scalar value.

        Compatible with asyncpg's fetchval() method.
        Handles both SQLAlchemy select() objects and raw SQL strings.
        """
        # Import here to avoid circular imports
        from ..db import get_db_context
        prepared_query, query_type = self._prepare_query(query)
        async with get_db_context() as session:
            # For raw SQL, pass args as tuple; for SQLAlchemy queries, no args needed
            if query_type == "raw_sql":
                result = await session.execute(prepared_query, args if args else ())
            else:
                result = await session.execute(prepared_query)
            row = result.first()
            if row:
                return row[column]
            return None

    async def execute(self, query, *args) -> str:
        """
        Execute a query and return the result string.

        Compatible with asyncpg's execute() method.
        Handles both SQLAlchemy statements and raw SQL strings.
        """
        # Import here to avoid circular imports
        from ..db import get_db_context
        prepared_query, query_type = self._prepare_query(query)
        async with get_db_context() as session:
            # For raw SQL, pass args as tuple; for SQLAlchemy queries, no args needed
            if query_type == "raw_sql":
                result = await session.execute(prepared_query, args if args else ())
            else:
                result = await session.execute(prepared_query)
            await session.commit()
            # Return a status string similar to asyncpg
            rowcount = result.rowcount if hasattr(result, 'rowcount') else 0
            if rowcount is None:
                rowcount = 0
            return f"EXECUTE {rowcount}"


# Singleton instance
db_manager = DatabaseManager()


# ============================================================================
# Utility functions for converting records to dict
# ============================================================================

def record_to_dict(record: Base) -> Dict[str, Any]:
    """Convert a SQLAlchemy record to dictionary"""
    result = {}
    for column in record.__table__.columns:
        value = getattr(record, column.name)
        # Handle special column names that conflict with reserved attributes
        if column.name == "metadata":
            value = getattr(record, "data_metadata", value)
        result[column.name] = value
    return result


def records_to_list(records: List[Base]) -> List[Dict[str, Any]]:
    """Convert a list of SQLAlchemy records to list of dictionaries"""
    return [record_to_dict(r) for r in records]


def jsonb_dumps(value: Any) -> str:
    """Serialize value to JSON string for JSONB storage"""
    import json
    return json.dumps(value)


def jsonb_loads(value: str) -> Any:
    """Deserialize JSON string from JSONB storage"""
    import json
    return json.loads(value)


# ============================================================================
# Export
# ============================================================================

__all__ = [
    # Models
    "Base",
    "User",
    "Project",
    "Dataset",
    "QuestionMapping",
    "Transformation",
    "AnalysisResult",
    "Insight",
    "EvidenceLink",
    "Artifact",
    "Session",
    "BusinessDefinition",
    "ColumnEmbedding",
    "SubscriptionTier",
    "BillingInvoice",
    "BillingCampaign",
    "AuditLog",
    # Knowledge Base
    "KnowledgeNode",
    "KnowledgeEdge",
    "AnalysisPattern",
    "TemplateFeedback",
    # RBAC
    "Role",
    "UserRole",
    "Permission",
    # Utilities
    "get_engine",
    "get_session_maker",
    "init_db",
    "drop_db",
    "close_db",
    "get_db",
    "health_check",
    "generate_uuid",
    "DATABASE_URL",
    # Database Manager
    "DatabaseManager",
    "db_manager",
    "record_to_dict",
    "records_to_list",
    "jsonb_dumps",
    "jsonb_loads",
]
