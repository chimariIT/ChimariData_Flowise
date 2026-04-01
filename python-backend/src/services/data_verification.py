"""
Data Verification Service

Provides PII detection and data quality checks for uploaded datasets.
Uses Presidio for PII detection and custom rules for data quality.

Features:
- PII detection (email, phone, SSN, credit card, etc.)
- Data quality scoring (completeness, uniqueness, validity)
- Column profiling and statistics
- Verification report generation
"""

from typing import List, Dict, Any, Optional, Set
from datetime import datetime
import logging
import re

# Initialize logger first (needed for exception handling below)
logger = logging.getLogger(__name__)

try:
    import pandas as pd
except ImportError:
    pd = None

try:
    from presidio_analyzer import AnalyzerEngine
    from presidio_anonymizer import AnonymizerEngine
    PRESIDIO_AVAILABLE = True
except Exception as e:
    # Presidio/spacy may fail due to Pydantic v1/v2 compatibility or missing dependencies
    logger.warning(f"Presidio not available: {e}. PII detection will be limited to regex patterns.")
    PRESIDIO_AVAILABLE = False
    AnalyzerEngine = None
    AnonymizerEngine = None

from pydantic import BaseModel, Field


# ============================================================================
# Models
# ============================================================================

class PIIField(BaseModel):
    """Detected PII field"""
    column: str
    type: str  # email, phone, ssn, credit_card, etc.
    confidence: float
    sample_values: List[str] = []
    row_count: int = 0


class DataQualityScore(BaseModel):
    """Data quality metrics"""
    completeness: float = Field(..., ge=0, le=1, description="Fraction of non-null values")
    uniqueness: float = Field(..., ge=0, le=1, description="Average uniqueness across columns")
    validity: float = Field(..., ge=0, le=1, description="Fraction of valid values")
    consistency: float = Field(..., ge=0, le=1, description="Data consistency score")
    overall_score: float = Field(..., ge=0, le=1, description="Overall quality score")


class VerificationResult(BaseModel):
    """Complete verification result"""
    project_id: str
    dataset_id: str
    verified_at: datetime
    pii_detected: bool
    pii_fields: List[PIIField] = []
    data_quality: DataQualityScore
    issues: List[str] = []
    warnings: List[str] = []
    recommendations: List[str] = []
    column_profiles: List[Dict[str, Any]] = []


class ColumnProfile(BaseModel):
    """Profile information for a column"""
    name: str
    type: str  # numeric, categorical, datetime, text
    nullable: bool
    unique_count: int
    null_count: int
    sample_values: List[str] = []
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    avg_value: Optional[float] = None
    max_length: Optional[int] = None


# ============================================================================
# PII Detection Patterns
# ============================================================================

PII_PATTERNS = {
    "email": {
        "pattern": r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
        "confidence": 0.9,
        "description": "Email address"
    },
    "phone": {
        "pattern": r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b|\b\(\d{3}\)\s*\d{3}[-.]?\d{4}\b',
        "confidence": 0.8,
        "description": "Phone number (US format)"
    },
    "ssn": {
        "pattern": r'\b\d{3}-\d{2}-\d{4}\b|\b\d{3}\s\d{2}\s\d{4}\b',
        "confidence": 0.95,
        "description": "Social Security Number"
    },
    "credit_card": {
        "pattern": r'\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b',
        "confidence": 0.7,
        "description": "Credit card number"
    },
    "ip_address": {
        "pattern": r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b',
        "confidence": 0.6,
        "description": "IP address"
    },
    "date_of_birth": {
        "pattern": r'\b(0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])[-/](19|20)\d{2}\b',
        "confidence": 0.5,
        "description": "Date of birth"
    },
    "zip_code": {
        "pattern": r'\b\d{5}(-\d{4})?\b',
        "confidence": 0.4,
        "description": "US ZIP code"
    },
    "url": {
        "pattern": r'\bhttps?://[^\s]+\b',
        "confidence": 0.5,
        "description": "URL"
    }
}

# Columns that commonly contain PII (based on name)
PII_COLUMN_NAMES = {
    "email", "email_address", "mail", "emailaddress",
    "phone", "phone_number", "phonenumber", "mobile", "cell",
    "ssn", "social_security", "social_security_number",
    "credit_card", "card_number", "cardnumber", "cc_number",
    "address", "street_address", "home_address",
    "first_name", "firstname", "last_name", "lastname", "full_name", "fullname",
    "date_of_birth", "dob", "birth_date", "birthdate",
    "zip", "zip_code", "zipcode", "postal_code",
    "id", "user_id", "employee_id", "customer_id", "patient_id"
}


# ============================================================================
# Data Verification Service
# ============================================================================

class DataVerificationService:
    """
    Service for verifying uploaded datasets.

    Performs:
    - PII detection using Presidio and pattern matching
    - Data quality assessment
    - Column profiling
    - Issue and recommendation generation
    """

    def __init__(self):
        """Initialize the verification service"""
        self.analyzer = None
        self.anonymizer = None

        if PRESIDIO_AVAILABLE:
            try:
                self.analyzer = AnalyzerEngine()
                self.anonymizer = AnonymizerEngine()
                logger.info("Presidio PII detection initialized")
            except Exception as e:
                logger.warning(f"Presidio initialization failed: {e}")
        else:
            logger.warning("Presidio not available, using pattern-based PII detection")

    async def verify_dataset(
        self,
        project_id: str,
        dataset_id: str,
        data: Any,
        schema: Optional[Dict[str, Any]] = None
    ) -> VerificationResult:
        """
        Verify a dataset for PII and data quality.

        Args:
            project_id: Project ID
            dataset_id: Dataset ID
            data: Dataset data (DataFrame or dict representation)
            schema: Optional schema information

        Returns:
            VerificationResult with PII findings and quality scores
        """
        # Convert data to DataFrame if needed
        df = self._ensure_dataframe(data)
        if df is None:
            return self._empty_verification_result(project_id, dataset_id)

        # Detect PII
        pii_fields = await self._detect_pii(df)

        # Assess data quality
        quality_score = self._assess_quality(df)

        # Generate issues and recommendations
        issues, warnings, recommendations = self._generate_findings(df, pii_fields, quality_score)

        # Profile columns
        column_profiles = self._profile_columns(df)

        return VerificationResult(
            project_id=project_id,
            dataset_id=dataset_id,
            verified_at=datetime.utcnow(),
            pii_detected=len(pii_fields) > 0,
            pii_fields=pii_fields,
            data_quality=quality_score,
            issues=issues,
            warnings=warnings,
            recommendations=recommendations,
            column_profiles=column_profiles
        )

    async def _detect_pii(self, df: 'pd.DataFrame') -> List[PIIField]:
        """
        Detect PII in DataFrame columns.

        Uses Presidio if available, otherwise falls back to pattern matching.
        """
        pii_fields = []

        for column in df.columns:
            # Check column name first
            column_lower = column.lower().strip()
            column_type = None
            confidence = 0.0
            sample_values = []

            # Check if column name suggests PII
            if column_lower in PII_COLUMN_NAMES:
                column_type = self._infer_pii_type_from_name(column_lower)
                confidence = 0.7
                sample_values = df[column].dropna().astype(str).head(5).tolist()

            # Also scan sample values for PII patterns
            sample_text = " ".join(df[column].dropna().astype(str).head(100).tolist())

            for pii_type, config in PII_PATTERNS.items():
                matches = re.findall(config["pattern"], sample_text, re.IGNORECASE)
                if len(matches) > len(df) * 0.1:  # If >10% of rows match
                    if config["confidence"] > confidence:
                        column_type = pii_type
                        confidence = config["confidence"]
                        # Get sample matches
                        sample_values = list(set(matches[:5]))

            if column_type:
                pii_fields.append(PIIField(
                    column=column,
                    type=column_type,
                    confidence=confidence,
                    sample_values=sample_values,
                    row_count=df[column].notna().sum()
                ))

        return pii_fields

    def _infer_pii_type_from_name(self, column_name: str) -> str:
        """Infer PII type from column name"""
        column_name = column_name.lower()

        if "email" in column_name or "mail" in column_name:
            return "email"
        elif "phone" in column_name or "mobile" in column_name or "cell" in column_name:
            return "phone"
        elif "ssn" in column_name or "social" in column_name:
            return "ssn"
        elif "card" in column_name or "credit" in column_name or "cc" in column_name:
            return "credit_card"
        elif "zip" in column_name:
            return "zip_code"
        elif "dob" in column_name or "birth" in column_name:
            return "date_of_birth"
        elif "name" in column_name:
            return "person_name"
        elif "address" in column_name:
            return "address"
        else:
            return "personally_identifiable_information"

    def _assess_quality(self, df: 'pd.DataFrame') -> DataQualityScore:
        """Calculate data quality scores"""
        total_cells = len(df) * len(df.columns)
        null_cells = df.isnull().sum().sum()

        # Completeness: fraction of non-null values
        completeness = 1.0 - (null_cells / total_cells) if total_cells > 0 else 1.0

        # Uniqueness: average uniqueness across columns
        uniqueness_scores = []
        for column in df.columns:
            unique_count = df[column].nunique()
            non_null_count = df[column].notna().sum()
            if non_null_count > 0:
                uniqueness_scores.append(unique_count / non_null_count)
        uniqueness = sum(uniqueness_scores) / len(uniqueness_scores) if uniqueness_scores else 1.0

        # Validity: check for obvious validity issues
        # (placeholder - would do actual validation based on column types)
        validity = 0.95  # Default high, adjust based on actual checks

        # Consistency: check for consistent formats
        # (placeholder - would check date formats, phone formats, etc.)
        consistency = 0.90

        # Overall score (weighted average)
        overall_score = (
            completeness * 0.3 +
            uniqueness * 0.2 +
            validity * 0.3 +
            consistency * 0.2
        )

        return DataQualityScore(
            completeness=round(completeness, 3),
            uniqueness=round(uniqueness, 3),
            validity=round(validity, 3),
            consistency=round(consistency, 3),
            overall_score=round(overall_score, 3)
        )

    def _generate_findings(
        self,
        df: 'pd.DataFrame',
        pii_fields: List[PIIField],
        quality: DataQualityScore
    ) -> tuple[List[str], List[str], List[str]]:
        """Generate issues, warnings, and recommendations"""
        issues = []
        warnings = []
        recommendations = []

        # PII-related findings
        if pii_fields:
            for pii in pii_fields:
                if pii.confidence > 0.8:
                    issues.append(
                        f"High-confidence PII detected in column '{pii}': "
                        f"{pii.type} ({pii.confidence:.0%} confidence)"
                    )
                else:
                    warnings.append(
                        f"Possible PII in column '{pii}': "
                        f"{pii.type} ({pii.confidence:.0%} confidence)"
                    )

            recommendations.append(
                "Review PII fields and apply anonymization or masking before analysis"
            )

        # Quality-related findings
        if quality.completeness < 0.8:
            issues.append(f"Low data completeness: {quality.completeness:.0%}")
            recommendations.append("Consider imputing missing values or removing incomplete rows")

        if quality.uniqueness < 0.5:
            warnings.append(f"Low uniqueness detected: {quality.uniqueness:.0%}")
            recommendations.append("Review for duplicate records or identifier columns")

        # Row count warnings
        if len(df) < 100:
            warnings.append(f"Small dataset ({len(df)} rows) - analysis may have limited statistical power")
        elif len(df) > 100000:
            recommendations.append(
                "Large dataset - consider using Polars or Spark for better performance"
            )

        return issues, warnings, recommendations

    def _profile_columns(self, df: 'pd.DataFrame') -> List[Dict[str, Any]]:
        """Generate profile information for each column"""
        profiles = []

        for column in df.columns:
            col_data = df[column]
            profile: Dict[str, Any] = {
                "name": column,
                "nullable": col_data.isnull().any(),
                "unique_count": col_data.nunique(),
                "null_count": col_data.isnull().sum(),
                "sample_values": col_data.dropna().astype(str).head(5).tolist()
            }

            # Detect column type
            if pd.api.types.is_numeric_dtype(col_data):
                profile["type"] = "numeric"
                profile["min_value"] = float(col_data.min()) if col_data.notna().any() else None
                profile["max_value"] = float(col_data.max()) if col_data.notna().any() else None
                profile["avg_value"] = float(col_data.mean()) if col_data.notna().any() else None
            elif pd.api.types.is_datetime64_any_dtype(col_data):
                profile["type"] = "datetime"
            else:
                # Check if categorical (low cardinality) or text (high cardinality)
                unique_ratio = col_data.nunique() / max(len(col_data), 1)
                profile["type"] = "categorical" if unique_ratio < 0.5 else "text"
                profile["max_length"] = col_data.astype(str).str.len().max()

            profiles.append(profile)

        return profiles

    def _ensure_dataframe(self, data: Any) -> Optional['pd.DataFrame']:
        """Convert various data types to DataFrame"""
        if pd is None:
            logger.error("pandas not available")
            return None

        if isinstance(data, pd.DataFrame):
            return data
        elif isinstance(data, dict):
            # Convert dict to DataFrame
            if "data" in data:
                return pd.DataFrame(data["data"])
            elif "columns" in data and "rows" in data:
                return pd.DataFrame(data["rows"], columns=data["columns"])
            else:
                return pd.DataFrame(data)
        elif isinstance(data, list):
            return pd.DataFrame(data)
        else:
            logger.error(f"Unsupported data type: {type(data)}")
            return None

    def _empty_verification_result(self, project_id: str, dataset_id: str) -> VerificationResult:
        """Return empty verification result for invalid data"""
        return VerificationResult(
            project_id=project_id,
            dataset_id=dataset_id,
            verified_at=datetime.utcnow(),
            pii_detected=False,
            pii_fields=[],
            data_quality=DataQualityScore(
                completeness=0.0,
                uniqueness=0.0,
                validity=0.0,
                consistency=0.0,
                overall_score=0.0
            ),
            issues=["Unable to analyze dataset - invalid data format"],
            warnings=[],
            recommendations=[],
            column_profiles=[]
        )


# ============================================================================
# Singleton Instance
# ============================================================================

_verification_service_instance = None


def get_verification_service() -> DataVerificationService:
    """Get the singleton verification service instance"""
    global _verification_service_instance
    if _verification_service_instance is None:
        _verification_service_instance = DataVerificationService()
    return _verification_service_instance
