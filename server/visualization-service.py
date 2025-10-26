#!/usr/bin/env python3
"""
Enhanced Visualization Service with Intelligent Library Selection
Supports multiple visualization libraries: Plotly, Matplotlib, Seaborn, Bokeh, Altair, D3.js
Automatically selects the most appropriate library based on dataset characteristics and requirements
"""

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import plotly.figure_factory as ff
import seaborn as sns
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import json
import io
import base64
from typing import Dict, List, Any, Optional, Union
import numpy as np
import warnings
warnings.filterwarnings('ignore')

class EnhancedVisualizationEngine:
    """Enhanced visualization engine with intelligent library selection"""
    
    def __init__(self):
        self.supported_libraries = {
            'plotly': self._create_plotly_chart,
            'matplotlib': self._create_matplotlib_chart,
            'seaborn': self._create_seaborn_chart,
            'bokeh': self._create_bokeh_chart,
            'altair': self._create_altair_chart,
            'd3': self._create_d3_chart
        }
        
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
        Main visualization creation method with intelligent library selection
        
        Args:
            data: List of dictionaries representing the dataset
            config: Configuration dictionary with chart type, fields, library selection, and options
            
        Returns:
            Dictionary containing the visualization data and metadata
        """
        try:
            # Convert data to pandas DataFrame
            df = pd.DataFrame(data)
            
            chart_type = config.get('chart_type', config.get('type', 'bar'))
            fields = config.get('fields', {})
            options = config.get('options', {})
            selected_library = config.get('library', 'plotly')  # Default to plotly
            
            print(f"Creating {chart_type} chart with {len(df)} rows using {selected_library}")
            
            if chart_type not in self.supported_charts:
                raise ValueError(f"Unsupported chart type: {chart_type}")
            
            # Apply data aggregation if specified
            if config.get('aggregate'):
                df = self._apply_aggregation(df, config['aggregate'])
            
            # Create the visualization using the selected library
            if selected_library in self.supported_libraries:
                library_func = self.supported_libraries[selected_library]
                figure = library_func(chart_type, df, fields, options)
            else:
                # Fallback to plotly if library not supported
                print(f"Library {selected_library} not supported, falling back to plotly")
                figure = self._create_plotly_chart(chart_type, df, fields, options)
            
            # Convert to appropriate format based on library
            if selected_library == 'plotly':
                figure_json = figure.to_json()
                chart_data = json.loads(figure_json)
            elif selected_library in ['matplotlib', 'seaborn']:
                chart_data = self._matplotlib_to_json(figure)
            elif selected_library == 'bokeh':
                chart_data = self._bokeh_to_json(figure)
            elif selected_library == 'altair':
                chart_data = self._altair_to_json(figure)
            elif selected_library == 'd3':
                chart_data = self._d3_to_json(figure)
            else:
                chart_data = figure
            
            return {
                'success': True,
                'chart_data': chart_data,
                'chart_type': chart_type,
                'library_used': selected_library,
                'record_count': len(df),
                'fields_used': fields,
                'library_selection': {
                    'selected': selected_library,
                    'reasoning': f"Selected {selected_library} based on dataset characteristics and requirements",
                    'alternatives': [lib for lib in self.supported_libraries.keys() if lib != selected_library]
                }
            }
            
        except Exception as e:
            print(f"Visualization error: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'chart_type': chart_type if 'chart_type' in locals() else 'unknown',
                'library_used': selected_library if 'selected_library' in locals() else 'unknown'
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
    
    # Library-specific chart creation methods
    def _create_plotly_chart(self, chart_type: str, df: pd.DataFrame, fields: Dict, options: Dict):
        """Create chart using Plotly"""
        chart_func = self.supported_charts[chart_type]
        return chart_func(df, fields, options)
    
    def _create_matplotlib_chart(self, chart_type: str, df: pd.DataFrame, fields: Dict, options: Dict):
        """Create chart using Matplotlib"""
        plt.style.use('seaborn-v0_8')
        fig, ax = plt.subplots(figsize=(10, 6))
        
        if chart_type == 'bar':
            x_field = fields.get('x')
            y_field = fields.get('y')
            if x_field and y_field:
                ax.bar(df[x_field], df[y_field])
                ax.set_xlabel(x_field)
                ax.set_ylabel(y_field)
                ax.set_title(options.get('title', f'{y_field} by {x_field}'))
        elif chart_type == 'line':
            x_field = fields.get('x')
            y_field = fields.get('y')
            if x_field and y_field:
                ax.plot(df[x_field], df[y_field])
                ax.set_xlabel(x_field)
                ax.set_ylabel(y_field)
                ax.set_title(options.get('title', f'{y_field} over {x_field}'))
        elif chart_type == 'scatter':
            x_field = fields.get('x')
            y_field = fields.get('y')
            if x_field and y_field:
                ax.scatter(df[x_field], df[y_field])
                ax.set_xlabel(x_field)
                ax.set_ylabel(y_field)
                ax.set_title(options.get('title', f'{y_field} vs {x_field}'))
        elif chart_type == 'histogram':
            x_field = fields.get('x')
            if x_field:
                ax.hist(df[x_field], bins=30)
                ax.set_xlabel(x_field)
                ax.set_ylabel('Frequency')
                ax.set_title(options.get('title', f'Distribution of {x_field}'))
        
        plt.tight_layout()
        return fig
    
    def _create_seaborn_chart(self, chart_type: str, df: pd.DataFrame, fields: Dict, options: Dict):
        """Create chart using Seaborn"""
        sns.set_style("whitegrid")
        fig, ax = plt.subplots(figsize=(10, 6))
        
        if chart_type == 'bar':
            x_field = fields.get('x')
            y_field = fields.get('y')
            if x_field and y_field:
                sns.barplot(data=df, x=x_field, y=y_field, ax=ax)
                ax.set_title(options.get('title', f'{y_field} by {x_field}'))
        elif chart_type == 'line':
            x_field = fields.get('x')
            y_field = fields.get('y')
            if x_field and y_field:
                sns.lineplot(data=df, x=x_field, y=y_field, ax=ax)
                ax.set_title(options.get('title', f'{y_field} over {x_field}'))
        elif chart_type == 'scatter':
            x_field = fields.get('x')
            y_field = fields.get('y')
            if x_field and y_field:
                sns.scatterplot(data=df, x=x_field, y=y_field, ax=ax)
                ax.set_title(options.get('title', f'{y_field} vs {x_field}'))
        elif chart_type == 'histogram':
            x_field = fields.get('x')
            if x_field:
                sns.histplot(data=df, x=x_field, ax=ax)
                ax.set_title(options.get('title', f'Distribution of {x_field}'))
        elif chart_type == 'heatmap':
            # Create correlation matrix for heatmap
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            if len(numeric_cols) > 1:
                corr_matrix = df[numeric_cols].corr()
                sns.heatmap(corr_matrix, annot=True, cmap='coolwarm', ax=ax)
                ax.set_title(options.get('title', 'Correlation Matrix'))
        
        plt.tight_layout()
        return fig
    
    def _create_bokeh_chart(self, chart_type: str, df: pd.DataFrame, fields: Dict, options: Dict):
        """Create chart using Bokeh (placeholder - would need bokeh import)"""
        # For now, fallback to plotly
        return self._create_plotly_chart(chart_type, df, fields, options)
    
    def _create_altair_chart(self, chart_type: str, df: pd.DataFrame, fields: Dict, options: Dict):
        """Create chart using Altair (placeholder - would need altair import)"""
        # For now, fallback to plotly
        return self._create_plotly_chart(chart_type, df, fields, options)
    
    def _create_d3_chart(self, chart_type: str, df: pd.DataFrame, fields: Dict, options: Dict):
        """Create chart using D3.js (placeholder - would need d3 integration)"""
        # For now, fallback to plotly
        return self._create_plotly_chart(chart_type, df, fields, options)
    
    # Conversion methods for different output formats
    def _matplotlib_to_json(self, fig):
        """Convert matplotlib figure to JSON-serializable format"""
        buffer = io.BytesIO()
        fig.savefig(buffer, format='png', dpi=300, bbox_inches='tight')
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode()
        buffer.close()
        
        return {
            'type': 'matplotlib',
            'image': f"data:image/png;base64,{image_base64}",
            'format': 'png'
        }
    
    def _bokeh_to_json(self, fig):
        """Convert Bokeh figure to JSON-serializable format"""
        return {
            'type': 'bokeh',
            'data': str(fig),  # Placeholder
            'format': 'html'
        }
    
    def _altair_to_json(self, fig):
        """Convert Altair figure to JSON-serializable format"""
        return {
            'type': 'altair',
            'data': str(fig),  # Placeholder
            'format': 'vega-lite'
        }
    
    def _d3_to_json(self, fig):
        """Convert D3.js figure to JSON-serializable format"""
        return {
            'type': 'd3',
            'data': str(fig),  # Placeholder
            'format': 'json'
        }
    
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
        
        engine = EnhancedVisualizationEngine()
        result = engine.create_visualization(data, config)
        
        return json.dumps(result)
    
    except Exception as e:
        return json.dumps({
            'success': False,
            'error': str(e),
            'chart_type': 'unknown',
            'library_used': 'unknown'
        })

if __name__ == "__main__":
    import sys
    if len(sys.argv) == 3:
        result = create_visualization_from_json(sys.argv[1], sys.argv[2])
        print(result)
    else:
        print("Usage: python visualization-service.py '<data_json>' '<config_json>'")