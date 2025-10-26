# ChimariData Spark Integration - Production Deployment Guide

## 🎯 Overview

This guide provides everything needed to deploy ChimariData with Apache Spark support. The implementation is designed to minimize code changes between development and production - only cluster configuration changes are required.

## 🏗️ Architecture

### Development Mode (Current)
- **Spark**: Mock implementation for development/testing
- **Resources**: Minimal system requirements
- **Configuration**: `SPARK_MASTER_URL="local[*]"` or mock mode

### Production Mode (Simple Transition)
- **Spark**: Real cluster with distributed processing
- **Resources**: Full Spark cluster with workers
- **Configuration**: `SPARK_MASTER_URL="spark://cluster:7077"`

## 🚀 Quick Production Setup

### Option 1: Docker Compose (Recommended)

1. **Use the provided Spark-enabled Docker Compose**:
   ```bash
   # Copy environment variables
   cp .env.example .env.production
   
   # Edit .env.production with your production values
   # Key changes needed:
   SPARK_MASTER_URL=spark://spark-master:7077
   NODE_ENV=production
   
   # Start the full stack with Spark cluster
   docker-compose -f docker-compose.spark.yml --env-file .env.production up -d
   ```

2. **Verify Spark cluster is running**:
   ```bash
   # Check Spark Master UI
   curl http://localhost:8080
   
   # Check application health with Spark status
   curl http://localhost:3000/api/health/spark
   ```

### Option 2: Existing Spark Cluster

1. **Set environment variables**:
   ```bash
   export SPARK_MASTER_URL="spark://your-spark-master:7077"
   export SPARK_HOME="/opt/spark"
   export JAVA_HOME="/usr/lib/jvm/java-11-openjdk"
   export NODE_ENV="production"
   ```

2. **Install Python dependencies**:
   ```bash
   pip3 install -r python/requirements.txt
   ```

3. **Start the application**:
   ```bash
   npm start
   ```

## 🔧 Configuration Reference

### Environment Variables

#### Required for Production
```bash
# Spark Cluster Configuration
SPARK_MASTER_URL="spark://your-spark-master:7077"
SPARK_APP_NAME="ChimariData-Analytics-Prod"
NODE_ENV="production"

# Resource Allocation
SPARK_EXECUTOR_MEMORY="4g"
SPARK_DRIVER_MEMORY="2g"
SPARK_MAX_CORES="8"
```

#### Optional Optimization
```bash
# Advanced Spark Configuration
SPARK_ENABLE_HIVE="true"
SPARK_EVENT_LOG_ENABLED="true"
SPARK_EVENT_LOG_DIR="/var/log/spark"
SPARK_JAVA_OPTS="-Dspark.sql.adaptive.enabled=true"

# Performance Tuning
SPARK_MAX_SESSIONS="10"
TEMP_DIR="/tmp"
```

### Automatic Fallback Behavior

The system automatically determines when to use real Spark vs. mock:

```typescript
// Automatic detection logic:
// ✅ Uses REAL Spark when:
- NODE_ENV=production AND SPARK_MASTER_URL is set
- FORCE_SPARK_REAL=true
- PySpark dependencies available

// ✅ Uses MOCK Spark when:
- NODE_ENV=development AND no explicit Spark config
- FORCE_SPARK_MOCK=true
- PySpark dependencies missing
- Spark cluster unreachable
```

## 📊 Monitoring & Health Checks

### Health Check Endpoints

```bash
# Overall application health (includes Spark status)
GET /api/health

# Detailed Spark cluster health
GET /api/health/spark

# Kubernetes/Docker readiness probe
GET /api/ready

# Kubernetes/Docker liveness probe
GET /api/live
```

### Example Health Response
```json
{
  "status": "healthy",
  "timestamp": "2025-10-08T21:30:00.000Z",
  "services": {
    "database": { "healthy": true },
    "spark": { 
      "healthy": true,
      "details": {
        "cluster": "spark://spark-master:7077",
        "available": true,
        "sessions": 3,
        "isMock": false
      }
    }
  }
}
```

## 🐳 Docker Deployment

### Production Dockerfile
```dockerfile
# Use the provided Dockerfile.spark for production deployment
FROM openjdk:11-jdk-slim
# ... (includes Spark, Python, Node.js)
```

### Key Features
- **Multi-stage build** for optimized image size
- **Spark 3.5.0** with Hadoop 3 support
- **Python 3** with PySpark and ML libraries
- **Health checks** for container orchestration
- **Proper signal handling** for graceful shutdown

## ☁️ Cloud Deployment Options

### AWS EMR Integration
```bash
# Environment configuration for EMR
SPARK_MASTER_URL="spark://emr-master-public-dns:7077"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
```

### Azure HDInsight Integration
```bash
# Environment configuration for HDInsight
SPARK_MASTER_URL="spark://cluster-name.azurehdinsight.net:7077"
AZURE_STORAGE_ACCOUNT_NAME="your-account"
AZURE_STORAGE_ACCOUNT_KEY="your-key"
```

### Google Cloud Dataproc Integration
```bash
# Environment configuration for Dataproc
SPARK_MASTER_URL="spark://master-instance:7077"
GOOGLE_CLOUD_PROJECT_ID="your-project"
GOOGLE_CLOUD_CREDENTIALS_PATH="/path/to/credentials.json"
```

## 🔒 Security Considerations

### Spark Cluster Security
```bash
# Enable Spark security features
SPARK_RPC_AUTHENTICATION_ENABLED="true"
SPARK_RPC_ENCRYPTION_ENABLED="true"
SPARK_LOCAL_STORAGE_ENCRYPTION_ENABLED="true"
SPARK_SSL_ENABLED="true"
```

### Network Security
- Spark Master: Port 7077 (cluster communication)
- Spark UI: Port 8080 (monitoring - restrict access)
- Application UI: Port 4040 (per-application - restrict access)

## 📈 Performance Optimization

### Spark Configuration Tuning
```bash
# Memory optimization
SPARK_EXECUTOR_MEMORY="4g"
SPARK_DRIVER_MEMORY="2g"
SPARK_EXECUTOR_CORES="2"

# Adaptive query execution
SPARK_JAVA_OPTS="-Dspark.sql.adaptive.enabled=true -Dspark.sql.adaptive.coalescePartitions.enabled=true"

# Dynamic allocation
SPARK_DYNAMIC_ALLOCATION_ENABLED="true"
SPARK_DYNAMIC_ALLOCATION_MIN_EXECUTORS="1"
SPARK_DYNAMIC_ALLOCATION_MAX_EXECUTORS="10"
```

### Resource Planning
| Data Size | Recommended Configuration |
|-----------|--------------------------|
| < 100MB   | Local mode (`local[*]`) |
| 100MB-1GB | 2 workers, 2GB memory each |
| 1GB-10GB  | 4 workers, 4GB memory each |
| 10GB+     | 8+ workers, 8GB+ memory each |

## 🚨 Troubleshooting

### Common Issues

#### 1. Spark Cluster Connection Failed
```bash
# Check cluster status
curl http://spark-master:8080

# Verify network connectivity
telnet spark-master 7077

# Check application logs
docker logs chimaridata-app
```

#### 2. Python Dependencies Missing
```bash
# Install required packages
pip3 install -r python/requirements.txt

# Verify PySpark installation
python3 -c "import pyspark; print(pyspark.__version__)"
```

#### 3. Memory Issues
```bash
# Increase memory allocation
export SPARK_EXECUTOR_MEMORY="8g"
export SPARK_DRIVER_MEMORY="4g"

# Monitor memory usage
curl http://localhost:3000/api/health
```

### Debug Mode
```bash
# Enable detailed Spark logging
export SPARK_LOG_LEVEL="DEBUG"
export PYTHONPATH="/opt/spark/python"

# Force real Spark mode for testing
export FORCE_SPARK_REAL="true"
```

## 📋 Migration Checklist

### Pre-Deployment Checklist
- [ ] Spark cluster is running and accessible
- [ ] Environment variables configured
- [ ] Python dependencies installed
- [ ] Network ports open (7077, 8080, 4040)
- [ ] Health check endpoints responding
- [ ] Backup data and configuration

### Post-Deployment Verification
- [ ] Application starts without errors
- [ ] Spark health check passes: `GET /api/health/spark`
- [ ] File processing works with real data
- [ ] Analysis operations complete successfully
- [ ] Performance monitoring active
- [ ] Log aggregation configured

## 🎯 Next Steps

1. **Start with Docker Compose** for initial testing
2. **Monitor performance** using health check endpoints
3. **Scale cluster** based on actual usage patterns
4. **Optimize configuration** for your specific workload
5. **Set up monitoring** and alerting for production

---

## 📞 Support

- Health checks: `GET /api/health/spark`
- Logs: Check Docker/application logs
- Monitoring: Spark UI at `http://spark-master:8080`
- Configuration: All settings in `.env` file

**The system is designed to gracefully fall back to mock mode if Spark is unavailable, ensuring your application remains operational during maintenance or cluster issues.**