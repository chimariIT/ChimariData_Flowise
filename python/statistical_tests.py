#!/usr/bin/env python3
"""
Statistical Tests Script
Uses scipy and statsmodels for hypothesis testing
"""

import json
import sys
import pandas as pd
import numpy as np
from scipy import stats
import warnings
warnings.filterwarnings('ignore')

try:
    import statsmodels.api as sm
    from statsmodels.formula.api import ols
    from statsmodels.stats.multicomp import pairwise_tukeyhsd
    STATSMODELS_AVAILABLE = True
except ImportError:
    STATSMODELS_AVAILABLE = False


def perform_statistical_tests(config):
    """Perform various statistical hypothesis tests"""
    try:
        # Load data
        data_path = config['data_path']
        data = pd.read_json(data_path)

        test_type = config.get('test_type', 'anova')
        groups = config.get('groups')

        if test_type == 'anova':
            return perform_anova(data, groups)
        elif test_type == 't_test':
            return perform_t_test(data, groups)
        elif test_type == 'chi_square':
            return perform_chi_square(data, groups)
        elif test_type == 'normality':
            return perform_normality_test(data)
        elif test_type == 'correlation_test':
            return perform_correlation_test(data)
        else:
            return {
                'success': False,
                'error': f'Unknown test type: {test_type}'
            }

    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def perform_anova(data, groups):
    """Perform one-way ANOVA"""
    try:
        if not groups or 'group_column' not in groups or 'value_column' not in groups:
            # Auto-detect columns
            categorical_cols = data.select_dtypes(include=['object', 'category']).columns
            numeric_cols = data.select_dtypes(include=[np.number]).columns

            if len(categorical_cols) == 0 or len(numeric_cols) == 0:
                return {
                    'success': False,
                    'error': 'Need both categorical and numeric columns for ANOVA'
                }

            group_column = categorical_cols[0]
            value_column = numeric_cols[0]
        else:
            group_column = groups['group_column']
            value_column = groups['value_column']

        # Prepare groups
        group_data = []
        group_names = data[group_column].unique()

        for group_name in group_names:
            group_values = data[data[group_column] == group_name][value_column].dropna()
            group_data.append(group_values.values)

        # Perform ANOVA
        f_statistic, p_value = stats.f_oneway(*group_data)

        # Group statistics
        group_stats = {}
        for group_name in group_names:
            group_values = data[data[group_column] == group_name][value_column].dropna()
            group_stats[str(group_name)] = {
                'mean': float(group_values.mean()),
                'std': float(group_values.std()),
                'median': float(group_values.median()),
                'n': int(len(group_values))
            }

        # Post-hoc test (Tukey HSD) if statsmodels available
        tukey_results = None
        if STATSMODELS_AVAILABLE and p_value < 0.05:
            try:
                tukey = pairwise_tukeyhsd(
                    endog=data[value_column],
                    groups=data[group_column],
                    alpha=0.05
                )
                tukey_results = str(tukey)
            except:
                pass

        return {
            'success': True,
            'test_type': 'one_way_anova',
            'f_statistic': float(f_statistic),
            'p_value': float(p_value),
            'significant': bool(p_value < 0.05),
            'group_column': group_column,
            'value_column': value_column,
            'n_groups': len(group_names),
            'group_statistics': group_stats,
            'tukey_hsd': tukey_results
        }

    except Exception as e:
        return {
            'success': False,
            'error': f'ANOVA error: {str(e)}'
        }


def perform_t_test(data, groups):
    """Perform independent samples t-test"""
    try:
        if not groups or 'group_column' not in groups or 'value_column' not in groups:
            return {
                'success': False,
                'error': 'Need group_column and value_column for t-test'
            }

        group_column = groups['group_column']
        value_column = groups['value_column']

        # Get unique groups
        group_names = data[group_column].unique()

        if len(group_names) != 2:
            return {
                'success': False,
                'error': f't-test requires exactly 2 groups, found {len(group_names)}'
            }

        # Extract group data
        group1_data = data[data[group_column] == group_names[0]][value_column].dropna()
        group2_data = data[data[group_column] == group_names[1]][value_column].dropna()

        # Perform t-test
        t_statistic, p_value = stats.ttest_ind(group1_data, group2_data)

        # Effect size (Cohen's d)
        mean_diff = group1_data.mean() - group2_data.mean()
        pooled_std = np.sqrt(
            ((len(group1_data) - 1) * group1_data.std() ** 2 +
             (len(group2_data) - 1) * group2_data.std() ** 2) /
            (len(group1_data) + len(group2_data) - 2)
        )
        cohens_d = mean_diff / pooled_std if pooled_std > 0 else 0

        return {
            'success': True,
            'test_type': 'independent_t_test',
            't_statistic': float(t_statistic),
            'p_value': float(p_value),
            'significant': bool(p_value < 0.05),
            'group_column': group_column,
            'value_column': value_column,
            'group1': {
                'name': str(group_names[0]),
                'mean': float(group1_data.mean()),
                'std': float(group1_data.std()),
                'n': int(len(group1_data))
            },
            'group2': {
                'name': str(group_names[1]),
                'mean': float(group2_data.mean()),
                'std': float(group2_data.std()),
                'n': int(len(group2_data))
            },
            'cohens_d': float(cohens_d)
        }

    except Exception as e:
        return {
            'success': False,
            'error': f't-test error: {str(e)}'
        }


def perform_chi_square(data, groups):
    """Perform chi-square test of independence"""
    try:
        if not groups or 'column1' not in groups or 'column2' not in groups:
            # Auto-detect categorical columns
            categorical_cols = data.select_dtypes(include=['object', 'category']).columns

            if len(categorical_cols) < 2:
                return {
                    'success': False,
                    'error': 'Need at least 2 categorical columns for chi-square test'
                }

            column1 = categorical_cols[0]
            column2 = categorical_cols[1]
        else:
            column1 = groups['column1']
            column2 = groups['column2']

        # Create contingency table
        contingency_table = pd.crosstab(data[column1], data[column2])

        # Perform chi-square test
        chi2, p_value, dof, expected = stats.chi2_contingency(contingency_table)

        return {
            'success': True,
            'test_type': 'chi_square_independence',
            'chi2_statistic': float(chi2),
            'p_value': float(p_value),
            'degrees_of_freedom': int(dof),
            'significant': bool(p_value < 0.05),
            'column1': column1,
            'column2': column2,
            'contingency_table': contingency_table.to_dict(),
            'expected_frequencies': pd.DataFrame(expected,
                                                index=contingency_table.index,
                                                columns=contingency_table.columns).to_dict()
        }

    except Exception as e:
        return {
            'success': False,
            'error': f'Chi-square error: {str(e)}'
        }


def perform_normality_test(data):
    """Perform Shapiro-Wilk normality test on numeric columns"""
    try:
        numeric_cols = data.select_dtypes(include=[np.number]).columns

        if len(numeric_cols) == 0:
            return {
                'success': False,
                'error': 'No numeric columns found for normality test'
            }

        results = {}
        for col in numeric_cols:
            col_data = data[col].dropna()

            if len(col_data) < 3:
                continue

            # Shapiro-Wilk test
            statistic, p_value = stats.shapiro(col_data)

            results[col] = {
                'statistic': float(statistic),
                'p_value': float(p_value),
                'is_normal': bool(p_value > 0.05),
                'skewness': float(stats.skew(col_data)),
                'kurtosis': float(stats.kurtosis(col_data))
            }

        return {
            'success': True,
            'test_type': 'shapiro_wilk_normality',
            'results': results
        }

    except Exception as e:
        return {
            'success': False,
            'error': f'Normality test error: {str(e)}'
        }


def perform_correlation_test(data):
    """Perform correlation significance tests"""
    try:
        numeric_cols = data.select_dtypes(include=[np.number]).columns

        if len(numeric_cols) < 2:
            return {
                'success': False,
                'error': 'Need at least 2 numeric columns for correlation test'
            }

        correlations = {}
        for i, col1 in enumerate(numeric_cols):
            for col2 in numeric_cols[i + 1:]:
                col1_data = data[col1].dropna()
                col2_data = data[col2].dropna()

                # Use only common indices
                common_idx = col1_data.index.intersection(col2_data.index)
                col1_clean = col1_data.loc[common_idx]
                col2_clean = col2_data.loc[common_idx]

                if len(col1_clean) < 3:
                    continue

                # Pearson correlation
                pearson_r, pearson_p = stats.pearsonr(col1_clean, col2_clean)

                # Spearman correlation
                spearman_r, spearman_p = stats.spearmanr(col1_clean, col2_clean)

                correlations[f'{col1}_vs_{col2}'] = {
                    'pearson': {
                        'correlation': float(pearson_r),
                        'p_value': float(pearson_p),
                        'significant': bool(pearson_p < 0.05)
                    },
                    'spearman': {
                        'correlation': float(spearman_r),
                        'p_value': float(spearman_p),
                        'significant': bool(spearman_p < 0.05)
                    }
                }

        return {
            'success': True,
            'test_type': 'correlation_significance',
            'correlations': correlations
        }

    except Exception as e:
        return {
            'success': False,
            'error': f'Correlation test error: {str(e)}'
        }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python3 statistical_tests.py <config_json>'
        }))
        sys.exit(1)

    try:
        config = json.loads(sys.argv[1])
        result = perform_statistical_tests(config)
        print(json.dumps(result))
        sys.exit(0 if result.get('success') else 1)
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': f'Configuration error: {str(e)}'
        }))
        sys.exit(1)
