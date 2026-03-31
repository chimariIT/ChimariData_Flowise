"""
Analysis Module - Descriptive Statistics

Standardized output format for Chimaridata pipeline.

All analysis modules must return:
{
    "success": true|false,
    "analysis_type": "descriptive_stats|correlation|regression|clustering|time_series|...",
    "data": {
        "summary": {...},
        "statistics": {...},
        "visualizations": [...],
        "model": {...}  # For ML models
    },
    "metadata": {
        "recordCount": 100,
        "columnCount": 5,
        "processingTimeMs": 1234
    },
    "errors": []
}
"""

import json
import sys
import time
import logging
from typing import Dict, List, Any
from dataclasses import dataclass

import pandas as pd
import numpy as np
from scipy import stats

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# Data Classes for Standardized Output
# ============================================================================

@dataclass
class AnalysisResult:
    """Standard analysis result format"""
    success: bool
    analysis_type: str
    data: Dict[str, Any]
    metadata: Dict[str, Any]
    errors: List[str]

    def to_json(self) -> str:
        return json.dumps({
            "success": self.success,
            "analysis_type": self.analysis_type,
            "data": self.data,
            "metadata": self.metadata,
            "errors": self.errors
        }, indent=2)


# ============================================================================
# Main Analysis Function
# ============================================================================

def main():
    """
    Main entry point for descriptive statistics analysis

    Reads configuration from stdin and outputs results to stdout
    """
    start_time = time.time()

    try:
        # Parse input configuration
        input_config = json.loads(sys.stdin.read())
        logger.info(f"Received config: {input_config}")

        # Validate required fields
        if "data" not in input_config or "project_id" not in input_config:
            raise ValueError("Missing required fields: data, project_id")

        data = input_config["data"]
        project_id = input_config.get("project_id", "unknown")
        columns_to_exclude = input_config.get("pii_columns_to_exclude", [])
        question_mappings = input_config.get("question_mappings", [])

        # Load dataframe
        df = pd.DataFrame(data)

        # Exclude PII columns
        if columns_to_exclude:
            df = df.drop(columns=columns_to_exclude, errors='ignore')
            logger.info(f"Excluded PII columns: {columns_to_exclude}")

        # Get column types
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
        datetime_cols = df.select_dtypes(include=['datetime64', 'datetime64[ns]']).columns.tolist()

        logger.info(f"Numeric columns: {len(numeric_cols)}")
        logger.info(f"Categorical columns: {len(categorical_cols)}")
        logger.info(f"Datetime columns: {len(datetime_cols)}")

        # Build results
        result_data = {
            "summary": {
                "recordCount": int(len(df)),
                "columnCount": int(len(df.columns)),
                "numericColumns": numeric_cols,
                "categoricalColumns": categorical_cols,
                "datetimeColumns": datetime_cols,
                "missingValues": df.isnull().sum().to_dict(),
                "project_id": project_id
            },
            "statistics": {},
            "visualizations": [],
            "model": {}
        }

        # Basic statistics for numeric columns
        for col in numeric_cols:
            col_data = df[col].dropna()

            if len(col_data) == 0:
                result_data["statistics"][col] = {
                    "error": "No valid data after excluding nulls",
                    "sampleValues": []
                }
                continue

            result_data["statistics"][col] = {
                "mean": float(col_data.mean()),
                "median": float(col_data.median()),
                "std": float(col_data.std()),
                "variance": float(col_data.var()),
                "min": float(col_data.min()),
                "max": float(col_data.max()),
                "q25": float(col_data.quantile(0.25)),
                "q75": float(col_data.quantile(0.75)),
                "skewness": float(stats.skew(col_data)),
                "kurtosis": float(stats.kurtosis(col_data)),
                "sampleValues": col_data.head(10).tolist()
            }

        # Categorical column statistics
        for col in categorical_cols:
            col_data = df[col].dropna()

            if len(col_data) == 0:
                result_data["statistics"][col] = {
                    "error": "No valid data",
                    "uniqueValues": []
                }
                continue

            value_counts = col_data.value_counts()
            result_data["statistics"][col] = {
                "uniqueCount": int(len(value_counts)),
                "topValues": value_counts.head(5).to_dict(),
                "missingCount": int(col_data.isnull().sum()),
                "sampleValues": col_data.head(10).tolist()
            }

        # Correlation matrix (if >1 numeric column)
        if len(numeric_cols) > 1:
            corr_matrix = df[numeric_cols].corr()

            # Convert to serializable format
            corr_dict = {}
            for i, col1 in enumerate(numeric_cols):
                corr_dict[col1] = {}
                for j, col2 in enumerate(numeric_cols):
                    if j <= i:  # Only include upper triangle
                        corr_dict[col1][col2] = float(corr_matrix.iloc[i, j])

            result_data["statistics"]["correlations"] = corr_dict

            logger.info(f"Generated correlation matrix for {len(numeric_cols)} columns")

        # Generate visualization configs
        # Histogram for numeric columns
        for col in numeric_cols[:5]:  # Limit to 5 histograms
            result_data["visualizations"].append({
                "type": "histogram",
                "column": col,
                "config": {
                    "bins": "auto",
                    "title": f"Distribution of {col}",
                    "xAxisLabel": col,
                    "yAxisLabel": "Frequency"
                }
            })

        # Bar charts for categorical columns
        for col in categorical_cols[:3]:  # Limit to 3 bar charts
            result_data["visualizations"].append({
                "type": "bar",
                "column": col,
                "config": {
                    "title": f"Count of {col}",
                    "xAxis": col,
                    "yAxis": "Count",
                    "data": df[col].value_counts().head(10).to_dict()
                }
            })

        # Metadata
        processing_time_ms = int((time.time() - start_time) * 1000))
        result_data["metadata"] = {
            "recordCount": int(len(df)),
            "columnCount": int(len(df.columns)),
            "processingTimeMs": processing_time_ms,
            "project_id": project_id,
            "excludedColumns": columns_to_exclude
        }

        # Build result
        result = AnalysisResult(
            success=True,
            analysis_type="descriptive_stats",
            data=result_data,
            metadata=result_data["metadata"],
            errors=[]
        )

        # Output JSON result
        print(result.to_json())
        logger.info(f"Descriptive analysis completed in {processing_time_ms}ms")

    except ValueError as e:
        # Input validation error
        result = AnalysisResult(
            success=False,
            analysis_type="descriptive_stats",
            data={},
            metadata={},
            errors=[f"Input validation error: {str(e)}"]
        )
        print(result.to_json())
        logger.error(f"Input validation error: {e}")
        sys.exit(1)

    except Exception as e:
        # Analysis error
        logger.error(f"Analysis error: {str(e)}", exc_info=True)
        result = AnalysisResult(
            success=False,
            analysis_type="descriptive_stats",
            data={},
            metadata={"errorTime": time.time()},
            errors=[f"Analysis failed: {str(e)}"]
        )
        print(result.to_json())
        sys.exit(1)


if __name__ == "__main__":
    main()
