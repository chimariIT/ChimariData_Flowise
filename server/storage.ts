import { DataProject, InsertDataProject, insertProjectSchema, insertEnterpriseInquirySchema, insertGuidedAnalysisOrderSchema, insertDatasetSchema, insertProjectDatasetSchema, insertProjectArtifactSchema, insertStreamingSourceSchema, insertDatasetVersionSchema, journeys, journeyStepProgress, costEstimates, eligibilityChecks, insertAgentCheckpointSchema } from "@shared/schema";
import { users, projects, enterpriseInquiries, guidedAnalysisOrders, datasets, projectDatasets, projectArtifacts, streamingSources, streamChunks, streamCheckpoints, scrapingJobs, scrapingRuns, datasetVersions, agentCheckpoints, projectSessions, projectStates } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

// Local type aliases derived from Drizzle tables (schema does not export these named types directly)
type User = typeof users.$inferSelect;
type InsertUser = typeof users.$inferInsert;
type Project = typeof projects.$inferSelect;
type InsertProject = typeof projects.$inferInsert;
type Dataset = typeof datasets.$inferSelect;
type InsertDataset = typeof datasets.$inferInsert;
type ProjectDataset = typeof projectDatasets.$inferSelect;
type InsertProjectDataset = typeof projectDatasets.$inferInsert;
type ProjectArtifact = typeof projectArtifacts.$inferSelect;
type InsertProjectArtifact = typeof projectArtifacts.$inferInsert;
type StreamingSource = typeof streamingSources.$inferSelect;
type InsertStreamingSource = typeof streamingSources.$inferInsert;
type StreamChunk = typeof streamChunks.$inferSelect;
type InsertStreamChunk = typeof streamChunks.$inferInsert;
type StreamCheckpoint = typeof streamCheckpoints.$inferSelect;
type InsertStreamCheckpoint = typeof streamCheckpoints.$inferInsert;
type ScrapingJob = typeof scrapingJobs.$inferSelect;
type InsertScrapingJob = typeof scrapingJobs.$inferInsert;
type ScrapingRun = typeof scrapingRuns.$inferSelect;
type InsertScrapingRun = typeof scrapingRuns.$inferInsert;
type DatasetVersion = typeof datasetVersions.$inferSelect;
type InsertDatasetVersion = typeof datasetVersions.$inferInsert;
type Journey = typeof journeys.$inferSelect;
type InsertJourney = typeof journeys.$inferInsert;
type JourneyStepProgress = typeof journeyStepProgress.$inferSelect;
type InsertJourneyStepProgress = typeof journeyStepProgress.$inferInsert;
type CostEstimate = typeof costEstimates.$inferSelect;
type InsertCostEstimate = typeof costEstimates.$inferInsert;
type EligibilityCheck = typeof eligibilityChecks.$inferSelect;
type InsertEligibilityCheck = typeof eligibilityChecks.$inferInsert;
type EnterpriseInquiry = typeof enterpriseInquiries.$inferSelect;
type InsertEnterpriseInquiry = typeof enterpriseInquiries.$inferInsert;
type GuidedAnalysisOrder = typeof guidedAnalysisOrders.$inferSelect;
type InsertGuidedAnalysisOrder = typeof guidedAnalysisOrders.$inferInsert;
type AgentCheckpoint = typeof agentCheckpoints.$inferSelect;
type InsertAgentCheckpoint = typeof agentCheckpoints.$inferInsert;
type ProjectStateRow = typeof projectStates.$inferSelect;
export interface ProjectSessionSnapshot {
  id: string;
  projectId?: string | null;
  journeyType?: string | null;
  currentStep?: string | null;
  prepare?: any;
  data?: any;
  execute?: any;
  pricing?: any;
  results?: any;
  workflowState?: any;
  transformation?: any;
  metadata?: {
    lastActivity?: Date | null;
    expiresAt?: Date | null;
    serverValidated?: boolean | null;
  };
}

// Convert between DataProject and Project types
function projectToDataProject(project: Project, dataset?: Dataset, projectState?: Record<string, unknown> | ProjectStateRow): DataProject {
  const projectRecord = project as any;
  const datasetRecord = dataset as any;
  const statePayload = projectState
    ? (('state' in projectState ? (projectState as ProjectStateRow).state : projectState) as Record<string, unknown>)
    : undefined;

  const uploadedAtSource = datasetRecord?.createdAt ?? projectRecord?.createdAt ?? new Date();
  const uploadedAt = uploadedAtSource instanceof Date ? uploadedAtSource : new Date(uploadedAtSource);

  const fileName = datasetRecord?.originalFileName ?? projectRecord?.fileName ?? '';
  const fileSize = datasetRecord?.fileSize ?? projectRecord?.fileSize ?? 0;
  const fileType = datasetRecord?.mimeType ?? projectRecord?.fileType ?? '';
  const schema = datasetRecord?.schema ?? projectRecord?.schema ?? undefined;
  const recordCount = datasetRecord?.recordCount ?? projectRecord?.recordCount ?? undefined;
  const dataSource = (datasetRecord?.sourceType as DataProject['dataSource'] | undefined) ?? (projectRecord?.dataSource as DataProject['dataSource'] | undefined) ?? 'upload';
  const piiAnalysis = datasetRecord?.piiAnalysis ?? projectRecord?.piiAnalysis ?? undefined;
  const sourceMetadata = datasetRecord?.ingestionMetadata ?? projectRecord?.sourceMetadata ?? undefined;
  const storageUri = datasetRecord?.storageUri ?? projectRecord?.file_path ?? undefined;
  const datasetStatus = (datasetRecord?.status as string | undefined)?.toLowerCase();
  const projectStatus = (projectRecord?.status as string | undefined)?.toLowerCase();
  const processed = datasetStatus
    ? !['processing', 'uploading'].includes(datasetStatus)
    : projectStatus
      ? !['draft', 'uploading', 'pii_review'].includes(projectStatus)
      : false;

  const result: DataProject & { preview?: unknown; sampleData?: unknown } = {
    id: project.id,
    userId: project.userId || '',
    journeyType: projectRecord?.journeyType ?? 'ai_guided',
    name: project.name,
    fileName,
    fileSize,
    fileType,
    uploadedAt,
    description: project.description ?? undefined,
    isTrial: projectRecord?.isTrial ?? false,
    schema,
    recordCount,
    data: projectRecord?.data ?? undefined,
    processed,
    piiAnalysis,
    uniqueIdentifiers: projectRecord?.uniqueIdentifiers ?? undefined,
    dataSource,
    sourceMetadata,
    transformations: projectRecord?.transformations ?? undefined,
    joinedFiles: projectRecord?.joinedFiles ?? undefined,
    outlierAnalysis: projectRecord?.outlierAnalysis ?? undefined,
    missingDataAnalysis: projectRecord?.missingDataAnalysis ?? undefined,
    normalityTests: projectRecord?.normalityTests ?? undefined,
    analysisResults: projectRecord?.analysisResults ?? undefined,
    stepByStepAnalysis: projectRecord?.stepByStepAnalysis ?? undefined,
    interactiveSession: projectRecord?.interactiveSession ?? undefined,
    costEstimation: projectRecord?.costEstimation ?? undefined,
    visualizations: projectRecord?.visualizations ?? undefined,
    aiInsights: projectRecord?.aiInsights ?? undefined,
    aiRole: projectRecord?.aiRole ?? undefined,
    aiActions: projectRecord?.aiActions ?? undefined,
    mcpResources: projectRecord?.mcpResources ?? undefined,
    purchasedFeatures: projectRecord?.purchasedFeatures ?? undefined,
    isPaid: projectRecord?.isPaid ?? false,
    selectedFeatures: projectRecord?.selectedFeatures ?? undefined,
    paymentIntentId: projectRecord?.paymentIntentId ?? undefined,
    upgradedAt: projectRecord?.upgradedAt ?? undefined,
    transformedData: projectRecord?.transformedData ?? undefined,
    file_path: storageUri,
  };

  if (datasetRecord?.preview !== undefined) {
    result.preview = datasetRecord.preview;
    result.sampleData = datasetRecord.preview;
  }

  if (datasetRecord?.data && result.data === undefined) {
    result.data = datasetRecord.data;
  }

  if (statePayload && typeof statePayload === 'object') {
    for (const [key, value] of Object.entries(statePayload)) {
      if (value === undefined) {
        continue;
      }
      (result as any)[key] = normalizeStateValue(key, value);
    }
  }

  for (const key of JSON_STATE_KEYS) {
    const currentValue = (result as any)[key];
    if (typeof currentValue === 'string') {
      const parsed = tryParseJson(currentValue);
      if (parsed !== undefined) {
        (result as any)[key] = parsed;
      }
    }
  }

  return result;
}

function dataProjectToInsertProject(dataProject: InsertDataProject): Omit<InsertProject, 'id'> {
  const userId = (dataProject as any).userId;
  return {
    userId: userId, // Set userId (required by schema)
    name: dataProject.name,
    description: dataProject.description || null,
  journeyType: (dataProject as any).journeyType || 'ai_guided', // Default to ai_guided if not specified
  };
}

const PROJECT_COLUMN_KEYS = new Set([
  'userId',
  'name',
  'description',
  'status',
  'journeyType',
  'lastArtifactId',
  'analysisResults',
  'consultationProposalId',
  'approvedPlanId',
  'analysisExecutedAt',
  'analysisBilledAt',
  'totalCostIncurred',
  'lockedCostEstimate',
  'costBreakdown',
  'stepCompletionStatus',
  'lastAccessedStep',
  'journeyStartedAt',
  'journeyCompletedAt',
  'journeyProgress',
]);

const JSON_STATE_KEYS = new Set([
  'metadata',
  'multiAgentCoordination',
  'analysisResults',
  'stepByStepAnalysis',
  'interactiveSession',
  'costEstimation',
  'visualizations',
  'aiInsights',
  'journeyProgress',
  'journeyMetrics',
]);

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function normalizeStateValue(key: string, value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  if (!JSON_STATE_KEYS.has(key)) {
    return value;
  }

  const parsed = tryParseJson(value);
  return parsed === undefined ? value : parsed;
}

function projectUpdatesToDb(updates: Partial<DataProject>): Partial<Project> {
  const dbUpdates: Partial<Project> = {};

  // Map DataProject fields to Project database fields, only include provided values
  if (updates.userId !== undefined) {
    dbUpdates.userId = updates.userId;
  }
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description || null;
  // Additional fields that exist on the projects table
  if ((updates as any).status !== undefined) (dbUpdates as any).status = (updates as any).status;
  if ((updates as any).journeyType !== undefined) (dbUpdates as any).journeyType = (updates as any).journeyType;
  if ((updates as any).lastArtifactId !== undefined) (dbUpdates as any).lastArtifactId = (updates as any).lastArtifactId;
  if ((updates as any).analysisResults !== undefined) (dbUpdates as any).analysisResults = (updates as any).analysisResults;
  if ((updates as any).consultationProposalId !== undefined) (dbUpdates as any).consultationProposalId = (updates as any).consultationProposalId;
  if ((updates as any).approvedPlanId !== undefined) (dbUpdates as any).approvedPlanId = (updates as any).approvedPlanId;
  if ((updates as any).analysisExecutedAt !== undefined) (dbUpdates as any).analysisExecutedAt = (updates as any).analysisExecutedAt;
  if ((updates as any).analysisBilledAt !== undefined) (dbUpdates as any).analysisBilledAt = (updates as any).analysisBilledAt;
  if ((updates as any).totalCostIncurred !== undefined) (dbUpdates as any).totalCostIncurred = (updates as any).totalCostIncurred;
  if ((updates as any).lockedCostEstimate !== undefined) (dbUpdates as any).lockedCostEstimate = (updates as any).lockedCostEstimate;
  if ((updates as any).costBreakdown !== undefined) (dbUpdates as any).costBreakdown = (updates as any).costBreakdown;
  if ((updates as any).stepCompletionStatus !== undefined) (dbUpdates as any).stepCompletionStatus = (updates as any).stepCompletionStatus;
  if ((updates as any).lastAccessedStep !== undefined) (dbUpdates as any).lastAccessedStep = (updates as any).lastAccessedStep;
  if ((updates as any).journeyStartedAt !== undefined) (dbUpdates as any).journeyStartedAt = (updates as any).journeyStartedAt;
  if ((updates as any).journeyCompletedAt !== undefined) (dbUpdates as any).journeyCompletedAt = (updates as any).journeyCompletedAt;
  if ((updates as any).journeyProgress !== undefined) (dbUpdates as any).journeyProgress = (updates as any).journeyProgress;
  
  return dbUpdates;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

function mergeStatePayload(existing: Record<string, unknown>, updates: Record<string, unknown>): Record<string, unknown> {
  if (!Object.keys(updates).length) {
    return existing;
  }

  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      continue;
    }

    const current = merged[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      merged[key] = { ...current, ...value };
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

function projectUpdatesToState(updates: Partial<DataProject>): Record<string, unknown> {
  const stateUpdates: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      continue;
    }
    if (PROJECT_COLUMN_KEYS.has(key)) {
      continue;
    }
    if (key === 'id' || key === 'userId') {
      continue;
    }
    stateUpdates[key] = value;
  }

  return stateUpdates;
}

export interface IStorage {
  // Dataset operations - files exist independently of projects
  createDataset(dataset: InsertDataset): Promise<Dataset>;
  getDataset(id: string): Promise<Dataset | undefined>;
  getDatasetsByOwner(ownerId: string): Promise<Dataset[]>;
  updateDataset(id: string, updates: Partial<Dataset>): Promise<Dataset | undefined>;
  deleteDataset(id: string): Promise<boolean>;
  searchDatasets(ownerId: string, query?: string): Promise<Dataset[]>;
  
  // Project operations - lightweight containers for analysis workflows
  createProject(project: InsertDataProject): Promise<DataProject>;
  getProject(id: string): Promise<DataProject | undefined>;
  getProjectsByOwner(ownerId: string): Promise<DataProject[]>;
  getAllProjects(): Promise<DataProject[]>;
  updateProject(id: string, updates: Partial<DataProject>): Promise<DataProject | undefined>;
  deleteProject(id: string): Promise<boolean>;
  
  // Project-Dataset associations - many-to-many relationships
  addDatasetToProject(projectId: string, datasetId: string, role?: string, alias?: string): Promise<ProjectDataset>;
  // Convenience alias used by routes
  linkProjectToDataset(projectId: string, datasetId: string, role?: string, alias?: string): Promise<ProjectDataset>;
  removeDatasetFromProject(projectId: string, datasetId: string): Promise<boolean>;
  getProjectDatasets(projectId: string): Promise<{ dataset: Dataset; association: ProjectDataset }[]>;
  getDatasetProjects(datasetId: string): Promise<{ project: DataProject; association: ProjectDataset }[]>;
  // Convenience helper to get the primary/most-recent dataset for a project
  getDatasetForProject(projectId: string): Promise<Dataset | undefined>;
  
  // Project Artifacts - track workflow from ingestion to results
  createArtifact(artifact: InsertProjectArtifact): Promise<ProjectArtifact>;
  getArtifact(id: string): Promise<ProjectArtifact | undefined>;
  getProjectArtifacts(projectId: string, type?: string): Promise<ProjectArtifact[]>;
  updateArtifact(id: string, updates: Partial<ProjectArtifact>): Promise<ProjectArtifact | undefined>;
  getArtifactChain(artifactId: string): Promise<ProjectArtifact[]>; // Get parent-child chain
  
  // User operations
  createUser(user: Partial<InsertUser> & { email: string }): Promise<User>;
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  getAllUsers(): Promise<User[]>;
  
  // Guided analysis storage
  storeGuidedAnalysisOrder(id: string, order: any): Promise<void>;
  getGuidedAnalysisOrder(id: string): Promise<any>;
  updateGuidedAnalysisOrder(id: string, updates: any): Promise<void>;
  listGuidedAnalysisOrders(userId?: string): Promise<any[]>;
  
  // Streaming Sources Management
  createStreamingSource(source: InsertStreamingSource): Promise<StreamingSource>;
  getStreamingSource(id: string): Promise<StreamingSource | undefined>;
  getStreamingSourcesByDataset(datasetId: string): Promise<StreamingSource[]>;
  updateStreamingSource(id: string, updates: Partial<StreamingSource>): Promise<StreamingSource | undefined>;
  deleteStreamingSource(id: string): Promise<boolean>;
  startStreamingSource(id: string): Promise<boolean>;
  stopStreamingSource(id: string): Promise<boolean>;
  getActiveStreamingSources(): Promise<StreamingSource[]>;
  
  // Stream Chunks & Checkpoints
  createStreamChunk(chunk: InsertStreamChunk): Promise<StreamChunk>;
  getStreamChunks(datasetId: string, limit?: number): Promise<StreamChunk[]>;
  getStreamChunksByTimeRange(datasetId: string, fromTs: Date, toTs: Date): Promise<StreamChunk[]>;
  createStreamCheckpoint(checkpoint: InsertStreamCheckpoint): Promise<StreamCheckpoint>;
  getLatestCheckpoint(sourceId: string): Promise<StreamCheckpoint | undefined>;
  updateCheckpoint(sourceId: string, cursor: string): Promise<boolean>;
  
  // Scraping Jobs Management
  createScrapingJob(job: InsertScrapingJob): Promise<ScrapingJob>;
  getScrapingJob(id: string): Promise<ScrapingJob | undefined>;
  getScrapingJobsByDataset(datasetId: string): Promise<ScrapingJob[]>;
  updateScrapingJob(id: string, updates: Partial<ScrapingJob>): Promise<ScrapingJob | undefined>;
  deleteScrapingJob(id: string): Promise<boolean>;
  getJobsToRun(): Promise<ScrapingJob[]>;
  updateJobNextRun(id: string, nextRunAt: Date): Promise<boolean>;
  
  // Scraping Runs
  createScrapingRun(run: InsertScrapingRun): Promise<ScrapingRun>;
  getScrapingRuns(jobId: string, limit?: number): Promise<ScrapingRun[]>;
  updateScrapingRun(id: string, updates: Partial<ScrapingRun>): Promise<ScrapingRun | undefined>;
  getLatestScrapingRun(jobId: string): Promise<ScrapingRun | undefined>;
  
  // Dataset Versions
  createDatasetVersion(version: InsertDatasetVersion): Promise<DatasetVersion>;
  getDatasetVersions(datasetId: string): Promise<DatasetVersion[]>;
  getLatestDatasetVersion(datasetId: string): Promise<DatasetVersion | undefined>;
  deleteDatasetVersion(id: string): Promise<boolean>;
  
  // Cost Estimates
  createCostEstimate(estimate: InsertCostEstimate): Promise<CostEstimate>;
  getCostEstimate(id: string): Promise<CostEstimate | undefined>;
  getCostEstimatesByUser(userId: string): Promise<CostEstimate[]>;
  getCostEstimatesByJourney(journeyId: string): Promise<CostEstimate[]>;
  updateCostEstimate(id: string, updates: Partial<CostEstimate>): Promise<CostEstimate | undefined>;
  getValidCostEstimates(userId: string): Promise<CostEstimate[]>;
  
  // Eligibility Checks
  createEligibilityCheck(check: InsertEligibilityCheck): Promise<EligibilityCheck>;
  getEligibilityCheck(id: string): Promise<EligibilityCheck | undefined>;
  getEligibilityChecksByUser(userId: string): Promise<EligibilityCheck[]>;
  getEligibilityChecksByFeature(userId: string, feature: string): Promise<EligibilityCheck[]>;
  getLatestEligibilityCheck(userId: string, feature: string): Promise<EligibilityCheck | undefined>;
  
  // User Settings (missing method)
  getUserSettings(userId: string): Promise<any>;
  
  // Journey Settings (missing method)
  getJourneySettings(journeyId: string): Promise<any>;
  
  // Usage Logging (missing method)
  logUsage(usage: { userId: string; projectId?: string | null; action: string; provider?: string; tokensUsed?: number; cost?: string }): Promise<void>;

  // Agent checkpoint management
  createAgentCheckpoint(checkpoint: Omit<InsertAgentCheckpoint, 'id' | 'createdAt' | 'timestamp'> & { id?: string; timestamp?: Date; createdAt?: Date }): Promise<AgentCheckpoint>;
  getProjectCheckpoints(projectId: string): Promise<AgentCheckpoint[]>;
  updateAgentCheckpoint(checkpointId: string, updates: Partial<Omit<AgentCheckpoint, 'id' | 'createdAt'>>): Promise<AgentCheckpoint | null>;
  deleteProjectCheckpoints(projectId: string): Promise<void>;

  // Project sessions
  getProjectSession(projectId: string): Promise<ProjectSessionSnapshot | null>;
}

export class MemStorage implements IStorage {
  private projects: Map<string, DataProject> = new Map();
  private users: Map<string, User> = new Map();
  private datasets: Map<string, Dataset> = new Map();
  private projectDatasets: Map<string, ProjectDataset> = new Map();
  private projectArtifacts: Map<string, ProjectArtifact> = new Map();
  private guidedAnalysisOrders: Map<string, any> = new Map();
  private streamingSources: Map<string, StreamingSource> = new Map();
  private streamChunks: Map<string, StreamChunk> = new Map();
  private streamCheckpoints: Map<string, StreamCheckpoint> = new Map();
  private scrapingJobs: Map<string, ScrapingJob> = new Map();
  private scrapingRuns: Map<string, ScrapingRun> = new Map();
  private datasetVersions: Map<string, DatasetVersion> = new Map();
  private journeys: Map<string, Journey> = new Map();
  private journeyStepProgress: Map<string, JourneyStepProgress> = new Map();
  private costEstimates: Map<string, CostEstimate> = new Map();
  private eligibilityChecks: Map<string, EligibilityCheck> = new Map();
  private agentCheckpoints: Map<string, AgentCheckpoint> = new Map();
  private projectSessions: Map<string, ProjectSessionSnapshot> = new Map();
  private nextId = 1;

  async createProject(projectData: InsertDataProject): Promise<DataProject> {
    const id = `project_${this.nextId++}`;
    // Normalize userId to ensure in-memory filtering by owner works
    const normalizedUserId = (projectData as any).userId ?? (projectData as any).ownerId;
    const project: DataProject = {
      // Only include fields defined in DataProject to avoid stray ownerId props
      ...projectData,
      id,
      userId: normalizedUserId,
      uploadedAt: new Date(),
      processed: false,
    };
    
    this.projects.set(id, project);

    const sessionId = `session_${this.nextId++}`;
    this.projectSessions.set(id, {
      id: sessionId,
      projectId: id,
      journeyType: (projectData as any).journeyType ?? 'non-tech',
      currentStep: 'prepare',
      prepare: {},
      data: {},
      execute: {},
      pricing: {},
      results: {},
      workflowState: {},
      metadata: {
        lastActivity: new Date(),
        expiresAt: null,
        serverValidated: false,
      },
    });

    return project;
  }

  async getProject(id: string): Promise<DataProject | undefined> {
    return this.projects.get(id);
  }

  async getAllProjects(): Promise<DataProject[]> {
    return Array.from(this.projects.values());
  }

  async updateProject(id: string, updates: Partial<DataProject>): Promise<DataProject | undefined> {
    const existing = this.projects.get(id);
    if (!existing) {
      return undefined;
    }

    const updated = { ...existing, ...updates };
    this.projects.set(id, updated);

    const session = this.projectSessions.get(id);
    if (session) {
      this.projectSessions.set(id, {
        ...session,
        journeyType: (updates as any)?.journeyType ?? session.journeyType,
        metadata: {
          ...(session.metadata ?? {}),
          lastActivity: new Date(),
        },
      });
    }

    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    const deleted = this.projects.delete(id);
    this.projectSessions.delete(id);
    return deleted;
  }

  async getProjectsByOwner(ownerId: string): Promise<DataProject[]> {
    return Array.from(this.projects.values()).filter(project => project.userId === ownerId);
  }

  // Dataset operations
  async createDataset(datasetData: InsertDataset): Promise<Dataset> {
    const normalized = { ...(datasetData as any) } as InsertDataset & { ownerId?: string };
    const resolvedUserId = normalized.userId ?? normalized.ownerId;

    if (!resolvedUserId) {
      throw new Error("createDataset requires a userId or ownerId");
    }

    const id = (normalized as any).id ?? `dataset_${this.nextId++}`;
    delete (normalized as any).ownerId;
    const dataset: Dataset = {
      ...normalized,
      id,
      userId: resolvedUserId,
      sourceType: normalized.sourceType ?? "upload",
      dataType: normalized.dataType ?? null,
      data: (normalized as any).data ?? null,
      status: normalized.status ?? "ready",
      schema: normalized.schema ?? null,
      recordCount: normalized.recordCount ?? null,
      preview: normalized.preview ?? null,
      piiAnalysis: normalized.piiAnalysis ?? null,
      ingestionMetadata: normalized.ingestionMetadata ?? null,
      checksum: normalized.checksum ?? null,
      mode: normalized.mode ?? "static",
      retentionDays: normalized.retentionDays ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Preserve legacy ownerId property for any callers that still expect it
    (dataset as any).ownerId = resolvedUserId;

    this.datasets.set(id, dataset);
    return dataset;
  }

  async getDataset(id: string): Promise<Dataset | undefined> {
    return this.datasets.get(id);
  }

  async getDatasetsByOwner(ownerId: string): Promise<Dataset[]> {
    return Array.from(this.datasets.values()).filter(dataset => {
      const datasetRecord = dataset as any;
      return dataset.userId === ownerId || datasetRecord?.ownerId === ownerId;
    });
  }

  async updateDataset(id: string, updates: Partial<Dataset>): Promise<Dataset | undefined> {
    const existing = this.datasets.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.datasets.set(id, updated);
    return updated;
  }

  async deleteDataset(id: string): Promise<boolean> {
    return this.datasets.delete(id);
  }

  async searchDatasets(ownerId: string, query?: string): Promise<Dataset[]> {
    const ownerDatasets = await this.getDatasetsByOwner(ownerId);
    if (!query) return ownerDatasets;
    return ownerDatasets.filter(dataset => 
      dataset.originalFileName.toLowerCase().includes(query.toLowerCase())
    );
  }

  // Project-Dataset associations
  async addDatasetToProject(projectId: string, datasetId: string, role = 'primary', alias?: string): Promise<ProjectDataset> {
    const id = `pd_${this.nextId++}`;
    const association: ProjectDataset = {
      id,
      projectId,
      datasetId,
      role,
      alias: alias || null,
      addedAt: new Date(),
    };
    this.projectDatasets.set(id, association);
    return association;
  }

  async linkProjectToDataset(projectId: string, datasetId: string, role = 'primary', alias?: string): Promise<ProjectDataset> {
    // Simple alias for clarity at call sites
    return this.addDatasetToProject(projectId, datasetId, role, alias);
  }

  async removeDatasetFromProject(projectId: string, datasetId: string): Promise<boolean> {
    const toDelete = Array.from(this.projectDatasets.entries())
      .find(([_, assoc]) => assoc.projectId === projectId && assoc.datasetId === datasetId);
    if (toDelete) {
      return this.projectDatasets.delete(toDelete[0]);
    }
    return false;
  }

  async getProjectDatasets(projectId: string): Promise<{ dataset: Dataset; association: ProjectDataset }[]> {
    const associations = Array.from(this.projectDatasets.values())
      .filter(assoc => assoc.projectId === projectId);
    const result = [];
    for (const association of associations) {
      const dataset = await this.getDataset(association.datasetId);
      if (dataset) result.push({ dataset, association });
    }
    return result;
  }

  async getDatasetForProject(projectId: string): Promise<Dataset | undefined> {
    // Choose the most recently added association for this project
    const associations = Array.from(this.projectDatasets.values())
      .filter(assoc => assoc.projectId === projectId)
      .sort((a, b) => {
        const at = (a.addedAt as Date)?.getTime?.() ?? 0;
        const bt = (b.addedAt as Date)?.getTime?.() ?? 0;
        return bt - at;
      });
    const first = associations[0];
    if (!first) return undefined;
    return this.getDataset(first.datasetId);
  }

  async getDatasetProjects(datasetId: string): Promise<{ project: DataProject; association: ProjectDataset }[]> {
    const associations = Array.from(this.projectDatasets.values())
      .filter(assoc => assoc.datasetId === datasetId);
    const result = [];
    for (const association of associations) {
      const project = await this.getProject(association.projectId);
      if (project) result.push({ project, association });
    }
    return result;
  }

  // Project Artifacts
  async createArtifact(artifactData: InsertProjectArtifact): Promise<ProjectArtifact> {
    const id = `artifact_${this.nextId++}`;
    const artifact: ProjectArtifact = {
      ...artifactData,
      id,
      status: artifactData.status ?? null,
      params: artifactData.params ?? null,
      inputRefs: artifactData.inputRefs ?? null,
      metrics: artifactData.metrics ?? null,
      output: artifactData.output ?? null,
      fileRefs: artifactData.fileRefs ?? null,
      parentArtifactId: artifactData.parentArtifactId ?? null,
      createdBy: artifactData.createdBy ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.projectArtifacts.set(id, artifact);
    return artifact;
  }

  async getArtifact(id: string): Promise<ProjectArtifact | undefined> {
    return this.projectArtifacts.get(id);
  }

  async getProjectArtifacts(projectId: string, type?: string): Promise<ProjectArtifact[]> {
    const artifacts = Array.from(this.projectArtifacts.values())
      .filter(artifact => artifact.projectId === projectId);
    if (type) {
      return artifacts.filter(artifact => artifact.type === type);
    }
    return artifacts;
  }

  async updateArtifact(id: string, updates: Partial<ProjectArtifact>): Promise<ProjectArtifact | undefined> {
    const existing = this.projectArtifacts.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.projectArtifacts.set(id, updated);
    return updated;
  }

  async getArtifactChain(artifactId: string): Promise<ProjectArtifact[]> {
    const result: ProjectArtifact[] = [];
    let current = await this.getArtifact(artifactId);
    while (current) {
      result.unshift(current);
      if (!current.parentArtifactId) break;
      current = await this.getArtifact(current.parentArtifactId);
    }
    return result;
  }

  // User operations
  async createUser(userData: Partial<InsertUser> & { email: string }): Promise<User> {
    const user: User = {
      // defaults to satisfy select type
  id: (userData as any).id || nanoid(),
  email: (userData as any).email,
      hashedPassword: (userData as any).hashedPassword ?? null,
      firstName: (userData as any).firstName ?? null,
      lastName: (userData as any).lastName ?? null,
      profileImageUrl: (userData as any).profileImageUrl ?? null,
      provider: (userData as any).provider || 'email',
      providerId: (userData as any).providerId ?? null,
      emailVerified: (userData as any).emailVerified ?? false,
      emailVerificationToken: (userData as any).emailVerificationToken ?? null,
      emailVerificationExpires: (userData as any).emailVerificationExpires ?? null,
      passwordResetToken: (userData as any).passwordResetToken ?? null,
      passwordResetExpires: (userData as any).passwordResetExpires ?? null,
      subscriptionTier: (userData as any).subscriptionTier ?? 'none',
      subscriptionStatus: (userData as any).subscriptionStatus ?? 'inactive',
      stripeCustomerId: (userData as any).stripeCustomerId ?? null,
      stripeSubscriptionId: (userData as any).stripeSubscriptionId ?? null,
      subscriptionExpiresAt: (userData as any).subscriptionExpiresAt ?? null,
        subscriptionBalances: (userData as any).subscriptionBalances ?? {},
  credits: (userData as any).credits ?? '0',
      isPaid: (userData as any).isPaid ?? false,
      monthlyUploads: (userData as any).monthlyUploads ?? 0,
      monthlyDataVolume: (userData as any).monthlyDataVolume ?? 0,
      monthlyAIInsights: (userData as any).monthlyAIInsights ?? 0,
      monthlyAnalysisComponents: (userData as any).monthlyAnalysisComponents ?? 0,
      monthlyVisualizations: (userData as any).monthlyVisualizations ?? 0,
      currentStorageGb: (userData as any).currentStorageGb ?? null,
      monthlyDataProcessedGb: (userData as any).monthlyDataProcessedGb ?? null,
      usageResetAt: (userData as any).usageResetAt ?? new Date(),
      userRole: (userData as any).userRole ?? 'non-tech',
      technicalLevel: (userData as any).technicalLevel ?? 'beginner',
      industry: (userData as any).industry ?? null,
      preferredJourney: (userData as any).preferredJourney ?? null,
      journeyCompletions: (userData as any).journeyCompletions ?? null,
      onboardingCompleted: (userData as any).onboardingCompleted ?? false,
      isAdmin: (userData as any).isAdmin ?? false,
      role: (userData as any).role ?? null,
      createdAt: (userData as any).createdAt ?? new Date(),
      updatedAt: (userData as any).updatedAt ?? new Date(),
    };
    
    this.users.set(user.id, user);
    return user;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.emailVerificationToken === token);
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const existing = this.users.get(id);
    if (!existing) {
      return undefined;
    }

    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.users.set(id, updated);
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  // User Settings - return basic user settings object
  async getUserSettings(userId: string): Promise<any> {
    const user = this.users.get(userId);
    if (!user) {
      return null;
    }
    
    // Return basic user settings based on user subscription and preferences
    return {
      userId: user.id,
      subscriptionTier: user.subscriptionTier || 'none',
      subscriptionStatus: user.subscriptionStatus || 'inactive',
      monthlyUploads: user.monthlyUploads || 0,
      monthlyDataVolume: user.monthlyDataVolume || 0,
      monthlyAIInsights: user.monthlyAIInsights || 0,
      usageResetAt: user.usageResetAt,
      emailVerified: user.emailVerified || false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  // Journey Settings - return basic journey configuration
  async getJourneySettings(journeyId: string): Promise<any> {
    const journey = this.journeys.get(journeyId);
    if (!journey) {
      return null;
    }
    
    return {
      journeyId: journey.id,
      journeyType: journey.journeyType,
      userId: journey.userId,
      currentStep: journey.currentStep,
      createdAt: journey.createdAt,
      updatedAt: journey.updatedAt
    };
  }

  // Usage Logging
  async logUsage(usage: { userId: string; projectId?: string | null; action: string; provider?: string; tokensUsed?: number; cost?: string }): Promise<void> {
    // In-memory storage doesn't persist usage logs
    // This is handled by HybridStorage for persistence
    console.log('Usage logged:', usage);
  }

  async createAgentCheckpoint(checkpointData: Omit<InsertAgentCheckpoint, 'id' | 'createdAt' | 'timestamp'> & { id?: string; timestamp?: Date; createdAt?: Date }): Promise<AgentCheckpoint> {
    const id = checkpointData.id ?? `agent_checkpoint_${this.nextId++}`;
    const checkpoint: AgentCheckpoint = {
      id,
      projectId: checkpointData.projectId,
      agentType: checkpointData.agentType,
      stepName: checkpointData.stepName,
      status: checkpointData.status ?? 'pending',
      message: checkpointData.message ?? '',
      data: checkpointData.data ?? null,
      userFeedback: checkpointData.userFeedback ?? null,
      requiresUserInput: checkpointData.requiresUserInput ?? false,
      timestamp: checkpointData.timestamp ?? new Date(),
      createdAt: checkpointData.createdAt ?? new Date(),
    } as AgentCheckpoint;

    this.agentCheckpoints.set(id, checkpoint);
    return checkpoint;
  }

  async getProjectCheckpoints(projectId: string): Promise<AgentCheckpoint[]> {
    return Array.from(this.agentCheckpoints.values())
      .filter(cp => cp.projectId === projectId)
      .sort((a, b) => (b.timestamp?.getTime?.() ?? 0) - (a.timestamp?.getTime?.() ?? 0));
  }

  async updateAgentCheckpoint(checkpointId: string, updates: Partial<Omit<AgentCheckpoint, 'id' | 'createdAt'>>): Promise<AgentCheckpoint | null> {
    const existing = this.agentCheckpoints.get(checkpointId);
    if (!existing) {
      return null;
    }

    const updated: AgentCheckpoint = {
      ...existing,
      ...updates,
      timestamp: updates.timestamp ?? existing.timestamp,
    } as AgentCheckpoint;

    this.agentCheckpoints.set(checkpointId, updated);
    return updated;
  }

  async deleteProjectCheckpoints(projectId: string): Promise<void> {
    for (const [id, checkpoint] of this.agentCheckpoints.entries()) {
      if (checkpoint.projectId === projectId) {
        this.agentCheckpoints.delete(id);
      }
    }
  }

  async getProjectSession(projectId: string): Promise<ProjectSessionSnapshot | null> {
    return this.projectSessions.get(projectId) ?? null;
  }

  // Basic admin metrics for in-memory fallback
  async getUserCount(): Promise<number> {
    return this.users.size;
  }

  async getProjectCount(): Promise<number> {
    return this.projects.size;
  }

  async updateUserRole(userId: string, role: string): Promise<void> {
    const existing = this.users.get(userId);
    if (!existing) {
      return;
    }

    const updated = { ...existing, role } as User;
    this.users.set(userId, updated);
  }

  // Guided analysis operations
  async storeGuidedAnalysisOrder(id: string, order: any): Promise<void> {
    this.guidedAnalysisOrders.set(id, order);
  }

  async getGuidedAnalysisOrder(id: string): Promise<any> {
    return this.guidedAnalysisOrders.get(id);
  }

  async updateGuidedAnalysisOrder(id: string, updates: any): Promise<void> {
    const existing = this.guidedAnalysisOrders.get(id);
    if (existing) {
      this.guidedAnalysisOrders.set(id, { ...existing, ...updates });
    }
  }

  async listGuidedAnalysisOrders(userId?: string): Promise<any[]> {
    const orders = Array.from(this.guidedAnalysisOrders.values());
    if (userId) {
      return orders.filter(order => order.userId === userId);
    }
    return orders;
  }

  // Streaming Sources Management
  async createStreamingSource(sourceData: InsertStreamingSource): Promise<StreamingSource> {
    const id = `streaming_${this.nextId++}`;
    const source: StreamingSource = {
      ...sourceData,
      id,
      status: sourceData.status ?? "inactive",
      headers: sourceData.headers ?? null,
      params: sourceData.params ?? null,
      parseSpec: sourceData.parseSpec ?? null,
      batchSize: sourceData.batchSize ?? 1000,
      flushMs: sourceData.flushMs ?? 5000,
      maxBuffer: sourceData.maxBuffer ?? 100000,
      dedupeKeyPath: sourceData.dedupeKeyPath ?? null,
      timestampPath: sourceData.timestampPath ?? null,
      lastCheckpoint: sourceData.lastCheckpoint ?? null,
      lastError: sourceData.lastError ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.streamingSources.set(id, source);
    return source;
  }

  async getStreamingSource(id: string): Promise<StreamingSource | undefined> {
    return this.streamingSources.get(id);
  }

  async getStreamingSourcesByDataset(datasetId: string): Promise<StreamingSource[]> {
    return Array.from(this.streamingSources.values()).filter(source => source.datasetId === datasetId);
  }

  async updateStreamingSource(id: string, updates: Partial<StreamingSource>): Promise<StreamingSource | undefined> {
    const existing = this.streamingSources.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.streamingSources.set(id, updated);
    return updated;
  }

  async deleteStreamingSource(id: string): Promise<boolean> {
    return this.streamingSources.delete(id);
  }

  async startStreamingSource(id: string): Promise<boolean> {
    const source = this.streamingSources.get(id);
    if (!source) return false;
    const updated = { ...source, status: "active", updatedAt: new Date() };
    this.streamingSources.set(id, updated);
    return true;
  }

  async stopStreamingSource(id: string): Promise<boolean> {
    const source = this.streamingSources.get(id);
    if (!source) return false;
    const updated = { ...source, status: "inactive", updatedAt: new Date() };
    this.streamingSources.set(id, updated);
    return true;
  }

  async getActiveStreamingSources(): Promise<StreamingSource[]> {
    return Array.from(this.streamingSources.values()).filter(source => source.status === "active");
  }

  // Stream Chunks & Checkpoints
  async createStreamChunk(chunkData: InsertStreamChunk): Promise<StreamChunk> {
    const id = `chunk_${this.nextId++}`;
    const chunk: StreamChunk = {
      ...chunkData,
      id,
      checksum: chunkData.checksum ?? null,
      createdAt: new Date(),
    };
    
    this.streamChunks.set(id, chunk);
    return chunk;
  }

  async getStreamChunks(datasetId: string, limit?: number): Promise<StreamChunk[]> {
    const chunks = Array.from(this.streamChunks.values())
      .filter(chunk => chunk.datasetId === datasetId)
      .sort((a, b) => b.seq - a.seq);
    return limit ? chunks.slice(0, limit) : chunks;
  }

  async getStreamChunksByTimeRange(datasetId: string, fromTs: Date, toTs: Date): Promise<StreamChunk[]> {
    return Array.from(this.streamChunks.values())
      .filter(chunk => 
        chunk.datasetId === datasetId && 
        chunk.fromTs >= fromTs && 
        chunk.toTs <= toTs
      )
      .sort((a, b) => a.fromTs.getTime() - b.fromTs.getTime());
  }

  async createStreamCheckpoint(checkpointData: InsertStreamCheckpoint): Promise<StreamCheckpoint> {
    const id = `checkpoint_${this.nextId++}`;
    const checkpoint: StreamCheckpoint = {
      ...checkpointData,
      id,
      ts: checkpointData.ts ?? new Date(),
    };
    
    this.streamCheckpoints.set(id, checkpoint);
    return checkpoint;
  }

  async getLatestCheckpoint(sourceId: string): Promise<StreamCheckpoint | undefined> {
    const checkpoints = Array.from(this.streamCheckpoints.values())
      .filter(checkpoint => checkpoint.sourceId === sourceId)
      .sort((a, b) => {
        const aTime = a.ts?.getTime() ?? 0;
        const bTime = b.ts?.getTime() ?? 0;
        return bTime - aTime;
      });
    return checkpoints[0];
  }

  async updateCheckpoint(sourceId: string, cursor: string): Promise<boolean> {
    const latest = await this.getLatestCheckpoint(sourceId);
    if (latest) {
      const updated = { ...latest, cursor, ts: new Date() };
      this.streamCheckpoints.set(latest.id, updated);
      return true;
    }
    // Create new checkpoint if none exists
    await this.createStreamCheckpoint({ id: `checkpoint_${this.nextId++}`, sourceId, cursor, ts: new Date() } as InsertStreamCheckpoint);
    return true;
  }

  // Scraping Jobs Management
  async createScrapingJob(jobData: InsertScrapingJob): Promise<ScrapingJob> {
    const id = `job_${this.nextId++}`;
    const job: ScrapingJob = {
      ...jobData,
      id,
      schedule: jobData.schedule ?? null,
      extractionSpec: jobData.extractionSpec ?? null,
      paginationSpec: jobData.paginationSpec ?? null,
      loginSpec: jobData.loginSpec ?? null,
      rateLimitRPM: jobData.rateLimitRPM ?? 60,
      concurrency: jobData.concurrency ?? 1,
      respectRobots: jobData.respectRobots ?? true,
      status: jobData.status ?? "inactive",
      lastRunAt: jobData.lastRunAt ?? null,
      nextRunAt: jobData.nextRunAt ?? null,
      lastError: jobData.lastError ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.scrapingJobs.set(id, job);
    return job;
  }

  async getScrapingJob(id: string): Promise<ScrapingJob | undefined> {
    return this.scrapingJobs.get(id);
  }

  async getScrapingJobsByDataset(datasetId: string): Promise<ScrapingJob[]> {
    return Array.from(this.scrapingJobs.values()).filter(job => job.datasetId === datasetId);
  }

  async updateScrapingJob(id: string, updates: Partial<ScrapingJob>): Promise<ScrapingJob | undefined> {
    const existing = this.scrapingJobs.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.scrapingJobs.set(id, updated);
    return updated;
  }

  async deleteScrapingJob(id: string): Promise<boolean> {
    return this.scrapingJobs.delete(id);
  }

  async getJobsToRun(): Promise<ScrapingJob[]> {
    const now = new Date();
    return Array.from(this.scrapingJobs.values())
      .filter(job => 
        job.status === "active" && 
        job.nextRunAt && 
        job.nextRunAt <= now
      );
  }

  async updateJobNextRun(id: string, nextRunAt: Date): Promise<boolean> {
    const job = this.scrapingJobs.get(id);
    if (!job) return false;
    const updated = { ...job, nextRunAt, updatedAt: new Date() };
    this.scrapingJobs.set(id, updated);
    return true;
  }

  // Scraping Runs
  async createScrapingRun(runData: InsertScrapingRun): Promise<ScrapingRun> {
    const id = `run_${this.nextId++}`;
    const run: ScrapingRun = {
      ...runData,
      id,
      startedAt: runData.startedAt ?? new Date(),
      finishedAt: runData.finishedAt ?? null,
      status: runData.status ?? "running",
      recordCount: runData.recordCount ?? null,
      artifactId: runData.artifactId ?? null,
      createdAt: new Date(),
    };
    
    this.scrapingRuns.set(id, run);
    return run;
  }

  async getScrapingRuns(jobId: string, limit?: number): Promise<ScrapingRun[]> {
    const runs = Array.from(this.scrapingRuns.values())
      .filter(run => run.jobId === jobId)
      .sort((a, b) => {
        const aTime = a.startedAt?.getTime() ?? 0;
        const bTime = b.startedAt?.getTime() ?? 0;
        return bTime - aTime;
      });
    return limit ? runs.slice(0, limit) : runs;
  }

  async updateScrapingRun(id: string, updates: Partial<ScrapingRun>): Promise<ScrapingRun | undefined> {
    const existing = this.scrapingRuns.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.scrapingRuns.set(id, updated);
    return updated;
  }

  async getLatestScrapingRun(jobId: string): Promise<ScrapingRun | undefined> {
    const runs = await this.getScrapingRuns(jobId, 1);
    return runs[0];
  }

  // Dataset Versions
  async createDatasetVersion(versionData: InsertDatasetVersion): Promise<DatasetVersion> {
    const id = `version_${this.nextId++}`;
    const version: DatasetVersion = {
      ...versionData,
      id,
      schema: versionData.schema ?? null,
      createdAt: new Date(),
    };
    
    this.datasetVersions.set(id, version);
    return version;
  }

  async getDatasetVersions(datasetId: string): Promise<DatasetVersion[]> {
    return Array.from(this.datasetVersions.values())
      .filter(version => version.datasetId === datasetId)
      .sort((a, b) => b.version - a.version);
  }

  async getLatestDatasetVersion(datasetId: string): Promise<DatasetVersion | undefined> {
    const versions = await this.getDatasetVersions(datasetId);
    return versions[0];
  }

  async deleteDatasetVersion(id: string): Promise<boolean> {
    return this.datasetVersions.delete(id);
  }

  // Cost Estimates - MemStorage Implementation
  async createCostEstimate(estimateData: InsertCostEstimate): Promise<CostEstimate> {
    const id = `estimate_${this.nextId++}`;
    const estimate: CostEstimate = {
      ...estimateData,
      id,
      createdAt: new Date(),
      estimateType: estimateData.estimateType as 'preparation' | 'data_processing' | 'analysis' | 'full_journey',
      items: estimateData.items as { description: string; quantity: number; unitPrice: number; total: number; }[],
      discounts: estimateData.discounts ?? 0,
      taxes: estimateData.taxes ?? 0,
      currency: estimateData.currency ?? 'USD',
      approved: estimateData.approved ?? false,
      approvedAt: estimateData.approvedAt ?? null,
      journeyId: estimateData.journeyId ?? null,
    };
    
    this.costEstimates.set(id, estimate);
    return estimate;
  }

  async getCostEstimate(id: string): Promise<CostEstimate | undefined> {
    return this.costEstimates.get(id);
  }

  async getCostEstimatesByUser(userId: string): Promise<CostEstimate[]> {
    return Array.from(this.costEstimates.values())
      .filter(estimate => estimate.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getCostEstimatesByJourney(journeyId: string): Promise<CostEstimate[]> {
    return Array.from(this.costEstimates.values())
      .filter(estimate => estimate.journeyId === journeyId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateCostEstimate(id: string, updates: Partial<CostEstimate>): Promise<CostEstimate | undefined> {
    const existing = this.costEstimates.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.costEstimates.set(id, updated);
    return updated;
  }

  async getValidCostEstimates(userId: string): Promise<CostEstimate[]> {
    const now = new Date();
    return Array.from(this.costEstimates.values())
      .filter(estimate => 
        estimate.userId === userId && 
        estimate.validUntil > now
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Eligibility Checks - MemStorage Implementation
  async createEligibilityCheck(checkData: InsertEligibilityCheck): Promise<EligibilityCheck> {
    const id = `eligibility_${this.nextId++}`;
    const check: EligibilityCheck = {
      ...checkData,
      id,
      createdAt: new Date(),
      checkResult: checkData.checkResult as 'allowed' | 'limit_exceeded' | 'tier_required' | 'payment_required',
      reason: checkData.reason ?? null,
      requiredTier: checkData.requiredTier ?? null,
      currentUsage: checkData.currentUsage as { monthly?: number; total?: number; } | undefined,
      limits: checkData.limits as { monthly?: number; total?: number; } | undefined,
      nextResetAt: checkData.nextResetAt ?? null,
    };
    
    this.eligibilityChecks.set(id, check);
    return check;
  }

  async getEligibilityCheck(id: string): Promise<EligibilityCheck | undefined> {
    return this.eligibilityChecks.get(id);
  }

  async getEligibilityChecksByUser(userId: string): Promise<EligibilityCheck[]> {
    return Array.from(this.eligibilityChecks.values())
      .filter(check => check.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getEligibilityChecksByFeature(userId: string, feature: string): Promise<EligibilityCheck[]> {
    return Array.from(this.eligibilityChecks.values())
      .filter(check => check.userId === userId && check.feature === feature)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getLatestEligibilityCheck(userId: string, feature: string): Promise<EligibilityCheck | undefined> {
    const checks = await this.getEligibilityChecksByFeature(userId, feature);
    return checks[0];
  }
}

export class DatabaseStorage implements IStorage {
  private async getProjectStateRow(projectId: string): Promise<ProjectStateRow | undefined> {
    const [row] = await db
      .select()
      .from(projectStates)
      .where(eq(projectStates.projectId, projectId));

    return row as ProjectStateRow | undefined;
  }

  private async upsertProjectState(
    projectId: string,
    updates: Record<string, unknown>,
    options?: { replace?: boolean }
  ): Promise<Record<string, unknown>> {
    if (!Object.keys(updates).length && !options?.replace) {
      const existingRow = await this.getProjectStateRow(projectId);
      return (existingRow?.state as Record<string, unknown>) ?? {};
    }

    const existingRow = await this.getProjectStateRow(projectId);
    const existingState = (existingRow?.state as Record<string, unknown>) ?? {};
    const nextState = options?.replace
      ? { ...updates }
      : mergeStatePayload(existingState, updates);

    const timestamp = new Date();

    if (existingRow) {
      await db
        .update(projectStates)
        .set({
          state: nextState,
          updatedAt: timestamp,
        })
        .where(eq(projectStates.projectId, projectId));
    } else {
      await db
        .insert(projectStates)
        .values({
          projectId,
          state: nextState,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: projectStates.projectId,
          set: {
            state: nextState,
            updatedAt: timestamp,
          },
        });
    }

    return nextState;
  }

  // Project operations
  async createProject(projectData: InsertDataProject): Promise<DataProject> {
    const insertData = dataProjectToInsertProject(projectData);
    if (!insertData.userId) {
      throw new Error('createProject: userId is required');
    }

    const [project] = await db
      .insert(projects)
      .values({
        ...insertData,
        id: nanoid(),
      })
      .returning();

    const stateUpdates = projectUpdatesToState(projectData as Partial<DataProject>);
    const state = await this.upsertProjectState(project.id, stateUpdates, { replace: !Object.keys(stateUpdates).length });

    return projectToDataProject(project, undefined, state);
  }

  async getProject(id: string): Promise<DataProject | undefined> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id));
    
    if (!project) {
      return undefined;
    }

    const dataset = await this.getDatasetForProject(project.id);
    const stateRow = await this.getProjectStateRow(project.id);
    return projectToDataProject(project, dataset, stateRow);
  }

  async getAllProjects(): Promise<DataProject[]> {
    const allProjects = await db.select().from(projects);
    return Promise.all(
      allProjects.map(async (project: Project) => {
        const dataset = await this.getDatasetForProject(project.id);
        const stateRow = await this.getProjectStateRow(project.id);
        return projectToDataProject(project, dataset, stateRow);
      })
    );
  }

  async updateProject(id: string, updates: Partial<DataProject>): Promise<DataProject | undefined> {
    const dbUpdates = projectUpdatesToDb(updates);
    const stateUpdates = projectUpdatesToState(updates);

    let projectRecord: Project | undefined;

    if (Object.keys(dbUpdates).length === 0) {
      const [existingProject] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, id));
      projectRecord = existingProject;
    } else {
      const [project] = await db
        .update(projects)
        .set(dbUpdates)
        .where(eq(projects.id, id))
        .returning();

      projectRecord = project;
    }

    if (!projectRecord) {
      return undefined;
    }

    const state = await this.upsertProjectState(id, stateUpdates);
    const dataset = await this.getDatasetForProject(projectRecord.id);
    return projectToDataProject(projectRecord, dataset, state);
  }

  async deleteProject(id: string): Promise<boolean> {
    const result = await db
      .delete(projects)
      .where(eq(projects.id, id));
    
    return (result.rowCount || 0) > 0;
  }

  // User operations
  async createUser(userData: Partial<InsertUser> & { email: string }): Promise<User> {
    const [dbUser] = await db
      .insert(users)
      .values({
        ...(userData as any),
        id: (userData as any).id || nanoid(),
        createdAt: (userData as any).createdAt ?? new Date(),
        updatedAt: (userData as any).updatedAt ?? new Date(),
      })
      .returning();
    return dbUser as User;
  }

  async getUser(id: string): Promise<User | undefined> {
    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, id));

    if (!dbUser) {
      return undefined;
    }

    return dbUser as User;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));

    if (!dbUser) {
      return undefined;
    }

    return dbUser as User;
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.emailVerificationToken, token));

    if (!dbUser) {
      return undefined;
    }

    return dbUser as User;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const updatePayload: Record<string, any> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && key !== "id") {
        updatePayload[key] = value;
      }
    }

    if (!Object.keys(updatePayload).length) {
      return this.getUser(id);
    }

    updatePayload.updatedAt = new Date();

    const [dbUser] = await db
      .update(users)
      .set(updatePayload as Partial<InsertUser>)
      .where(eq(users.id, id))
      .returning();

    if (!dbUser) {
      return undefined;
    }

    return dbUser as User;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db
      .delete(users)
      .where(eq(users.id, id));

    return (result.rowCount || 0) > 0;
  }

  async getAllUsers(): Promise<User[]> {
    const dbUsers = await db.select().from(users);
    return dbUsers as User[];
  }

  // Add missing authentication methods for DatabaseStorage
  async validateUserCredentials(email: string, password: string): Promise<User | null> {
    const user = await this.getUserByEmail(email);
    if (!user || !user.hashedPassword) return null;
    
    const bcrypt = await import('bcrypt');
    const isValid = await bcrypt.compare(password, user.hashedPassword);
    return isValid ? user : null;
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await db.update(users)
      .set({ 
        hashed_password: hashedPassword, // Map to database hashed_password field
        updated_at: new Date() 
      })
      .where(eq(users.id, userId));
  }

  // Guided analysis storage
  async storeGuidedAnalysisOrder(id: string, order: any): Promise<void> {
    await db
      .insert(guidedAnalysisOrders)
      .values({
        id,
        ...order,
      })
      .onConflictDoUpdate({
        target: guidedAnalysisOrders.id,
        set: {
          ...order,
          updatedAt: new Date(),
        },
      });
  }

  async getGuidedAnalysisOrder(id: string): Promise<any> {
    const [order] = await db
      .select()
      .from(guidedAnalysisOrders)
      .where(eq(guidedAnalysisOrders.id, id));
    
    return order;
  }

  async updateGuidedAnalysisOrder(id: string, updates: any): Promise<void> {
    await db
      .update(guidedAnalysisOrders)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(guidedAnalysisOrders.id, id));
  }

  async listGuidedAnalysisOrders(userId?: string): Promise<any[]> {
    if (userId) {
      return await db
        .select()
        .from(guidedAnalysisOrders)
        .where(eq(guidedAnalysisOrders.userId, userId));
    }
    
    return await db.select().from(guidedAnalysisOrders);
  }

  // Enterprise inquiries operations
  async createEnterpriseInquiry(inquiryData: InsertEnterpriseInquiry): Promise<EnterpriseInquiry> {
    const [inquiry] = await db
      .insert(enterpriseInquiries)
      .values({
        ...inquiryData,
        id: nanoid(),
      })
      .returning();
    
    return inquiry;
  }

  async getEnterpriseInquiry(id: string): Promise<EnterpriseInquiry | undefined> {
    const [inquiry] = await db
      .select()
      .from(enterpriseInquiries)
      .where(eq(enterpriseInquiries.id, id));
    
    return inquiry || undefined;
  }

  async listEnterpriseInquiries(): Promise<EnterpriseInquiry[]> {
    return await db.select().from(enterpriseInquiries);
  }

  // Get all projects for a user
  async getProjectsByOwner(userId: string): Promise<DataProject[]> {
    console.log("[DATABASE STORAGE] getProjectsByOwner called for userId:", userId);
    const userProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId));

    return Promise.all(
      userProjects.map(async (project: Project) => {
        const dataset = await this.getDatasetForProject(project.id);
        const stateRow = await this.getProjectStateRow(project.id);
        return projectToDataProject(project, dataset, stateRow);
      })
    );
  }

  // Dataset operations
  async createDataset(datasetData: InsertDataset): Promise<Dataset> {
    const normalized = { ...(datasetData as any) } as InsertDataset & { ownerId?: string };
    const resolvedUserId = normalized.userId ?? normalized.ownerId;

    if (!resolvedUserId) {
      throw new Error("createDataset requires a userId or ownerId");
    }

    normalized.userId = resolvedUserId;
    delete (normalized as any).ownerId;

    const datasetId = normalized.id ?? nanoid();

    const [dataset] = await db
      .insert(datasets)
      .values({
        ...normalized,
        id: datasetId,
      })
      .returning();
    
    return dataset;
  }

  async getDataset(id: string): Promise<Dataset | undefined> {
    const [dataset] = await db
      .select()
      .from(datasets)
      .where(eq(datasets.id, id));
    
    return dataset || undefined;
  }

  async getDatasetsByOwner(userId: string): Promise<Dataset[]> {
    return await db
      .select()
      .from(datasets)
      .where(eq(datasets.userId, userId));
  }

  async updateDataset(id: string, updates: Partial<Dataset>): Promise<Dataset | undefined> {
    const [dataset] = await db
      .update(datasets)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(datasets.id, id))
      .returning();
    
    return dataset || undefined;
  }

  async deleteDataset(id: string): Promise<boolean> {
    const result = await db
      .delete(datasets)
      .where(eq(datasets.id, id));
    
    return (result.rowCount || 0) > 0;
  }

  async searchDatasets(userId: string, query?: string): Promise<Dataset[]> {
    let dbQuery = db
      .select()
      .from(datasets)
      .where(eq(datasets.userId, userId));

    if (query) {
      // Use ilike for case-insensitive search on file name
      const { ilike } = await import("drizzle-orm");
      dbQuery = db
        .select()
        .from(datasets)
        .where(
          eq(datasets.userId, userId)
        );
      // Note: For proper search functionality, we would need to add the ilike condition
      // For now, return all owner datasets and filter in memory
      const allDatasets = await dbQuery;
      return allDatasets.filter((dataset: Dataset) => 
        dataset.originalFileName.toLowerCase().includes(query.toLowerCase())
      );
    }

    return await dbQuery;
  }

  // Project-Dataset associations
  async addDatasetToProject(projectId: string, datasetId: string, role = 'primary', alias?: string): Promise<ProjectDataset> {
    const [association] = await db
      .insert(projectDatasets)
      .values({
        id: nanoid(),
        projectId,
        datasetId,
        role,
        alias: alias || null,
      })
      .returning();
    
    return association;
  }

  async linkProjectToDataset(projectId: string, datasetId: string, role = 'primary', alias?: string): Promise<ProjectDataset> {
    // Simple alias for clarity at call sites
    return this.addDatasetToProject(projectId, datasetId, role, alias);
  }

  async removeDatasetFromProject(projectId: string, datasetId: string): Promise<boolean> {
    const { and } = await import("drizzle-orm");
    const result = await db
      .delete(projectDatasets)
      .where(
        and(
          eq(projectDatasets.projectId, projectId),
          eq(projectDatasets.datasetId, datasetId)
        )
      );
    
    return (result.rowCount || 0) > 0;
  }

  async getProjectDatasets(projectId: string): Promise<{ dataset: Dataset; association: ProjectDataset }[]> {
    const results = await db
      .select()
      .from(projectDatasets)
      .innerJoin(datasets, eq(projectDatasets.datasetId, datasets.id))
      .where(eq(projectDatasets.projectId, projectId));

    return results.map((result: any) => ({
      dataset: result.datasets,
      association: result.project_datasets,
    }));
  }

  async getDatasetForProject(projectId: string): Promise<Dataset | undefined> {
    // Get a single dataset for the project (most recent by id desc as a heuristic)
    const { desc } = await import("drizzle-orm");
    const results = await db
      .select()
      .from(projectDatasets)
      .innerJoin(datasets, eq(projectDatasets.datasetId, datasets.id))
      .where(eq(projectDatasets.projectId, projectId))
      .orderBy(desc(projectDatasets.id))
      .limit(1);

    const first = (results as any[])[0];
    return first ? (first.datasets as Dataset) : undefined;
  }

  async getDatasetProjects(datasetId: string): Promise<{ project: DataProject; association: ProjectDataset }[]> {
    const results = await db
      .select()
      .from(projectDatasets)
      .innerJoin(projects, eq(projectDatasets.projectId, projects.id))
      .innerJoin(datasets, eq(projectDatasets.datasetId, datasets.id))
      .where(eq(projectDatasets.datasetId, datasetId));

    return results.map((result: any) => ({
      project: projectToDataProject(result.projects, result.datasets),
      association: result.project_datasets,
    }));
  }

  // Project Artifacts
  async createArtifact(artifactData: InsertProjectArtifact): Promise<ProjectArtifact> {
    const [artifact] = await db
      .insert(projectArtifacts)
      .values({
        ...artifactData,
        id: nanoid(),
      })
      .returning();
    
    return artifact;
  }

  async getArtifact(id: string): Promise<ProjectArtifact | undefined> {
    const [artifact] = await db
      .select()
      .from(projectArtifacts)
      .where(eq(projectArtifacts.id, id));
    
    return artifact || undefined;
  }

  async getProjectArtifacts(projectId: string, type?: string): Promise<ProjectArtifact[]> {
    let query = db
      .select()
      .from(projectArtifacts)
      .where(eq(projectArtifacts.projectId, projectId));

    if (type) {
      const { and } = await import("drizzle-orm");
      query = db
        .select()
        .from(projectArtifacts)
        .where(
          and(
            eq(projectArtifacts.projectId, projectId),
            eq(projectArtifacts.type, type)
          )
        );
    }

    return await query;
  }

  async updateArtifact(id: string, updates: Partial<ProjectArtifact>): Promise<ProjectArtifact | undefined> {
    const [artifact] = await db
      .update(projectArtifacts)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(projectArtifacts.id, id))
      .returning();
    
    return artifact || undefined;
  }

  async getArtifactChain(artifactId: string): Promise<ProjectArtifact[]> {
    const result: ProjectArtifact[] = [];
    let currentId: string | null = artifactId;

    // Traverse the chain from the given artifact up to the root
    while (currentId) {
      const artifact = await this.getArtifact(currentId);
      if (!artifact) break;
      
      result.unshift(artifact); // Add to beginning to maintain order
      currentId = artifact.parentArtifactId;
    }

    return result;
  }

  // Streaming Sources Management
  async createStreamingSource(sourceData: InsertStreamingSource): Promise<StreamingSource> {
    const [source] = await db
      .insert(streamingSources)
      .values({
        ...sourceData,
        id: nanoid(),
      })
      .returning();
    
    return source;
  }

  async getStreamingSource(id: string): Promise<StreamingSource | undefined> {
    const [source] = await db
      .select()
      .from(streamingSources)
      .where(eq(streamingSources.id, id));
    
    return source || undefined;
  }

  async getStreamingSourcesByDataset(datasetId: string): Promise<StreamingSource[]> {
    return await db
      .select()
      .from(streamingSources)
      .where(eq(streamingSources.datasetId, datasetId));
  }

  async updateStreamingSource(id: string, updates: Partial<StreamingSource>): Promise<StreamingSource | undefined> {
    const [source] = await db
      .update(streamingSources)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(streamingSources.id, id))
      .returning();
    
    return source || undefined;
  }

  async deleteStreamingSource(id: string): Promise<boolean> {
    const result = await db
      .delete(streamingSources)
      .where(eq(streamingSources.id, id));
    
    return (result.rowCount || 0) > 0;
  }

  async startStreamingSource(id: string): Promise<boolean> {
    const result = await db
      .update(streamingSources)
      .set({
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(streamingSources.id, id));
    
    return (result.rowCount || 0) > 0;
  }

  async stopStreamingSource(id: string): Promise<boolean> {
    const result = await db
      .update(streamingSources)
      .set({
        status: "inactive",
        updatedAt: new Date(),
      })
      .where(eq(streamingSources.id, id));
    
    return (result.rowCount || 0) > 0;
  }

  async getActiveStreamingSources(): Promise<StreamingSource[]> {
    return await db
      .select()
      .from(streamingSources)
      .where(eq(streamingSources.status, "active"));
  }

  // Stream Chunks & Checkpoints
  async createStreamChunk(chunkData: InsertStreamChunk): Promise<StreamChunk> {
    const [chunk] = await db
      .insert(streamChunks)
      .values({
        ...chunkData,
        id: nanoid(),
      })
      .returning();
    
    return chunk;
  }

  async getStreamChunks(datasetId: string, limit?: number): Promise<StreamChunk[]> {
    const baseQuery = db
      .select()
      .from(streamChunks)
      .where(eq(streamChunks.datasetId, datasetId))
      .orderBy(streamChunks.seq);
    
    if (limit) {
      return await baseQuery.limit(limit);
    }
    
    return await baseQuery;
  }

  async getStreamChunksByTimeRange(datasetId: string, fromTs: Date, toTs: Date): Promise<StreamChunk[]> {
    const { and, gte, lte } = await import("drizzle-orm");
    return await db
      .select()
      .from(streamChunks)
      .where(
        and(
          eq(streamChunks.datasetId, datasetId),
          gte(streamChunks.fromTs, fromTs),
          lte(streamChunks.toTs, toTs)
        )
      )
      .orderBy(streamChunks.fromTs);
  }

  async createStreamCheckpoint(checkpointData: InsertStreamCheckpoint): Promise<StreamCheckpoint> {
    const [checkpoint] = await db
      .insert(streamCheckpoints)
      .values({
        ...checkpointData,
        id: nanoid(),
      })
      .returning();
    
    return checkpoint;
  }

  async getLatestCheckpoint(sourceId: string): Promise<StreamCheckpoint | undefined> {
    const { desc } = await import("drizzle-orm");
    const [checkpoint] = await db
      .select()
      .from(streamCheckpoints)
      .where(eq(streamCheckpoints.sourceId, sourceId))
      .orderBy(desc(streamCheckpoints.ts))
      .limit(1);
    
    return checkpoint || undefined;
  }

  async updateCheckpoint(sourceId: string, cursor: string): Promise<boolean> {
    const latest = await this.getLatestCheckpoint(sourceId);
    if (latest) {
      const result = await db
        .update(streamCheckpoints)
        .set({
          cursor,
          ts: new Date(),
        })
        .where(eq(streamCheckpoints.id, latest.id));
      
      return (result.rowCount || 0) > 0;
    }
    
    // Create new checkpoint if none exists
    await this.createStreamCheckpoint({ id: nanoid(), sourceId, cursor } as InsertStreamCheckpoint);
    return true;
  }

  // Scraping Jobs Management
  async createScrapingJob(jobData: InsertScrapingJob): Promise<ScrapingJob> {
    const [job] = await db
      .insert(scrapingJobs)
      .values({
        ...jobData,
        id: nanoid(),
      })
      .returning();
    
    return job;
  }

  async getScrapingJob(id: string): Promise<ScrapingJob | undefined> {
    const [job] = await db
      .select()
      .from(scrapingJobs)
      .where(eq(scrapingJobs.id, id));
    
    return job || undefined;
  }

  async getScrapingJobsByDataset(datasetId: string): Promise<ScrapingJob[]> {
    return await db
      .select()
      .from(scrapingJobs)
      .where(eq(scrapingJobs.datasetId, datasetId));
  }

  async updateScrapingJob(id: string, updates: Partial<ScrapingJob>): Promise<ScrapingJob | undefined> {
    const [job] = await db
      .update(scrapingJobs)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(scrapingJobs.id, id))
      .returning();
    
    return job || undefined;
  }

  async deleteScrapingJob(id: string): Promise<boolean> {
    const result = await db
      .delete(scrapingJobs)
      .where(eq(scrapingJobs.id, id));
    
    return (result.rowCount || 0) > 0;
  }

  async getJobsToRun(): Promise<ScrapingJob[]> {
    const { and, lte } = await import("drizzle-orm");
    const now = new Date();
    return await db
      .select()
      .from(scrapingJobs)
      .where(
        and(
          eq(scrapingJobs.status, "active"),
          lte(scrapingJobs.nextRunAt, now)
        )
      );
  }

  async updateJobNextRun(id: string, nextRunAt: Date): Promise<boolean> {
    const result = await db
      .update(scrapingJobs)
      .set({
        nextRunAt,
        updatedAt: new Date(),
      })
      .where(eq(scrapingJobs.id, id));
    
    return (result.rowCount || 0) > 0;
  }

  // Scraping Runs
  async createScrapingRun(runData: InsertScrapingRun): Promise<ScrapingRun> {
    const [run] = await db
      .insert(scrapingRuns)
      .values({
        ...runData,
        id: nanoid(),
      })
      .returning();
    
    return run;
  }

  async getScrapingRuns(jobId: string, limit?: number): Promise<ScrapingRun[]> {
    const { desc } = await import("drizzle-orm");
    const baseQuery = db
      .select()
      .from(scrapingRuns)
      .where(eq(scrapingRuns.jobId, jobId))
      .orderBy(desc(scrapingRuns.startedAt));
    
    if (limit) {
      return await baseQuery.limit(limit);
    }
    
    return await baseQuery;
  }

  async updateScrapingRun(id: string, updates: Partial<ScrapingRun>): Promise<ScrapingRun | undefined> {
    const [run] = await db
      .update(scrapingRuns)
      .set(updates)
      .where(eq(scrapingRuns.id, id))
      .returning();
    
    return run || undefined;
  }

  async getLatestScrapingRun(jobId: string): Promise<ScrapingRun | undefined> {
    const runs = await this.getScrapingRuns(jobId, 1);
    return runs[0];
  }

  // Dataset Versions
  async createDatasetVersion(versionData: InsertDatasetVersion): Promise<DatasetVersion> {
    const [version] = await db
      .insert(datasetVersions)
      .values({
        ...versionData,
        id: nanoid(),
      })
      .returning();
    
    return version;
  }

  async getDatasetVersions(datasetId: string): Promise<DatasetVersion[]> {
    const { desc } = await import("drizzle-orm");
    return await db
      .select()
      .from(datasetVersions)
      .where(eq(datasetVersions.datasetId, datasetId))
      .orderBy(desc(datasetVersions.version));
  }

  async getLatestDatasetVersion(datasetId: string): Promise<DatasetVersion | undefined> {
    const versions = await this.getDatasetVersions(datasetId);
    return versions[0];
  }

  async deleteDatasetVersion(id: string): Promise<boolean> {
    const result = await db
      .delete(datasetVersions)
      .where(eq(datasetVersions.id, id));
    
    return (result.rowCount || 0) > 0;
  }

  // Cost Estimates - DatabaseStorage Implementation
  async createCostEstimate(estimateData: InsertCostEstimate): Promise<CostEstimate> {
    const [estimate] = await db
      .insert(costEstimates)
      .values({
        ...estimateData,
        id: nanoid(),
      })
      .returning();
    
    return {
      ...estimate,
      estimateType: estimate.estimateType as 'preparation' | 'data_processing' | 'analysis' | 'full_journey',
      items: estimate.items as { description: string; quantity: number; unitPrice: number; total: number; }[],
      discounts: estimate.discounts ?? 0,
      taxes: estimate.taxes ?? 0,
      currency: estimate.currency ?? 'USD',
      approved: estimate.approved ?? false,
      approvedAt: estimate.approvedAt ?? undefined,
      journeyId: estimate.journeyId ?? undefined
    };
  }

  async getCostEstimate(id: string): Promise<CostEstimate | undefined> {
    const [estimate] = await db
      .select()
      .from(costEstimates)
      .where(eq(costEstimates.id, id));
    
    if (!estimate) return undefined;
    
    return {
      ...estimate,
      estimateType: estimate.estimateType as 'preparation' | 'data_processing' | 'analysis' | 'full_journey',
      items: estimate.items as { description: string; quantity: number; unitPrice: number; total: number; }[],
      discounts: estimate.discounts ?? 0,
      taxes: estimate.taxes ?? 0,
      currency: estimate.currency ?? 'USD',
      approved: estimate.approved ?? false,
      approvedAt: estimate.approvedAt ?? undefined,
      journeyId: estimate.journeyId ?? undefined
    };
  }

  async getCostEstimatesByUser(userId: string): Promise<CostEstimate[]> {
    const { desc } = await import("drizzle-orm");
    const estimates = await db
      .select()
      .from(costEstimates)
      .where(eq(costEstimates.userId, userId))
      .orderBy(desc(costEstimates.createdAt));
    
    return estimates.map((estimate: any) => ({
      ...estimate,
      estimateType: estimate.estimateType as 'preparation' | 'data_processing' | 'analysis' | 'full_journey',
      items: estimate.items as { description: string; quantity: number; unitPrice: number; total: number; }[],
      discounts: estimate.discounts ?? 0,
      taxes: estimate.taxes ?? 0,
      currency: estimate.currency ?? 'USD',
      approved: estimate.approved ?? false,
      approvedAt: estimate.approvedAt ?? null,
      journeyId: estimate.journeyId ?? null
    }));
  }

  async getCostEstimatesByJourney(journeyId: string): Promise<CostEstimate[]> {
    const { desc } = await import("drizzle-orm");
    const estimates = await db
      .select()
      .from(costEstimates)
      .where(eq(costEstimates.journeyId, journeyId))
      .orderBy(desc(costEstimates.createdAt));
    
    return estimates.map((estimate: any) => ({
      ...estimate,
      estimateType: estimate.estimateType as 'preparation' | 'data_processing' | 'analysis' | 'full_journey',
      items: estimate.items as { description: string; quantity: number; unitPrice: number; total: number; }[],
      discounts: estimate.discounts ?? 0,
      taxes: estimate.taxes ?? 0,
      currency: estimate.currency ?? 'USD',
      approved: estimate.approved ?? false,
      approvedAt: estimate.approvedAt ?? null,
      journeyId: estimate.journeyId ?? null
    }));
  }

  async updateCostEstimate(id: string, updates: Partial<CostEstimate>): Promise<CostEstimate | undefined> {
    const [estimate] = await db
      .update(costEstimates)
      .set(updates)
      .where(eq(costEstimates.id, id))
      .returning();
    
    if (!estimate) return undefined;
    
    return {
      ...estimate,
      estimateType: estimate.estimateType as 'preparation' | 'data_processing' | 'analysis' | 'full_journey',
      items: estimate.items as { description: string; quantity: number; unitPrice: number; total: number; }[],
      discounts: estimate.discounts ?? 0,
      taxes: estimate.taxes ?? 0,
      currency: estimate.currency ?? 'USD',
      approved: estimate.approved ?? false,
      approvedAt: estimate.approvedAt ?? null,
      journeyId: estimate.journeyId ?? null
    };
  }

  async getValidCostEstimates(userId: string): Promise<CostEstimate[]> {
    const { desc, gt, and } = await import("drizzle-orm");
    const now = new Date();
    const estimates = await db
      .select()
      .from(costEstimates)
      .where(
        and(
          eq(costEstimates.userId, userId),
          gt(costEstimates.validUntil, now)
        )
      )
      .orderBy(desc(costEstimates.createdAt));
    
    return estimates.map((estimate: any) => ({
      ...estimate,
      estimateType: estimate.estimateType as 'preparation' | 'data_processing' | 'analysis' | 'full_journey',
      items: estimate.items as { description: string; quantity: number; unitPrice: number; total: number; }[],
      discounts: estimate.discounts ?? 0,
      taxes: estimate.taxes ?? 0,
      currency: estimate.currency ?? 'USD',
      approved: estimate.approved ?? false,
      approvedAt: estimate.approvedAt ?? null,
      journeyId: estimate.journeyId ?? null
    }));
  }

  // Eligibility Checks - DatabaseStorage Implementation
  async createEligibilityCheck(checkData: InsertEligibilityCheck): Promise<EligibilityCheck> {
    const [check] = await db
      .insert(eligibilityChecks)
      .values({
        ...checkData,
        id: nanoid(),
      })
      .returning();
    
    return {
      ...check,
      checkResult: check.checkResult as 'allowed' | 'limit_exceeded' | 'tier_required' | 'payment_required',
      reason: check.reason ?? null,
      requiredTier: check.requiredTier ?? null,
      currentUsage: check.currentUsage as { monthly?: number; total?: number; } | undefined,
      limits: check.limits as { monthly?: number; total?: number; } | undefined,
      nextResetAt: check.nextResetAt ?? null
    };
  }

  async getEligibilityCheck(id: string): Promise<EligibilityCheck | undefined> {
    const [check] = await db
      .select()
      .from(eligibilityChecks)
      .where(eq(eligibilityChecks.id, id));
    
    if (!check) return undefined;
    
    return {
      ...check,
      checkResult: check.checkResult as 'allowed' | 'limit_exceeded' | 'tier_required' | 'payment_required',
      reason: check.reason ?? undefined,
      requiredTier: check.requiredTier ?? undefined,
      currentUsage: check.currentUsage as { monthly?: number; total?: number; } | undefined,
      limits: check.limits as { monthly?: number; total?: number; } | undefined,
      nextResetAt: check.nextResetAt ?? undefined
    };
  }

  async getEligibilityChecksByUser(userId: string): Promise<EligibilityCheck[]> {
    const { desc } = await import("drizzle-orm");
    const checks = await db
      .select()
      .from(eligibilityChecks)
      .where(eq(eligibilityChecks.userId, userId))
      .orderBy(desc(eligibilityChecks.createdAt));
    
    return checks.map((check: any) => ({
      ...check,
      checkResult: check.checkResult as 'allowed' | 'limit_exceeded' | 'tier_required' | 'payment_required',
      reason: check.reason ?? null,
      requiredTier: check.requiredTier ?? null,
      currentUsage: check.currentUsage as { monthly?: number; total?: number; } | undefined,
      limits: check.limits as { monthly?: number; total?: number; } | undefined,
      nextResetAt: check.nextResetAt ?? null
    }));
  }

  async getEligibilityChecksByFeature(userId: string, feature: string): Promise<EligibilityCheck[]> {
    const { desc, and } = await import("drizzle-orm");
    const checks = await db
      .select()
      .from(eligibilityChecks)
      .where(
        and(
          eq(eligibilityChecks.userId, userId),
          eq(eligibilityChecks.feature, feature)
        )
      )
      .orderBy(desc(eligibilityChecks.createdAt));
    
    return checks.map((check: any) => ({
      ...check,
      checkResult: check.checkResult as 'allowed' | 'limit_exceeded' | 'tier_required' | 'payment_required',
      reason: check.reason ?? null,
      requiredTier: check.requiredTier ?? null,
      currentUsage: check.currentUsage as { monthly?: number; total?: number; } | undefined,
      limits: check.limits as { monthly?: number; total?: number; } | undefined,
      nextResetAt: check.nextResetAt ?? null
    }));
  }

  async getLatestEligibilityCheck(userId: string, feature: string): Promise<EligibilityCheck | undefined> {
    const checks = await this.getEligibilityChecksByFeature(userId, feature);
    return checks[0];
  }

  // User Settings - minimal implementation for interface
  async getUserSettings(userId: string): Promise<any> {
    const user = await this.getUser(userId);
    if (!user) return null;
    return {
      userId: user.id,
      subscriptionTier: user.subscriptionTier || 'none',
      subscriptionStatus: user.subscriptionStatus || 'inactive',
      monthlyUploads: user.monthlyUploads || 0,
      monthlyDataVolume: user.monthlyDataVolume || 0,
      monthlyAIInsights: user.monthlyAIInsights || 0,
      usageResetAt: user.usageResetAt,
      emailVerified: user.emailVerified || false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  // Journey Settings - minimal implementation for interface
  async getJourneySettings(journeyId: string): Promise<any> {
    // Placeholder: expand when journeys are fully integrated
    return {
      journeyId,
      settings: {
        allowDataExport: true,
        enableNotifications: true,
        securityLevel: 'standard',
      },
      preferences: {
        analysisDepth: 'comprehensive',
        visualizationTypes: ['charts', 'tables', 'insights'],
      },
    };
  }

  // Usage Logging - no-op for now
  async logUsage(usage: { userId: string; projectId?: string | null; action: string; provider?: string; tokensUsed?: number; cost?: string }): Promise<void> {
    // Could be persisted to DB in the future
    console.log('Usage logged:', usage);
  }

  // Agent Checkpoint Management
  async createAgentCheckpoint(checkpointData: Omit<InsertAgentCheckpoint, 'id' | 'createdAt' | 'timestamp'> & { id?: string; timestamp?: Date; createdAt?: Date }): Promise<AgentCheckpoint> {
    const checkpoint: InsertAgentCheckpoint = {
      id: checkpointData.id ?? nanoid(),
      ...checkpointData,
    };

    const [result] = await db.insert(agentCheckpoints).values(checkpoint).returning();
    return result;
  }

  async getProjectCheckpoints(projectId: string): Promise<AgentCheckpoint[]> {
    return await db
      .select()
      .from(agentCheckpoints)
      .where(eq(agentCheckpoints.projectId, projectId))
      .orderBy(agentCheckpoints.timestamp);
  }

  async updateAgentCheckpoint(checkpointId: string, updates: Partial<Omit<AgentCheckpoint, 'id' | 'createdAt'>>): Promise<AgentCheckpoint | null> {
    const [result] = await db
      .update(agentCheckpoints)
      .set(updates)
      .where(eq(agentCheckpoints.id, checkpointId))
      .returning();
    
    return result || null;
  }

  async deleteProjectCheckpoints(projectId: string): Promise<void> {
    await db.delete(agentCheckpoints).where(eq(agentCheckpoints.projectId, projectId));
  }

  async getProjectSession(projectId: string): Promise<ProjectSessionSnapshot | null> {
    if (!projectId) {
      return null;
    }

    const { desc, and } = await import("drizzle-orm");
    let [session] = await db
      .select()
      .from(projectSessions)
      .where(eq(projectSessions.projectId, projectId))
      .orderBy(desc(projectSessions.updatedAt))
      .limit(1);

    if (!session) {
      const project = await this.getProject(projectId);
      if (project?.userId) {
        const conditions = [
          eq(projectSessions.userId, project.userId),
        ];

        const journeyType = (project as any)?.journeyType;
        if (journeyType) {
          conditions.push(eq(projectSessions.journeyType, journeyType as string));
        }

        const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
        const fallback = await db
          .select()
          .from(projectSessions)
          .where(whereClause)
          .orderBy(desc(projectSessions.updatedAt))
          .limit(1);

        session = fallback[0];
      }
    }

    if (!session) {
      return null;
    }

    const workflowState = (session.workflowState as any) ?? {};
    const executeData = (session.executeData as any) ?? {};
    const transformation = workflowState?.transformation ?? executeData?.transformation ?? null;

    return {
      id: session.id,
      projectId: session.projectId,
      journeyType: session.journeyType,
      currentStep: session.currentStep ?? null,
      prepare: (session.prepareData as any) ?? {},
      data: (session.dataUploadData as any) ?? {},
      execute: executeData,
      pricing: (session.pricingData as any) ?? {},
      results: (session.resultsData as any) ?? {},
      workflowState,
      transformation,
      metadata: {
        lastActivity: session.lastActivity ?? null,
        expiresAt: session.expiresAt ?? null,
        serverValidated: session.serverValidated ?? null,
      },
    };
  }

  // Admin-specific methods
  async getUserCount(): Promise<number> {
    const result = await db.select().from(users);
    return result.length;
  }

  async getProjectCount(): Promise<number> {
    const result = await db.select().from(projects);
    return result.length;
  }

  async updateUserRole(userId: string, role: string): Promise<void> {
    await db.update(users)
      .set({ role } as any)
      .where(eq(users.id, userId));
  }
}

// Use database storage when database is available, fallback to in-memory storage
export const storage = db ? new DatabaseStorage() : new MemStorage();