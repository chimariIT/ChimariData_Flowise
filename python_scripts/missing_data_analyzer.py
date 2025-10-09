#!/usr/bin/env python3
"""
Missing Data Analysis Script
Analyzes missing data patterns and provides imputation recommendations
"""

import sys
import json
import pandas as pd
import numpy as np
from sklearn.impute import SimpleImputer, KNNImputer
from sklearn.experimental import enable_iterative_imputer
from sklearn.impute import IterativeImputer
import warnings
warnings.filterwarnings('ignore')

def analyze_missing_patterns(data):
    """
    Analyze missing data patterns
    """
    df = pd.DataFrame(data)
    
    missing_info = {}
    patterns = {}
    
    # Basic missing statistics
    for column in df.columns:
        missing_count = df[column].isnull().sum()
        missing_percentage = (missing_count / len(df)) * 100
        
        missing_info[column] = {
            'missing_count': int(missing_count),
            'missing_percentage': float(missing_percentage),
            'data_type': str(df[column].dtype),
            'total_records': len(df)
        }
    
    # Missing data patterns
    missing_pattern = df.isnull()
    pattern_counts = missing_pattern.value_counts()
    
    patterns['unique_patterns'] = len(pattern_counts)
    patterns['most_common_patterns'] = []
    
    for pattern, count in pattern_counts.head(10).items():
        pattern_dict = {col: bool(pattern[i]) for i, col in enumerate(df.columns)}
        patterns['most_common_patterns'].append({
            'pattern': pattern_dict,
            'count': int(count),
            'percentage': float((count / len(df)) * 100)
        })
    
    # Missing data correlations
    missing_corr = missing_pattern.corr()
    patterns['missing_correlations'] = {}
    
    for col1 in df.columns:
        for col2 in df.columns:
            if col1 != col2:
                corr_value = missing_corr.loc[col1, col2]
                if abs(corr_value) > 0.3:  # Only significant correlations
                    patterns['missing_correlations'][f"{col1}_{col2}"] = float(corr_value)
    
    return missing_info, patterns

def generate_imputation_recommendations(data, missing_info):
    """
    Generate recommendations for handling missing data
    """
    df = pd.DataFrame(data)
    recommendations = []
    
    for column, info in missing_info.items():
        missing_pct = info['missing_percentage']
        data_type = info['data_type']
        
        if missing_pct == 0:
            continue
        
        column_rec = {
            'column': column,
            'missing_percentage': missing_pct,
            'recommendations': []
        }
        
        if missing_pct > 50:
            column_rec['recommendations'].append("Consider removing this column due to high missing percentage")
            column_rec['recommendations'].append("If retaining, use advanced imputation methods")
        elif missing_pct > 20:
            column_rec['recommendations'].append("High missing percentage - use sophisticated imputation")
            if 'float' in data_type or 'int' in data_type:
                column_rec['recommendations'].append("Consider KNN imputation or iterative imputation")
            else:
                column_rec['recommendations'].append("Consider mode imputation or create 'missing' category")
        elif missing_pct > 5:
            column_rec['recommendations'].append("Moderate missing percentage - standard imputation appropriate")
            if 'float' in data_type or 'int' in data_type:
                column_rec['recommendations'].append("Mean/median imputation or KNN imputation")
            else:
                column_rec['recommendations'].append("Mode imputation or forward/backward fill")
        else:
            column_rec['recommendations'].append("Low missing percentage - simple imputation sufficient")
            if 'float' in data_type or 'int' in data_type:
                column_rec['recommendations'].append("Mean/median imputation")
            else:
                column_rec['recommendations'].append("Mode imputation")
        
        # Add specific method recommendations
        if 'float' in data_type or 'int' in data_type:
            # Check distribution for mean vs median
            try:
                col_data = df[column].dropna()
                if len(col_data) > 0:
                    skewness = col_data.skew()
                    if abs(skewness) > 1:
                        column_rec['recommendations'].append("Data is skewed - prefer median over mean")
                    else:
                        column_rec['recommendations'].append("Data appears normal - mean imputation suitable")
            except:
                pass
        
        recommendations.append(column_rec)
    
    return recommendations

def perform_sample_imputation(data, config):
    """
    Perform sample imputation to demonstrate different methods
    """
    df = pd.DataFrame(data)
    strategy = config.get('strategy', 'analyze')
    
    if strategy == 'analyze':
        return None  # Only analysis, no imputation
    
    results = {}
    
    if strategy == 'impute':
        method = config.get('method', 'mean')
        columns = config.get('columns', df.columns.tolist())
        
        # Separate numeric and categorical columns
        numeric_cols = [col for col in columns if col in df.columns and df[col].dtype in ['int64', 'float64']]
        categorical_cols = [col for col in columns if col in df.columns and df[col].dtype == 'object']
        
        imputed_df = df.copy()
        
        # Impute numeric columns
        if numeric_cols:
            if method in ['mean', 'median']:
                imputer = SimpleImputer(strategy=method)
                imputed_df[numeric_cols] = imputer.fit_transform(df[numeric_cols])
            elif method == 'knn':
                imputer = KNNImputer(n_neighbors=5)
                imputed_df[numeric_cols] = imputer.fit_transform(df[numeric_cols])
            elif method == 'iterative':
                imputer = IterativeImputer(random_state=42)
                imputed_df[numeric_cols] = imputer.fit_transform(df[numeric_cols])
        
        # Impute categorical columns
        if categorical_cols:
            if method == 'mode':
                imputer = SimpleImputer(strategy='most_frequent')
                imputed_df[categorical_cols] = imputer.fit_transform(df[categorical_cols])
            elif method == 'forward_fill':
                imputed_df[categorical_cols] = df[categorical_cols].fillna(method='ffill')
            elif method == 'backward_fill':
                imputed_df[categorical_cols] = df[categorical_cols].fillna(method='bfill')
        
        # Calculate imputation statistics
        results['imputation_stats'] = {}
        for col in columns:
            if col in df.columns:
                original_missing = df[col].isnull().sum()
                imputed_missing = imputed_df[col].isnull().sum()
                results['imputation_stats'][col] = {
                    'original_missing': int(original_missing),
                    'imputed_missing': int(imputed_missing),
                    'imputed_values': int(original_missing - imputed_missing)
                }
        
        results['method_used'] = method
        results['columns_processed'] = columns
    
    return results

def perform_missing_data_analysis(data, config):
    """
    Perform comprehensive missing data analysis
    """
    try:
        # Analyze missing patterns
        missing_info, patterns = analyze_missing_patterns(data)
        
        # Generate recommendations
        recommendations = generate_imputation_recommendations(data, missing_info)
        
        # Perform sample imputation if requested
        imputation_results = perform_sample_imputation(data, config)
        
        # Overall statistics
        df = pd.DataFrame(data)
        total_cells = len(df) * len(df.columns)
        total_missing = sum(info['missing_count'] for info in missing_info.values())
        
        overall_stats = {
            'total_records': len(df),
            'total_columns': len(df.columns),
            'total_cells': total_cells,
            'total_missing_cells': total_missing,
            'overall_missing_percentage': (total_missing / total_cells) * 100 if total_cells > 0 else 0,
            'columns_with_missing': sum(1 for info in missing_info.values() if info['missing_count'] > 0)
        }
        
        result = {
            'missing_info': missing_info,
            'patterns': patterns,
            'recommendations': recommendations,
            'overall_statistics': overall_stats
        }
        
        if imputation_results:
            result['imputation_results'] = imputation_results
        
        return result
        
    except Exception as e:
        return {
            'error': f"Missing data analysis failed: {str(e)}",
            'missing_info': {},
            'patterns': {},
            'recommendations': []
        }

def main():
    if len(sys.argv) != 4:
        print("Usage: python missing_data_analyzer.py <input_file> <config_file> <output_file>")
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
        
        # Perform missing data analysis
        results = perform_missing_data_analysis(data, config)
        
        # Write results
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)
        
        print("Missing data analysis completed successfully")
        
    except Exception as e:
        error_result = {
            'error': str(e),
            'missing_info': {},
            'patterns': {},
            'recommendations': []
        }
        
        with open(output_file, 'w') as f:
            json.dump(error_result, f, indent=2)
        
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()