# Environment Configuration Guide

## Production-Like Development Setup

To have a full view of what production should look like, enable Spark, Redis, and Python in development.

## Required Environment Variables

### Core Services (Required)

```env
# Database (REQUIRED)
DATABASE_URL="postgresql://username:password@localhost:5432/chimaridata_dev"
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20
DATABASE_TIMEOUT=10000
```

### Redis Configuration (Enable for Production-Like Dev)

```env
# Redis - Set to true for production-like development
# Optional in development, REQUIRED in production
REDIS_ENABLED=true
REDIS_URL="redis://localhost:6379"
```

**Purpose**: Real-time agent coordination, distributed caching, WebSocket session management

**Setup**:
- Windows: Install Redis via Chocolatey: `choco install redis-64 -y`
- Or download from: https://github.com/tporadowski/redis/releases
- Start Redis: `redis-server` or run as Windows service

**Verification**:
```bash
redis-cli ping  # Should return "PONG"
```

### Python Configuration (Enable for Production-Like Dev)

```env
# Python - Path to Python executable (REQUIRED for data analysis)
# Windows: C:\Users\YourUsername\AppData\Local\Programs\Python\Python311\python.exe
# Linux/Mac: python3 or /usr/bin/python3
PYTHON_PATH=python3
PYTHON_BRIDGE_ENABLED=true
PYSPARK_PYTHON=python3
PYSPARK_DRIVER_PYTHON=python3
PYTHON_SCRIPT_TIMEOUT=300000
```

**Purpose**: Real statistical analysis, ML model training, data visualization

**Required Libraries**:
```bash
pip install pandas numpy scipy statsmodels scikit-learn matplotlib plotly seaborn polars tensorflow
```

**Verification**:
```bash
python -c "import pandas, numpy, scipy, statsmodels, sklearn; print('All libraries available')"
```

### Spark Configuration (Enable for Production-Like Dev)

```env
# Spark - Set to true for production-like development
# Optional in development, recommended for large dataset testing
SPARK_ENABLED=true
SPARK_MASTER_URL="local[*]"
SPARK_HOME=C:\spark\spark
SPARK_APP_NAME="ChimariData-Analytics"
```

**Purpose**: Large dataset processing, distributed computing, Spark MLlib

**Setup**:
- Download Apache Spark from: https://spark.apache.org/downloads.html
- Extract to `C:\spark\spark` (Windows) or `/opt/spark` (Linux/Mac)
- Set `SPARK_HOME` environment variable
- Install PySpark: `pip install pyspark`

**Verification**:
```bash
spark-shell --version
# Or
python -c "from pyspark.sql import SparkSession; spark = SparkSession.builder.appName('test').getOrCreate(); print('Spark version:', spark.version); spark.stop()"
```

## Complete .env Configuration Example

```env
# ============================================
# ENVIRONMENT
# ============================================
NODE_ENV=development

# ============================================
# SERVER CONFIGURATION
# ============================================
PORT=5000
HOST=localhost

# ============================================
# DATABASE (REQUIRED)
# ============================================
DATABASE_URL="postgresql://username:password@localhost:5432/chimaridata_dev"
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20
DATABASE_TIMEOUT=10000

# ============================================
# REDIS CONFIGURATION (ENABLE FOR PRODUCTION-LIKE DEV)
# ============================================
REDIS_ENABLED=true
REDIS_URL="redis://localhost:6379"

# ============================================
# PYTHON CONFIGURATION (ENABLE FOR PRODUCTION-LIKE DEV)
# ============================================
PYTHON_PATH=python3
PYTHON_BRIDGE_ENABLED=true
PYSPARK_PYTHON=python3
PYSPARK_DRIVER_PYTHON=python3
PYTHON_SCRIPT_TIMEOUT=300000

# ============================================
# SPARK CONFIGURATION (ENABLE FOR PRODUCTION-LIKE DEV)
# ============================================
SPARK_ENABLED=true
SPARK_MASTER_URL="local[*]"
SPARK_HOME=C:\spark\spark
SPARK_APP_NAME="ChimariData-Analytics"

# ============================================
# AI PROVIDER KEYS (REQUIRED)
# ============================================
GOOGLE_AI_API_KEY="your_google_ai_api_key_here"
OPENAI_API_KEY="your_openai_api_key_here"
ANTHROPIC_API_KEY="your_anthropic_api_key_here"

# ============================================
# SECURITY SETTINGS
# ============================================
SESSION_SECRET="your_session_secret_change_in_production"
JWT_SECRET="your_jwt_secret_change_in_production"
CORS_ORIGIN="http://localhost:5173"

# ============================================
# FEATURE FLAGS
# ============================================
ENABLE_MOCK_MODE=false
ENABLE_DEBUG_LOGGING=true
ENABLE_RATE_LIMITING=false
ENABLE_WEBHOOK_SIGNATURE_VERIFICATION=false

# ============================================
# FILE UPLOAD
# ============================================
MAX_FILE_SIZE_MB=100
UPLOAD_DIR="./uploads"

# ============================================
# SERVICE TIMEOUTS
# ============================================
API_TIMEOUT=30000
```

## Service Health Check

After configuring your `.env` file, the health check endpoint will verify all services:

```bash
curl http://localhost:5000/api/health
```

**Expected Response** (when all services enabled):
```json
{
  "status": "healthy",
  "environment": "development",
  "services": {
    "database": { "healthy": true, "details": { "connected": true } },
    "redis": { "healthy": true, "details": { "enabled": true, "available": true } },
    "python": { "healthy": true, "details": { "pythonPath": "python3", "enabled": true } },
    "spark": { "healthy": true, "details": { "enabled": true, "available": true } },
    "memory": { ... },
    "uptime": 123.45
  }
}
```

## Service Status

- **Database**: Always critical (must be healthy)
- **Python**: Critical (required for data analysis)
- **Redis**: Critical if enabled (required for agent coordination)
- **Spark**: Optional if enabled (required for large dataset processing)

## Troubleshooting

### Redis Not Starting
```bash
# Windows: Check if Redis service is running
sc query Redis

# Start Redis service
redis-server --service-start
```

### Python Not Found
```bash
# Check Python installation
python --version

# Verify Python path in .env matches actual location
where python  # Windows
which python3  # Linux/Mac
```

### Spark Not Initializing
```bash
# Check SPARK_HOME environment variable
echo $SPARK_HOME  # Linux/Mac
echo %SPARK_HOME%  # Windows

# Verify Spark installation
$SPARK_HOME/bin/spark-shell --version
```

## Production Checklist

Before deploying to production, ensure:

- ✅ `REDIS_ENABLED=true` and Redis is running
- ✅ `SPARK_ENABLED=true` and Spark is configured
- ✅ `PYTHON_PATH` points to correct Python executable
- ✅ All Python libraries are installed (`pip install -r python/requirements.txt`)
- ✅ `ENABLE_MOCK_MODE=false` (no mock data)
- ✅ Health check endpoint returns all services healthy
