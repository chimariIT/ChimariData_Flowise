import { db } from './db';
import {
  analysisSubscriptions,
  projects,
  dataUploads,
  generatedArtifacts,
  decisionAudits
} from '../shared/schema';
import { eq, and, lt, isNotNull } from 'drizzle-orm';
import { adaptiveContentEngine } from './adaptive-content-engine';
import { realtimeServer } from './realtime';
import { goalAnalysisEngine } from './goal-analysis-engine';
import { SparkProcessor } from './services/spark-processor';
import type { AnalysisSubscription, AudienceProfile } from '../shared/schema';
import cron from 'node-cron';

interface DataConnection {
  id: string;
  type: 'file_upload' | 'database' | 'api' | 'cloud_storage';
  config: any;
  refreshPolicy: {
    autoRefresh: boolean;
    maxAge: number; // in minutes
    retryAttempts: number;
  };
}

interface ChangeDetectionResult {
  hasSignificantChanges: boolean;
  significance: number; // 0-1 scale
  changedMetrics: string[];
  summary: string;
  impactedStakeholders: string[];
}

interface AnalysisExecutionResult {
  subscriptionId: string;
  executionId: string;
  results: any;
  artifacts: any[];
  changes: ChangeDetectionResult;
  executionTime: number;
  cost: number;
  status: 'success' | 'failed' | 'partial';
  error?: string;
}

export class ContinuousAnalysisEngine {
  private static instance: ContinuousAnalysisEngine;
  private scheduledJobs = new Map<string, any>();
  private sparkProcessor: SparkProcessor;

  public static getInstance(): ContinuousAnalysisEngine {
    if (!ContinuousAnalysisEngine.instance) {
      ContinuousAnalysisEngine.instance = new ContinuousAnalysisEngine();
    }
    return ContinuousAnalysisEngine.instance;
  }

  constructor() {
    this.sparkProcessor = new SparkProcessor();
    this.initializeScheduler();
  }

  /**
   * Create a new analysis subscription
   */
  async createSubscription(config: {
    userId: string;
    projectId: string;
    name: string;
    description?: string;
    mode: AnalysisSubscription['mode'];
    audienceProfiles: AudienceProfile[];
    dataConnections: DataConnection[];
  }): Promise<AnalysisSubscription> {
    const subscriptionId = this.generateSubscriptionId();

    // Validate data connections
    await this.validateDataConnections(config.dataConnections);

    // Calculate billing configuration
    const billingConfig = await this.calculateBillingConfig(config);

    const subscription: AnalysisSubscription = {
      id: subscriptionId,
      userId: config.userId,
      projectId: config.projectId,
      name: config.name,
      description: config.description ?? null,
      mode: config.mode,
      analysisConfig: (config as any).analysisConfig || {},
      audienceProfiles: config.audienceProfiles,
      dataConnections: config.dataConnections,
      status: 'active',
      lastExecution: null,
      nextExecution: this.calculateNextRun(config.mode),
      executionCount: 0,
      totalCost: '0',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Store in database
    await db.insert(analysisSubscriptions).values(subscription);

    // Set up scheduling if needed
    if ((subscription.mode as any)?.type !== 'one_time') {
      await this.scheduleAnalysis(subscription);
    }

    // Record decision audit
    await this.recordSubscriptionDecision(subscription);

    // Send confirmation to user
    await this.notifySubscriptionCreated(subscription);

    return subscription;
  }

  /**
   * Execute analysis for a subscription
   */
  async executeAnalysis(subscriptionId: string): Promise<AnalysisExecutionResult> {
    const startTime = Date.now();
    const executionId = this.generateExecutionId();

    try {
      // Get subscription details
      const subscription = await this.getSubscription(subscriptionId);
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Update status to running
      await this.updateSubscriptionStatus(subscriptionId, 'active');

      // Refresh data from all connections
      const freshData = await this.refreshAllDataSources(subscription.dataConnections as DataConnection[]);

      // Detect changes from previous analysis
      const changes = await this.detectChanges(subscriptionId, freshData);

      // Execute analysis using existing pipeline
      const analysisResults = await this.runAnalysisPipeline(
        subscription,
        freshData,
        executionId
      );

      // Generate audience-specific artifacts
      const artifacts = await this.generateAudienceArtifacts(
        subscription,
        analysisResults
      );

      // Calculate execution cost
      const cost = await this.calculateExecutionCost(subscription, analysisResults);

      // Update subscription metrics
      await this.updateSubscriptionMetrics(subscriptionId, cost);

      // Notify stakeholders if significant changes detected
      if (changes.significance > 0.2) { // Configurable threshold
        await this.notifyStakeholders(subscription, changes, artifacts);
      }

      // Schedule next execution if recurring
      if ((subscription.mode as any)?.type !== 'one_time') {
        await this.scheduleNextExecution(subscription);
      }

      const executionTime = Date.now() - startTime;

      const result: AnalysisExecutionResult = {
        subscriptionId,
        executionId,
        results: analysisResults,
        artifacts,
        changes,
        executionTime,
        cost,
        status: 'success'
      };

      await this.recordExecutionResult(result);
      return result;

    } catch (error) {
      console.error(`Analysis execution failed for subscription ${subscriptionId}:`, error);

      const executionTime = Date.now() - startTime;
      const result: AnalysisExecutionResult = {
        subscriptionId,
        executionId,
        results: null,
        artifacts: [],
        changes: { hasSignificantChanges: false, significance: 0, changedMetrics: [], summary: '', impactedStakeholders: [] },
        executionTime,
        cost: 0,
        status: 'failed',
        error: (error as Error).message || String(error)
      };

      await this.recordExecutionResult(result);
      await this.notifyExecutionError(subscriptionId, error as Error);

      return result;
    }
  }

  /**
   * Refresh data from all configured sources
   */
  private async refreshAllDataSources(dataConnections: DataConnection[]): Promise<any> {
    const refreshedData: Record<string, any> = {};

    for (const connection of dataConnections) {
      try {
        const data = await this.refreshDataConnection(connection);
        refreshedData[connection.id] = data;
      } catch (error) {
        console.error(`Failed to refresh data connection ${connection.id}:`, error);
        // Continue with other connections
      }
    }

    return refreshedData;
  }

  /**
   * Refresh individual data connection
   */
  private async refreshDataConnection(connection: DataConnection): Promise<any> {
    switch (connection.type) {
      case 'file_upload':
        return await this.refreshFileData(connection);
      case 'database':
        return await this.refreshDatabaseData(connection);
      case 'api':
        return await this.refreshAPIData(connection);
      case 'cloud_storage':
        return await this.refreshCloudStorageData(connection);
      default:
        throw new Error(`Unsupported connection type: ${connection.type}`);
    }
  }

  /**
   * Detect significant changes in data/metrics
   */
  private async detectChanges(
    subscriptionId: string,
    freshData: any
  ): Promise<ChangeDetectionResult> {
    // Get previous execution results for comparison
    const previousResults = await this.getPreviousResults(subscriptionId);
    if (!previousResults) {
      return {
        hasSignificantChanges: true,
        significance: 1.0,
        changedMetrics: ['initial_analysis'],
        summary: 'Initial analysis execution',
        impactedStakeholders: []
      };
    }

    // Use Spark for large-scale change detection (fallback implementation)
    const changeAnalysis = await this.sparkProcessor.performAnalysis(freshData, 'change_detection', {
      previousData: previousResults.data,
      thresholds: {
        numerical: 0.1, // 10% change threshold
        categorical: 0.05, // 5% change threshold
          volume: 0.15 // 15% data volume change
        },
        keyMetrics: this.getKeyMetricsForSubscription(subscriptionId)
      }
    );

    return {
      hasSignificantChanges: changeAnalysis.significance > 0.1,
      significance: changeAnalysis.significance,
      changedMetrics: changeAnalysis.changedMetrics,
      summary: changeAnalysis.summary,
      impactedStakeholders: await this.identifyImpactedStakeholders(
        subscriptionId,
        changeAnalysis.changedMetrics
      )
    };
  }

  /**
   * Run complete analysis pipeline
   */
  private async runAnalysisPipeline(
    subscription: AnalysisSubscription,
    freshData: any,
    executionId: string
  ): Promise<any> {
    // Get project context
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, subscription.projectId));

    if (!project) {
      throw new Error('Associated project not found');
    }

    // Re-run goal analysis with fresh data context
    const goalAnalysis = await goalAnalysisEngine.analyzeJourneyGoals(
      project.goals || [],
      project.questions || [],
      project.journeyType || 'guided',
      {
        columns: Object.keys(freshData),
        recordCount: this.calculateTotalRecords(freshData),
        dataTypes: this.inferDataTypes(freshData)
      }
    );

    // Execute analysis using Spark for heavy processing (fallback implementation)
    const analysisResults = await this.sparkProcessor.performAnalysis(freshData, 'comprehensive_analysis', {
      executionId,
      goals: goalAnalysis.goals,
      workComponents: goalAnalysis.workComponents,
      projectId: subscription.projectId,
      userId: subscription.userId
    });

    return {
      id: executionId,
      projectId: subscription.projectId,
      insights: analysisResults.insights,
      visualizations: analysisResults.visualizations,
      statistics: analysisResults.statistics,
      recommendations: analysisResults.recommendations,
      rawData: freshData,
      metadata: {
        analysisType: goalAnalysis.recommendedApproaches[0] || 'comprehensive',
        complexity: goalAnalysis.totalComplexityScore > 50 ? 'advanced' : 'intermediate',
        executionTime: analysisResults.executionTime,
        confidence: this.calculateAnalysisConfidence(analysisResults)
      }
    };
  }

  /**
   * Generate artifacts for all audience profiles
   */
  private async generateAudienceArtifacts(
    subscription: AnalysisSubscription,
    analysisResults: any
  ): Promise<any[]> {
    const artifacts = [];

    for (const audienceProfile of (subscription.audienceProfiles as any[] || [])) {
      try {
        const artifactSet = await adaptiveContentEngine.generateArtifacts(
          analysisResults,
          audienceProfile,
          {
            isRefresh: (subscription.executionCount || 0) > 0,
            subscriptionId: subscription.id
          }
        );

        artifacts.push({
          audienceProfile,
          artifactSet
        });
      } catch (error) {
        console.error(`Failed to generate artifacts for ${audienceProfile.role}:`, error);
        // Continue with other audience profiles
      }
    }

    return artifacts;
  }

  /**
   * Initialize the scheduler for recurring analyses
   */
  private initializeScheduler(): void {
    // Check for due subscriptions every minute
    cron.schedule('* * * * *', async () => {
      await this.processDueSubscriptions();
    });

    console.log('Continuous analysis scheduler initialized');
  }

  /**
   * Process all subscriptions that are due for execution
   */
  private async processDueSubscriptions(): Promise<void> {
    const dueSubscriptions = await db
      .select()
      .from(analysisSubscriptions)
      .where(and(
        eq(analysisSubscriptions.status, 'active'),
        lt(analysisSubscriptions.nextExecution, new Date())
      ));

    for (const subscription of dueSubscriptions) {
      try {
        await this.executeAnalysis(subscription.id);
      } catch (error) {
        console.error(`Failed to execute scheduled analysis for ${subscription.id}:`, error);
      }
    }
  }

  /**
   * Schedule analysis based on subscription mode
   */
  private async scheduleAnalysis(subscription: AnalysisSubscription): Promise<void> {
    const mode = subscription.mode as any;
    if (mode?.type === 'one_time') return;

    // For event-driven subscriptions, set up event listeners
    if (mode?.type === 'event_driven') {
      await this.setupEventTriggers(subscription);
      return;
    }

    // For recurring subscriptions, calculate next run time
    const nextRun = this.calculateNextRun(subscription.mode);
    await db
      .update(analysisSubscriptions)
      .set({ nextExecution: nextRun })
      .where(eq(analysisSubscriptions.id, subscription.id));
  }

  /**
   * Calculate next execution time
   */
  private calculateNextRun(mode: AnalysisSubscription['mode']): Date {
    const now = new Date();
    const modeAny = mode as any;

    if (modeAny?.type === 'one_time') {
      return now; // Execute immediately
    }

    if (!modeAny?.schedule) {
      return new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default to daily
    }

    const schedule = modeAny.schedule;
    let nextRun = new Date(now);

    switch (schedule.frequency) {
      case 'daily':
        nextRun.setDate(nextRun.getDate() + 1);
        break;
      case 'weekly':
        const daysUntilNext = (schedule.dayOfWeek || 1) - nextRun.getDay();
        nextRun.setDate(nextRun.getDate() + (daysUntilNext > 0 ? daysUntilNext : daysUntilNext + 7));
        break;
      case 'monthly':
        nextRun.setMonth(nextRun.getMonth() + 1);
        nextRun.setDate(schedule.dayOfMonth || 1);
        break;
      case 'quarterly':
        nextRun.setMonth(nextRun.getMonth() + 3);
        nextRun.setDate(schedule.dayOfMonth || 1);
        break;
    }

    // Set specific time if provided
    if (schedule.time) {
      const [hours, minutes] = schedule.time.split(':');
      nextRun.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    }

    return nextRun;
  }

  /**
   * Helper methods
   */
  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private async getSubscription(subscriptionId: string): Promise<AnalysisSubscription | null> {
    const [subscription] = await db
      .select()
      .from(analysisSubscriptions)
      .where(eq(analysisSubscriptions.id, subscriptionId));

    return subscription || null;
  }

  private async validateDataConnections(connections: DataConnection[]): Promise<void> {
    for (const connection of connections) {
      // Validate connection configuration
      await this.validateConnection(connection);
    }
  }

  private async calculateBillingConfig(config: any): Promise<any> {
    const baseCost = this.calculateBaseCost(config.mode.type, config.audienceProfiles.length);
    const additionalCosts = {
      dataProcessing: config.dataConnections.length * 5, // $5 per data connection
      audienceMultiplier: Math.max(0, config.audienceProfiles.length - 1) * 10, // $10 per additional audience
    };

    return {
      model: config.mode.type === 'one_time' ? 'per_analysis' : 'subscription',
      baseCost,
      additionalCosts,
      billingCycle: 'monthly'
    };
  }

  // Placeholder implementations for helper methods
  private async validateConnection(connection: DataConnection): Promise<void> {
    // Implement connection validation logic
  }

  private calculateBaseCost(type: string, audienceCount: number): number {
    const baseCosts = {
      one_time: 49,
      recurring: 99,
      continuous: 199,
      event_driven: 149
    };
    return baseCosts[type as keyof typeof baseCosts] || 49;
  }

  private async refreshFileData(connection: DataConnection): Promise<any> {
    // Implement file data refresh
    return {};
  }

  private async refreshDatabaseData(connection: DataConnection): Promise<any> {
    // Implement database data refresh
    return {};
  }

  private async refreshAPIData(connection: DataConnection): Promise<any> {
    // Implement API data refresh
    return {};
  }

  private async refreshCloudStorageData(connection: DataConnection): Promise<any> {
    // Implement cloud storage data refresh
    return {};
  }

  private async getPreviousResults(subscriptionId: string): Promise<any> {
    // Get previous execution results for comparison
    return null;
  }

  private getKeyMetricsForSubscription(subscriptionId: string): string[] {
    // Return key metrics to monitor for changes
    return ['revenue', 'conversion_rate', 'customer_count'];
  }

  private async identifyImpactedStakeholders(subscriptionId: string, changedMetrics: string[]): Promise<string[]> {
    // Identify which stakeholders should be notified based on changed metrics
    return [];
  }

  private calculateTotalRecords(data: any): number {
    // Calculate total record count from all data sources
    const values = Object.values(data || {}) as any[];
    return values.reduce((sum: number, dataset: any) => {
      return sum + (Array.isArray(dataset) ? dataset.length : 0);
    }, 0);
  }

  private inferDataTypes(data: any): Record<string, string> {
    // Infer data types from fresh data
    return {};
  }

  private calculateAnalysisConfidence(results: any): number {
    // Calculate confidence score for analysis results
    return 0.85;
  }

  private async updateSubscriptionStatus(subscriptionId: string, status: string): Promise<void> {
    await db
      .update(analysisSubscriptions)
      .set({ status, updatedAt: new Date() })
      .where(eq(analysisSubscriptions.id, subscriptionId));
  }

  private async updateSubscriptionMetrics(subscriptionId: string, cost: number): Promise<void> {
    const [subscription] = await db
      .select()
      .from(analysisSubscriptions)
      .where(eq(analysisSubscriptions.id, subscriptionId));

    if (subscription) {
      await db
        .update(analysisSubscriptions)
        .set({
          executionCount: subscription.executionCount + 1,
          totalCost: subscription.totalCost + cost,
          lastRunAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(analysisSubscriptions.id, subscriptionId));
    }
  }

  private async calculateExecutionCost(subscription: AnalysisSubscription, results: any): Promise<number> {
    // Calculate cost based on data volume, complexity, and audience count
    const billingConfig = (subscription as any).billingConfig || {};
    const baseCost = billingConfig.baseCost || 10;
    const additionalCosts = billingConfig.additionalCosts ? 
      Object.values(billingConfig.additionalCosts as Record<string, number>).reduce((sum, cost) => sum + (cost || 0), 0) : 0;
    return baseCost + additionalCosts;
  }

  private async scheduleNextExecution(subscription: AnalysisSubscription): Promise<void> {
    const nextRun = this.calculateNextRun(subscription.mode);
    await db
      .update(analysisSubscriptions)
      .set({ nextExecution: nextRun })
      .where(eq(analysisSubscriptions.id, subscription.id));
  }

  private async setupEventTriggers(subscription: AnalysisSubscription): Promise<void> {
    // Set up event-driven triggers
    // This would integrate with webhooks, file watchers, etc.
  }

  private async recordSubscriptionDecision(subscription: AnalysisSubscription): Promise<void> {
    const mode = subscription.mode as any;
    const audienceProfiles = subscription.audienceProfiles as any[] || [];
    await db.insert(decisionAudits).values({
      id: `decision_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
      projectId: subscription.projectId,
      agent: 'system',
      decisionType: 'analysis_approach',
      decision: `Created ${mode?.type || 'continuous'} analysis subscription`,
      reasoning: `Configured for ${audienceProfiles.length} audience(s)`,
      alternatives: ['one_time_analysis', 'manual_refresh'],
      confidence: 90,
      context: { subscription },
      impact: 'high',
      reversible: true,
      timestamp: new Date()
    });
  }

  private async recordExecutionResult(result: AnalysisExecutionResult): Promise<void> {
    // Record execution results for audit trail
    console.log(`Analysis execution ${result.status} for subscription ${result.subscriptionId}`);
  }

  private async notifySubscriptionCreated(subscription: AnalysisSubscription): Promise<void> {
    if (realtimeServer) {
      realtimeServer.broadcastToUser(subscription.userId, {
        type: 'status_change',
        sourceType: 'streaming',
        sourceId: 'continuous_analysis_engine',
        userId: subscription.userId,
        timestamp: new Date(),
        data: {
          subscriptionId: subscription.id,
          name: subscription.name,
          nextRunAt: subscription.nextExecution
        }
      });
    }
  }

  private async notifyStakeholders(
    subscription: AnalysisSubscription,
    changes: ChangeDetectionResult,
    artifacts: any[]
  ): Promise<void> {
    if (realtimeServer) {
      realtimeServer.broadcastToUser(subscription.userId, {
        type: 'status_change',
        sourceType: 'streaming',
        sourceId: 'continuous_analysis_engine',
        userId: subscription.userId,
        timestamp: new Date(),
        data: {
          subscriptionId: subscription.id,
          changes,
          artifactCount: artifacts.length
        }
      });
    }
  }

  private async notifyExecutionError(subscriptionId: string, error: Error): Promise<void> {
    const subscription = await this.getSubscription(subscriptionId);
    if (subscription && realtimeServer) {
      realtimeServer.broadcastToUser(subscription.userId, {
        type: 'error',
        sourceType: 'streaming',
        sourceId: 'continuous_analysis_engine',
        userId: subscription.userId,
        timestamp: new Date(),
        data: {
          subscriptionId,
          error: error.message
        }
      });
    }
  }

  /**
   * Public API methods
   */
  async pauseSubscription(subscriptionId: string): Promise<void> {
    await db
      .update(analysisSubscriptions)
      .set({ status: 'paused', updatedAt: new Date() })
      .where(eq(analysisSubscriptions.id, subscriptionId));
  }

  async resumeSubscription(subscriptionId: string): Promise<void> {
    const subscription = await this.getSubscription(subscriptionId);
    if (subscription) {
      await db
        .update(analysisSubscriptions)
        .set({
          status: 'active',
          nextExecution: this.calculateNextRun(subscription.mode),
          updatedAt: new Date()
        })
        .where(eq(analysisSubscriptions.id, subscriptionId));
    }
  }

  async deleteSubscription(subscriptionId: string): Promise<void> {
    await db
      .update(analysisSubscriptions)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(analysisSubscriptions.id, subscriptionId));
  }

  async getUserSubscriptions(userId: string): Promise<AnalysisSubscription[]> {
    return db
      .select()
      .from(analysisSubscriptions)
      .where(eq(analysisSubscriptions.userId, userId));
  }
}

export const continuousAnalysisEngine = ContinuousAnalysisEngine.getInstance();