#!/usr/bin/env python3
"""
Descriptive Statistics Script
Uses pandas and scipy for comprehensive descriptive analysis
"""

import json
import sys
import pandas as pd
import numpy as np
from scipy import stats
import warnings
warnings.filterwarnings('ignore')


def perform_descriptive_stats(config):
    """Perform comprehensive descriptive statistics"""
    try:
        # Load data
        data_path = config['data_path']
        data = pd.read_json(data_path)

        columns = config.get('columns')

        # If specific columns requested, filter
        if columns:
            available_cols = [col for col in columns if col in data.columns]
            if len(available_cols) == 0:
                return {
                    'success': False,
                    'error': 'None of the specified columns found in data'
                }
            data = data[available_cols]

        # Separate numeric and categorical columns
        numeric_cols = data.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = data.select_dtypes(include=['object', 'category']).columns.tolist()

        results = {
            'success': True,
            'n_observations': len(data),
            'n_variables': len(data.columns),
            'numeric_variables': {},
            'categorical_variables': {},
            'missing_values': {},
            'data_types': {}
        }

        # Analyze numeric columns
        for col in numeric_cols:
            col_data = data[col].dropna()

            if len(col_data) == 0:
                continue

            # Basic statistics
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

            # Percentiles
            percentiles = {
                '25th': float(col_data.quantile(0.25)),
                '50th': float(col_data.quantile(0.50)),
                '75th': float(col_data.quantile(0.75)),
                'iqr': float(col_data.quantile(0.75) - col_data.quantile(0.25))
            }

            # Distribution metrics
            distribution = {
                'skewness': float(stats.skew(col_data)),
                'kurtosis': float(stats.kurtosis(col_data))
            }

            # Outlier detection (IQR method)
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

            # Normality test
            if len(col_data) >= 3:
                shapiro_stat, shapiro_p = stats.shapiro(col_data) if len(col_data) < 5000 else (None, None)
                normality = {
                    'shapiro_statistic': float(shapiro_stat) if shapiro_stat is not None else None,
                    'shapiro_p_value': float(shapiro_p) if shapiro_p is not None else None,
                    'is_normal': bool(shapiro_p > 0.05) if shapiro_p is not None else None
                }
            else:
                normality = None

            # Coefficient of variation
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
            n_missing = data[col].isna().sum()
            results['missing_values'][col] = {
                'count': int(n_missing),
                'percentage': float(n_missing / len(data) * 100)
            }

            results['data_types'][col] = str(data[col].dtype)

        # Analyze categorical columns
        for col in categorical_cols:
            col_data = data[col].dropna()

            if len(col_data) == 0:
                continue

            # Value counts
            value_counts = col_data.value_counts()
            top_values = value_counts.head(10)

            # Unique values
            n_unique = len(col_data.unique())

            # Mode
            mode_value = col_data.mode().iloc[0] if len(col_data.mode()) > 0 else None
            mode_count = int(value_counts.iloc[0]) if len(value_counts) > 0 else 0
            mode_percentage = float(mode_count / len(col_data) * 100) if len(col_data) > 0 else 0

            results['categorical_variables'][col] = {
                'count': int(len(col_data)),
                'n_unique': int(n_unique),
                'mode': str(mode_value) if mode_value is not None else None,
                'mode_count': mode_count,
                'mode_percentage': mode_percentage,
                'top_values': {
                    str(k): int(v) for k, v in top_values.items()
                },
                'entropy': float(stats.entropy(value_counts.values))
            }

            # Missing values
            n_missing = data[col].isna().sum()
            results['missing_values'][col] = {
                'count': int(n_missing),
                'percentage': float(n_missing / len(data) * 100)
            }

            results['data_types'][col] = str(data[col].dtype)

        # Overall dataset statistics
        total_missing = data.isna().sum().sum()
        results['overall'] = {
            'total_cells': int(len(data) * len(data.columns)),
            'total_missing': int(total_missing),
            'missing_percentage': float(total_missing / (len(data) * len(data.columns)) * 100),
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
