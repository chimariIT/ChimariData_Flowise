#!/usr/bin/env python3
"""
Pandas-based data analysis service for ChimariData
Provides intelligent analysis of datasets using pandas and numpy
"""

import pandas as pd
import numpy as np
import json
import sys
import os
from typing import Dict, List, Any, Optional, Tuple
import re
from collections import Counter

class DataAnalyzer:
    """Smart data analyzer using pandas and numpy for statistical analysis"""
    
    def __init__(self, file_path: str):
        """Initialize analyzer with dataset file path"""
        self.file_path = file_path
        self.df = None
        self.schema = {}
        self.load_data()
    
    def load_data(self):
        """Load and prepare dataset for analysis"""
        try:
            # Auto-detect file format and load
            if self.file_path.endswith('.csv'):
                self.df = pd.read_csv(self.file_path)
            elif self.file_path.endswith(('.xlsx', '.xls')):
                self.df = pd.read_excel(self.file_path)
            else:
                raise ValueError(f"Unsupported file format: {self.file_path}")
            
            # Generate schema information
            self.schema = self._generate_schema()
            
        except Exception as e:
            raise Exception(f"Failed to load data: {str(e)}")
    
    def _generate_schema(self) -> Dict[str, str]:
        """Generate schema information from the dataframe"""
        schema = {}
        for col in self.df.columns:
            dtype = str(self.df[col].dtype)
            if dtype.startswith('int'):
                schema[col] = 'integer'
            elif dtype.startswith('float'):
                schema[col] = 'float'
            elif dtype.startswith('datetime'):
                schema[col] = 'datetime'
            elif dtype.startswith('bool'):
                schema[col] = 'boolean'
            else:
                schema[col] = 'text'
        return schema
    
    def analyze_question(self, question: str) -> Dict[str, Any]:
        """Analyze data based on user question using pandas operations"""
        question_lower = question.lower()
        
        # Count-based questions
        if self._is_count_question(question_lower):
            return self._handle_count_question(question_lower)
        
        # Location-based questions
        elif self._is_location_question(question_lower):
            return self._handle_location_question(question_lower)
        
        # Demographic questions
        elif self._is_demographic_question(question_lower):
            return self._handle_demographic_question(question_lower)
        
        # Performance/metrics questions
        elif self._is_performance_question(question_lower):
            return self._handle_performance_question(question_lower)
        
        # Top/best questions
        elif self._is_top_question(question_lower):
            return self._handle_top_question(question_lower)
        
        # General summary
        else:
            return self._generate_general_summary(question)
    
    def _is_count_question(self, question: str) -> bool:
        """Check if question is asking for counts"""
        count_patterns = ['how many', 'count of', 'number of', 'total']
        return any(pattern in question for pattern in count_patterns)
    
    def _is_location_question(self, question: str) -> bool:
        """Check if question is about locations"""
        location_patterns = ['where', 'location', 'city', 'state', 'country', 'region']
        return any(pattern in question for pattern in location_patterns)
    
    def _is_demographic_question(self, question: str) -> bool:
        """Check if question is about demographics"""
        demo_patterns = ['age', 'gender', 'audience', 'segment', 'demographic']
        return any(pattern in question for pattern in demo_patterns)
    
    def _is_performance_question(self, question: str) -> bool:
        """Check if question is about performance metrics"""
        performance_patterns = ['conversion', 'roi', 'cost', 'revenue', 'rate', 'performance']
        return any(pattern in question for pattern in performance_patterns)
    
    def _is_top_question(self, question: str) -> bool:
        """Check if question is asking for top/best items"""
        top_patterns = ['top', 'best', 'highest', 'most', 'popular', 'successful']
        return any(pattern in question for pattern in top_patterns)
    
    def _handle_count_question(self, question: str) -> Dict[str, Any]:
        """Handle questions asking for counts"""
        total_records = len(self.df)
        
        # Look for specific entities in question
        entities = self._extract_entities(question)
        
        if not entities:
            return {
                'answer': f"Your dataset contains {total_records} total records.",
                'details': f"Each record has {len(self.df.columns)} fields: {', '.join(self.df.columns)}",
                'analysis_type': 'count'
            }
        
        # Count by specific entities
        results = {}
        for entity in entities:
            matching_cols = self._find_matching_columns(entity)
            if matching_cols:
                for col in matching_cols:
                    unique_count = self.df[col].nunique()
                    results[col] = unique_count
        
        if results:
            result_text = []
            for col, count in results.items():
                result_text.append(f"{count} unique {col.lower()} values")
            
            return {
                'answer': f"Your dataset contains {total_records} records with {', '.join(result_text)}.",
                'details': f"Analysis based on columns: {', '.join(results.keys())}",
                'analysis_type': 'count_by_entity'
            }
        
        return {
            'answer': f"Your dataset contains {total_records} total records.",
            'details': f"Available columns for analysis: {', '.join(self.df.columns)}",
            'analysis_type': 'count'
        }
    
    def _handle_location_question(self, question: str) -> Dict[str, Any]:
        """Handle questions about locations"""
        location_cols = self._find_location_columns()
        
        if not location_cols:
            return {
                'answer': "No location columns found in your dataset.",
                'details': f"Available columns: {', '.join(self.df.columns)}",
                'analysis_type': 'location'
            }
        
        location_analysis = {}
        for col in location_cols:
            top_locations = self.df[col].value_counts().head(10)
            location_analysis[col] = {
                'unique_count': self.df[col].nunique(),
                'top_locations': top_locations.to_dict()
            }
        
        # Generate response
        response_parts = []
        for col, analysis in location_analysis.items():
            top_locs = list(analysis['top_locations'].keys())[:5]
            response_parts.append(f"{analysis['unique_count']} unique {col.lower()} values including {', '.join(top_locs)}")
        
        return {
            'answer': f"Location analysis shows: {'; '.join(response_parts)}",
            'details': location_analysis,
            'analysis_type': 'location'
        }
    
    def _handle_demographic_question(self, question: str) -> Dict[str, Any]:
        """Handle demographic-related questions"""
        demo_cols = self._find_demographic_columns()
        
        if not demo_cols:
            return {
                'answer': "No demographic columns identified in your dataset.",
                'details': f"Available columns: {', '.join(self.df.columns)}",
                'analysis_type': 'demographic'
            }
        
        demo_analysis = {}
        for col in demo_cols:
            distribution = self.df[col].value_counts()
            demo_analysis[col] = {
                'unique_count': self.df[col].nunique(),
                'distribution': distribution.head(10).to_dict()
            }
        
        # Generate response
        response_parts = []
        for col, analysis in demo_analysis.items():
            top_segments = list(analysis['distribution'].keys())[:3]
            response_parts.append(f"{col}: {', '.join(map(str, top_segments))}")
        
        return {
            'answer': f"Demographic breakdown: {'; '.join(response_parts)}",
            'details': demo_analysis,
            'analysis_type': 'demographic'
        }
    
    def _handle_performance_question(self, question: str) -> Dict[str, Any]:
        """Handle performance metrics questions"""
        numeric_cols = self._find_numeric_columns()
        performance_cols = [col for col in numeric_cols if any(
            perf in col.lower() for perf in ['conversion', 'roi', 'cost', 'revenue', 'rate']
        )]
        
        if not performance_cols:
            return {
                'answer': "No performance metrics columns identified.",
                'details': f"Numeric columns available: {', '.join(numeric_cols)}",
                'analysis_type': 'performance'
            }
        
        performance_analysis = {}
        for col in performance_cols:
            stats = self.df[col].describe()
            performance_analysis[col] = {
                'mean': round(stats['mean'], 2),
                'median': round(stats['50%'], 2),
                'min': round(stats['min'], 2),
                'max': round(stats['max'], 2)
            }
        
        # Generate response
        response_parts = []
        for col, stats in performance_analysis.items():
            response_parts.append(f"{col}: avg {stats['mean']}, range {stats['min']}-{stats['max']}")
        
        return {
            'answer': f"Performance metrics: {'; '.join(response_parts)}",
            'details': performance_analysis,
            'analysis_type': 'performance'
        }
    
    def _handle_top_question(self, question: str) -> Dict[str, Any]:
        """Handle questions asking for top performers"""
        # Find relevant columns based on question context
        if 'campaign' in question:
            groupby_col = self._find_campaign_column()
        elif 'company' in question:
            groupby_col = self._find_company_column()
        else:
            groupby_col = None
        
        if not groupby_col:
            return {
                'answer': "Unable to identify grouping column for top analysis.",
                'details': f"Available columns: {', '.join(self.df.columns)}",
                'analysis_type': 'top'
            }
        
        # Find metric column
        metric_col = self._find_metric_column()
        if not metric_col:
            metric_col = self._find_numeric_columns()[0] if self._find_numeric_columns() else None
        
        if not metric_col:
            return {
                'answer': "No numeric metric column found for ranking.",
                'details': f"Available columns: {', '.join(self.df.columns)}",
                'analysis_type': 'top'
            }
        
        # Calculate top performers
        top_performers = self.df.groupby(groupby_col)[metric_col].mean().sort_values(ascending=False).head(5)
        
        response_parts = []
        for item, value in top_performers.items():
            response_parts.append(f"{item}: {round(value, 2)}")
        
        return {
            'answer': f"Top 5 {groupby_col.lower()} by {metric_col.lower()}: {'; '.join(response_parts)}",
            'details': top_performers.to_dict(),
            'analysis_type': 'top'
        }
    
    def _generate_general_summary(self, question: str) -> Dict[str, Any]:
        """Generate general dataset summary"""
        summary = {
            'total_records': len(self.df),
            'total_columns': len(self.df.columns),
            'column_names': list(self.df.columns),
            'missing_data': self.df.isnull().sum().sum(),
            'numeric_columns': self._find_numeric_columns(),
            'categorical_columns': self._find_categorical_columns()
        }
        
        return {
            'answer': f"Dataset overview: {summary['total_records']} records, {summary['total_columns']} columns. Columns include: {', '.join(summary['column_names'][:5])}{'...' if len(summary['column_names']) > 5 else ''}",
            'details': summary,
            'analysis_type': 'summary'
        }
    
    def _extract_entities(self, question: str) -> List[str]:
        """Extract entities from question"""
        entities = []
        entity_patterns = {
            'customer': ['customer', 'client', 'user'],
            'campaign': ['campaign', 'ad', 'marketing'],
            'company': ['company', 'business', 'organization'],
            'product': ['product', 'item', 'service']
        }
        
        for entity_type, patterns in entity_patterns.items():
            if any(pattern in question for pattern in patterns):
                entities.append(entity_type)
        
        return entities
    
    def _find_matching_columns(self, entity: str) -> List[str]:
        """Find columns that match entity type"""
        matching_cols = []
        for col in self.df.columns:
            if entity.lower() in col.lower():
                matching_cols.append(col)
        return matching_cols
    
    def _find_location_columns(self) -> List[str]:
        """Find columns that contain location data"""
        location_keywords = ['location', 'city', 'state', 'country', 'region', 'address']
        location_cols = []
        
        for col in self.df.columns:
            if any(keyword in col.lower() for keyword in location_keywords):
                location_cols.append(col)
        
        return location_cols
    
    def _find_demographic_columns(self) -> List[str]:
        """Find columns that contain demographic data"""
        demo_keywords = ['age', 'gender', 'audience', 'segment', 'demographic', 'target']
        demo_cols = []
        
        for col in self.df.columns:
            if any(keyword in col.lower() for keyword in demo_keywords):
                demo_cols.append(col)
        
        return demo_cols
    
    def _find_numeric_columns(self) -> List[str]:
        """Find numeric columns"""
        return [col for col in self.df.columns if self.df[col].dtype in ['int64', 'float64']]
    
    def _find_categorical_columns(self) -> List[str]:
        """Find categorical columns"""
        return [col for col in self.df.columns if self.df[col].dtype == 'object']
    
    def _find_campaign_column(self) -> Optional[str]:
        """Find campaign-related column"""
        campaign_keywords = ['campaign', 'ad', 'marketing']
        for col in self.df.columns:
            if any(keyword in col.lower() for keyword in campaign_keywords):
                return col
        return None
    
    def _find_company_column(self) -> Optional[str]:
        """Find company-related column"""
        company_keywords = ['company', 'business', 'organization']
        for col in self.df.columns:
            if any(keyword in col.lower() for keyword in company_keywords):
                return col
        return None
    
    def _find_metric_column(self) -> Optional[str]:
        """Find metric column for ranking"""
        metric_keywords = ['roi', 'conversion', 'rate', 'revenue', 'cost', 'score']
        numeric_cols = self._find_numeric_columns()
        
        for col in numeric_cols:
            if any(keyword in col.lower() for keyword in metric_keywords):
                return col
        return None

def main():
    """Main function to run analysis from command line"""
    if len(sys.argv) < 3:
        print("Usage: python pandas-analyzer.py <file_path> <question>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    question = sys.argv[2]
    
    try:
        analyzer = DataAnalyzer(file_path)
        result = analyzer.analyze_question(question)
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}, indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()