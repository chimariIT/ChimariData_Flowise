
import json
import sys
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px
import plotly.graph_objects as go
import plotly.offline as pyo
import numpy as np
import io
import base64
from typing import Dict, Any, List, Tuple, Optional
import warnings
warnings.filterwarnings('ignore')

# Set matplotlib backend to non-interactive
plt.switch_backend('Agg')

# Configure seaborn style
sns.set_style("whitegrid")

def create_advanced_visualization(config):
    """Create advanced visualizations using multiple libraries"""
    data = pd.DataFrame(config['data'])
    chart_config = config.get('chartConfig', {})
    chart_type = chart_config.get('chartType', 'bar')
    x_axis = chart_config.get('xAxis')
    y_axis = chart_config.get('yAxis') 
    group_by = chart_config.get('groupBy')
    aggregation = chart_config.get('aggregation', 'sum')
    output_path = config['output_path']
    
    results = {
        'success': False,
        'chart_path': output_path,
        'insights': [],
        'processedData': [],
        'statistics': {}
    }
    
    try:
        # Data preprocessing
        if aggregation and y_axis:
            if group_by and x_axis:
                # Group by x_axis and group_by, aggregate y_axis
                grouped_data = data.groupby([x_axis, group_by])[y_axis].agg(aggregation).reset_index()
            elif x_axis:
                # Group by x_axis, aggregate y_axis
                grouped_data = data.groupby(x_axis)[y_axis].agg(aggregation).reset_index()
            else:
                grouped_data = data
        else:
            grouped_data = data
            
        results['processedData'] = grouped_data.to_dict('records')
        
        # Set up matplotlib figure
        plt.style.use('seaborn-v0_8-whitegrid')
        fig, ax = plt.subplots(figsize=(12, 8))
        
        # Generate visualization based on chart type
        if chart_type == 'bar':
            create_bar_chart(grouped_data, x_axis, y_axis, group_by, ax)
            results['insights'].append(f"Bar chart shows distribution of {y_axis} across {x_axis}")
            
        elif chart_type == 'line':
            create_line_chart(grouped_data, x_axis, y_axis, group_by, ax)
            results['insights'].append(f"Line chart reveals trends in {y_axis} over {x_axis}")
            
        elif chart_type == 'scatter':
            create_scatter_plot(grouped_data, x_axis, y_axis, group_by, ax)
            correlation = grouped_data[x_axis].corr(grouped_data[y_axis]) if x_axis and y_axis else 0
            results['insights'].append(f"Correlation between {x_axis} and {y_axis}: {correlation:.3f}")
            results['statistics']['correlation'] = correlation
            
        elif chart_type == 'pie':
            create_pie_chart(grouped_data, x_axis, y_axis, ax)
            results['insights'].append(f"Pie chart shows proportional breakdown of {y_axis} by {x_axis}")
            
        elif chart_type == 'histogram':
            create_histogram(data, x_axis, ax)
            mean_val = data[x_axis].mean() if x_axis else 0
            std_val = data[x_axis].std() if x_axis else 0
            results['insights'].append(f"Distribution of {x_axis}: Mean = {mean_val:.2f}, Std = {std_val:.2f}")
            results['statistics'].update({'mean': mean_val, 'std': std_val})
            
        elif chart_type == 'boxplot':
            create_box_plot(data, x_axis, y_axis, ax)
            results['insights'].append(f"Box plot reveals distribution and outliers in {y_axis} by {x_axis}")
            
        elif chart_type == 'heatmap':
            create_heatmap(data, ax)
            results['insights'].append("Heatmap shows correlation patterns between numeric variables")
            
        elif chart_type == 'violin':
            create_violin_plot(data, x_axis, y_axis, ax)
            results['insights'].append(f"Violin plot shows detailed distribution of {y_axis} across {x_axis}")
            
        # Save the plot
        plt.tight_layout()
        plt.savefig(output_path, dpi=300, bbox_inches='tight', facecolor='white', edgecolor='none')
        plt.close()
        
        results['success'] = True
        return results
        
    except Exception as e:
        results['insights'].append(f"Error creating visualization: {str(e)}")
        return results

def create_bar_chart(data, x_axis, y_axis, group_by, ax):
    if group_by:
        # Grouped bar chart
        pivot_data = data.pivot(index=x_axis, columns=group_by, values=y_axis)
        pivot_data.plot(kind='bar', ax=ax, rot=45)
        ax.legend(title=group_by)
    else:
        # Simple bar chart
        sns.barplot(data=data, x=x_axis, y=y_axis, ax=ax)
    ax.set_title(f'{y_axis} by {x_axis}')

def create_line_chart(data, x_axis, y_axis, group_by, ax):
    if group_by:
        # Multiple lines
        for group in data[group_by].unique():
            group_data = data[data[group_by] == group]
            ax.plot(group_data[x_axis], group_data[y_axis], label=group, marker='o')
        ax.legend(title=group_by)
    else:
        # Single line
        ax.plot(data[x_axis], data[y_axis], marker='o')
    ax.set_title(f'{y_axis} over {x_axis}')
    ax.set_xlabel(x_axis)
    ax.set_ylabel(y_axis)

def create_scatter_plot(data, x_axis, y_axis, group_by, ax):
    if group_by:
        sns.scatterplot(data=data, x=x_axis, y=y_axis, hue=group_by, ax=ax, s=60, alpha=0.7)
    else:
        sns.scatterplot(data=data, x=x_axis, y=y_axis, ax=ax, s=60, alpha=0.7)
    ax.set_title(f'{y_axis} vs {x_axis}')

def create_pie_chart(data, x_axis, y_axis, ax):
    # Aggregate data for pie chart
    pie_data = data.groupby(x_axis)[y_axis].sum()
    ax.pie(pie_data.values, labels=pie_data.index, autopct='%1.1f%%', startangle=90)
    ax.set_title(f'Distribution of {y_axis} by {x_axis}')

def create_histogram(data, x_axis, ax):
    ax.hist(data[x_axis], bins=30, alpha=0.7, edgecolor='black')
    ax.set_title(f'Distribution of {x_axis}')
    ax.set_xlabel(x_axis)
    ax.set_ylabel('Frequency')

def create_box_plot(data, x_axis, y_axis, ax):
    sns.boxplot(data=data, x=x_axis, y=y_axis, ax=ax)
    ax.set_title(f'{y_axis} Distribution by {x_axis}')
    plt.xticks(rotation=45)

def create_heatmap(data, ax):
    numeric_cols = data.select_dtypes(include=[np.number]).columns
    if len(numeric_cols) > 1:
        corr_matrix = data[numeric_cols].corr()
        sns.heatmap(corr_matrix, annot=True, cmap='coolwarm', center=0, 
                   square=True, fmt='.2f', cbar_kws={'shrink': 0.8}, ax=ax)
        ax.set_title('Correlation Matrix')

def create_violin_plot(data, x_axis, y_axis, ax):
    sns.violinplot(data=data, x=x_axis, y=y_axis, ax=ax)
    ax.set_title(f'{y_axis} Distribution by {x_axis}')
    plt.xticks(rotation=45)

def create_visualization(config):
    """Legacy function for backward compatibility"""
    return create_advanced_visualization(config)
    
    try:
        if viz_type == 'correlation_matrix':
            numeric_cols = data.select_dtypes(include=[np.number]).columns
            if len(numeric_cols) > 1:
                corr_matrix = data[numeric_cols].corr()
                sns.heatmap(corr_matrix, annot=True, cmap='coolwarm', center=0,
                           square=True, fmt='.2f', cbar_kws={'shrink': 0.8})
                plt.title('Correlation Matrix')
                print("INSIGHT: Strong correlations (>0.7 or <-0.7) indicate relationships between variables")
        
        elif viz_type == 'distribution':
            if selected_columns:
                col = selected_columns[0]
                if data[col].dtype in ['int64', 'float64']:
                    plt.subplot(1, 2, 1)
                    sns.histplot(data[col], kde=True)
                    plt.title(f'Distribution of {col}')
                    
                    plt.subplot(1, 2, 2)
                    sns.boxplot(y=data[col])
                    plt.title(f'Box Plot of {col}')
                    print(f"INSIGHT: Mean: {data[col].mean():.2f}, Median: {data[col].median():.2f}")
        
        elif viz_type == 'scatter_plot':
            if len(selected_columns) >= 2:
                x_col, y_col = selected_columns[0], selected_columns[1]
                if color_by and color_by in data.columns:
                    sns.scatterplot(data=data, x=x_col, y=y_col, hue=color_by, s=60, alpha=0.7)
                else:
                    sns.scatterplot(data=data, x=x_col, y=y_col, s=60, alpha=0.7)
                plt.title(f'{y_col} vs {x_col}')
                correlation = data[x_col].corr(data[y_col])
                print(f"INSIGHT: Correlation coefficient: {correlation:.3f}")
        
        elif viz_type == 'bar_chart':
            if selected_columns:
                col = selected_columns[0]
                if data[col].dtype == 'object':
                    value_counts = data[col].value_counts().head(10)
                    sns.barplot(x=value_counts.values, y=value_counts.index)
                    plt.title(f'Top Values in {col}')
                    print(f"INSIGHT: Most common value: {value_counts.index[0]} ({value_counts.iloc[0]} occurrences)")
        
        elif viz_type == 'multivariate':
            numeric_cols = data.select_dtypes(include=[np.number]).columns[:4]
            if len(numeric_cols) >= 2:
                sns.pairplot(data[numeric_cols], diag_kind='kde', plot_kws={'alpha': 0.6})
                plt.suptitle('Multivariate Analysis', y=1.02)
                print("INSIGHT: Pairplot reveals relationships between multiple variables simultaneously")
        
        else:
            # Default to basic statistics plot
            numeric_cols = data.select_dtypes(include=[np.number]).columns[:5]
            if len(numeric_cols) > 0:
                data[numeric_cols].describe().T.plot(kind='bar', stacked=True)
                plt.title('Statistical Summary')
                plt.xticks(rotation=45)
                print("INSIGHT: Statistical summary shows central tendency and spread of numeric variables")
        
        plt.tight_layout()
        plt.savefig(output_path, dpi=300, bbox_inches='tight', facecolor='white')
        plt.close()
        return True
        
    except Exception as e:
        print(f"Visualization error: {str(e)}")
        return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 visualization_generator.py <config_file>")
        sys.exit(1)
    
    config_file = sys.argv[1]
    
    try:
        with open(config_file, 'r') as f:
            config = json.load(f)
        
        # Check if this is using the new chartConfig format
        if 'chartConfig' in config:
            result = create_advanced_visualization(config)
            # Output results as JSON for the Node.js server to parse
            print(json.dumps(result))
            sys.exit(0 if result['success'] else 1)
        else:
            # Legacy format
            success = create_visualization(config)
            sys.exit(0 if success else 1)
        
    except Exception as e:
        error_result = {
            'success': False,
            'insights': [f"Error loading configuration: {str(e)}"],
            'processedData': [],
            'statistics': {}
        }
        print(json.dumps(error_result))
        sys.exit(1)
