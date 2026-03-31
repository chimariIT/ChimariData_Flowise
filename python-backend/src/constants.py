"""
Shared constants for the Python backend.

Centralized to prevent duplication and ensure consistency across all modules.
All modules should import from here rather than defining constants locally.

Last Updated: March 19, 2026
"""

# ============================================================================
# Data Processing Limits
# ============================================================================

# Maximum rows to store from uploaded files
# Enforced across upload, verification, and transformation
DATASET_DATA_ROW_CAP = 10_000

# Default preview sizes for UI display
DATASET_PREVIEW_ROWS = 100      # Standard preview for exploration
DATASET_MINI_PREVIEW_ROWS = 10  # Mini preview for quick verification

# Default sample size for PII detection and quality checks
DATASET_SAMPLE_SIZE = 100

# ============================================================================
# Analysis Limits
# ============================================================================

# Maximum time allowed for analysis execution
MAX_ANALYSIS_TIMEOUT_MS = 300_000      # 5 minutes per analysis
TOTAL_EXECUTION_TIMEOUT_MS = 900_000   # 15 minutes for entire execution

# ============================================================================
# Semantic Matching
# ============================================================================

# Minimum similarity score for semantic matching
SEMANTIC_SIMILARITY_THRESHOLD = 0.7

# Maximum number of mappings to return per question
MAX_MAPPINGS_PER_QUESTION = 5

# ============================================================================
# Payment & Stripe
# ============================================================================

# Default currency for payment processing
STRIPE_CURRENCY_DEFAULT = "usd"

# Payment status values
PAYMENT_STATUS_PENDING = "pending"
PAYMENT_STATUS_PROCESSING = "processing"
PAYMENT_STATUS_SUCCEEDED = "succeeded"
PAYMENT_STATUS_FAILED = "failed"

# ============================================================================
# Pipeline Status
# ============================================================================

# Journey step names
JOURNEY_STEP_UPLOAD = "upload"
JOURNEY_STEP_VERIFY = "verify"
JOURNEY_STEP_TRANSFORM = "transform"
JOURNEY_STEP_ANALYZE = "analyze"
JOURNEY_STEP_RESULTS = "results"

# ============================================================================
# PII Detection
# ============================================================================

# PII entity types to detect (from Presidio)
PII_ENTITY_TYPES = [
    "PERSON",
    "EMAIL_ADDRESS",
    "PHONE_NUMBER",
    "IBAN_CODE",
    "CREDIT_CARD",
    "IP_ADDRESS",
    "LOCATION",
    "DATE_TIME",
    "NRP",  # National Registration Number (SSN, etc.)
    "URL",
    "US_SSN",
    "US_PASSPORT",
    "US_DRIVER_LICENSE",
]

# PII decision types
PII_DECISION_ALLOW = "allow"
PII_DECISION_ANONYMIZE = "anonymize"
PII_DECISION_REMOVE = "remove"

# ============================================================================
# Transformation Operations
# ============================================================================

# Valid transformation operation types
TRANSFORM_OP_DERIVE = "derive"
TRANSFORM_OP_AGGREGATE = "aggregate"
TRANSFORM_OP_FILTER = "filter"
TRANSFORM_OP_JOIN = "join"
TRANSFORM_OP_MERGE = "merge"
TRANSFORM_OP_PIVOT = "pivot"
TRANSFORM_OP_VALIDATE = "validate"

TRANSFORMATION_OPERATIONS = [
    TRANSFORM_OP_DERIVE,
    TRANSFORM_OP_AGGREGATE,
    TRANSFORM_OP_FILTER,
    TRANSFORM_OP_JOIN,
    TRANSFORM_OP_MERGE,
    TRANSFORM_OP_PIVOT,
    TRANSFORM_OP_VALIDATE,
]

# ============================================================================
# Analysis Types
# ============================================================================

# Core analysis types
ANALYSIS_TYPE_DESCRIPTIVE = "descriptive"
ANALYSIS_TYPE_CORRELATION = "correlation"
ANALYSIS_TYPE_REGRESSION = "regression"
ANALYSIS_TYPE_CLUSTERING = "clustering"
ANALYSIS_TYPE_TIME_SERIES = "time_series"
ANALYSIS_TYPE_COMPARATIVE = "comparative"

ALL_ANALYSIS_TYPES = [
    ANALYSIS_TYPE_DESCRIPTIVE,
    ANALYSIS_TYPE_CORRELATION,
    ANALYSIS_TYPE_REGRESSION,
    ANALYSIS_TYPE_CLUSTERING,
    ANALYSIS_TYPE_TIME_SERIES,
    ANALYSIS_TYPE_COMPARATIVE,
]

# ============================================================================
# File Upload
# ============================================================================

# Allowed file types for upload
ALLOWED_UPLOAD_TYPES = ["csv", "xlsx", "xls", "json"]

# Maximum file size (100 MB)
MAX_UPLOAD_FILE_SIZE_BYTES = 100 * 1024 * 1024

# ============================================================================
# Database
# ============================================================================

# Default query limits
DEFAULT_QUERY_LIMIT = 100
MAX_QUERY_LIMIT = 10_000

# ============================================================================
# Error Messages
# ============================================================================

# Standard error messages
ERROR_PROJECT_NOT_FOUND = "Project not found"
ERROR_DATASET_NOT_FOUND = "Dataset not found"
ERROR_INSUFFICIENT_PERMISSION = "You do not have permission to access this resource"
ERROR_INVALID_DATA = "Invalid data provided"
ERROR_ANALYSIS_FAILED = "Analysis execution failed"
ERROR_TRANSFORMATION_FAILED = "Transformation execution failed"

# ============================================================================
# Environment (for reference - actual values from .env)
# ============================================================================

# Development vs Production flags
# These are checked via environment variables, not set here
ENV_DEVELOPMENT = "development"
ENV_PRODUCTION = "production"
ENV_STAGING = "staging"
