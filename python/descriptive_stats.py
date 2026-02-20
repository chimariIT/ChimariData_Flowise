#!/usr/bin/env python3
"""
Descriptive Statistics Script
Uses dual-engine (Polars/Pandas) with scipy for distribution metrics.

Polars handles: loading, basic stats, quantiles, outlier IQR, missing values.
Pandas/scipy handles: skewness, kurtosis, Shapiro-Wilk, entropy.
"""

import json
import sys
from scipy import stats
import numpy as np
import warnings
warnings.filterwarnings('ignore')

from engine_utils import (
    load_dataframe, to_pandas, to_numpy_array, POLARS_AVAILABLE, PANDAS_AVAILABLE,
    select_numeric_columns, select_categorical_columns,
    safe_float, safe_int, drop_nulls, null_count, row_count,
    get_columns, filter_columns, value_counts, unique_count
)

if POLARS_AVAILABLE:
    import polars as pl


def perform_descriptive_stats(config):
    """Perform comprehensive descriptive statistics"""
    try:
        # Load data via dual-engine dispatch
        data, engine_used = load_dataframe(config)

        columns = config.get('columns')

        # If specific columns requested, filter
        if columns:
            all_cols = get_columns(data, engine_used)
            available_cols = [col for col in columns if col in all_cols]
            if len(available_cols) == 0:
                return {
                    'success': False,
                    'error': 'None of the specified columns found in data'
                }
            data = filter_columns(data, available_cols, engine_used)

        # Separate numeric and categorical columns
        numeric_cols = select_numeric_columns(data, engine_used)
        categorical_cols = select_categorical_columns(data, engine_used)

        total_rows = row_count(data, engine_used)

        results = {
            'success': True,
            'engine_used': engine_used,
            'n_observations': total_rows,
            'n_variables': len(get_columns(data, engine_used)),
            'numeric_variables': {},
            'categorical_variables': {},
            'missing_values': {},
            'data_types': {}
        }

        # Analyze numeric columns
        for col in numeric_cols:
            cleaned = drop_nulls(data, col, engine_used)
            n_cleaned = row_count(cleaned, engine_used)

            if n_cleaned == 0:
                continue

            if engine_used == 'polars' and POLARS_AVAILABLE:
                col_series = cleaned[col]

                # Basic statistics — Polars native (fast path)
                col_mean = safe_float(col_series.mean())
                col_median = safe_float(col_series.median())
                col_std = safe_float(col_series.std())
                col_var = safe_float(col_series.var()) if hasattr(col_series, 'var') else (col_std ** 2 if col_std is not None else None)
                col_min = safe_float(col_series.min())
                col_max = safe_float(col_series.max())

                # Mode — Polars
                try:
                    mode_series = col_series.mode()
                    col_mode = safe_float(mode_series[0]) if len(mode_series) > 0 else None
                except Exception:
                    col_mode = None

                basic_stats = {
                    'count': int(n_cleaned),
                    'mean': col_mean,
                    'median': col_median,
                    'mode': col_mode,
                    'std': col_std,
                    'variance': col_var,
                    'min': col_min,
                    'max': col_max,
                    'range': float(col_max - col_min) if col_max is not None and col_min is not None else None
                }

                # Percentiles — Polars native
                q25 = safe_float(col_series.quantile(0.25))
                q50 = safe_float(col_series.quantile(0.50))
                q75 = safe_float(col_series.quantile(0.75))
                iqr_val = float(q75 - q25) if q75 is not None and q25 is not None else 0.0

                percentiles = {
                    '25th': q25,
                    '50th': q50,
                    '75th': q75,
                    'iqr': iqr_val
                }

                # Distribution metrics — scipy boundary (need numpy)
                np_data = to_numpy_array(col_series)
                distribution = {
                    'skewness': float(stats.skew(np_data)),
                    'kurtosis': float(stats.kurtosis(np_data))
                }

                # Outlier detection (IQR method) — Polars native
                lower_bound = q25 - 1.5 * iqr_val if q25 is not None else 0
                upper_bound = q75 + 1.5 * iqr_val if q75 is not None else 0
                outlier_df = cleaned.filter(
                    (pl.col(col) < lower_bound) | (pl.col(col) > upper_bound)
                )
                n_outliers = row_count(outlier_df, engine_used)

                outlier_info = {
                    'n_outliers': int(n_outliers),
                    'outlier_percentage': float(n_outliers / n_cleaned * 100),
                    'lower_bound': float(lower_bound),
                    'upper_bound': float(upper_bound)
                }

                # Normality test — scipy boundary
                if n_cleaned >= 3:
                    if n_cleaned < 5000:
                        shapiro_stat, shapiro_p = stats.shapiro(np_data)
                        normality = {
                            'shapiro_statistic': float(shapiro_stat),
                            'shapiro_p_value': float(shapiro_p),
                            'is_normal': bool(shapiro_p > 0.05)
                        }
                    else:
                        normality = {
                            'shapiro_statistic': None,
                            'shapiro_p_value': None,
                            'is_normal': None
                        }
                else:
                    normality = None

                # Coefficient of variation
                cv = (col_std / col_mean * 100) if col_mean and col_mean != 0 else None

            else:
                # Pandas path (original code)
                col_data = cleaned[col]

                basic_stats = {
                    'count': int(len(col_data)),
                    'mean': float(col_data.mean()),
                    'median': float(col_data.median()),
                    'mode': float(col_data.mode().iloc[0]) if len(col_data.mode()) > 0 else None,
                    'std': float(col_data.std()),
                    'variance': float(col_data.var()),
                    'min': float(col_data.min()),
                    'max': float(col_data.max()),
                    'range': float(col_data.max() - col_data.min())
                }

                percentiles = {
                    '25th': float(col_data.quantile(0.25)),
                    '50th': float(col_data.quantile(0.50)),
                    '75th': float(col_data.quantile(0.75)),
                    'iqr': float(col_data.quantile(0.75) - col_data.quantile(0.25))
                }

                distribution = {
                    'skewness': float(stats.skew(col_data)),
                    'kurtosis': float(stats.kurtosis(col_data))
                }

                q1 = col_data.quantile(0.25)
                q3 = col_data.quantile(0.75)
                iqr = q3 - q1
                lower_bound = q1 - 1.5 * iqr
                upper_bound = q3 + 1.5 * iqr
                outliers = col_data[(col_data < lower_bound) | (col_data > upper_bound)]

                outlier_info = {
                    'n_outliers': int(len(outliers)),
                    'outlier_percentage': float(len(outliers) / len(col_data) * 100),
                    'lower_bound': float(lower_bound),
                    'upper_bound': float(upper_bound)
                }

                if len(col_data) >= 3:
                    shapiro_stat, shapiro_p = stats.shapiro(col_data) if len(col_data) < 5000 else (None, None)
                    normality = {
                        'shapiro_statistic': float(shapiro_stat) if shapiro_stat is not None else None,
                        'shapiro_p_value': float(shapiro_p) if shapiro_p is not None else None,
                        'is_normal': bool(shapiro_p > 0.05) if shapiro_p is not None else None
                    }
                else:
                    normality = None

                cv = (col_data.std() / col_data.mean() * 100) if col_data.mean() != 0 else None

            results['numeric_variables'][col] = {
                'basic_statistics': basic_stats,
                'percentiles': percentiles,
                'distribution': distribution,
                'outliers': outlier_info,
                'normality': normality,
                'coefficient_of_variation': float(cv) if cv is not None else None
            }

            # Missing values
            n_missing = null_count(data, col, engine_used)
            results['missing_values'][col] = {
                'count': int(n_missing),
                'percentage': float(n_missing / total_rows * 100)
            }

            # Data types
            if engine_used == 'polars' and POLARS_AVAILABLE:
                results['data_types'][col] = str(data[col].dtype)
            else:
                results['data_types'][col] = str(data[col].dtype)

        # Analyze categorical columns
        for col in categorical_cols:
            n_missing_cat = null_count(data, col, engine_used)
            n_non_null = total_rows - n_missing_cat

            if n_non_null == 0:
                continue

            # Value counts via engine_utils (returns dict)
            vc_dict = value_counts(data, col, engine_used, top_n=10)
            n_unique = unique_count(data, col, engine_used)

            # Mode from value counts
            if vc_dict:
                top_items = list(vc_dict.items())
                mode_value = top_items[0][0]
                mode_count = top_items[0][1]
                mode_percentage = float(mode_count / n_non_null * 100) if n_non_null > 0 else 0
            else:
                mode_value = None
                mode_count = 0
                mode_percentage = 0

            # Entropy — scipy boundary, needs value array
            vc_values = list(vc_dict.values()) if vc_dict else []
            entropy_val = float(stats.entropy(vc_values)) if vc_values else 0.0

            results['categorical_variables'][col] = {
                'count': int(n_non_null),
                'n_unique': int(n_unique),
                'mode': str(mode_value) if mode_value is not None else None,
                'mode_count': int(mode_count),
                'mode_percentage': mode_percentage,
                'top_values': {str(k): int(v) for k, v in vc_dict.items()},
                'entropy': entropy_val
            }

            results['missing_values'][col] = {
                'count': int(n_missing_cat),
                'percentage': float(n_missing_cat / total_rows * 100)
            }

            if engine_used == 'polars' and POLARS_AVAILABLE:
                results['data_types'][col] = str(data[col].dtype)
            else:
                results['data_types'][col] = str(data[col].dtype)

        # Overall dataset statistics
        all_cols = get_columns(data, engine_used)
        total_cells = total_rows * len(all_cols)
        total_missing = sum(null_count(data, c, engine_used) for c in all_cols)

        results['overall'] = {
            'total_cells': int(total_cells),
            'total_missing': int(total_missing),
            'missing_percentage': float(total_missing / total_cells * 100) if total_cells > 0 else 0.0,
            'n_numeric_variables': len(numeric_cols),
            'n_categorical_variables': len(categorical_cols)
        }

        # Phase 4C-1: Pass through business context for evidence chain
        business_context = config.get('business_context', {})
        if business_context:
            results['business_context'] = business_context
            results['question_ids'] = business_context.get('question_ids', [])

        return results

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
            'error': 'Usage: python3 descriptive_stats.py <config_json> OR pipe JSON to stdin OR set CONFIG env var'
        }))
        sys.exit(1)

    try:
        result = perform_descriptive_stats(config)
        print(json.dumps(result))
        sys.exit(0 if result.get('success') else 1)
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': f'Configuration error: {str(e)}'
        }))
        sys.exit(1)
