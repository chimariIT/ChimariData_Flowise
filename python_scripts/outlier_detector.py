#!/usr/bin/env python3
"""
Outlier Detection Script
Detects outliers using multiple methods including Z-score, IQR, and Isolation Forest
"""

import sys
import json
import pandas as pd
import numpy as np
from scipy import stats
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import warnings
warnings.filterwarnings('ignore')

def detect_outliers_zscore(data, columns, threshold=3):
    """
    Detect outliers using Z-score method
    """
    outliers = []
    for column in columns:
        if column in data.columns:
            z_scores = np.abs(stats.zscore(data[column].dropna()))
            outlier_indices = np.where(z_scores > threshold)[0]
            for idx in outlier_indices:
                outliers.append({
                    'index': int(idx),
                    'column': column,
                    'value': float(data[column].iloc[idx]),
                    'z_score': float(z_scores[idx]),
                    'method': 'z_score'
                })
    return outliers

def detect_outliers_iqr(data, columns):
    """
    Detect outliers using Interquartile Range (IQR) method
    """
    outliers = []
    for column in columns:
        if column in data.columns:
            Q1 = data[column].quantile(0.25)
            Q3 = data[column].quantile(0.75)
            IQR = Q3 - Q1
            lower_bound = Q1 - 1.5 * IQR
            upper_bound = Q3 + 1.5 * IQR
            
            outlier_mask = (data[column] < lower_bound) | (data[column] > upper_bound)
            outlier_indices = data[outlier_mask].index
            
            for idx in outlier_indices:
                outliers.append({
                    'index': int(idx),
                    'column': column,
                    'value': float(data[column].iloc[idx]),
                    'lower_bound': float(lower_bound),
                    'upper_bound': float(upper_bound),
                    'method': 'iqr'
                })
    return outliers

def detect_outliers_isolation_forest(data, columns, contamination=0.1):
    """
    Detect outliers using Isolation Forest
    """
    outliers = []
    
    # Prepare data for Isolation Forest
    numeric_data = data[columns].select_dtypes(include=[np.number])
    if numeric_data.empty:
        return outliers
    
    # Handle missing values
    numeric_data = numeric_data.fillna(numeric_data.mean())
    
    # Standardize the data
    scaler = StandardScaler()
    scaled_data = scaler.fit_transform(numeric_data)
    
    # Apply Isolation Forest
    iso_forest = IsolationForest(contamination=contamination, random_state=42)
    outlier_predictions = iso_forest.fit_predict(scaled_data)
    
    # Get outlier indices
    outlier_indices = np.where(outlier_predictions == -1)[0]
    
    for idx in outlier_indices:
        outliers.append({
            'index': int(idx),
            'columns': columns,
            'anomaly_score': float(iso_forest.decision_function(scaled_data)[idx]),
            'method': 'isolation_forest'
        })
    
    return outliers

def perform_outlier_detection(data, config):
    """
    Perform outlier detection using specified method
    """
    try:
        df = pd.DataFrame(data)
        columns = config['columns']
        method = config['method']
        threshold = config.get('threshold', 3)
        
        # Filter to numeric columns only
        numeric_columns = [col for col in columns if col in df.columns and df[col].dtype in ['int64', 'float64']]
        
        if not numeric_columns:
            return {
                'error': 'No numeric columns found for outlier detection',
                'outliers': [],
                'summary': {}
            }
        
        outliers = []
        
        if method == 'zscore':
            outliers = detect_outliers_zscore(df, numeric_columns, threshold)
        elif method == 'iqr':
            outliers = detect_outliers_iqr(df, numeric_columns)
        elif method == 'isolation_forest':
            contamination = config.get('contamination', 0.1)
            outliers = detect_outliers_isolation_forest(df, numeric_columns, contamination)
        else:
            return {
                'error': f'Unknown outlier detection method: {method}',
                'outliers': [],
                'summary': {}
            }
        
        # Generate summary statistics
        summary = {
            'total_outliers': len(outliers),
            'columns_analyzed': numeric_columns,
            'method_used': method,
            'parameters': {
                'threshold': threshold if method == 'zscore' else None,
                'contamination': config.get('contamination', 0.1) if method == 'isolation_forest' else None
            }
        }
        
        # Add per-column statistics
        if method in ['zscore', 'iqr']:
            summary['per_column'] = {}
            for col in numeric_columns:
                col_outliers = [o for o in outliers if o.get('column') == col]
                summary['per_column'][col] = {
                    'outlier_count': len(col_outliers),
                    'outlier_percentage': (len(col_outliers) / len(df)) * 100,
                    'column_mean': float(df[col].mean()),
                    'column_std': float(df[col].std())
                }
        
        return {
            'outliers': outliers,
            'summary': summary,
            'recommendations': generate_outlier_recommendations(outliers, method, len(df))
        }
        
    except Exception as e:
        return {
            'error': f"Outlier detection failed: {str(e)}",
            'outliers': [],
            'summary': {}
        }

def generate_outlier_recommendations(outliers, method, total_records):
    """
    Generate recommendations based on outlier detection results
    """
    recommendations = []
    
    outlier_percentage = (len(outliers) / total_records) * 100
    
    if len(outliers) == 0:
        recommendations.append("No outliers detected with the current method and parameters")
        recommendations.append("Consider using a different method or adjusting parameters if outliers are expected")
    else:
        recommendations.append(f"Found {len(outliers)} outliers ({outlier_percentage:.1f}% of data)")
        
        if outlier_percentage > 10:
            recommendations.append("High percentage of outliers detected - review method parameters")
            recommendations.append("Consider if these represent genuine anomalies or data collection issues")
        
        recommendations.append("Investigate the root cause of outliers before removing them")
        recommendations.append("Consider transforming variables or using robust statistical methods")
        
        if method == 'zscore':
            recommendations.append("Z-score method assumes normal distribution - verify this assumption")
        elif method == 'iqr':
            recommendations.append("IQR method is robust to distribution shape but may miss mild outliers")
        elif method == 'isolation_forest':
            recommendations.append("Isolation Forest can detect complex patterns but may have false positives")
    
    return recommendations

def main():
    if len(sys.argv) != 4:
        print("Usage: python outlier_detector.py <input_file> <config_file> <output_file>")
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
        
        # Perform outlier detection
        results = perform_outlier_detection(data, config)
        
        # Write results
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)
        
        print("Outlier detection completed successfully")
        
    except Exception as e:
        error_result = {
            'error': str(e),
            'outliers': [],
            'summary': {}
        }
        
        with open(output_file, 'w') as f:
            json.dump(error_result, f, indent=2)
        
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()