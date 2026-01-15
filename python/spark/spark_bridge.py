#!/usr/bin/env python3
"""
Spark Bridge for ChimariData Analytics Platform
Provides Python-based Spark operations for heavy data processing and ML tasks
"""

import sys
import json
import os
from typing import Dict, List, Any, Optional
import logging

# Setup logging early so Spark import diagnostics are captured
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Spark imports - these will be available in production with proper Spark setup
try:
    from pyspark.sql import SparkSession, DataFrame
    from pyspark.sql.types import *
    from pyspark.sql.functions import *
    from pyspark.ml import Pipeline
    from pyspark.ml.feature import VectorAssembler, StandardScaler, StringIndexer
    from pyspark.ml.regression import LinearRegression, RandomForestRegressor
    from pyspark.ml.classification import LogisticRegression, RandomForestClassifier
    from pyspark.ml.clustering import KMeans
    from pyspark.ml.evaluation import RegressionEvaluator, BinaryClassificationEvaluator
    from pyspark.ml.stat import Correlation
    SPARK_AVAILABLE = True
except ImportError as import_error:
    logger.warning("PySpark import failed: %s", import_error)
    SPARK_AVAILABLE = False
    # Mock classes for development
    class SparkSession:
        @staticmethod
        def builder():
            return MockSparkBuilder()
    
    class MockSparkBuilder:
        def appName(self, name): return self
        def master(self, master): return self
        def config(self, key, value): return self
        def enableHiveSupport(self): return self
        def getOrCreate(self): return MockSpark()
    
    class MockSpark:
        def read(self): return MockDataFrameReader()
        def stop(self): pass
    
    class MockDataFrameReader:
        def option(self, key, value): return self
        def csv(self, path): return MockDataFrame()
        def json(self, path): return MockDataFrame()
        def parquet(self, path): return MockDataFrame()
    
    class MockDataFrame:
        def show(self): pass
        def count(self): return 0
        def collect(self): return []
        def toPandas(self): 
            import pandas as pd
            return pd.DataFrame()
class SparkBridge:
    def __init__(self, config: Dict[str, Any]):
        """Initialize Spark session with provided configuration"""
        self.config = config
        self.spark: Optional[SparkSession] = None
        self.is_mock = not SPARK_AVAILABLE
        
        if self.is_mock:
            logger.warning("Spark not available - running in mock mode")
        else:
            self._initialize_spark()
    
    def _initialize_spark(self):
        """Initialize real Spark session"""
        try:
            builder = SparkSession.builder \
                .appName(self.config.get('appName', 'ChimariData-Analytics')) \
                .master(self.config.get('master', 'local[*]'))
            
            # Apply configuration options
            for key, value in self.config.get('javaOptions', {}).items():
                builder = builder.config(key, value)
            
            # Set memory configurations
            if 'executorMemory' in self.config:
                builder = builder.config('spark.executor.memory', self.config['executorMemory'])
            if 'driverMemory' in self.config:
                builder = builder.config('spark.driver.memory', self.config['driverMemory'])
            
            # Enable Hive support if configured
            if self.config.get('enableHiveSupport', False):
                builder = builder.enableHiveSupport()
            
            self.spark = builder.getOrCreate()
            logger.info(f"Spark session initialized: {self.spark.version}")
            
        except Exception as e:
            logger.error(f"Failed to initialize Spark: {e}")
            self.is_mock = True
    
    def process_file(self, file_path: str, file_type: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """Process a file using Spark and return data, schema, and metadata"""
        if self.is_mock:
            return self._mock_process_file(file_path, file_type)
        
        try:
            options = options or {}
            
            # Read file based on type
            if file_type.lower() in ['csv', 'text/csv']:
                df = self.spark.read.option("header", "true").option("inferSchema", "true")
                for key, value in options.items():
                    df = df.option(key, value)
                df = df.csv(file_path)
            
            elif file_type.lower() in ['json', 'application/json']:
                df = self.spark.read.json(file_path)
            
            elif file_type.lower() in ['parquet', 'application/parquet']:
                df = self.spark.read.parquet(file_path)
            
            else:
                raise ValueError(f"Unsupported file type: {file_type}")
            
            # Get schema information
            schema_info = {
                'columns': [{'name': field.name, 'type': str(field.dataType)} for field in df.schema.fields],
                'nullable_columns': [field.name for field in df.schema.fields if field.nullable]
            }
            
            # Get data sample and statistics
            record_count = df.count()
            sample_data = df.limit(100).toPandas().to_dict('records') if record_count > 0 else []
            
            # Basic statistics for numeric columns
            numeric_columns = [field.name for field in df.schema.fields 
                             if field.dataType in [IntegerType(), LongType(), FloatType(), DoubleType()]]
            
            statistics = {}
            if numeric_columns:
                stats_df = df.select(numeric_columns).describe()
                statistics = {row['summary']: dict(zip(numeric_columns, row[1:])) 
                            for row in stats_df.collect()}
            
            return {
                'success': True,
                'data': sample_data,
                'schema': schema_info,
                'recordCount': record_count,
                'statistics': statistics,
                'file_type': file_type
            }
            
        except Exception as e:
            logger.error(f"Error processing file {file_path}: {e}")
            return {
                'success': False,
                'error': str(e),
                'file_type': file_type
            }
    
    def perform_analysis(self, data_path: str, analysis_type: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Perform advanced analytics using Spark ML"""
        if self.is_mock:
            return self._mock_analysis(analysis_type, parameters)
        
        try:
            # Load data
            df = self._load_data(data_path, parameters.get('data_format', 'csv'))
            
            if analysis_type == 'regression':
                return self._perform_regression(df, parameters)
            elif analysis_type == 'classification':
                return self._perform_classification(df, parameters)
            elif analysis_type == 'clustering':
                return self._perform_clustering(df, parameters)
            elif analysis_type == 'correlation':
                return self._perform_correlation(df, parameters)
            elif analysis_type == 'change_detection':
                return self._perform_change_detection(df, parameters)
            else:
                raise ValueError(f"Unsupported analysis type: {analysis_type}")
                
        except Exception as e:
            logger.error(f"Error in analysis {analysis_type}: {e}")
            return {
                'success': False,
                'error': str(e),
                'analysis_type': analysis_type
            }
    
    def apply_transformations(self, data_path: str, transformations: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Apply a series of transformations to data"""
        if self.is_mock:
            return self._mock_transformations(transformations)
        
        try:
            df = self._load_data(data_path)
            
            for transformation in transformations:
                df = self._apply_single_transformation(df, transformation)
            
            # Save transformed data
            output_path = f"/tmp/transformed_{os.path.basename(data_path)}"
            df.write.mode('overwrite').parquet(output_path)
            
            return {
                'success': True,
                'output_path': output_path,
                'record_count': df.count(),
                'transformations_applied': len(transformations)
            }
            
        except Exception as e:
            logger.error(f"Error applying transformations: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def test_connection(self) -> Dict[str, Any]:
        """Verify Spark connectivity and basic operation"""
        if self.is_mock:
            return {
                'success': False,
                'error': 'Spark not available (mock mode)',
                'mock': True
            }

        try:
            # Simple job to confirm the session is responsive
            count = self.spark.range(1).count()
            return {
                'success': True,
                'message': 'Spark connection successful',
                'count': int(count),
                'version': self.spark.version,
                'appId': self.spark.sparkContext.applicationId,
                'master': self.spark.sparkContext.master
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    def cluster_status(self) -> Dict[str, Any]:
        """Return Spark cluster status and lightweight metrics"""
        if self.is_mock:
            return {
                'success': True,
                'status': 'mock',
                'available': False,
                'details': 'Spark bridge running in mock mode'
            }

        try:
            sc = self.spark.sparkContext
            tracker = sc.statusTracker()
            return {
                'success': True,
                'status': 'running',
                'available': True,
                'version': self.spark.version,
                'appId': sc.applicationId,
                'appName': sc.appName,
                'master': sc.master,
                'activeJobs': len(tracker.getActiveJobIds()),
                'activeStages': len(tracker.getActiveStageIds()),
                'completedStages': len(tracker.getCompletedStageIds()),
                'executorMemory': self.config.get('executorMemory'),
                'driverMemory': self.config.get('driverMemory')
            }
        except Exception as e:
            return {
                'success': False,
                'status': 'error',
                'available': False,
                'error': str(e)
            }

    def _load_data(self, data_path: str, format: str = 'csv') -> DataFrame:
        """Load data from various sources"""
        if format.lower() == 'csv':
            return self.spark.read.option("header", "true").option("inferSchema", "true").csv(data_path)
        elif format.lower() == 'json':
            return self.spark.read.json(data_path)
        elif format.lower() == 'parquet':
            return self.spark.read.parquet(data_path)
        else:
            raise ValueError(f"Unsupported format: {format}")
    
    def _perform_regression(self, df: DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
        """Perform regression analysis"""
        feature_cols = params.get('features', [])
        target_col = params.get('target')
        
        # Prepare features
        assembler = VectorAssembler(inputCols=feature_cols, outputCol="features")
        df_features = assembler.transform(df)
        
        # Split data
        train_data, test_data = df_features.randomSplit([0.8, 0.2], seed=42)
        
        # Train model
        lr = LinearRegression(featuresCol="features", labelCol=target_col)
        model = lr.fit(train_data)
        
        # Make predictions
        predictions = model.transform(test_data)
        
        # Evaluate
        evaluator = RegressionEvaluator(labelCol=target_col, predictionCol="prediction", metricName="rmse")
        rmse = evaluator.evaluate(predictions)
        
        return {
            'success': True,
            'model_type': 'linear_regression',
            'rmse': rmse,
            'coefficients': model.coefficients.toArray().tolist(),
            'intercept': model.intercept,
            'r2': model.summary.r2
        }
    
    def _perform_classification(self, df: DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
        """Perform classification analysis"""
        feature_cols = params.get('features', [])
        target_col = params.get('target')
        
        # Prepare features
        assembler = VectorAssembler(inputCols=feature_cols, outputCol="features")
        df_features = assembler.transform(df)
        
        # Split data
        train_data, test_data = df_features.randomSplit([0.8, 0.2], seed=42)
        
        # Train model
        rf = RandomForestClassifier(featuresCol="features", labelCol=target_col)
        model = rf.fit(train_data)
        
        # Make predictions
        predictions = model.transform(test_data)
        
        # Evaluate
        evaluator = BinaryClassificationEvaluator(labelCol=target_col)
        auc = evaluator.evaluate(predictions)
        
        return {
            'success': True,
            'model_type': 'random_forest_classifier',
            'auc': auc,
            'feature_importances': model.featureImportances.toArray().tolist()
        }
    
    def _perform_clustering(self, df: DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
        """Perform clustering analysis"""
        feature_cols = params.get('features', [])
        k = params.get('k', 3)
        
        # Prepare features
        assembler = VectorAssembler(inputCols=feature_cols, outputCol="features")
        df_features = assembler.transform(df)
        
        # Train model
        kmeans = KMeans(k=k, featuresCol="features")
        model = kmeans.fit(df_features)
        
        # Make predictions
        predictions = model.transform(df_features)
        
        return {
            'success': True,
            'model_type': 'kmeans',
            'k': k,
            'centers': [center.toArray().tolist() for center in model.clusterCenters()],
            'cost': model.computeCost(df_features)
        }
    
    def _perform_correlation(self, df: DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
        """Perform correlation analysis"""
        feature_cols = params.get('features', [])
        
        # Prepare features
        assembler = VectorAssembler(inputCols=feature_cols, outputCol="features")
        df_features = assembler.transform(df)
        
        # Calculate correlation matrix
        correlation_matrix = Correlation.corr(df_features, "features").head()
        
        return {
            'success': True,
            'correlation_matrix': correlation_matrix[0].toArray().tolist(),
            'features': feature_cols
        }
    
    def _perform_change_detection(self, df: DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
        """Perform change detection analysis"""
        # This is a simplified implementation
        # In production, this would include more sophisticated change detection algorithms
        
        baseline_data = params.get('baseline_data', [])
        threshold = params.get('threshold', 0.1)
        
        current_stats = df.describe().collect()
        
        # Compare with baseline (simplified)
        changes_detected = len(baseline_data) > 0  # Simplified logic
        
        return {
            'success': True,
            'changes_detected': changes_detected,
            'significance': 0.5 if changes_detected else 0.0,
            'threshold': threshold,
            'current_stats': [row.asDict() for row in current_stats]
        }
    
    def _apply_single_transformation(self, df: DataFrame, transformation: Dict[str, Any]) -> DataFrame:
        """Apply a single transformation to DataFrame"""
        transform_type = transformation.get('type')
        
        if transform_type == 'filter':
            condition = transformation.get('condition')
            return df.filter(condition)
        
        elif transform_type == 'select':
            columns = transformation.get('columns', [])
            return df.select(*columns)
        
        elif transform_type == 'rename':
            old_name = transformation.get('old_name')
            new_name = transformation.get('new_name')
            return df.withColumnRenamed(old_name, new_name)
        
        elif transform_type == 'add_column':
            column_name = transformation.get('column_name')
            expression = transformation.get('expression')
            return df.withColumn(column_name, expr(expression))
        
        else:
            logger.warning(f"Unsupported transformation type: {transform_type}")
            return df
    
    # Mock methods for development
    def _mock_process_file(self, file_path: str, file_type: str) -> Dict[str, Any]:
        return {
            'success': True,
            'data': [{'col1': 'sample', 'col2': 123}, {'col1': 'data', 'col2': 456}],
            'schema': {
                'columns': [{'name': 'col1', 'type': 'string'}, {'name': 'col2', 'type': 'integer'}],
                'nullable_columns': []
            },
            'recordCount': 2,
            'statistics': {'mean': {'col2': 289.5}},
            'file_type': file_type,
            'mock': True
        }
    
    def _mock_analysis(self, analysis_type: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        return {
            'success': True,
            'analysis_type': analysis_type,
            'result': f'Mock {analysis_type} analysis result',
            'parameters': parameters,
            'mock': True
        }
    
    def _mock_transformations(self, transformations: List[Dict[str, Any]]) -> Dict[str, Any]:
        return {
            'success': True,
            'output_path': '/tmp/mock_transformed_data.parquet',
            'record_count': 100,
            'transformations_applied': len(transformations),
            'mock': True
        }
    
    def stop(self):
        """Stop Spark session"""
        if self.spark and not self.is_mock:
            self.spark.stop()

def main():
    """Main entry point for command-line usage"""
    if len(sys.argv) < 3:
        print("Usage: python spark_bridge.py <operation> <config_json> [args_json]")
        sys.exit(1)
    
    operation = sys.argv[1]
    config = json.loads(sys.argv[2])
    args = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
    
    bridge = SparkBridge(config)
    
    try:
        if operation == 'process_file':
            result = bridge.process_file(args['file_path'], args['file_type'], args.get('options', {}))
        elif operation == 'perform_analysis':
            result = bridge.perform_analysis(args['data_path'], args['analysis_type'], args['parameters'])
        elif operation == 'apply_transformations':
            result = bridge.apply_transformations(args['data_path'], args['transformations'])
        elif operation == 'test_connection':
            result = bridge.test_connection()
        elif operation == 'cluster_status':
            result = bridge.cluster_status()
        else:
            result = {'success': False, 'error': f'Unknown operation: {operation}'}
        
        print(json.dumps(result))
        
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
    
    finally:
        bridge.stop()

if __name__ == "__main__":
    main()