/**
 * Transformation Queue Service
 *
 * Manages background transformation jobs with priority queue, retry logic, and progress tracking.
 * Integrates with StreamingTransformer for large dataset processing.
 *
 * Features:
 * - Priority-based job scheduling
 * - Automatic retry on failure (up to 3 attempts)
 * - Real-time progress updates via WebSocket
 * - Job cancellation support
 * - Persistent queue state (survives server restart)
 */

import { EventEmitter } from 'events';
import { streamingTransformer, TransformationConfig, StreamingOptions, TransformationProgress } from './streaming-transformer';
import * as fs from 'fs';
import * as path from 'path';

export interface TransformationJob {
    jobId: string;
    projectId: string;
    userId: string;
    inputFilePath: string;
    outputFilePath: string;
    transformations: TransformationConfig[];
    options?: Partial<StreamingOptions>;
    priority: 'low' | 'normal' | 'high';
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    progress?: TransformationProgress;
    error?: string;
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    retryCount: number;
    maxRetries: number;
}

export interface QueueStats {
    totalJobs: number;
    queuedJobs: number;
    runningJobs: number;
    completedJobs: number;
    failedJobs: number;
    averageProcessingTime: number; // milliseconds
}

export class TransformationQueue extends EventEmitter {
    private jobs = new Map<string, TransformationJob>();
    private runningJobs = new Set<string>();
    private maxConcurrent: number;
    private processingInterval?: NodeJS.Timeout;
    private statsHistory: Array<{ jobId: string; duration: number }> = [];

    constructor(maxConcurrent: number = 3) {
        super();
        this.maxConcurrent = maxConcurrent;
        this.startProcessing();
    }

    /**
     * Add a new transformation job to the queue
     */
    async enqueue(job: Omit<TransformationJob, 'jobId' | 'status' | 'createdAt' | 'retryCount'>): Promise<string> {
        const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const fullJob: TransformationJob = {
            ...job,
            jobId,
            status: 'queued',
            createdAt: new Date(),
            retryCount: 0,
            maxRetries: job.maxRetries || 3
        };

        this.jobs.set(jobId, fullJob);

        console.log(`📥 [Queue] Job ${jobId} added to queue (priority: ${fullJob.priority})`);
        this.emit('jobQueued', fullJob);

        // Trigger processing
        this.processQueue();

        return jobId;
    }

    /**
     * Get job status
     */
    getJob(jobId: string): TransformationJob | undefined {
        return this.jobs.get(jobId);
    }

    /**
     * Get all jobs for a project
     */
    getProjectJobs(projectId: string): TransformationJob[] {
        return Array.from(this.jobs.values()).filter(job => job.projectId === projectId);
    }

    /**
     * Cancel a job
     */
    async cancelJob(jobId: string): Promise<boolean> {
        const job = this.jobs.get(jobId);
        if (!job) {
            return false;
        }

        if (job.status === 'running') {
            // Cannot cancel running jobs - need to implement worker cancellation
            console.warn(`⚠️  [Queue] Cannot cancel running job ${jobId}`);
            return false;
        }

        if (job.status === 'queued') {
            job.status = 'cancelled';
            job.completedAt = new Date();
            console.log(`🚫 [Queue] Job ${jobId} cancelled`);
            this.emit('jobCancelled', job);
            return true;
        }

        return false;
    }

    /**
     * Retry a failed job
     */
    async retryJob(jobId: string): Promise<boolean> {
        const job = this.jobs.get(jobId);
        if (!job || job.status !== 'failed') {
            return false;
        }

        job.status = 'queued';
        job.error = undefined;
        job.progress = undefined;
        job.retryCount++;

        console.log(`🔄 [Queue] Job ${jobId} re-queued (attempt ${job.retryCount + 1}/${job.maxRetries})`);
        this.emit('jobRetried', job);

        this.processQueue();
        return true;
    }

    /**
     * Get queue statistics
     */
    getStats(): QueueStats {
        const jobs = Array.from(this.jobs.values());

        const averageTime = this.statsHistory.length > 0
            ? this.statsHistory.reduce((sum, stat) => sum + stat.duration, 0) / this.statsHistory.length
            : 0;

        return {
            totalJobs: jobs.length,
            queuedJobs: jobs.filter(j => j.status === 'queued').length,
            runningJobs: jobs.filter(j => j.status === 'running').length,
            completedJobs: jobs.filter(j => j.status === 'completed').length,
            failedJobs: jobs.filter(j => j.status === 'failed').length,
            averageProcessingTime: averageTime
        };
    }

    /**
     * Clear completed and failed jobs older than specified age
     */
    cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
        const now = Date.now();
        let removed = 0;

        for (const [jobId, job] of this.jobs.entries()) {
            if (
                (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') &&
                job.completedAt &&
                now - job.completedAt.getTime() > maxAgeMs
            ) {
                this.jobs.delete(jobId);
                removed++;
            }
        }

        if (removed > 0) {
            console.log(`🧹 [Queue] Cleaned up ${removed} old jobs`);
        }

        return removed;
    }

    /**
     * Start processing queue
     */
    private startProcessing(): void {
        // Process queue every 5 seconds
        this.processingInterval = setInterval(() => {
            this.processQueue();
        }, 5000);

        console.log('🚀 [Queue] Started processing transformation queue');
    }

    /**
     * Stop processing queue
     */
    stop(): void {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = undefined;
        }
        console.log('🛑 [Queue] Stopped processing transformation queue');
    }

    /**
     * Process queued jobs
     */
    private async processQueue(): Promise<void> {
        // Check if we can process more jobs
        if (this.runningJobs.size >= this.maxConcurrent) {
            return;
        }

        // Get queued jobs sorted by priority
        const queuedJobs = Array.from(this.jobs.values())
            .filter(job => job.status === 'queued')
            .sort((a, b) => {
                // Priority order: high > normal > low
                const priorityOrder = { high: 3, normal: 2, low: 1 };
                const diff = priorityOrder[b.priority] - priorityOrder[a.priority];
                if (diff !== 0) return diff;

                // If same priority, sort by creation time (FIFO)
                return a.createdAt.getTime() - b.createdAt.getTime();
            });

        // Process jobs up to max concurrent limit
        const availableSlots = this.maxConcurrent - this.runningJobs.size;
        const jobsToProcess = queuedJobs.slice(0, availableSlots);

        for (const job of jobsToProcess) {
            this.processJob(job).catch(error => {
                console.error(`❌ [Queue] Unexpected error processing job ${job.jobId}:`, error);
            });
        }
    }

    /**
     * Process a single job
     */
    private async processJob(job: TransformationJob): Promise<void> {
        // Mark job as running
        job.status = 'running';
        job.startedAt = new Date();
        this.runningJobs.add(job.jobId);

        console.log(`▶️  [Queue] Processing job ${job.jobId} (${job.priority} priority)`);
        this.emit('jobStarted', job);

        const startTime = Date.now();

        try {
            // Setup progress callback
            const options: Partial<StreamingOptions> = {
                ...job.options,
                reportProgress: true,
                onProgress: (progress) => {
                    job.progress = progress;
                    this.emit('jobProgress', { jobId: job.jobId, progress });
                }
            };

            // Execute transformation
            const finalProgress = await streamingTransformer.transformFile(
                job.inputFilePath,
                job.outputFilePath,
                job.transformations,
                options
            );

            // Check if there were errors
            if (finalProgress.errors.length > 0) {
                throw new Error(`Transformation completed with ${finalProgress.errors.length} errors`);
            }

            // Mark as completed
            job.status = 'completed';
            job.completedAt = new Date();
            job.progress = finalProgress;

            const duration = Date.now() - startTime;
            this.statsHistory.push({ jobId: job.jobId, duration });

            // Keep only last 100 stats
            if (this.statsHistory.length > 100) {
                this.statsHistory.shift();
            }

            console.log(`✅ [Queue] Job ${job.jobId} completed in ${(duration / 1000).toFixed(2)}s`);
            this.emit('jobCompleted', job);

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`❌ [Queue] Job ${job.jobId} failed:`, errorMsg);

            job.error = errorMsg;

            // Retry if under max retries
            if (job.retryCount < job.maxRetries) {
                job.status = 'queued';
                job.retryCount++;
                console.log(`🔄 [Queue] Job ${job.jobId} will retry (attempt ${job.retryCount + 1}/${job.maxRetries})`);
                this.emit('jobRetrying', job);
            } else {
                job.status = 'failed';
                job.completedAt = new Date();
                console.log(`💥 [Queue] Job ${job.jobId} failed permanently after ${job.maxRetries} attempts`);
                this.emit('jobFailed', job);
            }

        } finally {
            this.runningJobs.delete(job.jobId);
        }
    }

    /**
     * Save queue state to disk (for persistence across restarts)
     */
    async saveState(filePath: string): Promise<void> {
        const state = {
            jobs: Array.from(this.jobs.entries()),
            savedAt: new Date()
        };

        await fs.promises.writeFile(filePath, JSON.stringify(state, null, 2));
        console.log(`💾 [Queue] State saved to ${filePath}`);
    }

    /**
     * Load queue state from disk
     */
    async loadState(filePath: string): Promise<void> {
        try {
            const data = await fs.promises.readFile(filePath, 'utf-8');
            const state = JSON.parse(data);

            this.jobs = new Map(state.jobs.map(([id, job]: [string, any]) => [
                id,
                {
                    ...job,
                    createdAt: new Date(job.createdAt),
                    startedAt: job.startedAt ? new Date(job.startedAt) : undefined,
                    completedAt: job.completedAt ? new Date(job.completedAt) : undefined
                }
            ]));

            // Reset running jobs to queued (they were interrupted)
            for (const job of this.jobs.values()) {
                if (job.status === 'running') {
                    job.status = 'queued';
                    console.log(`🔄 [Queue] Job ${job.jobId} was interrupted, re-queuing`);
                }
            }

            console.log(`📂 [Queue] Loaded ${this.jobs.size} jobs from ${filePath}`);

        } catch (error) {
            if ((error as any).code === 'ENOENT') {
                console.log('📂 [Queue] No saved state found, starting fresh');
            } else {
                console.error('❌ [Queue] Failed to load state:', error);
            }
        }
    }
}

// Export singleton instance
let queueInstance: TransformationQueue | null = null;

export function getTransformationQueue(): TransformationQueue {
    if (!queueInstance) {
        const maxConcurrent = parseInt(process.env.TRANSFORMATION_MAX_CONCURRENT || '3', 10);
        queueInstance = new TransformationQueue(maxConcurrent);
    }
    return queueInstance;
}

export async function initializeTransformationQueue(): Promise<void> {
    const queue = getTransformationQueue();

    // Load persisted state if available
    const stateFile = path.join(process.cwd(), 'data', 'transformation-queue-state.json');
    await queue.loadState(stateFile);

    // Save state periodically (every 5 minutes)
    setInterval(async () => {
        try {
            await queue.saveState(stateFile);
        } catch (error) {
            console.error('❌ [Queue] Failed to save state:', error);
        }
    }, 5 * 60 * 1000);

    console.log('✅ Transformation queue initialized');
}
