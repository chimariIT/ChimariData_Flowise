"""
Data Visualization Service

Generates visualization configurations for various chart types.
Supports multiple frontend rendering frameworks (React, D3, Chart.js, Recharts).

Visualization Types:
- Bar charts
- Line charts
- Scatter plots
- Heatmaps
- Histograms
- Pie charts
- Box plots
- Violin plots
- Gauge charts
- Treemaps
- Sankey diagrams
- Radar charts
"""

import json
import sys
import logging
from typing import Dict, List, Any, Optional, Tuple
from enum import Enum
import numpy as np
import pandas as pd

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# Visualization Types Enum
# ============================================================================

class ChartType(Enum):
    """Supported chart types"""
    BAR = "bar"
    LINE = "line"
    SCATTER = "scatter"
    HEATMAP = "heatmap"
    HISTOGRAM = "histogram"
    PIE = "pie"
    BOX_PLOT = "box_plot"
    VIOLIN_PLOT = "violin_plot"
    GAUGE = "gauge"
    TREEMAP = "treemap"
    SANKEY = "sankey"
    RADAR = "radar"
    AREA = "area"


# ============================================================================
# Color Palettes
# ============================================================================

COLOR_PALETTES = {
    "default": [
        "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
        "#8b5cf6", "#ec4899", "#6366f1", "#14b8a6"
    ],
    "categorical": [
        "#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0",
        "#9966FF", "#FF9F40", "#C9CBCF", "#E7E9ED"
    ],
    "sequential": [
        "#f7fbff", "#deebf7", "#c6dbef", "#9ecae1",
        "#6baed6", "#4292c6", "#2171b5", "#08519c"
    ],
    "diverging": [
        "#67001f", "#b2182b", "#d6604d", "#f4a582",
        "#fddbc7", "#f7f7f7", "#d1e5f0", "#92c5de",
        "#4393c3", "#2166ac", "#053061"
    ],
    "heatmap": [
        "#313695", "#4575b4", "#74add1", "#abd9e9",
        "#e0f3f8", "#ffffcc", "#fee090", "#fdae61",
        "#f46d43", "#d73027", "#a50026"
    ]
}


# ============================================================================
# Base Visualization Class
# ============================================================================

class Visualization:
    """Base class for all visualizations"""

    def __init__(
        self,
        chart_type: ChartType,
        title: str,
        data: List[Dict[str, Any]],
        config: Optional[Dict[str, Any]] = None
    ):
        self.chart_type = chart_type
        self.title = title
        self.data = data
        self.config = config or {}
        self.metadata = {
            "chartType": chart_type.value,
            "dataPoints": len(data),
            "generatedAt": pd.Timestamp.utcnow().isoformat()
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert visualization to dictionary"""
        return {
            "type": self.chart_type.value,
            "title": self.title,
            "data": self.data,
            "config": self.config,
            "metadata": self.metadata
        }

    def to_json(self) -> str:
        """Convert visualization to JSON string"""
        return json.dumps(self.to_dict(), indent=2)


# ============================================================================
# Chart Builders
# ============================================================================

class BarChartBuilder:
    """Build bar chart visualizations"""

    @staticmethod
    def build(
        data: pd.DataFrame,
        x_column: str,
        y_column: str,
        title: str = "Bar Chart",
        horizontal: bool = False,
        stacked: bool = False,
        group_by: Optional[str] = None
    ) -> Visualization:
        """
        Build a bar chart

        Args:
            data: Source DataFrame
            x_column: X-axis column
            y_column: Y-axis column
            title: Chart title
            horizontal: Horizontal bars
            stacked: Stacked bars
            group_by: Group by column

        Returns:
            Bar chart visualization
        """
        chart_data = []

        if group_by:
            # Grouped bar chart
            groups = data.groupby(group_by)
            for group_name, group_df in groups:
                for _, row in group_df.iterrows():
                    chart_data.append({
                        "x": str(row[x_column]),
                        "y": float(row[y_column]),
                        "group": str(group_name)
                    })
        else:
            # Simple bar chart
            for _, row in data.iterrows():
                chart_data.append({
                    "x": str(row[x_column]),
                    "y": float(row[y_column])
                })

        config = {
            "xAxis": x_column,
            "yAxis": y_column,
            "horizontal": horizontal,
            "stacked": stacked,
            "grouped": group_by is not None,
            "colors": COLOR_PALETTES["default"][:10]
        }

        return Visualization(
            chart_type=ChartType.BAR,
            title=title,
            data=chart_data,
            config=config
        )


class LineChartBuilder:
    """Build line chart visualizations"""

    @staticmethod
    def build(
        data: pd.DataFrame,
        x_column: str,
        y_columns: List[str],
        title: str = "Line Chart",
        smooth: bool = False,
        fill_area: bool = False
    ) -> Visualization:
        """
        Build a line chart

        Args:
            data: Source DataFrame
            x_column: X-axis column (usually date/time)
            y_columns: List of Y-axis columns
            title: Chart title
            smooth: Smooth line (spline)
            fill_area: Fill area under line

        Returns:
            Line chart visualization
        """
        chart_data = []

        for _, row in data.iterrows():
            data_point = {"x": str(row[x_column])}
            for col in y_columns:
                if col in data.columns:
                    data_point[col] = float(row[col]) if pd.notna(row[col]) else None
            chart_data.append(data_point)

        colors = COLOR_PALETTES["default"]
        series_config = []
        for i, col in enumerate(y_columns):
            series_config.append({
                "key": col,
                "color": colors[i % len(colors)]
            })

        config = {
            "xAxis": x_column,
            "yAxis": ", ".join(y_columns),
            "series": y_columns,
            "smooth": smooth,
            "fillArea": fill_area,
            "colors": [c["color"] for c in series_config]
        }

        return Visualization(
            chart_type=ChartType.LINE,
            title=title,
            data=chart_data,
            config=config
        )


class ScatterPlotBuilder:
    """Build scatter plot visualizations"""

    @staticmethod
    def build(
        data: pd.DataFrame,
        x_column: str,
        y_column: str,
        title: str = "Scatter Plot",
        color_by: Optional[str] = None,
        size_by: Optional[str] = None,
        show_trendline: bool = False
    ) -> Visualization:
        """
        Build a scatter plot

        Args:
            data: Source DataFrame
            x_column: X-axis column
            y_column: Y-axis column
            title: Chart title
            color_by: Column to color points by
            size_by: Column to size points by
            show_trendline: Show trend line

        Returns:
            Scatter plot visualization
        """
        chart_data = []

        for _, row in data.iterrows():
            point = {
                "x": float(row[x_column]) if pd.notna(row[x_column]) else None,
                "y": float(row[y_column]) if pd.notna(row[y_column]) else None
            }

            if color_by and color_by in data.columns:
                point["color"] = str(row[color_by])

            if size_by and size_by in data.columns:
                point["size"] = float(row[size_by])

            chart_data.append(point)

        # Calculate trend line if requested
        trend_line = None
        if show_trendline:
            valid_data = data[[x_column, y_column]].dropna()
            if len(valid_data) > 1:
                x_vals = valid_data[x_column].values
                y_vals = valid_data[y_column].values
                slope, intercept = np.polyfit(x_vals, y_vals, 1)
                trend_line = {
                    "slope": float(slope),
                    "intercept": float(intercept),
                    "rSquared": float(np.corrcoef(x_vals, y_vals)[0, 1] ** 2)
                }

        config = {
            "xAxis": x_column,
            "yAxis": y_column,
            "colorBy": color_by,
            "sizeBy": size_by,
            "trendLine": trend_line
        }

        return Visualization(
            chart_type=ChartType.SCATTER,
            title=title,
            data=chart_data,
            config=config
        )


class HeatmapBuilder:
    """Build heatmap visualizations"""

    @staticmethod
    def build(
        matrix: np.ndarray,
        x_labels: List[str],
        y_labels: List[str],
        title: str = "Heatmap",
        color_scale: str = "heatmap"
    ) -> Visualization:
        """
        Build a heatmap

        Args:
            matrix: 2D matrix of values
            x_labels: X-axis labels
            y_labels: Y-axis labels
            title: Chart title
            color_scale: Color scale name

        Returns:
            Heatmap visualization
        """
        chart_data = []

        for i, y_label in enumerate(y_labels):
            for j, x_label in enumerate(x_labels):
                chart_data.append({
                    "x": x_label,
                    "y": y_label,
                    "value": float(matrix[i, j])
                })

        # Calculate min/max for color scale
        valid_values = matrix[~np.isnan(matrix)]
        vmin = float(np.min(valid_values)) if len(valid_values) > 0 else 0
        vmax = float(np.max(valid_values)) if len(valid_values) > 0 else 0

        config = {
            "xAxis": "",
            "yAxis": "",
            "colorScale": color_scale,
            "colors": COLOR_PALETTES[color_scale],
            "valueRange": {"min": vmin, "max": vmax}
        }

        return Visualization(
            chart_type=ChartType.HEATMAP,
            title=title,
            data=chart_data,
            config=config
        )


class HistogramBuilder:
    """Build histogram visualizations"""

    @staticmethod
    def build(
        data: pd.Series,
        title: str = "Histogram",
        bins: int = 30,
        normalize: bool = False,
        show_density: bool = False
    ) -> Visualization:
        """
        Build a histogram

        Args:
            data: Source series
            title: Chart title
            bins: Number of bins
            normalize: Normalize to percentage
            show_density: Show density curve

        Returns:
            Histogram visualization
        """
        data_clean = data.dropna()

        if len(data_clean) == 0:
            return Visualization(
                chart_type=ChartType.HISTOGRAM,
                title=title,
                data=[],
                config={}
            )

        # Calculate histogram
        hist, bin_edges = np.histogram(data_clean, bins=bins)

        # Create bin labels (midpoints)
        bin_labels = []
        for i in range(len(bin_edges) - 1):
            bin_labels.append({
                "lower": float(bin_edges[i]),
                "upper": float(bin_edges[i + 1]),
                "mid": float((bin_edges[i] + bin_edges[i + 1]) / 2)
            })

        # Build chart data
        chart_data = []
        total = len(data_clean)

        for i, count in enumerate(hist):
            data_point = {
                "bin": bin_labels[i]["mid"],
                "range": f"{bin_labels[i]['lower']:.2f} - {bin_labels[i]['upper']:.2f}",
                "count": int(count)
            }
            if normalize:
                data_point["percentage"] = float(count / total * 100)
            chart_data.append(data_point)

        # Calculate density if requested
        density = None
        if show_density and len(data_clean) > 10:
            from scipy.stats import gaussian_kde
            kde = gaussian_kde(data_clean)
            x_range = np.linspace(data_clean.min(), data_clean.max(), 100)
            density = {
                "x": x_range.tolist(),
                "y": kde(x_range).tolist()
            }

        config = {
            "bins": bins,
            "normalized": normalize,
            "showDensity": show_density,
            "densityCurve": density
        }

        return Visualization(
            chart_type=ChartType.HISTOGRAM,
            title=title,
            data=chart_data,
            config=config
        )


class PieChartBuilder:
    """Build pie chart visualizations"""

    @staticmethod
    def build(
        data: pd.Series,
        title: str = "Pie Chart",
        max_slices: int = 10,
        combine_others: bool = True
    ) -> Visualization:
        """
        Build a pie chart

        Args:
            data: Source series (value_counts or similar)
            title: Chart title
            max_slices: Maximum number of slices
            combine_others: Combine smaller slices into "Others"

        Returns:
            Pie chart visualization
        """
        value_counts = data.value_counts()

        # Build chart data
        chart_data = []
        total = value_counts.sum()

        for i, (label, count) in enumerate(value_counts.items()):
            if i < max_slices:
                chart_data.append({
                    "label": str(label),
                    "value": int(count),
                    "percentage": float(count / total * 100),
                    "color": COLOR_PALETTES["categorical"][i % len(COLOR_PALETTES["categorical"])]
                })

        # Combine others if needed
        if combine_others and len(value_counts) > max_slices:
            others_count = value_counts[max_slices:].sum()
            if others_count > 0:
                chart_data.append({
                    "label": "Others",
                    "value": int(others_count),
                    "percentage": float(others_count / total * 100),
                    "color": COLOR_PALETTES["categorical"][max_slices % len(COLOR_PALETTES["categorical"])]
                })

        config = {
            "maxSlices": max_slices,
            "combineOthers": combine_others
        }

        return Visualization(
            chart_type=ChartType.PIE,
            title=title,
            data=chart_data,
            config=config
        )


class BoxPlotBuilder:
    """Build box plot visualizations"""

    @staticmethod
    def build(
        data: pd.DataFrame,
        value_columns: List[str],
        title: str = "Box Plot",
        group_by: Optional[str] = None
    ) -> Visualization:
        """
        Build a box plot

        Args:
            data: Source DataFrame
            value_columns: Columns to plot
            title: Chart title
            group_by: Group by column

        Returns:
            Box plot visualization
        """
        chart_data = []

        if group_by:
            # Grouped box plot
            groups = data.groupby(group_by)
            for group_name, group_df in groups:
                for col in value_columns:
                    col_data = group_df[col].dropna()
                    if len(col_data) > 0:
                        q1, q2, q3 = col_data.quantile([0.25, 0.5, 0.75])
                        iqr = q3 - q1
                        chart_data.append({
                            "group": str(group_name),
                            "column": col,
                            "min": float(col_data.min()),
                            "q1": float(q1),
                            "median": float(q2),
                            "q3": float(q3),
                            "max": float(col_data.max()),
                            "lowerWhisker": float(max(q1 - 1.5 * iqr, col_data.min())),
                            "upperWhisker": float(min(q3 + 1.5 * iqr, col_data.max())),
                            "outliers": []
                        })
        else:
            # Simple box plot
            for col in value_columns:
                col_data = data[col].dropna()
                if len(col_data) > 0:
                    q1, q2, q3 = col_data.quantile([0.25, 0.5, 0.75])
                    iqr = q3 - q1
                    whisker_low = q1 - 1.5 * iqr
                    whisker_high = q3 + 1.5 * iqr

                    # Find outliers
                    outliers = col_data[(col_data < whisker_low) | (col_data > whisker_high)].tolist()

                    chart_data.append({
                        "column": col,
                        "min": float(col_data.min()),
                        "q1": float(q1),
                        "median": float(q2),
                        "q3": float(q3),
                        "max": float(col_data.max()),
                        "lowerWhisker": float(max(whisker_low, col_data.min())),
                        "upperWhisker": float(min(whisker_high, col_data.max())),
                        "outliers": outliers
                    })

        config = {
            "valueColumns": value_columns,
            "grouped": group_by is not None,
            "groupBy": group_by
        }

        return Visualization(
            chart_type=ChartType.BOX_PLOT,
            title=title,
            data=chart_data,
            config=config
        )


class GaugeChartBuilder:
    """Build gauge chart visualizations"""

    @staticmethod
    def build(
        value: float,
        title: str = "Gauge",
        min: float = 0,
        max: float = 100,
        thresholds: Optional[List[float]] = None
    ) -> Visualization:
        """
        Build a gauge chart

        Args:
            value: Current value
            title: Chart title
            min: Minimum value
            max: Maximum value
            thresholds: Threshold values (e.g., [60, 80])

        Returns:
            Gauge chart visualization
        """
        if thresholds is None:
            thresholds = [max * 0.6, max * 0.8]

        chart_data = [{
            "value": value,
            "min": min,
            "max": max
        }]

        config = {
            "thresholds": thresholds,
            "colors": ["#ef4444", "#f59e0b", "#10b981"]
        }

        return Visualization(
            chart_type=ChartType.GAUGE,
            title=title,
            data=chart_data,
            config=config
        )


class RadarChartBuilder:
    """Build radar chart visualizations"""

    @staticmethod
    def build(
        data: pd.DataFrame,
        dimensions: List[str],
        group_by: Optional[str] = None,
        title: str = "Radar Chart"
    ) -> Visualization:
        """
        Build a radar chart

        Args:
            data: Source DataFrame
            dimensions: Dimension columns
            group_by: Group by column
            title: Chart title

        Returns:
            Radar chart visualization
        """
        chart_data = []

        if group_by:
            # Grouped radar chart
            groups = data.groupby(group_by)
            for group_name, group_df in groups:
                values = []
                for dim in dimensions:
                    if dim in group_df.columns:
                        avg_val = group_df[dim].mean()
                        # Normalize to 0-1 scale
                        max_val = data[dim].max()
                        min_val = data[dim].min()
                        if max_val > min_val:
                            norm_val = float((avg_val - min_val) / (max_val - min_val))
                        else:
                            norm_val = 0.5
                        values.append(norm_val)

                chart_data.append({
                    "group": str(group_name),
                    "values": values
                })
        else:
            # Simple radar chart (use mean of all data)
            values = []
            for dim in dimensions:
                if dim in data.columns:
                    avg_val = data[dim].mean()
                    max_val = data[dim].max()
                    min_val = data[dim].min()
                    if max_val > min_val:
                        norm_val = float((avg_val - min_val) / (max_val - min_val))
                    else:
                        norm_val = 0.5
                    values.append(norm_val)

            chart_data.append({
                "group": "Average",
                "values": values
            })

        config = {
            "dimensions": dimensions,
            "min": 0,
            "max": 1
        }

        return Visualization(
            chart_type=ChartType.RADAR,
            title=title,
            data=chart_data,
            config=config
        )


# ============================================================================
# Main Visualization Service
# ============================================================================

class DataVisualizationService:
    """Main service for creating visualizations"""

    @staticmethod
    def create_visualization(
        data: Any,
        chart_type: str,
        **kwargs
    ) -> Visualization:
        """
        Create a visualization

        Args:
            data: Source data (DataFrame, Series, or dict)
            chart_type: Type of chart to create
            **kwargs: Chart-specific parameters

        Returns:
            Visualization object
        """
        chart_type_enum = ChartType(chart_type.lower())

        # Convert data to DataFrame if needed
        if isinstance(data, list):
            df = pd.DataFrame(data)
        elif isinstance(data, dict):
            df = pd.DataFrame(data)
        else:
            df = data

        # Create appropriate chart
        if chart_type_enum == ChartType.BAR:
            return BarChartBuilder.build(df, **kwargs)
        elif chart_type_enum == ChartType.LINE:
            return LineChartBuilder.build(df, **kwargs)
        elif chart_type_enum == ChartType.SCATTER:
            return ScatterPlotBuilder.build(df, **kwargs)
        elif chart_type_enum == ChartType.HEATMAP:
            return HeatmapBuilder.build(data, **kwargs)
        elif chart_type_enum == ChartType.HISTOGRAM:
            return HistogramBuilder.build(data, **kwargs)
        elif chart_type_enum == ChartType.PIE:
            return PieChartBuilder.build(data, **kwargs)
        elif chart_type_enum == ChartType.BOX_PLOT:
            return BoxPlotBuilder.build(df, **kwargs)
        elif chart_type_enum == ChartType.GAUGE:
            return GaugeChartBuilder.build(data, **kwargs)
        elif chart_type_enum == ChartType.RADAR:
            return RadarChartBuilder.build(df, **kwargs)
        else:
            raise ValueError(f"Unsupported chart type: {chart_type}")

    @staticmethod
    def create_dashboard(
        data: pd.DataFrame,
        layout: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Create a dashboard with multiple visualizations

        Args:
            data: Source DataFrame
            layout: List of chart specifications

        Returns:
            Dashboard configuration
        """
        visualizations = []

        for spec in layout:
            chart_type = spec.get("type", "bar")
            params = spec.get("params", {})
            params["title"] = spec.get("title", "Chart")

            try:
                viz = DataVisualizationService.create_visualization(
                    data, chart_type, **params
                )
                visualizations.append(viz.to_dict())
            except Exception as e:
                logger.warning(f"Could not create chart {chart_type}: {e}")
                visualizations.append({
                    "type": chart_type,
                    "title": params.get("title", "Chart"),
                    "error": str(e)
                })

        return {
            "title": "Dashboard",
            "layout": layout,
            "visualizations": visualizations,
            "generatedAt": pd.Timestamp.utcnow().isoformat()
        }

    @staticmethod
    def recommend_visualizations(
        data: pd.DataFrame,
        question: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Recommend visualizations based on data characteristics

        Args:
            data: Source DataFrame
            question: Optional user question

        Returns:
            List of recommended visualizations
        """
        recommendations = []
        numeric_cols = data.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = data.select_dtypes(include=['object', 'category']).columns.tolist()
        datetime_cols = data.select_dtypes(include=['datetime64', 'datetime64[ns]']).columns.tolist()

        # Time series data -> Line chart
        if datetime_cols and len(numeric_cols) > 0:
            recommendations.append({
                "type": "line",
                "title": f"Trend Analysis: {numeric_cols[0]}",
                "params": {
                    "x_column": datetime_cols[0],
                    "y_columns": numeric_cols[:3],
                    "title": f"Trend: {numeric_cols[0]} over Time"
                },
                "reason": "Time-based data best visualized as line chart"
            })

        # Multiple numeric columns -> Scatter plot, Correlation heatmap
        if len(numeric_cols) >= 2:
            recommendations.append({
                "type": "scatter",
                "title": f"Correlation: {numeric_cols[0]} vs {numeric_cols[1]}",
                "params": {
                    "x_column": numeric_cols[0],
                    "y_column": numeric_cols[1],
                    "title": f"{numeric_cols[0]} vs {numeric_cols[1]}",
                    "show_trendline": True
                },
                "reason": "Two numeric variables - scatter plot shows relationship"
            })

            # Correlation matrix
            if len(numeric_cols) <= 10:
                recommendations.append({
                    "type": "heatmap",
                    "title": "Correlation Matrix",
                    "params": {
                        "title": "Correlation Matrix",
                        "color_scale": "heatmap"
                    },
                    "reason": "Shows correlations between all numeric columns",
                    "requires_matrix": True  # Caller needs to provide matrix
                })

        # Categorical with counts -> Bar/Pie chart
        for col in categorical_cols[:3]:
            if data[col].nunique() <= 10:
                recommendations.append({
                    "type": "pie",
                    "title": f"Distribution of {col}",
                    "params": {
                        "title": f"Distribution of {col}",
                        "max_slices": 10
                    },
                    "reason": "Few categories - pie chart shows proportions"
                })
            else:
                recommendations.append({
                    "type": "bar",
                    "title": f"Distribution of {col}",
                    "params": {
                        "title": f"Distribution of {col}",
                        "x_column": col,
                        "y_column": "count"
                    },
                    "reason": "Many categories - bar chart is more readable"
                })

        # Numeric distributions -> Histogram
        for col in numeric_cols[:4]:
            recommendations.append({
                "type": "histogram",
                "title": f"Distribution of {col}",
                "params": {
                    "title": f"Distribution of {col}",
                    "bins": 30
                },
                "reason": "Shows frequency distribution of numeric values"
            })

        return recommendations


# ============================================================================
# Main Entry Point for CLI
# ============================================================================

def main():
    """
    Main entry point for data visualization CLI

    Reads configuration from stdin and outputs visualization config to stdout
    """
    try:
        # Parse input configuration
        input_config = json.loads(sys.stdin.read())
        logger.info(f"Received config: {input_config}")

        # Validate required fields
        if "data" not in input_config:
            raise ValueError("Missing required field: data")
        if "chart_type" not in input_config:
            raise ValueError("Missing required field: chart_type")

        data = input_config["data"]
        chart_type = input_config["chart_type"]
        title = input_config.get("title", f"{chart_type.capitalize()} Chart")

        # Load dataframe
        if isinstance(data, list):
            df = pd.DataFrame(data)
        else:
            df = data

        # Get other params
        params = {
            k: v for k, v in input_config.items()
            if k not in ["data", "chart_type", "title"]
        }
        params["title"] = title

        # Create visualization
        viz = DataVisualizationService.create_visualization(df, chart_type, **params)

        # Output JSON
        print(viz.to_json())
        logger.info(f"Created {chart_type} visualization with {len(viz.data)} data points")

    except ValueError as e:
        print(json.dumps({
            "success": False,
            "error": f"Input validation error: {str(e)}"
        }))
        sys.exit(1)

    except Exception as e:
        logger.error(f"Visualization error: {str(e)}", exc_info=True)
        print(json.dumps({
            "success": False,
            "error": f"Visualization failed: {str(e)}"
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
