"""
Data Standardization Schemas using Pydantic

Provides Pydantic models for all data structures used in the pipeline:
- Uploads and datasets
- Questions and mappings
- Transformations
- Analysis requests and results
- Evidence chain links
- User journeys and projects
- Agentic states

All models use strict type validation and provide clean serialization/deserialization.
"""

from pydantic import BaseModel, Field, validator, field_validator
from typing import Optional, List, Dict, Any, Literal, Union
from datetime import datetime
from enum import Enum


# ============================================================================
# Common Schemas
# ============================================================================

class ColumnType(str, Enum):
    """Column type classification"""
    NUMERIC = "numeric"
    CATEGORICAL = "categorical"
    DATETIME = "datetime"
    TEXT = "text"
    BOOLEAN = "boolean"


class PIISensitivity(str, Enum):
    """PII sensitivity levels"""
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    STRICTLY_PROHIBITED = "strictly_prohibited"


class ColumnDefinition(BaseModel):
    """Column definition with metadata"""
    name: str = Field(..., description="Column name")
    type: ColumnType = Field(..., description="Column type")
    nullable_percentage: float = Field(default=0.0, ge=0.0, le=100.0, description="Percentage of null values")
    sample_values: List[Any] = Field(default_factory=list, description="Sample values")
    pii_sensitivity: PIISensitivity = Field(default=PIISensitivity.NONE, description="PII sensitivity level")
    description: Optional[str] = Field(None, description="Column description")
    unique_count: Optional[int] = Field(None, ge=0, description="Number of unique values")

    class Config:
        json_schema_extra = "allow"
        schema_extra = {
            "example": {
                "name": "employee_id",
                "type": "numeric",
                "nullable_percentage": 0.0,
                "sample_values": ["EMP001", "EMP002"],
                "pii_sensitivity": "low"
            }
        }


class PIIAnalysisResult(BaseModel):
    """PII analysis result"""
    has_pii: bool
    pii_columns: List[str]
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)
    detected_fields: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)

    class Config:
        json_schema_extra = "allow"


class PIIDecision(BaseModel):
    """PII decision from user"""
    project_id: str
    dataset_id: str
    decision: Literal["include", "exclude", "anonymize"]
    anonymization_config: Optional[Dict[str, Any]] = None
    columns_to_anonymize: List[str] = Field(default_factory=list)
    decided_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Upload and Dataset Schemas
# ============================================================================

class SourceType(str, Enum):
    """File source types"""
    COMPUTER = "computer"
    GOOGLE_DRIVE = "google_drive"
    ONEDRIVE = "onedrive"
    ICLOUD = "icloud"
    REST_API = "rest_api"
    DATABASE = "database"


class DatasetCreate(BaseModel):
    """Schema for creating a new dataset"""
    project_id: str = Field(..., description="Project ID")
    name: str = Field(..., min_length=1, max_length=255, description="Dataset name")
    description: Optional[str] = Field(None, max_length=1000, description="Dataset description")
    source_type: SourceType
    file_path: str = Field(..., description="Path to uploaded file")


class DatasetSchema(BaseModel):
    """Inferred dataset schema"""
    columns: List[ColumnDefinition] = Field(..., description="Column definitions")
    record_count: int = Field(..., gt=0, description="Number of records")
    sample_rows: List[Dict[str, Any]] = Field(default_factory=list, description="Sample rows")
    inferred_at: datetime = Field(default_factory=datetime.utcnow, description="Schema inference timestamp")


class Dataset(BaseModel):
    """Dataset record"""
    id: str = Field(..., description="Dataset ID")
    project_id: str = Field(..., description="Project ID")
    name: str = Field(..., description="Dataset name")
    description: Optional[str] = None
    source_type: SourceType
    file_path: str = Field(..., description="Path to uploaded file")
    schema: Optional[DatasetSchema] = None
    pii_analysis: Optional[PIIAnalysisResult] = None
    pii_decision: Optional[PIIDecision] = None
    record_count: int = Field(..., ge=0, description="Number of records")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Creation timestamp")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Last update timestamp")

    class Config:
        json_schema_extra = "allow"


# ============================================================================
# Question and Mapping Schemas
# ============================================================================

class QuestionIntentType(str, Enum):
    """Analysis intent types"""
    TREND = "trend"  # Looking for patterns over time
    COMPARISON = "comparison"  # Comparing values across categories
    CORRELATION = "correlation"  # Looking for relationships between variables
    DISTRIBUTION = "distribution"  # Understanding value spread
    PREDICTION = "prediction"  # Forecasting future values
    DESCRIPTIVE = "descriptive"  # General description
    ROOT_CAUSE = "root_cause"  # Finding underlying causes


class QuestionElementMapping(BaseModel):
    """Mapping between question and data elements"""
    question_id: str = Field(..., description="Unique question ID")
    question_text: str = Field(..., description="Question text")
    related_elements: List[str] = Field(..., description="Related element IDs")
    related_columns: List[str] = Field(default_factory=list, description="Related column names")
    relevance_scores: List[float] = Field(..., description="Semantic relevance scores (0-1)")
    recommended_analyses: List[str] = Field(..., description="Recommended analysis types")
    business_context: Optional[str] = None
    intent_type: Optional[QuestionIntentType] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    embedding: Optional[List[float]] = Field(None, description="Question embedding vector")

    class Config:
        json_schema_extra = "allow"


class QuestionAnswerMapping(BaseModel):
    """Pre-defined question to answer mapping"""
    question_id: str
    question_text: str
    answer: str
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    required_data_elements: List[str] = Field(default_factory=list)
    recommended_analyses: List[str] = Field(default_factory=list)


# ============================================================================
# Transformation Schemas
# ============================================================================

class TransformationOperation(str, Enum):
    """Transformation operation types"""
    DERIVE_COLUMN = "derive_column"
    AGGREGATE = "aggregate"
    FILTER_ROWS = "filter_rows"
    JOIN_DATASETS = "join_datasets"
    NORMALIZE = "normalize"
    ENCODE_CATEGORICAL = "encode_categorical"
    FILL_MISSING = "fill_missing"
    RENAME_COLUMN = "rename_column"
    CAST_TYPE = "cast_type"


class AggregationMethod(str, Enum):
    """Aggregation methods"""
    SUM = "sum"
    AVG = "avg"
    MEAN = "mean"
    MEDIAN = "median"
    MIN = "min"
    MAX = "max"
    COUNT = "count"
    COUNT_DISTINCT = "count_distinct"
    STD = "std"
    VAR = "var"


class JoinType(str, Enum):
    """Join types"""
    INNER = "inner"
    LEFT = "left"
    RIGHT = "right"
    OUTER = "outer"


class TransformationStep(BaseModel):
    """Single transformation step definition"""
    step_id: str = Field(..., description="Unique step ID")
    element_id: Optional[str] = Field(None, description="Source element ID")
    operation: TransformationOperation = Field(..., description="Operation to perform")
    source_columns: List[str] = Field(..., description="Source column names")
    target_column: str = Field(..., description="Target column name")
    business_definition_id: Optional[str] = Field(None, description="Business definition to apply")
    formula: Optional[str] = Field(None, description="Formula to apply")
    condition: Optional[Dict[str, Any]] = Field(None, description="Filter condition")
    aggregation_method: Optional[AggregationMethod] = Field(None, description="Aggregation method")
    join_config: Optional[Dict[str, Any]] = Field(None, description="Join configuration")
    depends_on: List[str] = Field(default_factory=list, description="Step dependencies")
    description: Optional[str] = Field(None, description="Step description")

    @field_validator('source_columns')
    @classmethod
    def validate_source_columns(cls, v):
        if not v:
            raise ValueError("source_columns must have at least one element")
        return v

    class Config:
        json_schema_extra = "allow"


class TransformationPlan(BaseModel):
    """Complete transformation plan"""
    project_id: str
    dataset_id: str
    steps: List[TransformationStep] = Field(..., min_items=1, description="Transformation steps")
    business_context: Optional[Dict[str, Any]] = None
    estimated_runtime_ms: Optional[int] = Field(None, ge=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = "allow"


class TransformationResult(BaseModel):
    """Transformation execution result"""
    success: bool
    steps_executed: List[str]
    transformed_data: Dict[str, Any]
    row_count: int
    column_count: int
    error: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)
    execution_time_ms: Optional[int] = None


# ============================================================================
# Analysis Schemas
# ============================================================================

class AnalysisType(str, Enum):
    """Available analysis types"""
    DESCRIPTIVE_STATS = "descriptive_stats"
    CORRELATION = "correlation"
    REGRESSION = "regression"
    CLUSTERING = "clustering"
    CLASSIFICATION = "classification"
    TIME_SERIES = "time_series"
    STATISTICAL_TESTS = "statistical_tests"
    TEXT_ANALYSIS = "text_analysis"
    GROUP_ANALYSIS = "group_analysis"


class AnalysisRequest(BaseModel):
    """Request for analysis execution"""
    project_id: str
    user_id: str
    analysis_types: List[AnalysisType]
    question_mappings: Optional[List[QuestionElementMapping]] = None
    business_context: Optional[Dict[str, Any]] = None
    column_filters: Optional[Dict[str, Any]] = None
    include_metadata: bool = True
    max_records: Optional[int] = Field(None, ge=1)

    class Config:
        json_schema_extra = "allow"


class AnalysisDataSummary(BaseModel):
    """Summary data for an analysis"""
    record_count: int
    column_count: int
    numeric_columns: List[str]
    categorical_columns: List[str]
    datetime_columns: List[str]
    excluded_columns: List[str]
    missing_value_counts: Dict[str, int]


class AnalysisResult(BaseModel):
    """Standardized analysis result"""
    success: bool = Field(..., description="Analysis completed successfully")
    analysis_type: AnalysisType = Field(..., description="Type of analysis performed")
    data: Dict[str, Any] = Field(..., description="Analysis-specific data")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Execution metadata")
    errors: List[str] = Field(default_factory=list)

    class Config:
        json_schema_extra = "allow"


class VisualizationConfig(BaseModel):
    """Visualization configuration"""
    type: Literal["histogram", "bar", "line", "scatter", "box", "pie", "heatmap", "table"]
    column: Optional[str] = None
    x_column: Optional[str] = None
    y_column: Optional[str] = None
    color_column: Optional[str] = None
    config: Optional[Dict[str, Any]] = Field(default_factory=dict)
    title: Optional[str] = None


class Insight(BaseModel):
    """Generated insight from analysis"""
    id: str = Field(..., description="Insight ID")
    type: Literal["statistical", "correlation", "trend", "anomaly", "prediction"]
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1, max_length=1000)
    significance: Literal["low", "medium", "high"]
    evidence: Dict[str, Any] = Field(default_factory=dict, description="Supporting evidence")
    data_elements_used: List[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    generated_by: str = Field(..., description="What generated this insight")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ModelArtifact(BaseModel):
    """ML model artifact"""
    id: str
    model_type: Literal["regression", "classification", "clustering", "time_series"]
    target_column: str
    feature_columns: List[str]
    metrics: Dict[str, Any]
    model_file_path: Optional[str]
    training_time_ms: int
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Evidence Chain Schemas
# ============================================================================

class LinkType(str, Enum):
    """Types of links in evidence chain"""
    QUESTION_ELEMENT = "question_element"
    ELEMENT_TRANSFORMATION = "element_transformation"
    TRANSFORMATION_INSIGHT = "transformation_insight"
    QUESTION_ANSWER = "question_answer"
    INSIGHT_ANSWER = "insight_answer"


class EvidenceLink(BaseModel):
    """Link in evidence chain"""
    id: str = Field(..., description="Link ID")
    project_id: str = Field(..., description="Project ID")
    source_type: Literal["question", "element", "transformation", "insight", "answer"]
    source_id: str = Field(..., description="Source entity ID")
    target_type: Literal["element", "transformation", "insight", "answer"]
    target_id: str = Field(..., description="Target entity ID")
    link_type: LinkType = Field(..., description="Type of relationship")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class EvidenceChainQuery(BaseModel):
    """Query complete evidence chain"""
    project_id: str
    question_id: str
    include_context: bool = True
    link_types: Optional[List[LinkType]] = None
    min_confidence: float = 0.0


class EvidenceChainResponse(BaseModel):
    """Evidence chain query response"""
    chain: List[EvidenceLink]
    answers: List[Dict[str, str]]
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    trace_complete: bool = Field(default=False)


# ============================================================================
# Journey and User Schemas
# ============================================================================

class JourneyStep(str, Enum):
    """Journey step identifiers"""
    UPLOAD = "upload"
    PII_REVIEW = "pii_review"
    MAPPING = "mapping"
    TRANSFORMATION = "transformation"
    PLAN = "plan"
    EXECUTION = "execution"
    RESULTS = "results"


class JourneyState(str, Enum):
    """Journey state"""
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    AWAITING_APPROVAL = "awaiting_approval"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


class JourneyType(str, Enum):
    """Journey types"""
    NON_TECH = "non_tech"
    DATA_DISCOVERY = "data_discovery"
    MARKETING = "marketing"
    FINANCE = "finance"
    OPERATIONS = "operations"
    HR = "hr"


class JourneyCreate(BaseModel):
    """Create a new user journey"""
    user_id: str
    name: str
    description: Optional[str] = None
    journey_type: JourneyType

    class Config:
        json_schema_extra = "allow"


class Journey(BaseModel):
    """Journey record"""
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    journey_type: JourneyType
    current_step: JourneyStep
    state: JourneyState
    journey_progress: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class JourneyProgress(BaseModel):
    """Journey progress state (stored in JSONB)"""
    current_step: JourneyStep
    state: JourneyState
    steps_completed: List[JourneyStep] = Field(default_factory=list)
    pii_decision: Optional[PIIDecision] = None
    question_mappings: Optional[List[QuestionElementMapping]] = None
    transformation_plan: Optional[TransformationPlan] = None
    transformation_executed: bool = False
    analysis_types: Optional[List[AnalysisType]] = None
    analysis_results: Optional[Dict[str, Any]] = None
    evidence_chain: Optional[List[EvidenceLink]] = None
    cost_estimate: Optional[Dict[str, Any]] = None
    requirements_document: Optional[Dict[str, Any]] = None
    business_impact_assessment: Optional[Dict[str, Any]] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Agentic State Schemas
# ============================================================================

class AgentType(str, Enum):
    """Agent types in system"""
    PROJECT_MANAGER = "project_manager"
    DATA_SCIENTIST = "data_scientist"
    DATA_ENGINEER = "data_engineer"
    BUSINESS_AGENT = "business_agent"
    TEMPLATE_RESEARCH = "template_research"
    CUSTOMER_SUPPORT = "customer_support"


class AgentTask(str, Enum):
    """Task types for agents"""
    DATA_EXTRACTION = "data_extraction"
    ANALYSIS_PLANNING = "analysis_planning"
    TRANSFORMATION_EXECUTION = "transformation_execution"
    RESULT_INTERPRETATION = "result_interpretation"
    BUSINESS_TRANSLATION = "business_translation"
    TEMPLATE_SEARCH = "template_search"
    ISSUE_DIAGNOSIS = "issue_diagnosis"


class AgentState(BaseModel):
    """State for a LangGraph agent"""
    agent_id: AgentType
    current_step: str
    messages: List[Dict[str, Any]] = Field(default_factory=list)
    data: Dict[str, Any] = Field(default_factory=dict)
    tools_used: List[str] = Field(default_factory=list)
    next_step: Optional[str] = None
    completed_steps: List[str] = Field(default_factory=list)
    status: Literal["idle", "working", "waiting", "error", "completed"] = "idle"


class AgentMessage(BaseModel):
    """Message between agents"""
    message_id: str
    agent_id: AgentType
    to_agent_id: Optional[AgentType] = None
    from_step: str
    message: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_result: Optional[Any] = None


class AgentToolCall(BaseModel):
    """Tool call representation"""
    tool_name: str
    tool_id: str
    parameters: Dict[str, Any]
    result: Optional[Any] = None
    error: Optional[str] = None
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    execution_time_ms: Optional[int] = None


class OrchestratorState(BaseModel):
    """Shared state across workflow for LangGraph"""
    project_id: str
    user_id: str
    user_goals: List[str]
    current_journey_step: JourneyStep = JourneyStep.UPLOAD

    # Question and mappings
    user_questions: List[str] = Field(default_factory=list)
    question_element_mappings: List[QuestionElementMapping] = Field(default_factory=list)

    # Data
    datasets: List[str] = Field(default_factory=list)  # Dataset IDs
    primary_dataset_id: Optional[str] = None
    dataset_schemas: Dict[str, Any] = Field(default_factory=dict)

    # Transformations
    transformation_plan: Optional[Dict] = None
    transformation_steps: List[Dict] = Field(default_factory=list)
    transformation_executed: bool = False

    # Analysis
    analysis_types: List[str] = Field(default_factory=list)
    analysis_results: Dict[str, Any] = Field(default_factory=dict)
    analysis_in_progress: bool = False

    # Evidence chain
    evidence_chain: List[Dict] = Field(default_factory=list)

    # Agent states
    agent_states: Dict[AgentType, AgentState] = Field(default_factory=dict)
    agent_messages: List[AgentMessage] = Field(default_factory=list)

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Session tracking
    session_id: Optional[str] = None
    workflow_id: Optional[str] = None


# ============================================================================
# API Response Schemas
# ============================================================================

class APIResponse(BaseModel):
    """Standard API response wrapper"""
    success: bool
    message: Optional[str] = None
    data: Optional[Any] = None
    error: Optional[str] = None
    errors: List[str] = Field(default_factory=list)


class PaginatedResponse(BaseModel):
    """Paginated response"""
    items: List[Any]
    total: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_prev: bool


class WebSocketMessage(BaseModel):
    """WebSocket message format"""
    type: Literal["progress", "error", "complete", "status", "message"]
    session_id: str
    data: Optional[Dict[str, Any]] = None
    message: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Vector Store Schemas
# ============================================================================

class VectorDocument(BaseModel):
    """Document for vector storage"""
    id: str
    content: str
    embedding: Optional[List[float]] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    project_id: str
    document_type: Literal["column", "question", "insight", "transformation"]


class VectorSearchQuery(BaseModel):
    """Query for vector similarity search"""
    query_text: str
    project_id: str
    top_k: int = Field(default=5, ge=1, le=50)
    document_type: Optional[Literal["column", "question", "insight", "transformation"]] = None
    min_score: float = Field(default=0.0, ge=0.0, le=1.0)
    filter_metadata: Optional[Dict[str, Any]] = None


class VectorSearchResult(BaseModel):
    """Result of vector similarity search"""
    document_id: str
    content: str
    score: float
    metadata: Dict[str, Any]


# ============================================================================
# Business Definition Schemas
# ============================================================================

class BusinessDefinition(BaseModel):
    """Business metric or definition"""
    id: str
    name: str
    description: str
    formula: str
    source_columns: List[str]
    unit: Optional[str] = None
    category: Optional[str] = None
    example_values: Optional[List[str]] = None


# ============================================================================
# Health and Monitoring Schemas
# ============================================================================

class HealthStatus(BaseModel):
    """Health check response"""
    status: Literal["healthy", "degraded", "unhealthy"]
    version: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    services: Dict[str, Literal["up", "down", "degraded"]]


class Metrics(BaseModel):
    """Application metrics"""
    total_requests: int
    active_sessions: int
    analysis_count: int
    average_response_time_ms: float
    error_rate: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)
