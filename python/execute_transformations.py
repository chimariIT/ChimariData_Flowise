#!/usr/bin/env python3
"""
Execute compiled transformations on dataset.

This script bridges the gap between the transformation compiler (TypeScript)
and actual data execution. It receives compiled transformations with actual
column names (after source column mapping) and executes them.

Usage:
    echo '{"data": [...], "transformations": [...], "engine": "polars"}' | python execute_transformations.py

Input format:
{
    "data": [{"col1": val1, ...}, ...],
    "transformations": [
        {
            "targetColumn": "Engagement_Score",
            "sourceColumns": ["Q1 - Score", "Q2 - Score", "Q3 - Score"],
            "aggregationMethod": "mean",
            "code": {"python": "df['Engagement_Score'] = df[['Q1 - Score', 'Q2 - Score', 'Q3 - Score']].mean(axis=1)"}
        },
        ...
    ],
    "engine": "polars" | "pandas"
}

Output format:
{
    "success": true,
    "data": [...],
    "columns": [...],
    "row_count": 1000,
    "transformations_applied": ["Engagement_Score", ...],
    "errors": []
}
"""

import sys
import json
import traceback
from typing import Any, Dict, List, Optional

# Check for required libraries
try:
    import polars as pl
    POLARS_AVAILABLE = True
except ImportError:
    POLARS_AVAILABLE = False

try:
    import pandas as pd
    import numpy as np
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False


# P2-6 FIX: Validate generated code before exec() to prevent dangerous operations
BLOCKED_PATTERNS = [
    'import ',     # No importing modules
    '__import__',  # No dynamic imports
    'os.',         # No OS operations
    'subprocess',  # No subprocess calls
    'shutil',      # No file operations
    'pathlib',     # No path manipulation
    'open(',       # No file I/O
    'eval(',       # No nested eval
    'compile(',    # No dynamic compilation
    'globals(',    # No global access
    'locals(',     # No local scope manipulation
    'getattr(',    # No attribute access (potential for object traversal)
    'setattr(',    # No attribute setting
    'delattr(',    # No attribute deletion
    '__class__',   # No class manipulation
    '__subclasses__', # No subclass enumeration
    '__builtins__',  # No builtins access
    'breakpoint',  # No debugging
    'exit(',       # No process exit
    'quit(',       # No process quit
    'sys.exit',    # No sys exit
    'requests.',   # No HTTP requests
    'urllib',      # No URL operations
    'socket',      # No socket operations
]


def validate_code_safety(code: str) -> tuple:
    """P2-6: Validate that generated code only performs data operations.
    Returns (is_safe, reason)."""
    if not code or not code.strip():
        return (True, '')

    code_lower = code.lower()
    for pattern in BLOCKED_PATTERNS:
        if pattern.lower() in code_lower:
            return (False, f"Blocked pattern detected: '{pattern}'")

    # Check for excessive code length (potential injection)
    if len(code) > 5000:
        return (False, f"Code too long ({len(code)} chars, max 5000)")

    return (True, '')


def execute_with_polars(data: List[Dict], transformations: List[Dict]) -> Dict[str, Any]:
    """Execute transformations using Polars (5-10x faster than Pandas)"""
    if not POLARS_AVAILABLE:
        raise ImportError("Polars not available")

    df = pl.DataFrame(data)
    applied = []
    errors = []

    for transform in transformations:
        target_col = transform.get('targetColumn', '')
        source_cols = transform.get('sourceColumns', [])
        agg_method = transform.get('aggregationMethod', 'mean').lower()
        code = transform.get('code', {}).get('python', '')

        try:
            # Try to execute the generated code first
            if code and 'pl.' in code:
                # P2-6 FIX: Validate code safety before exec()
                is_safe, reason = validate_code_safety(code)
                if not is_safe:
                    print(f"🚫 [P2-6] Blocked unsafe code for {target_col}: {reason}", file=sys.stderr)
                    errors.append(f"Code for {target_col} blocked by safety check: {reason}")
                    continue
                exec(code, {'pl': pl, 'df': df})
                applied.append(target_col)
                print(f"✅ [Polars] Added column via code: {target_col}", file=sys.stderr)
                continue

            # Fallback to aggregation method interpretation
            if not source_cols:
                print(f"⚠️ [Polars] No source columns for {target_col}, skipping", file=sys.stderr)
                continue

            # Verify columns exist
            missing = [c for c in source_cols if c not in df.columns]
            if missing:
                errors.append(f"Missing columns for {target_col}: {missing}")
                df = df.with_columns(pl.lit(None).alias(target_col))
                print(f"❌ [Polars] Missing columns: {missing}", file=sys.stderr)
                continue

            # Apply aggregation
            if agg_method in ['mean', 'average', 'avg']:
                df = df.with_columns(
                    pl.mean_horizontal(source_cols).alias(target_col)
                )
            elif agg_method == 'sum':
                df = df.with_columns(
                    pl.sum_horizontal(source_cols).alias(target_col)
                )
            elif agg_method == 'min':
                df = df.with_columns(
                    pl.min_horizontal(source_cols).alias(target_col)
                )
            elif agg_method == 'max':
                df = df.with_columns(
                    pl.max_horizontal(source_cols).alias(target_col)
                )
            elif agg_method == 'count':
                df = df.with_columns(
                    pl.concat_list(source_cols).list.len().alias(target_col)
                )
            elif agg_method == 'concat':
                df = df.with_columns(
                    pl.concat_str(source_cols, separator=' ').alias(target_col)
                )
            elif agg_method == 'first':
                df = df.with_columns(
                    pl.coalesce(source_cols).alias(target_col)
                )
            # Phase 3F: New aggregation methods for multi-step KPI support
            elif agg_method == 'indicator':
                # Date presence indicator: 1 if not null, 0 if null
                if source_cols:
                    df = df.with_columns(
                        pl.when(pl.col(source_cols[0]).is_not_null()).then(1).otherwise(0).alias(target_col)
                    )
            elif agg_method in ['group_count', 'group_sum', 'group_avg']:
                # Cross-row aggregation with GROUP BY
                group_by_cols = transform.get('groupByColumns', [])
                agg_source = source_cols[0] if source_cols else None
                if group_by_cols and agg_source:
                    if agg_method == 'group_count':
                        agg_expr = pl.col(agg_source).sum()
                    elif agg_method == 'group_sum':
                        agg_expr = pl.col(agg_source).sum()
                    else:
                        agg_expr = pl.col(agg_source).mean()
                    agg_df = df.group_by(group_by_cols).agg(agg_expr.alias(target_col))
                    df = df.join(agg_df, on=group_by_cols, how='left')
            elif agg_method == 'group_count_distinct':
                group_by_cols = transform.get('groupByColumns', [])
                agg_source = source_cols[0] if source_cols else None
                if group_by_cols and agg_source:
                    agg_df = df.group_by(group_by_cols).agg(
                        pl.col(agg_source).n_unique().alias(target_col)
                    )
                    df = df.join(agg_df, on=group_by_cols, how='left')
            elif agg_method == 'count_distinct':
                if source_cols:
                    group_by_cols = transform.get('groupByColumns', [])
                    if group_by_cols:
                        agg_df = df.group_by(group_by_cols).agg(
                            pl.col(source_cols[0]).n_unique().alias(target_col)
                        )
                        df = df.join(agg_df, on=group_by_cols, how='left')
                    else:
                        count_val = df[source_cols[0]].n_unique()
                        df = df.with_columns(pl.lit(count_val).alias(target_col))
            elif agg_method == 'formula':
                # Formula application - code should be provided
                if code:
                    # P2-6 FIX: Validate code safety
                    is_safe, reason = validate_code_safety(code)
                    if not is_safe:
                        print(f"🚫 [P2-6] Blocked unsafe formula code for {target_col}: {reason}", file=sys.stderr)
                        errors.append(f"Formula code for {target_col} blocked: {reason}")
                    else:
                        local_vars = {'pl': pl, 'df': df}
                        exec(code, local_vars)
                        df = local_vars.get('df', df)
            elif agg_method == 'date_presence_indicator':
                # Create 0/1 from null/not-null date column
                if source_cols:
                    df = df.with_columns(
                        pl.when(pl.col(source_cols[0]).is_not_null()).then(1).otherwise(0).alias(target_col)
                    )
            else:
                # Default to mean
                df = df.with_columns(
                    pl.mean_horizontal(source_cols).alias(target_col)
                )

            applied.append(target_col)
            print(f"✅ [Polars] Added column: {target_col} ({agg_method})", file=sys.stderr)

        except Exception as e:
            error_msg = f"Failed to create {target_col}: {str(e)}"
            errors.append(error_msg)
            df = df.with_columns(pl.lit(None).alias(target_col))
            print(f"❌ [Polars] {error_msg}", file=sys.stderr)

    return {
        'success': len(errors) == 0,
        'data': df.to_dicts(),
        'columns': df.columns,
        'row_count': len(df),
        'transformations_applied': applied,
        'errors': errors,
        'engine': 'polars'
    }


def execute_with_pandas(data: List[Dict], transformations: List[Dict]) -> Dict[str, Any]:
    """Execute transformations using Pandas (fallback)"""
    if not PANDAS_AVAILABLE:
        raise ImportError("Pandas not available")

    df = pd.DataFrame(data)
    applied = []
    errors = []

    for transform in transformations:
        target_col = transform.get('targetColumn', '')
        source_cols = transform.get('sourceColumns', [])
        agg_method = transform.get('aggregationMethod', 'mean').lower()
        code = transform.get('code', {}).get('python', '')

        try:
            # Try to execute the generated code first
            if code and ('df[' in code or 'pd.' in code):
                # P2-6 FIX: Validate code safety before exec()
                is_safe, reason = validate_code_safety(code)
                if not is_safe:
                    print(f"🚫 [P2-6] Blocked unsafe code for {target_col}: {reason}", file=sys.stderr)
                    errors.append(f"Code for {target_col} blocked by safety check: {reason}")
                    continue
                exec(code, {'pd': pd, 'np': np, 'df': df})
                applied.append(target_col)
                print(f"✅ [Pandas] Added column via code: {target_col}", file=sys.stderr)
                continue

            # Fallback to aggregation method interpretation
            if not source_cols:
                print(f"⚠️ [Pandas] No source columns for {target_col}, skipping", file=sys.stderr)
                continue

            # Verify columns exist
            missing = [c for c in source_cols if c not in df.columns]
            if missing:
                errors.append(f"Missing columns for {target_col}: {missing}")
                df[target_col] = None
                print(f"❌ [Pandas] Missing columns: {missing}", file=sys.stderr)
                continue

            # Apply aggregation
            if agg_method in ['mean', 'average', 'avg']:
                df[target_col] = df[source_cols].mean(axis=1)
            elif agg_method == 'sum':
                df[target_col] = df[source_cols].sum(axis=1)
            elif agg_method == 'min':
                df[target_col] = df[source_cols].min(axis=1)
            elif agg_method == 'max':
                df[target_col] = df[source_cols].max(axis=1)
            elif agg_method == 'count':
                df[target_col] = df[source_cols].notna().sum(axis=1)
            elif agg_method == 'std':
                df[target_col] = df[source_cols].std(axis=1)
            elif agg_method == 'var':
                df[target_col] = df[source_cols].var(axis=1)
            elif agg_method == 'concat':
                df[target_col] = df[source_cols].astype(str).agg(' '.join, axis=1)
            elif agg_method == 'first':
                df[target_col] = df[source_cols].bfill(axis=1).iloc[:, 0]
            # Phase 3F: New aggregation methods for multi-step KPI support
            elif agg_method == 'indicator':
                if source_cols:
                    df[target_col] = df[source_cols[0]].notna().astype(int)
            elif agg_method in ['group_count', 'group_sum', 'group_avg']:
                group_by_cols = transform.get('groupByColumns', [])
                agg_source = source_cols[0] if source_cols else None
                if group_by_cols and agg_source:
                    if agg_method == 'group_count':
                        agg_df = df.groupby(group_by_cols)[agg_source].sum().reset_index(name=target_col)
                    elif agg_method == 'group_sum':
                        agg_df = df.groupby(group_by_cols)[agg_source].sum().reset_index(name=target_col)
                    else:
                        agg_df = df.groupby(group_by_cols)[agg_source].mean().reset_index(name=target_col)
                    df = df.merge(agg_df, on=group_by_cols, how='left')
            elif agg_method == 'group_count_distinct':
                group_by_cols = transform.get('groupByColumns', [])
                agg_source = source_cols[0] if source_cols else None
                if group_by_cols and agg_source:
                    agg_df = df.groupby(group_by_cols)[agg_source].nunique().reset_index(name=target_col)
                    df = df.merge(agg_df, on=group_by_cols, how='left')
            elif agg_method == 'count_distinct':
                if source_cols:
                    group_by_cols = transform.get('groupByColumns', [])
                    if group_by_cols:
                        agg_df = df.groupby(group_by_cols)[source_cols[0]].nunique().reset_index(name=target_col)
                        df = df.merge(agg_df, on=group_by_cols, how='left')
                    else:
                        df[target_col] = df[source_cols[0]].nunique()
            elif agg_method == 'formula':
                if code:
                    # P2-6 FIX: Validate code safety
                    is_safe, reason = validate_code_safety(code)
                    if not is_safe:
                        print(f"🚫 [P2-6] Blocked unsafe formula code for {target_col}: {reason}", file=sys.stderr)
                        errors.append(f"Formula code for {target_col} blocked: {reason}")
                    else:
                        local_vars = {'pd': pd, 'np': np, 'df': df}
                        exec(code, local_vars)
                        df = local_vars.get('df', df)
            elif agg_method == 'date_presence_indicator':
                if source_cols:
                    df[target_col] = df[source_cols[0]].notna().astype(int)
            else:
                # Default to mean
                df[target_col] = df[source_cols].mean(axis=1)

            applied.append(target_col)
            print(f"✅ [Pandas] Added column: {target_col} ({agg_method})", file=sys.stderr)

        except Exception as e:
            error_msg = f"Failed to create {target_col}: {str(e)}"
            errors.append(error_msg)
            df[target_col] = None
            print(f"❌ [Pandas] {error_msg}", file=sys.stderr)

    return {
        'success': len(errors) == 0,
        'data': df.to_dict('records'),
        'columns': list(df.columns),
        'row_count': len(df),
        'transformations_applied': applied,
        'errors': errors,
        'engine': 'pandas'
    }


def execute_transformations(
    data: List[Dict],
    transformations: List[Dict],
    engine: str = 'polars'
) -> Dict[str, Any]:
    """
    Execute a list of compiled transformations.

    Args:
        data: List of row dictionaries
        transformations: List of transformation definitions
        engine: 'polars' (default, faster) or 'pandas'

    Returns:
        Result dictionary with success status, transformed data, and metadata
    """
    if not data:
        return {
            'success': True,
            'data': [],
            'columns': [],
            'row_count': 0,
            'transformations_applied': [],
            'errors': [],
            'engine': engine
        }

    if not transformations:
        return {
            'success': True,
            'data': data,
            'columns': list(data[0].keys()) if data else [],
            'row_count': len(data),
            'transformations_applied': [],
            'errors': [],
            'engine': engine
        }

    print(f"🔄 [Transform] Starting {len(transformations)} transformation(s) on {len(data)} rows", file=sys.stderr)

    # Try Polars first (5-10x faster), fallback to Pandas
    if engine == 'polars' and POLARS_AVAILABLE:
        try:
            return execute_with_polars(data, transformations)
        except Exception as e:
            print(f"⚠️ Polars failed: {e}, falling back to Pandas", file=sys.stderr)

    if PANDAS_AVAILABLE:
        return execute_with_pandas(data, transformations)

    # No engine available
    return {
        'success': False,
        'error': 'Neither Polars nor Pandas is available. Install with: pip install polars pandas',
        'data': data,
        'columns': list(data[0].keys()) if data else [],
        'row_count': len(data),
        'transformations_applied': [],
        'errors': ['No transformation engine available'],
        'engine': 'none'
    }


def main():
    """Main entry point - reads from stdin, writes to stdout"""
    try:
        # Read input from stdin
        input_str = sys.stdin.read()
        if not input_str.strip():
            print(json.dumps({
                'success': False,
                'error': 'No input data provided',
                'data': []
            }))
            return

        input_data = json.loads(input_str)

        # Extract parameters
        data = input_data.get('data', input_data if isinstance(input_data, list) else [])
        transformations = input_data.get('transformations', [])
        engine = input_data.get('engine', 'polars')

        # Execute transformations
        result = execute_transformations(data, transformations, engine)

        # Output result as JSON
        print(json.dumps(result))

    except json.JSONDecodeError as e:
        print(json.dumps({
            'success': False,
            'error': f'Invalid JSON input: {str(e)}',
            'data': []
        }))
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc(),
            'data': []
        }))


if __name__ == '__main__':
    main()
