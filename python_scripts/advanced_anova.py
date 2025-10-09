#!/usr/bin/env python3
"""
Advanced ANOVA Analysis Script
Performs comprehensive Analysis of Variance with post-hoc tests and effect sizes
"""

import sys
import json
import pandas as pd
import numpy as np
from scipy import stats
from scipy.stats import f_oneway
import matplotlib.pyplot as plt
import seaborn as sns
from statsmodels.stats.multicomp import pairwise_tukeyhsd
import warnings
warnings.filterwarnings('ignore')

def perform_anova_analysis(data, config):
    """
    Perform comprehensive ANOVA analysis
    """
    try:
        df = pd.DataFrame(data)
        target_variable = config['targetVariable']
        factor_variables = config['multivariateVariables']
        
        results = {
            'analysis_type': 'ANOVA',
            'target_variable': target_variable,
            'factor_variables': factor_variables,
            'question': config['question'],
            'results': {},
            'interpretation': '',
            'recommendations': [],
            'visualizations': [],
            'statistics': {}
        }
        
        # One-way ANOVA for each factor
        for factor in factor_variables:
            if factor not in df.columns or target_variable not in df.columns:
                continue
                
            groups = df.groupby(factor)[target_variable].apply(list)
            group_data = [group for group in groups if len(group) > 0]
            
            if len(group_data) < 2:
                continue
                
            # Perform F-test
            f_stat, p_value = f_oneway(*group_data)
            
            # Calculate effect size (eta squared)
            ss_between = sum([len(group) * (np.mean(group) - np.mean(df[target_variable]))**2 for group in group_data])
            ss_total = sum([(x - np.mean(df[target_variable]))**2 for group in group_data for x in group])
            eta_squared = ss_between / ss_total if ss_total > 0 else 0
            
            results['results'][factor] = {
                'f_statistic': float(f_stat),
                'p_value': float(p_value),
                'eta_squared': float(eta_squared),
                'significant': p_value < 0.05,
                'groups': {name: {'mean': float(np.mean(group)), 'std': float(np.std(group)), 'n': len(group)} 
                          for name, group in groups.items()},
                'degrees_of_freedom': [len(group_data) - 1, len(df) - len(group_data)]
            }
            
            # Post-hoc test if significant
            if p_value < 0.05:
                try:
                    tukey_result = pairwise_tukeyhsd(df[target_variable], df[factor])
                    results['results'][factor]['post_hoc'] = {
                        'test': 'Tukey HSD',
                        'results': str(tukey_result)
                    }
                except:
                    results['results'][factor]['post_hoc'] = None
        
        # Generate interpretation
        significant_factors = [f for f in factor_variables if f in results['results'] and results['results'][f]['significant']]
        
        if significant_factors:
            results['interpretation'] = f"The ANOVA analysis revealed significant effects for: {', '.join(significant_factors)}. "
            results['interpretation'] += f"This suggests that {target_variable} differs significantly across groups defined by these factors."
        else:
            results['interpretation'] = f"No significant effects were found for any of the tested factors on {target_variable}."
        
        # Generate recommendations
        results['recommendations'] = [
            "Review the descriptive statistics for each group to understand the patterns",
            "Consider the practical significance alongside statistical significance",
            "Examine effect sizes to determine the magnitude of differences"
        ]
        
        if significant_factors:
            results['recommendations'].append("Conduct post-hoc tests to identify specific group differences")
            results['recommendations'].append("Consider follow-up analyses or experiments to confirm findings")
        
        # Generate basic statistics
        results['statistics'] = {
            'overall_mean': float(df[target_variable].mean()),
            'overall_std': float(df[target_variable].std()),
            'sample_size': len(df),
            'factors_tested': len(factor_variables),
            'significant_factors': len(significant_factors)
        }
        
        return results
        
    except Exception as e:
        return {
            'error': f"ANOVA analysis failed: {str(e)}",
            'analysis_type': 'ANOVA',
            'success': False
        }

def main():
    if len(sys.argv) != 3:
        print("Usage: python advanced_anova.py <input_file> <output_file>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    try:
        # Read input data
        with open(input_file, 'r') as f:
            input_data = json.load(f)
        
        data = input_data['data']
        config = input_data['config']
        
        # Perform analysis
        results = perform_anova_analysis(data, config)
        
        # Write results
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)
        
        print("ANOVA analysis completed successfully")
        
    except Exception as e:
        error_result = {
            'error': str(e),
            'analysis_type': 'ANOVA',
            'success': False
        }
        
        with open(output_file, 'w') as f:
            json.dump(error_result, f, indent=2)
        
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()