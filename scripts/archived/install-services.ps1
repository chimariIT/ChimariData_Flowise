# Quick Install Script for ChimariData Production Services
# Run with Administrator privileges

param(
    [switch]$SkipChocolatey,
    [switch]$SkipPython,
    [switch]$SkipJava,
    [switch]$SkipSpark,
    [switch]$SkipRedis
)

$ErrorActionPreference = "Continue"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  ChimariData Production Services Installer" -ForegroundColor Green
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "❌ ERROR: This script requires Administrator privileges!" -ForegroundColor Red
    Write-Host "   Please right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "✅ Running with Administrator privileges" -ForegroundColor Green
Write-Host ""

# Function to test if command exists
function Test-Command {
    param($CommandName)
    $null -ne (Get-Command $CommandName -ErrorAction SilentlyContinue)
}

# Install Chocolatey
if (-not $SkipChocolatey) {
    if (Test-Command choco) {
        Write-Host "✅ Chocolatey already installed" -ForegroundColor Green
    } else {
        Write-Host "[Chocolatey] Installing Chocolatey..." -ForegroundColor Yellow
        try {
            Set-ExecutionPolicy Bypass -Scope Process -Force
            [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
            Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
            Write-Host "✅ Chocolatey installed successfully" -ForegroundColor Green
        } catch {
            Write-Host "❌ Failed to install Chocolatey: $_" -ForegroundColor Red
            exit 1
        }
    }
    Write-Host ""
}

# Refresh environment variables
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$machinePath;$userPath"

# Install Python 3.11
if (-not $SkipPython) {
    Write-Host "[Python] Checking Python installation..." -ForegroundColor Yellow
    if (Test-Command python) {
        $pythonVersion = python --version 2>&1
        Write-Host "  Found: $pythonVersion" -ForegroundColor Cyan
        
        if ($pythonVersion -match "3\.11|3\.12") {
            Write-Host "✅ Python 3.11+ already installed" -ForegroundColor Green
        } else {
            Write-Host "[Warning] Python version is not 3.11+, installing Python 3.11..." -ForegroundColor Yellow
            choco install python311 -y
        }
    } else {
        Write-Host "[Python] Installing Python 3.11..." -ForegroundColor Yellow
        choco install python311 -y
    }
    
    # Refresh PATH
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
    
    if (Test-Command python) {
        Write-Host "✅ Python installed successfully" -ForegroundColor Green
        python --version
    } else {
        Write-Host "❌ Python installation failed or PATH not updated" -ForegroundColor Red
        Write-Host "   Please restart PowerShell and try again" -ForegroundColor Yellow
    }
    Write-Host ""
}

# Install OpenJDK (required for Spark)
if (-not $SkipJava) {
    Write-Host "[Java] Checking Java installation..." -ForegroundColor Yellow
    if (Test-Command java) {
        $javaVersion = java -version 2>&1 | Select-String -Pattern "version"
        Write-Host "  Found: $javaVersion" -ForegroundColor Cyan
        Write-Host "✅ Java already installed" -ForegroundColor Green
    } else {
        Write-Host "[Java] Installing OpenJDK 17..." -ForegroundColor Yellow
        choco install openjdk17 -y
        
        # Refresh PATH
        $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
        $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
        $env:Path = "$machinePath;$userPath"
        
        if (Test-Command java) {
            Write-Host "✅ Java installed successfully" -ForegroundColor Green
            java -version 2>&1 | Select-String -Pattern "version"
        } else {
            Write-Host "❌ Java installation failed or PATH not updated" -ForegroundColor Red
        }
    }
    Write-Host ""
}

# Install Apache Spark
if (-not $SkipSpark) {
    Write-Host "[Spark] Checking Apache Spark installation..." -ForegroundColor Yellow
    
    $sparkHome = "C:\spark"
    $sparkDir = "$sparkHome\spark"
    
    if (Test-Path "$sparkDir\bin\spark-submit.cmd") {
        Write-Host "✅ Apache Spark already installed at $sparkDir" -ForegroundColor Green
        & "$sparkDir\bin\spark-submit.cmd" --version 2>&1 | Select-String -Pattern "version"
    } else {
        Write-Host "[Spark] Installing Apache Spark 3.5.3..." -ForegroundColor Yellow
        
        try {
            # Create Spark directory
            New-Item -Path $sparkHome -ItemType Directory -Force | Out-Null
            
            # Download Spark
            $sparkVersion = "3.5.3"
            $sparkUrl = "https://archive.apache.org/dist/spark/spark-$sparkVersion/spark-$sparkVersion-bin-hadoop3.tgz"
            $sparkTarball = "$sparkHome\spark-$sparkVersion-bin-hadoop3.tgz"
            
            Write-Host "  Downloading Spark from Apache..." -ForegroundColor Cyan
            Write-Host "  URL: $sparkUrl" -ForegroundColor DarkGray
            Write-Host "  This may take several minutes (~400MB)..." -ForegroundColor Cyan
            
            # Use .NET WebClient for better progress
            $webClient = New-Object System.Net.WebClient
            $webClient.DownloadFile($sparkUrl, $sparkTarball)
            
            Write-Host "✅ Spark downloaded successfully" -ForegroundColor Green
            
            # Extract Spark (using tar which is now built into Windows 10+)
            Write-Host "  Extracting Spark..." -ForegroundColor Cyan
            Set-Location $sparkHome
            tar -xzf "spark-$sparkVersion-bin-hadoop3.tgz"
            
            # Rename directory
            if (Test-Path "$sparkHome\spark-$sparkVersion-bin-hadoop3") {
                Rename-Item -Path "$sparkHome\spark-$sparkVersion-bin-hadoop3" -NewName "spark"
            }
            
            # Clean up tarball
            Remove-Item $sparkTarball -Force
            
            Write-Host "✅ Spark extracted successfully" -ForegroundColor Green
            
            # Set SPARK_HOME environment variable
            Write-Host "  Setting SPARK_HOME environment variable..." -ForegroundColor Cyan
            [System.Environment]::SetEnvironmentVariable('SPARK_HOME', $sparkDir, 'User')
            $env:SPARK_HOME = $sparkDir
            
            # Add Spark to PATH
            $currentPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
            if ($currentPath -notlike "*$sparkDir\bin*") {
                $newPath = "$currentPath;$sparkDir\bin"
                [System.Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
                $env:Path += ";$sparkDir\bin"
            }
            
            # Set JAVA_HOME if not already set
            if (-not $env:JAVA_HOME) {
                if (Test-Command java) {
                    $javaPath = (Get-Command java).Source
                    $javaHome = Split-Path (Split-Path $javaPath -Parent) -Parent
                    [System.Environment]::SetEnvironmentVariable('JAVA_HOME', $javaHome, 'User')
                    $env:JAVA_HOME = $javaHome
                    Write-Host "  Set JAVA_HOME to: $javaHome" -ForegroundColor Cyan
                }
            }
            
            # Download and install winutils.exe for Hadoop on Windows
            Write-Host "  Installing Hadoop winutils for Windows..." -ForegroundColor Cyan
            $hadoopHome = "C:\hadoop"
            $hadoopBin = "$hadoopHome\bin"
            New-Item -Path $hadoopBin -ItemType Directory -Force | Out-Null
            
            $winutilsUrl = "https://github.com/steveloughran/winutils/raw/master/hadoop-3.0.0/bin/winutils.exe"
            $winutilsPath = "$hadoopBin\winutils.exe"
            
            try {
                $webClient.DownloadFile($winutilsUrl, $winutilsPath)
                Write-Host "✅ winutils.exe installed" -ForegroundColor Green
            } catch {
                Write-Host "⚠️  Failed to download winutils.exe: $_" -ForegroundColor Yellow
                Write-Host "   Spark may have issues with some operations" -ForegroundColor Yellow
            }
            
            # Set HADOOP_HOME
            [System.Environment]::SetEnvironmentVariable('HADOOP_HOME', $hadoopHome, 'User')
            $env:HADOOP_HOME = $hadoopHome
            
            Write-Host "✅ Apache Spark installed successfully" -ForegroundColor Green
            
            # Test Spark
            Write-Host "  Testing Spark installation..." -ForegroundColor Cyan
            $sparkVersion = & "$sparkDir\bin\spark-submit.cmd" --version 2>&1 | Select-String -Pattern "version"
            Write-Host "  $sparkVersion" -ForegroundColor Cyan
            
        } catch {
            Write-Host "❌ Failed to install Spark: $_" -ForegroundColor Red
            Write-Host "   You can install manually following: INSTALL_PRODUCTION_SERVICES.md" -ForegroundColor Yellow
        } finally {
            # Return to original directory
            Set-Location $PSScriptRoot
        }
    }
    Write-Host ""
}

# Install Redis
if (-not $SkipRedis) {
    Write-Host "[Redis] Checking Redis installation..." -ForegroundColor Yellow
    if (Test-Command redis-server) {
        Write-Host "✅ Redis already installed" -ForegroundColor Green
        redis-server --version
    } else {
        Write-Host "[Redis] Installing Redis..." -ForegroundColor Yellow
        choco install redis-64 -y
        
        # Refresh PATH
        $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
        $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
        $env:Path = "$machinePath;$userPath"
        
        if (Test-Command redis-server) {
            Write-Host "✅ Redis installed successfully" -ForegroundColor Green
            
            # Start Redis service
            Write-Host "[Redis] Starting Redis service..." -ForegroundColor Yellow
            try {
                Start-Service Redis -ErrorAction Stop
                Write-Host "✅ Redis service started" -ForegroundColor Green
            } catch {
                Write-Host "⚠️  Could not start Redis service automatically" -ForegroundColor Yellow
                Write-Host "   Run: Start-Service Redis" -ForegroundColor Cyan
            }
            
            # Test Redis
            Start-Sleep -Seconds 2
            $redisPing = redis-cli ping 2>&1
            if ($redisPing -eq "PONG") {
                Write-Host "✅ Redis connection test passed" -ForegroundColor Green
            } else {
                Write-Host "⚠️  Redis service may not be running" -ForegroundColor Yellow
            }
        } else {
            Write-Host "❌ Redis installation failed" -ForegroundColor Red
        }
    }
    Write-Host ""
}

# Install Python packages
Write-Host "[Packages] Installing Python packages..." -ForegroundColor Yellow
$requirementsPath = "python\requirements.txt"
if (Test-Path $requirementsPath) {
    try {
        Write-Host "  Installing from $requirementsPath..." -ForegroundColor Cyan
        python -m pip install --upgrade pip
        python -m pip install -r $requirementsPath
        Write-Host "✅ Python packages installed successfully" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Error installing Python packages: $_" -ForegroundColor Yellow
        Write-Host "   Run manually: pip install -r python/requirements.txt" -ForegroundColor Cyan
    }
} else {
    Write-Host "⚠️  requirements.txt not found at: $requirementsPath" -ForegroundColor Yellow
    Write-Host "   Installing common packages..." -ForegroundColor Cyan
    python -m pip install pandas numpy scipy scikit-learn matplotlib seaborn plotly reportlab PyPDF2
}
Write-Host ""

# Summary
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  Installation Summary" -ForegroundColor Green
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

$services = @()

if (Test-Command python) {
    $pythonVer = python --version 2>&1
    $services += @{ Name = "Python"; Status = "✅ Installed"; Version = $pythonVer }
} else {
    $services += @{ Name = "Python"; Status = "❌ Not Found"; Version = "N/A" }
}

if (Test-Command java) {
    $javaVer = java -version 2>&1 | Select-Object -First 1
    $services += @{ Name = "Java"; Status = "✅ Installed"; Version = $javaVer }
} else {
    $services += @{ Name = "Java"; Status = "❌ Not Found"; Version = "N/A" }
}

if (Test-Path "C:\spark\spark\bin\spark-submit.cmd") {
    $sparkVer = & "C:\spark\spark\bin\spark-submit.cmd" --version 2>&1 | Select-String -Pattern "version" | Select-Object -First 1
    $services += @{ Name = "Spark"; Status = "✅ Installed"; Version = $sparkVer }
} else {
    $services += @{ Name = "Spark"; Status = "❌ Not Found"; Version = "N/A" }
}

if (Test-Command redis-server) {
    $redisVer = redis-server --version 2>&1 | Select-Object -First 1
    $redisPing = redis-cli ping 2>&1
    $redisStatus = if ($redisPing -eq "PONG") { "✅ Running" } else { "⚠️  Installed but not running" }
    $services += @{ Name = "Redis"; Status = $redisStatus; Version = $redisVer }
} else {
    $services += @{ Name = "Redis"; Status = "❌ Not Found"; Version = "N/A" }
}

foreach ($service in $services) {
    Write-Host ("{0,-15} {1,-30} {2}" -f $service.Name, $service.Status, $service.Version)
}

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

# Next steps
Write-Host "📋 Next Steps:" -ForegroundColor Green
Write-Host ""
Write-Host "  1. 🔄 RESTART PowerShell to apply PATH changes" -ForegroundColor Cyan
Write-Host ""
Write-Host "  2. 📝 Update .env file with service configurations:" -ForegroundColor Cyan
Write-Host "     PYTHON_BRIDGE_ENABLED=true" -ForegroundColor White
Write-Host "     REDIS_ENABLED=true" -ForegroundColor White
Write-Host "     REDIS_HOST=localhost" -ForegroundColor White
Write-Host "     REDIS_PORT=6379" -ForegroundColor White
Write-Host "     SPARK_ENABLED=true" -ForegroundColor White
Write-Host "     SPARK_MASTER_URL=local[*]" -ForegroundColor White
Write-Host "     SPARK_HOME=C:\spark\spark" -ForegroundColor White
Write-Host ""
Write-Host "  3. 🚀 Start development server:" -ForegroundColor Cyan
Write-Host "     npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "  4. ✅ Verify 'All Services Operational' message appears" -ForegroundColor Cyan
Write-Host "     (Development Mode banner should be gone)" -ForegroundColor DarkGray
Write-Host ""

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

Read-Host "Press Enter to exit"
