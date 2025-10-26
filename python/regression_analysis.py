#!/usr/bin/env python3
"""
Regression Analysis Script
Uses statsmodels and scikit-learn for comprehensive regression analysis
"""

import json
import sys
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error
from sklearn.model_selection import train_test_split
import warnings
warnings.filterwarnings('ignore')

try:
    import statsmodels.api as sm
    from statsmodels.stats.diagnostic import het_breuschpagan
    STATSMODELS_AVAILABLE = True
except ImportError:
    STATSMODELS_AVAILABLE = False


def perform_regression_analysis(config):
    """Perform comprehensive regression analysis"""
    try:
        # Load data
        data_path = config['data_path']
        data = pd.read_json(data_path)

        target_column = config.get('target_column')
        features = config.get('features')

        # Auto-detect target if not provided
        if not target_column:
            numeric_cols = data.select_dtypes(include=[np.number]).columns
            if len(numeric_cols) == 0:
                return {
                    'success': False,
                    'error': 'No numeric columns found for regression'
                }
            target_column = numeric_cols[-1]  # Use last numeric column as target

        if target_column not in data.columns:
            return {
                'success': False,
                'error': f'Target column "{target_column}" not found'
            }

        # Prepare features and target
        if features:
            feature_cols = [col for col in features if col in data.columns and col != target_column]
        else:
            feature_cols = [col for col in data.select_dtypes(include=[np.number]).columns if col != target_column]

        if len(feature_cols) == 0:
            return {
                'success': False,
                'error': 'No valid feature columns found'
            }

        X = data[feature_cols]
        y = data[target_column]

        # Handle missing values
        X = X.fillna(X.mean())
        y = y.fillna(y.mean())

        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )

        # Fit regression model
        model = LinearRegression()
        model.fit(X_train, y_train)

        # Predictions
        y_pred_train = model.predict(X_train)
        y_pred_test = model.predict(X_test)

        # Calculate metrics
        mse_train = mean_squared_error(y_train, y_pred_train)
        mse_test = mean_squared_error(y_test, y_pred_test)
        rmse_train = np.sqrt(mse_train)
        rmse_test = np.sqrt(mse_test)
        mae_train = mean_absolute_error(y_train, y_pred_train)
        mae_test = mean_absolute_error(y_test, y_pred_test)
        r2_train = r2_score(y_train, y_pred_train)
        r2_test = r2_score(y_test, y_pred_test)

        # Coefficients
        coefficients = dict(zip(feature_cols, model.coef_.tolist()))
        intercept = float(model.intercept_)

        # Additional statsmodels analysis if available
        if STATSMODELS_AVAILABLE:
            # Add constant for intercept
            X_sm = sm.add_constant(X)
            sm_model = sm.OLS(y, X_sm).fit()

            # P-values for coefficients
            p_values = dict(zip(
                ['intercept'] + feature_cols,
                sm_model.pvalues.tolist()
            ))

            # Confidence intervals
            conf_intervals = sm_model.conf_int().to_dict()

            # Test for heteroscedasticity (Breusch-Pagan test)
            try:
                bp_test = het_breuschpagan(sm_model.resid, X_sm)
                heteroscedasticity = {
                    'lagrange_multiplier': float(bp_test[0]),
                    'p_value': float(bp_test[1]),
                    'f_statistic': float(bp_test[2]),
                    'f_p_value': float(bp_test[3])
                }
            except:
                heteroscedasticity = None

            # Adjusted R-squared
            adj_r2 = float(sm_model.rsquared_adj)

            statsmodels_results = {
                'p_values': p_values,
                'confidence_intervals': conf_intervals,
                'heteroscedasticity_test': heteroscedasticity,
                'adjusted_r2': adj_r2,
                'aic': float(sm_model.aic),
                'bic': float(sm_model.bic)
            }
        else:
            statsmodels_results = None

        # Residual analysis
        residuals_test = y_test - y_pred_test
        residual_stats = {
            'mean': float(np.mean(residuals_test)),
            'std': float(np.std(residuals_test)),
            'min': float(np.min(residuals_test)),
            'max': float(np.max(residuals_test))
        }

        return {
            'success': True,
            'model': 'linear_regression',
            'metrics': {
                'train': {
                    'mse': float(mse_train),
                    'rmse': float(rmse_train),
                    'mae': float(mae_train),
                    'r2': float(r2_train)
                },
                'test': {
                    'mse': float(mse_test),
                    'rmse': float(rmse_test),
                    'mae': float(mae_test),
                    'r2': float(r2_test)
                }
            },
            'coefficients': coefficients,
            'intercept': intercept,
            'feature_columns': feature_cols,
            'target_column': target_column,
            'residual_analysis': residual_stats,
            'statsmodels_results': statsmodels_results,
            'sample_predictions': [
                {
                    'actual': float(y_test.iloc[i]),
                    'predicted': float(y_pred_test[i]),
                    'residual': float(residuals_test.iloc[i])
                }
                for i in range(min(20, len(y_test)))
            ]
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
            'error': 'Usage: python3 regression_analysis.py <config_json>'
        }))
        sys.exit(1)

    try:
        config = json.loads(sys.argv[1])
        result = perform_regression_analysis(config)
        print(json.dumps(result))
        sys.exit(0 if result.get('success') else 1)
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': f'Configuration error: {str(e)}'
        }))
        sys.exit(1)
