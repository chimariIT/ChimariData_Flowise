# Installation Guide for Spark, Redis, and Python

**Status**: Ready to install  
**Current State**: Python ✅ installed | Java ❌ | Spark ❌ | Redis ❌  
**Date**: October 16, 2025

---

## 🎯 Quick Summary

You have a **fully automated installation script** ready to go! It will install:
- ✅ OpenJDK 17 (for Spark)
- ✅ Apache Spark 3.5.3
- ✅ Redis 7.x
- ✅ Python packages

**Time**: 10-20 minutes  
**Disk Space**: ~1.5GB

---

## 📋 Installation Steps

### Step 1: Open PowerShell as Administrator

1. Press `Windows key`
2. Type "PowerShell"
3. **Right-click** on "Windows PowerShell"
4. Select **"Run as Administrator"**
5. Click "Yes" on the UAC prompt

### Step 2: Navigate to Project Directory

```powershell
cd C:\Users\scmak\Documents\Work\Projects\Chimari\chimariapp2\ChimariData_Flowise-chimaridataApp2
```

### Step 3: Run the Installation Script

Since Python is already installed, skip it:

```powershell
.\install-services.ps1 -SkipPython
```

**Or** install everything (will update Python to latest 3.11 if needed):

```powershell
.\install-services.ps1
```

---

## 🔍 What Will Be Installed

### 1. OpenJDK 17 (Required for Spark)
- **Installation**: Via Chocolatey
- **Location**: `C:\Program Files\OpenJDK\`
- **Time**: ~2 minutes
- **Size**: ~300MB

### 2. Apache Spark 3.5.3
- **Installation**: Downloaded and extracted
- **Location**: `C:\spark\spark`
- **Time**: ~5-10 minutes (depends on internet speed)
- **Size**: ~400MB download, ~800MB installed
- **Includes**:
  - Spark binaries
  - Hadoop 3 integration
  - Winutils.exe for Windows compatibility
- **Environment Variables Set**:
  - `SPARK_HOME=C:\spark\spark`
  - `HADOOP_HOME=C:\hadoop`
  - Added to PATH

### 3. Redis 7.x
- **Installation**: Via Chocolatey
- **Service**: Installed and auto-started
- **Port**: 6379 (default)
- **Time**: ~2 minutes
- **Size**: ~50MB

### 4. Python Packages
Installs from `python/requirements.txt`:
- pandas, numpy, scipy
- scikit-learn
- matplotlib, seaborn, plotly
- reportlab, PyPDF2
- **Time**: ~3 minutes

---

## ⚙️ After Installation

### 1. Restart PowerShell

After installation completes, close and reopen PowerShell to load new PATH variables.

### 2. Verify Installation

```powershell
# Check Java
java -version
# Should show: openjdk version "17.x"

# Check Spark
spark-submit --version
# Should show: Spark version 3.5.3

# Check Redis
redis-cli ping
# Should respond: PONG

# Check Python packages
pip list | Select-String "pandas|numpy|scipy"
```

### 3. Update .env File

Add these to your `.env` file:

```env
# Enable Redis
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379

# Spark configuration (auto-detected, but can be explicit)
SPARK_HOME=C:\spark\spark
HADOOP_HOME=C:\hadoop

# Python environment
PYTHON_BRIDGE_ENABLED=true
```

### 4. Restart Development Server

```powershell
# Stop any running dev server (Ctrl+C)

# Start with all services enabled
npm run dev
```

You should now see:
- ✅ No "Development Mode" warnings
- ✅ Redis connected
- ✅ Spark available for big data processing
- ✅ Python bridge ready

---

## 🐛 Troubleshooting

### If Chocolatey Fails to Install

**Manually install Chocolatey:**
```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

Then re-run: `.\install-services.ps1 -SkipPython -SkipChocolatey`

### If Java Installation Fails

**Manually install Java:**
```powershell
choco install openjdk17 -y
refreshenv
```

### If Spark Download is Slow

The script downloads ~400MB. If it's taking too long:
1. Let it run in the background
2. Or manually download from: https://archive.apache.org/dist/spark/spark-3.5.3/
3. Extract to `C:\spark\spark`

### If Redis Fails to Start

**Check Redis service:**
```powershell
# Check if running
Get-Service Redis* | Format-Table Status, Name, DisplayName

# Start manually
Start-Service Redis

# Or reinstall
choco uninstall redis -y
choco install redis -y
```

---

## 📊 Installation Output Example

```powershell
==================================================================
  ChimariData Production Services Installer
==================================================================

✅ Running with Administrator privileges
✅ Chocolatey already installed
⏭️  Skipping Python (already installed)

📦 Installing OpenJDK 17...
✅ OpenJDK 17 installed successfully

📥 Downloading Apache Spark 3.5.3...
   This may take several minutes (~400MB)...
✅ Spark downloaded successfully
📦 Extracting Spark...
✅ Spark extracted to C:\spark\spark
🔧 Configuring Spark environment...
✅ Spark environment configured

📥 Downloading winutils.exe for Hadoop...
✅ Winutils installed to C:\hadoop\bin\winutils.exe

📦 Installing Redis...
✅ Redis installed and started

📦 Installing Python packages...
✅ Python packages installed

==================================================================
✅ Installation Complete!
==================================================================

Installed Components:
  ✅ OpenJDK 17
  ✅ Apache Spark 3.5.3 (C:\spark\spark)
  ✅ Redis 7.x (Port 6379)
  ✅ Python packages

Next Steps:
  1. Restart PowerShell to load new PATH
  2. Update .env file with service configurations
  3. Run: npm run dev
```

---

## 🔗 Related Documentation

- `DOCKER-SETUP.md` - Redis configuration details
- `INSTALL_PRODUCTION_SERVICES.md` - Full manual installation guide
- `SPARK_INSTALLATION_UPDATE.md` - Spark automation details
- `ENVIRONMENT-CONFIG.md` - Environment variable setup

---

## 📝 Notes

### Why These Services?

1. **Java/OpenJDK 17**: Required runtime for Apache Spark
2. **Apache Spark**: Handles big data processing (>100MB datasets), distributed computing
3. **Redis**: Enables:
   - Real-time agent coordination
   - WebSocket communication
   - Session management
   - Caching for improved performance
4. **Python Packages**: ML algorithms, statistical analysis, data visualization

### Development vs Production

- **Development** (current): Redis optional, Spark for large datasets only
- **Production**: All services required for full functionality

### Disk Usage

- OpenJDK: ~300MB
- Spark: ~800MB
- Redis: ~50MB
- Python packages: ~500MB
- **Total**: ~1.65GB

---

**Ready to Install?** Open PowerShell as Administrator and run:
```powershell
cd C:\Users\scmak\Documents\Work\Projects\Chimari\chimariapp2\ChimariData_Flowise-chimaridataApp2
.\install-services.ps1 -SkipPython
```
