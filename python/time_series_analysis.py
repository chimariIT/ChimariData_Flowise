#!/usr/bin/env python3
"""
Time Series Analysis Script
Trend decomposition, seasonality detection, stationarity tests, ARIMA forecasting.
Auto-detects datetime and target columns.

Dual-engine: Polars for fast loading, Pandas/statsmodels for all time series ops.
"""

import json
import sys
import pandas as pd
import numpy as np
from scipy import stats
import warnings
warnings.filterwarnings('ignore')

from engine_utils import load_dataframe, to_pandas


def perform_time_series_analysis(config):
    """Perform comprehensive time series analysis"""
    try:
        # Load data via dual-engine dispatch, convert to Pandas for statsmodels
        data, engine_used = load_dataframe(config)
        data = to_pandas(data)

        time_column = config.get('time_column')
        target_column = config.get('target_column')
        forecast_periods = config.get('forecast_periods', 6)

        # Auto-detect time column
        if not time_column:
            time_column = _detect_time_column(data)

        if not time_column or time_column not in data.columns:
            return {
                'success': False,
                'error': f'No datetime column found. Available columns: {list(data.columns)}'
            }

        # Parse datetime
        try:
            data[time_column] = pd.to_datetime(data[time_column])
        except Exception as e:
            return {
                'success': False,
                'error': f'Could not parse "{time_column}" as datetime: {str(e)}'
            }

        # Auto-detect target column (first numeric column that isn't the time column)
        if not target_column:
            numeric_cols = data.select_dtypes(include=[np.number]).columns.tolist()
            if numeric_cols:
                target_column = numeric_cols[0]
            else:
                return {
                    'success': False,
                    'error': 'No numeric columns found for time series analysis.'
                }

        if target_column not in data.columns:
            return {
                'success': False,
                'error': f'Target column "{target_column}" not found.'
            }

        # Sort by time and remove NaN
        ts_data = data[[time_column, target_column]].dropna().sort_values(time_column)

        if len(ts_data) < 10:
            return {
                'success': False,
                'error': f'Need at least 10 data points for time series analysis. Got {len(ts_data)}.'
            }

        ts = ts_data.set_index(time_column)[target_column]

        results = {
            'success': True,
            'engine_used': engine_used,
            'time_column': time_column,
            'target_column': target_column,
            'n_periods': int(len(ts)),
            'date_range': {
                'start': str(ts.index.min()),
                'end': str(ts.index.max()),
            },
            'basic_stats': {
                'mean': float(ts.mean()),
                'median': float(ts.median()),
                'std': float(ts.std()),
                'min': float(ts.min()),
                'max': float(ts.max()),
                'range': float(ts.max() - ts.min()),
            },
            'trend': {},
            'stationarity': {},
            'decomposition': {},
            'autocorrelation': {},
            'forecast': {},
            'growth': {},
            'summary': {}
        }

        # Detect frequency
        freq = _detect_frequency(ts)
        results['frequency'] = freq

        # ---- Trend Analysis ----
        x = np.arange(len(ts))
        y = ts.values.astype(float)

        slope, intercept, r_value, p_value, std_err = stats.linregress(x, y)
        results['trend'] = {
            'slope': float(slope),
            'intercept': float(intercept),
            'r_squared': float(r_value ** 2),
            'p_value': float(p_value),
            'direction': 'increasing' if slope > 0 else 'decreasing' if slope < 0 else 'flat',
            'is_significant': bool(p_value < 0.05),
            'trend_line': [float(intercept + slope * i) for i in range(len(ts))],
        }

        # ---- Moving Averages ----
        if len(ts) >= 7:
            ma_7 = ts.rolling(window=min(7, len(ts) // 2)).mean().dropna()
            results['moving_averages'] = {
                'ma_7': [float(v) for v in ma_7.values[-20:]],  # Last 20 values
            }
            if len(ts) >= 30:
                ma_30 = ts.rolling(window=min(30, len(ts) // 2)).mean().dropna()
                results['moving_averages']['ma_30'] = [float(v) for v in ma_30.values[-20:]]

        # ---- Stationarity Test (ADF) ----
        try:
            from statsmodels.tsa.stattools import adfuller
            adf_result = adfuller(y, autolag='AIC')
            results['stationarity'] = {
                'adf_statistic': float(adf_result[0]),
                'p_value': float(adf_result[1]),
                'n_lags': int(adf_result[2]),
                'n_observations': int(adf_result[3]),
                'critical_values': {k: float(v) for k, v in adf_result[4].items()},
                'is_stationary': bool(adf_result[1] < 0.05),
                'interpretation': f'Series is {"stationary" if adf_result[1] < 0.05 else "non-stationary"} (p={adf_result[1]:.4f}). {"No" if adf_result[1] < 0.05 else "Consider"} differencing {"needed" if adf_result[1] < 0.05 else "before modeling"}.'
            }
        except ImportError:
            results['stationarity'] = {
                'is_stationary': None,
                'error': 'statsmodels not available for ADF test'
            }
        except Exception as e:
            results['stationarity'] = {
                'is_stationary': None,
                'error': str(e)
            }

        # ---- Seasonal Decomposition ----
        try:
            from statsmodels.tsa.seasonal import seasonal_decompose

            # Need at least 2 full periods for decomposition
            period = _infer_period(ts, freq)
            if period and len(ts) >= 2 * period:
                decomp = seasonal_decompose(ts, model='additive', period=period)

                # Sample the decomposition (avoid huge JSON payloads)
                sample_size = min(50, len(ts))
                step = max(1, len(ts) // sample_size)

                results['decomposition'] = {
                    'model': 'additive',
                    'period': int(period),
                    'trend': [float(v) if not np.isnan(v) else None for v in decomp.trend.values[::step]],
                    'seasonal': [float(v) if not np.isnan(v) else None for v in decomp.seasonal.values[::step]],
                    'residual': [float(v) if not np.isnan(v) else None for v in decomp.resid.values[::step]],
                    'seasonal_strength': float(1 - np.nanvar(decomp.resid) / np.nanvar(decomp.seasonal + decomp.resid)) if np.nanvar(decomp.seasonal + decomp.resid) > 0 else 0,
                }
            else:
                results['decomposition'] = {
                    'error': f'Insufficient data for decomposition. Need at least {2 * (period or 12)} periods, got {len(ts)}.'
                }
        except ImportError:
            results['decomposition'] = {'error': 'statsmodels not available for decomposition'}
        except Exception as e:
            results['decomposition'] = {'error': str(e)}

        # ---- Autocorrelation ----
        try:
            from statsmodels.tsa.stattools import acf, pacf

            max_lags = min(20, len(ts) // 3)
            if max_lags >= 2:
                acf_values = acf(y, nlags=max_lags, fft=True)
                pacf_values = pacf(y, nlags=max_lags)

                results['autocorrelation'] = {
                    'acf': [float(v) for v in acf_values],
                    'pacf': [float(v) for v in pacf_values],
                    'significant_lags': [int(i) for i in range(1, len(acf_values)) if abs(acf_values[i]) > 1.96 / np.sqrt(len(ts))],
                }
        except ImportError:
            results['autocorrelation'] = {'error': 'statsmodels not available'}
        except Exception as e:
            results['autocorrelation'] = {'error': str(e)}

        # ---- Simple Forecasting (ARIMA) ----
        try:
            from statsmodels.tsa.arima.model import ARIMA

            # Try simple ARIMA orders
            best_aic = float('inf')
            best_model = None
            best_order = (1, 0, 0)

            for p in range(3):
                for d in range(2):
                    for q in range(3):
                        try:
                            model = ARIMA(y, order=(p, d, q))
                            fitted = model.fit()
                            if fitted.aic < best_aic:
                                best_aic = fitted.aic
                                best_model = fitted
                                best_order = (p, d, q)
                        except:
                            continue

            if best_model:
                forecast = best_model.forecast(steps=forecast_periods)
                conf_int = best_model.get_forecast(steps=forecast_periods).conf_int(alpha=0.05)

                results['forecast'] = {
                    'model': f'ARIMA{best_order}',
                    'aic': float(best_aic),
                    'periods_ahead': int(forecast_periods),
                    'predictions': [
                        {
                            'period': int(i + 1),
                            'value': float(forecast.iloc[i]) if hasattr(forecast, 'iloc') else float(forecast[i]),
                            'lower': float(conf_int.iloc[i, 0]) if hasattr(conf_int, 'iloc') else float(conf_int[i][0]),
                            'upper': float(conf_int.iloc[i, 1]) if hasattr(conf_int, 'iloc') else float(conf_int[i][1]),
                        }
                        for i in range(len(forecast))
                    ],
                    'in_sample_mse': float(best_model.mse) if hasattr(best_model, 'mse') else None,
                }
            else:
                results['forecast'] = {'error': 'Could not fit any ARIMA model'}
        except ImportError:
            results['forecast'] = {'error': 'statsmodels not available for ARIMA forecasting'}
        except Exception as e:
            results['forecast'] = {'error': str(e)}

        # ---- Growth Rates ----
        if len(ts) >= 3:
            overall_growth = (ts.iloc[-1] - ts.iloc[0]) / abs(ts.iloc[0]) if ts.iloc[0] != 0 else 0
            recent_n = min(3, len(ts) // 3)
            recent_start = ts.iloc[-recent_n - 1] if recent_n < len(ts) else ts.iloc[0]
            recent_growth = (ts.iloc[-1] - recent_start) / abs(recent_start) if recent_start != 0 else 0

            # Period-over-period growth
            pct_changes = ts.pct_change().dropna()

            results['growth'] = {
                'overall': float(overall_growth),
                'recent_periods': float(recent_growth),
                'avg_period_growth': float(pct_changes.mean()) if len(pct_changes) > 0 else 0,
                'max_growth': float(pct_changes.max()) if len(pct_changes) > 0 else 0,
                'max_decline': float(pct_changes.min()) if len(pct_changes) > 0 else 0,
                'volatility': float(pct_changes.std()) if len(pct_changes) > 0 else 0,
            }

        # Summary
        results['summary'] = {
            'n_periods': int(len(ts)),
            'frequency': freq,
            'trend_direction': results['trend']['direction'],
            'is_stationary': results['stationarity'].get('is_stationary'),
            'has_seasonality': results['decomposition'].get('seasonal_strength', 0) > 0.3 if isinstance(results['decomposition'].get('seasonal_strength'), (int, float)) else None,
            'overall_growth_pct': float(results['growth'].get('overall', 0) * 100) if results.get('growth') else None,
            'forecast_available': 'predictions' in results.get('forecast', {}),
        }

        # Phase 4C-1: Pass through business context for evidence chain
        business_context = config.get('business_context', {})
        if business_context:
            results['business_context'] = business_context
            results['question_ids'] = business_context.get('question_ids', [])

        return results

    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def _detect_time_column(data):
    """Auto-detect datetime column"""
    for col in data.columns:
        if data[col].dtype in ['datetime64[ns]', 'datetime64']:
            return col
        # Try parsing as datetime
        if data[col].dtype == 'object':
            try:
                sample = data[col].dropna().head(20)
                pd.to_datetime(sample)
                return col
            except:
                pass
        # Check column name hints
        name_lower = col.lower()
        if any(hint in name_lower for hint in ['date', 'time', 'timestamp', 'period', 'year', 'month', 'day']):
            try:
                pd.to_datetime(data[col].dropna().head(20))
                return col
            except:
                pass
    return None


def _detect_frequency(ts):
    """Detect the frequency of the time series"""
    if len(ts) < 3:
        return 'unknown'

    diffs = pd.Series(ts.index).diff().dropna()
    if len(diffs) == 0:
        return 'unknown'

    median_diff = diffs.median()

    if hasattr(median_diff, 'days'):
        days = median_diff.days
    else:
        days = median_diff / np.timedelta64(1, 'D') if isinstance(median_diff, np.timedelta64) else 0

    if days <= 1:
        return 'daily'
    elif days <= 8:
        return 'weekly'
    elif days <= 20:
        return 'bi-weekly'
    elif days <= 35:
        return 'monthly'
    elif days <= 100:
        return 'quarterly'
    elif days <= 400:
        return 'yearly'
    else:
        return 'irregular'


def _infer_period(ts, freq):
    """Infer the seasonal period based on frequency"""
    freq_map = {
        'daily': 7,
        'weekly': 52,
        'bi-weekly': 26,
        'monthly': 12,
        'quarterly': 4,
        'yearly': 1,
    }
    period = freq_map.get(freq)
    if period and period <= len(ts) // 2:
        return period
    return None


if __name__ == "__main__":
    import os

    config = None

    # Priority 1: Check CONFIG environment variable
    if os.environ.get('CONFIG'):
        try:
            config = json.loads(os.environ['CONFIG'])
        except:
            pass

    # Priority 2: Check stdin
    if config is None and not sys.stdin.isatty():
        try:
            stdin_data = sys.stdin.read().strip()
            if stdin_data:
                config = json.loads(stdin_data)
        except:
            pass

    # Priority 3: Check command line argument
    if config is None and len(sys.argv) == 2:
        try:
            config = json.loads(sys.argv[1])
        except:
            pass

    if config is None:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python time_series_analysis.py <config_json> OR pipe JSON to stdin OR set CONFIG env var'
        }))
        sys.exit(1)

    try:
        result = perform_time_series_analysis(config)
        print(json.dumps(result, default=str))
        sys.exit(0 if result.get('success') else 1)
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': f'Unexpected error: {str(e)}'
        }))
        sys.exit(1)
