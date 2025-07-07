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
    with open(file_path, 'w') as f:
        json.dump(results, f, indent=2, default=str)

def create_dataframe(data: Dict[str, Any]) -> pd.DataFrame:
    """Convert input data to pandas DataFrame"""
    if 'preview' in data and isinstance(data['preview'], list):
        return pd.DataFrame(data['preview'])
    elif isinstance(data, list):
        return pd.DataFrame(data)
    else:
        raise ValueError("Invalid data format")

def descriptive_analysis(df: pd.DataFrame) -> Dict[str, Any]:
    """Perform descriptive statistical analysis"""
    results = {
        'basic_info': {
            'shape': df.shape,
            'columns': list(df.columns),
            'dtypes': df.dtypes.to_dict(),
            'missing_values': df.isnull().sum().to_dict(),
            'memory_usage': df.memory_usage(deep=True).sum()
        },
        'numerical_summary': {},
        'categorical_summary': {}
    }
    
    # Numerical columns analysis
    numerical_cols = df.select_dtypes(include=[np.number]).columns
    if len(numerical_cols) > 0:
        results['numerical_summary'] = df[numerical_cols].describe().to_dict()
        
        # Add additional statistics
        for col in numerical_cols:
            if col not in results['numerical_summary']:
                results['numerical_summary'][col] = {}
            
            results['numerical_summary'][col].update({
                'skewness': float(df[col].skew()) if not df[col].empty else 0,
                'kurtosis': float(df[col].kurtosis()) if not df[col].empty else 0,
                'variance': float(df[col].var()) if not df[col].empty else 0
            })
    
    # Categorical columns analysis
    categorical_cols = df.select_dtypes(include=['object', 'category']).columns
    if len(categorical_cols) > 0:
        for col in categorical_cols[:5]:  # Limit to first 5 categorical columns
            value_counts = df[col].value_counts().head(10)
            results['categorical_summary'][col] = {
                'unique_count': int(df[col].nunique()),
                'top_values': value_counts.to_dict(),
                'most_frequent': str(df[col].mode().iloc[0]) if not df[col].mode().empty else None
            }
    
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
                # Create subplot for multiple distributions
                n_cols = min(3, len(numerical_cols))
                n_rows = (len(numerical_cols) + n_cols - 1) // n_cols
                
                fig, axes = plt.subplots(n_rows, n_cols, figsize=(15, 5*n_rows))
                if n_rows == 1 and n_cols == 1:
                    axes = [axes]
                elif n_rows == 1:
                    axes = axes
                else:
                    axes = axes.flatten()
                
                for i, col in enumerate(numerical_cols[:6]):  # Limit to 6 distributions
                    ax = axes[i] if len(numerical_cols) > 1 else axes[0]
                    df[col].hist(bins=20, ax=ax, alpha=0.7)
                    ax.set_title(f'Distribution of {col}')
                    ax.set_xlabel(col)
                    ax.set_ylabel('Frequency')
                
                # Hide empty subplots
                for i in range(len(numerical_cols), len(axes)):
                    axes[i].set_visible(False)
            else:
                ax.text(0.5, 0.5, 'No numerical columns for distribution analysis', 
                       ha='center', va='center', transform=ax.transAxes)
                ax.set_title('Distribution Analysis Not Available')
        
        elif viz_type == 'categorical_counts':
            categorical_cols = df.select_dtypes(include=['object', 'category']).columns
            if len(categorical_cols) > 0:
                col = categorical_cols[0]  # Use first categorical column
                top_values = df[col].value_counts().head(10)
                top_values.plot(kind='bar', ax=ax)
                ax.set_title(f'Top Values in {col}')
                ax.set_xlabel(col)
                ax.set_ylabel('Count')
                plt.xticks(rotation=45)
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
        
        # Create basic visualizations
        visualizations = []
        
        viz_types = ['correlation_heatmap', 'distribution_overview', 'categorical_counts']
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