#!/usr/bin/env python3
"""
Pandas-based Data Transformation Service
Provides comprehensive data transformation with pandas dataframes
"""

import pandas as pd
import json
import sys
from typing import Dict, List, Any, Optional

class PandasTransformationEngine:
    """Advanced data transformation engine using pandas"""
    
    def __init__(self):
        self.transformation_methods = {
            'filter': self._apply_filter,
            'select': self._apply_select,
            'aggregate': self._apply_aggregate,
            'sort': self._apply_sort,
            'rename': self._apply_rename,
            'convert': self._apply_convert,
            'clean': self._apply_clean
        }
    
    def apply_transformations(self, data: List[Dict], transformations: List[Dict]) -> Dict:
        """
        Apply a series of transformations to the dataset
        
        Args:
            data: List of dictionaries representing the dataset
            transformations: List of transformation configurations
            
        Returns:
            Dictionary with transformed data and metadata
        """
        try:
            # Convert to pandas DataFrame
            df = pd.DataFrame(data)
            original_count = len(df)
            
            print(f"Starting with {original_count} rows, {len(df.columns)} columns")
            
            # Apply each transformation in sequence
            for i, transformation in enumerate(transformations):
                transform_type = transformation.get('type')
                config = transformation.get('config', {})
                
                print(f"Applying transformation {i+1}: {transform_type}")
                
                if transform_type in self.transformation_methods:
                    df = self.transformation_methods[transform_type](df, config)
                    print(f"After {transform_type}: {len(df)} rows")
                else:
                    print(f"Unknown transformation type: {transform_type}")
            
            # Convert datetime columns to strings for JSON serialization
            for col in df.columns:
                if df[col].dtype == 'datetime64[ns]':
                    df[col] = df[col].dt.strftime('%Y-%m-%d %H:%M:%S')
            
            # Convert back to list of dictionaries
            result_data = df.to_dict('records')
            
            return {
                'success': True,
                'data': result_data,
                'original_count': original_count,
                'transformed_count': len(result_data),
                'columns': list(df.columns),
                'transformations_applied': len(transformations)
            }
            
        except Exception as e:
            print(f"Transformation error: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'data': data,  # Return original data on error
                'original_count': len(data),
                'transformed_count': 0
            }
    
    def _apply_filter(self, df: pd.DataFrame, config: Dict) -> pd.DataFrame:
        """Apply filter transformation"""
        field = config.get('field')
        operator = config.get('operator')
        value = config.get('value')
        
        if not all([field, operator, value]):
            return df
        
        if field not in df.columns:
            return df
        
        try:
            if operator == 'equals':
                return df[df[field] == value]
            elif operator == 'not_equals':
                return df[df[field] != value]
            elif operator == 'contains':
                return df[df[field].astype(str).str.contains(str(value), na=False)]
            elif operator == 'greater_than':
                return df[pd.to_numeric(df[field], errors='coerce') > float(value)]
            elif operator == 'less_than':
                return df[pd.to_numeric(df[field], errors='coerce') < float(value)]
            else:
                return df
        except Exception as e:
            print(f"Filter error: {str(e)}")
            return df
    
    def _apply_select(self, df: pd.DataFrame, config: Dict) -> pd.DataFrame:
        """Apply column selection"""
        fields = config.get('fields', [])
        
        if not fields:
            return df
        
        # Only select columns that exist in the DataFrame
        valid_fields = [f for f in fields if f in df.columns]
        
        if valid_fields:
            return df[valid_fields]
        else:
            return df
    
    def _apply_aggregate(self, df: pd.DataFrame, config: Dict) -> pd.DataFrame:
        """Apply aggregation transformation with pandas groupby"""
        group_by = config.get('groupBy', [])
        aggregations = config.get('aggregations', [])
        
        print(f"Aggregation config: groupBy={group_by}, aggregations={aggregations}")
        
        if not group_by or not aggregations:
            print("Invalid aggregation config")
            return df
        
        # Validate group by fields exist
        valid_group_by = [field for field in group_by if field in df.columns]
        if not valid_group_by:
            print("No valid group by fields")
            return df
        
        try:
            # Build aggregation dictionary for pandas
            agg_dict = {}
            for agg in aggregations:
                field = agg.get('field')
                operation = agg.get('operation')
                alias = agg.get('alias', f"{field}_{operation}")
                
                if field not in df.columns:
                    continue
                
                # Map operations to pandas functions
                if operation == 'sum':
                    agg_dict[field] = 'sum'
                elif operation == 'avg':
                    agg_dict[field] = 'mean'
                elif operation == 'count':
                    agg_dict[field] = 'count'
                elif operation == 'min':
                    agg_dict[field] = 'min'
                elif operation == 'max':
                    agg_dict[field] = 'max'
            
            if not agg_dict:
                print("No valid aggregations")
                return df
            
            # Perform aggregation
            grouped = df.groupby(valid_group_by).agg(agg_dict).reset_index()
            
            # Rename columns to use aliases
            for agg in aggregations:
                field = agg.get('field')
                alias = agg.get('alias')
                if field in grouped.columns and alias and alias != field:
                    grouped = grouped.rename(columns={field: alias})
            
            print(f"Aggregation result: {len(grouped)} rows, columns: {list(grouped.columns)}")
            return grouped
            
        except Exception as e:
            print(f"Aggregation error: {str(e)}")
            return df
    
    def _apply_sort(self, df: pd.DataFrame, config: Dict) -> pd.DataFrame:
        """Apply sorting transformation"""
        fields = config.get('fields', [])
        order = config.get('order', 'asc')
        
        if not fields:
            return df
        
        # Only sort by fields that exist
        valid_fields = [f for f in fields if f in df.columns]
        
        if valid_fields:
            ascending = order == 'asc'
            return df.sort_values(by=valid_fields, ascending=ascending)
        else:
            return df
    
    def _apply_rename(self, df: pd.DataFrame, config: Dict) -> pd.DataFrame:
        """Apply column renaming"""
        mappings = config.get('mappings', {})
        
        if not mappings:
            return df
        
        # Only rename columns that exist and have valid new names
        valid_mappings = {old: new for old, new in mappings.items() 
                         if old in df.columns and new and new.strip()}
        
        if valid_mappings:
            return df.rename(columns=valid_mappings)
        else:
            return df
    
    def _apply_convert(self, df: pd.DataFrame, config: Dict) -> pd.DataFrame:
        """Apply data type conversion"""
        field = config.get('field')
        new_type = config.get('newType')
        
        if not field or not new_type or field not in df.columns:
            return df
        
        try:
            if new_type == 'number':
                df[field] = pd.to_numeric(df[field], errors='coerce')
            elif new_type == 'text':
                df[field] = df[field].astype(str)
            elif new_type == 'date':
                df[field] = pd.to_datetime(df[field], errors='coerce')
            elif new_type == 'boolean':
                df[field] = df[field].astype(bool)
            
            return df
        except Exception as e:
            print(f"Conversion error: {str(e)}")
            return df
    
    def _apply_clean(self, df: pd.DataFrame, config: Dict) -> pd.DataFrame:
        """Apply data cleaning"""
        remove_nulls = config.get('removeNulls', False)
        trim_whitespace = config.get('trimWhitespace', False)
        
        if remove_nulls:
            df = df.dropna()
        
        if trim_whitespace:
            # Trim whitespace from string columns
            string_cols = df.select_dtypes(include=['object']).columns
            for col in string_cols:
                df[col] = df[col].astype(str).str.strip()
        
        return df

def transform_data_from_json(data_json: str, transformations_json: str) -> str:
    """
    Transform data from JSON inputs (for command line interface)
    """
    try:
        data = json.loads(data_json)
        transformations = json.loads(transformations_json)
        
        engine = PandasTransformationEngine()
        result = engine.apply_transformations(data, transformations)
        
        return json.dumps(result)
    
    except Exception as e:
        return json.dumps({
            'success': False,
            'error': str(e),
            'data': [],
            'original_count': 0,
            'transformed_count': 0
        })

if __name__ == "__main__":
    if len(sys.argv) == 3:
        result = transform_data_from_json(sys.argv[1], sys.argv[2])
        print(result)
    else:
        print("Usage: python pandas-transformation-service.py '<data_json>' '<transformations_json>'")