#!/usr/bin/env node

/**
 * Service Verification Script
 * Verifies that all required services (Python, Redis, PostgreSQL, Spark) are properly configured
 */

import { spawn } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'blue');
  console.log('='.repeat(80));
}

async function execCommand(command, args = []) {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { shell: true });
    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', (error) => {
      resolve({ code: -1, stdout: '', stderr: error.message });
    });
  });
}

async function checkPython() {
  section('Checking Python Installation');

  // Check Python version
  const pythonCheck = await execCommand('python', ['--version']);
  const python3Check = await execCommand('python3', ['--version']);

  if (pythonCheck.code === 0 || python3Check.code === 0) {
    const version = pythonCheck.code === 0 ? pythonCheck.stdout : python3Check.stdout;
    log(`✓ Python installed: ${version.trim()}`, 'green');
  } else {
    log('✗ Python not found', 'red');
    return false;
  }

  // Check required libraries
  section('Checking Python Libraries');
  const libraries = ['pandas', 'numpy', 'scikit-learn', 'scipy', 'statsmodels'];
  let allLibsInstalled = true;

  for (const lib of libraries) {
    const libName = lib.replace('-', '_');
    const result = await execCommand('python', ['-c', `import ${libName}; print(${libName}.__version__)`]);

    if (result.code === 0) {
      log(`  ✓ ${lib}: ${result.stdout.trim()}`, 'green');
    } else {
      log(`  ✗ ${lib}: Not installed`, 'red');
      allLibsInstalled = false;
    }
  }

  if (!allLibsInstalled) {
    log('\nInstall missing libraries with:', 'yellow');
    log('  pip install pandas numpy scikit-learn scipy statsmodels', 'yellow');
    return false;
  }

  return true;
}

async function checkRedis() {
  section('Checking Redis');

  // Check if Redis is running
  try {
    const Redis = await import('ioredis');
    const redis = new Redis.default({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryStrategy: () => null, // Don't retry
      connectTimeout: 3000
    });

    const pong = await redis.ping();
    await redis.quit();

    if (pong === 'PONG') {
      log('✓ Redis is running and responding', 'green');
      log(`  Host: ${process.env.REDIS_HOST || 'localhost'}`, 'green');
      log(`  Port: ${process.env.REDIS_PORT || '6379'}`, 'green');
      log(`  REDIS_ENABLED: ${process.env.REDIS_ENABLED}`, 'green');
      return true;
    }
  } catch (error) {
    log(`✗ Redis connection failed: ${error.message}`, 'red');
    log('\nTo start Redis:', 'yellow');
    log('  docker-compose -f docker-compose.dev.yml up -d', 'yellow');
    log('  or install Redis locally', 'yellow');
    return false;
  }

  return false;
}

async function checkDatabase() {
  section('Checking PostgreSQL Database');

  try {
    // Import drizzle setup
    const { db } = await import('./server/db.ts');

    // Test query
    await db.execute('SELECT 1');

    log('✓ PostgreSQL is running and accessible', 'green');
    log(`  DATABASE_URL: ${process.env.DATABASE_URL ? '***configured***' : 'NOT SET'}`, 'green');
    return true;
  } catch (error) {
    log(`✗ Database connection failed: ${error.message}`, 'red');
    log('\nCheck your DATABASE_URL in .env file', 'yellow');
    return false;
  }
}

async function checkSpark() {
  section('Checking Apache Spark (Optional)');

  const sparkEnabled = process.env.SPARK_ENABLED === 'true';

  if (!sparkEnabled) {
    log('ℹ Spark is disabled (SPARK_ENABLED=false)', 'yellow');
    log('  This is OK for development - Python will be used for analysis', 'yellow');
    return true;
  }

  log(`SPARK_ENABLED: ${sparkEnabled}`, 'blue');
  log(`SPARK_MASTER_URL: ${process.env.SPARK_MASTER_URL || 'local[*]'}`, 'blue');
  log(`SPARK_HOME: ${process.env.SPARK_HOME || 'NOT SET'}`, 'blue');

  // Check if PySpark is available
  const pysparkCheck = await execCommand('python', ['-c', 'import pyspark; print(pyspark.__version__)']);

  if (pysparkCheck.code === 0) {
    log(`✓ PySpark installed: ${pysparkCheck.stdout.trim()}`, 'green');
  } else {
    log('✗ PySpark not installed', 'yellow');
    log('  Install with: pip install pyspark', 'yellow');
    log('  Or set SPARK_ENABLED=false to use Python-only analysis', 'yellow');
    return false;
  }

  return true;
}

async function checkEnvironmentVariables() {
  section('Checking Environment Variables');

  const required = {
    'DATABASE_URL': process.env.DATABASE_URL,
    'NODE_ENV': process.env.NODE_ENV,
    'GOOGLE_AI_API_KEY': process.env.GOOGLE_AI_API_KEY,
    'SESSION_SECRET': process.env.SESSION_SECRET
  };

  const optional = {
    'REDIS_ENABLED': process.env.REDIS_ENABLED,
    'SPARK_ENABLED': process.env.SPARK_ENABLED,
    'PYTHON_BRIDGE_ENABLED': process.env.PYTHON_BRIDGE_ENABLED,
    'STRIPE_SECRET_KEY': process.env.STRIPE_SECRET_KEY
  };

  let allRequiredSet = true;

  log('\nRequired:', 'blue');
  for (const [key, value] of Object.entries(required)) {
    if (value) {
      log(`  ✓ ${key}: ${key.includes('KEY') || key.includes('SECRET') || key.includes('URL') ? '***set***' : value}`, 'green');
    } else {
      log(`  ✗ ${key}: NOT SET`, 'red');
      allRequiredSet = false;
    }
  }

  log('\nOptional:', 'blue');
  for (const [key, value] of Object.entries(optional)) {
    if (value) {
      log(`  ✓ ${key}: ${value}`, 'green');
    } else {
      log(`  - ${key}: not set`, 'yellow');
    }
  }

  return allRequiredSet;
}

async function testPythonScripts() {
  section('Testing Python Analysis Scripts');

  const scriptsDir = './python';
  const testScripts = [
    'descriptive_stats.py',
    'correlation_analysis.py',
    'regression_analysis.py',
    'classification_analysis.py',
    'clustering_analysis.py',
    'statistical_tests.py',
    'ml_training.py'
  ];

  // Create minimal test data
  const testData = [
    { x: 1, y: 2, category: 'A' },
    { x: 2, y: 4, category: 'B' },
    { x: 3, y: 6, category: 'A' },
    { x: 4, y: 8, category: 'B' },
    { x: 5, y: 10, category: 'A' }
  ];

  const fs = await import('fs/promises');
  const path = await import('path');
  const testDataPath = './temp/test_data.json';

  // Create temp directory
  try {
    await fs.mkdir('./temp', { recursive: true });
    await fs.writeFile(testDataPath, JSON.stringify(testData));
  } catch (error) {
    log(`✗ Failed to create test data: ${error.message}`, 'red');
    return false;
  }

  let allScriptsWorking = true;

  for (const script of testScripts) {
    const scriptPath = path.join(scriptsDir, script);

    // Check if script exists
    try {
      await fs.access(scriptPath);
    } catch {
      log(`  ✗ ${script}: Not found`, 'red');
      allScriptsWorking = false;
      continue;
    }

    // Test script with minimal data
    const config = JSON.stringify({ data_path: testDataPath });
    const result = await execCommand('python', [scriptPath, config]);

    if (result.code === 0) {
      try {
        const output = JSON.parse(result.stdout);
        if (output.success !== false) {
          log(`  ✓ ${script}: Working`, 'green');
        } else {
          log(`  ✗ ${script}: Returned error - ${output.error}`, 'red');
          allScriptsWorking = false;
        }
      } catch {
        log(`  ⚠ ${script}: Unexpected output format`, 'yellow');
      }
    } else {
      log(`  ✗ ${script}: Failed - ${result.stderr.substring(0, 100)}`, 'red');
      allScriptsWorking = false;
    }
  }

  // Cleanup
  try {
    await fs.unlink(testDataPath);
  } catch {}

  return allScriptsWorking;
}

async function main() {
  log('\n🔍 ChimariData Service Verification', 'blue');
  log('Checking all required services and dependencies...\n', 'blue');

  const results = {
    env: await checkEnvironmentVariables(),
    python: await checkPython(),
    redis: await checkRedis(),
    database: await checkDatabase(),
    spark: await checkSpark(),
    scripts: await testPythonScripts()
  };

  section('Summary');

  const status = Object.entries(results).map(([service, ok]) => {
    const symbol = ok ? '✓' : '✗';
    const color = ok ? 'green' : 'red';
    const name = service.charAt(0).toUpperCase() + service.slice(1);
    return { service: name, ok, symbol, color };
  });

  status.forEach(({ service, symbol, color }) => {
    log(`${symbol} ${service}`, color);
  });

  const allPassed = status.every(s => s.ok);
  console.log('\n' + '='.repeat(80));

  if (allPassed) {
    log('✅ All services are ready! You can run end-to-end tests.', 'green');
    log('\nRun tests with:', 'blue');
    log('  npm run test:production', 'blue');
    process.exit(0);
  } else {
    log('❌ Some services need attention before running tests', 'red');
    log('\nFix the issues above and run this script again', 'yellow');
    process.exit(1);
  }
}

main().catch((error) => {
  log(`\n❌ Verification failed: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
