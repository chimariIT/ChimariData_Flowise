#!/usr/bin/env python3
"""
Free Trial Data Analyzer
Provides descriptive analysis and basic visualizations for trial users
"""

import sys
import json
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import base64
import io
from typing import Dict, List, Any
import warnings
warnings.filterwarnings('ignore')

def load_data(file_path: str) -> Dict[str, Any]:
    """Load data from JSON file"""
    with open(file_path, 'r') as f:
        return json.load(f)

def save_results(file_path: str, results: Dict[str, Any]) -> None:
    """Save results to JSON file"""
    def convert_nan_to_null(obj):
        if isinstance(obj, dict):
            return {k: convert_nan_to_null(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_nan_to_null(v) for v in obj]
        elif isinstance(obj, float) and np.isnan(obj):
            return None
        else:
            return obj
    
    cleaned_results = convert_nan_to_null(results)
    with open(file_path, 'w') as f:
        json.dump(cleaned_results, f, indent=2, default=str)

def create_dataframe(data: Dict[str, Any]) -> pd.DataFrame:
    """Convert input data to pandas DataFrame"""
    if 'preview' in data and isinstance(data['preview'], list):
        return pd.DataFrame(data['preview'])
    elif isinstance(data, list):
        return pd.DataFrame(data)
    else:
        raise ValueError("Invalid data format")

def descriptive_analysis(df: pd.DataFrame) -> Dict[str, Any]:
    """Perform BASIC descriptive analysis for free trial - limited to essential stats only"""
    
    # Identify column types
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
    
    results = {
        'basic_info': {
            'shape': df.shape,
            'columns': list(df.columns),
            'dtypes': df.dtypes.to_dict(),
            'missing_values': df.isnull().sum().to_dict(),
            'numeric_columns': numeric_cols,
            'categorical_columns': categorical_cols
        },
        'numerical_summary': {},
        'categorical_summary': {}
    }
    
    # BASIC Numerical Analysis - Only essential stats
    if len(numeric_cols) > 0:
        results['numerical_summary'] = {
            'count': df[numeric_cols].count().to_dict(),
            'mean': df[numeric_cols].mean().to_dict(),
            'std': df[numeric_cols].std().to_dict(),
            'min': df[numeric_cols].min().to_dict(),
            'max': df[numeric_cols].max().to_dict(),
            'median': df[numeric_cols].median().to_dict()
        }
    
    # BASIC Categorical Analysis - Only essential stats
    if len(categorical_cols) > 0:
        cat_summary = {}
        for col in categorical_cols:
            cat_summary[col] = {
                'unique_count': df[col].nunique(),
                'top_values': df[col].value_counts().head(3).to_dict(),  # Only top 3
                'missing_count': df[col].isnull().sum()
            }
        results['categorical_summary'] = cat_summary
    
    return results

def create_visualization(df: pd.DataFrame, viz_type: str, column: str = None) -> str:
    """Create a visualization and return as base64 encoded string"""
    plt.style.use('seaborn-v0_8')
    fig, ax = plt.subplots(figsize=(10, 6))
    
    try:
        if viz_type == 'correlation_heatmap':
            numerical_cols = df.select_dtypes(include=[np.number]).columns
            if len(numerical_cols) > 1:
                corr_matrix = df[numerical_cols].corr()
                sns.heatmap(corr_matrix, annot=True, cmap='coolwarm', center=0, ax=ax)
                ax.set_title('Correlation Heatmap')
            else:
                ax.text(0.5, 0.5, 'Not enough numerical columns for correlation', 
                       ha='center', va='center', transform=ax.transAxes)
                ax.set_title('Correlation Analysis Not Available')
        
        elif viz_type == 'distribution_overview':
            numerical_cols = df.select_dtypes(include=[np.number]).columns
            if len(numerical_cols) > 0:
                # Create simple histogram for FIRST numeric column only
                col = numerical_cols[0]
                col_data = df[col].dropna()
                if len(col_data) > 0:
                    col_data.hist(bins=20, ax=ax, alpha=0.7, color='skyblue')
                    ax.set_title(f'Distribution of {col}')
                    ax.set_xlabel(col)
                    ax.set_ylabel('Frequency')
                    ax.grid(True, alpha=0.3)
                else:
                    ax.text(0.5, 0.5, 'No data available for distribution', 
                           ha='center', va='center', transform=ax.transAxes)
                    ax.set_title('Distribution Analysis Not Available')
            else:
                ax.text(0.5, 0.5, 'No numerical columns for distribution analysis', 
                       ha='center', va='center', transform=ax.transAxes)
                ax.set_title('Distribution Analysis Not Available')
        
        elif viz_type == 'categorical_counts':
            categorical_cols = df.select_dtypes(include=['object', 'category']).columns
            if len(categorical_cols) > 0:
                col = categorical_cols[0]  # Use first categorical column
                top_values = df[col].value_counts().head(5)  # Only top 5 for simplicity
                bars = ax.bar(range(len(top_values)), top_values.values, color='lightcoral', alpha=0.7)
                ax.set_title(f'Top Values in {col}')
                ax.set_xlabel(col)
                ax.set_ylabel('Count')
                ax.set_xticks(range(len(top_values)))
                ax.set_xticklabels(top_values.index, rotation=45, ha='right')
                ax.grid(True, alpha=0.3)
            else:
                ax.text(0.5, 0.5, 'No categorical columns for count analysis', 
                       ha='center', va='center', transform=ax.transAxes)
                ax.set_title('Categorical Analysis Not Available')
        
        plt.tight_layout()
        
        # Convert to base64
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        
        image_base64 = base64.b64encode(buffer.getvalue()).decode()
        plt.close(fig)
        
        return image_base64
        
    except Exception as e:
        plt.close(fig)
        # Return a simple error visualization
        fig, ax = plt.subplots(figsize=(8, 4))
        ax.text(0.5, 0.5, f'Visualization Error: {str(e)[:50]}...', 
               ha='center', va='center', transform=ax.transAxes)
        ax.set_title(f'Error in {viz_type}')
        
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        
        image_base64 = base64.b64encode(buffer.getvalue()).decode()
        plt.close(fig)
        
        return image_base64

def analyze_trial_data(input_file: str, config_file: str, output_file: str) -> None:
    """Main analysis function for trial data"""
    try:
        # Load data and config
        data = load_data(input_file)
        config = load_data(config_file)
        
        # Create DataFrame
        df = create_dataframe(data)
        
        # Perform descriptive analysis
        descriptive_results = descriptive_analysis(df)
        
        # Create basic visualizations - LIMITED to 2 charts for free trial
        visualizations = []
        
        # Only create 2 basic visualizations for free trial
        viz_types = ['distribution_overview', 'categorical_counts']
        for viz_type in viz_types:
            try:
                viz_base64 = create_visualization(df, viz_type)
                visualizations.append({
                    'type': viz_type,
                    'title': viz_type.replace('_', ' ').title(),
                    'image': viz_base64
                })
            except Exception as e:
                print(f"Warning: Failed to create {viz_type}: {e}")
        
        # Prepare results
        results = {
            'data': {
                'descriptive_analysis': descriptive_results,
                'insights': generate_insights(df, descriptive_results),
                'data_quality': assess_data_quality(df)
            },
            'visualizations': visualizations
        }
        
        # Save results
        save_results(output_file, results)
        
    except Exception as e:
        # Save error results
        error_results = {
            'data': {'error': str(e)},
            'visualizations': []
        }
        save_results(output_file, error_results)

def generate_insights(df: pd.DataFrame, descriptive_results: Dict[str, Any]) -> List[str]:
    """Generate basic insights from the analysis"""
    insights = []
    
    # Data shape insights
    rows, cols = df.shape
    insights.append(f"Dataset contains {rows:,} rows and {cols} columns")
    
    # Missing data insights
    missing_data = df.isnull().sum()
    missing_cols = missing_data[missing_data > 0]
    if len(missing_cols) > 0:
        insights.append(f"Found missing values in {len(missing_cols)} columns")
    else:
        insights.append("No missing values detected")
    
    # Data type insights
    numerical_cols = len(df.select_dtypes(include=[np.number]).columns)
    categorical_cols = len(df.select_dtypes(include=['object', 'category']).columns)
    insights.append(f"Data includes {numerical_cols} numerical and {categorical_cols} categorical columns")
    
    # Numerical insights
    if numerical_cols > 0:
        numerical_data = df.select_dtypes(include=[np.number])
        high_variance_cols = []
        for col in numerical_data.columns:
            if numerical_data[col].var() > numerical_data[col].mean() * 2:
                high_variance_cols.append(col)
        
        if high_variance_cols:
            insights.append(f"High variance detected in: {', '.join(high_variance_cols[:3])}")
    
    return insights

def calculate_entropy(series: pd.Series) -> float:
    """Calculate entropy for categorical variable"""
    try:
        value_counts = series.value_counts()
        probabilities = value_counts / len(series)
        entropy = -sum(probabilities * np.log2(probabilities + 1e-9))
        return float(entropy)
    except:
        return 0.0

def find_strong_correlations(corr_matrix: pd.DataFrame, threshold: float = 0.7) -> List[Dict]:
    """Find pairs of variables with strong correlations"""
    strong_corr = []
    for i in range(len(corr_matrix.columns)):
        for j in range(i+1, len(corr_matrix.columns)):
            corr_val = corr_matrix.iloc[i, j]
            if abs(corr_val) >= threshold:
                strong_corr.append({
                    'var1': corr_matrix.columns[i],
                    'var2': corr_matrix.columns[j],
                    'correlation': float(corr_val),
                    'strength': 'very strong' if abs(corr_val) >= 0.9 else 'strong'
                })
    return strong_corr

def generate_correlation_insights(corr_matrix: pd.DataFrame) -> List[str]:
    """Generate insights from correlation matrix"""
    insights = []
    strong_correlations = find_strong_correlations(corr_matrix)
    
    if strong_correlations:
        insights.append(f"Found {len(strong_correlations)} strong correlations")
        for corr in strong_correlations[:3]:  # Top 3
            insights.append(f"{corr['var1']} and {corr['var2']}: {corr['correlation']:.2f}")
    else:
        insights.append("No strong correlations detected between numerical variables")
    
    return insights

def perform_anova(df: pd.DataFrame, categorical_col: str, numeric_col: str) -> float:
    """Perform ANOVA test between categorical and numeric variables"""
    try:
        from scipy.stats import f_oneway
        groups = [group[numeric_col].dropna() for name, group in df.groupby(categorical_col)]
        if len(groups) > 1 and all(len(g) > 0 for g in groups):
            f_stat, p_value = f_oneway(*groups)
            return float(p_value)
    except:
        pass
    return 1.0  # No significant difference

def recommend_variable_pairs(df: pd.DataFrame, numeric_cols: List[str], categorical_cols: List[str]) -> List[Dict]:
    """Recommend interesting variable pairs for analysis"""
    recommendations = []
    
    # Numeric pairs with high correlation
    if len(numeric_cols) > 1:
        corr_matrix = df[numeric_cols].corr()
        strong_corrs = find_strong_correlations(corr_matrix, threshold=0.5)
        for corr in strong_corrs[:3]:
            recommendations.append({
                'type': 'correlation',
                'variables': [corr['var1'], corr['var2']],
                'reason': f"Strong correlation ({corr['correlation']:.2f})",
                'analysis_type': 'scatter_plot'
            })
    
    # Categorical-numeric pairs with potential differences
    for cat_col in categorical_cols[:2]:
        if df[cat_col].nunique() <= 10:  # Reasonable number of categories
            for num_col in numeric_cols[:3]:
                p_value = perform_anova(df, cat_col, num_col)
                if p_value < 0.05:
                    recommendations.append({
                        'type': 'group_difference',
                        'variables': [cat_col, num_col],
                        'reason': f"Significant group differences (p={p_value:.3f})",
                        'analysis_type': 'box_plot'
                    })
    
    return recommendations

def detect_outliers(df: pd.DataFrame, numeric_cols: List[str]) -> Dict[str, List]:
    """Detect outliers using IQR method"""
    outliers = {}
    for col in numeric_cols:
        Q1 = df[col].quantile(0.25)
        Q3 = df[col].quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        
        outlier_indices = df[(df[col] < lower_bound) | (df[col] > upper_bound)].index.tolist()
        outliers[col] = {
            'count': len(outlier_indices),
            'percentage': len(outlier_indices) / len(df) * 100,
            'bounds': {'lower': float(lower_bound), 'upper': float(upper_bound)}
        }
    
    return outliers

def calculate_feature_importance(df: pd.DataFrame, numeric_cols: List[str], categorical_cols: List[str]) -> Dict[str, float]:
    """Calculate basic feature importance metrics"""
    importance = {}
    
    # For numeric variables, use variance as importance measure
    for col in numeric_cols:
        importance[col] = float(df[col].var() / (df[col].mean() + 1e-9))
    
    # For categorical variables, use entropy
    for col in categorical_cols:
        importance[col] = calculate_entropy(df[col])
    
    return importance

def assess_data_quality(df: pd.DataFrame) -> Dict[str, Any]:
    """Assess data quality metrics"""
    return {
        'completeness': {
            'overall': float((df.size - df.isnull().sum().sum()) / df.size * 100),
            'by_column': ((df.count() / len(df)) * 100).to_dict()
        },
        'uniqueness': {
            'duplicate_rows': int(df.duplicated().sum()),
            'unique_ratio_by_column': (df.nunique() / len(df)).to_dict()
        },
        'consistency': {
            'data_types_consistent': len(df.columns) == len(df.dtypes),
            'column_count': len(df.columns)
        }
    }

if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: python trial_analyzer.py <input_file> <config_file> <output_file>")
        sys.exit(1)
    
    input_file, config_file, output_file = sys.argv[1:4]
    analyze_trial_data(input_file, config_file, output_file)