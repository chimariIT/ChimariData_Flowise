# Spark Setup Progress

**Date**: October 17, 2025, 10:40 PM
**Status**: Environment variables configured in .env, Java 17 upgrade needed

## ✅ Completed Steps

### 1. Ran install-spark.ps1 Script
**Result**: Script successfully verified:
- ✅ Python 3.11.8 installed
- ✅ PySpark 3.5.0 installed
- ✅ Java found (version 1.8.0_231)
- ✅ Spark directory exists at C:\spark\spark
- ✅ WinUtils exists at C:\hadoop\bin\winutils.exe

### 2. Configured Environment Variables in .env
Added the following to `.env` file:
```env
SPARK_HOME=C:\spark\spark
HADOOP_HOME=C:\hadoop
JAVA_HOME=C:\Program Files\Java\jdk1.8.0_231
```

**Note**: Could not set System-level environment variables due to lack of Administrator privileges. Using .env file instead (application will read these on startup).

---

## ⚠️ Current Issue: Java Version Incompatibility

### Problem
- **Current Java**: JDK 1.8.0_231 (Java 8)
- **Spark 3.5.0 Requirement**: Java 11 or Java 17
- **Impact**: Spark will not start with Java 8

### Evidence
When running `java -version`:
```
Error: opening registry key 'Software\JavaSoft\Java Runtime Environment'
Error: could not find java.dll
Error: Could not find Java SE Runtime Environment.
```

Java is installed but not configured in system PATH.

---

## 📋 Next Steps

### Step 1: Install Java JDK 17 (REQUIRED)

**Option A - Oracle JDK (Recommended)**:
1. Download from: https://www.oracle.com/java/technologies/downloads/#java17
2. Select: **"Windows x64 Installer"** (jdk-17_windows-x64_bin.exe)
3. Run installer (accept default path: `C:\Program Files\Java\jdk-17`)
4. Verify: Open new terminal and run `java -version`

**Option B - OpenJDK (Free Alternative)**:
1. Download from: https://adoptium.net/temurin/releases/
2. Select: **JDK 17 (LTS)** + **Windows** + **x64**
3. Download `.msi` installer
4. Run installer with default settings
5. Verify: Open new terminal and run `java -version`

### Step 2: Update .env with Java 17 Path
After installing Java 17, update the `.env` file:
```env
JAVA_HOME=C:\Program Files\Java\jdk-17
```

### Step 3: Restart Development Server
Kill current server and restart:
```bash
# Kill current server
netstat -ano | findstr :3000
taskkill //F //PID <pid>

# Start fresh server
npm run dev
```

### Step 4: Verify Spark Integration
Check service health after restart:
```bash
curl http://localhost:3000/api/system/health
```

Expected response:
```json
{
  "sparkAvailable": true,
  "pythonAvailable": false,  // May still timeout, but Spark should work
  "redisAvailable": true,
  "databaseAvailable": true,
  "usingMockData": false
}
```

### Step 5: Test Spark Processing
Run E2E tests to verify Spark is working with real data:
```bash
npm run test:user-journeys
```

---

## Current .env Configuration

```env
# Infrastructure Services
PYTHON_BRIDGE_ENABLED=true
PYTHON_PATH=python

# Redis
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379

# Apache Spark
SPARK_ENABLED=true
SPARK_MASTER_URL=local[*]
SPARK_HOME=C:\spark\spark
HADOOP_HOME=C:\hadoop
JAVA_HOME=C:\Program Files\Java\jdk1.8.0_231  # NEEDS UPDATE TO JDK 17
PYSPARK_PYTHON=C:\Users\scmak\AppData\Local\Programs\Python\Python311\python.exe
PYSPARK_DRIVER_PYTHON=C:\Users\scmak\AppData\Local\Programs\Python\Python311\python.exe
```

---

## Verification Checklist

Before running tests, verify:
- [ ] Java 17 installed (`java -version` shows version 17.x.x)
- [ ] JAVA_HOME updated in .env to point to JDK 17
- [ ] Server restarted with new environment variables
- [ ] Service health endpoint shows `sparkAvailable: true`
- [ ] No "Spark running in mock mode" warnings in server logs

---

## Manual Environment Variable Setup (If Needed)

If you need to set System-level environment variables manually:

1. Press `Win + X` → Select "System"
2. Click "Advanced system settings"
3. Click "Environment Variables"
4. Under "System variables", click "New" (or "Edit" if exists)

Add/Update these variables:
```
Variable Name: JAVA_HOME
Variable Value: C:\Program Files\Java\jdk-17

Variable Name: SPARK_HOME
Variable Value: C:\spark\spark

Variable Name: HADOOP_HOME
Variable Value: C:\hadoop
```

Then update PATH by adding:
```
%JAVA_HOME%\bin
%SPARK_HOME%\bin
%HADOOP_HOME%\bin
```

**Restart terminal/IDE** after setting environment variables.

---

## Summary

**What's Working**:
- ✅ PySpark Python package installed (3.5.0)
- ✅ Apache Spark binaries extracted to C:\spark\spark
- ✅ Hadoop WinUtils installed at C:\hadoop\bin\winutils.exe
- ✅ Environment variables configured in .env file
- ✅ Server running with Redis operational

**What's Needed**:
- ⏳ **Upgrade Java from 8 to 17** (Spark 3.5.0 requirement)
- ⏳ Update JAVA_HOME in .env to point to JDK 17
- ⏳ Restart server to load new Java environment
- ⏳ Verify Spark cluster starts in local[*] mode

---

**Next Action**: Install Java JDK 17 from Oracle or Adoptium, then update .env and restart server.

**Updated**: October 17, 2025, 10:40 PM
