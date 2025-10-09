// server/config/spark-config.ts

export interface SparkConfig {
  master: string;
  appName: string;
  sparkHome?: string;
  executorMemory: string;
  driverMemory: string;
  maxCores?: number;
  pythonPath?: string;
  javaOptions: Record<string, string>;
  enableHiveSupport: boolean;
  warehouse: string;
  checkpointDir?: string;
  eventLogEnabled: boolean;
  eventLogDir?: string;
  serializer: string;
  sql: {
    adaptive: {
      enabled: boolean;
      coalescePartitions: {
        enabled: boolean;
        minPartitionNum: number;
      };
    };
    adaptive_query_execution: {
      enabled: boolean;
    };
  };
}

export const getSparkConfig = (): SparkConfig => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    master: process.env.SPARK_MASTER_URL || (isDevelopment ? 'local[*]' : 'spark://cluster:7077'),
    appName: process.env.SPARK_APP_NAME || 'ChimariData-Analytics',
    sparkHome: process.env.SPARK_HOME,
    executorMemory: process.env.SPARK_EXECUTOR_MEMORY || '2g',
    driverMemory: process.env.SPARK_DRIVER_MEMORY || '1g',
    maxCores: process.env.SPARK_MAX_CORES ? parseInt(process.env.SPARK_MAX_CORES) : undefined,
    pythonPath: process.env.SPARK_PYTHON_PATH || process.env.PYTHON_PATH,
    javaOptions: {
      'spark.driver.extraJavaOptions': process.env.SPARK_DRIVER_JAVA_OPTS || '-XX:+UseG1GC',
      'spark.executor.extraJavaOptions': process.env.SPARK_EXECUTOR_JAVA_OPTS || '-XX:+UseG1GC',
      'spark.sql.adaptive.enabled': 'true',
      'spark.sql.adaptive.coalescePartitions.enabled': 'true',
      'spark.sql.adaptive.coalescePartitions.minPartitionNum': '1',
      'spark.sql.adaptive.skewJoin.enabled': 'true',
      'spark.dynamicAllocation.enabled': isProduction ? 'true' : 'false',
      'spark.serializer': 'org.apache.spark.serializer.KryoSerializer',
      ...parseJavaOptions(process.env.SPARK_JAVA_OPTS)
    },
    enableHiveSupport: process.env.SPARK_ENABLE_HIVE === 'true',
    warehouse: process.env.SPARK_WAREHOUSE_DIR || './warehouse',
    checkpointDir: process.env.SPARK_CHECKPOINT_DIR,
    eventLogEnabled: process.env.SPARK_EVENT_LOG_ENABLED === 'true' || isProduction,
    eventLogDir: process.env.SPARK_EVENT_LOG_DIR || './spark-events',
    serializer: 'org.apache.spark.serializer.KryoSerializer',
    sql: {
      adaptive: {
        enabled: true,
        coalescePartitions: {
          enabled: true,
          minPartitionNum: 1
        }
      },
      adaptive_query_execution: {
        enabled: true
      }
    }
  };
};

function parseJavaOptions(opts?: string): Record<string, string> {
  if (!opts) return {};
  
  const options: Record<string, string> = {};
  const pairs = opts.split(' ').filter(opt => opt.includes('='));
  
  for (const pair of pairs) {
    const [key, ...values] = pair.split('=');
    if (key && values.length > 0) {
      options[key] = values.join('=');
    }
  }
  
  return options;
}

export const validateSparkConfig = (config: SparkConfig): string[] => {
  const errors: string[] = [];
  
  if (!config.master) {
    errors.push('Spark master URL is required');
  }
  
  if (!config.appName) {
    errors.push('Spark application name is required');
  }
  
  // Validate memory settings
  const memoryPattern = /^\d+[gmk]$/i;
  if (!memoryPattern.test(config.executorMemory)) {
    errors.push('Invalid executor memory format. Use format like "2g", "1024m", etc.');
  }
  
  if (!memoryPattern.test(config.driverMemory)) {
    errors.push('Invalid driver memory format. Use format like "1g", "512m", etc.');
  }
  
  return errors;
};

// Environment variable validation
export const validateSparkEnvironment = (): { valid: boolean; errors: string[]; warnings: string[] } => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check if running in production without proper configuration
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.SPARK_MASTER_URL) {
      errors.push('SPARK_MASTER_URL is required in production');
    }
    
    if (!process.env.SPARK_HOME && !process.env.JAVA_HOME) {
      warnings.push('SPARK_HOME or JAVA_HOME should be set in production');
    }
  }
  
  // Development warnings
  if (process.env.NODE_ENV === 'development') {
    if (!process.env.JAVA_HOME) {
      warnings.push('JAVA_HOME not set - Spark will use system default Java');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
};