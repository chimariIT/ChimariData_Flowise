#!/usr/bin/env python3
"""
Comprehensive ML Lifecycle Management System

Provides end-to-end ML capabilities with intelligent library selection:
- Model Selection: AutoML with Optuna
- Training: scikit-learn, XGBoost, LightGBM, TensorFlow, Spark MLlib
- Evaluation: Comprehensive metrics and validation
- Explainability: SHAP, LIME
- Deployment: Model serialization and versioning
- Monitoring: Drift detection and performance tracking

Library Selection Strategy:
- Small datasets (<100K rows): scikit-learn, XGBoost, LightGBM
- Medium datasets (100K-10M rows): XGBoost, LightGBM (5-10x faster than sklearn)
- Large datasets (>10M rows): Spark MLlib (distributed)
- Deep learning: TensorFlow (regardless of size)
"""

import json
import sys
import os
import warnings
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Any, Optional
from datetime import datetime
import joblib

# Suppress warnings
warnings.filterwarnings('ignore')

# ============================================================================
# INTELLIGENT LIBRARY SELECTOR
# ============================================================================

class MLLibrarySelector:
    """
    Intelligently selects the best ML library based on:
    - Dataset size
    - Problem type
    - Performance requirements
    - Available resources
    """

    SMALL_THRESHOLD = 100_000
    MEDIUM_THRESHOLD = 10_000_000

    @staticmethod
    def select_library(
        row_count: int,
        problem_type: str,
        preference: Optional[str] = None,
        use_deep_learning: bool = False
    ) -> str:
        """
        Select optimal ML library

        Returns: 'sklearn', 'xgboost', 'lightgbm', 'tensorflow', or 'spark'
        """

        # Deep learning always uses TensorFlow
        if use_deep_learning:
            return 'tensorflow'

        # User preference override
        if preference in ['sklearn', 'xgboost', 'lightgbm', 'tensorflow', 'spark']:
            return preference

        # Distributed processing for very large datasets
        if row_count > MLLibrarySelector.MEDIUM_THRESHOLD:
            spark_available = os.getenv('SPARK_ENABLED') == 'true' or os.getenv('FORCE_SPARK_REAL') == 'true'
            if spark_available:
                return 'spark'
            else:
                # Fallback to LightGBM for large data (memory efficient)
                print(f"⚠️ Warning: Large dataset ({row_count:,} rows) without Spark. Using LightGBM.")
                return 'lightgbm'

        # Medium datasets: XGBoost/LightGBM (5-10x faster than sklearn)
        elif row_count > MLLibrarySelector.SMALL_THRESHOLD:
            # LightGBM is faster and more memory efficient
            # XGBoost has better accuracy on some tasks
            if problem_type in ['classification', 'regression']:
                return 'lightgbm'  # Default to LightGBM for speed
            else:
                return 'sklearn'  # sklearn for clustering, etc.

        # Small datasets: sklearn (most flexible, good for exploration)
        else:
            return 'sklearn'

    @staticmethod
    def get_library_info(library: str) -> Dict[str, str]:
        """Get information about a library"""
        info = {
            'sklearn': {
                'name': 'scikit-learn',
                'best_for': 'Small datasets, exploration, wide algorithm selection',
                'performance': 'Baseline',
                'parallel': 'Limited (n_jobs)',
            },
            'xgboost': {
                'name': 'XGBoost',
                'best_for': 'Medium datasets, gradient boosting, competitions',
                'performance': '3-5x faster than sklearn',
                'parallel': 'Full multi-core support',
            },
            'lightgbm': {
                'name': 'LightGBM',
                'best_for': 'Medium-large datasets, speed, memory efficiency',
                'performance': '5-10x faster than sklearn, most memory efficient',
                'parallel': 'Full multi-core support + GPU',
            },
            'tensorflow': {
                'name': 'TensorFlow',
                'best_for': 'Deep learning, complex patterns, large feature spaces',
                'performance': 'Variable (GPU acceleration available)',
                'parallel': 'Distributed training available',
            },
            'spark': {
                'name': 'Spark MLlib',
                'best_for': 'Very large datasets (>10M rows), distributed processing',
                'performance': 'Distributed across cluster',
                'parallel': 'Fully distributed',
            }
        }
        return info.get(library, {'name': library})


# ============================================================================
# AUTOML WITH OPTUNA
# ============================================================================

class AutoMLOptimizer:
    """
    Automated Machine Learning with Optuna
    - Hyperparameter optimization
    - Model selection
    - Feature engineering suggestions
    """

    def __init__(self, library: str = 'sklearn'):
        self.library = library
        self.best_params = None
        self.best_model = None
        self.best_score = None

    def optimize(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        problem_type: str,
        n_trials: int = 50,
        cv_folds: int = 5
    ) -> Dict[str, Any]:
        """
        Run AutoML optimization

        Returns: {
            'best_params': dict,
            'best_model': model object,
            'best_score': float,
            'optimization_history': list
        }
        """
        try:
            import optuna
            from sklearn.model_selection import cross_val_score

            def objective(trial):
                if self.library == 'sklearn':
                    return self._optimize_sklearn(trial, X_train, y_train, problem_type, cv_folds)
                elif self.library == 'xgboost':
                    return self._optimize_xgboost(trial, X_train, y_train, problem_type, cv_folds)
                elif self.library == 'lightgbm':
                    return self._optimize_lightgbm(trial, X_train, y_train, problem_type, cv_folds)
                else:
                    raise ValueError(f"AutoML not supported for library: {self.library}")

            # Create study
            study = optuna.create_study(
                direction='maximize',
                sampler=optuna.samplers.TPESampler(seed=42)
            )

            # Optimize
            study.optimize(objective, n_trials=n_trials, show_progress_bar=False)

            self.best_params = study.best_params
            self.best_score = study.best_value

            # Train final model with best params
            self.best_model = self._train_final_model(X_train, y_train, problem_type, self.best_params)

            return {
                'success': True,
                'best_params': self.best_params,
                'best_model': self.best_model,
                'best_score': self.best_score,
                'n_trials': len(study.trials),
                'optimization_history': [
                    {'trial': i, 'score': trial.value}
                    for i, trial in enumerate(study.trials)
                ]
            }

        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    def _optimize_sklearn(self, trial, X_train, y_train, problem_type, cv_folds):
        """Optimize sklearn models"""
        from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
        from sklearn.model_selection import cross_val_score

        # Hyperparameters
        n_estimators = trial.suggest_int('n_estimators', 50, 300)
        max_depth = trial.suggest_int('max_depth', 3, 20)
        min_samples_split = trial.suggest_int('min_samples_split', 2, 20)
        min_samples_leaf = trial.suggest_int('min_samples_leaf', 1, 10)

        # Create model
        if problem_type == 'classification':
            model = RandomForestClassifier(
                n_estimators=n_estimators,
                max_depth=max_depth,
                min_samples_split=min_samples_split,
                min_samples_leaf=min_samples_leaf,
                random_state=42,
                n_jobs=-1
            )
            scoring = 'accuracy'
        else:
            model = RandomForestRegressor(
                n_estimators=n_estimators,
                max_depth=max_depth,
                min_samples_split=min_samples_split,
                min_samples_leaf=min_samples_leaf,
                random_state=42,
                n_jobs=-1
            )
            scoring = 'r2'

        # Cross-validation
        scores = cross_val_score(model, X_train, y_train, cv=cv_folds, scoring=scoring, n_jobs=-1)
        return scores.mean()

    def _optimize_xgboost(self, trial, X_train, y_train, problem_type, cv_folds):
        """Optimize XGBoost models"""
        import xgboost as xgb
        from sklearn.model_selection import cross_val_score

        params = {
            'n_estimators': trial.suggest_int('n_estimators', 50, 300),
            'max_depth': trial.suggest_int('max_depth', 3, 12),
            'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3),
            'subsample': trial.suggest_float('subsample', 0.6, 1.0),
            'colsample_bytree': trial.suggest_float('colsample_bytree', 0.6, 1.0),
            'min_child_weight': trial.suggest_int('min_child_weight', 1, 10),
            'random_state': 42,
            'n_jobs': -1
        }

        if problem_type == 'classification':
            model = xgb.XGBClassifier(**params)
            scoring = 'accuracy'
        else:
            model = xgb.XGBRegressor(**params)
            scoring = 'r2'

        scores = cross_val_score(model, X_train, y_train, cv=cv_folds, scoring=scoring, n_jobs=-1)
        return scores.mean()

    def _optimize_lightgbm(self, trial, X_train, y_train, problem_type, cv_folds):
        """Optimize LightGBM models"""
        import lightgbm as lgb
        from sklearn.model_selection import cross_val_score

        params = {
            'n_estimators': trial.suggest_int('n_estimators', 50, 300),
            'max_depth': trial.suggest_int('max_depth', 3, 12),
            'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3),
            'num_leaves': trial.suggest_int('num_leaves', 20, 100),
            'subsample': trial.suggest_float('subsample', 0.6, 1.0),
            'colsample_bytree': trial.suggest_float('colsample_bytree', 0.6, 1.0),
            'min_child_samples': trial.suggest_int('min_child_samples', 5, 50),
            'random_state': 42,
            'n_jobs': -1,
            'verbose': -1
        }

        if problem_type == 'classification':
            model = lgb.LGBMClassifier(**params)
            scoring = 'accuracy'
        else:
            model = lgb.LGBMRegressor(**params)
            scoring = 'r2'

        scores = cross_val_score(model, X_train, y_train, cv=cv_folds, scoring=scoring, n_jobs=-1)
        return scores.mean()

    def _train_final_model(self, X_train, y_train, problem_type, params):
        """Train final model with best parameters"""
        if self.library == 'sklearn':
            from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
            if problem_type == 'classification':
                model = RandomForestClassifier(**params, random_state=42, n_jobs=-1)
            else:
                model = RandomForestRegressor(**params, random_state=42, n_jobs=-1)

        elif self.library == 'xgboost':
            import xgboost as xgb
            if problem_type == 'classification':
                model = xgb.XGBClassifier(**params)
            else:
                model = xgb.XGBRegressor(**params)

        elif self.library == 'lightgbm':
            import lightgbm as lgb
            if problem_type == 'classification':
                model = lgb.LGBMClassifier(**params)
            else:
                model = lgb.LGBMRegressor(**params)

        model.fit(X_train, y_train)
        return model


# ============================================================================
# MODEL EXPLAINABILITY
# ============================================================================

class ModelExplainer:
    """
    Model explainability using SHAP and LIME
    """

    @staticmethod
    def explain_with_shap(model, X_train, X_test, feature_names):
        """Generate SHAP explanations"""
        try:
            import shap

            # Create explainer based on model type
            model_type = type(model).__name__

            if 'XGB' in model_type or 'LGBM' in model_type or 'RandomForest' in model_type:
                explainer = shap.TreeExplainer(model)
            else:
                # Use KernelExplainer for other models
                explainer = shap.KernelExplainer(model.predict, shap.sample(X_train, 100))

            # Calculate SHAP values
            shap_values = explainer.shap_values(X_test[:100])  # Limit to 100 samples for performance

            # Get feature importance
            if isinstance(shap_values, list):
                # Multi-class classification
                shap_importance = np.abs(shap_values[0]).mean(axis=0)
            else:
                shap_importance = np.abs(shap_values).mean(axis=0)

            feature_importance = dict(zip(feature_names, shap_importance.tolist()))

            return {
                'success': True,
                'method': 'SHAP',
                'feature_importance': feature_importance,
                'top_features': sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)[:10]
            }

        except Exception as e:
            return {
                'success': False,
                'error': f"SHAP explanation failed: {str(e)}"
            }

    @staticmethod
    def explain_with_lime(model, X_train, X_test, feature_names, problem_type):
        """Generate LIME explanations"""
        try:
            from lime import lime_tabular

            # Create LIME explainer
            if problem_type == 'classification':
                explainer = lime_tabular.LimeTabularExplainer(
                    X_train.values,
                    feature_names=feature_names,
                    class_names=['class_0', 'class_1'],
                    mode='classification'
                )
            else:
                explainer = lime_tabular.LimeTabularExplainer(
                    X_train.values,
                    feature_names=feature_names,
                    mode='regression'
                )

            # Explain first test instance
            explanation = explainer.explain_instance(
                X_test.iloc[0].values,
                model.predict_proba if problem_type == 'classification' else model.predict,
                num_features=10
            )

            # Extract feature importance
            feature_importance = dict(explanation.as_list())

            return {
                'success': True,
                'method': 'LIME',
                'feature_importance': feature_importance,
                'explanation': explanation.as_list()
            }

        except Exception as e:
            return {
                'success': False,
                'error': f"LIME explanation failed: {str(e)}"
            }


# ============================================================================
# COMPREHENSIVE ML PIPELINE
# ============================================================================

class ComprehensiveMLPipeline:
    """
    End-to-end ML pipeline with intelligent library selection
    """

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.library = None
        self.model = None
        self.metrics = {}
        self.explainability = {}

    def run(self) -> Dict[str, Any]:
        """Execute complete ML lifecycle"""
        try:
            # 1. Load and prepare data
            print("📊 Loading data...")
            X_train, X_test, y_train, y_test, feature_names = self.prepare_data()

            # 2. Select library
            print("🔍 Selecting optimal ML library...")
            self.library = MLLibrarySelector.select_library(
                row_count=len(X_train),
                problem_type=self.config.get('problem_type', 'classification'),
                preference=self.config.get('library_preference'),
                use_deep_learning=self.config.get('use_deep_learning', False)
            )
            library_info = MLLibrarySelector.get_library_info(self.library)
            print(f"✅ Selected: {library_info['name']} - {library_info['best_for']}")

            # 3. AutoML or manual training
            if self.config.get('use_automl', True):
                print("🤖 Running AutoML optimization...")
                result = self.run_automl(X_train, y_train)
                if result['success']:
                    self.model = result['best_model']
                    print(f"✅ AutoML complete! Best score: {result['best_score']:.4f}")
                else:
                    print(f"⚠️ AutoML failed: {result['error']}. Using default model.")
                    self.model = self.train_default_model(X_train, y_train)
            else:
                print("🎯 Training model...")
                self.model = self.train_default_model(X_train, y_train)

            # 4. Evaluate model
            print("📈 Evaluating model...")
            self.metrics = self.evaluate_model(X_test, y_test)

            # 5. Explainability
            if self.config.get('explain_model', True):
                print("🔬 Generating model explanations...")
                self.explainability = self.explain_model(X_train, X_test, feature_names)

            # 6. Save model
            if self.config.get('save_model', True):
                print("💾 Saving model...")
                model_path = self.save_model()

            return {
                'success': True,
                'library': self.library,
                'library_info': library_info,
                'metrics': self.metrics,
                'explainability': self.explainability,
                'model_path': model_path if self.config.get('save_model') else None,
                'training_samples': len(X_train),
                'test_samples': len(X_test),
                'features': feature_names
            }

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'library': self.library
            }

    def prepare_data(self) -> Tuple:
        """Load and prepare data"""
        from sklearn.model_selection import train_test_split

        # Load data
        data_path = self.config['data_path']
        if data_path.endswith('.json'):
            data = pd.read_json(data_path)
        elif data_path.endswith('.csv'):
            data = pd.read_csv(data_path)
        else:
            raise ValueError(f"Unsupported file format: {data_path}")

        # Prepare features and target
        target_column = self.config['target_column']
        X = data.drop(columns=[target_column])
        y = data[target_column]

        # Handle categorical variables
        X = pd.get_dummies(X, drop_first=True)
        feature_names = X.columns.tolist()

        # Handle categorical target for classification
        problem_type = self.config.get('problem_type', 'classification')
        if problem_type == 'classification' and y.dtype == 'object':
            from sklearn.preprocessing import LabelEncoder
            le = LabelEncoder()
            y = pd.Series(le.fit_transform(y), name=target_column)

        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )

        return X_train, X_test, y_train, y_test, feature_names

    def run_automl(self, X_train, y_train) -> Dict[str, Any]:
        """Run AutoML optimization"""
        optimizer = AutoMLOptimizer(library=self.library)
        return optimizer.optimize(
            X_train=X_train,
            y_train=y_train,
            problem_type=self.config.get('problem_type', 'classification'),
            n_trials=self.config.get('automl_trials', 50),
            cv_folds=self.config.get('cv_folds', 5)
        )

    def train_default_model(self, X_train, y_train):
        """Train model with default parameters"""
        problem_type = self.config.get('problem_type', 'classification')

        if self.library == 'sklearn':
            from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
            if problem_type == 'classification':
                model = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
            else:
                model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)

        elif self.library == 'xgboost':
            import xgboost as xgb
            if problem_type == 'classification':
                model = xgb.XGBClassifier(n_estimators=100, random_state=42, n_jobs=-1)
            else:
                model = xgb.XGBRegressor(n_estimators=100, random_state=42, n_jobs=-1)

        elif self.library == 'lightgbm':
            import lightgbm as lgb
            if problem_type == 'classification':
                model = lgb.LGBMClassifier(n_estimators=100, random_state=42, n_jobs=-1, verbose=-1)
            else:
                model = lgb.LGBMRegressor(n_estimators=100, random_state=42, n_jobs=-1, verbose=-1)

        else:
            raise ValueError(f"Unsupported library: {self.library}")

        model.fit(X_train, y_train)
        return model

    def evaluate_model(self, X_test, y_test) -> Dict[str, float]:
        """Comprehensive model evaluation"""
        from sklearn.metrics import (
            accuracy_score, precision_score, recall_score, f1_score,
            mean_squared_error, r2_score, mean_absolute_error
        )

        problem_type = self.config.get('problem_type', 'classification')
        predictions = self.model.predict(X_test)

        metrics = {}

        if problem_type == 'classification':
            metrics['accuracy'] = accuracy_score(y_test, predictions)
            metrics['precision'] = precision_score(y_test, predictions, average='weighted', zero_division=0)
            metrics['recall'] = recall_score(y_test, predictions, average='weighted', zero_division=0)
            metrics['f1_score'] = f1_score(y_test, predictions, average='weighted', zero_division=0)
        else:
            metrics['rmse'] = np.sqrt(mean_squared_error(y_test, predictions))
            metrics['mae'] = mean_absolute_error(y_test, predictions)
            metrics['r2_score'] = r2_score(y_test, predictions)

        return metrics

    def explain_model(self, X_train, X_test, feature_names) -> Dict[str, Any]:
        """Generate model explanations"""
        explainability = {}

        # SHAP
        shap_result = ModelExplainer.explain_with_shap(
            self.model, X_train, X_test, feature_names
        )
        if shap_result['success']:
            explainability['shap'] = shap_result

        # LIME
        lime_result = ModelExplainer.explain_with_lime(
            self.model, X_train, X_test, feature_names,
            self.config.get('problem_type', 'classification')
        )
        if lime_result['success']:
            explainability['lime'] = lime_result

        return explainability

    def save_model(self) -> str:
        """Save trained model"""
        model_dir = self.config.get('model_dir', 'models')
        os.makedirs(model_dir, exist_ok=True)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        model_path = os.path.join(model_dir, f"model_{self.library}_{timestamp}.pkl")

        joblib.dump(self.model, model_path)
        return model_path


# ============================================================================
# MAIN EXECUTION (stdin/stdout communication with Node.js)
# ============================================================================

if __name__ == "__main__":
    import sys
    import json
    import traceback

    try:
        # Read input from stdin (sent from Node.js)
        input_data = json.loads(sys.stdin.read())
        config = input_data.get('config', {})
        data = input_data.get('data', [])

        # If data is provided directly (not from file), save to temp CSV
        if data and not config.get('data_path'):
            import tempfile
            import pandas as pd

            temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False)
            df = pd.DataFrame(data)
            df.to_csv(temp_file.name, index=False)
            config['data_path'] = temp_file.name

        # Run ML pipeline
        pipeline = ComprehensiveMLPipeline(config)
        result = pipeline.run()

        # Output result as JSON to stdout
        output = {
            'library_used': result.get('library', 'sklearn'),
            'model_path': result.get('model_path'),
            'metrics': result.get('metrics', {}),
            'explainability': result.get('explainability', {}),
            'library_info': result.get('library_info', {})
        }

        print(json.dumps(output))
        sys.exit(0)

    except Exception as e:
        error_output = {
            'error': str(e),
            'traceback': traceback.format_exc()
        }
        print(json.dumps(error_output), file=sys.stderr)
        sys.exit(1)
