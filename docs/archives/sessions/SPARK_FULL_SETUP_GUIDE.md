# Apache Spark Full Setup Guide for Windows

**Date**: October 17, 2025
**Purpose**: Production-ready Spark installation for distributed data processing

## Prerequisites Checklist

Before starting, verify you have:
- [ ] Windows 10/11 with Administrator access
- [ ] At least 4GB free disk space
- [ ] Internet connection for downloads
- [ ] Python 3.11.8 (already installed ✅)

## Step 1: Install Java JDK

Apache Spark requires Java 11 or 17.

### Option A: Download Oracle JDK (Recommended)
1. Go to: https://www.oracle.com/java/technologies/downloads/#java17
2. Download: **Windows x64 Installer** (jdk-17_windows-x64_bin.exe)
3. Run installer
4. Accept default installation path: `C:\Program Files\Java\jdk-17`

### Option B: Download OpenJDK (Free Alternative)
1. Go to: https://adoptium.net/temurin/releases/
2. Select: **JDK 17 (LTS)** + **Windows** + **x64**
3. Download the `.msi` installer
4. Run installer with default settings

### Verify Java Installation
```powershell
# Open new PowerShell window (to refresh environment)
java -version
# Expected output:
# java version "17.0.x"
# Java(TM) SE Runtime Environment...
```

### Set JAVA_HOME Environment Variable
```powershell
# Open System Environment Variables:
# 1. Press Win+X → System → Advanced system settings
# 2. Click "Environment Variables"
# 3. Under "System variables", click "New"
#    Variable name: JAVA_HOME
#    Variable value: C:\Program Files\Java\jdk-17

# Or use PowerShell (requires Admin):
[System.Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Java\jdk-17", "Machine")

# Add to PATH
# In System Variables, find "Path", click "Edit", add:
# %JAVA_HOME%\bin
```

---

## Step 2: Download Apache Spark

### Download Spark 3.5.0 (Latest Stable)
1. Go to: https://spark.apache.org/downloads.html
2. Select:
   - **Spark release**: 3.5.0 (or latest)
   - **Package type**: Pre-built for Apache Hadoop 3.3 and later
3. Click: "Download Spark"
4. Mirror download will start (spark-3.5.0-bin-hadoop3.tgz)

### Extract Spark
```powershell
# Create Spark directory
New-Item -Path "C:\spark" -ItemType Directory -Force

# Extract using 7-Zip (install if needed: https://www.7-zip.org/)
# Or use Windows built-in tar:
cd C:\Users\<YourUsername>\Downloads
tar -xzf spark-3.5.0-bin-hadoop3.tgz -C C:\spark

# Rename for easier access
Rename-Item C:\spark\spark-3.5.0-bin-hadoop3 C:\spark\spark
```

### Set SPARK_HOME Environment Variable
```powershell
# Option 1: Via System Properties (GUI)
# 1. Win+X → System → Advanced system settings
# 2. Environment Variables → System variables → New
#    Variable name: SPARK_HOME
#    Variable value: C:\spark\spark

# Option 2: PowerShell (Admin)
[System.Environment]::SetEnvironmentVariable("SPARK_HOME", "C:\spark\spark", "Machine")

# Add Spark to PATH
# In System Variables, find "Path", click "Edit", add:
# %SPARK_HOME%\bin
```

---

## Step 3: Install Hadoop WinUtils (Windows-specific)

Spark on Windows requires Hadoop's `winutils.exe`.

### Download WinUtils
```powershell
# Create Hadoop bin directory
New-Item -Path "C:\hadoop\bin" -ItemType Directory -Force

# Download winutils.exe from GitHub
# URL: https://github.com/steveloughran/winutils/raw/master/hadoop-3.0.0/bin/winutils.exe
# Save to: C:\hadoop\bin\winutils.exe

# Or use PowerShell to download:
$url = "https://github.com/steveloughran/winutils/raw/master/hadoop-3.0.0/bin/winutils.exe"
$output = "C:\hadoop\bin\winutils.exe"
Invoke-WebRequest -Uri $url -OutFile $output
```

### Set HADOOP_HOME
```powershell
# Set environment variable
[System.Environment]::SetEnvironmentVariable("HADOOP_HOME", "C:\hadoop", "Machine")

# Add to PATH
# In System Variables, find "Path", click "Edit", add:
# %HADOOP_HOME%\bin
```

---

## Step 4: Install PySpark Python Package

```bash
# Install PySpark (matches Spark 3.5.0)
pip3 install pyspark==3.5.0

# Verify installation
python -c "import pyspark; print(pyspark.__version__)"
# Expected: 3.5.0
```

---

## Step 5: Configure Environment Variables Summary

Your `.env` file should have:
```env
# Java
JAVA_HOME=C:\Program Files\Java\jdk-17

# Spark
SPARK_ENABLED=true
SPARK_HOME=C:\spark\spark
SPARK_MASTER_URL=local[*]

# Python paths for Spark
PYSPARK_PYTHON=C:\Users\scmak\AppData\Local\Programs\Python\Python311\python.exe
PYSPARK_DRIVER_PYTHON=C:\Users\scmak\AppData\Local\Programs\Python\Python311\python.exe
PYTHON_PATH=python

# Hadoop (Windows)
HADOOP_HOME=C:\hadoop
```

---

## Step 6: Verify Spark Installation

### Test 1: Spark Shell
```powershell
# Open new PowerShell (to refresh environment)
cd C:\spark\spark

# Test Spark shell
bin\spark-shell
```

Expected output:
```
Welcome to
      ____              __
     / __/__  ___ _____/ /__
    _\ \/ _ \/ _ `/ __/  '_/
   /___/ .__/\_,_/_/ /_/\_\   version 3.5.0
      /_/

Using Scala version 2.12.18
Type :quit to exit
scala>
```

Type `:quit` to exit.

### Test 2: PySpark
```bash
# Test PySpark
python -c "from pyspark.sql import SparkSession; spark = SparkSession.builder.master('local[1]').appName('test').getOrCreate(); print('Spark version:', spark.version); spark.stop()"
```

Expected output:
```
Spark version: 3.5.0
```

### Test 3: Full Integration Test
```bash
# Create test script: test_spark.py
cat > test_spark.py << 'EOF'
from pyspark.sql import SparkSession

# Create Spark session
spark = SparkSession.builder \
    .master("local[*]") \
    .appName("ChimariData Test") \
    .getOrCreate()

# Test data processing
data = [("Alice", 25), ("Bob", 30), ("Charlie", 35)]
df = spark.createDataFrame(data, ["name", "age"])

print("Data processed successfully:")
df.show()

# Test transformation
df_filtered = df.filter(df.age > 28)
print("\nFiltered data (age > 28):")
df_filtered.show()

spark.stop()
print("\nSpark test completed successfully!")
EOF

# Run test
python test_spark.py
```

---

## Step 7: Update Server Configuration

### Verify .env Settings
Your `.env` already has most settings. Just verify:
```env
SPARK_ENABLED=true
SPARK_MASTER_URL=local[*]
SPARK_HOME=C:\spark\spark
PYTHON_PATH=python
PYSPARK_PYTHON=C:\Users\scmak\AppData\Local\Programs\Python\Python311\python.exe
PYSPARK_DRIVER_PYTHON=C:\Users\scmak\AppData\Local\Programs\Python\Python311\python.exe
```

---

## Step 8: Restart Server and Verify

```bash
# Kill current server
# (Find and kill the npm dev process)

# Restart server
npm run dev

# Check logs for:
# ✅ "Spark processor initialized with real Spark cluster: local[*]"
# ✅ No "Spark running in mock mode" warnings
```

### Verify Service Health
```bash
curl http://localhost:3000/api/system/health
```

Expected JSON response:
```json
{
  "sparkAvailable": true,
  "pythonAvailable": true,
  "allServicesOperational": true,
  "usingMockData": false
}
```

---

## Common Issues and Solutions

### Issue 1: "JAVA_HOME is not set"
**Solution**: Restart PowerShell/Terminal after setting environment variables, or reboot system.

### Issue 2: "winutils.exe not found"
**Solution**:
```powershell
# Verify file exists
Test-Path C:\hadoop\bin\winutils.exe

# If missing, re-download:
$url = "https://github.com/steveloughran/winutils/raw/master/hadoop-3.0.0/bin/winutils.exe"
Invoke-WebRequest -Uri $url -OutFile "C:\hadoop\bin\winutils.exe"
```

### Issue 3: "Permission denied" on temp directory
**Solution**:
```powershell
# Create temp directory with permissions
New-Item -Path "C:\tmp\hive" -ItemType Directory -Force
icacls "C:\tmp\hive" /grant Everyone:(OI)(CI)F /T
```

### Issue 4: PySpark version mismatch
**Solution**:
```bash
# Check versions match
python -c "import pyspark; print(pyspark.__version__)"
# Should match: 3.5.0

# If mismatch, reinstall:
pip3 uninstall pyspark
pip3 install pyspark==3.5.0
```

---

## Production Deployment Notes

For production, consider:

1. **Spark Cluster Mode** (instead of local[*])
   - Set `SPARK_MASTER_URL=spark://master-node:7077`
   - Deploy Spark master and worker nodes
   - Configure cluster resources (memory, cores)

2. **Resource Allocation**
   ```env
   SPARK_EXECUTOR_MEMORY=4g
   SPARK_DRIVER_MEMORY=2g
   SPARK_MAX_CORES=8
   ```

3. **Security**
   - Enable Spark authentication
   - Configure SSL/TLS
   - Set up Kerberos if required

4. **Monitoring**
   - Enable Spark UI: http://localhost:4040 (during jobs)
   - Enable event logging
   - Set up metrics export

---

## Quick Reference Commands

```powershell
# Check Java
java -version

# Check Spark
%SPARK_HOME%\bin\spark-shell --version

# Check PySpark
python -c "import pyspark; print(pyspark.__version__)"

# Test Spark locally
spark-shell

# View Spark UI (while job running)
# Open browser: http://localhost:4040

# Check environment variables
echo %JAVA_HOME%
echo %SPARK_HOME%
echo %HADOOP_HOME%
```

---

## Next Steps After Installation

1. ✅ Restart development server
2. ✅ Check `/api/system/health` endpoint
3. ✅ Run E2E tests with full Spark support
4. ✅ Monitor Spark logs for any warnings
5. ✅ Test large dataset processing

---

**Installation Complete!** 🎉

Your system will now have:
- ✅ Java JDK 17
- ✅ Apache Spark 3.5.0
- ✅ PySpark 3.5.0
- ✅ Hadoop WinUtils
- ✅ Full distributed computing capabilities

For issues, check Spark logs at: `C:\spark\spark\logs\`
