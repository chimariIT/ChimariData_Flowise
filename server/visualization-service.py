#!/usr/bin/env python3
"""
Advanced Visualization Service using Plotly and Seaborn
Provides comprehensive data visualization capabilities with pandas integration
"""

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import plotly.figure_factory as ff
import seaborn as sns
import matplotlib.pyplot as plt
import json
import io
import base64
from typing import Dict, List, Any, Optional, Union
import numpy as np

class VisualizationEngine:
    """Advanced visualization engine with pandas dataframe integration"""
    
    def __init__(self):
        self.supported_charts = {
            'bar': self._create_bar_chart,
            'line': self._create_line_chart,
            'scatter': self._create_scatter_chart,
            'pie': self._create_pie_chart,
            'histogram': self._create_histogram,
            'boxplot': self._create_boxplot,
            'heatmap': self._create_heatmap,
            'violin': self._create_violin_chart,
            'correlation': self._create_correlation_matrix,
            'distribution': self._create_distribution_plot
        }
    
    def create_visualization(self, data: List[Dict], config: Dict) -> Dict:
        """
        Main visualization creation method
        
        Args:
            data: List of dictionaries representing the dataset
            config: Configuration dictionary with chart type, fields, and options
            
        Returns:
            Dictionary containing the visualization data and metadata
        """
        try:
            # Convert data to pandas DataFrame
            df = pd.DataFrame(data)
            
            chart_type = config.get('chart_type', 'bar')
            fields = config.get('fields', {})
            options = config.get('options', {})
            
            print(f"Creating {chart_type} chart with {len(df)} rows")
            
            if chart_type not in self.supported_charts:
                raise ValueError(f"Unsupported chart type: {chart_type}")
            
            # Apply data aggregation if specified
            if config.get('aggregate'):
                df = self._apply_aggregation(df, config['aggregate'])
            
            # Create the visualization
            viz_func = self.supported_charts[chart_type]
            figure = viz_func(df, fields, options)
            
            # Convert to JSON for frontend
            figure_json = figure.to_json()
            
            return {
                'success': True,
                'chart_data': json.loads(figure_json),
                'chart_type': chart_type,
                'record_count': len(df),
                'fields_used': fields
            }
            
        except Exception as e:
            print(f"Visualization error: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'chart_type': chart_type if 'chart_type' in locals() else 'unknown'
            }
    
    def _apply_aggregation(self, df: pd.DataFrame, agg_config: Dict) -> pd.DataFrame:
        """Apply aggregation to dataframe before visualization"""
        group_by = agg_config.get('group_by', [])
        aggregations = agg_config.get('aggregations', {})
        
        if not group_by or not aggregations:
            return df
        
        # Group and aggregate
        grouped = df.groupby(group_by)
        agg_result = grouped.agg(aggregations).reset_index()
        
        # Flatten column names if multi-level
        if isinstance(agg_result.columns, pd.MultiIndex):
            agg_result.columns = ['_'.join(col).strip() if col[1] else col[0] 
                                 for col in agg_result.columns.values]
        
        return agg_result
    
    def _create_bar_chart(self, df: pd.DataFrame, fields: Dict, options: Dict) -> go.Figure:
        """Create bar chart with plotly"""
        x_field = fields.get('x')
        y_field = fields.get('y')
        color_field = fields.get('color')
        
        if not x_field or not y_field:
            raise ValueError("Bar chart requires both x and y fields")
        
        fig = px.bar(
            df, 
            x=x_field, 
            y=y_field,
            color=color_field,
            title=options.get('title', f'{y_field} by {x_field}'),
            labels=options.get('labels', {}),
            height=options.get('height', 500)
        )
        
        # Apply styling
        fig.update_layout(
            xaxis_title=options.get('x_title', x_field),
            yaxis_title=options.get('y_title', y_field),
            showlegend=bool(color_field)
        )
        
        return fig
    
    def _create_line_chart(self, df: pd.DataFrame, fields: Dict, options: Dict) -> go.Figure:
        """Create line chart with plotly"""
        x_field = fields.get('x')
        y_field = fields.get('y')
        color_field = fields.get('color')
        
        if not x_field or not y_field:
            raise ValueError("Line chart requires both x and y fields")
        
        fig = px.line(
            df,
            x=x_field,
            y=y_field,
            color=color_field,
            title=options.get('title', f'{y_field} over {x_field}'),
            labels=options.get('labels', {}),
            height=options.get('height', 500)
        )
        
        fig.update_layout(
            xaxis_title=options.get('x_title', x_field),
            yaxis_title=options.get('y_title', y_field)
        )
        
        return fig
    
    def _create_scatter_chart(self, df: pd.DataFrame, fields: Dict, options: Dict) -> go.Figure:
        """Create scatter plot with plotly"""
        x_field = fields.get('x')
        y_field = fields.get('y')
        color_field = fields.get('color')
        size_field = fields.get('size')
        
        if not x_field or not y_field:
            raise ValueError("Scatter plot requires both x and y fields")
        
        fig = px.scatter(
            df,
            x=x_field,
            y=y_field,
            color=color_field,
            size=size_field,
            title=options.get('title', f'{y_field} vs {x_field}'),
            labels=options.get('labels', {}),
            height=options.get('height', 500)
        )
        
        fig.update_layout(
            xaxis_title=options.get('x_title', x_field),
            yaxis_title=options.get('y_title', y_field)
        )
        
        return fig
    
    def _create_pie_chart(self, df: pd.DataFrame, fields: Dict, options: Dict) -> go.Figure:
        """Create pie chart with plotly"""
        names_field = fields.get('names')
        values_field = fields.get('values')
        
        if not names_field:
            raise ValueError("Pie chart requires names field")
        
        if not values_field:
            # Count occurrences if no values field provided
            value_counts = df[names_field].value_counts()
            fig = px.pie(
                values=value_counts.values,
                names=value_counts.index,
                title=options.get('title', f'Distribution of {names_field}'),
                height=options.get('height', 500)
            )
        else:
            fig = px.pie(
                df,
                names=names_field,
                values=values_field,
                title=options.get('title', f'{values_field} by {names_field}'),
                height=options.get('height', 500)
            )
        
        return fig
    
    def _create_histogram(self, df: pd.DataFrame, fields: Dict, options: Dict) -> go.Figure:
        """Create histogram with plotly"""
        x_field = fields.get('x')
        color_field = fields.get('color')
        
        if not x_field:
            raise ValueError("Histogram requires x field")
        
        fig = px.histogram(
            df,
            x=x_field,
            color=color_field,
            nbins=options.get('bins', 30),
            title=options.get('title', f'Distribution of {x_field}'),
            labels=options.get('labels', {}),
            height=options.get('height', 500)
        )
        
        fig.update_layout(
            xaxis_title=options.get('x_title', x_field),
            yaxis_title='Count'
        )
        
        return fig
    
    def _create_boxplot(self, df: pd.DataFrame, fields: Dict, options: Dict) -> go.Figure:
        """Create box plot with plotly"""
        y_field = fields.get('y')
        x_field = fields.get('x')
        color_field = fields.get('color')
        
        if not y_field:
            raise ValueError("Box plot requires y field")
        
        fig = px.box(
            df,
            x=x_field,
            y=y_field,
            color=color_field,
            title=options.get('title', f'Box Plot of {y_field}'),
            labels=options.get('labels', {}),
            height=options.get('height', 500)
        )
        
        return fig
    
    def _create_heatmap(self, df: pd.DataFrame, fields: Dict, options: Dict) -> go.Figure:
        """Create heatmap with plotly"""
        x_field = fields.get('x')
        y_field = fields.get('y')
        z_field = fields.get('z')
        
        if not all([x_field, y_field, z_field]):
            # Create correlation heatmap if specific fields not provided
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            if len(numeric_cols) < 2:
                raise ValueError("Heatmap requires at least 2 numeric columns")
            
            corr_matrix = df[numeric_cols].corr()
            fig = px.imshow(
                corr_matrix,
                title=options.get('title', 'Correlation Heatmap'),
                color_continuous_scale='RdBu_r',
                height=options.get('height', 500)
            )
        else:
            # Create pivot table for heatmap
            pivot_table = df.pivot_table(
                values=z_field,
                index=y_field,
                columns=x_field,
                aggfunc='mean'
            )
            
            fig = px.imshow(
                pivot_table,
                title=options.get('title', f'{z_field} Heatmap'),
                labels={'color': z_field},
                height=options.get('height', 500)
            )
        
        return fig
    
    def _create_violin_chart(self, df: pd.DataFrame, fields: Dict, options: Dict) -> go.Figure:
        """Create violin plot with plotly"""
        y_field = fields.get('y')
        x_field = fields.get('x')
        color_field = fields.get('color')
        
        if not y_field:
            raise ValueError("Violin plot requires y field")
        
        fig = px.violin(
            df,
            x=x_field,
            y=y_field,
            color=color_field,
            title=options.get('title', f'Violin Plot of {y_field}'),
            labels=options.get('labels', {}),
            height=options.get('height', 500)
        )
        
        return fig
    
    def _create_correlation_matrix(self, df: pd.DataFrame, fields: Dict, options: Dict) -> go.Figure:
        """Create correlation matrix visualization"""
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        
        if len(numeric_cols) < 2:
            raise ValueError("Correlation matrix requires at least 2 numeric columns")
        
        corr_matrix = df[numeric_cols].corr()
        
        fig = go.Figure(data=go.Heatmap(
            z=corr_matrix.values,
            x=corr_matrix.columns,
            y=corr_matrix.columns,
            colorscale='RdBu_r',
            colorbar=dict(title="Correlation"),
            hoverongaps=False
        ))
        
        fig.update_layout(
            title=options.get('title', 'Correlation Matrix'),
            height=options.get('height', 500)
        )
        
        return fig
    
    def _create_distribution_plot(self, df: pd.DataFrame, fields: Dict, options: Dict) -> go.Figure:
        """Create distribution plot with plotly"""
        x_field = fields.get('x')
        
        if not x_field:
            raise ValueError("Distribution plot requires x field")
        
        # Create histogram with distribution curve
        fig = ff.create_distplot(
            [df[x_field].dropna()],
            [x_field],
            bin_size=options.get('bin_size', 0.1),
            show_hist=True,
            show_curve=True
        )
        
        fig.update_layout(
            title=options.get('title', f'Distribution of {x_field}'),
            height=options.get('height', 500)
        )
        
        return fig

# Main execution function for command line usage
def create_visualization_from_json(data_json: str, config_json: str) -> str:
    """
    Create visualization from JSON inputs (for command line interface)
    """
    try:
        data = json.loads(data_json)
        config = json.loads(config_json)
        
        engine = VisualizationEngine()
        result = engine.create_visualization(data, config)
        
        return json.dumps(result)
    
    except Exception as e:
        return json.dumps({
            'success': False,
            'error': str(e)
        })

if __name__ == "__main__":
    import sys
    if len(sys.argv) == 3:
        result = create_visualization_from_json(sys.argv[1], sys.argv[2])
        print(result)
    else:
        print("Usage: python visualization-service.py '<data_json>' '<config_json>'")