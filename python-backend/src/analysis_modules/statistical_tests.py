"""
Analysis Module - Statistical Tests

Standardized output format for Chimaridata pipeline.

Performs:
- T-tests (one-sample, two-sample, paired)
- ANOVA
- Chi-square tests
- Mann-Whitney U tests
- Kruskal-Wallis tests
- Normality tests
- Significance testing

Standard output format:
{
    "success": true|false,
    "analysisType": "statistical_tests",
    "data": {
        "summary": {...},
        "statistics": {...},
        "visualizations": [...],
        "model": {}
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

import pandas as pd
import numpy as np
from scipy import stats
from scipy.stats import mannwhitneyu, kruskal

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
# Main Analysis Function
# ============================================================================

def main():
    """
    Main entry point for statistical tests analysis

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
        test_config = input_config.get("tests", [])
        alpha = input_config.get("alpha", 0.05)

        # Load dataframe
        df = pd.DataFrame(data)

        # Exclude PII columns
        if columns_to_exclude:
            df = df.drop(columns=columns_to_exclude, errors='ignore')
            logger.info(f"Excluded PII columns: {columns_to_exclude}")

        # Get column types
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()

        logger.info(f"Numeric columns: {len(numeric_cols)}")
        logger.info(f"Categorical columns: {len(categorical_cols)}")

        # Build results
        result_data = {
            "summary": {
                "recordCount": int(len(df)),
                "columnCount": int(len(df.columns)),
                "numericColumns": numeric_cols,
                "categoricalColumns": categorical_cols,
                "missingValues": df.isnull().sum().to_dict(),
                "project_id": project_id,
                "alpha": alpha,
                "testsRequested": [t.get("name") for t in test_config if "name" in t]
            },
            "statistics": {},
            "visualizations": [],
            "model": {}
        }

        # Execute requested tests
        for test in test_config:
            test_name = test.get("name", "")
            test_params = test.get("params", {})

            logger.info(f"Executing test: {test_name}")

            try:
                if test_name == "t_test":
                    result_data["statistics"][f"test_{test_name}"] = _execute_t_test(
                        df, test_params, alpha
                    )
                elif test_name == "anova":
                    result_data["statistics"][f"test_{test_name}"] = _execute_anova_test(
                        df, test_params, alpha
                    )
                elif test_name == "chisquare":
                    result_data["statistics"][f"test_{test_name}"] = _execute_chisquare_test(
                        df, test_params, alpha
                    )
                elif test_name == "mann_whitney":
                    result_data["statistics"][f"test_{test_name}"] = _execute_mann_whitney_test(
                        df, test_params, alpha
                    )
                elif test_name == "kruskal_wallis":
                    result_data["statistics"][f"test_{test_name}"] = _execute_kruskal_test(
                        df, test_params, alpha
                    )
                elif test_name == "normality":
                    result_data["statistics"][f"test_{test_name}"] = _execute_normality_test(
                        df, test_params, alpha
                    )
                else:
                    result_data["statistics"][f"test_{test_name}"] = {
                        "error": f"Unknown test type: {test_name}"
                    }

            except Exception as e:
                logger.error(f"Test {test_name} failed: {e}", exc_info=True)
                result_data["statistics"][f"test_{test_name}"] = {
                    "error": f"Test failed: {str(e)}"
                }

        # Generate visualization configs
        # Test results bar chart
        test_names = [t.get("name") for t in test_config if "name" in t]

        test_results = []
        for test_name in test_names:
            if f"test_{test_name}" in result_data["statistics"]:
                test_stats = result_data["statistics"][f"test_{test_name}"]
                if "p_value" in test_stats:
                    test_results.append({
                        "test": test_name,
                        "p_value": test_stats["p_value"],
                        "statistic": test_stats.get("statistic", ""),
                        "significant": test_stats.get("significant", False)
                    })

        if test_results:
            result_data["visualizations"].append({
                "type": "bar",
                "column": "test_statistic",
                "config": {
                    "title": "Statistical Test Results",
                    "xAxis": "Test",
                    "yAxis": "p-value (-log scale)",
                    "data": test_results
                }
            })

        # Metadata
        processing_time_ms = int((time.time() - start_time) * 1000)
        result_data["metadata"] = {
            "recordCount": int(len(df)),
            "columnCount": int(len(df.columns)),
            "processingTimeMs": processing_time_ms,
            "project_id": project_id,
            "alpha": alpha,
            "excludedColumns": columns_to_exclude
        }

        # Build result
        result = AnalysisResult(
            success=True,
            analysis_type="statistical_tests",
            data=result_data,
            metadata=result_data["metadata"],
            errors=[]
        )

        # Output JSON result
        print(result.to_json())
        logger.info(f"Statistical tests completed in {processing_time_ms}ms")

    except ValueError as e:
        # Input validation error
        result = AnalysisResult(
            success=False,
            analysis_type="statistical_tests",
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
            analysis_type="statistical_tests",
            data={},
            metadata={"errorTime": time.time()},
            errors=[f"Analysis failed: {str(e)}"]
        )
        print(result.to_json())
        sys.exit(1)


# ============================================================================
# Test Execution Functions
# ============================================================================

def _execute_t_test(df, params: Dict, alpha: float) -> Dict[str, Any]:
    """Execute one-sample t-test"""
    group1_col = params.get("group1_column", "")
    group2_col = params.get("group2_column", "")
    test_col = params.get("test_column", "")
    test_direction = params.get("direction", "two_sided")  # two_sided, greater, less

    if test_col not in df.columns:
        return {"error": f"Test column '{test_col}' not found"}

    if group1_col and group1_col not in df.columns:
        return {"error": f"Group 1 column '{group1_col}' not found"}

    if group2_col and group2_col not in df.columns:
        return {"error": f"Group 2 column '{group2_col}' not found"}

    # Get group samples
    group1 = df[group1_col].dropna()
    group2 = df[group2_col].dropna()

    # Get test values
    if test_direction == "greater":
        sample1 = group1[test_col].values if test_col in group1.columns else None
        sample2 = group2[test_col].values if test_col in group2.columns else None
        alternative = "less"
    elif test_direction == "less":
        sample1 = group1[test_col].values if test_col in group1.columns else None
        sample2 = group2[test_col].values if test_col in group2.columns else None
        alternative = "greater"
    else:  # two-sided (default)
        sample1 = group1[test_col].values if test_col in group1.columns else None
        sample2 = group2[test_col].values if test_col in group2.columns else None
        alternative = "two-sided"

    if sample1 is None and sample2 is None:
        return {"error": "No data for t-test"}

    # Perform t-test
    statistic, p_value = stats.ttest_ind(sample1, sample2, alternative=alternative)

    return {
        "statistic": "t_test",
        "statisticValue": float(statistic),
        "pValue": float(p_value),
        "significant": p_value < alpha,
        "alternative": alternative
    }


def _execute_anova_test(df, params: Dict, alpha: float) -> Dict[str, Any]:
    """Execute one-way ANOVA test"""
    group_col = params.get("group_column", "")
    value_col = params.get("value_column", "")

    if group_col not in df.columns:
        return {"error": f"Group column '{group_col}' not found"}
    if value_col not in df.columns:
        return {"error": f"Value column '{value_col}' not found"}

    groups = df[group_col].unique()
    if len(groups) < 2:
        return {"error": "Need at least 2 groups for ANOVA"}

    # Prepare data for ANOVA
    group_data = [df[df[group_col] == g][value_col].dropna() for g in groups]

    # Perform ANOVA
    statistic, p_value = stats.f_oneway_anova(*group_data)

    return {
        "statistic": "anova",
        "statisticValue": float(statistic),
        "pValue": float(p_value),
        "significant": p_value < alpha,
        "groups": groups.tolist()
    }


def _execute_chisquare_test(df, params: Dict, alpha: float) -> Dict[str, Any]:
    """Execute chi-square test of independence"""
    col1 = params.get("column1", "")
    col2 = params.get("column2", "")

    if col1 not in df.columns or col2 not in df.columns:
        return {"error": "Both columns required for chi-square"}

    # Create contingency table
    contingency = pd.crosstab(df[col1], df[col2])

    # Perform chi-square test
    chi2, p_value, dof, expected = stats.chi2_contingencyency(contingency)

    return {
        "statistic": "chi_square",
        "statisticValue": float(chi2),
        "pValue": float(p_value),
        "significant": p_value < alpha,
        "degreesOfFreedom": int(dof),
        "expected": expected.tolist()
    }


def _execute_mann_whitney_test(df, params: Dict, alpha: float) -> Dict[str, Any]:
    """Execute Mann-Whitney U test"""
    group_col = params.get("group_column", "")
    value_col = params.get("value_column", "")
    alternative = params.get("alternative", "greater")  # greater or less

    if group_col not in df.columns or value_col not in df.columns:
        return {"error": "Both columns required for Mann-Whitney"}

    # Get unique groups
    groups = df[group_col].unique()

    results = []
    for i in range(len(groups) - 1):
        for j in range(i + 1, len(groups)):
            group1_name = groups[i]
            group2_name = groups[j]

            sample1 = df[df[group_col] == group1_name][value_col].dropna()
            sample2 = df[df[group_col] == group2_name][value_col].dropna()

            if len(sample1) == 0 or len(sample2) == 0:
                continue

            # Perform Mann-Whitney U test
            if alternative == "greater":
                statistic, p_value = stats.mannwhitneyu(sample1, sample2, alternative='greater')
            else:
                statistic, p_value = stats.mannwhitneyu(sample1, sample2, alternative='less')

            results.append({
                "comparison": f"{group1_name} vs {group2_name}",
                "statistic": "Mann-Whitney U",
                "statisticValue": float(statistic),
                "pValue": float(p_value),
                "significant": p_value < alpha
            })

    # Find most significant comparison
    if results:
        most_significant = min(results, key=lambda x: x["pValue"])

    return {
        "statistic": "mann_whitney_u",
        "statisticValue": most_significant["statisticValue"],
        "pValue": most_significant["pValue"],
        "significant": most_significant["significant"],
        "comparisons": results
    }


def _execute_kruskal_test(df, params: Dict, alpha: float) -> Dict[str, Any]:
    """Execute Kruskal-Wallis test"""
    group_col = params.get("group_column", "")
    value_col = params.get("value_column", "")

    if group_col not in df.columns or value_col not in df.columns:
        return {"error": "Both columns required for Kruskal-Wallis"}

    # Get unique groups
    groups = df[group_col].unique()
    if len(groups) < 3:
        return {"error": "Need at least 3 groups for Kruskal-Wallis"}

    # Prepare data for Kruskal-Wallis
    group_data = [df[df[group_col] == g][value_col].dropna() for g in groups]

    # Perform Kruskal-Wallis
    statistic, p_value = stats.kruskal(*group_data)

    return {
        "statistic": "kruskal_wallis",
        "statisticValue": float(statistic),
        "pValue": float(p_value),
        "significant": p_value < alpha,
        "groups": groups.tolist()
    }


def _execute_normality_test(df, params: Dict, alpha: float) -> Dict[str, Any]:
    """Execute normality test"""
    col = params.get("column", "")

    if col not in df.columns:
        return {"error": f"Column '{col}' not found"}

    # Shapiro-Wilk test for normality
    statistic, p_value = stats.shapiro(df[col].dropna())

    return {
        "statistic": "shapiro_wilk",
        "statisticValue": float(statistic),
        "pValue": float(p_value),
        "significant": p_value > alpha  # Note: null hypothesis for normality
    }


if __name__ == "__main__":
    main()
