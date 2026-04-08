"""
Analysis Module - Regression Analysis

Standardized output format for Chimaridata pipeline.

Performs:
- Linear regression
- Logistic regression
- Multiple regression
- Feature selection
- Model evaluation metrics

Standard output format:
{
    "success": true|false,
    "analysisType": "regression",
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
from typing import Dict, List, Any

import pandas as pd
import numpy as np
from scipy import stats
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (
    r2_score, mean_squared_error,
    mean_absolute_error, accuracy_score,
    precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix, classification_report
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.feature_selection import SelectKBest, f_regression

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
    Main entry point for regression analysis

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
        if "target_column" not in input_config:
            raise ValueError("Missing required field: target_column")

        data = input_config["data"]
        project_id = input_config.get("project_id", "unknown")
        target_column = input_config["target_column"]
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
                "targetColumn": target_column,
                "regressionType": "linear"
            },
            "statistics": {},
            "visualizations": [],
            "model": {}
        }

        # Check if target column exists
        if target_column not in df.columns:
            result_data["statistics"]["error"] = f"Target column '{target_column}' not found"
            result = AnalysisResult(
                success=False,
                analysis_type="regression",
                data=result_data,
                metadata={},
                errors=["Target column not found"]
            )
            print(result.to_json())
            sys.exit(1)

        # Drop rows with missing target
        df_clean = df.dropna(subset=[target_column])

        if len(df_clean) == 0:
            result_data["statistics"]["error"] = f"No valid data after removing missing values"
            result = AnalysisResult(
                success=False,
                analysis_type="regression",
                data=result_data,
                metadata={},
                errors=["No valid data after removing missing target values"]
            )
            print(result.to_json())
            sys.exit(1)

        # Prepare features (X) and target (y)
        X = df_clean[numeric_cols]
        y = df_clean[target_column]

        # Encode categorical features
        X_encoded = X.copy()
        encoders = {}

        for col in categorical_cols:
            if col in X.columns:
                encoders[col] = LabelEncoder()
                X_encoded[col] = encoders[col].fit_transform(X[col].astype(str))

        # Build feature names list
        all_features = numeric_cols + list(X_encoded.columns)

        # Check if we have enough data for regression
        if len(X) < 10:
            result_data["statistics"]["error"] = "Insufficient data for regression (need at least 10 rows)"
            result = AnalysisResult(
                success=False,
                analysis_type="regression",
                data=result_data,
                metadata={},
                errors=["Insufficient data for regression"]
            )
            print(result.to_json())
            sys.exit(1)

        # Split data for training and testing (test_size configurable for scenario analysis)
        test_size = input_config.get("test_size", 0.2)
        X_train, X_test, y_train, y_test = train_test_split(
            X_encoded, y, test_size=test_size, random_state=42
        )

        # Reorder X_test to match X_train columns
        X_test_reordered = X_test[X_train.columns]

        # Determine regression type based on target
        if y.nunique() <= 2:
            # Binary or few categories - use logistic regression
            regression_type = "logistic"
            logger.info(f"Using logistic regression for target with {y.nunique()} unique values")
        else:
            # More categories - use linear regression
            regression_type = "linear"
            logger.info(f"Using linear regression for target with {y.nunique()} unique values")

        result_data["summary"]["regressionType"] = regression_type

        # Fit model based on type
        if regression_type == "logistic":
            # Scale features
            scaler = StandardScaler()
            X_train_scaled = scaler.fit_transform(X_train)
            X_test_scaled = scaler.transform(X_test_reordered)

            # Fit logistic regression
            model = LogisticRegression(max_iter=1000, random_state=42)
            model.fit(X_train_scaled, y_train)

            # Predictions
            y_pred = model.predict(X_test_scaled)
            y_prob = model.predict_proba(X_test_scaled)

            # Evaluation metrics
            accuracy = accuracy_score(y_test, y_pred)
            precision = precision_score(y_test, y_pred, average='weighted', zero_division=0)
            recall = recall_score(y_test, y_pred, average='weighted', zero_division=0)
            f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)
            try:
                auc = roc_auc_score(y_test, y_prob[:, 1])
            except:
                auc = 0.0

            # Confusion matrix
            cm = confusion_matrix(y_test, y_pred)
            cm_dict = {
                "true_negative": int(cm[0][0]),
                "false_positive": int(cm[0][1]),
                "false_negative": int(cm[1][0]),
                "true_positive": int(cm[1][1])
            }

            # Model statistics
            result_data["statistics"] = {
                "modelType": "Logistic Regression",
                "featuresUsed": all_features,
                "featureCount": len(all_features),
                "trainingSamples": len(X_train),
                "testSamples": len(X_test),
                "accuracy": float(accuracy),
                "precision": float(precision),
                "recall": float(recall),
                "f1Score": float(f1),
                "aucScore": float(auc),
                "confusionMatrix": cm_dict
            }

            # Feature importance
            # For encoded features, use underlying numeric columns
            feature_importance = {}
            for i, col in enumerate(X_train.columns):
                if col in numeric_cols:
                    if hasattr(model, 'coef_'):
                        feature_importance[col] = abs(model.coef_[i])
                else:
                    # For categorical features, use permutation importance
                    feature_importance[col] = "encoded_feature"

            result_data["statistics"]["featureImportance"] = feature_importance

            # Classification report
            report = classification_report(y_test, y_pred, zero_division=0)
            result_data["statistics"]["classificationReport"] = report

        else:
            # Linear regression
            # Check for correlations to warn about multicollinearity
            corr_matrix = X_train.corr()
            high_corr = []
            for i in range(len(corr_matrix.columns)):
                for j in range(i):
                    if abs(corr_matrix.iloc[i, j]) > 0.8:
                        high_corr.append(
                            (corr_matrix.columns[i], corr_matrix.columns[j])
                        )

            if high_corr:
                logger.warning(
                    f"High correlation detected: {high_corr[:5]} (>|0.8). "
                    "Consider removing one feature to avoid multicollinearity."
                )

            # Feature selection using K-best
            selector = SelectKBest(score_func=f_regression, k=min(5, len(X_train.columns)))
            X_train_selected = selector.fit_transform(X_train)

            # Get selected features
            selected_features = X_train.columns[selector.get_support(indices=True)]

            logger.info(f"Selected {len(selected_features)} features using K-best")

            # Fit linear regression
            model = LinearRegression()
            model.fit(X_train[selected_features], y_train)

            # Predictions
            y_pred = model.predict(X_test[selected_features])

            # Evaluation metrics
            r2 = r2_score(y_test, y_pred)
            mse = mean_squared_error(y_test, y_pred)
            mae = mean_absolute_error(y_test, y_pred)

            # Coefficients
            coefficients = pd.Series(model.coef_, index=selected_features)
            intercept = model.intercept_

            # Model statistics
            result_data["statistics"] = {
                "modelType": "Linear Regression",
                "featuresUsed": selected_features,
                "featureCount": len(selected_features),
                "trainingSamples": len(X_train),
                "testSamples": len(X_test),
                "r2Score": float(r2),
                "meanSquaredError": float(mse),
                "meanAbsoluteError": float(mae),
                "rootMeanSquaredError": float(np.sqrt(mse)),
                "coefficients": coefficients.to_dict(),
                "intercept": float(intercept)
            }

            # Feature importance (using absolute coefficient value)
            feature_importance = coefficients.abs().sort_values(ascending=False).to_dict()
            result_data["statistics"]["featureImportance"] = feature_importance

            # Predictions statistics
            residuals = y_test - y_pred
            result_data["statistics"]["predictions"] = {
                "min": float(y_pred.min()),
                "max": float(y_pred.max()),
                "mean": float(y_pred.mean()),
                "std": float(y_pred.std()),
                "residuals": {
                    "min": float(residuals.min()),
                    "max": float(residuals.max()),
                    "mean": float(residuals.mean()),
                    "std": float(residuals.std())
                }
            }

            # Visualization configs
            # Feature importance bar chart
            result_data["visualizations"].append({
                "type": "bar",
                "column": "feature",
                "config": {
                    "title": "Feature Importance",
                    "xAxis": "Importance",
                    "yAxis": "Feature",
                    "data": [
                        {"feature": feat, "importance": imp}
                        for feat, imp in feature_importance.items()
                    ]
                }
            })

            # Actual vs Predicted scatter plot
            result_data["visualizations"].append({
                "type": "scatter",
                "column": target_column,
                "config": {
                    "title": f"Actual vs Predicted {target_column}",
                    "xAxis": "Actual",
                    "yAxis": "Predicted",
                    "data": df_clean.head(100).to_dict(orient='records')
                }
            })

            # Residuals histogram
            result_data["visualizations"].append({
                "type": "histogram",
                "column": "residuals",
                "config": {
                    "title": "Residuals Distribution",
                    "xAxis": "Residual",
                    "yAxis": "Frequency",
                    "bins": "auto"
                }
            })

        # Generate visualization configs for top 5 numeric columns (histograms)
        for col in numeric_cols[:5]:
            if col in df.columns:
                result_data["visualizations"].append({
                    "type": "histogram",
                    "column": col,
                    "config": {
                        "title": f"Distribution of {col}",
                        "xAxis": col,
                        "yAxis": "Frequency",
                        "bins": "auto"
                    }
                })

        # Metadata
        processing_time_ms = int((time.time() - start_time) * 1000)
        result_data["metadata"] = {
            "recordCount": int(len(df_clean)),
            "columnCount": int(len(df_clean.columns)),
            "processingTimeMs": processing_time_ms,
            "project_id": project_id,
            "targetColumn": target_column,
            "regressionType": regression_type,
            "excludedColumns": columns_to_exclude
        }

        # Build result
        result = AnalysisResult(
            success=True,
            analysis_type="regression",
            data=result_data,
            metadata=result_data["metadata"],
            errors=[]
        )

        # Output JSON result
        print(result.to_json())
        logger.info(f"Regression analysis completed in {processing_time_ms}ms")

    except ValueError as e:
        # Input validation error
        result = AnalysisResult(
            success=False,
            analysis_type="regression",
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
            analysis_type="regression",
            data={},
            metadata={"errorTime": time.time()},
            errors=[f"Analysis failed: {str(e)}"]
        )
        print(result.to_json())
        sys.exit(1)


if __name__ == "__main__":
    main()
