"""
Data Ingestion Service

Handles:
- File upload from multiple sources (Computer, Google Drive, OneDrive, iCloud, REST API)
- Schema inference (column types, sample values, statistics)
- PII detection and handling
- Multi-dataset joining (smart merge/concat)
- Column embedding generation for RAG

Aligned with PDF requirements:
- Step 1: Data Setup
- Multi-source upload support
- PII processing
- Smart joins with pattern detection
"""

from typing import Dict, List, Optional, Any, Tuple, Union
import logging
import hashlib
import uuid
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, asdict

# Data processing
import pandas as pd
import numpy as np

# PII detection (temporarily disabled due to spacy/pydantic compatibility issues)
# from presidio_analyzer import AnalyzerEngine
# from presidio_anonymizer import AnonymizerEngine

# LangChain for embeddings
from langchain_openai import OpenAIEmbeddings

# Local imports
from ..models.schemas import (
    Dataset, DatasetCreate, DatasetSchema, PIIAnalysisResult,
    ColumnDefinition, ColumnType, PIISensitivity, SourceType
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# Data Classes
# ============================================================================

@dataclass
class JoinStrategy:
    """Strategy for joining multiple datasets"""
    MERGE = "merge"       # Concatenate rows
    JOIN = "join"          # Join on common columns
    STACK = "stack"        # Stack columns side-by-side


@dataclass
class DatasetPattern:
    """Detected pattern in dataset"""
    SURVEY = "survey"
    ROSTER = "roster"
    METRICS = "metrics"
    TRANSACTIONAL = "transactional"
    TIME_SERIES = "time_series"
    UNKNOWN = "unknown"


@dataclass
class IngestionResult:
    """Result of data ingestion"""
    success: bool
    dataset_id: str
    schema: Optional[DatasetSchema] = None
    pii_analysis: Optional[PIIAnalysisResult] = None
    row_count: int = 0
    column_count: int = 0
    error: Optional[str] = None
    warnings: List[str] = None

    def __post_init__(self):
        if self.warnings is None:
            self.warnings = []


# ============================================================================
# Schema Inference
# ============================================================================

class SchemaInferrer:
    """
    Infers dataset schema from data

    Determines:
    - Column types (numeric, categorical, datetime, text, boolean)
    - Sample values
    - Null percentages
    - Unique value counts
    - Dataset patterns (survey, roster, etc.)
    """

    @staticmethod
    def infer_column(
        col_name: str,
        series: pd.Series
    ) -> ColumnDefinition:
        """
        Infer schema for a single column

        Args:
            col_name: Column name
            series: Pandas Series

        Returns:
            ColumnDefinition with inferred properties
        """
        # Get basic statistics
        null_count = series.isna().sum()
        null_percentage = (null_count / len(series)) * 100
        unique_count = series.nunique()

        # Get sample values (non-null, first 5)
        sample_values = series.dropna().head(5).tolist()

        # Determine column type
        column_type, pii_sensitivity = SchemaInferrer._detect_column_type(series)

        # Generate description
        description = SchemaInferrer._generate_description(
            col_name, column_type, null_percentage, unique_count
        )

        return ColumnDefinition(
            name=col_name,
            type=column_type,
            nullable_percentage=round(null_percentage, 2),
            sample_values=sample_values,
            pii_sensitivity=pii_sensitivity,
            description=description,
            unique_count=unique_count
        )

    @staticmethod
    def _detect_column_type(series: pd.Series) -> Tuple[ColumnType, PIISensitivity]:
        """
        Detect column type and PII sensitivity

        Args:
            series: Pandas Series

        Returns:
            Tuple of (ColumnType, PIISensitivity)
        """
        dtype = series.dtype
        col_name_lower = series.name.lower() if series.name else ""

        # Check for datetime
        if pd.api.types.is_datetime64_any_dtype(dtype):
            return ColumnType.DATETIME, PIISensitivity.NONE

        # Check for numeric
        if pd.api.types.is_numeric_dtype(dtype):
            return ColumnType.NUMERIC, PIISensitivity.NONE

        # Check for boolean
        if dtype == bool:
            return ColumnType.BOOLEAN, PIISensitivity.NONE

        # For object type, infer based on content
        if dtype == object:
            # Check if categorical (limited unique values)
            unique_ratio = series.nunique() / len(series)

            if unique_ratio < 0.1:
                return ColumnType.CATEGORICAL, SchemaInferrer._check_pii_sensitivity(col_name_lower)
            else:
                # Check if looks like text (long strings)
                avg_length = series.dropna().astype(str).str.len().mean()
                if avg_length > 50:
                    return ColumnType.TEXT, PIISensitivity.LOW
                else:
                    return ColumnType.CATEGORICAL, SchemaInferrer._check_pii_sensitivity(col_name_lower)

        return ColumnType.TEXT, PIISensitivity.NONE

    @staticmethod
    def _check_pii_sensitivity(col_name: str) -> PIISensitivity:
        """Check column name for potential PII sensitivity"""
        pii_keywords = {
            "name": PIISensitivity.HIGH,
            "email": PIISensitivity.HIGH,
            "phone": PIISensitivity.HIGH,
            "ssn": PIISensitivity.STRICTLY_PROHIBITED,
            "social": PIISensitivity.HIGH,
            "address": PIISensitivity.HIGH,
            "credit": PIISensitivity.MEDIUM,
            "card": PIISensitivity.MEDIUM,
            "birth": PIISensitivity.HIGH,
            "dob": PIISensitivity.HIGH,
            "identification": PIISensitivity.HIGH,
            "id": PIISensitivity.MEDIUM
        }

        col_lower = col_name.lower()
        for keyword, sensitivity in pii_keywords.items():
            if keyword in col_lower:
                return sensitivity

        return PIISensitivity.NONE

    @staticmethod
    def _generate_description(
        col_name: str,
        column_type: ColumnType,
        null_percentage: float,
        unique_count: int
    ) -> str:
        """Generate a human-readable description"""
        parts = [f"Column '{col_name}' is {column_type.value}"]

        if null_percentage > 0:
            parts.append(f"with {null_percentage:.1f}% null values")

        if unique_count > 0 and column_type == ColumnType.CATEGORICAL:
            parts.append(f"containing {unique_count} unique categories")

        return ". ".join(parts)

    @staticmethod
    def infer_dataset_pattern(
        df: pd.DataFrame,
        column_definitions: List[ColumnDefinition]
    ) -> DatasetPattern:
        """
        Detect the pattern/type of the dataset

        Based on PDF requirements:
        - Survey datasets (Q1, Q2, etc. pattern)
        - Roster datasets (employee_id, name, etc.)
        - Metrics datasets (aggregated data)
        """
        col_names = [col.name.lower() for col in column_definitions]

        # Check for survey pattern (Q1, Q2, etc.)
        if any(name.startswith('q') for name in col_names):
            return DatasetPattern.SURVEY

        # Check for roster pattern
        if 'employee_id' in col_names or 'emp_id' in col_names:
            if any('name' in col_names or 'department' in col_names):
                return DatasetPattern.ROSTER

        # Check for time series
        if any('date' in col_names or 'time' in col_names for name in col_names):
            return DatasetPattern.TIME_SERIES

        # Check for metrics/aggregate data
        if len(df) < 100 and any('count' in col_names or 'avg' in col_names):
            return DatasetPattern.METRICS

        return DatasetPattern.UNKNOWN

    @staticmethod
    def infer_schema(df: pd.DataFrame) -> Tuple[DatasetSchema, DatasetPattern]:
        """
        Infer complete schema for a DataFrame

        Args:
            df: Pandas DataFrame

        Returns:
            Tuple of (DatasetSchema, DatasetPattern)
        """
        columns = []

        for col_name in df.columns:
            col_def = SchemaInferrer.infer_column(col_name, df[col_name])
            columns.append(col_def)

        pattern = SchemaInferrer.infer_dataset_pattern(df, columns)

        schema = DatasetSchema(
            columns=columns,
            record_count=len(df),
            sample_rows=df.head(10).to_dict(orient='records'),
            inferred_at=datetime.utcnow()
        )

        return schema, pattern


# ============================================================================
# PII Detection
# ============================================================================

class PIIDetector:
    """
    Detects PII in dataset using Presidio

    Provides recommendations for handling PII data
    """

    def __init__(self):
        """Initialize PII detector with Presidio"""
        # Initialize Presidio analyzer
        # Note: Temporarily disabled due to spacy/pydantic compatibility
        # TODO: Fix spacy 3.7.2 + pydantic 2.x compatibility issue
        logger.warning("PII Detector temporarily disabled (spacy/pydantic compatibility)")
        self.engine = None

    async def analyze(self, df: pd.DataFrame, schema: DatasetSchema) -> PIIAnalysisResult:
        """
        Analyze dataset for PII

        Args:
            df: Pandas DataFrame to analyze
            schema: Inferred schema

        Returns:
            PIIAnalysisResult with findings
        """
        if self.engine is None:
            return PIIAnalysisResult(
                has_pii=False,
                pii_columns=[],
                confidence=0.0,
                detected_fields=[],
                recommendations=["PII detection not available"]
            )

        pii_columns = []
        detected_fields = []
        confidence = 0.0
        recommendations = []

        # Analyze each column
        for col_def in schema.columns:
            col_name = col_def.name
            col_type = col_def.type

            # Skip non-object columns for initial scan
            if col_type != ColumnType.TEXT and col_type != ColumnType.CATEGORICAL:
                continue

            # Sample some values for analysis
            sample_text = " ".join([str(v) for v in df[col_name].dropna().head(100)])

            # Analyze with Presidio
            result = self.engine.analyze(
                text=sample_text,
                language='en'
            )

            if result and len(result) > 0:
                pii_columns.append(col_name)

                # Extract detected PII types
                entities_found = set()
                for entity in result:
                    entities_found.add(entity.entity_type)
                    detected_fields.append(f"{col_name}: {entity.entity_type}")

                confidence = max(confidence, entity.score)

                # Add recommendations
                recommendations.append(
                    f"Column '{col_name}' contains PII: {', '.join(sorted(entities_found))}. "
                    f"Consider excluding or anonymizing before analysis."
                )

        has_pii = len(pii_columns) > 0

        # Add schema-based PII detection
        for col_def in schema.columns:
            if col_def.pii_sensitivity != PIISensitivity.NONE:
                if col_def.name not in pii_columns:
                    pii_columns.append(col_def.name)

        return PIIAnalysisResult(
            has_pii=has_pii,
            pii_columns=pii_columns,
            confidence=round(confidence, 2),
            detected_fields=detected_fields,
            recommendations=recommendations
        )


# ============================================================================
# Dataset Join Logic
# ============================================================================

class DatasetJoiner:
    """
    Joins multiple datasets intelligently

    Based on PDF requirements:
    - Detect common columns for joining
    - Support merge, join, and stack operations
    - Handle survey + roster patterns
    """

    @staticmethod
    def detect_join_columns(datasets: Dict[str, pd.DataFrame]) -> List[str]:
        """
        Detect columns that can be used for joining datasets

        Args:
            datasets: Dict of dataset_id to DataFrame

        Returns:
            List of common column names
        """
        if len(datasets) < 2:
            return []

        # Find common columns across all datasets
        common_columns = set(datasets[list(datasets.keys())[0]].columns)

        for df in datasets.values():
            common_columns.intersection_update(set(df.columns))

        # Filter for likely join keys
        join_patterns = ['id', '_id', 'employee', 'emp', 'name']
        likely_joins = [
            col for col in common_columns
            if any(pattern in col.lower() for pattern in join_patterns)
        ]

        return likely_joins

    @staticmethod
    def determine_join_strategy(
        datasets: Dict[str, pd.DataFrame],
        common_columns: List[str]
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Determine the best join strategy

        Returns:
            Tuple of (strategy_type, join_config)
        """
        if len(common_columns) == 0:
            return JoinStrategy.MERGE, {}

        if len(common_columns) == 1:
            join_col = common_columns[0]
            return JoinStrategy.JOIN, {
                "on": join_col,
                "how": "inner"
            }

        return JoinStrategy.MERGE, {}

    @staticmethod
    def join_datasets(
        datasets: Dict[str, pd.DataFrame],
        join_strategy: str = None
    ) -> Tuple[pd.DataFrame, List[str]]:
        """
        Join multiple datasets

        Args:
            datasets: Dict of dataset_id to DataFrame
            join_strategy: Optional strategy override

        Returns:
            Tuple of (joined DataFrame, warnings)
        """
        if len(datasets) == 1:
            # Single dataset, return as-is
            dataset_id = list(datasets.keys())[0]
            return datasets[dataset_id].copy(), []

        warnings = []

        # Auto-detect strategy if not provided
        if join_strategy is None:
            common_columns = DatasetJoiner.detect_join_columns(datasets)
            join_strategy, join_config = DatasetJoiner.determine_join_strategy(
                datasets, common_columns
            )
        else:
            join_config = {}

        if join_strategy == JoinStrategy.JOIN:
            # Perform SQL-style join
            df_list = list(datasets.values())
            common_columns = DatasetJoiner.detect_join_columns(datasets)

            if common_columns:
                join_col = common_columns[0]
                result = df_list[0]
                for df in df_list[1:]:
                    result = pd.merge(result, df, on=join_col, how='inner')
            else:
                # No common columns, just merge
                result = pd.concat(df_list, axis=0, ignore_index=True)
                warnings.append(
                    "No common columns found, datasets merged instead of joined"
                )

        elif join_strategy == JoinStrategy.STACK:
            # Stack columns side-by-side
            df_list = list(datasets.values())
            result = df_list[0]

            for df in df_list[1:]:
                result = pd.concat([result, df], axis=1)

        else:  # MERGE - stack rows
            df_list = list(datasets.values())
            result = pd.concat(df_list, axis=0, ignore_index=True)

        return result, warnings


# ============================================================================
# Data Ingestion Service
# ============================================================================

class DataIngestionService:
    """
    Main service for data ingestion

    Handles the complete ingestion workflow:
    1. File upload from multiple sources
    2. Schema inference
    3. PII detection
    4. Multi-dataset joining
    5. Column embedding generation
    """

    def __init__(self, embedding_model=None):
        """
        Initialize the ingestion service

        Args:
            embedding_model: Optional embedding model for RAG
        """
        self.pii_detector = PIIDetector()
        self.embedding_model = embedding_model or OpenAIEmbeddings()
        self.schema_inferrer = SchemaInferrer()
        self.dataset_joiner = DatasetJoiner()

    async def ingest_file(
        self,
        file_path: str,
        project_id: str,
        user_id: str,
        source_type: SourceType
    ) -> IngestionResult:
        """
        Ingest a single file

        Args:
            file_path: Path to uploaded file
            project_id: Project ID
            user_id: User ID
            source_type: Source of the file

        Returns:
            IngestionResult with dataset info
        """
        try:
            # Load file based on extension
            df = self._load_file(file_path)

            if df is None:
                return IngestionResult(
                    success=False,
                    dataset_id="",
                    error="Failed to load file: unsupported format"
                )

            # Infer schema
            schema, pattern = self.schema_inferrer.infer_schema(df)

            # Analyze for PII
            pii_analysis = await self.pii_detector.analyze(df, schema)

            # Generate dataset ID
            dataset_id = self._generate_dataset_id(project_id, file_path)

            result = IngestionResult(
                success=True,
                dataset_id=dataset_id,
                schema=schema,
                pii_analysis=pii_analysis,
                row_count=len(df),
                column_count=len(df.columns),
                warnings=[]
            )

            logger.info(
                f"Ingested file {file_path}: "
                f"{len(df)} rows, {len(df.columns)} columns, "
                f"pattern={pattern.value}, has_pii={pii_analysis.has_pii}"
            )

            return result

        except Exception as e:
            logger.error(f"Error ingesting file {file_path}: {e}", exc_info=True)
            return IngestionResult(
                success=False,
                dataset_id="",
                error=str(e)
            )

    async def ingest_and_join(
        self,
        datasets: List[Dict[str, Any]],
        project_id: str,
        user_id: str
    ) -> IngestionResult:
        """
        Ingest and join multiple datasets

        Based on PDF requirements for smart file joining:
        - Detect common columns
        - Choose join vs merge vs stack
        - Handle survey + roster patterns

        Args:
            datasets: List of datasets with file_path and source_type
            project_id: Project ID
            user_id: User ID

        Returns:
            IngestionResult with joined dataset info
        """
        try:
            # Load all datasets
            dfs = {}
            schemas = {}
            patterns = {}
            all_pii_columns = set()

            for dataset_info in datasets:
                file_path = dataset_info["file_path"]
                source_type = dataset_info.get("source_type", SourceType.COMPUTER)

                df = self._load_file(file_path)
                if df is None:
                    continue

                dataset_id = self._generate_dataset_id(project_id, file_path)
                schema, pattern = self.schema_inferrer.infer_schema(df)
                pii_analysis = await self.pii_detector.analyze(df, schema)

                dfs[dataset_id] = df
                schemas[dataset_id] = schema
                patterns[dataset_id] = pattern

                all_pii_columns.update(pii_analysis.pii_columns)

            if not dfs:
                return IngestionResult(
                    success=False,
                    dataset_id="",
                    error="No valid datasets found"
                )

            # Join datasets
            joined_df, join_warnings = self.dataset_joiner.join_datasets(dfs)

            # Create combined schema
            primary_id = list(dfs.keys())[0]
            combined_schema = DatasetSchema(
                columns=schemas[primary_id].columns,
                record_count=len(joined_df),
                sample_rows=joined_df.head(10).to_dict(orient='records'),
                inferred_at=datetime.utcnow()
            )

            # Combined PII analysis
            combined_pii = PIIAnalysisResult(
                has_pii=len(all_pii_columns) > 0,
                pii_columns=list(all_pii_columns),
                confidence=0.8,
                detected_fields=[],
                recommendations=[
                    f"Multiple datasets joined. Review PII columns before proceeding."
                ]
            )

            dataset_id = f"joined_{project_id}"

            result = IngestionResult(
                success=True,
                dataset_id=dataset_id,
                schema=combined_schema,
                pii_analysis=combined_pii,
                row_count=len(joined_df),
                column_count=len(joined_df.columns),
                warnings=join_warnings
            )

            logger.info(
                f"Joined {len(dfs)} datasets: "
                f"{len(joined_df)} rows, {len(joined_df.columns)} columns"
            )

            return result

        except Exception as e:
            logger.error(f"Error joining datasets: {e}", exc_info=True)
            return IngestionResult(
                success=False,
                dataset_id="",
                error=str(e)
            )

    async def generate_column_embeddings(
        self,
        dataset_id: str,
        schema: DatasetSchema
    ) -> List[str]:
        """
        Generate embeddings for all columns

        Args:
            dataset_id: Dataset ID
            schema: Dataset schema

        Returns:
            List of embedding IDs
        """
        try:
            # Import semantic matching service
            from .semantic_matching import ColumnEmbeddingGenerator

            generator = ColumnEmbeddingGenerator(embedding_model=self.embedding_model)

            # Convert column definitions to our format
            from ..models.schemas import ColumnDefinition
            columns = [
                ColumnDefinition(**col.dict()) for col in schema.columns
            ]

            # Generate embeddings
            documents = await generator.generate_column_embeddings(dataset_id, columns)

            # Store embeddings
            await generator.store_column_embeddings(dataset_id, documents)

            logger.info(f"Generated {len(documents)} column embeddings for {dataset_id}")

            return [doc.doc_id for doc in documents]

        except Exception as e:
            logger.error(f"Error generating embeddings: {e}", exc_info=True)
            return []

    def _load_file(self, file_path: str) -> Optional[pd.DataFrame]:
        """
        Load file based on extension

        Supports: CSV, Excel, JSON
        """
        path = Path(file_path)
        ext = path.suffix.lower()

        try:
            if ext == '.csv':
                return pd.read_csv(file_path)
            elif ext in ['.xlsx', '.xls']:
                return pd.read_excel(file_path)
            elif ext == '.json':
                return pd.read_json(file_path)
            else:
                logger.warning(f"Unsupported file type: {ext}")
                return None
        except Exception as e:
            logger.error(f"Error loading file {file_path}: {e}", exc_info=True)
            return None

    def _generate_dataset_id(self, project_id: str, file_path: str) -> str:
        """
        Generate a stable dataset ID

        Args:
            project_id: Project ID
            file_path: Path to file

        Returns:
            Stable dataset ID
        """
        filename = Path(file_path).stem
        hash_input = f"{project_id}_{filename}"
        return hashlib.sha256(hash_input.encode()).hexdigest()[:16]


# ============================================================================
# Singleton Instance
# ============================================================================

_ingestion_service: Optional[DataIngestionService] = None


def get_data_ingestion_service() -> DataIngestionService:
    """Get the singleton data ingestion service instance"""
    global _ingestion_service
    if _ingestion_service is None:
        _ingestion_service = DataIngestionService()
    return _ingestion_service
