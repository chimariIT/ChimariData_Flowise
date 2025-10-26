#!/usr/bin/env python3
"""
Classification Analysis Script
Uses scikit-learn for classification with comprehensive metrics
"""

import json
import sys
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import GaussianNB
from sklearn.svm import SVC
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report, roc_auc_score
)
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import LabelEncoder
import warnings
warnings.filterwarnings('ignore')


def perform_classification_analysis(config):
    """Perform comprehensive classification analysis"""
    try:
        # Load data
        data_path = config['data_path']
        data = pd.read_json(data_path)

        target_column = config.get('target_column')
        model_type = config.get('model_type', 'random_forest')

        # Auto-detect target if not provided
        if not target_column:
            # Look for columns with few unique values (likely categorical)
            for col in data.columns:
                if len(data[col].unique()) < 20:
                    target_column = col
                    break

        if not target_column or target_column not in data.columns:
            return {
                'success': False,
                'error': 'No suitable target column found or specified'
            }

        # Prepare features and target
        X = data.drop(columns=[target_column])
        y = data[target_column]

        # Handle categorical variables in features
        X = pd.get_dummies(X, drop_first=True)

        # Encode target if categorical
        le = None
        if y.dtype == 'object':
            le = LabelEncoder()
            y = le.fit_transform(y)
            class_names = le.classes_.tolist()
        else:
            class_names = [str(i) for i in sorted(y.unique())]

        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y if len(np.unique(y)) > 1 else None
        )

        # Select and train model
        if model_type == 'random_forest':
            model = RandomForestClassifier(n_estimators=100, random_state=42)
        elif model_type == 'decision_tree':
            model = DecisionTreeClassifier(random_state=42)
        elif model_type == 'logistic_regression':
            model = LogisticRegression(max_iter=1000, random_state=42)
        elif model_type == 'naive_bayes':
            model = GaussianNB()
        elif model_type == 'svm':
            model = SVC(probability=True, random_state=42)
        else:
            model = RandomForestClassifier(n_estimators=100, random_state=42)

        model.fit(X_train, y_train)

        # Predictions
        y_pred = model.predict(X_test)
        y_pred_proba = model.predict_proba(X_test) if hasattr(model, 'predict_proba') else None

        # Calculate metrics
        accuracy = accuracy_score(y_test, y_pred)

        # Handle binary vs multiclass
        n_classes = len(np.unique(y))
        average_method = 'binary' if n_classes == 2 else 'weighted'

        precision = precision_score(y_test, y_pred, average=average_method, zero_division=0)
        recall = recall_score(y_test, y_pred, average=average_method, zero_division=0)
        f1 = f1_score(y_test, y_pred, average=average_method, zero_division=0)

        # Confusion matrix
        cm = confusion_matrix(y_test, y_pred)
        cm_dict = {
            'matrix': cm.tolist(),
            'labels': class_names
        }

        # Classification report
        report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)

        # ROC AUC (for binary classification)
        roc_auc = None
        if n_classes == 2 and y_pred_proba is not None:
            try:
                roc_auc = float(roc_auc_score(y_test, y_pred_proba[:, 1]))
            except:
                pass

        # Cross-validation
        cv_scores = cross_val_score(model, X, y, cv=5, scoring='accuracy')

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

        # Sample predictions
        predictions = []
        for i in range(min(50, len(y_test))):
            pred_dict = {
                'actual': int(y_test.iloc[i]),
                'predicted': int(y_pred[i]),
                'actual_label': class_names[y_test.iloc[i]],
                'predicted_label': class_names[y_pred[i]],
                'correct': bool(y_test.iloc[i] == y_pred[i])
            }

            if y_pred_proba is not None:
                pred_dict['probabilities'] = {
                    class_names[j]: float(y_pred_proba[i][j])
                    for j in range(len(class_names))
                }

            predictions.append(pred_dict)

        return {
            'success': True,
            'model_type': model_type,
            'n_classes': n_classes,
            'class_names': class_names,
            'metrics': {
                'accuracy': float(accuracy),
                'precision': float(precision),
                'recall': float(recall),
                'f1_score': float(f1),
                'roc_auc': roc_auc
            },
            'confusion_matrix': cm_dict,
            'classification_report': report,
            'cross_validation': {
                'mean_accuracy': float(cv_scores.mean()),
                'std_accuracy': float(cv_scores.std()),
                'scores': cv_scores.tolist()
            },
            'feature_importance': feature_importance,
            'predictions': predictions,
            'train_size': len(X_train),
            'test_size': len(X_test)
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
            'error': 'Usage: python3 classification_analysis.py <config_json>'
        }))
        sys.exit(1)

    try:
        config = json.loads(sys.argv[1])
        result = perform_classification_analysis(config)
        print(json.dumps(result))
        sys.exit(0 if result.get('success') else 1)
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': f'Configuration error: {str(e)}'
        }))
        sys.exit(1)
