"""
Analysis Module - Question Synthesis

Standardized output format for Chimaridata pipeline.

Performs:
- Automatic question generation from data
- Question categorization by intent
- Question prioritization by business value
- Recommended analyses for each question
- Multi-language support

Standard output format:
{
    "success": true|false,
    "analysis_type": "question_synthesis",
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

import pandas as pd
import numpy as np
from scipy import stats

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
# Question Templates by Intent
# ============================================================================

QUESTION_TEMPLATES = {
    "trend": [
        "What is the overall trend of {column} over time?",
        "How has {column} changed in the last {period}?",
        "Is {column} increasing, decreasing, or staying constant?",
        "What patterns do we see in {column} over time?",
        "Can we forecast future values of {column}?"
    ],
    "comparison": [
        "How does {column1} compare to {column2}?",
        "What is the difference between {column1} and {column2}?",
        "Which has higher values: {column1} or {column2}?",
        "How do different {category} groups compare in terms of {column}?",
        "What is the ratio of {column1} to {column2}?"
    ],
    "correlation": [
        "What is the relationship between {column1} and {column2}?",
        "Are {column1} and {column2} correlated?",
        "Does {column1} affect {column2}?",
        "What factors influence {column}?",
        "Which columns are most strongly related to {column}?"
    ],
    "distribution": [
        "What is the distribution of {column}?",
        "What are the common values of {column}?",
        "Is {column} normally distributed?",
        "What are the outliers in {column}?",
        "How is {column} spread across different ranges?"
    ],
    "prediction": [
        "What predicts {column}?",
        "Which factors most strongly influence {column}?",
        "Can we predict {column} based on other columns?",
        "What determines {column}?",
        "What model best predicts {column}?"
    ],
    "descriptive": [
        "What is the average {column}?",
        "What is the total sum of {column}?",
        "How many records have {column} greater than {threshold}?",
        "What is the maximum value of {column}?",
        "What is the range of values for {column}?"
    ],
    "root_cause": [
        "Why is {column} at its current level?",
        "What causes variations in {column}?",
        "What factors explain the changes in {column}?",
        "Why do some records have higher {column} than others?",
        "What drives {column}?"
    ]
}


# ============================================================================
# Recommended Analyses by Intent
# ============================================================================

RECOMMENDED_ANALYSES = {
    "trend": ["time_series", "linear_regression"],
    "comparison": ["t_test", "anova", "correlation"],
    "correlation": ["correlation", "correlation_heatmap"],
    "distribution": ["descriptive_stats", "histogram", "box_plot"],
    "prediction": ["regression", "classification", "random_forest"],
    "descriptive": ["descriptive_stats", "summary_statistics"],
    "root_cause": ["correlation", "regression", "feature_importance"]
}


# ============================================================================
# Question Synthesizer
# ============================================================================

class QuestionSynthesizer:
    """Generate questions from data analysis"""

    def __init__(self, max_questions: int = 20):
        self.max_questions = max_questions

    def generate_questions(
        self,
        df: pd.DataFrame,
        question_mappings: Optional[List[Dict]] = None,
        industry: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate relevant questions from data

        Args:
            df: Input DataFrame
            question_mappings: Existing question mappings
            industry: Industry context

        Returns:
            List of generated questions with metadata
        """
        questions = []
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
        datetime_cols = df.select_dtypes(include=['datetime64', 'datetime64[ns]']).columns.tolist()

        # 1. Trend questions (if datetime column exists)
        if datetime_cols and len(numeric_cols) > 0:
            for col in numeric_cols[:3]:  # Limit to top 3
                questions.extend(self._generate_trend_questions(col, datetime_cols[0]))

        # 2. Comparison questions (between numeric columns)
        if len(numeric_cols) >= 2:
            for i in range(min(3, len(numeric_cols))):
                for j in range(i + 1, min(i + 3, len(numeric_cols))):
                    questions.append({
                        "question": f"How does {numeric_cols[i]} compare to {numeric_cols[j]}?",
                        "intent": "comparison",
                        "columns": [numeric_cols[i], numeric_cols[j]],
                        "priority": self._calculate_priority("comparison", numeric_cols[i], numeric_cols[j], df),
                        "recommendedAnalyses": RECOMMENDED_ANALYSES["comparison"]
                    })

        # 3. Distribution questions (for numeric columns)
        for col in numeric_cols[:4]:
            if self._is_skewed(df[col]):
                question = f"Is the distribution of {col} skewed? What are the outliers?"
            else:
                question = f"What is the distribution of {col}?"

            questions.append({
                "question": question,
                "intent": "distribution",
                "columns": [col],
                "priority": self._calculate_priority("distribution", col, None, df),
                "recommendedAnalyses": RECOMMENDED_ANALYSES["distribution"]
            })

        # 4. Correlation questions (strong correlations)
        if len(numeric_cols) >= 2:
            strong_corrs = self._find_strong_correlations(df[numeric_cols], threshold=0.6)
            for corr in strong_corrs[:5]:
                direction = "positively" if corr["correlation"] > 0 else "negatively"
                questions.append({
                    "question": f"Are {corr['col1']} and {corr['col2']} correlated?",
                    "intent": "correlation",
                    "columns": [corr["col1"], corr["col2"]],
                    "priority": "high" if abs(corr["correlation"]) > 0.8 else "medium",
                    "recommendedAnalyses": RECOMMENDED_ANALYSES["correlation"],
                    "evidence": {
                        "correlation": corr["correlation"],
                        "pValue": corr["p_value"]
                    }
                })

        # 5. Prediction questions (target selection)
        potential_targets = self._identify_potential_targets(df, numeric_cols)
        for target in potential_targets[:2]:
            question = f"What factors influence {target}?"
            questions.append({
                "question": question,
                "intent": "prediction",
                "columns": [target],
                "priority": "high",
                "recommendedAnalyses": RECOMMENDED_ANALYSES["prediction"]
            })

        # 6. Descriptive questions (summary statistics)
        for col in numeric_cols[:3]:
            questions.append({
                "question": f"What is the average {col} and how does it vary?",
                "intent": "descriptive",
                "columns": [col],
                "priority": "medium",
                "recommendedAnalyses": RECOMMENDED_ANALYSES["descriptive"]
            })

        # 7. Categorical analysis questions
        for col in categorical_cols[:3]:
            unique_count = df[col].nunique()
            if 2 <= unique_count <= 10:
                questions.append({
                    "question": f"How do different {col} groups compare?",
                    "intent": "comparison",
                    "columns": [col],
                    "priority": "medium",
                    "recommendedAnalyses": RECOMMENDED_ANALYSES["comparison"]
                })

        # Sort by priority and limit
        priority_order = {"high": 0, "medium": 1, "low": 2}
        questions.sort(key=lambda q: priority_order.get(q["priority"], 2))

        return questions[:self.max_questions]

    def _generate_trend_questions(
        self,
        value_col: str,
        date_col: str
    ) -> List[Dict[str, Any]]:
        """Generate trend-related questions"""
        templates = [
            f"What is the overall trend of {value_col} over time?",
            f"How has {value_col} changed?",
            f"Can we forecast future values of {value_col}?"
        ]
        return [{
            "question": template,
            "intent": "trend",
            "columns": [value_col, date_col],
            "priority": "high",
            "recommendedAnalyses": RECOMMENDED_ANALYSES["trend"]
        } for template in templates[:2]]

    def _find_strong_correlations(
        self,
        df: pd.DataFrame,
        threshold: float = 0.6
    ) -> List[Dict[str, Any]]:
        """Find strong correlations in numeric data"""
        correlations = []
        cols = df.columns.tolist()

        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                corr, p_value = stats.pearsonr(df[cols[i]].dropna(), df[cols[j]].dropna())
                if abs(corr) >= threshold and not np.isnan(corr):
                    correlations.append({
                        "col1": cols[i],
                        "col2": cols[j],
                        "correlation": float(corr),
                        "p_value": float(p_value)
                    })

        correlations.sort(key=lambda x: abs(x["correlation"]), reverse=True)
        return correlations

    def _identify_potential_targets(
        self,
        df: pd.DataFrame,
        numeric_cols: List[str]
    ) -> List[str]:
        """Identify columns that could be good prediction targets"""
        targets = []

        for col in numeric_cols:
            # Check variance (high variance = good target)
            variance = df[col].var()
            if variance > 0:
                # Check if it's correlated with other columns (predictable)
                corrs = []
                for other_col in numeric_cols:
                    if other_col != col:
                        corr, _ = stats.pearsonr(df[col].dropna(), df[other_col].dropna())
                        if not np.isnan(corr):
                            corrs.append(abs(corr))

                if corrs:
                    avg_correlation = np.mean(corrs)
                    targets.append({
                        "column": col,
                        "variance": float(variance),
                        "avgCorrelation": float(avg_correlation),
                        "score": float(variance * avg_correlation)
                    })

        # Sort by score and return column names
        targets.sort(key=lambda x: x["score"], reverse=True)
        return [t["column"] for t in targets]

    def _is_skewed(self, series: pd.Series, threshold: float = 1.0) -> bool:
        """Check if a series is skewed"""
        series_clean = series.dropna()
        if len(series_clean) < 3:
            return False
        skewness = stats.skew(series_clean)
        return abs(skewness) > threshold

    def _calculate_priority(
        self,
        intent: str,
        col1: Optional[str],
        col2: Optional[str],
        df: pd.DataFrame
    ) -> str:
        """Calculate priority based on data characteristics"""
        # High priority intents
        high_priority_intents = ["trend", "prediction", "correlation"]

        if intent in high_priority_intents:
            return "high"

        # Check for outliers (higher priority)
        if col1 and col1 in df.columns:
            q1 = df[col1].quantile(0.25)
            q3 = df[col1].quantile(0.75)
            iqr = q3 - q1
            outliers = df[(df[col1] < (q1 - 1.5 * iqr)) | (df[col1] > (q3 + 1.5 * iqr))]
            if len(outliers) > len(df) * 0.1:  # >10% outliers
                return "high"

        return "medium"


# ============================================================================
# Question Analysis
# ============================================================================

class QuestionAnalyzer:
    """Analyze questions to extract intent and parameters"""

    INTENT_PATTERNS = {
        "trend": ["trend", "over time", "change", "forecast", "predict", "future", "historical"],
        "comparison": ["compare", "difference", "between", "versus", "vs", "higher", "lower", "ratio"],
        "correlation": ["correlate", "relationship", "affect", "influence", "impact", "related"],
        "distribution": ["distribution", "spread", "outlier", "range", "histogram", "normal"],
        "prediction": ["predict", "forecast", "estimate", "model", "algorithm", "determine"],
        "descriptive": ["average", "mean", "sum", "total", "count", "maximum", "minimum", "how many"],
        "root_cause": ["why", "cause", "reason", "explain", "determine", "factor"]
    }

    def analyze(self, question: str) -> Dict[str, Any]:
        """
        Analyze a question to extract intent and parameters

        Args:
            question: The question to analyze

        Returns:
            Analysis dict with intent, confidence, and parameters
        """
        question_lower = question.lower()

        # Detect intent
        intent_scores = {}
        for intent, patterns in self.INTENT_PATTERNS.items():
            score = 0
            for pattern in patterns:
                if pattern in question_lower:
                    score += 1
            intent_scores[intent] = score

        # Get best intent
        best_intent = max(intent_scores, key=intent_scores.get)
        confidence = intent_scores[best_intent] / len(self.INTENT_PATTERNS[best_intent])

        # Extract entities (column names, metrics)
        entities = self._extract_entities(question_lower)

        return {
            "question": question,
            "intent": best_intent,
            "confidence": float(confidence),
            "entities": entities,
            "recommendedAnalyses": RECOMMENDED_ANALYSES.get(best_intent, [])
        }

    def _extract_entities(self, question: str) -> Dict[str, Any]:
        """Extract column names and metrics from question"""
        # This is a simple implementation - in production, use NER or column name matching
        entities = {
            "columns": [],
            "metrics": [],
            "timeFrames": [],
            "thresholds": []
        }

        # Common metric names
        metrics = ["average", "mean", "sum", "total", "count", "maximum", "minimum", "median"]
        for metric in metrics:
            if metric in question:
                entities["metrics"].append(metric)

        # Time frames
        time_frames = ["today", "yesterday", "this week", "last week", "this month", "last month",
                      "this year", "last year", "quarter", "year to date", "ytd"]
        for tf in time_frames:
            if tf in question:
                entities["timeFrames"].append(tf)

        # Thresholds (look for numbers)
        import re
        numbers = re.findall(r'\b\d+\b', question)
        if numbers:
            entities["thresholds"] = [int(n) for n in numbers]

        return entities


# ============================================================================
# Main Analysis Function
# ============================================================================

def main():
    """
    Main entry point for question synthesis

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
        max_questions = input_config.get("max_questions", 20)
        existing_questions = input_config.get("existing_questions", [])
        industry = input_config.get("industry", None)

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
                "project_id": project_id,
                "maxQuestions": max_questions,
                "existingQuestions": len(existing_questions)
            },
            "statistics": {},
            "visualizations": [],
            "model": {}
        }

        # Generate questions
        synthesizer = QuestionSynthesizer(max_questions=max_questions)
        questions = synthesizer.generate_questions(df, question_mappings, industry)

        # Remove duplicates with existing questions
        existing_texts = set(q.get("question", "").lower() for q in existing_questions)
        new_questions = [
            q for q in questions
            if q["question"].lower() not in existing_texts
        ]

        # Assign IDs to questions
        for i, q in enumerate(new_questions):
            q["questionId"] = f"q_{i}_{hash(q['question']) % 10000}"
            q["createdAt"] = datetime.utcnow().isoformat()
            q["projectId"] = project_id

        result_data["statistics"]["generatedQuestions"] = len(new_questions)
        result_data["statistics"]["questions"] = new_questions

        # Question intent distribution
        intent_counts = {}
        for q in new_questions:
            intent = q["intent"]
            intent_counts[intent] = intent_counts.get(intent, 0) + 1

        result_data["statistics"]["intentDistribution"] = intent_counts

        # Priority distribution
        priority_counts = {}
        for q in new_questions:
            priority = q["priority"]
            priority_counts[priority] = priority_counts.get(priority, 0) + 1

        result_data["statistics"]["priorityDistribution"] = priority_counts

        # Analyze existing questions
        analyzer = QuestionAnalyzer()
        if existing_questions:
            analyzed_existing = []
            for q in existing_questions:
                q_text = q.get("question", q.get("text", ""))
                if q_text:
                    analyzed = analyzer.analyze(q_text)
                    analyzed_existing.append(analyzed)

            result_data["statistics"]["analyzedExistingQuestions"] = analyzed_existing

        # Generate visualizations
        # Intent distribution pie chart
        if intent_counts:
            result_data["visualizations"].append({
                "type": "pie",
                "title": "Question Intent Distribution",
                "config": {
                    "data": [
                        {"intent": intent, "count": count}
                        for intent, count in intent_counts.items()
                    ]
                }
            })

        # Priority distribution bar chart
        if priority_counts:
            result_data["visualizations"].append({
                "type": "bar",
                "title": "Question Priority Distribution",
                "xAxis": "Priority",
                "yAxis": "Count",
                "config": {
                    "data": [
                        {"priority": priority, "count": count}
                        for priority, count in priority_counts.items()
                    ]
                }
            })

        # Column usage frequency
        column_usage = {}
        for q in new_questions:
            for col in q.get("columns", []):
                column_usage[col] = column_usage.get(col, 0) + 1

        if column_usage:
            sorted_columns = sorted(column_usage.items(), key=lambda x: x[1], reverse=True)
            result_data["visualizations"].append({
                "type": "bar",
                "title": "Column Usage in Questions",
                "xAxis": "Column",
                "yAxis": "Usage Count",
                "config": {
                    "data": [
                        {"column": col, "count": count}
                        for col, count in sorted_columns[:10]
                    ]
                }
            })

        # Model info
        result_data["model"] = {
            "algorithm": "rule_based_template_matching",
            "maxQuestions": max_questions,
            "questionTemplates": len(QUESTION_TEMPLATES),
            "supportedIntents": list(QUESTION_TEMPLATES.keys()),
            "generationStrategy": "statistical_analysis_based"
        }

        # Metadata
        processing_time_ms = int((time.time() - start_time) * 1000)
        result_data["metadata"] = {
            "recordCount": int(len(df)),
            "columnCount": int(len(df.columns)),
            "processingTimeMs": processing_time_ms,
            "project_id": project_id,
            "questionsGenerated": len(new_questions),
            "excludedColumns": columns_to_exclude,
            "generationTimestamp": datetime.utcnow().isoformat()
        }

        # Build result
        result = AnalysisResult(
            success=True,
            analysis_type="question_synthesis",
            data=result_data,
            metadata=result_data["metadata"],
            errors=[]
        )

        # Output JSON result
        print(result.to_json())
        logger.info(f"Question synthesis completed in {processing_time_ms}ms - generated {len(new_questions)} questions")

    except ValueError as e:
        # Input validation error
        result = AnalysisResult(
            success=False,
            analysis_type="question_synthesis",
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
            analysis_type="question_synthesis",
            data={},
            metadata={"errorTime": time.time()},
            errors=[f"Analysis failed: {str(e)}"]
        )
        print(result.to_json())
        sys.exit(1)


if __name__ == "__main__":
    main()
