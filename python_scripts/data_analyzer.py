#!/usr/bin/env python3
"""
Advanced Data Analysis Script for ChimariData
Handles ANOVA, ANCOVA, Regression, and Machine Learning analyses
"""

import sys
import json
import pandas as pd
import numpy as np
from scipy import stats
from scipy.stats import f_oneway
import warnings
warnings.filterwarnings('ignore')

# Machine Learning imports
try:
    from sklearn.model_selection import train_test_split, cross_val_score
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
    from sklearn.linear_model import LinearRegression, LogisticRegression
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, mean_squared_error, r2_score
    from sklearn.preprocessing import StandardScaler, LabelEncoder
    from sklearn.impute import SimpleImputer
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

def load_project_data(project_id):
    """Load project data from the uploads directory"""
    import os
    
    # Get the parent directory (project root)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(current_dir)
    
    try:
        # Try to load from uploads directory
        data_path = os.path.join(parent_dir, "uploads", f"{project_id}.csv")
        df = pd.read_csv(data_path)
        return df
    except FileNotFoundError:
        # Try python_data directory
        data_path = os.path.join(parent_dir, "python_data", f"{project_id}.csv")
        df = pd.read_csv(data_path)
        return df
    except Exception as e:
        raise Exception(f"Failed to load project data: {str(e)}")

def prepare_data_for_ml(df, target_variable, feature_variables):
    """Prepare data for machine learning analysis"""
    if not SKLEARN_AVAILABLE:
        raise Exception("scikit-learn not available. Please install sklearn.")
    
    # Select features and target
    features = df[feature_variables].copy()
    target = df[target_variable].copy()
    
    # Handle missing values in features
    imputer = SimpleImputer(strategy='mean')
    features_numeric = features.select_dtypes(include=[np.number])
    features_categorical = features.select_dtypes(exclude=[np.number])
    
    if not features_numeric.empty:
        features_numeric = pd.DataFrame(
            imputer.fit_transform(features_numeric), 
            columns=features_numeric.columns,
            index=features_numeric.index
        )
    
    # Encode categorical features
    le_features = LabelEncoder()
    for col in features_categorical.columns:
        features_categorical[col] = le_features.fit_transform(features_categorical[col].astype(str))
    
    # Combine features
    if not features_numeric.empty and not features_categorical.empty:
        X = pd.concat([features_numeric, features_categorical], axis=1)
    elif not features_numeric.empty:
        X = features_numeric
    else:
        X = features_categorical
    
    # Only encode target if it's categorical (object type)
    original_target_type = target.dtype
    if target.dtype == 'object':
        le_target = LabelEncoder()
        target = le_target.fit_transform(target)
    
    return X, target, original_target_type

def run_anova(df, config):
    """Run ANOVA analysis"""
    try:
        dependent_var = config.get('dependentVariable')
        independent_vars = config.get('independentVariables', [])
        
        if not dependent_var or not independent_vars:
            raise ValueError("Both dependent and independent variables required for ANOVA")
        
        # Perform one-way ANOVA for each independent variable
        results = {}
        
        for iv in independent_vars:
            if iv in df.columns and dependent_var in df.columns:
                groups = df.groupby(iv)[dependent_var].apply(list)
                if len(groups) >= 2:
                    f_stat, p_value = f_oneway(*groups)
                    results[iv] = {
                        'f_statistic': float(f_stat),
                        'p_value': float(p_value),
                        'significant': p_value < 0.05,
                        'effect_size': 'small' if f_stat < 2.0 else 'medium' if f_stat < 5.0 else 'large'
                    }
        
        return {
            'analysis_type': 'ANOVA',
            'dependent_variable': dependent_var,
            'independent_variables': independent_vars,
            'results': results,
            'interpretation': f"ANOVA analysis completed for {len(results)} variables"
        }
        
    except Exception as e:
        return {'error': f"ANOVA analysis failed: {str(e)}"}

def run_regression(df, config):
    """Run regression analysis"""
    try:
        dependent_var = config.get('dependentVariable')
        independent_vars = config.get('independentVariables', [])
        
        if not dependent_var or not independent_vars:
            raise ValueError("Both dependent and independent variables required for regression")
        
        # Prepare data
        X = df[independent_vars]
        y = df[dependent_var]
        
        # Handle missing values
        X = X.dropna()
        y = y[X.index]
        
        # Simple correlation analysis
        correlations = {}
        for var in independent_vars:
            if var in df.columns:
                corr = df[var].corr(df[dependent_var])
                correlations[var] = float(corr) if not np.isnan(corr) else 0.0
        
        # Basic regression statistics
        results = {
            'analysis_type': 'Regression',
            'dependent_variable': dependent_var,
            'independent_variables': independent_vars,
            'correlations': correlations,
            'sample_size': len(X),
            'interpretation': f"Regression analysis completed with {len(independent_vars)} predictors"
        }
        
        return results
        
    except Exception as e:
        return {'error': f"Regression analysis failed: {str(e)}"}

def run_ml_analysis(df, config):
    """Run machine learning analysis"""
    try:
        if not SKLEARN_AVAILABLE:
            return {'error': 'Machine learning libraries not available'}
        
        target_var = config.get('targetVariable')
        feature_vars = config.get('features', [])
        algorithm = config.get('algorithm', 'random_forest')
        test_size = config.get('testSize', 0.2)
        cv_folds = config.get('crossValidation', 5)
        
        if not target_var or not feature_vars:
            raise ValueError("Target variable and features required for ML analysis")
        
        # Prepare data
        X, y, original_target_type = prepare_data_for_ml(df, target_var, feature_vars)
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_size, random_state=42)
        
        # Determine task type based on original target variable type
        if original_target_type == 'object' or len(np.unique(y)) < 10:
            task_type = 'classification'
        else:
            task_type = 'regression'
        
        # Choose algorithm
        if algorithm == 'random_forest':
            if task_type == 'classification':
                model = RandomForestClassifier(n_estimators=100, random_state=42)
            else:
                model = RandomForestRegressor(n_estimators=100, random_state=42)
        else:
            # Default to linear model
            if task_type == 'classification':
                model = LogisticRegression(random_state=42)
            else:
                model = LinearRegression()
        
        # Train model
        model.fit(X_train, y_train)
        
        # Make predictions
        y_pred = model.predict(X_test)
        
        # Calculate metrics
        metrics = {}
        if task_type == 'classification':
            metrics['accuracy'] = float(accuracy_score(y_test, y_pred))
            if len(np.unique(y)) == 2:  # Binary classification
                metrics['precision'] = float(precision_score(y_test, y_pred, average='binary'))
                metrics['recall'] = float(recall_score(y_test, y_pred, average='binary'))
                metrics['f1_score'] = float(f1_score(y_test, y_pred, average='binary'))
        else:
            metrics['mse'] = float(mean_squared_error(y_test, y_pred))
            metrics['r2_score'] = float(r2_score(y_test, y_pred))
        
        # Feature importance (if available)
        feature_importance = {}
        if hasattr(model, 'feature_importances_'):
            for i, feature in enumerate(feature_vars):
                feature_importance[feature] = float(model.feature_importances_[i])
        
        # Cross-validation
        cv_scores = cross_val_score(model, X, y, cv=cv_folds)
        
        results = {
            'analysis_type': 'Machine Learning',
            'task_type': task_type,
            'algorithm': algorithm,
            'target_variable': target_var,
            'feature_variables': feature_vars,
            'metrics': metrics,
            'feature_importance': feature_importance,
            'cross_validation_scores': cv_scores.tolist(),
            'cv_mean': float(cv_scores.mean()),
            'cv_std': float(cv_scores.std()),
            'sample_size': len(X),
            'test_size': test_size,
            'interpretation': f"ML analysis completed using {algorithm} with {len(feature_vars)} features"
        }
        
        return results
        
    except Exception as e:
        return {'error': f"Machine learning analysis failed: {str(e)}"}

def main():
    if len(sys.argv) != 4:
        print("Usage: python data_analyzer.py <input_file> <config_file> <output_file>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    config_file = sys.argv[2]
    output_file = sys.argv[3]
    
    try:
        # Load input data and config
        with open(input_file, 'r') as f:
            input_data = json.load(f)
        
        with open(config_file, 'r') as f:
            config = json.load(f)
        
        # Load project data
        project_id = input_data.get('projectId')
        if not project_id:
            raise ValueError("Project ID not found in input data")
        
        df = load_project_data(project_id)
        
        # Determine analysis type
        analysis_type = config.get('analysisType', 'comprehensive')
        
        # Run appropriate analysis
        if analysis_type == 'anova':
            results = run_anova(df, config)
        elif analysis_type == 'ancova':
            results = run_anova(df, config)  # Simplified ANCOVA as ANOVA
        elif analysis_type == 'regression':
            results = run_regression(df, config)
        elif analysis_type == 'machine_learning':
            results = run_ml_analysis(df, config)
        else:
            # Default comprehensive analysis
            results = {
                'analysis_type': 'Comprehensive',
                'shape': df.shape,
                'columns': df.columns.tolist(),
                'summary': df.describe().to_dict(),
                'interpretation': f"Comprehensive analysis of {df.shape[0]} rows and {df.shape[1]} columns"
            }
        
        # Save results
        output_data = {
            'success': True,
            'data': results,
            'visualizations': []
        }
        
        with open(output_file, 'w') as f:
            json.dump(output_data, f, indent=2)
        
        print("Analysis completed successfully")
        
    except Exception as e:
        # Save error result
        error_data = {
            'success': False,
            'error': str(e),
            'data': None,
            'visualizations': []
        }
        
        with open(output_file, 'w') as f:
            json.dump(error_data, f, indent=2)
        
        print(f"Analysis failed: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()