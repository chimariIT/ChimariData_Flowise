#!/usr/bin/env python3
"""
Compute Engine Utilities for Analysis Scripts.

Provides tri-engine (Spark/Polars/Pandas) data loading with automatic fallback.
Engine cascade: Spark → Polars → Pandas (each falls back to the next on failure).

Usage in analysis scripts:
    from engine_utils import load_dataframe, to_pandas, POLARS_AVAILABLE, SPARK_AVAILABLE

    data, engine_used = load_dataframe(config)
    # ... Polars-eligible operations ...
    pd_data = to_pandas(data)  # for scipy/sklearn calls
"""

import json
import sys
import os

# ---- Tri-engine import guards ----

# Spark (highest performance for >1M rows, distributed)
try:
    from pyspark.sql import SparkSession
    SPARK_AVAILABLE = True
except ImportError:
    SPARK_AVAILABLE = False

# Polars (high performance for 50k-1M rows, single-node)
try:
    import polars as pl
    import polars.selectors as cs
    POLARS_AVAILABLE = True
except ImportError:
    POLARS_AVAILABLE = False

# Pandas (universal fallback, always available)
try:
    import pandas as pd
    import numpy as np
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False


# ---- Spark session management ----

_spark_session = None


def get_or_create_spark_session(config):
    """Get or create a Spark session with config from orchestrator."""
    global _spark_session
    if _spark_session is not None:
        return _spark_session

    builder = SparkSession.builder.appName(
        config.get('spark_app_name', 'ChimariData')
    )

    # Master URL: config > env var > local[*]
    master = config.get(
        'spark_master',
        os.environ.get('SPARK_MASTER_URL', 'local[*]')
    )
    builder = builder.master(master)

    # Memory configuration from orchestrator
    if config.get('spark_executor_memory'):
        builder = builder.config('spark.executor.memory', config['spark_executor_memory'])
    if config.get('spark_driver_memory'):
        builder = builder.config('spark.driver.memory', config['spark_driver_memory'])

    # Adaptive query execution (auto-tuning)
    builder = builder.config('spark.sql.adaptive.enabled', 'true')

    # Limit log verbosity
    builder = builder.config('spark.ui.showConsoleProgress', 'false')

    _spark_session = builder.getOrCreate()
    # Reduce Spark's verbose logging
    _spark_session.sparkContext.setLogLevel('WARN')
    return _spark_session


def get_engine(config):
    """Read engine preference from config. Default: 'pandas' (safe fallback)."""
    return config.get('engine', 'pandas')


def should_use_spark(config):
    """Determine if Spark should be used for this execution."""
    engine = get_engine(config)
    return engine == 'spark' and SPARK_AVAILABLE


def should_use_polars(config):
    """Determine if Polars should be used for this execution."""
    engine = get_engine(config)
    # Also use Polars if Spark was requested but unavailable (graceful cascade)
    if engine == 'spark' and not SPARK_AVAILABLE and POLARS_AVAILABLE:
        return True
    return engine == 'polars' and POLARS_AVAILABLE


def load_dataframe(config):
    """
    Load data from data_path using the configured engine.

    Engine cascade: Spark → Polars → Pandas
    Each engine falls back to the next on failure.

    Returns (df, engine_used) where:
      - df is pl.DataFrame, pd.DataFrame (Spark converts to Pandas for analysis)
      - engine_used is 'spark', 'polars', or 'pandas'

    Note: Spark loads data via SparkSession and converts to Pandas for analysis.
    The benefit is distributed I/O for very large files and potential Spark-native
    operations in scripts that support them (via spark_bridge.py).
    """
    data_path = config['data_path']

    # ---- Spark path (>1M rows, distributed I/O) ----
    if should_use_spark(config):
        try:
            spark = get_or_create_spark_session(config)
            # Read JSON array-of-objects format
            spark_df = spark.read.json(data_path)
            row_count = spark_df.count()
            # Convert to Pandas for analysis scripts (Spark used for distributed I/O)
            df = spark_df.toPandas()
            print(f"⚡ [Engine] Loaded {row_count} rows via Spark → Pandas", file=sys.stderr)
            return df, 'spark'
        except Exception as e:
            print(f"⚠️ [Engine] Spark load failed ({e}), falling back to Polars", file=sys.stderr)
            # Fall through to Polars

    # ---- Polars path (50k-1M rows, fast single-node) ----
    if should_use_polars(config):
        try:
            with open(data_path, 'r', encoding='utf-8') as f:
                raw = json.load(f)
            if isinstance(raw, list) and len(raw) > 0:
                df = pl.DataFrame(raw)
                print(f"✅ [Engine] Loaded {len(df)} rows via Polars", file=sys.stderr)
                return df, 'polars'
            else:
                print(f"⚠️ [Engine] Empty or non-list JSON, falling back to Pandas", file=sys.stderr)
        except Exception as e:
            print(f"⚠️ [Engine] Polars load failed ({e}), falling back to Pandas", file=sys.stderr)

    # ---- Pandas fallback (always available) ----
    df = pd.read_json(data_path)
    print(f"📊 [Engine] Loaded {len(df)} rows via Pandas", file=sys.stderr)
    return df, 'pandas'


def to_pandas(df):
    """Convert a Polars DataFrame to Pandas. No-op if already Pandas."""
    if POLARS_AVAILABLE and isinstance(df, pl.DataFrame):
        return df.to_pandas()
    return df


def to_numpy_array(series):
    """Convert a Polars or Pandas Series to numpy array for scipy/sklearn."""
    if POLARS_AVAILABLE and isinstance(series, pl.Series):
        return series.drop_nulls().to_numpy()
    if PANDAS_AVAILABLE and isinstance(series, pd.Series):
        return series.dropna().to_numpy()
    return np.array(series)


def select_numeric_columns(df, engine_used):
    """Select numeric columns, engine-agnostic. Returns list of column names."""
    if engine_used == 'polars' and POLARS_AVAILABLE and isinstance(df, pl.DataFrame):
        try:
            return df.select(cs.numeric()).columns
        except Exception:
            # Fallback for older Polars versions without selectors
            return [c for c, dt in zip(df.columns, df.dtypes) if dt.is_numeric()]
    return df.select_dtypes(include=['number']).columns.tolist()


def select_categorical_columns(df, engine_used):
    """Select string/categorical columns, engine-agnostic. Returns list of column names."""
    if engine_used == 'polars' and POLARS_AVAILABLE and isinstance(df, pl.DataFrame):
        try:
            return df.select(cs.string() | cs.categorical()).columns
        except Exception:
            return [c for c, dt in zip(df.columns, df.dtypes) if dt == pl.Utf8 or dt == pl.Categorical]
    return df.select_dtypes(include=['object', 'category']).columns.tolist()


def safe_float(val):
    """Convert a value to Python float, handling Polars null → None."""
    if val is None:
        return None
    try:
        result = float(val)
        if result != result:  # NaN check
            return None
        return result
    except (TypeError, ValueError):
        return None


def safe_int(val):
    """Convert a value to Python int, handling Polars null → None."""
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def column_to_list(df, col, engine_used):
    """Extract a column as a Python list, engine-agnostic."""
    if engine_used == 'polars' and POLARS_AVAILABLE and isinstance(df, pl.DataFrame):
        return df[col].to_list()
    return df[col].tolist()


def filter_rows(df, col, value, engine_used):
    """Filter rows where col == value, engine-agnostic."""
    if engine_used == 'polars' and POLARS_AVAILABLE and isinstance(df, pl.DataFrame):
        return df.filter(pl.col(col) == value)
    return df[df[col] == value]


def drop_nulls(df, col, engine_used):
    """Drop rows where col is null, engine-agnostic."""
    if engine_used == 'polars' and POLARS_AVAILABLE and isinstance(df, pl.DataFrame):
        return df.drop_nulls(col)
    return df.dropna(subset=[col])


def value_counts(df, col, engine_used, top_n=10):
    """Get value counts for a column, engine-agnostic. Returns dict {value: count}."""
    if engine_used == 'polars' and POLARS_AVAILABLE and isinstance(df, pl.DataFrame):
        try:
            vc = df[col].value_counts().sort('count', descending=True).head(top_n)
            return dict(zip(vc[col].to_list(), vc['count'].to_list()))
        except Exception:
            pass
    # Pandas fallback
    pd_df = to_pandas(df) if engine_used == 'polars' else df
    return pd_df[col].value_counts().head(top_n).to_dict()


def unique_count(df, col, engine_used):
    """Count unique values in a column, engine-agnostic."""
    if engine_used == 'polars' and POLARS_AVAILABLE and isinstance(df, pl.DataFrame):
        return df[col].n_unique()
    return df[col].nunique()


def null_count(df, col, engine_used):
    """Count null values in a column, engine-agnostic."""
    if engine_used == 'polars' and POLARS_AVAILABLE and isinstance(df, pl.DataFrame):
        return df[col].is_null().sum()
    return int(df[col].isna().sum())


def row_count(df, engine_used):
    """Get row count, engine-agnostic."""
    return len(df)


def get_columns(df, engine_used):
    """Get column names, engine-agnostic."""
    if engine_used == 'polars' and POLARS_AVAILABLE and isinstance(df, pl.DataFrame):
        return df.columns
    return df.columns.tolist()


def filter_columns(df, columns, engine_used):
    """Select specific columns, engine-agnostic."""
    if engine_used == 'polars' and POLARS_AVAILABLE and isinstance(df, pl.DataFrame):
        available = [c for c in columns if c in df.columns]
        return df.select(available) if available else df
    available = [c for c in columns if c in df.columns]
    return df[available] if available else df
