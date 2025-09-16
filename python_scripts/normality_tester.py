#!/usr/bin/env python3
"""
Normality Testing Script
Tests variables for normal distribution using multiple statistical tests
"""

import sys
import json
import pandas as pd
import numpy as np
from scipy import stats
from scipy.stats import shapiro, jarque_bera, normaltest
import warnings
warnings.filterwarnings('ignore')

def test_normality_shapiro(data):
    """
    Perform Shapiro-Wilk normality test
    """
    try:
        if len(data) < 3:
            return None
        
        # Shapiro-Wilk test works best with samples <= 5000
        if len(data) > 5000:
            sample_data = np.random.choice(data, 5000, replace=False)
        else:
            sample_data = data
            
        statistic, p_value = shapiro(sample_data)
        
        return {
            'test_name': 'Shapiro-Wilk',
            'statistic': float(statistic),
            'p_value': float(p_value),
            'is_normal': p_value > 0.05,
            'interpretation': 'Normal' if p_value > 0.05 else 'Not Normal',
            'sample_size': len(sample_data)
        }
    except Exception as e:
        return {
            'test_name': 'Shapiro-Wilk',
            'error': str(e)
        }

def test_normality_kolmogorov(data):
    """
    Perform Kolmogorov-Smirnov normality test
    """
    try:
        if len(data) < 3:
            return None
            
        # Standardize the data
        mean = np.mean(data)
        std = np.std(data)
        
        if std == 0:
            return {
                'test_name': 'Kolmogorov-Smirnov',
                'error': 'Standard deviation is zero - cannot perform test'
            }
        
        standardized_data = (data - mean) / std
        
        # Compare with standard normal distribution
        statistic, p_value = stats.kstest(standardized_data, 'norm')
        
        return {
            'test_name': 'Kolmogorov-Smirnov',
            'statistic': float(statistic),
            'p_value': float(p_value),
            'is_normal': p_value > 0.05,
            'interpretation': 'Normal' if p_value > 0.05 else 'Not Normal',
            'sample_size': len(data)
        }
    except Exception as e:
        return {
            'test_name': 'Kolmogorov-Smirnov',
            'error': str(e)
        }

def test_normality_jarque_bera(data):
    """
    Perform Jarque-Bera normality test
    """
    try:
        if len(data) < 3:
            return None
            
        statistic, p_value = jarque_bera(data)
        
        return {
            'test_name': 'Jarque-Bera',
            'statistic': float(statistic),
            'p_value': float(p_value),
            'is_normal': p_value > 0.05,
            'interpretation': 'Normal' if p_value > 0.05 else 'Not Normal',
            'sample_size': len(data)
        }
    except Exception as e:
        return {
            'test_name': 'Jarque-Bera',
            'error': str(e)
        }

def test_normality_anderson(data):
    """
    Perform Anderson-Darling normality test
    """
    try:
        if len(data) < 3:
            return None
            
        result = stats.anderson(data, dist='norm')
        
        # Anderson-Darling critical values (15%, 10%, 5%, 2.5%, 1%)
        critical_values = result.critical_values
        significance_levels = result.significance_level
        
        # Check at 5% significance level (index 2)
        is_normal = result.statistic < critical_values[2]
        
        return {
            'test_name': 'Anderson-Darling',
            'statistic': float(result.statistic),
            'critical_values': [float(cv) for cv in critical_values],
            'significance_levels': [float(sl) for sl in significance_levels],
            'is_normal': is_normal,
            'interpretation': 'Normal' if is_normal else 'Not Normal',
            'sample_size': len(data)
        }
    except Exception as e:
        return {
            'test_name': 'Anderson-Darling',
            'error': str(e)
        }

def calculate_descriptive_stats(data):
    """
    Calculate descriptive statistics for normality assessment
    """
    try:
        return {
            'mean': float(np.mean(data)),
            'median': float(np.median(data)),
            'std': float(np.std(data)),
            'skewness': float(stats.skew(data)),
            'kurtosis': float(stats.kurtosis(data)),
            'min': float(np.min(data)),
            'max': float(np.max(data)),
            'q1': float(np.percentile(data, 25)),
            'q3': float(np.percentile(data, 75))
        }
    except Exception as e:
        return {'error': str(e)}

def generate_normality_recommendations(test_results, descriptive_stats):
    """
    Generate recommendations based on normality test results
    """
    recommendations = []
    
    # Count how many tests suggest normality
    normal_count = sum(1 for result in test_results.values() 
                      if isinstance(result, dict) and result.get('is_normal', False))
    total_tests = len([r for r in test_results.values() if isinstance(r, dict) and 'is_normal' in r])
    
    if total_tests == 0:
        recommendations.append("Unable to perform normality tests - check data validity")
        return recommendations
    
    normal_percentage = (normal_count / total_tests) * 100
    
    if normal_percentage >= 75:
        recommendations.append("Data appears to be normally distributed based on statistical tests")
        recommendations.append("Parametric statistical methods are appropriate")
    elif normal_percentage >= 50:
        recommendations.append("Mixed results on normality - examine data distribution visually")
        recommendations.append("Consider both parametric and non-parametric approaches")
    else:
        recommendations.append("Data does not appear to be normally distributed")
        recommendations.append("Consider non-parametric statistical methods")
        recommendations.append("Data transformation may help achieve normality")
    
    # Add recommendations based on descriptive statistics
    if 'skewness' in descriptive_stats:
        skewness = abs(descriptive_stats['skewness'])
        if skewness > 2:
            recommendations.append("Data is highly skewed - consider log or square root transformation")
        elif skewness > 1:
            recommendations.append("Data is moderately skewed - transformation may be beneficial")
    
    if 'kurtosis' in descriptive_stats:
        kurtosis = abs(descriptive_stats['kurtosis'])
        if kurtosis > 3:
            recommendations.append("Data has heavy tails - be cautious with outlier-sensitive analyses")
    
    # Sample size considerations
    for result in test_results.values():
        if isinstance(result, dict) and 'sample_size' in result:
            sample_size = result['sample_size']
            if sample_size < 50:
                recommendations.append("Small sample size - normality tests may have low power")
            elif sample_size > 5000:
                recommendations.append("Large sample size - small deviations from normality may be detected")
            break
    
    return recommendations

def perform_normality_testing(data, config):
    """
    Perform comprehensive normality testing
    """
    try:
        df = pd.DataFrame(data)
        columns = config['columns']
        tests = config.get('tests', ['shapiro', 'kolmogorov', 'jarque_bera', 'anderson'])
        alpha = config.get('alpha', 0.05)
        
        results = {}
        
        for column in columns:
            if column not in df.columns:
                continue
                
            # Get numeric data only
            col_data = df[column].dropna()
            
            if len(col_data) == 0:
                results[column] = {
                    'error': 'No data available for testing',
                    'tests': {},
                    'descriptive_stats': {},
                    'recommendations': []
                }
                continue
                
            if not pd.api.types.is_numeric_dtype(col_data):
                results[column] = {
                    'error': 'Column is not numeric - cannot test normality',
                    'tests': {},
                    'descriptive_stats': {},
                    'recommendations': []
                }
                continue
            
            # Convert to numpy array
            numeric_data = col_data.values
            
            # Perform tests
            test_results = {}
            
            if 'shapiro' in tests:
                test_results['shapiro'] = test_normality_shapiro(numeric_data)
            
            if 'kolmogorov' in tests:
                test_results['kolmogorov'] = test_normality_kolmogorov(numeric_data)
            
            if 'jarque_bera' in tests:
                test_results['jarque_bera'] = test_normality_jarque_bera(numeric_data)
            
            if 'anderson' in tests:
                test_results['anderson'] = test_normality_anderson(numeric_data)
            
            # Calculate descriptive statistics
            descriptive_stats = calculate_descriptive_stats(numeric_data)
            
            # Generate recommendations
            recommendations = generate_normality_recommendations(test_results, descriptive_stats)
            
            results[column] = {
                'tests': test_results,
                'descriptive_stats': descriptive_stats,
                'recommendations': recommendations,
                'alpha_level': alpha,
                'sample_size': len(numeric_data)
            }
        
        return {'tests': results}
        
    except Exception as e:
        return {
            'error': f"Normality testing failed: {str(e)}",
            'tests': {}
        }

def main():
    if len(sys.argv) != 4:
        print("Usage: python normality_tester.py <input_file> <config_file> <output_file>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    config_file = sys.argv[2]
    output_file = sys.argv[3]
    
    try:
        # Read input data
        with open(input_file, 'r') as f:
            data = json.load(f)
        
        # Read config
        with open(config_file, 'r') as f:
            config = json.load(f)
        
        # Perform normality testing
        results = perform_normality_testing(data, config)
        
        # Write results
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)
        
        print("Normality testing completed successfully")
        
    except Exception as e:
        error_result = {
            'error': str(e),
            'tests': {}
        }
        
        with open(output_file, 'w') as f:
            json.dump(error_result, f, indent=2)
        
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()