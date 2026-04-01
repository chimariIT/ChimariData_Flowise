"""
Analysis Module - Classification Analysis

Standardized output format for Chimaridata pipeline.

Performs:
- Binary classification
- Multi-class classification
- Model evaluation (precision, recall, F1, ROC-AUC)
- Feature importance
- Confusion matrix
- Cross-validation

Standard output format:
{
    "success": true|false,
    "analysis_type": "classification",
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
from typing import Dict, List, Any, Optional

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.naive_bayes import GaussianNB
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report, roc_auc_score,
    roc_curve, precision_recall_curve, auc
)
from sklearn.feature_selection import SelectKBest, f_classif, chi2

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
# Classification Algorithms
# ============================================================================

class ClassifierFactory:
    """Factory for creating classifiers"""

    ALGORITHMS = {
        "random_forest": {
            "class": RandomForestClassifier,
            "params": {"n_estimators": 100, "random_state": 42},
            "supports_proba": True
        },
        "gradient_boosting": {
            "class": GradientBoostingClassifier,
            "params": {"n_estimators": 100, "random_state": 42},
            "supports_proba": True
        },
        "logistic_regression": {
            "class": LogisticRegression,
            "params": {"max_iter": 1000, "random_state": 42},
            "supports_proba": True
        },
        "svm": {
            "class": SVC,
            "params": {"kernel": "rbf", "random_state": 42, "probability": True},
            "supports_proba": True
        },
        "naive_bayes": {
            "class": GaussianNB,
            "params": {},
            "supports_proba": True
        },
        "decision_tree": {
            "class": DecisionTreeClassifier,
            "params": {"random_state": 42},
            "supports_proba": True
        }
    }

    @classmethod
    def get_classifier(cls, algorithm: str = "random_forest"):
        """
        Get a classifier instance

        Args:
            algorithm: Name of the algorithm

        Returns:
            Classifier instance
        """
        algo_config = cls.ALGORITHMS.get(algorithm, cls.ALGORITHMS["random_forest"])
        return algo_config["class"](**algo_config["params"])

    @classmethod
    def list_algorithms(cls) -> List[str]:
        """Get list of available algorithms"""
        return list(cls.ALGORITHMS.keys())


# ============================================================================
# Feature Engineering for Classification
# ============================================================================

class FeatureEngine:
    """Feature engineering for classification"""

    @staticmethod
    def select_features(X, y, method: str = "k_best", k: int = 10) -> Dict[str, Any]:
        """
        Select the most important features

        Args:
            X: Feature matrix
            y: Target vector
            method: Selection method (k_best, chi2)
            k: Number of features to select

        Returns:
            Dictionary with selected features and selector
        """
        if method == "k_best":
            selector = SelectKBest(f_classif, k=min(k, X.shape[1]))
        else:
            selector = SelectKBest(chi2, k=min(k, X.shape[1]))

        X_selected = selector.fit_transform(X, y)
        selected_features = selector.get_support(indices=True)

        return {
            "X_selected": X_selected,
            "selected_features": selected_features,
            "selector": selector
        }

    @staticmethod
    def handle_categorical_features(df: pd.DataFrame, categorical_cols: List[str]) -> pd.DataFrame:
        """
        Encode categorical features

        Args:
            df: DataFrame with categorical columns
            categorical_cols: List of categorical column names

        Returns:
            DataFrame with encoded categorical columns
        """
        df_encoded = df.copy()
        encoders = {}

        for col in categorical_cols:
            if col in df_encoded.columns:
                encoder = LabelEncoder()
                df_encoded[col] = encoder.fit_transform(df_encoded[col].astype(str))
                encoders[col] = encoder

        return df_encoded


# ============================================================================
# Model Evaluation
# ============================================================================

class ClassificationEvaluator:
    """Evaluate classification model performance"""

    @staticmethod
    def evaluate_model(y_true, y_pred, y_proba=None, classes=None) -> Dict[str, Any]:
        """
        Evaluate classification model

        Args:
            y_true: True labels
            y_pred: Predicted labels
            y_proba: Predicted probabilities (optional)
            classes: List of class names (optional)

        Returns:
            Dictionary of evaluation metrics
        """
        metrics = {
            "accuracy": float(accuracy_score(y_true, y_pred)),
            "precision": float(precision_score(y_true, y_pred, average='weighted', zero_division=0)),
            "recall": float(recall_score(y_true, y_pred, average='weighted', zero_division=0)),
            "f1Score": float(f1_score(y_true, y_pred, average='weighted', zero_division=0))
        }

        # Confusion matrix
        cm = confusion_matrix(y_true, y_pred)
        if classes:
            cm_dict = {}
            for i, cls in enumerate(classes):
                cm_dict[str(cls)] = cm[i].tolist()
        else:
            cm_dict = cm.tolist()

        metrics["confusionMatrix"] = cm_dict

        # ROC-AUC for binary classification
        if y_proba is not None and len(np.unique(y_true)) == 2:
            try:
                metrics["rocAuc"] = float(roc_auc_score(y_true, y_proba[:, 1]))
            except:
                metrics["rocAuc"] = 0.0

        # Classification report
        report = classification_report(y_true, y_pred, zero_division=0)
        metrics["classificationReport"] = report

        return metrics

    @staticmethod
    def cross_validate(model, X, y, cv: int = 5) -> Dict[str, Any]:
        """
        Perform k-fold cross-validation

        Args:
            model: Classifier instance
            X: Feature matrix
            y: Target vector
            cv: Number of folds

        Returns:
            Cross-validation results
        """
        cv_strategy = StratifiedKFold(n_splits=cv, shuffle=True, random_state=42)

        cv_scores = cross_val_score(
            model, X, y,
            cv=cv_strategy,
            scoring='f1_weighted',
            n_jobs=-1
        )

        return {
            "meanScore": float(np.mean(cv_scores)),
            "stdScore": float(np.std(cv_scores)),
            "scores": cv_scores.tolist(),
            "folds": cv
        }

    @staticmethod
    def get_feature_importance(model, feature_names: List[str]) -> List[Dict[str, Any]]:
        """
        Get feature importance from model

        Args:
            model: Trained classifier
            feature_names: List of feature names

        Returns:
            List of feature importance dictionaries
        """
        importances = []

        if hasattr(model, 'feature_importances_'):
            # Tree-based models
            for i, name in enumerate(feature_names):
                importances.append({
                    "feature": name,
                    "importance": float(model.feature_importances_[i])
                })
        elif hasattr(model, 'coef_'):
            # Linear models (use absolute coefficient)
            coef = model.coef_[0] if len(model.coef_.shape) == 2 else model.coef_
            for i, name in enumerate(feature_names):
                importances.append({
                    "feature": name,
                    "importance": float(abs(coef[i]))
                })
        else:
            # Unknown model type
            for name in feature_names:
                importances.append({
                    "feature": name,
                    "importance": 0.0
                })

        # Sort by importance
        importances.sort(key=lambda x: x["importance"], reverse=True)
        return importances


# ============================================================================
# Main Analysis Function
# ============================================================================

def main():
    """
    Main entry point for classification analysis

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
        algorithm = input_config.get("algorithm", "random_forest")
        test_size = input_config.get("test_size", 0.2)
        n_features = input_config.get("n_features", 10)
        cross_validation = input_config.get("cross_validation", True)
        cv_folds = input_config.get("cv_folds", 5)

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
                "algorithm": algorithm,
                "classificationType": "binary" if df[target_column].nunique() <= 2 else "multi_class"
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
                analysis_type="classification",
                data=result_data,
                metadata={},
                errors=["Target column not found"]
            )
            print(result.to_json())
            sys.exit(1)

        # Drop rows with missing target
        df_clean = df.dropna(subset=[target_column])

        if len(df_clean) == 0:
            result_data["statistics"]["error"] = "No valid data after removing missing target values"
            result = AnalysisResult(
                success=False,
                analysis_type="classification",
                data=result_data,
                metadata={},
                errors=["No valid data after removing missing target values"]
            )
            print(result.to_json())
            sys.exit(1)

        # Get feature columns (exclude target)
        feature_cols = [col for col in df_clean.columns if col != target_column]

        # Handle categorical features
        df_encoded = FeatureEngine.handle_categorical_features(df_clean, categorical_cols)

        # Prepare features and target
        X = df_encoded[feature_cols]
        y = df_encoded[target_column]

        # Encode target if needed
        if y.dtype == 'object':
            target_encoder = LabelEncoder()
            y = target_encoder.fit_transform(y)
            classes = target_encoder.classes_.tolist()
        else:
            target_encoder = None
            classes = sorted(y.unique().tolist())

        result_data["summary"]["classes"] = classes
        result_data["summary"]["classDistribution"] = y.value_counts().to_dict()

        # Fill missing values
        X = X.fillna(X.mean())

        # Check if we have enough data
        if len(X) < 20:
            result_data["statistics"]["error"] = "Insufficient data for classification (need at least 20 rows)"
            result = AnalysisResult(
                success=False,
                analysis_type="classification",
                data=result_data,
                metadata={},
                errors=["Insufficient data for classification"]
            )
            print(result.to_json())
            sys.exit(1)

        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42, stratify=y
        )

        logger.info(f"Training set: {len(X_train)} samples, Test set: {len(X_test)} samples")

        # Feature selection
        if len(feature_cols) > n_features:
            feature_result = FeatureEngine.select_features(X_train, y_train, k=n_features)
            X_train_selected = feature_result["X_selected"]
            X_test_selected = feature_result["selector"].transform(X_test)
            selected_features = [feature_cols[i] for i in feature_result["selected_features"]]
        else:
            X_train_selected = X_train.values
            X_test_selected = X_test.values
            selected_features = feature_cols

        logger.info(f"Selected {len(selected_features)} features: {selected_features}")

        # Scale features
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train_selected)
        X_test_scaled = scaler.transform(X_test_selected)

        # Create and train classifier
        classifier = ClassifierFactory.get_classifier(algorithm)
        logger.info(f"Training {algorithm} classifier...")

        classifier.fit(X_train_scaled, y_train)

        # Make predictions
        y_pred = classifier.predict(X_test_scaled)
        y_proba = classifier.predict_proba(X_test_scaled) if hasattr(classifier, 'predict_proba') else None

        # Evaluate model
        evaluation = ClassificationEvaluator.evaluate_model(
            y_test, y_pred, y_proba, classes
        )

        result_data["statistics"]["evaluation"] = evaluation

        # Feature importance
        if hasattr(classifier, 'feature_importances_') or hasattr(classifier, 'coef_'):
            feature_importance = ClassificationEvaluator.get_feature_importance(
                classifier, selected_features
            )
            result_data["statistics"]["featureImportance"] = feature_importance

        # Cross-validation
        if cross_validation and len(X_train) >= cv_folds:
            cv_results = ClassificationEvaluator.cross_validate(
                classifier, X_train_scaled, y_train, cv=cv_folds
            )
            result_data["statistics"]["crossValidation"] = cv_results

        # Model info
        result_data["model"] = {
            "algorithm": algorithm,
            "featuresUsed": selected_features,
            "featureCount": len(selected_features),
            "trainingSamples": int(len(X_train)),
            "testSamples": int(len(X_test)),
            "testSize": test_size,
            "classes": classes,
            "supportsProbabilities": hasattr(classifier, 'predict_proba')
        }

        # Generate visualizations
        # Confusion matrix heatmap
        result_data["visualizations"].append({
            "type": "heatmap",
            "title": "Confusion Matrix",
            "xAxisLabel": "Predicted",
            "yAxisLabel": "Actual",
            "config": {
                "matrix": evaluation["confusionMatrix"],
                "labels": classes
            }
        })

        # Feature importance bar chart
        if "featureImportance" in result_data["statistics"]:
            top_features = result_data["statistics"]["featureImportance"][:10]
            result_data["visualizations"].append({
                "type": "bar",
                "title": "Feature Importance",
                "xAxis": "Importance",
                "yAxis": "Feature",
                "config": {
                    "data": top_features
                }
            })

        # ROC curve (for binary classification)
        if y_proba is not None and len(classes) == 2:
            fpr, tpr, _ = roc_curve(y_test, y_proba[:, 1])
            roc_auc = evaluation.get("rocAuc", 0.0)
            result_data["visualizations"].append({
                "type": "line",
                "title": "ROC Curve",
                "xAxis": "False Positive Rate",
                "yAxis": "True Positive Rate",
                "config": {
                    "fpr": fpr.tolist(),
                    "tpr": tpr.tolist(),
                    "auc": float(roc_auc)
                }
            })

        # Precision-Recall curve
        if y_proba is not None and len(classes) == 2:
            precision, recall, _ = precision_recall_curve(y_test, y_proba[:, 1])
            result_data["visualizations"].append({
                "type": "line",
                "title": "Precision-Recall Curve",
                "xAxis": "Recall",
                "yAxis": "Precision",
                "config": {
                    "precision": precision.tolist(),
                    "recall": recall.tolist()
                }
            })

        # Class distribution bar chart
        result_data["visualizations"].append({
            "type": "bar",
            "title": "Class Distribution",
            "xAxis": "Class",
            "yAxis": "Count",
            "config": {
                "data": [
                    {"class": str(cls), "count": int(result_data["summary"]["classDistribution"].get(cls, 0))}
                    for cls in classes
                ]
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
            "algorithm": algorithm,
            "excludedColumns": columns_to_exclude
        }

        # Build result
        result = AnalysisResult(
            success=True,
            analysis_type="classification",
            data=result_data,
            metadata=result_data["metadata"],
            errors=[]
        )

        # Output JSON result
        print(result.to_json())
        logger.info(f"Classification analysis completed in {processing_time_ms}ms")

    except ValueError as e:
        # Input validation error
        result = AnalysisResult(
            success=False,
            analysis_type="classification",
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
            analysis_type="classification",
            data={},
            metadata={"errorTime": time.time()},
            errors=[f"Analysis failed: {str(e)}"]
        )
        print(result.to_json())
        sys.exit(1)


if __name__ == "__main__":
    main()
