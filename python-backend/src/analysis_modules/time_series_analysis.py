"""
Analysis Module - Time Series Analysis

Standardized output format for Chimaridata pipeline.

Performs:
- Time series decomposition
- Forecasting
- Trend detection
- Seasonality analysis
- Anomaly detection

Standard output format:
{
    "success": true|false,
    "analysisType": "time_series",
    "data": {
        "summary": {...},
        "statistics": {...},
        "visualizations": [...],
        "model": {...}
    },
    "metadata": {
        "recordCount": 100,
        "columnCount": 5,
        "processingTimeMs": 1234
    },
    "errors": []
}
"""

import json
import sys
import time
import logging
from typing import Dict, List, Any

import pandas as pd
import numpy as np
from scipy import stats
from statsmodels.tsa.seasonal import seasonal_decompose
from statsmodels.tsa.holtwinters import ExponentialSmoothing, SimpleExpSmoothing
from statsmodels.tsa.statespace import SARIMAX
from statsmodels.tsa.arima import ARIMA
from sklearn.metrics import mean_absolute_error, mean_squared_error

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# Data Classes for Standardized Output
# ============================================================================

class AnalysisResult:
    """Standard analysis result format"""
    success: bool
    analysis_type: str
    data: Dict[str, Any]
    metadata: Dict[str, Any]
    errors: List[str]

    def to_json(self) -> str:
        return json.dumps({
            "success": self.success,
            "analysis_type": self.analysis_type,
            "data": self.data,
            "metadata": self.metadata,
            "errors": self.errors
        }, indent=2)


# ============================================================================
# Main Analysis Function
# ============================================================================

def main():
    """
    Main entry point for time series analysis

    Reads configuration from stdin and outputs results to stdout
    """
    start_time = time.time()

    try:
        # Parse input configuration
        input_config = json.loads(sys.stdin.read())
        logger.info(f"Received config: {input_config}")

        # Validate required fields
        if "data" not in input_config:
            raise ValueError("Missing required fields: data, project_id")

        data = input_config["data"]
        project_id = input_config.get("project_id", "unknown")
        columns_to_exclude = input_config.get("pii_columns_to_exclude", [])
        question_mappings = input_config.get("question_mappings", [])
        target_column = input_config.get("target_column", None)
        date_column = input_config.get("date_column", None)
        forecast_periods = input_config.get("forecast_periods", 12)

        # Load dataframe
        df = pd.DataFrame(data)

        # Exclude PII columns
        if columns_to_exclude:
            df = df.drop(columns=columns_to_exclude, errors='ignore')
            logger.info(f"Excluded PII columns: {columns_to_exclude}")

        # Identify date/time column
        datetime_cols = df.select_dtypes(include=['datetime64', 'datetime64[ns]']).columns.tolist()

        # Auto-detect date column if not specified
        if not date_column and datetime_cols:
            date_column = datetime_cols[0]
            logger.info(f"Auto-detected date column: {date_column}")

        # Get column types
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

        logger.info(f"Date column: {date_column}")
        logger.info(f"Numeric columns: {len(numeric_cols)}")

        # Build results
        result_data = {
            "summary": {
                "recordCount": int(len(df)),
                "columnCount": int(len(df.columns)),
                "numericColumns": numeric_cols,
                "categoricalColumns": [],
                "missingValues": df.isnull().sum().to_dict(),
                "project_id": project_id,
                "dateColumn": date_column,
                "targetColumn": target_column,
                "forecastPeriods": forecast_periods
            },
            "statistics": {},
            "visualizations": [],
            "model": {}
        }

        # Check if date column exists
        if not date_column:
            result_data["statistics"]["error"] = "No date/time column found"
            result = AnalysisResult(
                success=False,
                analysis_type="time_series",
                data=result_data,
                metadata={},
                errors=["No date/time column found"]
            )
            print(result.to_json())
            sys.exit(1)

        # Convert date column to datetime
        try:
            df[date_column] = pd.to_datetime(df[date_column])
        except Exception as e:
            result_data["statistics"]["error"] = f"Error parsing date column: {str(e)}"
            result = AnalysisResult(
                success=False,
                analysis_type="time_series",
                data=result_data,
                metadata={},
                errors=[f"Error parsing date column: {str(e)}"]
            )
            print(result.to_json())
            sys.exit(1)

        # Sort by date
        df_sorted = df.sort_values(date_column)
        df_sorted.set_index(date_column, inplace=True)

        # Get time series data
        if target_column and target_column in df_sorted.columns:
            y = df_sorted[target_column]
            y = y.astype(float)
            numeric_cols_for_ts = [col for col in numeric_cols if col != target_column]
        else:
            y = None
            numeric_cols_for_ts = numeric_cols

        logger.info(f"Time series length: {len(df_sorted)} rows")

        # Time series decomposition (if > 2 seasonal periods)
        decomposition = None
        if len(df_sorted) > 24:
            result_data["statistics"]["decomposition"] = {}

            try:
                decomposition = seasonal_decompose(
                    y.dropna(),
                    model='multiplicative',
                    period=min(12, len(y) // 2)
                )

                result_data["statistics"]["decomposition"] = {
                    "trend": decomposition.trend.tolist(),
                    "seasonal": decomposition.seasonal.tolist(),
                    "residual": decomposition.resid.tolist()
                }
            except Exception as e:
                logger.warning(f"Decomposition failed: {e}")
                result_data["statistics"]["decomposition"] = {
                    "error": f"Decomposition failed: {str(e)}"
                }

        # Trend detection using linear regression on time index
        if y is not None:
            try:
                # Create numeric time index
                ts_numeric = np.arange(len(y))
                slope, intercept, r_value, p_value, std_err = stats.linregress(ts_numeric, y)

                # Trend direction
                trend_direction = "increasing" if slope > 0 else "decreasing" if slope < 0 else "flat"

                # Calculate trend component
                trend_values = intercept + slope * ts_numeric

                result_data["statistics"]["trend"] = {
                    "slope": float(slope),
                    "intercept": float(intercept),
                    "rValue": float(r_value),
                    "pValue": float(p_value),
                    "trendDirection": trend_direction
                }
            except Exception as e:
                logger.warning(f"Trend detection failed: {e}")
                result_data["statistics"]["trend"] = {
                    "error": f"Trend detection failed: {str(e)}"
                }

        # Forecasting
        if y is not None and len(y.dropna()) > 12:
            result_data["model"] = {
                "forecastMethod": "ARIMA",
                "forecastPeriods": forecast_periods,
                "forecastConfidence": 0.95
            }

            try:
                # Fit ARIMA model
                logger.info("Fitting ARIMA model...")
                model = ARIMA(y.dropna(), order=(1, 1, 0))
                model_fit = model.fit()

                # Forecast
                forecast = model_fit.forecast(steps=forecast_periods)

                # Get confidence intervals
                forecast_obj = model_fit.get_forecast(steps=forecast_periods)
                conf_int = forecast_obj.conf_int(alpha=0.05)

                # Create forecast dates
                last_date = y.index[-1]
                forecast_dates = pd.date_range(
                    start=last_date,
                    periods=forecast_periods,
                    freq='D' if isinstance(y.index, pd.DatetimeIndex) else None
                )

                result_data["model"]["forecast"] = {
                    "forecast": forecast.tolist(),
                    "confIntervals": {
                        "lower": conf_int[:, 0].tolist(),
                        "upper": conf_int[:, 1].tolist()
                    },
                    "forecastDates": forecast_dates.strftime('%Y-%m-%d').tolist()
                }

                # Forecast metrics
                if len(forecast) > 0 and len(y.dropna()) > 0:
                    # Calculate error metrics
                    test_size = min(12, len(y.dropna()))
                    actual_values = y.dropna().iloc[-test_size:]
                    forecast_values = forecast[:test_size]

                    mae = mean_absolute_error(actual_values, forecast_values)
                    mse = mean_squared_error(actual_values, forecast_values)
                    rmse = np.sqrt(mse)

                    result_data["model"]["metrics"] = {
                        "mae": float(mae),
                        "mse": float(mse),
                        "rmse": float(rmse),
                        "mape": float(np.mean(np.abs((actual_values - forecast_values) / actual_values).replace([np.inf, -np.inf])))
                    }

            except Exception as e:
                logger.error(f"ARIMA forecasting failed: {e}")
                result_data["model"]["forecast"] = {
                    "error": f"ARIMA forecasting failed: {str(e)}"
                }

        # Generate visualization configs
        # Time series plot
        if y is not None:
            actual_vals = y.tolist()
            forecast_vals = forecast.tolist() if forecast else []
            date_vals = y.index.strftime('%Y-%m-%d').tolist() + forecast_dates.strftime('%Y-%m-%d').tolist()

            result_data["visualizations"].append({
                "type": "line",
                "column": target_column,
                "config": {
                    "title": f"{target_column} Forecast",
                    "xAxis": "Date",
                    "yAxis": target_column,
                    "series": [
                        {"date": date_vals[i], "actual": actual_vals[i] if i < len(actual_vals) else None}
                        for i in range(len(date_vals))
                    ],
                    "forecast": [
                        {"date": date_vals[i], "forecast": forecast_vals[i] if i < len(forecast_vals) else None}
                        for i in range(len(date_vals))
                    ]
                }
            })

        if decomposition:
            # Decomposition plot
            n_points = min(100, len(y))
            dates = y.index[:n_points].strftime('%Y-%m-%d').tolist()

            result_data["visualizations"].append({
                "type": "line",
                "column": target_column,
                "config": {
                    "title": f"{target_column} Decomposition",
                    "xAxis": "Date",
                    "yAxis": target_column,
                    "series": [
                        {"date": dates[i], "value": float(decomposition.trend[i]) if i < len(decomposition.trend) else None}
                        for i in range(n_points)
                    ],
                    "seasonal": [
                        {"date": dates[i], "value": float(decomposition.seasonal[i]) if i < len(decomposition.seasonal) else None}
                        for i in range(n_points)
                    ]
                }
            })

        # Metadata
        processing_time_ms = int((time.time() - start_time) * 1000)
        result_data["metadata"] = {
            "recordCount": int(len(df_sorted)),
            "columnCount": int(len(df_sorted.columns)),
            "processingTimeMs": processing_time_ms,
            "project_id": project_id,
            "dateColumn": date_column,
            "targetColumn": target_column,
            "forecastPeriods": forecast_periods,
            "excludedColumns": columns_to_exclude
        }

        # Build result
        result = AnalysisResult(
            success=True,
            analysis_type="time_series",
            data=result_data,
            metadata=result_data["metadata"],
            errors=[]
        )

        # Output JSON result
        print(result.to_json())
        logger.info(f"Time series analysis completed in {processing_time_ms}ms")

    except ValueError as e:
        # Input validation error
        result = AnalysisResult(
            success=False,
            analysis_type="time_series",
            data={},
            metadata={},
            errors=[f"Input validation error: {str(e)}"]
        )
        print(result.to_json())
        logger.error(f"Input validation error: {e}")
        sys.exit(1)

    except Exception as e:
        # Analysis error
        logger.error(f"Analysis error: {str(e)}", exc_info=True)
        result = AnalysisResult(
            success=False,
            analysis_type="time_series",
            data={},
            metadata={"errorTime": time.time()},
            errors=[f"Analysis failed: {str(e)}"]
        )
        print(result.to_json())
        sys.exit(1)


if __name__ == "__main__":
    main()
