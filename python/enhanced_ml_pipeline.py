#!/usr/bin/env python3
"""
Enhanced ML Pipeline Script

Comprehensive ML pipeline with:
1. Intelligent target variable detection
2. Feature selection (variance, correlation, importance)
3. Model comparison (multiple algorithms)
4. Cross-validation with hyperparameter tuning
5. Support for pre-embedded features
6. Comprehensive model evaluation

Usage:
    python enhanced_ml_pipeline.py '{"data_path": "...", "problem_type": "auto"}'
"""

import json
import sys
import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional, Any
import warnings
warnings.filterwarnings('ignore')

# Sklearn imports
from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.feature_selection import SelectKBest, f_classif, f_regression, mutual_info_classif, mutual_info_regression
from sklearn.feature_selection import VarianceThreshold, RFE
from sklearn.linear_model import LinearRegression, Ridge, Lasso, LogisticRegression, ElasticNet
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor, GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.svm import SVC, SVR
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.metrics import (
    mean_squared_error, r2_score, mean_absolute_error,
    accuracy_score, precision_score, recall_score, f1_score, roc_auc_score,
    classification_report, confusion_matrix
)

# ============================================
# TARGET VARIABLE DETECTION
# ============================================

def detect_target_variable(df: pd.DataFrame, config: Dict) -> Tuple[str, str]:
    """
    Intelligently detect the target variable and problem type.

    Returns:
        Tuple of (target_column_name, problem_type)
    """
    explicit_target = config.get('target_column')
    explicit_type = config.get('problem_type', 'auto')

    if explicit_target and explicit_target in df.columns:
        # Use explicit target if provided
        target_col = explicit_target
        if explicit_type != 'auto':
            return target_col, explicit_type
        # Detect problem type from target
        unique_values = df[target_col].nunique()
        if unique_values <= 10 and df[target_col].dtype == 'object':
            return target_col, 'classification'
        elif unique_values <= 20:
            return target_col, 'classification'
        return target_col, 'regression'

    # Auto-detect target variable using heuristics
    candidates = []

    for col in df.columns:
        score = 0
        col_lower = col.lower()

        # Name-based heuristics (higher scores for common target names)
        target_keywords = ['target', 'label', 'class', 'outcome', 'result', 'y', 'output']
        if any(kw in col_lower for kw in target_keywords):
            score += 50

        # Dependent variable keywords
        dependent_keywords = ['price', 'value', 'amount', 'revenue', 'sales', 'score', 'rating',
                            'satisfaction', 'engagement', 'retention', 'churn', 'default',
                            'conversion', 'success', 'failure', 'status']
        if any(kw in col_lower for kw in dependent_keywords):
            score += 30

        # Avoid embedding columns and IDs
        if '_emb_' in col_lower or col_lower.endswith('_id') or col_lower == 'id':
            score -= 100

        # Favor columns at the end of the dataframe (common convention)
        col_position = list(df.columns).index(col)
        position_score = (col_position / len(df.columns)) * 10
        score += position_score

        # Check cardinality
        unique_ratio = df[col].nunique() / len(df)
        if unique_ratio < 0.1:  # Low cardinality - likely classification target
            score += 20
        elif unique_ratio > 0.9:  # High cardinality - likely ID column
            score -= 50

        candidates.append((col, score))

    # Sort by score and pick the best
    candidates.sort(key=lambda x: x[1], reverse=True)

    if not candidates:
        raise ValueError("No suitable target variable found")

    best_target = candidates[0][0]
    print(f"🎯 [Target Detection] Selected '{best_target}' (score: {candidates[0][1]:.1f})")
    print(f"   Top 3 candidates: {[(c[0], f'{c[1]:.1f}') for c in candidates[:3]]}")

    # Determine problem type
    target_values = df[best_target].dropna()
    unique_count = target_values.nunique()

    if target_values.dtype == 'object' or unique_count <= 10:
        problem_type = 'classification'
    elif unique_count <= 20 and target_values.dtype in ['int64', 'int32']:
        problem_type = 'classification'  # Likely categorical encoded as int
    else:
        problem_type = 'regression'

    return best_target, problem_type


# ============================================
# FEATURE SELECTION
# ============================================

def select_features(
    X: pd.DataFrame,
    y: pd.Series,
    problem_type: str,
    config: Dict
) -> Tuple[pd.DataFrame, List[str], Dict]:
    """
    Multi-stage feature selection pipeline.

    Returns:
        Tuple of (selected_features_df, selected_feature_names, selection_report)
    """
    selection_report = {
        'original_features': len(X.columns),
        'stages': []
    }

    current_features = X.copy()
    feature_names = list(X.columns)

    # Stage 1: Variance Threshold (remove near-zero variance features)
    print(f"📊 [Feature Selection] Stage 1: Variance threshold")
    variance_threshold = config.get('variance_threshold', 0.01)
    selector = VarianceThreshold(threshold=variance_threshold)

    try:
        current_features = pd.DataFrame(
            selector.fit_transform(current_features),
            columns=[feature_names[i] for i in range(len(feature_names)) if selector.get_support()[i]]
        )
        feature_names = list(current_features.columns)
        selection_report['stages'].append({
            'stage': 'variance_threshold',
            'threshold': variance_threshold,
            'features_remaining': len(feature_names)
        })
        print(f"   Removed {selection_report['original_features'] - len(feature_names)} low-variance features")
    except Exception as e:
        print(f"   ⚠️ Variance threshold failed: {e}")

    # Stage 2: Correlation-based removal (remove highly correlated features)
    print(f"📊 [Feature Selection] Stage 2: Correlation filter")
    correlation_threshold = config.get('correlation_threshold', 0.95)

    try:
        corr_matrix = current_features.corr().abs()
        upper_triangle = corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))
        to_drop = [col for col in upper_triangle.columns if any(upper_triangle[col] > correlation_threshold)]

        if to_drop:
            current_features = current_features.drop(columns=to_drop)
            feature_names = list(current_features.columns)
            selection_report['stages'].append({
                'stage': 'correlation_filter',
                'threshold': correlation_threshold,
                'removed': to_drop,
                'features_remaining': len(feature_names)
            })
            print(f"   Removed {len(to_drop)} highly correlated features")
    except Exception as e:
        print(f"   ⚠️ Correlation filter failed: {e}")

    # Stage 3: Statistical feature selection (SelectKBest)
    print(f"📊 [Feature Selection] Stage 3: Statistical selection")
    max_features = min(config.get('max_features', 50), len(feature_names))

    try:
        if problem_type == 'classification':
            score_func = mutual_info_classif
        else:
            score_func = mutual_info_regression

        selector = SelectKBest(score_func=score_func, k=min(max_features, len(feature_names)))
        selector.fit(current_features, y)

        # Get feature scores
        feature_scores = dict(zip(feature_names, selector.scores_))
        selected_mask = selector.get_support()

        current_features = pd.DataFrame(
            selector.transform(current_features),
            columns=[feature_names[i] for i in range(len(feature_names)) if selected_mask[i]]
        )
        feature_names = list(current_features.columns)

        selection_report['stages'].append({
            'stage': 'statistical_selection',
            'method': 'mutual_information',
            'k': max_features,
            'feature_scores': {k: float(v) for k, v in sorted(feature_scores.items(), key=lambda x: x[1], reverse=True)[:20]},
            'features_remaining': len(feature_names)
        })
        print(f"   Selected top {len(feature_names)} features by mutual information")
    except Exception as e:
        print(f"   ⚠️ Statistical selection failed: {e}")

    selection_report['final_features'] = len(feature_names)
    selection_report['selected_features'] = feature_names

    print(f"✅ [Feature Selection] {selection_report['original_features']} → {selection_report['final_features']} features")

    return current_features, feature_names, selection_report


# ============================================
# MODEL COMPARISON
# ============================================

def compare_models(
    X_train: pd.DataFrame,
    X_test: pd.DataFrame,
    y_train: pd.Series,
    y_test: pd.Series,
    problem_type: str,
    config: Dict
) -> Dict:
    """
    Train and compare multiple models, select the best one.
    """
    print(f"🤖 [Model Comparison] Comparing models for {problem_type}")

    cv_folds = config.get('cv_folds', 5)
    comparison_results = []

    if problem_type == 'classification':
        models = {
            'logistic_regression': LogisticRegression(max_iter=1000, random_state=42),
            'random_forest': RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1),
            'gradient_boosting': GradientBoostingClassifier(n_estimators=100, random_state=42),
            'decision_tree': DecisionTreeClassifier(max_depth=10, random_state=42),
            'knn': KNeighborsClassifier(n_neighbors=5)
        }
        scoring = 'f1_weighted'

    else:  # regression
        models = {
            'linear_regression': LinearRegression(),
            'ridge': Ridge(alpha=1.0),
            'lasso': Lasso(alpha=0.1),
            'elastic_net': ElasticNet(alpha=0.1, l1_ratio=0.5),
            'random_forest': RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1),
            'gradient_boosting': GradientBoostingRegressor(n_estimators=100, random_state=42),
            'decision_tree': DecisionTreeRegressor(max_depth=10, random_state=42)
        }
        scoring = 'r2'

    for name, model in models.items():
        try:
            print(f"   Training {name}...")

            # Cross-validation score
            cv_scores = cross_val_score(model, X_train, y_train, cv=cv_folds, scoring=scoring)

            # Fit on full training set
            model.fit(X_train, y_train)

            # Predictions
            y_pred = model.predict(X_test)

            if problem_type == 'classification':
                metrics = {
                    'accuracy': float(accuracy_score(y_test, y_pred)),
                    'precision': float(precision_score(y_test, y_pred, average='weighted', zero_division=0)),
                    'recall': float(recall_score(y_test, y_pred, average='weighted', zero_division=0)),
                    'f1': float(f1_score(y_test, y_pred, average='weighted', zero_division=0))
                }
                primary_metric = metrics['f1']
            else:
                metrics = {
                    'r2': float(r2_score(y_test, y_pred)),
                    'rmse': float(np.sqrt(mean_squared_error(y_test, y_pred))),
                    'mae': float(mean_absolute_error(y_test, y_pred))
                }
                primary_metric = metrics['r2']

            # Feature importance (if available)
            feature_importance = []
            if hasattr(model, 'feature_importances_'):
                importance = model.feature_importances_
                feature_importance = [
                    {'feature': X_train.columns[i], 'importance': float(importance[i])}
                    for i in np.argsort(importance)[::-1][:20]
                ]
            elif hasattr(model, 'coef_'):
                coef = model.coef_.flatten() if hasattr(model.coef_, 'flatten') else model.coef_
                if len(coef) == len(X_train.columns):
                    feature_importance = [
                        {'feature': X_train.columns[i], 'importance': float(abs(coef[i]))}
                        for i in np.argsort(np.abs(coef))[::-1][:20]
                    ]

            comparison_results.append({
                'model': name,
                'cv_mean': float(np.mean(cv_scores)),
                'cv_std': float(np.std(cv_scores)),
                'test_metrics': metrics,
                'primary_metric': primary_metric,
                'feature_importance': feature_importance,
                'trained_model': model
            })

            print(f"   ✓ {name}: CV={np.mean(cv_scores):.4f}±{np.std(cv_scores):.4f}, Test={primary_metric:.4f}")

        except Exception as e:
            print(f"   ✗ {name} failed: {e}")

    # Select best model
    if not comparison_results:
        raise ValueError("All models failed to train")

    comparison_results.sort(key=lambda x: x['primary_metric'], reverse=True)
    best_model = comparison_results[0]

    print(f"🏆 [Model Comparison] Best model: {best_model['model']} (score: {best_model['primary_metric']:.4f})")

    return {
        'comparison': [{k: v for k, v in r.items() if k != 'trained_model'} for r in comparison_results],
        'best_model': best_model['model'],
        'best_score': best_model['primary_metric'],
        'best_metrics': best_model['test_metrics'],
        'feature_importance': best_model['feature_importance'],
        'trained_model': best_model['trained_model']
    }


# ============================================
# HYPERPARAMETER TUNING
# ============================================

def tune_hyperparameters(
    model_name: str,
    X_train: pd.DataFrame,
    y_train: pd.Series,
    problem_type: str,
    config: Dict
) -> Dict:
    """
    Perform hyperparameter tuning on the best model.
    """
    print(f"🔧 [Hyperparameter Tuning] Tuning {model_name}")

    param_grids = {
        'random_forest': {
            'n_estimators': [50, 100, 200],
            'max_depth': [5, 10, 20, None],
            'min_samples_split': [2, 5, 10]
        },
        'gradient_boosting': {
            'n_estimators': [50, 100, 150],
            'max_depth': [3, 5, 7],
            'learning_rate': [0.01, 0.1, 0.2]
        },
        'ridge': {
            'alpha': [0.1, 1.0, 10.0, 100.0]
        },
        'lasso': {
            'alpha': [0.01, 0.1, 1.0, 10.0]
        },
        'elastic_net': {
            'alpha': [0.1, 1.0, 10.0],
            'l1_ratio': [0.2, 0.5, 0.8]
        },
        'logistic_regression': {
            'C': [0.1, 1.0, 10.0],
            'penalty': ['l2']
        }
    }

    if model_name not in param_grids:
        return {'tuned': False, 'reason': 'No hyperparameter grid defined'}

    try:
        if problem_type == 'classification':
            if model_name == 'random_forest':
                base_model = RandomForestClassifier(random_state=42, n_jobs=-1)
            elif model_name == 'gradient_boosting':
                base_model = GradientBoostingClassifier(random_state=42)
            elif model_name == 'logistic_regression':
                base_model = LogisticRegression(max_iter=1000, random_state=42)
            else:
                return {'tuned': False, 'reason': 'Model not supported for tuning'}
            scoring = 'f1_weighted'
        else:
            if model_name == 'random_forest':
                base_model = RandomForestRegressor(random_state=42, n_jobs=-1)
            elif model_name == 'gradient_boosting':
                base_model = GradientBoostingRegressor(random_state=42)
            elif model_name in ['ridge', 'lasso', 'elastic_net']:
                base_model = {'ridge': Ridge(), 'lasso': Lasso(), 'elastic_net': ElasticNet()}[model_name]
            else:
                return {'tuned': False, 'reason': 'Model not supported for tuning'}
            scoring = 'r2'

        grid_search = GridSearchCV(
            base_model,
            param_grids[model_name],
            cv=3,
            scoring=scoring,
            n_jobs=-1
        )

        grid_search.fit(X_train, y_train)

        print(f"   Best params: {grid_search.best_params_}")
        print(f"   Best score: {grid_search.best_score_:.4f}")

        return {
            'tuned': True,
            'best_params': grid_search.best_params_,
            'best_score': float(grid_search.best_score_),
            'tuned_model': grid_search.best_estimator_
        }

    except Exception as e:
        print(f"   ⚠️ Tuning failed: {e}")
        return {'tuned': False, 'reason': str(e)}


# ============================================
# MAIN PIPELINE
# ============================================

def run_enhanced_ml_pipeline(config: Dict) -> Dict:
    """
    Run the complete enhanced ML pipeline.
    """
    print("=" * 60)
    print("🚀 Enhanced ML Pipeline Started")
    print("=" * 60)

    # Load data
    data_path = config['data_path']
    df = pd.read_json(data_path)
    print(f"📂 Loaded data: {df.shape[0]} rows, {df.shape[1]} columns")

    # Check for pre-embedded features
    embedded_cols = [col for col in df.columns if '_emb_' in col]
    if embedded_cols:
        print(f"🧠 Found {len(embedded_cols)} pre-embedded feature columns")

    # Detect target variable
    target_col, problem_type = detect_target_variable(df, config)
    print(f"🎯 Target: {target_col}, Problem type: {problem_type}")

    # Prepare features and target
    y = df[target_col].copy()
    X = df.drop(columns=[target_col])

    # Handle categorical target for classification
    label_encoder = None
    if problem_type == 'classification' and y.dtype == 'object':
        label_encoder = LabelEncoder()
        y = pd.Series(label_encoder.fit_transform(y), name=target_col)

    # Select only numeric columns (including embeddings)
    X_numeric = X.select_dtypes(include=[np.number])

    if X_numeric.shape[1] == 0:
        return {
            'success': False,
            'error': 'No numeric features available. Ensure data is pre-processed with embeddings.'
        }

    print(f"📊 Feature matrix: {X_numeric.shape[0]} rows, {X_numeric.shape[1]} numeric features")

    # Handle missing values
    X_numeric = X_numeric.fillna(X_numeric.median())
    y = y.fillna(y.median() if problem_type == 'regression' else y.mode()[0])

    # Feature selection
    X_selected, selected_features, selection_report = select_features(
        X_numeric, y, problem_type, config
    )

    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X_selected, y, test_size=0.2, random_state=42,
        stratify=y if problem_type == 'classification' and y.nunique() < 50 else None
    )

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = pd.DataFrame(
        scaler.fit_transform(X_train),
        columns=X_train.columns
    )
    X_test_scaled = pd.DataFrame(
        scaler.transform(X_test),
        columns=X_test.columns
    )

    # Model comparison
    comparison_result = compare_models(
        X_train_scaled, X_test_scaled, y_train, y_test, problem_type, config
    )

    # Hyperparameter tuning (optional)
    tuning_result = {'tuned': False}
    if config.get('enable_tuning', True):
        tuning_result = tune_hyperparameters(
            comparison_result['best_model'],
            X_train_scaled, y_train,
            problem_type, config
        )

    # Final model evaluation
    final_model = tuning_result.get('tuned_model', comparison_result['trained_model'])
    y_pred = final_model.predict(X_test_scaled)

    if problem_type == 'classification':
        final_metrics = {
            'accuracy': float(accuracy_score(y_test, y_pred)),
            'precision': float(precision_score(y_test, y_pred, average='weighted', zero_division=0)),
            'recall': float(recall_score(y_test, y_pred, average='weighted', zero_division=0)),
            'f1': float(f1_score(y_test, y_pred, average='weighted', zero_division=0)),
            'confusion_matrix': confusion_matrix(y_test, y_pred).tolist()
        }

        # Classification report
        if label_encoder:
            class_names = label_encoder.classes_.tolist()
        else:
            class_names = sorted(y.unique().tolist())
        final_metrics['classification_report'] = classification_report(
            y_test, y_pred, target_names=[str(c) for c in class_names], output_dict=True, zero_division=0
        )

    else:  # regression
        final_metrics = {
            'r2': float(r2_score(y_test, y_pred)),
            'rmse': float(np.sqrt(mean_squared_error(y_test, y_pred))),
            'mae': float(mean_absolute_error(y_test, y_pred)),
            'mape': float(np.mean(np.abs((y_test - y_pred) / (y_test + 1e-10))) * 100)
        }

    print("=" * 60)
    print("✅ Enhanced ML Pipeline Complete")
    print("=" * 60)

    return {
        'success': True,
        'problem_type': problem_type,
        'target_column': target_col,
        'best_model': comparison_result['best_model'],
        'final_metrics': final_metrics,
        'feature_selection': selection_report,
        'model_comparison': comparison_result['comparison'],
        'hyperparameter_tuning': {k: v for k, v in tuning_result.items() if k != 'tuned_model'},
        'feature_importance': comparison_result['feature_importance'],
        'data_summary': {
            'total_rows': df.shape[0],
            'original_features': df.shape[1] - 1,
            'selected_features': len(selected_features),
            'embedded_features': len(embedded_cols),
            'train_size': len(X_train),
            'test_size': len(X_test)
        }
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python enhanced_ml_pipeline.py '<config_json>'")
        sys.exit(1)

    try:
        config = json.loads(sys.argv[1])
        result = run_enhanced_ml_pipeline(config)
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e)
        }))
        sys.exit(1)
