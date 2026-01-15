/**
 * Python Worker Pool Service
 *
 * Manages a pool of persistent Python processes to eliminate process spawn overhead.
 * Expected performance improvement: 8-12 seconds per analysis execution.
 *
 * Architecture:
 * - Pre-spawns 2-3 Python processes on server startup
 * - Workers remain alive and accept jobs via stdin/stdout IPC
 * - Automatic worker health monitoring and restart on failure
 * - Job queue with timeout handling
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

interface WorkerJob {
  id: string;
  script: string;
  timeout: number;
  resolve: (result: PythonExecutionResult) => void;
  reject: (error: Error) => void;
  startTime: number;
}

interface PythonExecutionResult {
  success: boolean;
  data?: any;
  visualizations?: any[];
  error?: string;
  libraries?: string[];
}

interface WorkerStats {
  jobsCompleted: number;
  jobsFailed: number;
  averageExecutionTime: number;
  lastActivity: Date;
}

class PythonWorker extends EventEmitter {
  private process: ChildProcess | null = null;
  private currentJob: WorkerJob | null = null;
  private stats: WorkerStats = {
    jobsCompleted: 0,
    jobsFailed: 0,
    averageExecutionTime: 0,
    lastActivity: new Date(),
  };
  private outputBuffer = '';
  private errorBuffer = '';
  public readonly workerId: string;
  public isReady = false;

  constructor(
    private readonly pythonPath: string,
    workerId: string
  ) {
    super();
    this.workerId = workerId;
  }

  async initialize(): Promise<void> {
    console.log(`🐍 [Worker ${this.workerId}] Initializing Python worker...`);

    this.process = spawn(this.pythonPath, ['-u', '-c', `
import sys
import json
import traceback

print("WORKER_READY", flush=True)

while True:
    try:
        # Read job from stdin (format: LENGTH\\nSCRIPT)
        length_line = sys.stdin.readline().strip()
        if not length_line:
            break

        script_length = int(length_line)
        script = sys.stdin.read(script_length)

        # Execute script in isolated namespace
        namespace = {}
        exec(script, namespace)

        # Worker continues to next job
        print("JOB_COMPLETE", flush=True)

    except Exception as e:
        error_msg = json.dumps({"success": False, "error": str(e), "traceback": traceback.format_exc()})
        print(f"JOB_ERROR:{error_msg}", flush=True)
`], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    this.process.stdout?.on('data', (data) => this.handleStdout(data));
    this.process.stderr?.on('data', (data) => this.handleStderr(data));
    this.process.on('error', (error) => this.handleProcessError(error));
    this.process.on('exit', (code) => this.handleProcessExit(code));

    // Wait for worker ready signal
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Worker ${this.workerId} initialization timeout`));
      }, 10000);

      const readyHandler = () => {
        clearTimeout(timeout);
        this.isReady = true;
        console.log(`✅ [Worker ${this.workerId}] Ready`);
        resolve();
      };

      this.once('ready', readyHandler);
      this.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private handleStdout(data: Buffer): void {
    this.outputBuffer += data.toString();

    // Check for worker ready signal
    if (this.outputBuffer.includes('WORKER_READY')) {
      this.outputBuffer = this.outputBuffer.replace('WORKER_READY', '').trim();
      this.emit('ready');
      return;
    }

    // Check for job completion
    if (this.outputBuffer.includes('JOB_COMPLETE')) {
      this.handleJobComplete();
      return;
    }

    // Check for job error
    const errorMatch = this.outputBuffer.match(/JOB_ERROR:(.+)/);
    if (errorMatch) {
      this.handleJobError(errorMatch[1]);
      return;
    }
  }

  private handleStderr(data: Buffer): void {
    this.errorBuffer += data.toString();
  }

  private handleJobComplete(): void {
    if (!this.currentJob) return;

    try {
      // Extract JSON output from buffer
      const jsonMatch = this.outputBuffer.match(/\{[^]*\}/);
      const result: PythonExecutionResult = jsonMatch
        ? JSON.parse(jsonMatch[0])
        : { success: true, data: {} };

      const executionTime = Date.now() - this.currentJob.startTime;
      this.updateStats(true, executionTime);

      this.currentJob.resolve(result);
      this.currentJob = null;
      this.outputBuffer = '';
      this.errorBuffer = '';
      this.emit('jobComplete');
    } catch (error) {
      this.handleJobError(`Failed to parse output: ${error}`);
    }
  }

  private handleJobError(errorMessage: string): void {
    if (!this.currentJob) return;

    this.updateStats(false, Date.now() - this.currentJob.startTime);

    try {
      const errorData = JSON.parse(errorMessage);
      this.currentJob.reject(new Error(errorData.error || 'Unknown error'));
    } catch {
      this.currentJob.reject(new Error(errorMessage));
    }

    this.currentJob = null;
    this.outputBuffer = '';
    this.errorBuffer = '';
    this.emit('jobComplete');
  }

  private handleProcessError(error: Error): void {
    console.error(`❌ [Worker ${this.workerId}] Process error:`, error);
    this.isReady = false;

    if (this.currentJob) {
      this.currentJob.reject(error);
      this.currentJob = null;
    }

    this.emit('error', error);
  }

  private handleProcessExit(code: number | null): void {
    console.warn(`⚠️ [Worker ${this.workerId}] Process exited with code ${code}`);
    this.isReady = false;

    if (this.currentJob) {
      this.currentJob.reject(new Error(`Worker process exited unexpectedly (code: ${code})`));
      this.currentJob = null;
    }

    this.emit('exit', code);
  }

  async executeJob(script: string, timeout: number): Promise<PythonExecutionResult> {
    if (!this.isReady || !this.process) {
      throw new Error(`Worker ${this.workerId} is not ready`);
    }

    if (this.currentJob) {
      throw new Error(`Worker ${this.workerId} is already executing a job`);
    }

    return new Promise((resolve, reject) => {
      this.currentJob = {
        id: `job-${Date.now()}`,
        script,
        timeout,
        resolve,
        reject,
        startTime: Date.now(),
      };

      // Set job timeout
      const timeoutHandle = setTimeout(() => {
        if (this.currentJob) {
          console.warn(`⏰ [Worker ${this.workerId}] Job timeout after ${timeout}ms`);
          this.currentJob.reject(new Error('Job execution timeout'));
          this.currentJob = null;
          this.restart(); // Restart worker on timeout
        }
      }, timeout);

      // Clear timeout when job completes
      this.once('jobComplete', () => clearTimeout(timeoutHandle));

      // Send script to worker via stdin
      const scriptBuffer = Buffer.from(script, 'utf-8');
      this.process!.stdin!.write(`${scriptBuffer.length}\n`);
      this.process!.stdin!.write(scriptBuffer);
    });
  }

  private updateStats(success: boolean, executionTime: number): void {
    if (success) {
      this.stats.jobsCompleted++;
      const totalTime = this.stats.averageExecutionTime * (this.stats.jobsCompleted - 1) + executionTime;
      this.stats.averageExecutionTime = totalTime / this.stats.jobsCompleted;
    } else {
      this.stats.jobsFailed++;
    }
    this.stats.lastActivity = new Date();
  }

  async restart(): Promise<void> {
    console.log(`🔄 [Worker ${this.workerId}] Restarting worker...`);
    this.isReady = false;

    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }

    await this.initialize();
  }

  destroy(): void {
    this.isReady = false;
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  getStats(): WorkerStats {
    return { ...this.stats };
  }
}

/**
 * Python Worker Pool
 * Manages multiple Python workers and distributes jobs across them
 */
export class PythonWorkerPool {
  private workers: PythonWorker[] = [];
  private jobQueue: WorkerJob[] = [];
  private isInitialized = false;

  constructor(
    private readonly poolSize: number = 3,
    private readonly pythonPath: string = process.platform === 'win32' ? 'python' : 'python3'
  ) {}

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('⚠️ Python worker pool already initialized');
      return;
    }

    console.log(`🚀 Initializing Python worker pool with ${this.poolSize} workers...`);

    const initPromises = [];
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new PythonWorker(this.pythonPath, `worker-${i}`);

      worker.on('exit', () => {
        console.warn(`⚠️ Worker ${worker.workerId} exited, restarting...`);
        worker.restart().catch(err => {
          console.error(`❌ Failed to restart worker ${worker.workerId}:`, err);
        });
      });

      worker.on('jobComplete', () => this.processQueue());

      this.workers.push(worker);
      initPromises.push(worker.initialize());
    }

    try {
      await Promise.all(initPromises);
      this.isInitialized = true;
      console.log(`✅ Python worker pool initialized with ${this.poolSize} workers`);
    } catch (error) {
      console.error('❌ Failed to initialize Python worker pool:', error);
      throw error;
    }
  }

  async executeScript(script: string, timeout: number = 15000): Promise<PythonExecutionResult> {
    if (!this.isInitialized) {
      throw new Error('Python worker pool not initialized');
    }

    // Find available worker
    const availableWorker = this.workers.find(w => w.isReady && !w['currentJob']);

    if (availableWorker) {
      // Execute immediately
      return availableWorker.executeJob(script, timeout);
    }

    // Queue job if no workers available
    console.log('⏳ All workers busy, queueing job...');
    return new Promise((resolve, reject) => {
      this.jobQueue.push({
        id: `queued-${Date.now()}`,
        script,
        timeout,
        resolve,
        reject,
        startTime: Date.now(),
      });
    });
  }

  private processQueue(): void {
    if (this.jobQueue.length === 0) return;

    const availableWorker = this.workers.find(w => w.isReady && !w['currentJob']);
    if (!availableWorker) return;

    const job = this.jobQueue.shift();
    if (!job) return;

    availableWorker.executeJob(job.script, job.timeout)
      .then(job.resolve)
      .catch(job.reject);
  }

  getPoolStats() {
    return {
      poolSize: this.poolSize,
      workers: this.workers.map(w => ({
        workerId: w.workerId,
        isReady: w.isReady,
        stats: w.getStats(),
      })),
      queuedJobs: this.jobQueue.length,
    };
  }

  async destroy(): Promise<void> {
    console.log('🛑 Shutting down Python worker pool...');
    this.workers.forEach(w => w.destroy());
    this.workers = [];
    this.jobQueue = [];
    this.isInitialized = false;
    console.log('✅ Python worker pool shut down');
  }
}

// Singleton instance
let poolInstance: PythonWorkerPool | null = null;

export function getPythonWorkerPool(): PythonWorkerPool {
  if (!poolInstance) {
    const poolSize = parseInt(process.env.PYTHON_WORKER_POOL_SIZE || '3', 10);
    poolInstance = new PythonWorkerPool(poolSize);
  }
  return poolInstance;
}

export async function initializePythonWorkerPool(): Promise<void> {
  const pool = getPythonWorkerPool();
  await pool.initialize();
}
