/**
 * Enhanced Batch Processing Service
 * 
 * Provides efficient batch processing capabilities for large datasets and operations.
 * Includes intelligent batching, parallel processing, progress tracking, and memory management.
 * 
 * Features:
 * - Dynamic batch size optimization
 * - Parallel processing with worker pools
 * - Memory-aware processing
 * - Progress tracking and cancellation
 * - Error handling with partial recovery
 * - Resource throttling and backpressure
 * - Streaming support for large datasets
 */

import { EventEmitter } from 'events';
import type { Worker } from 'worker_threads';
import { Transform, Readable, Writable } from 'stream';
import { pipeline } from 'stream/promises';
import { nanoid } from 'nanoid';

export interface BatchProcessingOptions {
  batchSize?: number;           // Items per batch
  maxConcurrency?: number;      // Max parallel batches
  maxMemoryUsage?: number;      // Max memory in bytes
  retryAttempts?: number;       // Retry failed batches
  progressCallback?: (progress: BatchProgress) => void;
  errorStrategy?: 'fail-fast' | 'continue-on-error' | 'retry-failed';
  useWorkerThreads?: boolean;   // Use worker threads for CPU-intensive tasks
  streamingMode?: boolean;      // Process data as a stream
  timeoutMs?: number;          // Processing timeout
}

export interface BatchJob<TInput = any, TOutput = any> {
  id: string;
  name: string;
  data: TInput[];
  processor: BatchProcessor<TInput, TOutput>;
  options: BatchProcessingOptions;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress: BatchProgress;
  results: BatchResult<TOutput>;
  error?: string;
}

export interface BatchProgress {
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  currentBatch: number;
  totalBatches: number;
  percentComplete: number;
  estimatedTimeRemaining?: number;
  throughput: number; // Items per second
}

export interface BatchResult<TOutput = any> {
  successful: TOutput[];
  failed: Array<{ item: any; error: string; index: number }>;
  metadata: {
    totalTime: number;
    averageItemTime: number;
    memoryPeak: number;
    throughput: number;
  };
}

export type BatchProcessor<TInput, TOutput> = (
  items: TInput[], 
  batchIndex: number, 
  metadata: { totalBatches: number; job: BatchJob }
) => Promise<TOutput[]>;

export class EnhancedBatchProcessor extends EventEmitter {
  private jobs = new Map<string, BatchJob>();
  private runningJobs = new Set<string>();
  private workers = new Map<string, Worker>();
  private memoryMonitor: NodeJS.Timeout | null = null;
  
  private maxGlobalConcurrency: number = 5;
  private currentMemoryUsage: number = 0;
  private maxGlobalMemory: number = 1024 * 1024 * 1024; // 1GB default

  constructor(options: {
    maxGlobalConcurrency?: number;
    maxGlobalMemory?: number;
  } = {}) {
    super();
    
    this.maxGlobalConcurrency = options.maxGlobalConcurrency || 5;
    this.maxGlobalMemory = options.maxGlobalMemory || 1024 * 1024 * 1024;
    
    this.startMemoryMonitoring();
    this.setupGracefulShutdown();
  }

  /**
   * Submit a batch job for processing
   */
  async submitJob<TInput, TOutput>(
    name: string,
    data: TInput[],
    processor: BatchProcessor<TInput, TOutput>,
    options: BatchProcessingOptions = {}
  ): Promise<string> {
    const jobId = nanoid();
    
    // Optimize batch size based on data characteristics
    const optimizedBatchSize = this.optimizeBatchSize(data, options.batchSize);
    
    const job: BatchJob<TInput, TOutput> = {
      id: jobId,
      name,
      data,
      processor,
      options: {
        batchSize: optimizedBatchSize,
        maxConcurrency: options.maxConcurrency || 3,
        maxMemoryUsage: options.maxMemoryUsage || (this.maxGlobalMemory / 4),
        retryAttempts: options.retryAttempts || 2,
        errorStrategy: options.errorStrategy || 'retry-failed',
        useWorkerThreads: options.useWorkerThreads || false,
        streamingMode: options.streamingMode || false,
        timeoutMs: options.timeoutMs || 300000, // 5 minutes
        progressCallback: options.progressCallback
      },
      status: 'pending',
      createdAt: new Date(),
      progress: this.initializeProgress(data.length, Math.ceil(data.length / optimizedBatchSize)),
      results: {
        successful: [],
        failed: [],
        metadata: {
          totalTime: 0,
          averageItemTime: 0,
          memoryPeak: 0,
          throughput: 0
        }
      }
    };

    this.jobs.set(jobId, job);
    
    console.log(`Batch job ${jobId} (${name}) submitted with ${data.length} items in ${job.progress.totalBatches} batches`);
    this.emit('job_submitted', { jobId, job });

    // Start processing if we have capacity
    setImmediate(() => this.processQueue());

    return jobId;
  }

  /**
   * Process a batch job with streaming support
   */
  async processStreamingJob<TInput, TOutput>(
    name: string,
    dataStream: Readable,
    processor: (chunk: TInput[]) => Promise<TOutput[]>,
    options: BatchProcessingOptions = {}
  ): Promise<string> {
    const jobId = nanoid();
    const batchSize = options.batchSize || 100;
    
    console.log(`Starting streaming batch job ${jobId} (${name})`);
    
    const chunks: TInput[] = [];
    const results: TOutput[] = [];
    const errors: any[] = [];
    let processedCount = 0;

    const batchTransform = new Transform({
      objectMode: true,
      async transform(chunk: TInput, encoding, callback) {
        chunks.push(chunk);
        
        if (chunks.length >= batchSize) {
          try {
            const batchToProcess = chunks.splice(0, batchSize);
            const batchResults = await processor(batchToProcess);
            results.push(...batchResults);
            processedCount += batchToProcess.length;
            
            // Report progress
            if (options.progressCallback) {
              options.progressCallback({
                totalItems: -1, // Unknown for streams
                processedItems: processedCount,
                successfulItems: results.length,
                failedItems: errors.length,
                currentBatch: Math.floor(processedCount / batchSize),
                totalBatches: -1,
                percentComplete: -1,
                throughput: processedCount / ((Date.now() - startTime) / 1000)
              });
            }
            
            callback();
          } catch (error) {
            errors.push({ chunk, error: (error as Error).message });
            callback();
          }
        } else {
          callback();
        }
      },
      
      async flush(callback) {
        // Process remaining items
        if (chunks.length > 0) {
          try {
            const batchResults = await processor(chunks);
            results.push(...batchResults);
            processedCount += chunks.length;
          } catch (error) {
            errors.push({ chunks, error: (error as Error).message });
          }
        }
        callback();
      }
    });

    const startTime = Date.now();
    
    try {
      await pipeline(dataStream, batchTransform);
      
      console.log(`Streaming job ${jobId} completed: ${results.length} successful, ${errors.length} failed`);
      this.emit('streaming_job_completed', { jobId, results, errors, processedCount });
      
      return jobId;
    } catch (error) {
      console.error(`Streaming job ${jobId} failed:`, error);
      this.emit('streaming_job_failed', { jobId, error });
      throw error;
    }
  }

  /**
   * Process the job queue
   */
  private async processQueue(): Promise<void> {
    // Check if we can start more jobs
    if (this.runningJobs.size >= this.maxGlobalConcurrency) {
      return;
    }

    // Find pending jobs that can run
    const pendingJobs = Array.from(this.jobs.values())
      .filter(job => job.status === 'pending')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    for (const job of pendingJobs) {
      if (this.runningJobs.size >= this.maxGlobalConcurrency) {
        break;
      }

      // Check memory constraints
      if (this.currentMemoryUsage + (job.options.maxMemoryUsage || 0) > this.maxGlobalMemory) {
        console.log(`Delaying job ${job.id} due to memory constraints`);
        continue;
      }

      await this.startJobProcessing(job);
    }
  }

  /**
   * Start processing a specific job
   */
  private async startJobProcessing(job: BatchJob): Promise<void> {
    this.runningJobs.add(job.id);
    job.status = 'running';
    job.startedAt = new Date();
    
    this.emit('job_started', { jobId: job.id, job });
    console.log(`Starting batch job ${job.id} (${job.name})`);

    try {
      if (job.options.useWorkerThreads) {
        await this.processJobWithWorkers(job);
      } else {
        await this.processJobInMainThread(job);
      }
    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
      console.error(`Batch job ${job.id} failed:`, error);
      this.emit('job_failed', { jobId: job.id, job, error });
    } finally {
      this.runningJobs.delete(job.id);
      job.completedAt = new Date();
      
      // Process next jobs in queue
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Process job in main thread
   */
  private async processJobInMainThread(job: BatchJob): Promise<void> {
    const batches = this.createBatches(job.data, job.options.batchSize!);
    const startTime = Date.now();
    let memoryPeak = 0;

    // Create semaphore for concurrency control
    const semaphore = this.createSemaphore(job.options.maxConcurrency!);

    const batchPromises = batches.map(async (batch, batchIndex) => {
      return semaphore(async () => {
        return this.processBatch(job, batch, batchIndex, batches.length);
      });
    });

    // Wait for all batches with progress tracking
    const batchResults = await Promise.allSettled(batchPromises);
    
    // Aggregate results
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        job.results.successful.push(...result.value.successful);
        job.results.failed.push(...result.value.failed);
      } else {
        // Handle batch-level failures
        console.error('Batch processing error:', result.reason);
      }
    }

    // Update final metrics
    const totalTime = Date.now() - startTime;
    job.results.metadata = {
      totalTime,
      averageItemTime: totalTime / job.data.length,
      memoryPeak,
      throughput: job.data.length / (totalTime / 1000)
    };

    job.status = 'completed';
    job.progress.percentComplete = 100;
    
    console.log(`Batch job ${job.id} completed: ${job.results.successful.length} successful, ${job.results.failed.length} failed`);
    this.emit('job_completed', { jobId: job.id, job });
  }

  /**
   * Process job using worker threads
   */
  private async processJobWithWorkers(job: BatchJob): Promise<void> {
    console.warn(
      `Worker-thread batch processing is disabled for job ${job.id}; ` +
        'dynamic processor serialization is unsafe. Falling back to main-thread processing.'
    );
    await this.processJobInMainThread(job);
  }

  /**
   * Process a single batch
   */
  private async processBatch(
    job: BatchJob, 
    batch: any[], 
    batchIndex: number, 
    totalBatches: number
  ): Promise<{ successful: any[]; failed: any[] }> {
    const startTime = Date.now();
    const successful: any[] = [];
    const failed: any[] = [];

    try {
      // Add timeout wrapper
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Batch processing timeout')), job.options.timeoutMs);
      });

      const processingPromise = job.processor(batch, batchIndex, { totalBatches, job });
      
      const results = await Promise.race([processingPromise, timeoutPromise]) as any[];
      successful.push(...results);
      
    } catch (error) {
      // Handle batch-level errors based on strategy
      if (job.options.errorStrategy === 'fail-fast') {
        throw error;
      } else {
        // Add all items in batch as failed
        batch.forEach((item, index) => {
          failed.push({
            item,
            error: (error as Error).message,
            index: batchIndex * job.options.batchSize! + index
          });
        });
      }
    }

    // Update progress
    job.progress.processedItems += batch.length;
    job.progress.successfulItems += successful.length;
    job.progress.failedItems += failed.length;
    job.progress.currentBatch = batchIndex + 1;
    job.progress.percentComplete = (job.progress.processedItems / job.progress.totalItems) * 100;

    const duration = Date.now() - startTime;
    job.progress.throughput = job.progress.processedItems / ((Date.now() - job.startedAt!.getTime()) / 1000);

    // Estimate remaining time
    if (job.progress.processedItems > 0) {
      const timeElapsed = Date.now() - job.startedAt!.getTime();
      const timePerItem = timeElapsed / job.progress.processedItems;
      const remainingItems = job.progress.totalItems - job.progress.processedItems;
      job.progress.estimatedTimeRemaining = remainingItems * timePerItem;
    }

    // Call progress callback
    if (job.options.progressCallback) {
      job.options.progressCallback(job.progress);
    }

    this.emit('batch_completed', { 
      jobId: job.id, 
      batchIndex, 
      successful: successful.length, 
      failed: failed.length,
      progress: job.progress 
    });

    return { successful, failed };
  }

  /**
   * Optimize batch size based on data characteristics
   */
  private optimizeBatchSize(data: any[], requestedSize?: number): number {
    if (requestedSize) {
      return Math.min(requestedSize, data.length);
    }

    // Estimate memory usage per item
    const sampleItem = data[0];
    const estimatedItemSize = JSON.stringify(sampleItem).length * 2; // Rough estimate

    // Aim for batches that use ~10MB each
    const targetBatchMemory = 10 * 1024 * 1024; // 10MB
    const optimizedSize = Math.floor(targetBatchMemory / estimatedItemSize);

    // Clamp between reasonable bounds
    return Math.max(10, Math.min(1000, optimizedSize));
  }

  /**
   * Create batches from data array
   */
  private createBatches<T>(data: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * Create a semaphore for concurrency control
   */
  private createSemaphore(maxConcurrency: number) {
    let running = 0;
    const queue: (() => void)[] = [];

    return async <T>(fn: () => Promise<T>): Promise<T> => {
      return new Promise((resolve, reject) => {
        const run = async () => {
          running++;
          try {
            const result = await fn();
            resolve(result);
          } catch (error) {
            reject(error);
          } finally {
            running--;
            if (queue.length > 0) {
              const next = queue.shift()!;
              next();
            }
          }
        };

        if (running < maxConcurrency) {
          run();
        } else {
          queue.push(run);
        }
      });
    };
  }

  private initializeProgress(totalItems: number, totalBatches: number): BatchProgress {
    return {
      totalItems,
      processedItems: 0,
      successfulItems: 0,
      failedItems: 0,
      currentBatch: 0,
      totalBatches,
      percentComplete: 0,
      throughput: 0
    };
  }

  /**
   * Get job status and results
   */
  getJob(jobId: string): BatchJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'completed' || job.status === 'cancelled') {
      return false;
    }

    job.status = 'cancelled';
    
    // Terminate workers if using worker threads
    for (const [workerId, worker] of this.workers.entries()) {
      if (workerId.startsWith(jobId)) {
        await worker.terminate();
        this.workers.delete(workerId);
      }
    }

    this.runningJobs.delete(jobId);
    this.emit('job_cancelled', { jobId, job });
    
    console.log(`Batch job ${jobId} cancelled`);
    return true;
  }

  /**
   * Get processing metrics
   */
  getMetrics(): {
    totalJobs: number;
    runningJobs: number;
    completedJobs: number;
    failedJobs: number;
    queuedJobs: number;
    memoryUsage: number;
    averageThroughput: number;
  } {
    const jobs = Array.from(this.jobs.values());
    
    return {
      totalJobs: jobs.length,
      runningJobs: jobs.filter(j => j.status === 'running').length,
      completedJobs: jobs.filter(j => j.status === 'completed').length,
      failedJobs: jobs.filter(j => j.status === 'failed').length,
      queuedJobs: jobs.filter(j => j.status === 'pending').length,
      memoryUsage: this.currentMemoryUsage,
      averageThroughput: jobs
        .filter(j => j.status === 'completed')
        .reduce((sum, j) => sum + j.progress.throughput, 0) / 
        Math.max(jobs.filter(j => j.status === 'completed').length, 1)
    };
  }

  private startMemoryMonitoring(): void {
    this.memoryMonitor = setInterval(() => {
      const memUsage = process.memoryUsage();
      this.currentMemoryUsage = memUsage.heapUsed;
      
      // Emit memory warning if usage is high
      if (this.currentMemoryUsage > this.maxGlobalMemory * 0.8) {
        this.emit('memory_warning', { 
          current: this.currentMemoryUsage, 
          max: this.maxGlobalMemory 
        });
      }
    }, 5000); // Check every 5 seconds
  }

  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      console.log('Gracefully shutting down batch processor...');
      
      // Cancel all running jobs
      for (const jobId of this.runningJobs) {
        await this.cancelJob(jobId);
      }

      // Terminate all workers
      for (const [workerId, worker] of this.workers.entries()) {
        await worker.terminate();
        this.workers.delete(workerId);
      }

      if (this.memoryMonitor) {
        clearInterval(this.memoryMonitor);
      }

      console.log('Batch processor shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
}

// Export singleton instance
export const batchProcessor = new EnhancedBatchProcessor();
export default batchProcessor;
