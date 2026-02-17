#!/usr/bin/env python3
"""
Correlation Analysis Script
Uses pandas and scipy for comprehensive correlation analysis
"""

import json
import sys
import pandas as pd
import numpy as np
from scipy import stats
import warnings
warnings.filterwarnings('ignore')


def perform_correlation_analysis(config):
    """Perform comprehensive correlation analysis"""
    try:
        # Load data
        data_path = config['data_path']
        data = pd.read_json(data_path)

        method = config.get('method', 'pearson')

        # Phase 4C-3: Accept explicit column list from AnalysisDataPreparer
        columns = config.get('columns')
        if columns:
            available = [c for c in columns if c in data.columns]
            if available:
                numeric_data = data[available].select_dtypes(include=[np.number])
            else:
                numeric_data = data.select_dtypes(include=[np.number])
        else:
            # Select only numeric columns (original behavior)
            numeric_data = data.select_dtypes(include=[np.number])

        if numeric_data.shape[1] < 2:
            return {
                'success': False,
                'error': 'Need at least 2 numeric columns for correlation analysis'
            }

        # Handle missing values
        numeric_data = numeric_data.dropna()

        if len(numeric_data) == 0:
            return {
                'success': False,
                'error': 'No data remaining after removing missing values'
            }

        # Calculate correlation matrix
        if method == 'pearson':
            corr_matrix = numeric_data.corr(method='pearson')
        elif method == 'spearman':
            corr_matrix = numeric_data.corr(method='spearman')
        elif method == 'kendall':
            corr_matrix = numeric_data.corr(method='kendall')
        else:
            corr_matrix = numeric_data.corr(method='pearson')

        # Convert to dictionary
        corr_dict = corr_matrix.to_dict()

        # Calculate p-values for each correlation
        p_values = {}
        n = len(numeric_data)
        columns = numeric_data.columns.tolist()

        for i, col1 in enumerate(columns):
            p_values[col1] = {}
            for col2 in columns:
                if col1 == col2:
                    p_values[col1][col2] = 0.0
                else:
                    # Calculate p-value based on correlation coefficient
                    r = corr_matrix.loc[col1, col2]

                    if method == 'pearson':
                        # Pearson p-value
                        t_stat = r * np.sqrt(n - 2) / np.sqrt(1 - r ** 2) if abs(r) < 1 else 0
                        p_val = 2 * (1 - stats.t.cdf(abs(t_stat), n - 2))
                    elif method == 'spearman':
                        # Spearman p-value (approximation)
                        t_stat = r * np.sqrt(n - 2) / np.sqrt(1 - r ** 2) if abs(r) < 1 else 0
                        p_val = 2 * (1 - stats.t.cdf(abs(t_stat), n - 2))
                    else:
                        # Kendall p-value using normal approximation
                        # P1-8 FIX: Replace placeholder with actual calculation
                        # For Kendall's tau, the z-statistic is tau / sqrt(2(2n+5)/(9n(n-1)))
                        if n >= 10:
                            var_tau = (2 * (2 * n + 5)) / (9 * n * (n - 1))
                            z_stat = r / np.sqrt(var_tau) if var_tau > 0 else 0
                            p_val = 2 * (1 - stats.norm.cdf(abs(z_stat)))
                        else:
                            # For small samples, use scipy's kendalltau directly
                            try:
                                _, p_val = stats.kendalltau(
                                    numeric_df[col1].dropna().values[:n],
                                    numeric_df[col2].dropna().values[:n]
                                )
                                p_val = float(p_val) if not np.isnan(p_val) else 1.0
                            except Exception:
                                p_val = 1.0  # Conservative: assume not significant

                    p_values[col1][col2] = float(p_val)

        # Find strong correlations
        strong_correlations = []
        for i, col1 in enumerate(columns):
            for col2 in columns[i + 1:]:
                corr_value = corr_matrix.loc[col1, col2]
                p_value = p_values[col1][col2]

                if abs(corr_value) > 0.5:  # Strong correlation threshold
                    strong_correlations.append({
                        'variable1': col1,
                        'variable2': col2,
                        'correlation': float(corr_value),
                        'p_value': float(p_value),
                        'significant': bool(p_value < 0.05),
                        'strength': 'strong' if abs(corr_value) > 0.7 else 'moderate',
                        'direction': 'positive' if corr_value > 0 else 'negative'
                    })

        # Sort by absolute correlation value
        strong_correlations.sort(key=lambda x: abs(x['correlation']), reverse=True)

        # Summary statistics
        summary = {
            'n_variables': len(columns),
            'n_observations': int(n),
            'method': method,
            'average_correlation': float(np.mean(np.abs(corr_matrix.values[np.triu_indices_from(corr_matrix.values, k=1)]))),
            'max_correlation': float(np.max(np.abs(corr_matrix.values[np.triu_indices_from(corr_matrix.values, k=1)]))),
            'n_strong_correlations': len([c for c in strong_correlations if c['strength'] == 'strong'])
        }

        # Detect multicollinearity (VIF-like metric)
        multicollinearity_warnings = []
        for col in columns:
            # Count how many strong correlations this variable has
            strong_corr_count = sum(1 for c in strong_correlations
                                   if (c['variable1'] == col or c['variable2'] == col)
                                   and c['strength'] == 'strong')
            if strong_corr_count >= 3:
                multicollinearity_warnings.append({
                    'variable': col,
                    'n_strong_correlations': strong_corr_count,
                    'warning': f'{col} is highly correlated with {strong_corr_count} other variables'
                })

        # Phase 4C-1: Pass through business context for evidence chain
        result = {
            'success': True,
            'method': method,
            'correlation_matrix': corr_dict,
            'p_values': p_values,
            'strong_correlations': strong_correlations,
            'summary': summary,
            'multicollinearity_warnings': multicollinearity_warnings,
            'variables': columns
        }
        business_context = config.get('business_context', {})
        if business_context:
            result['business_context'] = business_context
            result['question_ids'] = business_context.get('question_ids', [])
        return result

    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


if __name__ == "__main__":
    import os

    config = None

    # Priority 1: Check CONFIG environment variable
    if os.environ.get('CONFIG'):
        try:
            config = json.loads(os.environ['CONFIG'])
        except:
            pass

    # Priority 2: Check stdin
    if config is None and not sys.stdin.isatty():
        try:
            stdin_data = sys.stdin.read().strip()
            if stdin_data:
                config = json.loads(stdin_data)
        except:
            pass

    # Priority 3: Check command line argument
    if config is None and len(sys.argv) == 2:
        try:
            config = json.loads(sys.argv[1])
        except:
            pass

    if config is None:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python3 correlation_analysis.py <config_json> OR pipe JSON to stdin OR set CONFIG env var'
        }))
        sys.exit(1)

    try:
        result = perform_correlation_analysis(config)
        print(json.dumps(result))
        sys.exit(0 if result.get('success') else 1)
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': f'Configuration error: {str(e)}'
        }))
        sys.exit(1)
