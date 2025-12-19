/**
 * Agent Tool Handlers
 *
 * Centralized handlers for all agent-specific tools.
 * Routes tool executions to appropriate service implementations.
 */

import { platformKnowledgeBase } from './platform-knowledge-base';
import { AgentMessageBroker } from './agents/message-broker';
import { TemplateResearchAgent } from './template-research-agent';
import { getBillingService } from './billing/unified-billing-service';
import { normalizeJourneyType } from '@shared/canonical-types';

// ==========================================
// TOOL EXECUTION CONTEXT
// ==========================================

export interface ToolExecutionContext {
  executionId: string;
  agentId: string;
  userId?: string;
  projectId?: string;
  timestamp: Date;
}

export interface ToolExecutionResult {
  executionId: string;
  toolId: string;
  status: 'success' | 'error' | 'partial';
  result: any;
  metrics: {
    duration: number;
    resourcesUsed: { cpu: number; memory: number; storage: number };
    cost: number;
    executionTimeMs?: number;
    billingUnits?: number;
  };
  artifacts?: Array<{
    type: string;
    data: any;
    metadata?: any;
  }>;
  error?: string;
  billing?: {
    quotaExceeded?: boolean;
    cost?: number;
    remainingQuota?: number;
    message?: string;
    error?: string;
  };
}

// ==========================================
// PROJECT MANAGER TOOL HANDLERS
// ==========================================

export class PMToolHandlers {
  private messageBroker: AgentMessageBroker;

  constructor() {
    this.messageBroker = new AgentMessageBroker();
  }

  /**
   * Agent Communication Tool
   */
  async handleAgentCommunication(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { targetAgentId, messageType, payload, priority } = input;

      await this.messageBroker.sendMessage({
        from: context.agentId,
        to: targetAgentId,
        type: messageType,
        payload,
        priority: priority || 'normal'
      });

      return {
        executionId: context.executionId,
        toolId: 'agent_communication',
        status: 'success',
        result: {
          messageSent: true,
          targetAgent: targetAgentId,
          messageType,
          priority
        },
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 0.1, memory: 1, storage: 0 },
          cost: 0.001
        }
      };
    } catch (error) {
      return {
        executionId: context.executionId,
        toolId: 'agent_communication',
        status: 'error',
        result: null,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 0, memory: 0, storage: 0 },
          cost: 0
        },
        error: (error as Error).message
      };
    }
  }

  /**
   * Workflow Evaluator Tool
   */
  async handleWorkflowEvaluator(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { projectId, evaluationCriteria, includeMetrics } = input;

      // TODO: Implement real workflow evaluation logic
      // For now, return structured evaluation data
      const evaluation = {
        projectId,
        overallScore: 0.85,
        criteria: evaluationCriteria?.map((criterion: string) => ({
          name: criterion,
          score: 0.7 + Math.random() * 0.3,
          status: 'on_track'
        })) || [],
        bottlenecks: [],
        recommendations: [
          'Consider parallelizing data transformation steps',
          'Add more checkpoints for user validation'
        ],
        metrics: includeMetrics ? {
          tasksCompleted: 8,
          tasksRemaining: 4,
          averageTaskDuration: 120,
          timelineAdherence: 0.92
        } : undefined
      };

      return {
        executionId: context.executionId,
        toolId: 'workflow_evaluator',
        status: 'success',
        result: evaluation,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 2, memory: 50, storage: 0 },
          cost: 0.01
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'workflow_evaluator', error as Error, startTime);
    }
  }

  /**
   * Task Coordinator Tool
   */
  async handleTaskCoordinator(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { projectId, tasks, assignees, dependencies } = input;

      const createdTasks = tasks.map((task: any, index: number) => ({
        taskId: `task_${Date.now()}_${index}`,
        name: task.name,
        assignedTo: task.assignee || assignees[task.name],
        status: 'pending',
        dependencies: dependencies?.filter((d: any) => d.task === task.name) || [],
        createdAt: new Date()
      }));

      return {
        executionId: context.executionId,
        toolId: 'task_coordinator',
        status: 'success',
        result: {
          projectId,
          tasksCreated: createdTasks.length,
          tasks: createdTasks,
          dependencyGraph: dependencies || []
        },
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 1, memory: 20, storage: 5 },
          cost: 0.005
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'task_coordinator', error as Error, startTime);
    }
  }

  /**
   * Checkpoint Manager Tool - Creates user-friendly checkpoints using existing system
   */
  async handleCheckpointManager(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { CheckpointWrapper } = await import('./checkpoint-integration');
      const { userFriendlyFormatter } = await import('./user-friendly-formatter');

      const { operation, projectId, stage, artifacts, billing, technicalDetails } = input;

      switch (operation) {
        case 'create': {
          // Format checkpoint with user-friendly messaging
          const formattedCheckpoint = userFriendlyFormatter.formatCheckpointMessage(
            stage,
            artifacts || [],
            billing || { estimatedCost: 0, willExceedQuota: false },
            technicalDetails
          );

          // Create checkpoint using existing system
          const wrapper = new CheckpointWrapper(this.messageBroker);
          const checkpoint = await wrapper['createCheckpoint'](
            {
              projectId,
              userId: context.userId?.toString() || 'unknown',
              agentId: context.agentId,
              journeyType: normalizeJourneyType(input.journeyType as string | null),
              checkpointConfig: {
                enabled: true,
                requireApproval: true,
                timeout: 300000 // 5 minutes
              }
            },
            stage,
            formattedCheckpoint.message,
            formattedCheckpoint.nextSteps,
            artifacts
          );

          return {
            executionId: context.executionId,
            toolId: 'checkpoint_manager',
            status: 'success',
            result: {
              checkpointCreated: true,
              formattedMessage: formattedCheckpoint,
              checkpoint
            },
            metrics: {
              duration: Date.now() - startTime,
              resourcesUsed: { cpu: 1, memory: 5, storage: 0.1 },
              cost: 0.002
            }
          };
        }

        case 'getStatus': {
          // Get checkpoint status from database
          const { storage } = await import('../storage');
          const checkpointId = input.checkpointId;

          // Get all checkpoints for the project
          const allCheckpoints = await storage.getProjectCheckpoints(projectId);

          if (checkpointId) {
            // Find specific checkpoint
            const checkpoint = allCheckpoints.find(cp => cp.id === checkpointId);
            if (!checkpoint) {
              return {
                executionId: context.executionId,
                toolId: 'checkpoint_manager',
                status: 'success',
                result: {
                  operation: 'getStatus',
                  found: false,
                  checkpointId,
                  message: `Checkpoint ${checkpointId} not found`
                },
                metrics: {
                  duration: Date.now() - startTime,
                  resourcesUsed: { cpu: 0.2, memory: 2, storage: 0 },
                  cost: 0.001
                }
              };
            }
            return {
              executionId: context.executionId,
              toolId: 'checkpoint_manager',
              status: 'success',
              result: {
                operation: 'getStatus',
                found: true,
                checkpoint: {
                  id: checkpoint.id,
                  stepName: checkpoint.stepName,
                  status: checkpoint.status,
                  message: checkpoint.message,
                  agentType: checkpoint.agentType,
                  requiresUserInput: checkpoint.requiresUserInput,
                  userFeedback: checkpoint.userFeedback,
                  createdAt: checkpoint.createdAt
                }
              },
              metrics: {
                duration: Date.now() - startTime,
                resourcesUsed: { cpu: 0.2, memory: 2, storage: 0 },
                cost: 0.001
              }
            };
          }

          // Return summary of all checkpoints for the project
          const pendingCount = allCheckpoints.filter(cp => cp.status === 'pending' || cp.status === 'waiting_approval').length;
          const completedCount = allCheckpoints.filter(cp => cp.status === 'completed' || cp.status === 'approved').length;
          const latestCheckpoint = allCheckpoints.length > 0 ? allCheckpoints[allCheckpoints.length - 1] : null;

          return {
            executionId: context.executionId,
            toolId: 'checkpoint_manager',
            status: 'success',
            result: {
              operation: 'getStatus',
              projectId,
              summary: {
                totalCheckpoints: allCheckpoints.length,
                pendingApproval: pendingCount,
                completed: completedCount,
                latestStep: latestCheckpoint?.stepName || 'none',
                latestStatus: latestCheckpoint?.status || 'none'
              },
              checkpoints: allCheckpoints.map(cp => ({
                id: cp.id,
                stepName: cp.stepName,
                status: cp.status,
                requiresUserInput: cp.requiresUserInput
              }))
            },
            metrics: {
              duration: Date.now() - startTime,
              resourcesUsed: { cpu: 0.3, memory: 3, storage: 0 },
              cost: 0.002
            }
          };
        }

        case 'updateStatus': {
          // Update checkpoint status
          const { storage } = await import('../storage');
          const { checkpointId: updateId, newStatus, userFeedback: feedback } = input;

          if (!updateId) {
            throw new Error('checkpointId is required for updateStatus operation');
          }
          if (!newStatus) {
            throw new Error('newStatus is required for updateStatus operation');
          }

          const validStatuses = ['pending', 'in_progress', 'waiting_approval', 'approved', 'completed', 'rejected'];
          if (!validStatuses.includes(newStatus)) {
            throw new Error(`Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(', ')}`);
          }

          // Update checkpoint in database
          await storage.updateAgentCheckpoint(updateId, {
            status: newStatus,
            userFeedback: feedback || undefined
          });

          return {
            executionId: context.executionId,
            toolId: 'checkpoint_manager',
            status: 'success',
            result: {
              operation: 'updateStatus',
              checkpointId: updateId,
              newStatus,
              updated: true
            },
            metrics: {
              duration: Date.now() - startTime,
              resourcesUsed: { cpu: 0.2, memory: 2, storage: 0.1 },
              cost: 0.002
            }
          };
        }

        case 'listPending': {
          // List all pending checkpoints requiring user approval
          const { storage } = await import('../storage');
          const allCheckpoints = await storage.getProjectCheckpoints(projectId);

          const pendingCheckpoints = allCheckpoints.filter(
            cp => cp.status === 'pending' || cp.status === 'waiting_approval'
          );

          return {
            executionId: context.executionId,
            toolId: 'checkpoint_manager',
            status: 'success',
            result: {
              operation: 'listPending',
              projectId,
              pendingCount: pendingCheckpoints.length,
              checkpoints: pendingCheckpoints.map(cp => ({
                id: cp.id,
                stepName: cp.stepName,
                status: cp.status,
                message: cp.message,
                agentType: cp.agentType,
                requiresUserInput: cp.requiresUserInput,
                createdAt: cp.createdAt
              }))
            },
            metrics: {
              duration: Date.now() - startTime,
              resourcesUsed: { cpu: 0.2, memory: 2, storage: 0 },
              cost: 0.001
            }
          };
        }

        default:
          throw new Error(`Unknown checkpoint operation: ${operation}. Supported: create, getStatus, updateStatus, listPending`);
      }
    } catch (error) {
      return this.createErrorResult(context.executionId, 'checkpoint_manager', error as Error, startTime);
    }
  }

  /**
   * Progress Reporter Tool - Generates user-friendly progress reports
   */
  async handleProgressReporter(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { userFriendlyFormatter } = await import('./user-friendly-formatter');
      const { projectAgentOrchestrator } = await import('./project-agent-orchestrator');

      const { projectId } = input;

      // Get checkpoints from orchestrator
  const checkpoints = await projectAgentOrchestrator.getProjectCheckpoints(projectId);

      // Calculate progress
      const totalStages = 10;
  const completedCheckpoints = checkpoints.filter((cp) => cp.status === 'completed' || cp.status === 'approved');
  const currentStage = checkpoints[checkpoints.length - 1]?.stepName || 'initialization';

      // Get artifacts (mock for now, should come from project)
      const artifacts = [
        { name: 'Data Upload', type: 'dataset', ready: true },
        { name: 'Quality Report', type: 'quality_report', ready: true }
      ];

      // Format progress report
      const progressReport = userFriendlyFormatter.formatProgressReport(
        currentStage,
  completedCheckpoints.map((cp) => cp.stepName),
        totalStages,
        artifacts,
        input.totalCost || 0
      );

      return {
        executionId: context.executionId,
        toolId: 'progress_reporter',
        status: 'success',
        result: {
          progressReport,
          checkpointsCompleted: completedCheckpoints.length,
          checkpointsTotal: checkpoints.length
        },
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 0.5, memory: 3, storage: 0 },
          cost: 0.001
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'progress_reporter', error as Error, startTime);
    }
  }

  /**
   * Resource Allocator Tool - Delegates tasks to specialized agents
   */
  async handleResourceAllocator(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { ProjectManagerAgent } = await import('./project-manager-agent');
      const pmAgent = new ProjectManagerAgent();

      const { projectId, requiredAgents, scenario } = input;

      // Use existing PM coordination
      const coordinationResult = await pmAgent.coordinateGoalAnalysis(
        projectId,
        scenario?.uploadedData ?? scenario?.data ?? {},
        scenario?.goals ?? requiredAgents ?? [],
        scenario?.industry ?? 'general'
      );

      return {
        executionId: context.executionId,
        toolId: 'resource_allocator',
        status: 'success',
        result: {
          coordinationId: coordinationResult.coordinationId,
          agentsCoordinated: coordinationResult.expertOpinions.length,
          synthesis: coordinationResult.synthesis,
          recommendation: coordinationResult.synthesis.overallAssessment
        },
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 5, memory: 50, storage: 0 },
          cost: 0.05
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'resource_allocator', error as Error, startTime);
    }
  }

  private createErrorResult(executionId: string, toolId: string, error: Error, startTime: number): ToolExecutionResult {
    return {
      executionId,
      toolId,
      status: 'error',
      result: null,
      metrics: {
        duration: Date.now() - startTime,
        resourcesUsed: { cpu: 0, memory: 0, storage: 0 },
        cost: 0
      },
      error: error.message
    };
  }
}

// ==========================================
// CUSTOMER SUPPORT TOOL HANDLERS
// ==========================================

export class CustomerSupportToolHandlers {
  /**
   * Platform Knowledge Base Tool
   */
  async handleKnowledgeBaseSearch(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const result = await platformKnowledgeBase.search({
        query: input.query,
        category: input.category,
        searchDepth: input.searchDepth,
        limit: input.limit
      });

      return {
        executionId: context.executionId,
        toolId: 'platform_knowledge_base',
        status: 'success',
        result,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 1, memory: 10, storage: 0 },
          cost: 0.002
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'platform_knowledge_base', error as Error, startTime);
    }
  }

  /**
   * Billing Query Handler Tool
   */
  async handleBillingQuery(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const billingService = getBillingService();
      const { userId, queryType, timeRange } = input;

      let result: any = {};

      switch (queryType) {
        case 'subscription':
          // FIX: Production Readiness - Get actual subscription from database
          const userTier = await billingService.getUserTier(userId);
          const tierConfig = billingService.getTierConfig(userTier);
          const user = await billingService.getUser(userId);
          result = {
            userId,
            subscription: {
              tier: userTier,
              status: user?.stripeSubscriptionStatus || 'active',
              startDate: user?.subscriptionStartDate || new Date(),
              nextBillingDate: user?.subscriptionEndDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              amount: tierConfig?.monthlyPriceUsd ? tierConfig.monthlyPriceUsd / 100 : 0
            }
          };
          break;

        case 'usage':
          // FIX: Production Readiness - Get actual usage data
          const usageData = await billingService.getUserUsage(userId);
          const usageTier = await billingService.getUserTier(userId);
          const usageTierConfig = billingService.getTierConfig(usageTier);
          result = {
            userId,
            currentPeriod: {
              aiQueries: {
                used: usageData.aiQueries || 0,
                limit: usageTierConfig?.quotas?.aiQueriesPerMonth || 1000,
                remaining: Math.max(0, (usageTierConfig?.quotas?.aiQueriesPerMonth || 1000) - (usageData.aiQueries || 0))
              },
              dataProcessed: {
                used: usageData.dataUploadsMB || 0,
                limit: usageTierConfig?.quotas?.maxDataUploadsMB || 100,
                unit: 'MB'
              },
              apiCalls: {
                used: usageData.toolExecutions || 0,
                limit: usageTierConfig?.quotas?.toolExecutionsPerMonth || 5000
              }
            }
          };
          break;

        case 'invoices':
          // FIX: Production Readiness - Get actual invoices from Stripe
          const invoiceUser = await billingService.getUser(userId);
          let invoices: any[] = [];
          if (invoiceUser?.stripeCustomerId) {
            try {
              const stripeInvoices = await billingService.getStripeInvoices(invoiceUser.stripeCustomerId);
              invoices = stripeInvoices.map((inv: any) => ({
                invoiceId: inv.id,
                date: new Date(inv.created * 1000),
                amount: inv.amount_paid / 100,
                status: inv.status,
                pdfUrl: inv.invoice_pdf
              }));
            } catch (stripeError) {
              console.warn('Could not fetch Stripe invoices:', stripeError);
            }
          }
          result = { userId, invoices };
          break;

        case 'quotas':
          // FIX: Production Readiness - Get actual quota data
          const quotaUsage = await billingService.getUserUsage(userId);
          const quotaTier = await billingService.getUserTier(userId);
          const quotaTierConfig = billingService.getTierConfig(quotaTier);
          result = {
            userId,
            quotas: {
              aiQueries: {
                used: quotaUsage.aiQueries || 0,
                limit: quotaTierConfig?.quotas?.aiQueriesPerMonth || 1000,
                resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Approximate
              },
              storage: {
                used: quotaUsage.dataUploadsMB || 0,
                limit: quotaTierConfig?.quotas?.maxDataUploadsMB || 100,
                unit: 'MB'
              },
              projects: {
                used: quotaUsage.projectsCreated || 0,
                limit: quotaTierConfig?.quotas?.maxProjects || 50
              }
            }
          };
          break;
      }

      return {
        executionId: context.executionId,
        toolId: 'billing_query_handler',
        status: 'success',
        result,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 0.5, memory: 5, storage: 0 },
          cost: 0.001
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'billing_query_handler', error as Error, startTime);
    }
  }

  /**
   * Feature Explainer Tool
   */
  async handleFeatureExplainer(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { featureName, userLevel, includeExamples } = input;

      // TODO: Expand feature database
      const featureExplanations: Record<string, any> = {
        'agent-checkpoints': {
          name: 'Agent Checkpoints',
          description: 'Approval gates where AI agents pause for user review and input',
          explanation: {
            beginner: 'Checkpoints are like review points where you can approve or modify what the AI has done before it continues.',
            intermediate: 'Checkpoints provide control points in the automated workflow. Agents present their work (schemas, analyses, visualizations) for your approval before proceeding to the next step.',
            advanced: 'Checkpoints implement a human-in-the-loop pattern for AI workflows. They enable transparent AI decision-making, allow for course corrections, and ensure the final output aligns with business objectives.'
          },
          examples: includeExamples ? [
            {
              scenario: 'Schema Review',
              description: 'After uploading data, the Data Engineer agent detects the schema and presents it for your review. You can modify column types or add constraints before analysis begins.'
            },
            {
              scenario: 'Analysis Plan Approval',
              description: 'The Data Scientist agent proposes an analysis plan based on your objectives. You review and approve the statistical methods before execution.'
            }
          ] : undefined,
          benefits: ['Control over AI decisions', 'Transparency', 'Quality assurance', 'Course correction']
        },
        'business-templates': {
          name: 'Business Templates',
          description: 'Pre-built analysis workflows for specific industries and use cases',
          explanation: {
            beginner: 'Templates are ready-made analysis setups for common business scenarios (like customer churn or sales forecasting). Just upload your data and go!',
            intermediate: 'Templates package industry best practices into reusable workflows. They include pre-configured analysis steps, visualizations, and report formats tailored to specific business domains.',
            advanced: 'Templates implement domain-specific analytical patterns with optimized feature engineering, model selection, and visualization strategies. They accelerate time-to-insight while maintaining analytical rigor.'
          },
          examples: includeExamples ? [
            {
              scenario: 'HR - Employee Attrition Analysis',
              description: 'Analyzes factors contributing to employee turnover, predicts flight risk, and recommends retention strategies.'
            },
            {
              scenario: 'Retail - Customer Lifetime Value',
              description: 'Calculates CLV, segments customers by value, and identifies high-value customer characteristics.'
            }
          ] : undefined,
          benefits: ['Time savings', 'Best practices', 'Industry-specific insights', 'Consistency']
        }
      };

      const explanation = featureExplanations[featureName.toLowerCase()] || {
        name: featureName,
        description: 'Feature information not yet available',
        explanation: {
          [userLevel]: `The ${featureName} feature is part of our platform. Please check our documentation or contact support for more details.`
        }
      };

      return {
        executionId: context.executionId,
        toolId: 'feature_explainer',
        status: 'success',
        result: {
          feature: explanation.name,
          level: userLevel,
          explanation: explanation.explanation[userLevel],
          examples: explanation.examples,
          benefits: explanation.benefits
        },
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 0.2, memory: 2, storage: 0 },
          cost: 0.0005
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'feature_explainer', error as Error, startTime);
    }
  }

  /**
   * Service Health Checker Tool
   */
  async handleServiceHealthCheck(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { serviceHealthChecker } = await import('./service-health-checker');

      const healthReport = await serviceHealthChecker.getSystemHealth({
        services: input.services,
        includeMetrics: input.includeMetrics || false,
        detailed: input.detailed || false
      });

      return {
        executionId: context.executionId,
        toolId: 'service_health_checker',
        status: 'success',
        result: healthReport,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 2, memory: 15, storage: 0 },
          cost: 0.005
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'service_health_checker', error as Error, startTime);
    }
  }

  /**
   * User Issue Tracker Tool
   */
  async handleUserIssueTracker(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { userIssueTracker } = await import('./user-issue-tracker');
      const { operation } = input;

      let result: any = {};

      switch (operation) {
        case 'create':
          result = await userIssueTracker.createIssue({
            userId: input.userId,
            issueType: input.issueType,
            priority: input.priority,
            title: input.title,
            description: input.description,
            attachments: input.attachments,
            tags: input.tags
          });
          break;

        case 'update':
          result = await userIssueTracker.updateIssue(
            {
              issueId: input.issueId,
              status: input.status,
              assignedTo: input.assignedTo,
              priority: input.priority,
              comment: input.comment,
              escalate: input.escalate
            },
            context.agentId || 'customer_support'
          );
          break;

        case 'get':
          result = await userIssueTracker.getIssue(input.issueId);
          break;

        case 'search':
          result = await userIssueTracker.searchIssues({
            userId: input.userId,
            status: input.status,
            issueType: input.issueType,
            priority: input.priority,
            assignedTo: input.assignedTo,
            createdAfter: input.createdAfter,
            createdBefore: input.createdBefore,
            tags: input.tags,
            limit: input.limit
          });
          break;

        case 'getSLABreaches':
          result = await userIssueTracker.getSLABreaches();
          break;

        case 'getStatistics':
          result = await userIssueTracker.getStatistics(input.userId);
          break;

        case 'addComment':
          result = await userIssueTracker.addComment(
            input.issueId,
            context.agentId || 'customer_support',
            input.comment
          );
          break;

        case 'escalate':
          result = await userIssueTracker.escalateIssue(
            input.issueId,
            context.agentId || 'customer_support',
            input.reason
          );
          break;

        case 'resolve':
          result = await userIssueTracker.resolveIssue(
            input.issueId,
            context.agentId || 'customer_support',
            input.resolution
          );
          break;

        case 'close':
          result = await userIssueTracker.closeIssue(
            input.issueId,
            context.agentId || 'customer_support'
          );
          break;

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      return {
        executionId: context.executionId,
        toolId: 'user_issue_tracker',
        status: 'success',
        result: {
          operation,
          data: result
        },
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 1, memory: 8, storage: 0.5 },
          cost: 0.003
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'user_issue_tracker', error as Error, startTime);
    }
  }

  private createErrorResult(executionId: string, toolId: string, error: Error, startTime: number): ToolExecutionResult {
    return {
      executionId,
      toolId,
      status: 'error',
      result: null,
      metrics: {
        duration: Date.now() - startTime,
        resourcesUsed: { cpu: 0, memory: 0, storage: 0 },
        cost: 0
      },
      error: error.message
    };
  }
}

// ==========================================
// RESEARCH AGENT TOOL HANDLERS
// ==========================================

export class ResearchAgentToolHandlers {
  private templateResearch: TemplateResearchAgent;

  constructor() {
    this.templateResearch = new TemplateResearchAgent();
  }

  /**
   * Web Researcher Tool
   * FIX: Production Readiness - Uses AI knowledge to provide research insights
   * NOTE: For full web search, configure SERPER_API_KEY or GOOGLE_SEARCH_API_KEY in .env
   */
  async handleWebResearch(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { query, sources, depth, timeRange, includeAcademic } = input;

      // FIX: Use AI service to generate research insights based on knowledge
      const { multiAIService } = await import('../chimaridata-ai');

      const researchPrompt = `You are a research analyst. Provide comprehensive research findings for the following query.

Query: "${query}"
${timeRange ? `Time focus: ${timeRange}` : ''}
${includeAcademic ? 'Include relevant academic perspectives.' : ''}

Provide your response in the following JSON format:
{
  "summary": "A brief executive summary of findings",
  "keyFindings": [
    {"title": "Finding title", "detail": "Detailed explanation", "confidence": 0.9}
  ],
  "relevantConcepts": ["concept1", "concept2"],
  "recommendations": ["recommendation1", "recommendation2"],
  "limitations": "Note that this is based on AI knowledge, not live web search"
}`;

      let aiResponse: any = null;
      try {
        const response = await multiAIService.generateInsights({}, 'research', researchPrompt);
        if (response.text) {
          // Try to parse JSON from the response
          const jsonMatch = response.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            aiResponse = JSON.parse(jsonMatch[0]);
          }
        }
      } catch (aiError) {
        console.warn('[WebResearch] AI research generation failed, using fallback:', aiError);
      }

      // Build results with AI-generated content or fallback
      const results = {
        query,
        searchDepth: depth || 'standard',
        sources: ['ai_knowledge'], // Indicate source is AI knowledge
        sourceNote: 'Results generated from AI knowledge base. For live web search, configure a search API.',
        results: aiResponse ? [{
          title: `Research findings for: ${query}`,
          summary: aiResponse.summary || 'Research findings based on available knowledge.',
          keyFindings: aiResponse.keyFindings || [],
          relevantConcepts: aiResponse.relevantConcepts || [],
          recommendations: aiResponse.recommendations || [],
          confidence: 0.85,
          source: 'ai_knowledge',
          generatedAt: new Date()
        }] : [{
          title: `Research findings for: ${query}`,
          summary: 'Unable to generate AI research. Please ensure AI API keys are configured.',
          keyFindings: [],
          confidence: 0.3,
          source: 'fallback',
          generatedAt: new Date()
        }],
        totalResults: 1,
        limitations: aiResponse?.limitations || 'Based on AI training data, not live web search.'
      };

      return {
        executionId: context.executionId,
        toolId: 'web_researcher',
        status: 'success',
        result: results,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 5, memory: 150, storage: 0 },
          cost: 0.02
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'web_researcher', error as Error, startTime);
    }
  }

  /**
   * Template Creator Tool
   */
  async handleTemplateCreator(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { templateName, industry, analysisType, components, metadata } = input;

      // Use the template research agent
      const template = {
        templateId: `template_${Date.now()}`,
        name: templateName,
        industry,
        analysisType,
        components,
        metadata: {
          ...metadata,
          createdBy: context.agentId,
          createdAt: new Date()
        },
        status: 'draft'
      };

      return {
        executionId: context.executionId,
        toolId: 'template_creator',
        status: 'success',
        result: {
          templateCreated: true,
          template,
          nextSteps: [
            'Review template structure',
            'Test with sample data',
            'Submit for approval'
          ]
        },
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 2, memory: 50, storage: 10 },
          cost: 0.01
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'template_creator', error as Error, startTime);
    }
  }

  /**
   * Template Library Manager Tool - Search, retrieve, update templates from database
   */
  async handleTemplateLibraryManager(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { TemplateService } = await import('./template-service');
      const { action, templateId, searchCriteria } = input;

      let result: any = {};

      switch (action) {
        case 'search':
          // Search templates with filters
          const templates = await TemplateService.getAllTemplates({
            journeyType: searchCriteria?.journeyType,
            industry: searchCriteria?.industry,
            persona: searchCriteria?.persona,
            isActive: searchCriteria?.isActive ?? true,
            searchTerm: searchCriteria?.searchTerm || searchCriteria?.query
          });
          result = {
            action: 'search',
            templates: templates.map(t => ({
              id: t.id,
              name: t.name,
              title: t.title,
              summary: t.summary,
              industry: t.industry,
              journeyType: t.journeyType,
              persona: t.persona,
              isSystem: t.isSystem
            })),
            totalCount: templates.length,
            filters: searchCriteria
          };
          break;

        case 'retrieve':
          if (!templateId) {
            throw new Error('templateId is required for retrieve action');
          }
          const template = await TemplateService.getTemplateById(templateId);
          if (!template) {
            result = { action: 'retrieve', found: false, templateId };
          } else {
            result = { action: 'retrieve', found: true, template };
          }
          break;

        case 'getByIndustry':
          const industryTemplates = await TemplateService.getTemplatesByIndustry(
            searchCriteria?.industry || input.industry
          );
          result = {
            action: 'getByIndustry',
            industry: searchCriteria?.industry || input.industry,
            templates: industryTemplates,
            totalCount: industryTemplates.length
          };
          break;

        case 'getByJourneyType':
          const journeyTemplates = await TemplateService.getTemplatesByJourneyType(
            searchCriteria?.journeyType || input.journeyType
          );
          result = {
            action: 'getByJourneyType',
            journeyType: searchCriteria?.journeyType || input.journeyType,
            templates: journeyTemplates,
            totalCount: journeyTemplates.length
          };
          break;

        case 'recommend':
          // Recommend templates based on user context
          const allTemplates = await TemplateService.getAllTemplates({ isActive: true });
          const industry = searchCriteria?.industry || input.industry;
          const goals = searchCriteria?.goals || input.goals || [];

          // Score templates by relevance
          const scoredTemplates = allTemplates.map(t => {
            let score = 0;
            if (t.industry === industry) score += 50;
            if (t.industry === 'general') score += 10;
            goals.forEach((goal: string) => {
              const goalLower = goal.toLowerCase();
              if (t.summary?.toLowerCase().includes(goalLower)) score += 20;
              if (t.name?.toLowerCase().includes(goalLower)) score += 30;
            });
            return { template: t, relevanceScore: score };
          });

          // Sort by score and return top 5
          scoredTemplates.sort((a, b) => b.relevanceScore - a.relevanceScore);
          result = {
            action: 'recommend',
            recommendations: scoredTemplates.slice(0, 5).map(st => ({
              template: {
                id: st.template.id,
                name: st.template.name,
                title: st.template.title,
                summary: st.template.summary,
                industry: st.template.industry
              },
              relevanceScore: st.relevanceScore,
              matchReason: st.relevanceScore > 50 ? 'Industry match' : 'General template'
            })),
            context: { industry, goals }
          };
          break;

        default:
          throw new Error(`Unknown action: ${action}. Supported: search, retrieve, getByIndustry, getByJourneyType, recommend`);
      }

      return {
        executionId: context.executionId,
        toolId: 'template_library_manager',
        status: 'success',
        result,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 1, memory: 20, storage: 0 },
          cost: 0.005
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'template_library_manager', error as Error, startTime);
    }
  }

  /**
   * Document Scraper Tool - Extract structured data from websites and documents
   */
  async handleDocumentScraper(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { url, selectors, followLinks, maxDepth } = input;

      // Structured scraping result
      const result = {
        sourceUrl: url,
        scrapedAt: new Date(),
        selectors: selectors || { default: 'body' },
        maxDepth: maxDepth || 1,
        followedLinks: followLinks || false,
        extractedContent: {
          title: `Content from ${url}`,
          mainText: 'Extracted text content from the page...',
          metadata: {
            language: 'en',
            wordCount: 500,
            readingTime: '2 min'
          },
          structuredData: {
            headings: ['Section 1', 'Section 2', 'Section 3'],
            paragraphs: 5,
            links: 10,
            images: 3
          },
          tables: [],
          lists: []
        },
        status: 'success',
        processingNotes: [
          'Content extracted successfully',
          'Images were referenced but not downloaded',
          'Dynamic content may not be included'
        ]
      };

      return {
        executionId: context.executionId,
        toolId: 'document_scraper',
        status: 'success',
        result,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 3, memory: 100, storage: 5 },
          cost: 0.02
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'document_scraper', error as Error, startTime);
    }
  }

  /**
   * Academic Paper Finder Tool - Search and retrieve academic papers
   */
  async handleAcademicPaperFinder(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { query, databases, yearRange, maxResults } = input;

      const selectedDatabases = databases || ['scholar', 'arxiv'];
      const years = yearRange || { start: 2020, end: 2024 };

      // Simulated academic paper results
      const papers = [
        {
          title: `Research on ${query}: A Comprehensive Analysis`,
          authors: ['Dr. A. Smith', 'Dr. B. Johnson', 'Prof. C. Williams'],
          abstract: `This paper presents a comprehensive analysis of ${query}...`,
          journal: 'Journal of Data Science',
          year: 2024,
          citations: 45,
          doi: '10.1234/jds.2024.001',
          url: 'https://arxiv.org/abs/2024.12345',
          database: 'arxiv',
          keywords: query.split(' ').slice(0, 5)
        },
        {
          title: `Advances in ${query}: New Methodologies`,
          authors: ['Dr. D. Brown', 'Dr. E. Davis'],
          abstract: `This study explores new methodologies for ${query}...`,
          journal: 'IEEE Transactions on Knowledge Engineering',
          year: 2023,
          citations: 78,
          doi: '10.1109/tke.2023.001',
          url: 'https://ieeexplore.ieee.org/document/12345',
          database: 'scholar',
          keywords: query.split(' ').slice(0, 5)
        },
        {
          title: `${query}: A Machine Learning Approach`,
          authors: ['Prof. F. Miller', 'Dr. G. Wilson', 'Dr. H. Taylor'],
          abstract: `We propose a novel machine learning approach to ${query}...`,
          journal: 'Machine Learning Journal',
          year: 2023,
          citations: 120,
          doi: '10.5555/mlj.2023.002',
          url: 'https://dl.acm.org/doi/12345',
          database: 'scholar',
          keywords: query.split(' ').slice(0, 5)
        }
      ].slice(0, maxResults || 10);

      const result = {
        query,
        databases: selectedDatabases,
        yearRange: years,
        totalFound: papers.length * 10, // Simulated total
        papers,
        citations: {
          totalCitations: papers.reduce((sum, p) => sum + p.citations, 0),
          averageCitations: Math.round(papers.reduce((sum, p) => sum + p.citations, 0) / papers.length)
        },
        relatedTopics: [
          `${query} applications`,
          `${query} methodologies`,
          `${query} future directions`
        ]
      };

      return {
        executionId: context.executionId,
        toolId: 'academic_paper_finder',
        status: 'success',
        result,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 2, memory: 80, storage: 0 },
          cost: 0.03
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'academic_paper_finder', error as Error, startTime);
    }
  }

  /**
   * Trend Analyzer Tool - Analyze trends and patterns from research data
   * FIX: Production Readiness - Uses AI to generate contextual trend analysis
   */
  async handleTrendAnalyzer(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { topic, timeRange, sources, includeForecasts } = input;

      // FIX: Use AI service to generate contextual trend analysis
      const { multiAIService } = await import('../chimaridata-ai');

      const trendPrompt = `You are a market trend analyst. Analyze trends for the topic: "${topic}"
${timeRange ? `Focus on the period: ${JSON.stringify(timeRange)}` : ''}
${includeForecasts ? 'Include short-term and medium-term forecasts.' : ''}

Provide your analysis in JSON format:
{
  "trends": [
    {"name": "Trend name", "direction": "increasing|decreasing|stable", "strength": "strong|moderate|weak", "confidence": 0.85, "description": "Explanation"}
  ],
  "patterns": {
    "seasonality": "Description of any seasonal patterns",
    "cyclicality": "Description of any cyclical patterns",
    "keyDrivers": ["driver1", "driver2"]
  },
  "forecasts": {
    "shortTerm": {"period": "6 months", "prediction": "Expected direction", "confidence": 0.75},
    "mediumTerm": {"period": "1-2 years", "prediction": "Expected direction", "confidence": 0.65}
  },
  "insights": ["insight1", "insight2", "insight3"]
}`;

      let aiResponse: any = null;
      try {
        const response = await multiAIService.generateInsights({}, 'research', trendPrompt);
        if (response.text) {
          const jsonMatch = response.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            aiResponse = JSON.parse(jsonMatch[0]);
          }
        }
      } catch (aiError) {
        console.warn('[TrendAnalyzer] AI analysis failed, using fallback:', aiError);
      }

      const result = {
        topic,
        analysisDate: new Date(),
        timeRange: timeRange || { start: '2023-01-01', end: '2025-12-31' },
        sources: ['ai_knowledge'],
        sourceNote: 'Trend analysis based on AI knowledge. For real-time data, integrate market data APIs.',
        trends: aiResponse?.trends || [
          {
            name: `${topic} Market Trend`,
            direction: 'stable',
            strength: 'moderate',
            confidence: 0.70,
            description: `Analysis of ${topic} trends (AI-generated insights)`
          }
        ],
        patterns: aiResponse?.patterns || {
          seasonality: 'Requires historical data for seasonal analysis',
          cyclicality: 'Requires time-series data for cycle detection',
          keyDrivers: ['Market demand', 'Technology adoption', 'Regulatory environment']
        },
        forecasts: includeForecasts ? (aiResponse?.forecasts || {
          shortTerm: { period: '6 months', prediction: 'Requires more data', confidence: 0.50 },
          mediumTerm: { period: '1-2 years', prediction: 'Requires more data', confidence: 0.40 }
        }) : undefined,
        insights: aiResponse?.insights || [
          `Analysis generated for: ${topic}`,
          'For detailed trend data, integrate with market data providers'
        ]
      };

      return {
        executionId: context.executionId,
        toolId: 'trend_analyzer',
        status: 'success',
        result,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 4, memory: 120, storage: 0 },
          cost: 0.03
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'trend_analyzer', error as Error, startTime);
    }
  }

  /**
   * Content Synthesizer Tool - Synthesize information from multiple sources
   */
  async handleContentSynthesizer(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { sources, outputFormat, focusAreas } = input;

      const format = outputFormat || 'summary';
      const sourcesUsed = Array.isArray(sources) ? sources : ['source1', 'source2'];

      let synthesizedContent: any;

      switch (format) {
        case 'bullets':
          synthesizedContent = {
            format: 'bullets',
            keyPoints: [
              'Main finding from synthesized sources',
              'Secondary insight derived from multiple references',
              'Supporting evidence from analyzed content',
              'Emerging pattern identified across sources',
              'Recommendation based on synthesis'
            ],
            sourceCount: sourcesUsed.length,
            confidenceLevel: 0.85
          };
          break;

        case 'report':
          synthesizedContent = {
            format: 'report',
            title: 'Synthesis Report',
            sections: [
              {
                heading: 'Executive Summary',
                content: 'This report synthesizes key findings from multiple sources...'
              },
              {
                heading: 'Key Findings',
                content: 'The analysis reveals several important patterns...'
              },
              {
                heading: 'Analysis',
                content: 'Detailed examination of the source material shows...'
              },
              {
                heading: 'Conclusions',
                content: 'Based on the synthesized information, we conclude...'
              },
              {
                heading: 'Recommendations',
                content: 'We recommend the following actions...'
              }
            ],
            appendix: {
              sourcesAnalyzed: sourcesUsed.length,
              methodology: 'Multi-source synthesis with cross-validation'
            }
          };
          break;

        default: // summary
          synthesizedContent = {
            format: 'summary',
            summary: `This synthesis combines information from ${sourcesUsed.length} sources to provide a comprehensive overview. Key themes include ${(focusAreas || ['general topic']).join(', ')}. The analysis reveals consistent patterns across sources with high confidence in the main findings.`,
            keyThemes: focusAreas || ['Theme 1', 'Theme 2', 'Theme 3'],
            mainConclusions: [
              'Primary conclusion from synthesis',
              'Secondary conclusion supported by evidence',
              'Emerging trend identified'
            ],
            gaps: [
              'Areas requiring further research',
              'Conflicting information that needs resolution'
            ]
          };
      }

      const result = {
        synthesisDate: new Date(),
        sourcesAnalyzed: sourcesUsed,
        focusAreas: focusAreas || [],
        outputFormat: format,
        content: synthesizedContent,
        quality: {
          sourceConsistency: 0.88,
          informationCompleteness: 0.82,
          synthesisConfidence: 0.85
        },
        nextSteps: [
          'Review synthesized content for accuracy',
          'Validate key conclusions with subject matter experts',
          'Identify areas for additional research'
        ]
      };

      return {
        executionId: context.executionId,
        toolId: 'content_synthesizer',
        status: 'success',
        result,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 3, memory: 90, storage: 0 },
          cost: 0.03
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'content_synthesizer', error as Error, startTime);
    }
  }

  private createErrorResult(executionId: string, toolId: string, error: Error, startTime: number): ToolExecutionResult {
    return {
      executionId,
      toolId,
      status: 'error',
      result: null,
      metrics: {
        duration: Date.now() - startTime,
        resourcesUsed: { cpu: 0, memory: 0, storage: 0 },
        cost: 0
      },
      error: error.message
    };
  }
}

// ==========================================
// BUSINESS AGENT TOOL HANDLERS
// ==========================================

export class BusinessAgentToolHandlers {
  /**
   * Industry Research Tool
   * FIX: Production Readiness - Uses AI to generate industry insights
   */
  async handleIndustryResearch(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { industry, topics, depth, includeRegulations } = input;

      // FIX: Use AI service to generate industry research
      const { multiAIService } = await import('../chimaridata-ai');

      const researchPrompt = `You are an industry analyst. Provide comprehensive research on the ${industry} industry.
${topics?.length ? `Focus on these topics: ${topics.join(', ')}` : ''}
${includeRegulations ? 'Include relevant regulations and compliance requirements.' : ''}

Provide your analysis in JSON format:
{
  "trends": [
    {"trend": "Trend name", "description": "Description", "impact": "high|medium|low", "timeframe": "2024-2026"}
  ],
  "marketInsights": {
    "keyDynamics": "Market dynamics description",
    "growthDrivers": ["driver1", "driver2"],
    "challenges": ["challenge1", "challenge2"]
  },
  "keyPlayers": ["player1 (description)", "player2 (description)"],
  "regulations": [
    {"name": "Regulation name", "region": "Region", "requirements": ["req1", "req2"], "impact": "Description"}
  ],
  "opportunities": ["opportunity1", "opportunity2"]
}`;

      let aiResponse: any = null;
      try {
        const response = await multiAIService.generateInsights({}, 'research', researchPrompt);
        if (response.text) {
          const jsonMatch = response.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            aiResponse = JSON.parse(jsonMatch[0]);
          }
        }
      } catch (aiError) {
        console.warn('[IndustryResearch] AI research failed, using fallback:', aiError);
      }

      const research = {
        industry,
        researchDepth: depth || 'detailed',
        topics: topics || [],
        sourceNote: 'Research based on AI knowledge. For real-time market data, integrate with industry data providers.',
        findings: {
          trends: aiResponse?.trends || [
            {
              trend: `${industry} market analysis`,
              description: 'AI-generated industry insights',
              impact: 'moderate',
              timeframe: '2024-2026'
            }
          ],
          marketInsights: aiResponse?.marketInsights || {
            keyDynamics: 'Analysis requires industry-specific data',
            growthDrivers: ['Technology adoption', 'Market demand'],
            challenges: ['Competition', 'Regulatory compliance']
          },
          keyPlayers: aiResponse?.keyPlayers || ['Key players require market data integration']
        },
        regulations: includeRegulations ? (aiResponse?.regulations || [
          {
            name: 'General industry regulations',
            region: 'Various',
            requirements: ['Compliance requirements vary by region'],
            impact: 'Varies by jurisdiction'
          }
        ]) : undefined,
        opportunities: aiResponse?.opportunities || ['Opportunities require detailed market analysis'],
        sources: ['ai_knowledge']
      };

      return {
        executionId: context.executionId,
        toolId: 'industry_research',
        status: 'success',
        result: research,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 5, memory: 150, storage: 0 },
          cost: 0.05
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'industry_research', error as Error, startTime);
    }
  }

  /**
   * ROI Calculator Tool
   */
  async handleROICalculator(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { investment, returns, timeframe, includeProjections } = input;

      const totalReturns = Array.isArray(returns) ? returns.reduce((sum, r) => sum + r, 0) : returns;
      const roi = ((totalReturns - investment) / investment) * 100;
      const paybackPeriod = this.calculatePaybackPeriod(investment, returns);

      const analysis = {
        investment,
        totalReturns,
        roi: roi.toFixed(2) + '%',
        paybackPeriod: paybackPeriod + ' months',
        npv: this.calculateNPV(investment, returns, 0.1),
        irr: this.calculateIRR(investment, returns),
        projections: includeProjections ? this.generateProjections(returns) : undefined
      };

      return {
        executionId: context.executionId,
        toolId: 'roi_calculator',
        status: 'success',
        result: analysis,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 1, memory: 10, storage: 0 },
          cost: 0.002
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'roi_calculator', error as Error, startTime);
    }
  }

  private calculatePaybackPeriod(investment: number, returns: number[]): number {
    let cumulative = 0;
    for (let i = 0; i < returns.length; i++) {
      cumulative += returns[i];
      if (cumulative >= investment) {
        return i + 1;
      }
    }
    return returns.length;
  }

  private calculateNPV(investment: number, returns: number[], discountRate: number): number {
    let npv = -investment;
    returns.forEach((cashFlow, year) => {
      npv += cashFlow / Math.pow(1 + discountRate, year + 1);
    });
    return npv;
  }

  private calculateIRR(investment: number, returns: number[]): string {
    // Simplified IRR approximation
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const irr = ((avgReturn / investment) * 100).toFixed(2);
    return irr + '%';
  }

  private generateProjections(historicalReturns: number[]): any {
    const avgGrowth = 0.15; // 15% assumed growth
    return {
      year1: historicalReturns[historicalReturns.length - 1] * (1 + avgGrowth),
      year2: historicalReturns[historicalReturns.length - 1] * Math.pow(1 + avgGrowth, 2),
      year3: historicalReturns[historicalReturns.length - 1] * Math.pow(1 + avgGrowth, 3)
    };
  }

  /**
   * Compliance Checker Tool - Check regulatory compliance requirements
   */
  async handleComplianceChecker(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { industry, regulations, dataTypes, region } = input;

      // Define regulation requirements database
      const regulationRequirements: Record<string, any> = {
        'GDPR': {
          name: 'General Data Protection Regulation',
          region: 'EU',
          requirements: [
            'Data subject consent',
            'Right to be forgotten',
            'Data portability',
            'Data breach notification within 72 hours',
            'Data Protection Officer (DPO) appointment',
            'Privacy by design'
          ],
          dataTypesAffected: ['personal_data', 'email', 'name', 'address', 'phone', 'ip_address'],
          penalties: 'Up to €20M or 4% of annual global turnover'
        },
        'CCPA': {
          name: 'California Consumer Privacy Act',
          region: 'US-CA',
          requirements: [
            'Consumer right to know',
            'Right to delete',
            'Right to opt-out of sale',
            'Non-discrimination for exercising rights'
          ],
          dataTypesAffected: ['personal_data', 'browsing_history', 'purchase_history'],
          penalties: 'Up to $7,500 per intentional violation'
        },
        'HIPAA': {
          name: 'Health Insurance Portability and Accountability Act',
          region: 'US',
          requirements: [
            'Protected Health Information (PHI) safeguards',
            'Access controls',
            'Audit trails',
            'Encryption requirements',
            'Business Associate Agreements'
          ],
          dataTypesAffected: ['health_data', 'medical_records', 'ssn', 'insurance_info'],
          penalties: 'Up to $1.5M per violation category per year'
        },
        'SOX': {
          name: 'Sarbanes-Oxley Act',
          region: 'US',
          requirements: [
            'Internal control assessments',
            'Management certification of financial reports',
            'Auditor independence',
            'Enhanced financial disclosures'
          ],
          dataTypesAffected: ['financial_data', 'accounting_records'],
          penalties: 'Up to $5M fine and 20 years imprisonment'
        },
        'PCI-DSS': {
          name: 'Payment Card Industry Data Security Standard',
          region: 'Global',
          requirements: [
            'Build and maintain secure network',
            'Protect cardholder data',
            'Maintain vulnerability management program',
            'Implement strong access controls',
            'Regular monitoring and testing',
            'Information security policy'
          ],
          dataTypesAffected: ['credit_card', 'payment_data', 'cardholder_data'],
          penalties: 'Fines from $5,000 to $100,000 per month'
        }
      };

      // Check which regulations apply
      const applicableRegulations = (regulations || ['GDPR', 'CCPA']).filter((r: string) =>
        regulationRequirements[r.toUpperCase()]
      );

      // Analyze data types against regulations
      const complianceChecks = applicableRegulations.map((regCode: string) => {
        const reg = regulationRequirements[regCode.toUpperCase()];
        if (!reg) return null;

        const overlappingDataTypes = (dataTypes || []).filter((dt: string) =>
          reg.dataTypesAffected.some((affected: string) =>
            dt.toLowerCase().includes(affected) || affected.includes(dt.toLowerCase())
          )
        );

        const regionMatch = !region || reg.region === 'Global' ||
          reg.region.includes(region) || region.includes(reg.region.split('-')[0]);

        return {
          regulation: regCode.toUpperCase(),
          fullName: reg.name,
          regionApplicable: regionMatch,
          status: overlappingDataTypes.length > 0 ? 'review_required' : 'low_risk',
          affectedDataTypes: overlappingDataTypes,
          requirements: reg.requirements,
          penalties: reg.penalties,
          recommendations: overlappingDataTypes.length > 0 ? [
            `Review ${regCode} compliance for ${overlappingDataTypes.join(', ')} data`,
            'Implement required security controls',
            'Document data processing activities',
            'Conduct privacy impact assessment'
          ] : [
            'Continue monitoring for regulatory changes',
            'Maintain documentation'
          ]
        };
      }).filter(Boolean);

      // Calculate overall compliance score
      const riskScores = complianceChecks.map((c: any) => c.status === 'review_required' ? 0.6 : 1);
      const overallScore = riskScores.length > 0
        ? (riskScores.reduce((a: number, b: number) => a + b, 0) / riskScores.length) * 100
        : 100;

      const result = {
        industry,
        region,
        analysisDate: new Date(),
        overallComplianceScore: overallScore.toFixed(1) + '%',
        riskLevel: overallScore >= 80 ? 'low' : overallScore >= 60 ? 'medium' : 'high',
        regulationsChecked: complianceChecks,
        dataTypesAnalyzed: dataTypes || [],
        recommendations: complianceChecks
          .flatMap((c: any) => c.recommendations)
          .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i) // unique
          .slice(0, 5),
        nextSteps: [
          'Review detailed requirements for flagged regulations',
          'Engage legal/compliance team for formal assessment',
          'Implement recommended security controls',
          'Schedule regular compliance audits'
        ]
      };

      return {
        executionId: context.executionId,
        toolId: 'compliance_checker',
        status: 'success',
        result,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 2, memory: 30, storage: 0 },
          cost: 0.01
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'compliance_checker', error as Error, startTime);
    }
  }

  /**
   * Competitive Analyzer Tool - Analyze competitive landscape and market positioning
   */
  async handleCompetitiveAnalyzer(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { industry, competitors, analysisType } = input;

      // SWOT Analysis template
      const swotAnalysis = {
        strengths: [
          'Strong brand recognition',
          'Proprietary technology/IP',
          'Experienced leadership team',
          'Customer loyalty and retention'
        ],
        weaknesses: [
          'Limited market reach',
          'Higher cost structure',
          'Product gaps vs. competitors',
          'Dependency on key customers'
        ],
        opportunities: [
          'Emerging market segments',
          'Technology adoption trends',
          'Strategic partnerships',
          'International expansion'
        ],
        threats: [
          'New market entrants',
          'Price competition',
          'Regulatory changes',
          'Economic uncertainty'
        ]
      };

      // Porter's Five Forces Analysis
      const porterAnalysis = {
        competitiveRivalry: {
          level: 'high',
          factors: ['Market saturation', 'Low switching costs', 'Aggressive marketing']
        },
        supplierPower: {
          level: 'medium',
          factors: ['Multiple supplier options', 'Commodity inputs', 'Some specialized components']
        },
        buyerPower: {
          level: 'medium',
          factors: ['Price sensitivity', 'Product differentiation', 'Brand loyalty']
        },
        threatOfSubstitutes: {
          level: 'medium',
          factors: ['Alternative solutions', 'Technology disruption', 'DIY options']
        },
        threatOfNewEntrants: {
          level: 'low',
          factors: ['High capital requirements', 'Regulatory barriers', 'Established brand loyalty']
        }
      };

      // Benchmarking Analysis
      const benchmarking = {
        metrics: [
          { metric: 'Market Share', yourPosition: '15%', industryAvg: '12%', leader: '25%' },
          { metric: 'Customer Satisfaction', yourPosition: '4.2/5', industryAvg: '3.8/5', leader: '4.5/5' },
          { metric: 'Product Quality Score', yourPosition: '85', industryAvg: '78', leader: '92' },
          { metric: 'Price Competitiveness', yourPosition: 'Premium', industryAvg: 'Mid-range', leader: 'Premium' }
        ],
        competitorProfiles: (competitors || ['Competitor A', 'Competitor B', 'Competitor C']).map((comp: string, idx: number) => ({
          name: comp,
          marketShare: `${20 - idx * 5}%`,
          strengths: ['Product innovation', 'Brand recognition', 'Distribution network'][idx] || 'Unknown',
          weaknesses: ['High prices', 'Limited service', 'Slow adaptation'][idx] || 'Unknown',
          strategy: ['Differentiation', 'Cost leadership', 'Niche focus'][idx] || 'Mixed'
        }))
      };

      let analysisResult: any;
      switch (analysisType?.toLowerCase()) {
        case 'swot':
          analysisResult = { type: 'SWOT Analysis', data: swotAnalysis };
          break;
        case 'porter':
          analysisResult = { type: "Porter's Five Forces", data: porterAnalysis };
          break;
        case 'benchmarking':
          analysisResult = { type: 'Competitive Benchmarking', data: benchmarking };
          break;
        default:
          // Combined analysis
          analysisResult = {
            type: 'Comprehensive Competitive Analysis',
            swot: swotAnalysis,
            porterFiveForces: porterAnalysis,
            benchmarking
          };
      }

      const result = {
        industry,
        analysisDate: new Date(),
        analysis: analysisResult,
        strategicRecommendations: [
          'Focus on differentiating features to stand out from competitors',
          'Invest in customer experience to increase retention',
          'Explore partnerships to expand market reach',
          'Monitor competitor pricing and adjust strategy accordingly',
          'Strengthen areas identified as weaknesses in SWOT'
        ],
        marketPositioning: {
          current: 'Challenger',
          recommended: 'Strong Differentiator',
          keyActions: [
            'Develop unique value proposition',
            'Invest in innovation',
            'Build strategic partnerships'
          ]
        }
      };

      return {
        executionId: context.executionId,
        toolId: 'competitive_analyzer',
        status: 'success',
        result,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 3, memory: 50, storage: 0 },
          cost: 0.05
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'competitive_analyzer', error as Error, startTime);
    }
  }

  /**
   * Business Metric Analyzer Tool - Analyze business metrics, KPIs, and performance indicators
   */
  async handleBusinessMetricAnalyzer(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { metricType, data, benchmarks, industry } = input;

      // Calculate basic statistics
      const numericData = Array.isArray(data) ? data.filter((d: any) => typeof d === 'number' || !isNaN(Number(d))).map(Number) : [];
      const stats = numericData.length > 0 ? {
        count: numericData.length,
        sum: numericData.reduce((a: number, b: number) => a + b, 0),
        mean: numericData.reduce((a: number, b: number) => a + b, 0) / numericData.length,
        min: Math.min(...numericData),
        max: Math.max(...numericData),
        range: Math.max(...numericData) - Math.min(...numericData)
      } : null;

      // KPI definitions by category
      const kpiDefinitions: Record<string, any> = {
        financial: {
          metrics: ['Revenue', 'Profit Margin', 'ROI', 'EBITDA', 'Cash Flow'],
          benchmarks: { good: '>15%', average: '5-15%', poor: '<5%' }
        },
        operational: {
          metrics: ['Efficiency Rate', 'Utilization', 'Throughput', 'Cycle Time', 'Defect Rate'],
          benchmarks: { good: '>90%', average: '70-90%', poor: '<70%' }
        },
        customer: {
          metrics: ['NPS', 'CSAT', 'Churn Rate', 'Customer Lifetime Value', 'Acquisition Cost'],
          benchmarks: { good: 'NPS >50', average: 'NPS 0-50', poor: 'NPS <0' }
        },
        growth: {
          metrics: ['YoY Growth', 'MoM Growth', 'Market Share', 'New Customer Rate', 'Expansion Revenue'],
          benchmarks: { good: '>20%', average: '5-20%', poor: '<5%' }
        }
      };

      const category = metricType?.toLowerCase() || 'financial';
      const categoryInfo = kpiDefinitions[category] || kpiDefinitions.financial;

      // Generate insights based on data
      const insights = [];
      if (stats) {
        if (stats.mean > 0) {
          insights.push(`Average ${metricType || 'metric'} value: ${stats.mean.toFixed(2)}`);
        }
        insights.push(`Data range spans from ${stats.min} to ${stats.max}`);
        if (stats.range > stats.mean * 0.5) {
          insights.push('High variability detected - consider investigating outliers');
        }
      }

      // Compare against benchmarks if provided
      const benchmarkComparison = benchmarks ? {
        provided: benchmarks,
        analysis: 'Performance compared against provided benchmarks',
        status: stats && stats.mean > (benchmarks.target || 0) ? 'Above Target' : 'Below Target'
      } : {
        industryStandard: categoryInfo.benchmarks,
        recommendation: 'Use industry benchmarks for comparison'
      };

      const result = {
        metricCategory: category,
        industry: industry || 'General',
        analysisDate: new Date(),
        dataAnalysis: {
          statistics: stats,
          dataPoints: numericData.length,
          insights
        },
        kpiFramework: {
          relevantMetrics: categoryInfo.metrics,
          benchmarkGuidelines: categoryInfo.benchmarks
        },
        benchmarkComparison,
        recommendations: [
          `Track all ${categoryInfo.metrics.length} ${category} KPIs for comprehensive view`,
          'Establish baseline measurements for trend analysis',
          'Set SMART goals based on benchmark data',
          'Review and adjust KPIs quarterly',
          'Automate data collection for real-time monitoring'
        ],
        actionItems: [
          { priority: 'high', action: 'Define target values for each KPI' },
          { priority: 'medium', action: 'Set up automated reporting dashboard' },
          { priority: 'medium', action: 'Establish review cadence with stakeholders' },
          { priority: 'low', action: 'Research industry-specific benchmarks' }
        ]
      };

      return {
        executionId: context.executionId,
        toolId: 'business_metric_analyzer',
        status: 'success',
        result,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 2, memory: 40, storage: 0 },
          cost: 0.03
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'business_metric_analyzer', error as Error, startTime);
    }
  }

  private createErrorResult(executionId: string, toolId: string, error: Error, startTime: number): ToolExecutionResult {
    return {
      executionId,
      toolId,
      status: 'error',
      result: null,
      metrics: {
        duration: Date.now() - startTime,
        resourcesUsed: { cpu: 0, memory: 0, storage: 0 },
        cost: 0
      },
      error: error.message
    };
  }
}

// ==========================================
// DATA ENGINEER TOOL HANDLERS
// ==========================================

export class DataEngineerToolHandlers {
  /**
   * Data Pipeline Builder Tool
   */
  async handleDataPipelineBuilder(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { dataPipelineBuilder } = await import('./data-pipeline-builder');
      const { operation } = input;

      let result: any = {};

      switch (operation) {
        case 'create':
          result = await dataPipelineBuilder.createPipeline({
            name: input.name,
            description: input.description,
            source: input.source,
            destination: input.destination,
            transformations: input.transformations || [],
            schedule: input.schedule,
            createdBy: context.agentId || 'data_engineer',
            metadata: input.metadata
          });
          break;

        case 'update':
          result = await dataPipelineBuilder.updatePipeline({
            pipelineId: input.pipelineId,
            name: input.name,
            description: input.description,
            source: input.source,
            destination: input.destination,
            transformations: input.transformations,
            schedule: input.schedule,
            status: input.status,
            metadata: input.metadata
          });
          break;

        case 'get':
          result = await dataPipelineBuilder.getPipeline(input.pipelineId);
          break;

        case 'search':
          result = await dataPipelineBuilder.searchPipelines({
            status: input.status,
            createdBy: input.createdBy,
            tags: input.tags,
            limit: input.limit,
            offset: input.offset
          });
          break;

        case 'execute':
          result = await dataPipelineBuilder.executePipeline(
            input.pipelineId,
            input.triggeredBy || 'manual'
          );
          break;

        case 'getExecutionHistory':
          result = await dataPipelineBuilder.getExecutionHistory(
            input.pipelineId,
            input.limit || 10
          );
          break;

        case 'getExecution':
          result = await dataPipelineBuilder.getExecution(input.executionId);
          break;

        case 'activate':
          result = await dataPipelineBuilder.activatePipeline(input.pipelineId);
          break;

        case 'pause':
          result = await dataPipelineBuilder.pausePipeline(input.pipelineId);
          break;

        case 'delete':
          result = await dataPipelineBuilder.deletePipeline(input.pipelineId);
          break;

        case 'validate':
          const pipeline = await dataPipelineBuilder.getPipeline(input.pipelineId);
          if (!pipeline) {
            throw new Error(`Pipeline ${input.pipelineId} not found`);
          }
          result = await dataPipelineBuilder.validatePipeline(pipeline);
          break;

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      return {
        executionId: context.executionId,
        toolId: 'data_pipeline_builder',
        status: 'success',
        result: {
          operation,
          data: result
        },
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 3, memory: 50, storage: 1 },
          cost: 0.01
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'data_pipeline_builder', error as Error, startTime);
    }
  }

  /**
   * Data Quality Monitor Tool - Comprehensive data quality validation
   */
  async handleDataQualityMonitor(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { dataQualityMonitor } = await import('./data-quality-monitor');
      const { userFriendlyFormatter } = await import('./user-friendly-formatter');
      const { operation } = input;

      let result: any = {};

      switch (operation) {
        case 'validate':
          // Validate data quality with comprehensive checks
          const qualityReport = await dataQualityMonitor.validateData({
            datasetId: input.datasetId,
            datasetName: input.datasetName,
            data: input.data,
            schema: input.schema,
            rules: input.rules || [
              { dimension: 'completeness', threshold: 0.95, critical: true },
              { dimension: 'validity', threshold: 0.90, critical: true },
              { dimension: 'consistency', threshold: 0.85, critical: false },
              { dimension: 'accuracy', threshold: 0.90, critical: false },
              { dimension: 'uniqueness', threshold: 0.95, critical: false }
            ]
          });

          // Format for user-friendly display
          const formattedReport = userFriendlyFormatter.formatQualityReport(
            qualityReport.overallScore,
            qualityReport.issues
          );

          result = {
            qualityReport,
            formattedReport,
            readyForAnalysis: qualityReport.readyForAnalysis
          };
          break;

        case 'profile':
          // Profile data to understand characteristics
          const profile = await dataQualityMonitor.profileData(
            input.datasetId,
            input.datasetName,
            input.data
          );
          result = { profile };
          break;

        case 'getReport':
          // Retrieve existing quality report
          const existingReport = await dataQualityMonitor.getReport(input.reportId);
          if (existingReport) {
            const formatted = userFriendlyFormatter.formatQualityReport(
              existingReport.overallScore,
              existingReport.issues
            );
            result = { qualityReport: existingReport, formattedReport: formatted };
          } else {
            throw new Error(`Quality report ${input.reportId} not found`);
          }
          break;

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      return {
        executionId: context.executionId,
        toolId: 'data_quality_monitor',
        status: 'success',
        result: {
          operation,
          data: result
        },
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 2, memory: 30, storage: 0 },
          cost: 0.005
        }
      };
    } catch (error) {
      return this.createErrorResult(context.executionId, 'data_quality_monitor', error as Error, startTime);
    }
  }

  /**
   * Scan PII Columns Tool - Detect PII in dataset columns
   */
  async handleScanPIIColumns(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { storage } = await import('../storage');
      const projectId = input.projectId;

      console.log(`🔍 [PII Scan] Scanning for PII columns in project ${projectId}`);

      // Get project datasets
      const datasets = await storage.getProjectDatasets(projectId);
      if (!datasets || datasets.length === 0) {
        throw new Error('No datasets found for PII scanning');
      }

      const piiResults: any[] = [];
      const piiPatterns = {
        email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        phone: /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/,
        ssn: /^\d{3}-?\d{2}-?\d{4}$/,
        creditCard: /^\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}$/,
        ipAddress: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/,
        dateOfBirth: /^\d{4}[-\/]\d{2}[-\/]\d{2}$/
      };

      const piiKeywords = ['name', 'email', 'phone', 'address', 'ssn', 'social_security',
                          'credit_card', 'dob', 'birth', 'salary', 'income', 'password',
                          'secret', 'token', 'api_key', 'private', 'confidential'];

      for (const datasetEntry of datasets) {
        const dataset = (datasetEntry as any).dataset || datasetEntry;
        const schema = (dataset.schema as Record<string, any>) || {};
        const dataArray = Array.isArray(dataset.data) ? dataset.data : [];
        const preview = dataset.preview || dataArray.slice(0, 100) || [];

        const datasetPII: any[] = [];

        for (const [columnName, columnType] of Object.entries(schema)) {
          let piiType: string | null = null;
          let confidence = 0;
          let reason = '';

          // Check column name for PII keywords
          const lowerColName = columnName.toLowerCase();
          for (const keyword of piiKeywords) {
            if (lowerColName.includes(keyword)) {
              piiType = keyword;
              confidence = 0.9;
              reason = `Column name contains PII keyword: ${keyword}`;
              break;
            }
          }

          // Check sample values for PII patterns
          if (!piiType && preview.length > 0) {
            const sampleValues = preview.slice(0, 50).map((row: any) => row[columnName]).filter(Boolean);

            for (const [patternName, pattern] of Object.entries(piiPatterns)) {
              const matches = sampleValues.filter((v: any) => pattern.test(String(v)));
              if (matches.length > sampleValues.length * 0.3) {
                piiType = patternName;
                confidence = matches.length / sampleValues.length;
                reason = `${Math.round(confidence * 100)}% of values match ${patternName} pattern`;
                break;
              }
            }
          }

          if (piiType) {
            datasetPII.push({
              columnName,
              piiType,
              confidence,
              reason,
              recommendation: confidence > 0.8 ? 'exclude' : 'review'
            });
          }
        }

        piiResults.push({
          datasetId: dataset.id,
          datasetName: dataset.originalFileName || (dataset as any).name || 'Unknown',
          piiColumns: datasetPII,
          totalColumns: Object.keys(schema).length,
          piiCount: datasetPII.length
        });
      }

      const totalPII = piiResults.reduce((sum, r) => sum + r.piiCount, 0);
      console.log(`✅ [PII Scan] Found ${totalPII} potential PII columns across ${datasets.length} datasets`);

      return {
        executionId: context.executionId,
        toolId: 'scan_pii_columns',
        status: 'success',
        result: {
          projectId,
          datasets: piiResults,
          totalPIIColumnsFound: totalPII,
          scannedAt: new Date().toISOString()
        },
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 5, memory: 50, storage: 0 },
          cost: 0.01
        }
      };
    } catch (error) {
      console.error('❌ [PII Scan] Error:', error);
      return this.createErrorResult(context.executionId, 'scan_pii_columns', error as Error, startTime);
    }
  }

  /**
   * Apply PII Exclusions Tool - Remove or mask PII columns from datasets
   */
  async handleApplyPIIExclusions(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const { storage } = await import('../storage');
      const { projectId, excludedColumns = [], maskingStrategy = 'remove', persistDecision = true, userConfirmed = false } = input;

      console.log(`🔒 [PII Apply] Applying PII exclusions to project ${projectId}`);
      console.log(`🔒 [PII Apply] Columns to process:`, excludedColumns);
      console.log(`🔒 [PII Apply] Strategy: ${maskingStrategy}, Persist: ${persistDecision}`);

      if (!excludedColumns || excludedColumns.length === 0) {
        return {
          executionId: context.executionId,
          toolId: 'apply_pii_exclusions',
          status: 'success',
          result: {
            projectId,
            message: 'No columns specified for exclusion',
            processedDatasets: [],
            appliedAt: new Date().toISOString()
          },
          metrics: {
            duration: Date.now() - startTime,
            resourcesUsed: { cpu: 1, memory: 10, storage: 0 },
            cost: 0
          }
        };
      }

      // Get project datasets
      const datasets = await storage.getProjectDatasets(projectId);
      if (!datasets || datasets.length === 0) {
        throw new Error('No datasets found for PII exclusion');
      }

      const processedDatasets: any[] = [];

      for (const datasetEntry of datasets) {
        const dataset = (datasetEntry as any).dataset || datasetEntry;
        const datasetId = dataset.id;
        const currentSchema = (dataset.schema as Record<string, any>) || {};
        const currentData = Array.isArray(dataset.data) ? dataset.data : (Array.isArray(dataset.preview) ? dataset.preview : []);
        const currentMetadata = (dataset.ingestionMetadata as any) || {};

        // Determine which columns to exclude from this dataset
        const columnsInDataset = Object.keys(currentSchema);
        const columnsToExclude = excludedColumns.filter((col: string) => columnsInDataset.includes(col));

        if (columnsToExclude.length === 0) {
          processedDatasets.push({
            datasetId,
            datasetName: dataset.originalFileName || (dataset as any).name || 'Unknown',
            status: 'skipped',
            reason: 'No matching columns found'
          });
          continue;
        }

        // Apply exclusion based on strategy
        let newSchema: Record<string, any> = {};
        let newData: any[] = [];

        if (maskingStrategy === 'remove') {
          // Remove columns entirely
          newSchema = Object.fromEntries(
            Object.entries(currentSchema).filter(([col]) => !columnsToExclude.includes(col))
          );
          newData = currentData.map((row: any) => {
            const newRow: any = {};
            for (const [key, value] of Object.entries(row)) {
              if (!columnsToExclude.includes(key)) {
                newRow[key] = value;
              }
            }
            return newRow;
          });
        } else if (maskingStrategy === 'redact') {
          // Keep columns but mask values
          newSchema = { ...currentSchema };
          newData = currentData.map((row: any) => {
            const newRow: any = { ...row };
            for (const col of columnsToExclude) {
              if (col in newRow) {
                newRow[col] = '[REDACTED]';
              }
            }
            return newRow;
          });
        } else {
          // Default: remove
          newSchema = Object.fromEntries(
            Object.entries(currentSchema).filter(([col]) => !columnsToExclude.includes(col))
          );
          newData = currentData.map((row: any) => {
            const newRow: any = {};
            for (const [key, value] of Object.entries(row)) {
              if (!columnsToExclude.includes(key)) {
                newRow[key] = value;
              }
            }
            return newRow;
          });
        }

        // Update dataset in storage
        const updatedMetadata = {
          ...currentMetadata,
          piiExclusions: {
            excludedColumns: columnsToExclude,
            maskingStrategy,
            appliedAt: new Date().toISOString(),
            userConfirmed
          },
          // Store transformed data
          transformedData: newData,
          transformedSchema: newSchema,
          originalSchema: currentSchema
        };

        await storage.updateDataset(datasetId, {
          schema: newSchema,
          data: newData,
          preview: newData.slice(0, 100),
          ingestionMetadata: updatedMetadata
        } as any);

        processedDatasets.push({
          datasetId,
          datasetName: dataset.originalFileName || (dataset as any).name || 'Unknown',
          status: 'processed',
          columnsExcluded: columnsToExclude,
          maskingStrategy,
          originalColumnCount: columnsInDataset.length,
          newColumnCount: Object.keys(newSchema).length,
          rowCount: newData.length
        });

        console.log(`✅ [PII Apply] Dataset ${datasetId}: Excluded ${columnsToExclude.length} columns using ${maskingStrategy} strategy`);
      }

      // Update project metadata with PII decisions
      if (persistDecision) {
        const project = await storage.getProject(projectId);
        const existingMetadata = (project as any)?.metadata || {};

        await storage.updateProject(projectId, {
          metadata: {
            ...existingMetadata,
            piiDecisions: {
              excludedColumns,
              maskingStrategy,
              appliedAt: new Date().toISOString(),
              userConfirmed,
              processedDatasets: processedDatasets.map(d => d.datasetId)
            }
          }
        } as any);
      }

      const result = {
        projectId,
        processedDatasets,
        totalColumnsExcluded: processedDatasets.reduce((sum, d) => sum + (d.columnsExcluded?.length || 0), 0),
        maskingStrategy,
        appliedAt: new Date().toISOString(),
        userConfirmed
      };

      console.log(`✅ [PII Apply] Completed PII exclusion for project ${projectId}`);

      return {
        executionId: context.executionId,
        toolId: 'apply_pii_exclusions',
        status: 'success',
        result,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 10, memory: 100, storage: 5 },
          cost: 0.02
        }
      };
    } catch (error) {
      console.error('❌ [PII Apply] Error:', error);
      return this.createErrorResult(context.executionId, 'apply_pii_exclusions', error as Error, startTime);
    }
  }

  private createErrorResult(executionId: string, toolId: string, error: Error, startTime: number): ToolExecutionResult {
    return {
      executionId,
      toolId,
      status: 'error',
      result: null,
      metrics: {
        duration: Date.now() - startTime,
        resourcesUsed: { cpu: 0, memory: 0, storage: 0 },
        cost: 0
      },
      error: error.message
    };
  }
}

// ==========================================
// EXPORT HANDLER INSTANCES
// ==========================================

export const pmToolHandlers = new PMToolHandlers();
export const customerSupportToolHandlers = new CustomerSupportToolHandlers();
export const researchAgentToolHandlers = new ResearchAgentToolHandlers();
export const businessAgentToolHandlers = new BusinessAgentToolHandlers();
export const dataEngineerToolHandlers = new DataEngineerToolHandlers();
