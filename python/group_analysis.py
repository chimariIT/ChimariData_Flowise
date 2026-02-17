#!/usr/bin/env python3
"""
Group Analysis Script
Per-group descriptive statistics and profiling.
Identifies distinctive features per group vs overall population.
"""

import json
import sys
import pandas as pd
import numpy as np
from scipy import stats
import warnings
warnings.filterwarnings('ignore')


def perform_group_analysis(config):
    """Perform segment/cohort profiling with cross-group comparisons"""
    try:
        # Load data
        data_path = config['data_path']
        data = pd.read_json(data_path)

        group_column = config.get('group_column')
        analysis_columns = config.get('columns')

        # Auto-detect grouping column if not specified
        if not group_column:
            group_column = _detect_group_column(data)

        if not group_column or group_column not in data.columns:
            return {
                'success': False,
                'error': f'No suitable grouping column found. Available columns: {list(data.columns)}'
            }

        groups = data[group_column].dropna().unique()
        n_groups = len(groups)

        if n_groups < 2:
            return {
                'success': False,
                'error': f'Need at least 2 groups. Column "{group_column}" has {n_groups} unique values.'
            }

        if n_groups > 30:
            return {
                'success': False,
                'error': f'Too many groups ({n_groups}). Select a column with 2-30 groups.'
            }

        # Determine columns to analyze
        numeric_cols = data.select_dtypes(include=[np.number]).columns.tolist()
        numeric_cols = [c for c in numeric_cols if c != group_column]
        categorical_cols = data.select_dtypes(include=['object', 'category']).columns.tolist()
        categorical_cols = [c for c in categorical_cols if c != group_column]

        if analysis_columns:
            numeric_cols = [c for c in analysis_columns if c in numeric_cols]
            categorical_cols = [c for c in analysis_columns if c in categorical_cols]

        # Limit columns for performance
        numeric_cols = numeric_cols[:20]
        categorical_cols = categorical_cols[:10]

        # Overall statistics
        overall_stats = {}
        for col in numeric_cols:
            col_data = data[col].dropna()
            if len(col_data) == 0:
                continue
            overall_stats[col] = {
                'mean': float(col_data.mean()),
                'median': float(col_data.median()),
                'std': float(col_data.std()),
                'min': float(col_data.min()),
                'max': float(col_data.max())
            }

        results = {
            'success': True,
            'group_column': group_column,
            'n_groups': int(n_groups),
            'n_observations': int(len(data)),
            'overall_stats': overall_stats,
            'group_profiles': {},
            'group_comparisons': [],
            'distinctive_features': {},
            'summary': {}
        }

        # Per-group profiling
        for g in groups:
            g_data = data[data[group_column] == g]
            g_key = str(g)

            profile = {
                'n': int(len(g_data)),
                'percentage': float(len(g_data) / len(data) * 100),
                'numeric': {},
                'categorical': {},
                'distinctive': []
            }

            # Numeric stats per group
            for col in numeric_cols:
                col_data = g_data[col].dropna()
                if len(col_data) == 0:
                    continue

                g_mean = float(col_data.mean())
                g_median = float(col_data.median())
                g_std = float(col_data.std())

                # Compare to overall
                overall_mean = overall_stats.get(col, {}).get('mean', g_mean)
                overall_std = overall_stats.get(col, {}).get('std', 1)
                deviation = (g_mean - overall_mean) / overall_std if overall_std > 0 else 0

                profile['numeric'][col] = {
                    'mean': g_mean,
                    'median': g_median,
                    'std': g_std,
                    'min': float(col_data.min()),
                    'max': float(col_data.max()),
                    'deviation_from_overall': float(deviation),
                    'direction': 'above' if deviation > 0.3 else 'below' if deviation < -0.3 else 'similar'
                }

                # Track distinctive features (|deviation| > 0.5 std)
                if abs(deviation) > 0.5:
                    direction = 'higher' if deviation > 0 else 'lower'
                    profile['distinctive'].append(
                        f'{direction.capitalize()} {col} ({"+" if deviation > 0 else ""}{deviation:.2f} std from average)'
                    )

            # Categorical mode per group
            for col in categorical_cols:
                col_data = g_data[col].dropna()
                if len(col_data) == 0:
                    continue
                vc = col_data.value_counts()
                profile['categorical'][col] = {
                    'mode': str(vc.index[0]),
                    'mode_percentage': float(vc.iloc[0] / len(col_data) * 100),
                    'n_unique': int(col_data.nunique()),
                    'top_3': {str(k): int(v) for k, v in vc.head(3).items()}
                }

            results['group_profiles'][g_key] = profile

        # Cross-group comparisons for numeric columns
        for col in numeric_cols[:10]:
            group_means = {}
            for g in groups:
                g_data = data[data[group_column] == g][col].dropna()
                if len(g_data) > 0:
                    group_means[str(g)] = float(g_data.mean())

            if len(group_means) >= 2:
                sorted_groups = sorted(group_means.items(), key=lambda x: x[1], reverse=True)
                highest = sorted_groups[0]
                lowest = sorted_groups[-1]
                spread = highest[1] - lowest[1]

                results['group_comparisons'].append({
                    'variable': col,
                    'highest_group': highest[0],
                    'highest_value': highest[1],
                    'lowest_group': lowest[0],
                    'lowest_value': lowest[1],
                    'spread': float(spread),
                    'group_means': group_means,
                    'interpretation': f'{col}: Highest in {highest[0]} ({highest[1]:.2f}), lowest in {lowest[0]} ({lowest[1]:.2f}). Range: {spread:.2f}.'
                })

        # Distinctive features summary
        for g_key, profile in results['group_profiles'].items():
            if profile['distinctive']:
                results['distinctive_features'][g_key] = profile['distinctive'][:5]

        # Summary
        results['summary'] = {
            'n_groups': int(n_groups),
            'largest_group': str(max(groups, key=lambda g: len(data[data[group_column] == g]))),
            'smallest_group': str(min(groups, key=lambda g: len(data[data[group_column] == g]))),
            'most_distinctive_group': max(
                results['group_profiles'].items(),
                key=lambda x: len(x[1].get('distinctive', [])),
                default=('none', {'distinctive': []})
            )[0],
            'n_variables_analyzed': len(numeric_cols) + len(categorical_cols),
            'n_comparisons': len(results['group_comparisons']),
            'groups_with_distinctive_features': len([g for g in results['distinctive_features'] if results['distinctive_features'][g]])
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


def _detect_group_column(data):
    """Auto-detect the best grouping column"""
    best_col = None
    best_score = -1

    for col in data.columns:
        if data[col].dtype in ['object', 'category'] or data[col].nunique() <= 20:
            n_unique = data[col].nunique()
            if 2 <= n_unique <= 20:
                group_sizes = data[col].value_counts()
                balance = group_sizes.min() / group_sizes.max() if group_sizes.max() > 0 else 0
                score = balance * (1 - n_unique / 30)
                if score > best_score:
                    best_score = score
                    best_col = col

    return best_col


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
            'error': 'Usage: python group_analysis.py <config_json> OR pipe JSON to stdin OR set CONFIG env var'
        }))
        sys.exit(1)

    try:
        result = perform_group_analysis(config)
        print(json.dumps(result))
        sys.exit(0 if result.get('success') else 1)
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': f'Unexpected error: {str(e)}'
        }))
        sys.exit(1)
