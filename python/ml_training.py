#!/usr/bin/env python3
"""
ML Model Training Script
Uses scikit-learn to train machine learning models with real metrics
"""

import json
import sys
import pandas as pd
import numpy as np
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression, LinearRegression
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    mean_squared_error, r2_score, mean_absolute_error
)
import warnings
warnings.filterwarnings('ignore')


def detect_problem_type(data, target_column):
    """Detect if this is a classification or regression problem"""
    target = data[target_column]

    # If target has very few unique values or is categorical, it's classification
    if target.dtype == 'object' or len(target.unique()) < 20:
        return 'classification'
    else:
        return 'regression'


def train_model(config):
    """Train ML model and return performance metrics"""
    try:
        # Load data
        data_path = config['data_path']
        data = pd.read_json(data_path)

        target_column = config['target_column']
        model_type = config.get('model_type', 'auto')
        cv_folds = config.get('cv_folds', 5)

        # Validate target column exists
        if target_column not in data.columns:
            return {
                'success': False,
                'error': f'Target column "{target_column}" not found in data'
            }

        # Detect problem type
        problem_type = detect_problem_type(data, target_column)

        # Prepare features and target
        X = data.drop(columns=[target_column])
        y = data[target_column]

        # Handle categorical variables in features
        X = pd.get_dummies(X, drop_first=True)

        # Handle categorical target for classification
        if problem_type == 'classification' and y.dtype == 'object':
            from sklearn.preprocessing import LabelEncoder
            le = LabelEncoder()
            y = le.fit_transform(y)
            class_names = le.classes_.tolist()
        else:
            class_names = None

        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )

        # Select model
        if model_type == 'auto':
            if problem_type == 'classification':
                model = RandomForestClassifier(n_estimators=100, random_state=42)
            else:
                model = RandomForestRegressor(n_estimators=100, random_state=42)
        elif model_type == 'random_forest':
            if problem_type == 'classification':
                model = RandomForestClassifier(n_estimators=100, random_state=42)
            else:
                model = RandomForestRegressor(n_estimators=100, random_state=42)
        elif model_type == 'logistic_regression':
            model = LogisticRegression(max_iter=1000, random_state=42)
        elif model_type == 'linear_regression':
            model = LinearRegression()
        elif model_type == 'decision_tree':
            if problem_type == 'classification':
                model = DecisionTreeClassifier(random_state=42)
            else:
                model = DecisionTreeRegressor(random_state=42)
        elif model_type == 'gradient_boosting':
            model = GradientBoostingClassifier(random_state=42)
        else:
            # Default to random forest
            if problem_type == 'classification':
                model = RandomForestClassifier(n_estimators=100, random_state=42)
            else:
                model = RandomForestRegressor(n_estimators=100, random_state=42)

        # Train model
        model.fit(X_train, y_train)

        # Make predictions
        y_pred = model.predict(X_test)

        # Calculate metrics based on problem type
        if problem_type == 'classification':
            accuracy = accuracy_score(y_test, y_pred)

            # Handle binary vs multiclass
            average_method = 'binary' if len(np.unique(y)) == 2 else 'weighted'

            precision = precision_score(y_test, y_pred, average=average_method, zero_division=0)
            recall = recall_score(y_test, y_pred, average=average_method, zero_division=0)
            f1 = f1_score(y_test, y_pred, average=average_method, zero_division=0)

            performance = {
                'accuracy': float(accuracy),
                'precision': float(precision),
                'recall': float(recall),
                'f1_score': float(f1)
            }
        else:
            mse = mean_squared_error(y_test, y_pred)
            rmse = np.sqrt(mse)
            mae = mean_absolute_error(y_test, y_pred)
            r2 = r2_score(y_test, y_pred)

            performance = {
                'mse': float(mse),
                'rmse': float(rmse),
                'mae': float(mae),
                'r2': float(r2)
            }

        # Cross-validation
        if cv_folds > 1:
            cv_scores = cross_val_score(
                model, X, y,
                cv=cv_folds,
                scoring='accuracy' if problem_type == 'classification' else 'r2'
            )
            cv_results = {
                'mean': float(cv_scores.mean()),
                'std': float(cv_scores.std()),
                'scores': cv_scores.tolist()
            }
        else:
            cv_results = None

        # Feature importance
        if hasattr(model, 'feature_importances_'):
            feature_importance = dict(zip(
                X.columns.tolist(),
                model.feature_importances_.tolist()
            ))
            # Sort by importance
            feature_importance = dict(
                sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)
            )
        else:
            feature_importance = {}

        # Predictions for output
        predictions = [
            {
                'actual': float(y_test.iloc[i]) if problem_type == 'regression' else int(y_test.iloc[i]),
                'predicted': float(y_pred[i]) if problem_type == 'regression' else int(y_pred[i])
            }
            for i in range(min(100, len(y_test)))  # Limit to 100 predictions
        ]

        return {
            'success': True,
            'modelType': model_type if model_type != 'auto' else 'random_forest',
            'problemType': problem_type,
            'performance': performance,
            'hyperparameters': model.get_params(),
            'predictions': predictions,
            'featureImportance': feature_importance,
            'cvResults': cv_results,
            'classNames': class_names,
            'trainSize': len(X_train),
            'testSize': len(X_test)
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python3 ml_training.py <config_json>'
        }))
        sys.exit(1)

    try:
        config = json.loads(sys.argv[1])
        result = train_model(config)
        print(json.dumps(result))
        sys.exit(0 if result.get('success') else 1)
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': f'Configuration error: {str(e)}'
        }))
        sys.exit(1)
