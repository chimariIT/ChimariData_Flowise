#!/usr/bin/env python3
"""
Comparative Analysis Script
Cross-group statistical comparison: t-tests, ANOVA, chi-square, effect sizes.
Auto-detects grouping columns and comparison variables.

Dual-engine: Polars for fast loading, Pandas/scipy for all statistical tests.
"""

import json
import sys
import pandas as pd
import numpy as np
from scipy import stats
import warnings
warnings.filterwarnings('ignore')

from engine_utils import load_dataframe, to_pandas


def perform_comparative_analysis(config):
    """Perform cross-group statistical comparisons"""
    try:
        # Load data via dual-engine dispatch, then convert to Pandas
        # (scipy-heavy — all statistical tests require Pandas/numpy)
        data, engine_used = load_dataframe(config)
        data = to_pandas(data)

        group_column = config.get('group_column')
        comparison_columns = config.get('comparison_columns')

        # Auto-detect grouping column if not specified
        if not group_column:
            group_column = _detect_group_column(data)

        if not group_column or group_column not in data.columns:
            return {
                'success': False,
                'error': f'No suitable grouping column found. Available columns: {list(data.columns)}'
            }

        # Get groups
        groups = data[group_column].dropna().unique()
        n_groups = len(groups)

        if n_groups < 2:
            return {
                'success': False,
                'error': f'Need at least 2 groups for comparison. Column "{group_column}" has {n_groups} unique values.'
            }

        if n_groups > 20:
            return {
                'success': False,
                'error': f'Too many groups ({n_groups}) for meaningful comparison. Select a column with 2-20 groups.'
            }

        # Determine comparison columns
        numeric_cols = data.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = data.select_dtypes(include=['object', 'category']).columns.tolist()
        categorical_cols = [c for c in categorical_cols if c != group_column]

        if comparison_columns:
            numeric_cols = [c for c in comparison_columns if c in numeric_cols]
            categorical_cols = [c for c in comparison_columns if c in categorical_cols]
        else:
            # Exclude group column from numeric if present
            numeric_cols = [c for c in numeric_cols if c != group_column]

        results = {
            'success': True,
            'engine_used': engine_used,
            'group_column': group_column,
            'n_groups': int(n_groups),
            'group_sizes': {str(g): int(data[data[group_column] == g].shape[0]) for g in groups},
            'tests': [],
            'group_statistics': {},
            'pairwise_comparisons': [],
            'categorical_tests': [],
            'summary': {}
        }

        # ---- Numeric variable comparisons ----
        for col in numeric_cols[:15]:  # Limit to 15 columns for performance
            col_data = data[[group_column, col]].dropna()
            if len(col_data) < 5:
                continue

            group_data = [col_data[col_data[group_column] == g][col].values for g in groups]
            group_data = [gd for gd in group_data if len(gd) >= 2]

            if len(group_data) < 2:
                continue

            # Per-group statistics
            group_stats = {}
            for g in groups:
                gd = col_data[col_data[group_column] == g][col]
                if len(gd) == 0:
                    continue
                group_stats[str(g)] = {
                    'n': int(len(gd)),
                    'mean': float(gd.mean()),
                    'median': float(gd.median()),
                    'std': float(gd.std()),
                    'min': float(gd.min()),
                    'max': float(gd.max())
                }
            results['group_statistics'][col] = group_stats

            # Statistical tests
            if n_groups == 2:
                # Two-group: t-test + Mann-Whitney U
                g1, g2 = group_data[0], group_data[1]

                # Independent t-test
                t_stat, t_p = stats.ttest_ind(g1, g2, equal_var=False)
                # Cohen's d effect size
                pooled_std = np.sqrt((g1.std()**2 + g2.std()**2) / 2)
                cohens_d = (g1.mean() - g2.mean()) / pooled_std if pooled_std > 0 else 0

                results['tests'].append({
                    'test_name': 'welch_t_test',
                    'variable': col,
                    'statistic': float(t_stat),
                    'p_value': float(t_p),
                    'effect_size': float(cohens_d),
                    'effect_size_name': 'cohens_d',
                    'significant': bool(t_p < 0.05),
                    'interpretation': _interpret_t_test(col, t_p, cohens_d, groups)
                })

                # Mann-Whitney U (non-parametric)
                try:
                    u_stat, u_p = stats.mannwhitneyu(g1, g2, alternative='two-sided')
                    results['tests'].append({
                        'test_name': 'mann_whitney_u',
                        'variable': col,
                        'statistic': float(u_stat),
                        'p_value': float(u_p),
                        'significant': bool(u_p < 0.05),
                        'interpretation': f'Non-parametric test {"confirms" if (u_p < 0.05) == (t_p < 0.05) else "disagrees with"} parametric result for {col}.'
                    })
                except Exception:
                    pass

            else:
                # Multi-group: ANOVA + Kruskal-Wallis
                f_stat, anova_p = stats.f_oneway(*group_data)

                # Eta-squared effect size
                grand_mean = col_data[col].mean()
                ss_between = sum(len(gd) * (gd.mean() - grand_mean)**2 for gd in group_data)
                ss_total = sum((col_data[col] - grand_mean)**2)
                eta_squared = ss_between / ss_total if ss_total > 0 else 0

                results['tests'].append({
                    'test_name': 'one_way_anova',
                    'variable': col,
                    'statistic': float(f_stat),
                    'p_value': float(anova_p),
                    'effect_size': float(eta_squared),
                    'effect_size_name': 'eta_squared',
                    'significant': bool(anova_p < 0.05),
                    'interpretation': _interpret_anova(col, anova_p, eta_squared, n_groups)
                })

                # Kruskal-Wallis (non-parametric)
                try:
                    h_stat, kw_p = stats.kruskal(*group_data)
                    results['tests'].append({
                        'test_name': 'kruskal_wallis',
                        'variable': col,
                        'statistic': float(h_stat),
                        'p_value': float(kw_p),
                        'significant': bool(kw_p < 0.05),
                        'interpretation': f'Non-parametric test {"confirms" if (kw_p < 0.05) == (anova_p < 0.05) else "disagrees with"} ANOVA result for {col}.'
                    })
                except Exception:
                    pass

                # Pairwise comparisons (Tukey-like using t-tests with Bonferroni)
                if anova_p < 0.05 and n_groups <= 10:
                    n_comparisons = n_groups * (n_groups - 1) / 2
                    for i in range(len(groups)):
                        for j in range(i + 1, len(groups)):
                            g1_data = col_data[col_data[group_column] == groups[i]][col].values
                            g2_data = col_data[col_data[group_column] == groups[j]][col].values
                            if len(g1_data) >= 2 and len(g2_data) >= 2:
                                t_s, t_p = stats.ttest_ind(g1_data, g2_data, equal_var=False)
                                adjusted_p = min(t_p * n_comparisons, 1.0)  # Bonferroni
                                results['pairwise_comparisons'].append({
                                    'variable': col,
                                    'group_1': str(groups[i]),
                                    'group_2': str(groups[j]),
                                    'statistic': float(t_s),
                                    'p_value': float(t_p),
                                    'adjusted_p_value': float(adjusted_p),
                                    'significant': bool(adjusted_p < 0.05),
                                    'mean_difference': float(g1_data.mean() - g2_data.mean())
                                })

        # ---- Categorical variable comparisons (chi-square) ----
        for col in categorical_cols[:10]:
            try:
                contingency = pd.crosstab(data[group_column], data[col])
                if contingency.shape[0] >= 2 and contingency.shape[1] >= 2:
                    chi2, p_val, dof, expected = stats.chi2_contingency(contingency)
                    # Cramer's V effect size
                    n = contingency.sum().sum()
                    min_dim = min(contingency.shape[0], contingency.shape[1]) - 1
                    cramers_v = np.sqrt(chi2 / (n * min_dim)) if n * min_dim > 0 else 0

                    results['categorical_tests'].append({
                        'test_name': 'chi_square',
                        'variable': col,
                        'statistic': float(chi2),
                        'p_value': float(p_val),
                        'degrees_of_freedom': int(dof),
                        'effect_size': float(cramers_v),
                        'effect_size_name': 'cramers_v',
                        'significant': bool(p_val < 0.05),
                        'interpretation': f'{"Significant" if p_val < 0.05 else "No significant"} association between {group_column} and {col} (Cramer\'s V = {cramers_v:.3f}).'
                    })
            except Exception:
                pass

        # Summary
        sig_tests = [t for t in results['tests'] if t.get('significant')]
        results['summary'] = {
            'total_tests': len(results['tests']),
            'significant_tests': len(sig_tests),
            'significance_rate': float(len(sig_tests) / len(results['tests']) * 100) if results['tests'] else 0,
            'most_significant_variable': sig_tests[0]['variable'] if sig_tests else None,
            'largest_effect_size': max((t.get('effect_size', 0) for t in results['tests']), default=0)
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
            if 2 <= n_unique <= 15:
                # Score: prefer fewer groups, more balanced sizes
                group_sizes = data[col].value_counts()
                balance = group_sizes.min() / group_sizes.max() if group_sizes.max() > 0 else 0
                score = balance * (1 - n_unique / 20)  # Favor fewer, balanced groups
                if score > best_score:
                    best_score = score
                    best_col = col

    return best_col


def _interpret_t_test(variable, p_value, cohens_d, groups):
    """Generate human-readable interpretation"""
    sig = "significant" if p_value < 0.05 else "no significant"
    effect = "small" if abs(cohens_d) < 0.5 else "medium" if abs(cohens_d) < 0.8 else "large"
    return f'There is {sig} difference in {variable} between groups (p={p_value:.4f}, Cohen\'s d={cohens_d:.3f}, {effect} effect).'


def _interpret_anova(variable, p_value, eta_squared, n_groups):
    """Generate human-readable interpretation for ANOVA"""
    sig = "significant" if p_value < 0.05 else "no significant"
    effect = "small" if eta_squared < 0.06 else "medium" if eta_squared < 0.14 else "large"
    return f'There is {sig} difference in {variable} across {n_groups} groups (p={p_value:.4f}, eta²={eta_squared:.3f}, {effect} effect).'


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
            'error': 'Usage: python comparative_analysis.py <config_json> OR pipe JSON to stdin OR set CONFIG env var'
        }))
        sys.exit(1)

    try:
        result = perform_comparative_analysis(config)
        print(json.dumps(result))
        sys.exit(0 if result.get('success') else 1)
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': f'Unexpected error: {str(e)}'
        }))
        sys.exit(1)
