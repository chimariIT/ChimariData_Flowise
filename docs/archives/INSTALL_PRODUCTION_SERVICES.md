# Install Production Services for ChimariData

**Date**: October 15, 2025  
**Purpose**: Set up Python, Spark, and Redis for production-like testing  
**Platform**: Windows with PowerShell  
**Updated**: Added automated Spark installation to script

---

## 🚀 Quick Start (Recommended)

**Use the automated installation script for the easiest setup:**

```powershell
# Open PowerShell as Administrator
cd C:\Users\scmak\Documents\Work\Projects\Chimari\chimariapp2\ChimariData_Flowise-chimaridataApp2

# Run the installer
.\install-services.ps1
```

**What the script installs:**
- ✅ Python 3.11
- ✅ OpenJDK 17 (for Spark)
- ✅ Apache Spark 3.5.3 with Hadoop 3
- ✅ Redis
- ✅ Python packages (pandas, numpy, scipy, etc.)
- ✅ Winutils.exe (for Spark on Windows)

**Time**: 10-15 minutes (depending on download speed)  
**Disk Space**: ~1.5GB

---

## Overview

This guide provides both automated and manual installation methods for all required services to eliminate the "Development Mode" banner and enable full production-like analysis capabilities.

### Services to Install

1. **Python 3.11+** - For data analysis and ML processing
2. **Apache Spark 3.5+** - For big data processing  
3. **Redis 7.x** - For agent coordination and caching

---

## Prerequisites

- Windows 10/11
- PowerShell (Administrator access required)
- Internet connection
- ~5GB free disk space (includes temp files during installation)

---

## Automated Installation (Recommended)

### Using install-services.ps1 Script

The PowerShell script automates the entire installation process:

```powershell
# 1. Open PowerShell as Administrator
# Right-click PowerShell → "Run as Administrator"

# 2. Navigate to project directory
cd C:\Users\scmak\Documents\Work\Projects\Chimari\chimariapp2\ChimariData_Flowise-chimaridataApp2

# 3. Run the installation script
.\install-services.ps1

# Optional: Skip specific components
.\install-services.ps1 -SkipPython    # Skip Python installation
.\install-services.ps1 -SkipJava      # Skip Java installation
.\install-services.ps1 -SkipSpark     # Skip Spark installation
.\install-services.ps1 -SkipRedis     # Skip Redis installation
```

**What happens during installation:**
1. Checks for Administrator privileges
2. Installs Chocolatey package manager (if not present)
3. Installs Python 3.11
4. Installs OpenJDK 17 (required by Spark)
5. **Downloads and installs Apache Spark 3.5.3** (~400MB download)
6. **Configures Spark environment variables** (SPARK_HOME, HADOOP_HOME)
7. **Installs winutils.exe** for Hadoop compatibility on Windows
8. Installs and starts Redis service
9. Installs Python packages from requirements.txt
10. Displays installation summary and next steps

**After installation:**
- Restart PowerShell to apply PATH changes
- Update `.env` file with service configurations
- Run `npm run dev` to start with all services enabled

---

## Manual Installation Steps

If you prefer manual installation or need to troubleshoot, follow these detailed steps:

### 1. Install Python 3.11

#### Option A: Using Chocolatey (Recommended)

```powershell
# Install Chocolatey if not already installed
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Python 3.11
choco install python311 -y

# Refresh environment variables
refreshenv
```

#### Option B: Manual Download

1. Download Python 3.11 from https://www.python.org/downloads/
2. Run installer with "Add Python to PATH" checked
3. Restart PowerShell

#### Verify Installation

```powershell
python --version  # Should show Python 3.11.x
pip --version     # Should show pip version
```

#### Install Required Python Packages

```powershell
# Navigate to project directory
cd C:\Users\scmak\Documents\Work\Projects\Chimari\chimariapp2\ChimariData_Flowise-chimaridataApp2

# Install requirements
pip install -r python/requirements.txt

# Or install individually:
pip install pandas numpy scipy scikit-learn matplotlib seaborn plotly reportlab PyPDF2
```

---

### 2. Install Apache Spark

#### Download and Setup

```powershell
# Create Spark directory
mkdir C:\spark -Force
cd C:\spark

# Download Spark 3.5.3 (pre-built for Hadoop 3)
# Manual: https://spark.apache.org/downloads.html
# Or use PowerShell:
$sparkUrl = "https://archive.apache.org/dist/spark/spark-3.5.3/spark-3.5.3-bin-hadoop3.tgz"
Invoke-WebRequest -Uri $sparkUrl -OutFile "spark-3.5.3-bin-hadoop3.tgz"

# Extract (requires 7-Zip or tar)
tar -xzf spark-3.5.3-bin-hadoop3.tgz
mv spark-3.5.3-bin-hadoop3 spark
```

#### Install Java (Required for Spark)

```powershell
# Using Chocolatey
choco install openjdk17 -y
refreshenv

# Verify
java -version  # Should show OpenJDK 17.x
```

#### Set Environment Variables

```powershell
# Set SPARK_HOME
[System.Environment]::SetEnvironmentVariable('SPARK_HOME', 'C:\spark\spark', 'User')

# Add to PATH
$currentPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
$newPath = "$currentPath;C:\spark\spark\bin"
[System.Environment]::SetEnvironmentVariable('Path', $newPath, 'User')

# Set JAVA_HOME
$javaHome = (Get-Command java).Source | Split-Path | Split-Path
[System.Environment]::SetEnvironmentVariable('JAVA_HOME', $javaHome, 'User')

# Restart PowerShell to apply changes
```

#### Configure Spark for Windows

```powershell
# Download winutils.exe for Hadoop on Windows
mkdir C:\hadoop\bin -Force
$winutilsUrl = "https://github.com/steveloughran/winutils/raw/master/hadoop-3.0.0/bin/winutils.exe"
Invoke-WebRequest -Uri $winutilsUrl -OutFile "C:\hadoop\bin\winutils.exe"

# Set HADOOP_HOME
[System.Environment]::SetEnvironmentVariable('HADOOP_HOME', 'C:\hadoop', 'User')
```

#### Test Spark

```powershell
# Test Spark shell (should start without errors)
spark-shell --version

# Or test with PySpark
python -c "from pyspark.sql import SparkSession; spark = SparkSession.builder.appName('test').getOrCreate(); print('Spark version:', spark.version); spark.stop()"
```

---

### 3. Install Redis

#### Option A: Using Chocolatey

```powershell
choco install redis-64 -y
```

#### Option B: Manual Installation

1. Download Redis for Windows from https://github.com/tporadowski/redis/releases
2. Extract to `C:\Redis`
3. Run `redis-server.exe`

#### Configure Redis as Windows Service

```powershell
# Navigate to Redis directory
cd C:\Redis

# Install as service
redis-server --service-install redis.windows.conf --loglevel verbose

# Start service
redis-server --service-start

# Verify service is running
redis-cli ping  # Should return "PONG"
```

#### Test Redis

```powershell
# Test Redis connection
redis-cli
# In Redis CLI:
SET test "Hello Redis"
GET test
EXIT
```

---

## Configuration

### Update .env File

After installing all services, update your `.env` file:

```env
# Python Configuration
PYTHON_PATH=C:\Users\[YOUR_USERNAME]\AppData\Local\Programs\Python\Python311\python.exe
PYTHON_BRIDGE_ENABLED=true

# Spark Configuration
SPARK_MASTER_URL=local[*]
SPARK_HOME=C:\spark\spark
SPARK_ENABLED=true

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_ENABLED=true
```

### Verify Environment Variables

```powershell
# Check all environment variables are set
$env:SPARK_HOME
$env:JAVA_HOME
$env:HADOOP_HOME

# Check PATH includes Python, Java, Spark
$env:PATH -split ';' | Select-String -Pattern 'python|java|spark'
```

---

## Testing

### 1. Test Python Integration

```powershell
# Navigate to project
cd C:\Users\scmak\Documents\Work\Projects\Chimari\chimariapp2\ChimariData_Flowise-chimaridataApp2

# Run Python analyzer test
python python_scripts/data_analyzer.py --test
```

### 2. Test Spark Integration

```powershell
# Test with sample data
python -c "
from pyspark.sql import SparkSession
import pandas as pd

spark = SparkSession.builder.appName('ChimariTest').getOrCreate()
df = spark.createDataFrame(pd.DataFrame({'a': [1, 2, 3]}))
df.show()
spark.stop()
"
```

### 3. Test Redis Integration

```powershell
# Test Redis connection from Node
node -e "
const redis = require('redis');
const client = redis.createClient({ url: 'redis://localhost:6379' });
client.connect().then(() => {
  console.log('✅ Redis connected');
  return client.set('test', 'Hello from Node');
}).then(() => client.get('test'))
.then(value => console.log('✅ Value:', value))
.then(() => client.quit())
.catch(err => console.error('❌ Error:', err));
"
```

### 4. Start Development Server

```powershell
# Kill any existing Node processes
taskkill /F /IM node.exe 2>$null

# Start dev server
npm run dev

# Expected output:
# ✅ Python bridge available
# ✅ Spark cluster available  
# ✅ Redis available
# ✅ All services operational
```

---

## Troubleshooting

### Python Issues

**Problem**: `python: command not found`
- **Solution**: Add Python to PATH manually
  ```powershell
  $pythonPath = "C:\Users\$env:USERNAME\AppData\Local\Programs\Python\Python311"
  $env:PATH += ";$pythonPath;$pythonPath\Scripts"
  ```

**Problem**: `ModuleNotFoundError: No module named 'pandas'`
- **Solution**: Install requirements again
  ```powershell
  pip install --upgrade pip
  pip install -r python/requirements.txt
  ```

### Spark Issues

**Problem**: `JAVA_HOME is not set`
- **Solution**: Set JAVA_HOME environment variable
  ```powershell
  $javaPath = (Get-Command java).Source | Split-Path | Split-Path
  [System.Environment]::SetEnvironmentVariable('JAVA_HOME', $javaPath, 'User')
  ```

**Problem**: `java.io.FileNotFoundException: Could not locate winutils.exe`
- **Solution**: Download winutils.exe (see Spark installation step)

**Problem**: Spark takes too long to start
- **Solution**: Configure Spark for local mode
  ```powershell
  $env:SPARK_MASTER_URL = "local[2]"  # Use 2 cores instead of all
  ```

### Redis Issues

**Problem**: `Redis connection refused`
- **Solution**: Ensure Redis service is running
  ```powershell
  redis-server --service-start
  Get-Service Redis
  ```

**Problem**: Redis crashes on startup
- **Solution**: Check Redis logs
  ```powershell
  Get-Content C:\Redis\Logs\redis_log.txt -Tail 50
  ```

**Problem**: Port 6379 already in use
- **Solution**: Find and kill conflicting process
  ```powershell
  netstat -ano | findstr :6379
  taskkill /PID [PID_NUMBER] /F
  ```

---

## Service Management

### Start All Services

```powershell
# Start Redis
redis-server --service-start

# Verify Python
python --version

# Verify Spark
spark-shell --version

# Start development server
npm run dev
```

### Stop All Services

```powershell
# Stop Redis
redis-server --service-stop

# Stop Node servers
taskkill /F /IM node.exe

# Stop Spark (if running standalone)
$env:SPARK_HOME\sbin\stop-all.sh  # On WSL
```

### Service Status Check

```powershell
# Check Redis
Get-Service Redis
redis-cli ping

# Check Python
python --version
python -c "import pandas, numpy, scipy; print('✅ Python packages OK')"

# Check Spark
$env:SPARK_HOME\bin\spark-submit --version

# Check Node
node --version
npm --version
```

---

## Performance Tips

### 1. Optimize Spark Memory

Edit `C:\spark\spark\conf\spark-defaults.conf`:
```properties
spark.driver.memory=2g
spark.executor.memory=2g
spark.sql.shuffle.partitions=4
```

### 2. Optimize Redis

Edit `C:\Redis\redis.windows.conf`:
```
maxmemory 512mb
maxmemory-policy allkeys-lru
```

### 3. Python Virtual Environment

```powershell
# Create virtual environment for isolation
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r python/requirements.txt
```

---

## Next Steps

After successful installation:

1. ✅ **Restart PowerShell** to apply PATH changes
2. ✅ **Update .env file** with service configurations (see example below)
3. ✅ **Start development server**: `npm run dev`
4. ✅ **Verify** "All Services Operational" message appears
5. ✅ **Test analysis** with real Python/Spark processing

### Example .env Configuration

```env
# Python Configuration
PYTHON_BRIDGE_ENABLED=true
PYTHON_PATH=C:\Users\[YOUR_USERNAME]\AppData\Local\Programs\Python\Python311\python.exe

# Spark Configuration  
SPARK_ENABLED=true
SPARK_MASTER_URL=local[*]
SPARK_HOME=C:\spark\spark

# Redis Configuration
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## Installation Script Summary

The automated `install-services.ps1` script is now available in the project root and includes:

✅ **Fully Automated Setup**:
- Chocolatey package manager installation
- Python 3.11 with all required packages
- OpenJDK 17 for Spark
- **Apache Spark 3.5.3 with Hadoop 3** (automatic download and configuration)
- Redis with service auto-start
- Environment variable configuration (SPARK_HOME, HADOOP_HOME, JAVA_HOME)
- Winutils.exe for Hadoop on Windows compatibility

✅ **Features**:
- Administrator privilege checking
- Existing installation detection (skips if already installed)
- Download progress tracking
- Comprehensive error handling
- Installation verification and testing
- Detailed summary report
- Next steps guidance

✅ **Usage**:
```powershell
# Basic usage (installs everything)
.\install-services.ps1

# Skip specific components if already installed
.\install-services.ps1 -SkipPython
.\install-services.ps1 -SkipJava
.\install-services.ps1 -SkipSpark
.\install-services.ps1 -SkipRedis
```

---

**Total Installation Time**: 10-20 minutes (automated script)  
**Disk Space Required**: ~1.5GB (after cleanup)  
**Complexity**: Low (automated), Medium (manual)  
**Download Size**: ~600MB total

**Support**: If you encounter issues, check the Troubleshooting section above or review the script output for specific error messages.
