#!/usr/bin/env python3
"""
Correlation Analysis Script
Uses dual-engine (Polars/Pandas) with scipy for p-value calculations.

Polars handles: loading, numeric column selection, dropna.
Pandas/scipy handles: correlation matrix, p-values, multicollinearity.
"""

import json
import sys
import numpy as np
from scipy import stats
import warnings
warnings.filterwarnings('ignore')

from engine_utils import (
    load_dataframe, to_pandas, POLARS_AVAILABLE, PANDAS_AVAILABLE,
    select_numeric_columns, filter_columns, get_columns, row_count
)

if POLARS_AVAILABLE:
    import polars as pl
    import polars.selectors as cs


def perform_correlation_analysis(config):
    """Perform comprehensive correlation analysis"""
    try:
        # Load data via dual-engine dispatch
        data, engine_used = load_dataframe(config)

        method = config.get('method', 'pearson')

        # Phase 4C-3: Accept explicit column list from AnalysisDataPreparer
        columns = config.get('columns')

        if engine_used == 'polars' and POLARS_AVAILABLE:
            # Polars fast path: select numeric columns, filter, dropna
            all_cols = get_columns(data, engine_used)

            if columns:
                available = [c for c in columns if c in all_cols]
                if available:
                    data_subset = data.select(available)
                    # Select only numeric from subset
                    try:
                        numeric_data_pl = data_subset.select(cs.numeric())
                    except Exception:
                        numeric_data_pl = data_subset.select([c for c in data_subset.columns
                                                              if data_subset[c].dtype.is_numeric()])
                else:
                    try:
                        numeric_data_pl = data.select(cs.numeric())
                    except Exception:
                        numeric_data_pl = data.select([c for c in data.columns
                                                       if data[c].dtype.is_numeric()])
            else:
                try:
                    numeric_data_pl = data.select(cs.numeric())
                except Exception:
                    numeric_data_pl = data.select([c for c in data.columns
                                                   if data[c].dtype.is_numeric()])

            if numeric_data_pl.shape[1] < 2:
                return {
                    'success': False,
                    'error': 'Need at least 2 numeric columns for correlation analysis'
                }

            # Drop nulls across all numeric columns (Polars fast path)
            numeric_data_pl = numeric_data_pl.drop_nulls()

            if len(numeric_data_pl) == 0:
                return {
                    'success': False,
                    'error': 'No data remaining after removing missing values'
                }

            # Convert to Pandas for corr() matrix and p-value calculations
            # (scipy-heavy — Polars doesn't have native corr matrix)
            import sys as _sys
            print(f"✅ [Engine] Polars loaded {len(numeric_data_pl)} rows, converting to Pandas for correlation matrix", file=_sys.stderr)
            numeric_data = numeric_data_pl.to_pandas()

        else:
            # Pandas path (original behavior)
            if columns:
                available = [c for c in columns if c in data.columns]
                if available:
                    numeric_data = data[available].select_dtypes(include=[np.number])
                else:
                    numeric_data = data.select_dtypes(include=[np.number])
            else:
                numeric_data = data.select_dtypes(include=[np.number])

            if numeric_data.shape[1] < 2:
                return {
                    'success': False,
                    'error': 'Need at least 2 numeric columns for correlation analysis'
                }

            numeric_data = numeric_data.dropna()

            if len(numeric_data) == 0:
                return {
                    'success': False,
                    'error': 'No data remaining after removing missing values'
                }

        # From here on, numeric_data is always a Pandas DataFrame
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
        col_names = numeric_data.columns.tolist()

        for i, col1 in enumerate(col_names):
            p_values[col1] = {}
            for col2 in col_names:
                if col1 == col2:
                    p_values[col1][col2] = 0.0
                else:
                    r = corr_matrix.loc[col1, col2]

                    if method == 'pearson':
                        t_stat = r * np.sqrt(n - 2) / np.sqrt(1 - r ** 2) if abs(r) < 1 else 0
                        p_val = 2 * (1 - stats.t.cdf(abs(t_stat), n - 2))
                    elif method == 'spearman':
                        t_stat = r * np.sqrt(n - 2) / np.sqrt(1 - r ** 2) if abs(r) < 1 else 0
                        p_val = 2 * (1 - stats.t.cdf(abs(t_stat), n - 2))
                    else:
                        # Kendall p-value using normal approximation
                        if n >= 10:
                            var_tau = (2 * (2 * n + 5)) / (9 * n * (n - 1))
                            z_stat = r / np.sqrt(var_tau) if var_tau > 0 else 0
                            p_val = 2 * (1 - stats.norm.cdf(abs(z_stat)))
                        else:
                            try:
                                _, p_val = stats.kendalltau(
                                    numeric_data[col1].dropna().values[:n],
                                    numeric_data[col2].dropna().values[:n]
                                )
                                p_val = float(p_val) if not np.isnan(p_val) else 1.0
                            except Exception:
                                p_val = 1.0

                    p_values[col1][col2] = float(p_val)

        # Find strong correlations
        strong_correlations = []
        for i, col1 in enumerate(col_names):
            for col2 in col_names[i + 1:]:
                corr_value = corr_matrix.loc[col1, col2]
                p_value = p_values[col1][col2]

                if abs(corr_value) > 0.5:
                    strong_correlations.append({
                        'variable1': col1,
                        'variable2': col2,
                        'correlation': float(corr_value),
                        'p_value': float(p_value),
                        'significant': bool(p_value < 0.05),
                        'strength': 'strong' if abs(corr_value) > 0.7 else 'moderate',
                        'direction': 'positive' if corr_value > 0 else 'negative'
                    })

        strong_correlations.sort(key=lambda x: abs(x['correlation']), reverse=True)

        # Summary statistics
        upper_tri = corr_matrix.values[np.triu_indices_from(corr_matrix.values, k=1)]
        summary = {
            'n_variables': len(col_names),
            'n_observations': int(n),
            'method': method,
            'average_correlation': float(np.mean(np.abs(upper_tri))),
            'max_correlation': float(np.max(np.abs(upper_tri))) if len(upper_tri) > 0 else 0.0,
            'n_strong_correlations': len([c for c in strong_correlations if c['strength'] == 'strong'])
        }

        # Detect multicollinearity
        multicollinearity_warnings = []
        for col in col_names:
            strong_corr_count = sum(1 for c in strong_correlations
                                   if (c['variable1'] == col or c['variable2'] == col)
                                   and c['strength'] == 'strong')
            if strong_corr_count >= 3:
                multicollinearity_warnings.append({
                    'variable': col,
                    'n_strong_correlations': strong_corr_count,
                    'warning': f'{col} is highly correlated with {strong_corr_count} other variables'
                })

        result = {
            'success': True,
            'engine_used': engine_used,
            'method': method,
            'correlation_matrix': corr_dict,
            'p_values': p_values,
            'strong_correlations': strong_correlations,
            'summary': summary,
            'multicollinearity_warnings': multicollinearity_warnings,
            'variables': col_names
        }

        # Phase 4C-1: Pass through business context for evidence chain
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
