"""
Transformation Engine for Chimaridata

Handles transformation compilation and execution with business context.

Features:
- Dependency resolution between transformation steps
- Business definition application
- Formula compilation with business context
- Transformation execution with validation
"""

from typing import Dict, List, Optional, Any, Tuple, Set
import logging
import hashlib
from collections import defaultdict
from datetime import datetime

# Pandas for data transformations
import pandas as pd
import numpy as np

# Local imports
from ..models.schemas import (
    TransformationStep, TransformationPlan, TransformationResult,
    TransformationOperation, AggregationMethod, JoinType,
    ColumnDefinition, BusinessDefinition
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# Business Definitions Store
# ============================================================================

class BusinessDefinitionsRegistry:
    """
    Registry of business definitions (formulas, metrics, etc.)

    Provides context for transformations
    """

    def __init__(self):
        """Initialize the registry"""
        self.definitions: Dict[str, BusinessDefinition] = {}

    def register(self, definition: BusinessDefinition) -> None:
        """Register a business definition"""
        self.definitions[definition.id] = definition
        logger.info(f"Registered business definition: {definition.name}")

    def get(self, definition_id: str) -> Optional[BusinessDefinition]:
        """Get a business definition by ID"""
        return self.definitions.get(definition_id)

    def find_by_name(self, name: str) -> Optional[BusinessDefinition]:
        """Find a business definition by name"""
        for definition in self.definitions.values():
            if definition.name.lower() == name.lower():
                return definition
        return None

    def list_by_category(self, category: str) -> List[BusinessDefinition]:
        """List all definitions in a category"""
        return [
            d for d in self.definitions.values()
            if d.category == category
        ]


# Predefined business definitions
PREDEFINED_DEFINITIONS = [
    BusinessDefinition(
        id="bdef_engagement_score",
        name="Engagement Score",
        description="Overall employee engagement score",
        formula="(satisfaction + commitment + advocacy) / 3",
        source_columns=["satisfaction", "commitment", "advocacy"],
        unit="score",
        category="hr"
    ),
    BusinessDefinition(
        id="bdef_conversion_rate",
        name="Conversion Rate",
        description="Percentage of leads that convert to customers",
        formula="(conversions / leads) * 100",
        source_columns=["conversions", "leads"],
        unit="percentage",
        category="marketing"
    ),
    BusinessDefinition(
        id="bdef_customer_ltv",
        name="Customer Lifetime Value",
        description="Total revenue expected from a customer",
        formula="avg_order_value * purchase_frequency * customer_lifespan",
        source_columns=["avg_order_value", "purchase_frequency", "customer_lifespan"],
        unit="dollars",
        category="finance"
    ),
    BusinessDefinition(
        id="bdef_net_promoter_score",
        name="Net Promoter Score",
        description="Customer loyalty metric based on survey responses",
        formula="percentage_promoters - percentage_detractors",
        source_columns=["percentage_promoters", "percentage_detractors"],
        unit="score",
        category="customer_service"
    )
]

# Initialize registry with predefined definitions
_business_registry = BusinessDefinitionsRegistry()
for definition in PREDEFINED_DEFINITIONS:
    _business_registry.register(definition)


def get_business_registry() -> BusinessDefinitionsRegistry:
    """Get the business definitions registry"""
    return _business_registry


# ============================================================================
# Dependency Resolver
# ============================================================================

class DependencyResolver:
    """
    Resolves dependencies between transformation steps

    Ensures steps execute in the correct order
    """

    @staticmethod
    def resolve_dependencies(steps: List[TransformationStep]) -> List[TransformationStep]:
        """
        Resolve dependencies and return steps in execution order

        Uses topological sort to determine correct execution order

        Args:
            steps: List of transformation steps

        Returns:
            Steps sorted in execution order

        Raises:
            ValueError: If circular dependency detected
        """
        # Build dependency graph
        graph: Dict[str, List[str]] = {}
        in_degree: Dict[str, int] = {}

        step_map = {step.step_id: step for step in steps}

        # Initialize graph
        for step in steps:
            graph[step.step_id] = []
            in_degree[step.step_id] = 0

        # Build edges
        for step in steps:
            for dep in step.depends_on:
                if dep in graph:
                    graph[dep].append(step.step_id)
                    in_degree[step.step_id] += 1

        # Topological sort (Kahn's algorithm)
        queue: List[str] = [sid for sid, degree in in_degree.items() if degree == 0]
        result: List[str] = []

        while queue:
            # Get next step (sort for deterministic order)
            queue.sort()
            current = queue.pop(0)
            result.append(current)

            # Reduce in-degree for dependents
            for dependent in graph[current]:
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    queue.append(dependent)

        # Check for cycles
        if len(result) != len(steps):
            raise ValueError(
                f"Circular dependency detected in transformations. "
                f"Unresolved steps: {set(step_map.keys()) - set(result)}"
            )

        # Return steps in order
        return [step_map[step_id] for step_id in result]

    @staticmethod
    def validate_dependencies(steps: List[TransformationStep]) -> Tuple[bool, List[str]]:
        """
        Validate that all dependencies exist

        Args:
            steps: List of transformation steps

        Returns:
            Tuple of (is_valid, error_messages)
        """
        step_ids = {step.step_id for step in steps}
        errors = []

        for step in steps:
            for dep in step.depends_on:
                if dep not in step_ids:
                    errors.append(
                        f"Step '{step.step_id}' depends on non-existent step '{dep}'"
                    )

        return (len(errors) == 0, errors)


# ============================================================================
# Formula Compiler
# ============================================================================

class FormulaCompiler:
    """
    Compiles transformation formulas with business context

    Replaces business definition references with actual formulas
    """

    def __init__(self, business_registry: BusinessDefinitionsRegistry):
        """Initialize with business registry"""
        self.business_registry = business_registry

    def compile(
        self,
        formula: str,
        business_context: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Compile a formula by applying business definitions

        Args:
            formula: The formula to compile
            business_context: Additional business context

        Returns:
            Compiled formula
        """
        compiled = formula

        # Replace business definition references
        # Format: {{bdef:name}}
        import re

        pattern = r'\{\{bdef:([^}]+)\}\}'
        matches = re.findall(pattern, formula)

        for match in matches:
            definition = self.business_registry.find_by_name(match)
            if definition:
                compiled = compiled.replace(f"{{{{bdef:{match}}}}}", f"({definition.formula})")
                logger.info(f"Applied business definition '{match}' to formula")
            else:
                logger.warning(f"Business definition '{match}' not found, keeping reference")

        return compiled

    def compile_step(
        self,
        step: TransformationStep,
        business_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Compile a transformation step with business context

        Args:
            step: Transformation step to compile
            business_context: Business context for compilation

        Returns:
            Compiled step dictionary
        """
        compiled = {
            "step_id": step.step_id,
            "operation": step.operation.value,
            "source_columns": step.source_columns,
            "target_column": step.target_column
        }

        # Apply business definition if present
        if step.business_definition_id:
            definition = self.business_registry.get(step.business_definition_id)
            if definition:
                if step.formula:
                    # Compile with definition
                    compiled["formula"] = self.compile(
                        step.formula,
                        business_context
                    )
                else:
                    # Use definition's formula directly
                    compiled["formula"] = definition.formula
                compiled["business_definition_applied"] = True
                compiled["business_definition_name"] = definition.name
            else:
                logger.warning(
                    f"Business definition '{step.business_definition_id}' not found"
                )
                compiled["formula"] = step.formula or ""
        elif step.formula:
            # Compile formula without business definition
            compiled["formula"] = self.compile(
                step.formula,
                business_context
            )

        # Add other properties
        if step.condition:
            compiled["condition"] = step.condition

        if step.aggregation_method:
            compiled["aggregation_method"] = step.aggregation_method.value

        if step.join_config:
            compiled["join_config"] = step.join_config

        return compiled


# ============================================================================
# Transformation Executor
# ============================================================================

class TransformationExecutor:
    """
    Executes transformation plans on data

    Supports various transformation operations
    """

    def __init__(self):
        """Initialize the executor"""
        self.business_registry = get_business_registry()
        self.compiler = FormulaCompiler(self.business_registry)

    def execute_plan(
        self,
        plan: TransformationPlan,
        datasets: Dict[str, pd.DataFrame],
        business_context: Optional[Dict[str, Any]] = None
    ) -> TransformationResult:
        """
        Execute a complete transformation plan

        Args:
            plan: Transformation plan to execute
            datasets: Dictionary of dataset_id to DataFrame
            business_context: Business context for transformations

        Returns:
            TransformationResult with outcome
        """
        try:
            # Validate dependencies
            is_valid, errors = DependencyResolver.validate_dependencies(plan.steps)
            if not is_valid:
                return TransformationResult(
                    success=False,
                    steps_executed=[],
                    transformed_data={},
                    row_count=0,
                    column_count=0,
                    error=f"Dependency validation failed: {'; '.join(errors)}"
                )

            # Resolve execution order
            ordered_steps = DependencyResolver.resolve_dependencies(plan.steps)

            # Execute steps in order
            current_data: Dict[str, pd.DataFrame] = datasets.copy()
            executed_steps = []
            warnings = []

            for step in ordered_steps:
                try:
                    result = self.execute_step(
                        step=step,
                        datasets=current_data,
                        business_context=business_context
                    )

                    executed_steps.append(step.step_id)

                    if result["success"]:
                        # Update data with transformed result
                        if result["data"] is not None:
                            current_data[plan.dataset_id] = result["data"]
                    else:
                        warnings.append(f"Step {step.step_id}: {result['error']}")

                except Exception as e:
                    logger.error(f"Error executing step {step.step_id}: {e}", exc_info=True)
                    warnings.append(f"Step {step.step_id}: {str(e)}")

            # Return final result
            final_df = current_data.get(plan.dataset_id)

            return TransformationResult(
                success=True,
                steps_executed=executed_steps,
                transformed_data=self._dataframe_to_dict(final_df),
                row_count=len(final_df) if final_df is not None else 0,
                column_count=len(final_df.columns) if final_df is not None else 0,
                warnings=warnings
            )

        except Exception as e:
            logger.error(f"Error executing transformation plan: {e}", exc_info=True)
            return TransformationResult(
                success=False,
                steps_executed=executed_steps if 'executed_steps' in locals() else [],
                transformed_data={},
                row_count=0,
                column_count=0,
                error=str(e)
            )

    def execute_step(
        self,
        step: TransformationStep,
        datasets: Dict[str, pd.DataFrame],
        business_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Execute a single transformation step

        Args:
            step: Transformation step to execute
            datasets: Current state of datasets
            business_context: Business context

        Returns:
            Dictionary with success status and transformed data
        """
        logger.info(f"Executing step: {step.step_id} ({step.operation.value})")

        df = datasets.get(step.step_id.split("_")[0])  # Get primary dataset

        if df is None:
            return {
                "success": False,
                "error": f"No dataset found for step {step.step_id}"
            }

        result_data = None
        error = None

        try:
            # Execute based on operation type
            if step.operation == TransformationOperation.DERIVE_COLUMN:
                result_data = self._derive_column(df, step, business_context)

            elif step.operation == TransformationOperation.AGGREGATE:
                result_data = self._aggregate(df, step, business_context)

            elif step.operation == TransformationOperation.FILTER_ROWS:
                result_data = self._filter_rows(df, step)

            elif step.operation == TransformationOperation.JOIN_DATASETS:
                result_data = self._join_datasets(datasets, step)

            elif step.operation == TransformationOperation.NORMALIZE:
                result_data = self._normalize(df, step)

            elif step.operation == TransformationOperation.ENCODE_CATEGORICAL:
                result_data = self._encode_categorical(df, step)

            elif step.operation == TransformationOperation.FILL_MISSING:
                result_data = self._fill_missing(df, step)

            elif step.operation == TransformationOperation.RENAME_COLUMN:
                result_data = self._rename_column(df, step)

            elif step.operation == TransformationOperation.CAST_TYPE:
                result_data = self._cast_type(df, step)

            else:
                error = f"Unknown operation: {step.operation.value}"

        except Exception as e:
            error = str(e)
            logger.error(f"Error in step {step.step_id}: {error}", exc_info=True)

        return {
            "success": error is None,
            "data": result_data,
            "error": error
        }

    def _derive_column(
        self,
        df: pd.DataFrame,
        step: TransformationStep,
        business_context: Optional[Dict[str, Any]] = None
    ) -> pd.DataFrame:
        """Execute derive column operation"""
        # Compile formula with business context
        compiled = self.compiler.compile_step(step, business_context)
        formula = compiled.get("formula", "")

        # Check if all source columns exist
        missing = [col for col in step.source_columns if col not in df.columns]
        if missing:
            raise ValueError(f"Missing columns: {missing}")

        # Evaluate formula
        # Note: In production, use a safe expression evaluator
        try:
            # Create safe evaluation context
            context = {col: df[col] for col in step.source_columns}

            # For simple arithmetic, use eval with restricted globals
            import math
            safe_globals = {
                "__builtins__": {},
                "math": math,
                "np": np
            }

            result = eval(formula, safe_globals, context)

            # Ensure result is a Series
            if not isinstance(result, pd.Series):
                result = pd.Series(result, index=df.index)

            df[step.target_column] = result

        except Exception as e:
            raise ValueError(f"Formula evaluation failed: {e}")

        return df

    def _aggregate(
        self,
        df: pd.DataFrame,
        step: TransformationStep,
        business_context: Optional[Dict[str, Any]] = None
    ) -> pd.DataFrame:
        """Execute aggregate operation"""
        method = step.aggregation_method
        if method is None:
            raise ValueError("Aggregation method not specified")

        agg_map = {
            AggregationMethod.SUM: "sum",
            AggregationMethod.AVG: "mean",
            AggregationMethod.MEAN: "mean",
            AggregationMethod.MEDIAN: "median",
            AggregationMethod.MIN: "min",
            AggregationMethod.MAX: "max",
            AggregationMethod.COUNT: "count",
            AggregationMethod.COUNT_DISTINCT: "nunique",
            AggregationMethod.STD: "std",
            AggregationMethod.VAR: "var"
        }

        pandas_method = agg_map[method]

        # Group by condition if provided
        if step.condition and "group_by" in step.condition:
            group_col = step.condition["group_by"]
            result = df.groupby(group_col)[step.source_columns].agg(pandas_method)
            result = result.reset_index()
        else:
            # Aggregate entire dataframe
            result = df[step.source_columns].agg(pandas_method).to_frame().T
            result.insert(0, step.target_column, [0])

        # Rename column to target
        if method == AggregationMethod.COUNT:
            result = result.rename(columns={step.source_columns[0]: step.target_column})
        elif len(result.columns) > 1:
            result = result.rename(columns={result.columns[-1]: step.target_column})

        return result

    def _filter_rows(self, df: pd.DataFrame, step: TransformationStep) -> pd.DataFrame:
        """Execute filter rows operation"""
        if not step.condition:
            raise ValueError("Filter condition not specified")

        condition = step.condition

        # Apply filter based on condition type
        if "column" in condition and "operator" in condition:
            col = condition["column"]
            op = condition["operator"]
            value = condition["value"]

            if col not in df.columns:
                raise ValueError(f"Column '{col}' not found")

            if op == "eq":
                result = df[df[col] == value]
            elif op == "neq":
                result = df[df[col] != value]
            elif op == "gt":
                result = df[df[col] > value]
            elif op == "gte":
                result = df[df[col] >= value]
            elif op == "lt":
                result = df[df[col] < value]
            elif op == "lte":
                result = df[df[col] <= value]
            elif op == "in":
                result = df[df[col].isin(value)]
            elif op == "not_in":
                result = df[~df[col].isin(value)]
            elif op == "is_null":
                result = df[df[col].isna()]
            elif op == "is_not_null":
                result = df[df[col].notna()]
            else:
                raise ValueError(f"Unknown operator: {op}")
        else:
            raise ValueError("Invalid filter condition format")

        return result

    def _join_datasets(
        self,
        datasets: Dict[str, pd.DataFrame],
        step: TransformationStep
    ) -> pd.DataFrame:
        """Execute join datasets operation"""
        if not step.join_config:
            raise ValueError("Join configuration not specified")

        config = step.join_config

        left_id = config.get("left_dataset")
        right_id = config.get("right_dataset")
        left_key = config.get("left_key")
        right_key = config.get("right_key")
        join_type = config.get("type", "inner")

        left_df = datasets.get(left_id)
        right_df = datasets.get(right_id)

        if left_df is None:
            raise ValueError(f"Left dataset '{left_id}' not found")
        if right_df is None:
            raise ValueError(f"Right dataset '{right_id}' not found")

        if left_key not in left_df.columns:
            raise ValueError(f"Left key '{left_key}' not found in left dataset")
        if right_key not in right_df.columns:
            raise ValueError(f"Right key '{right_key}' not found in right dataset")

        # Map join type
        how_map = {
            "inner": "inner",
            "left": "left",
            "right": "right",
            "outer": "outer"
        }
        how = how_map.get(join_type, "inner")

        # Perform join
        result = pd.merge(
            left_df,
            right_df,
            left_on=left_key,
            right_on=right_key,
            how=how,
            suffixes=('_left', '_right')
        )

        return result

    def _normalize(
        self,
        df: pd.DataFrame,
        step: TransformationStep
    ) -> pd.DataFrame:
        """Execute normalize operation"""
        method = step.condition.get("method", "minmax") if step.condition else "minmax"

        for col in step.source_columns:
            if col not in df.columns:
                continue

            if not pd.api.types.is_numeric_dtype(df[col]):
                continue

            if method == "minmax":
                # Min-Max normalization (0-1)
                min_val = df[col].min()
                max_val = df[col].max()
                if max_val != min_val:
                    df[step.target_column] = (df[col] - min_val) / (max_val - min_val)
                else:
                    df[step.target_column] = 0.0

            elif method == "zscore":
                # Z-score normalization
                mean_val = df[col].mean()
                std_val = df[col].std()
                if std_val != 0:
                    df[step.target_column] = (df[col] - mean_val) / std_val
                else:
                    df[step.target_column] = 0.0

        return df

    def _encode_categorical(
        self,
        df: pd.DataFrame,
        step: TransformationStep
    ) -> pd.DataFrame:
        """Execute encode categorical operation"""
        method = step.condition.get("method", "onehot") if step.condition else "onehot"

        for col in step.source_columns:
            if col not in df.columns:
                continue

            if method == "onehot":
                # One-hot encoding
                dummies = pd.get_dummies(df[col], prefix=col)
                df = pd.concat([df, dummies], axis=1)
                df = df.drop(columns=[col])

            elif method == "label":
                # Label encoding
                df[step.target_column] = pd.factorize(df[col])[0]

        return df

    def _fill_missing(
        self,
        df: pd.DataFrame,
        step: TransformationStep
    ) -> pd.DataFrame:
        """Execute fill missing operation"""
        method = step.condition.get("method", "mean") if step.condition else "mean"

        for col in step.source_columns:
            if col not in df.columns:
                continue

            if method == "mean":
                df[col] = df[col].fillna(df[col].mean())
            elif method == "median":
                df[col] = df[col].fillna(df[col].median())
            elif method == "mode":
                df[col] = df[col].fillna(df[col].mode()[0])
            elif method == "zero":
                df[col] = df[col].fillna(0)
            elif method == "forward":
                df[col] = df[col].fillna(method="ffill")
            elif method == "backward":
                df[col] = df[col].fillna(method="bfill")
            elif method == "value" and "value" in step.condition:
                df[col] = df[col].fillna(step.condition["value"])

        return df

    def _rename_column(
        self,
        df: pd.DataFrame,
        step: TransformationStep
    ) -> pd.DataFrame:
        """Execute rename column operation"""
        if not step.source_columns:
            raise ValueError("Source column not specified")

        old_name = step.source_columns[0]
        if old_name not in df.columns:
            raise ValueError(f"Column '{old_name}' not found")

        df = df.rename(columns={old_name: step.target_column})
        return df

    def _cast_type(
        self,
        df: pd.DataFrame,
        step: TransformationStep
    ) -> pd.DataFrame:
        """Execute cast type operation"""
        target_type = step.condition.get("type", "string") if step.condition else "string"

        for col in step.source_columns:
            if col not in df.columns:
                continue

            try:
                if target_type == "int":
                    df[col] = pd.to_numeric(df[col], downcast="integer")
                elif target_type == "float":
                    df[col] = pd.to_numeric(df[col], downcast="float")
                elif target_type == "string":
                    df[col] = df[col].astype(str)
                elif target_type == "bool":
                    df[col] = df[col].astype(bool)
                elif target_type == "datetime":
                    df[col] = pd.to_datetime(df[col])
            except Exception as e:
                logger.warning(f"Failed to cast {col} to {target_type}: {e}")

        return df

    def _dataframe_to_dict(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Convert DataFrame to dictionary for storage"""
        return {
            "columns": df.columns.tolist(),
            "data": df.to_dict(orient="records"),
            "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()}
        }


# ============================================================================
# Main Transformation Engine
# ============================================================================

async def compile_and_execute_transformation_plan(
    project_id: str,
    datasets: List[str],
    mappings: List[Dict],
    business_context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Compile and execute a transformation plan

    Convenience function for the orchestrator

    Args:
        project_id: Project ID
        datasets: List of dataset IDs
        mappings: Question-element mappings
        business_context: Business context for transformations

    Returns:
        Dictionary with execution results
    """
    # In a real implementation, this would:
    # 1. Load datasets from storage
    # 2. Create transformation plan from mappings
    # 3. Compile transformations with business definitions
    # 4. Execute transformations
    # 5. Return results

    # For now, return mock result
    return {
        "success": True,
        "transformation_plan": {
            "project_id": project_id,
            "dataset_id": datasets[0] if datasets else "",
            "steps": []
        },
        "steps_executed": [],
        "transformed_data": {},
        "row_count": 0,
        "column_count": 0
    }


# ============================================================================
# Singleton Instance
# ============================================================================

_executor_instance: Optional[TransformationExecutor] = None


def get_transformation_executor() -> TransformationExecutor:
    """Get the singleton transformation executor instance"""
    global _executor_instance
    if _executor_instance is None:
        _executor_instance = TransformationExecutor()
    return _executor_instance
