# Apache Spark Quick Installation Script for Windows
# Run as Administrator: Set-ExecutionPolicy Bypass -Scope Process; .\install-spark.ps1

Write-Host "=== Apache Spark Installation for ChimariData ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Python
Write-Host "Step 1: Checking Python installation..." -ForegroundColor Yellow
$pythonVersion = python --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ Python found: $pythonVersion" -ForegroundColor Green
} else {
    Write-Host "  ❌ Python not found. Please install Python 3.11+" -ForegroundColor Red
    exit 1
}

# Step 2: Install PySpark
Write-Host ""
Write-Host "Step 2: Installing PySpark..." -ForegroundColor Yellow
pip3 install pyspark==3.5.0
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ PySpark installed successfully" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  PySpark installation had issues" -ForegroundColor Yellow
}

# Step 3: Check Java
Write-Host ""
Write-Host "Step 3: Checking Java installation..." -ForegroundColor Yellow
try {
    $javaVersion = java -version 2>&1 | Select-Object -First 1
    Write-Host "  ✅ Java found: $javaVersion" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Java not found. Please install:" -ForegroundColor Red
    Write-Host "     Download from: https://www.oracle.com/java/technologies/downloads/#java17" -ForegroundColor Yellow
    Write-Host "     Or: https://adoptium.net/temurin/releases/" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  After installing Java, run this script again." -ForegroundColor Yellow
    exit 1
}

# Step 4: Check Spark
Write-Host ""
Write-Host "Step 4: Checking Apache Spark..." -ForegroundColor Yellow
if (Test-Path "C:\spark\spark") {
    Write-Host "  ✅ Spark directory found: C:\spark\spark" -ForegroundColor Green
} else {
    Write-Host "  ❌ Spark not found at C:\spark\spark" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Please download and extract Spark:" -ForegroundColor Yellow
    Write-Host "  1. Go to: https://spark.apache.org/downloads.html" -ForegroundColor Yellow
    Write-Host "  2. Download: Spark 3.5.0, Pre-built for Hadoop 3.3" -ForegroundColor Yellow
    Write-Host "  3. Extract to: C:\spark\spark" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Quick extract (after download):" -ForegroundColor Yellow
    Write-Host '    New-Item -Path "C:\spark" -ItemType Directory -Force' -ForegroundColor Cyan
    Write-Host '    tar -xzf spark-3.5.0-bin-hadoop3.tgz -C C:\spark' -ForegroundColor Cyan
    Write-Host '    Rename-Item C:\spark\spark-3.5.0-bin-hadoop3 C:\spark\spark' -ForegroundColor Cyan
    exit 1
}

# Step 5: Check Hadoop WinUtils
Write-Host ""
Write-Host "Step 5: Checking Hadoop WinUtils..." -ForegroundColor Yellow
if (Test-Path "C:\hadoop\bin\winutils.exe") {
    Write-Host "  ✅ WinUtils found: C:\hadoop\bin\winutils.exe" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  WinUtils not found. Downloading..." -ForegroundColor Yellow
    try {
        New-Item -Path "C:\hadoop\bin" -ItemType Directory -Force | Out-Null
        $url = "https://github.com/steveloughran/winutils/raw/master/hadoop-3.0.0/bin/winutils.exe"
        $output = "C:\hadoop\bin\winutils.exe"
        Invoke-WebRequest -Uri $url -OutFile $output
        Write-Host "  ✅ WinUtils downloaded successfully" -ForegroundColor Green
    } catch {
        Write-Host "  ❌ Failed to download WinUtils: $_" -ForegroundColor Red
        Write-Host "     Manual download: $url" -ForegroundColor Yellow
    }
}

# Step 6: Check/Set Environment Variables
Write-Host ""
Write-Host "Step 6: Configuring environment variables..." -ForegroundColor Yellow

$javaHome = [System.Environment]::GetEnvironmentVariable("JAVA_HOME", "Machine")
if (-not $javaHome) {
    Write-Host "  ⚠️  JAVA_HOME not set" -ForegroundColor Yellow
    Write-Host "     Please set manually or run as Administrator to set automatically" -ForegroundColor Yellow
    $javaPath = "C:\Program Files\Java\jdk-17"
    if (Test-Path $javaPath) {
        Write-Host "     Found Java at: $javaPath" -ForegroundColor Cyan
        Write-Host '     Run as Admin: [System.Environment]::SetEnvironmentVariable("JAVA_HOME", "' + $javaPath + '", "Machine")' -ForegroundColor Cyan
    }
}

$sparkHome = [System.Environment]::GetEnvironmentVariable("SPARK_HOME", "Machine")
if (-not $sparkHome) {
    Write-Host "  ⚠️  SPARK_HOME not set" -ForegroundColor Yellow
    Write-Host '     Run as Admin: [System.Environment]::SetEnvironmentVariable("SPARK_HOME", "C:\spark\spark", "Machine")' -ForegroundColor Cyan
}

$hadoopHome = [System.Environment]::GetEnvironmentVariable("HADOOP_HOME", "Machine")
if (-not $hadoopHome) {
    Write-Host "  ⚠️  HADOOP_HOME not set" -ForegroundColor Yellow
    Write-Host '     Run as Admin: [System.Environment]::SetEnvironmentVariable("HADOOP_HOME", "C:\hadoop", "Machine")' -ForegroundColor Cyan
}

# Step 7: Test Installation
Write-Host ""
Write-Host "Step 7: Testing installation..." -ForegroundColor Yellow

Write-Host "  Testing PySpark import..." -ForegroundColor Gray
python -c "import pyspark; print('PySpark version:', pyspark.__version__)" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ PySpark import successful" -ForegroundColor Green
} else {
    Write-Host "  ❌ PySpark import failed" -ForegroundColor Red
}

# Summary
Write-Host ""
Write-Host "=== Installation Summary ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. If any environment variables show ⚠️, set them manually or rerun as Administrator" -ForegroundColor White
Write-Host "2. Close and reopen your terminal to refresh environment variables" -ForegroundColor White
Write-Host "3. Restart the development server: npm run dev" -ForegroundColor White
Write-Host "4. Check service health: curl http://localhost:3000/api/system/health" -ForegroundColor White
Write-Host ""
Write-Host "For detailed instructions, see: SPARK_FULL_SETUP_GUIDE.md" -ForegroundColor Cyan
Write-Host ""
