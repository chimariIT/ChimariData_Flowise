"""
Analysis Module - Exploratory Data Analysis (EDA)

Standardized output format for Chimaridata pipeline.

Performs:
- Data quality assessment
- Missing value analysis
- Outlier detection
- Distribution analysis
- Correlation analysis
- Data type inference
- Summary statistics
- Pattern detection

Standard output format:
{
    "success": true|false,
    "analysis_type": "eda",
    "data": {
        "summary": {...},
        "statistics": {...},
        "visualizations": [...],
        "model": {...}
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
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
import warnings

import pandas as pd
import numpy as np
from scipy import stats
from scipy.stats import normaltest, shapiro

# Suppress warnings for cleaner output
warnings.filterwarnings('ignore')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# Data Classes for Standardized Output
# ============================================================================

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
# Data Quality Metrics
# ============================================================================

class DataQualityAnalyzer:
    """Analyze data quality metrics"""

    @staticmethod
    def assess_quality(df: pd.DataFrame) -> Dict[str, Any]:
        """
        Assess overall data quality

        Args:
            df: Input DataFrame

        Returns:
            Quality assessment dict
        """
        total_cells = len(df) * len(df.columns)
        missing_cells = df.isnull().sum().sum()

        quality_metrics = {
            "overallCompleteness": float((total_cells - missing_cells) / total_cells * 100),
            "totalRows": int(len(df)),
            "totalColumns": int(len(df.columns)),
            "missingCells": int(missing_cells),
            "duplicateRows": int(df.duplicated().sum()),
            "qualityScore": 0.0  # Will be calculated
        }

        # Calculate individual column quality
        column_quality = []
        for col in df.columns:
            col_missing = df[col].isnull().sum()
            col_unique = df[col].nunique()
            col_type = str(df[col].dtype)

            col_quality = {
                "column": col,
                "type": col_type,
                "missingCount": int(col_missing),
                "missingPercentage": float(col_missing / len(df) * 100),
                "uniqueCount": int(col_unique),
                "uniquePercentage": float(col_unique / len(df) * 100),
                "isID": bool(col_unique == len(df)),
                "completeness": float((len(df) - col_missing) / len(df) * 100)
            }

            # Check for outliers in numeric columns
            if df[col].dtype in [np.int64, np.float64]:
                outliers = DataQualityAnalyzer.detect_outliers(df[col])
                col_quality["outlierCount"] = len(outliers)
                col_quality["outlierPercentage"] = float(len(outliers) / len(df) * 100)

            column_quality.append(col_quality)

        quality_metrics["columnQuality"] = column_quality

        # Calculate overall quality score (weighted average)
        if column_quality:
            avg_completeness = np.mean([c["completeness"] for c in column_quality])
            avg_uniqueness = np.mean([min(c["uniquePercentage"], 50) for c in column_quality])  # Cap at 50%
            quality_metrics["qualityScore"] = float((avg_completeness + avg_uniqueness) / 2)

        return quality_metrics

    @staticmethod
    def detect_outliers(series: pd.Series, method: str = "iqr") -> np.ndarray:
        """
        Detect outliers in a series

        Args:
            series: Input series
            method: Detection method (iqr, zscore)

        Returns:
            Boolean array indicating outliers
        """
        series_clean = series.dropna()
        if len(series_clean) == 0:
            return np.array([False] * len(series))

        if method == "iqr":
            q1 = series_clean.quantile(0.25)
            q3 = series_clean.quantile(0.75)
            iqr = q3 - q1
            lower_bound = q1 - 1.5 * iqr
            upper_bound = q3 + 1.5 * iqr
            outliers = (series < lower_bound) | (series > upper_bound)

        elif method == "zscore":
            z_scores = np.abs((series_clean - series_clean.mean()) / series_clean.std())
            outliers_mask = z_scores > 3
            # Map back to original series
            outliers = pd.Series(False, index=series.index)
            outliers.loc[series_clean.index[outliers_mask]] = True

        else:
            outliers = pd.Series(False, index=series.index)

        return outliers.values

    @staticmethod
    def detect_data_types(df: pd.DataFrame) -> Dict[str, Any]:
        """
        Infer data types with confidence

        Args:
            df: Input DataFrame

        Returns:
            Data type analysis
        """
        type_analysis = []

        for col in df.columns:
            col_data = df[col]

            # Determine inferred type
            inferred_type = str(col_data.dtype)

            # Check for ID columns
            is_id = col_data.nunique() == len(col_data)

            # Check for categorical
            is_categorical = (
                col_data.dtype == 'object' and
                col_data.nunique() / len(col_data) < 0.5 and
                col_data.nunique() <= 50
            )

            # Check for numeric
            is_numeric = pd.api.types.is_numeric_dtype(col_data)

            # Check for datetime
            is_datetime = pd.api.types.is_datetime64_any_dtype(col_data)

            # Check for cardinality
            cardinality = col_data.nunique()
            if cardinality / len(col_data) < 0.01:
                cardinality_level = "low"
            elif cardinality / len(col_data) < 0.1:
                cardinality_level = "medium"
            else:
                cardinality_level = "high"

            type_analysis.append({
                "column": col,
                "inferredType": inferred_type,
                "isID": is_id,
                "isCategorical": is_categorical,
                "isNumeric": is_numeric,
                "isDatetime": is_datetime,
                "cardinality": int(cardinality),
                "cardinalityLevel": cardinality_level
            })

        # Summary counts
        summary = {
            "numericColumns": sum(1 for t in type_analysis if t["isNumeric"]),
            "categoricalColumns": sum(1 for t in type_analysis if t["isCategorical"]),
            "datetimeColumns": sum(1 for t in type_analysis if t["isDatetime"]),
            "idColumns": sum(1 for t in type_analysis if t["isID"]),
            "details": type_analysis
        }

        return summary


# ============================================================================
# Distribution Analysis
# ============================================================================

class DistributionAnalyzer:
    """Analyze distribution characteristics"""

    @staticmethod
    def analyze_distribution(series: pd.Series) -> Dict[str, Any]:
        """
        Analyze the distribution of a series

        Args:
            series: Input series

        Returns:
            Distribution analysis dict
        """
        series_clean = series.dropna()
        if len(series_clean) == 0:
            return {"error": "No valid data"}

        analysis = {
            "count": int(len(series_clean)),
            "missing": int(series.isnull().sum()),
            "min": float(series_clean.min()),
            "max": float(series_clean.max()),
            "mean": float(series_clean.mean()),
            "median": float(series_clean.median()),
            "mode": float(series_clean.mode().iloc[0]) if len(series_clean.mode()) > 0 else None,
            "std": float(series_clean.std()),
            "variance": float(series_clean.var()),
            "range": float(series_clean.max() - series_clean.min())
        }

        # Quantiles
        quantiles = [0.25, 0.5, 0.75, 0.9, 0.95, 0.99]
        for q in quantiles:
            analysis[f"q{int(q*100)}"] = float(series_clean.quantile(q))

        # Skewness and kurtosis
        analysis["skewness"] = float(stats.skew(series_clean))
        analysis["kurtosis"] = float(stats.kurtosis(series_clean))

        # Normality test
        try:
            if len(series_clean) >= 8:
                stat, p_value = shapiro(series_clean[:5000])  # Limit sample size
                analysis["normalityTest"] = {
                    "statistic": float(stat),
                    "pValue": float(p_value),
                    "isNormal": p_value > 0.05
                }
        except Exception as e:
            analysis["normalityTest"] = {"error": str(e)}

        # Distribution type inference
        skew = abs(analysis["skewness"])
        if skew < 0.5:
            dist_type = "approximately_normal"
        elif skew < 1.0:
            dist_type = "moderately_skewed"
        else:
            dist_type = "highly_skewed"

        analysis["distributionType"] = dist_type

        # Outlier detection
        outliers = DataQualityAnalyzer.detect_outliers(series)
        analysis["outlierCount"] = int(outliers.sum())
        analysis["outlierPercentage"] = float(outliers.sum() / len(series) * 100)

        return analysis

    @staticmethod
    def analyze_categorical(series: pd.Series) -> Dict[str, Any]:
        """
        Analyze a categorical series

        Args:
            series: Input series

        Returns:
            Categorical analysis dict
        """
        series_clean = series.dropna()

        value_counts = series_clean.value_counts()

        analysis = {
            "count": int(len(series_clean)),
            "missing": int(series.isnull().sum()),
            "uniqueCount": int(len(value_counts)),
            "mostFrequent": str(value_counts.index[0]) if len(value_counts) > 0 else None,
            "mostFrequentCount": int(value_counts.iloc[0]) if len(value_counts) > 0 else 0,
            "leastFrequent": str(value_counts.index[-1]) if len(value_counts) > 0 else None,
            "leastFrequentCount": int(value_counts.iloc[-1]) if len(value_counts) > 0 else 0
        }

        # Value distribution
        top_values = []
        for val, count in value_counts.head(10).items():
            top_values.append({
                "value": str(val),
                "count": int(count),
                "percentage": float(count / len(series_clean) * 100)
            })

        analysis["topValues"] = top_values

        # Cardinality assessment
        if analysis["uniqueCount"] == 1:
            cardinality = "constant"
        elif analysis["uniqueCount"] <= 10:
            cardinality = "low"
        elif analysis["uniqueCount"] <= 100:
            cardinality = "medium"
        else:
            cardinality = "high"

        analysis["cardinality"] = cardinality

        # Entropy (measure of diversity)
        probs = value_counts / len(series_clean)
        entropy = -np.sum(probs * np.log2(probs, where=probs > 0))
        max_entropy = np.log2(len(value_counts)) if len(value_counts) > 1 else 0
        analysis["entropy"] = float(entropy)
        analysis["normalizedEntropy"] = float(entropy / max_entropy) if max_entropy > 0 else 0.0

        return analysis


# ============================================================================
# Pattern Detection
# ============================================================================

class PatternDetector:
    """Detect patterns in data"""

    @staticmethod
    def detect_patterns(df: pd.DataFrame) -> Dict[str, Any]:
        """
        Detect various patterns in the data

        Args:
            df: Input DataFrame

        Returns:
            Pattern detection results
        """
        patterns = {
            "seasonality": [],
            "trends": [],
            "clusters": [],
            "anomalies": [],
            "associations": []
        }

        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

        # Detect monotonic trends in numeric columns
        for col in numeric_cols:
            col_data = df[col].dropna()
            if len(col_data) > 10:
                # Check for monotonic pattern
                diffs = col_data.diff().dropna()
                positive_diffs = (diffs > 0).sum()
                negative_diffs = (diffs < 0).sum()

                if positive_diffs / len(diffs) > 0.7:
                    patterns["trends"].append({
                        "column": col,
                        "type": "increasing",
                        "confidence": float(positive_diffs / len(diffs))
                    })
                elif negative_diffs / len(diffs) > 0.7:
                    patterns["trends"].append({
                        "column": col,
                        "type": "decreasing",
                        "confidence": float(negative_diffs / len(diffs))
                    })

        # Detect potential clusters based on value groupings
        for col in numeric_cols[:5]:  # Limit to 5 columns
            col_data = df[col].dropna()
            if len(col_data) > 20:
                # Simple clustering based on quantiles
                q1, q2, q3 = col_data.quantile([0.25, 0.5, 0.75])
                clusters = []

                cluster_labels = ["low", "medium", "high"]
                cluster_bounds = [float('-inf'), q1, q3, float('inf')]

                for i in range(3):
                    cluster_mask = (col_data >= cluster_bounds[i]) & (col_data < cluster_bounds[i+1])
                    if cluster_mask.sum() > 0:
                        clusters.append({
                            "label": cluster_labels[i],
                            "count": int(cluster_mask.sum()),
                            "range": [float(cluster_bounds[i]), float(cluster_bounds[i+1])],
                            "percentage": float(cluster_mask.sum() / len(col_data) * 100)
                        })

                if clusters:
                    patterns["clusters"].append({
                        "column": col,
                        "clusters": clusters
                    })

        # Detect anomalies (outliers across multiple columns)
        outlier_counts = []
        for col in numeric_cols:
            outliers = DataQualityAnalyzer.detect_outliers(df[col])
            outlier_counts.append(outliers.sum())

        if outlier_counts:
            outlier_cols = [numeric_cols[i] for i, count in enumerate(outlier_counts) if count > 0]
            if outlier_cols:
                patterns["anomalies"].append({
                    "type": "multivariate_outliers",
                    "affectedColumns": outlier_cols,
                    "totalOutliers": int(sum(outlier_counts))
                })

        return patterns


# ============================================================================
# Missing Value Analysis
# ============================================================================

class MissingValueAnalyzer:
    """Analyze missing value patterns"""

    @staticmethod
    def analyze_missing_values(df: pd.DataFrame) -> Dict[str, Any]:
        """
        Analyze patterns in missing values

        Args:
            df: Input DataFrame

        Returns:
            Missing value analysis
        """
        # Overall missingness
        total_cells = len(df) * len(df.columns)
        total_missing = df.isnull().sum().sum()
        overall_missing_rate = float(total_missing / total_cells * 100)

        # Column-level analysis
        column_analysis = []
        for col in df.columns:
            missing_count = df[col].isnull().sum()
            missing_rate = float(missing_count / len(df) * 100)

            # Check missing pattern
            if missing_count > 0:
                # Check if missing is completely at random (MCAR)
                # or has pattern (MAR/MNAR)
                col_series = df[col]
                non_null_values = col_series.dropna()

                pattern = "unknown"
                if len(non_null_values) > 0:
                    # Simple check: if missing is concentrated
                    null_indices = df[df[col].isnull()].index
                    if len(null_indices) > 0:
                        # Check contiguous blocks
                        gaps = []
                        for i in range(len(null_indices) - 1):
                            if null_indices[i+1] - null_indices[i] > 1:
                                gaps.append(i)

                        if len(gaps) > len(null_indices) * 0.5:
                            pattern = "scattered"
                        else:
                            pattern = "clustered"
            else:
                pattern = "none"

            column_analysis.append({
                "column": col,
                "missingCount": int(missing_count),
                "missingPercentage": missing_rate,
                "pattern": pattern
            })

        # Row-level analysis
        row_missing_counts = df.isnull().sum(axis=1)
        row_missing_distribution = {
            "rowsWithNoMissing": int((row_missing_counts == 0).sum()),
            "rowsWithSomeMissing": int((row_missing_counts > 0).sum()),
            "rowsCompletelyMissing": int((row_missing_counts == len(df.columns)).sum()),
            "avgMissingPerRow": float(row_missing_counts.mean()),
            "maxMissingInRow": int(row_missing_counts.max())
        }

        return {
            "overall": {
                "missingPercentage": overall_missing_rate,
                "totalMissingCells": int(total_missing)
            },
            "byColumn": column_analysis,
            "byRow": row_missing_distribution
        }


# ============================================================================
# Main Analysis Function
# ============================================================================

def main():
    """
    Main entry point for EDA

    Reads configuration from stdin and outputs results to stdout
    """
    start_time = time.time()

    try:
        # Parse input configuration
        input_config = json.loads(sys.stdin.read())
        logger.info(f"Received config: {input_config}")

        # Validate required fields
        if "data" not in input_config:
            raise ValueError("Missing required fields: data, project_id")

        data = input_config["data"]
        project_id = input_config.get("project_id", "unknown")
        columns_to_exclude = input_config.get("pii_columns_to_exclude", [])
        question_mappings = input_config.get("question_mappings", [])
        include_visualizations = input_config.get("include_visualizations", True)

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
                "memoryUsageMB": float(df.memory_usage(deep=True).sum() / 1024 / 1024),
                "project_id": project_id
            },
            "statistics": {},
            "visualizations": [],
            "model": {}
        }

        # 1. Data Quality Assessment
        quality = DataQualityAnalyzer.assess_quality(df)
        result_data["statistics"]["dataQuality"] = quality

        # 2. Data Type Inference
        type_analysis = DataQualityAnalyzer.detect_data_types(df)
        result_data["statistics"]["dataTypeAnalysis"] = type_analysis

        # 3. Missing Value Analysis
        missing_analysis = MissingValueAnalyzer.analyze_missing_values(df)
        result_data["statistics"]["missingValueAnalysis"] = missing_analysis

        # 4. Distribution Analysis for numeric columns
        numeric_distributions = {}
        for col in numeric_cols[:10]:  # Limit to 10 columns
            try:
                dist = DistributionAnalyzer.analyze_distribution(df[col])
                numeric_distributions[col] = dist
            except Exception as e:
                logger.warning(f"Could not analyze distribution for {col}: {e}")
                numeric_distributions[col] = {"error": str(e)}

        result_data["statistics"]["numericDistributions"] = numeric_distributions

        # 5. Distribution Analysis for categorical columns
        categorical_distributions = {}
        for col in categorical_cols[:10]:  # Limit to 10 columns
            try:
                dist = DistributionAnalyzer.analyze_categorical(df[col])
                categorical_distributions[col] = dist
            except Exception as e:
                logger.warning(f"Could not analyze distribution for {col}: {e}")
                categorical_distributions[col] = {"error": str(e)}

        result_data["statistics"]["categoricalDistributions"] = categorical_distributions

        # 6. Pattern Detection
        patterns = PatternDetector.detect_patterns(df)
        result_data["statistics"]["patterns"] = patterns

        # 7. Correlation Analysis (if multiple numeric columns)
        if len(numeric_cols) > 1:
            corr_matrix = df[numeric_cols].corr()
            result_data["statistics"]["correlationMatrix"] = corr_matrix.fillna(0).round(4).to_dict()

            # Find strong correlations
            strong_corrs = []
            for i in range(len(numeric_cols)):
                for j in range(i + 1, len(numeric_cols)):
                    corr_val = corr_matrix.iloc[i, j]
                    if abs(corr_val) > 0.7:
                        strong_corrs.append({
                            "col1": numeric_cols[i],
                            "col2": numeric_cols[j],
                            "correlation": float(corr_val),
                            "direction": "positive" if corr_val > 0 else "negative"
                        })

            strong_corrs.sort(key=lambda x: abs(x["correlation"]), reverse=True)
            result_data["statistics"]["strongCorrelations"] = strong_corrs

        # Generate visualizations
        if include_visualizations:
            # Data quality score gauge
            result_data["visualizations"].append({
                "type": "gauge",
                "title": "Data Quality Score",
                "config": {
                    "value": quality["qualityScore"],
                    "min": 0,
                    "max": 100,
                    "thresholds": [60, 80, 90]
                }
            })

            # Missing values bar chart
            missing_columns = [
                {"column": c["column"], "missingPercentage": c["missingPercentage"]}
                for c in missing_analysis["byColumn"][:10]
            ]
            result_data["visualizations"].append({
                "type": "bar",
                "title": "Missing Values by Column",
                "xAxis": "Column",
                "yAxis": "Missing %",
                "config": {
                    "data": missing_columns
                }
            })

            # Distribution histograms (first 3 numeric columns)
            for col in numeric_cols[:3]:
                if col in numeric_distributions:
                    result_data["visualizations"].append({
                        "type": "histogram",
                        "title": f"Distribution of {col}",
                        "config": {
                            "column": col,
                            "bins": 30
                        }
                    })

            # Categorical distribution charts (first 3 categorical columns)
            for col in categorical_cols[:3]:
                if col in categorical_distributions:
                    dist = categorical_distributions[col]
                    result_data["visualizations"].append({
                        "type": "bar",
                        "title": f"Distribution of {col}",
                        "xAxis": col,
                        "yAxis": "Count",
                        "config": {
                            "data": dist.get("topValues", [])
                        }
                    })

        # Model info
        result_data["model"] = {
            "algorithm": "statistical_eda",
            "analysesPerformed": [
                "data_quality",
                "data_type_inference",
                "missing_value_analysis",
                "distribution_analysis",
                "pattern_detection",
                "correlation_analysis"
            ] if len(numeric_cols) > 1 else [
                "data_quality",
                "data_type_inference",
                "missing_value_analysis",
                "distribution_analysis",
                "pattern_detection"
            ],
            "version": "1.0"
        }

        # Metadata
        processing_time_ms = int((time.time() - start_time) * 1000)
        result_data["metadata"] = {
            "recordCount": int(len(df)),
            "columnCount": int(len(df.columns)),
            "processingTimeMs": processing_time_ms,
            "project_id": project_id,
            "excludedColumns": columns_to_exclude,
            "analysisTimestamp": datetime.utcnow().isoformat()
        }

        # Build result
        result = AnalysisResult(
            success=True,
            analysis_type="eda",
            data=result_data,
            metadata=result_data["metadata"],
            errors=[]
        )

        # Output JSON result
        print(result.to_json())
        logger.info(f"EDA completed in {processing_time_ms}ms")

    except ValueError as e:
        # Input validation error
        result = AnalysisResult(
            success=False,
            analysis_type="eda",
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
            analysis_type="eda",
            data={},
            metadata={"errorTime": time.time()},
            errors=[f"Analysis failed: {str(e)}"]
        )
        print(result.to_json())
        sys.exit(1)


if __name__ == "__main__":
    main()
