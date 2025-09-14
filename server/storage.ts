import { DataProject, InsertDataProject, User, Project, InsertProject, EnterpriseInquiry, InsertEnterpriseInquiry, GuidedAnalysisOrder, InsertGuidedAnalysisOrder, Dataset, InsertDataset, ProjectDataset, InsertProjectDataset, ProjectArtifact, InsertProjectArtifact, StreamingSource, InsertStreamingSource, StreamChunk, InsertStreamChunk, StreamCheckpoint, InsertStreamCheckpoint, ScrapingJob, InsertScrapingJob, ScrapingRun, InsertScrapingRun, DatasetVersion, InsertDatasetVersion, Journey, InsertJourney, JourneyStepProgress, InsertJourneyStepProgress, CostEstimate, InsertCostEstimate, EligibilityCheck, InsertEligibilityCheck } from "@shared/schema";
import { users, projects, enterpriseInquiries, guidedAnalysisOrders, datasets, projectDatasets, projectArtifacts, streamingSources, streamChunks, streamCheckpoints, scrapingJobs, scrapingRuns, datasetVersions } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

// Convert between DataProject and Project types
function projectToDataProject(project: Project): DataProject {
  return {
    id: project.id,
    userId: project.ownerId || project.userId || '',
    name: project.name,
    fileName: project.fileName || '',
    fileSize: project.fileSize || 0,
    fileType: project.fileType || '',
    uploadedAt: project.uploadedAt || new Date(),
    description: project.description || undefined,
    isTrial: project.isTrial || false,
    schema: project.schema as any || undefined,
    recordCount: project.recordCount || undefined,
    data: project.data as any || undefined,
    processed: project.processed || false,
    piiAnalysis: project.piiAnalysis as any || undefined,
    uniqueIdentifiers: project.uniqueIdentifiers as any || undefined,
    dataSource: (project.dataSource as any) || "upload",
    sourceMetadata: project.sourceMetadata as any || undefined,
    transformations: project.transformations as any || undefined,
    joinedFiles: project.joinedFiles as any || undefined,
    outlierAnalysis: project.outlierAnalysis as any || undefined,
    missingDataAnalysis: project.missingDataAnalysis as any || undefined,
    normalityTests: project.normalityTests as any || undefined,
    analysisResults: project.analysisResults || undefined,
    stepByStepAnalysis: project.stepByStepAnalysis as any || undefined,
    visualizations: project.visualizations as any || undefined,
    aiInsights: project.aiInsights || undefined,
    aiRole: project.aiRole || undefined,
    aiActions: project.aiActions as any || undefined,
    mcpResources: project.mcpResources as any || undefined,
    purchasedFeatures: project.purchasedFeatures as any || undefined,
    isPaid: project.isPaid || false,
    selectedFeatures: project.selectedFeatures as any || undefined,
    paymentIntentId: project.paymentIntentId || undefined,
    upgradedAt: project.upgradedAt || undefined,
  };
}

function dataProjectToInsertProject(dataProject: InsertDataProject): Omit<InsertProject, 'id'> {
  return {
    ownerId: dataProject.userId,
    userId: dataProject.userId, // Keep for backward compatibility
    name: dataProject.name,
    fileName: dataProject.fileName,
    fileSize: dataProject.fileSize,
    fileType: dataProject.fileType,
    description: dataProject.description || null,
    isTrial: dataProject.isTrial || false,
    schema: dataProject.schema || null,
    recordCount: dataProject.recordCount || null,
    data: dataProject.data || null,
    piiAnalysis: dataProject.piiAnalysis || null,
    uniqueIdentifiers: dataProject.uniqueIdentifiers || null,
    dataSource: dataProject.dataSource || "upload",
    sourceMetadata: dataProject.sourceMetadata || null,
    transformations: dataProject.transformations || null,
    joinedFiles: dataProject.joinedFiles || null,
    outlierAnalysis: dataProject.outlierAnalysis || null,
    missingDataAnalysis: dataProject.missingDataAnalysis || null,
    normalityTests: dataProject.normalityTests || null,
    analysisResults: dataProject.analysisResults || null,
    stepByStepAnalysis: dataProject.stepByStepAnalysis || null,
    visualizations: dataProject.visualizations || null,
    aiInsights: dataProject.aiInsights || null,
    aiRole: dataProject.aiRole || null,
    aiActions: dataProject.aiActions || null,
    mcpResources: dataProject.mcpResources || null,
    purchasedFeatures: dataProject.purchasedFeatures || null,
    isPaid: dataProject.isPaid || false,
    selectedFeatures: dataProject.selectedFeatures || null,
    paymentIntentId: dataProject.paymentIntentId || null,
    upgradedAt: dataProject.upgradedAt || null,
  };
}

function projectUpdatesToDb(updates: Partial<DataProject>): Partial<Project> {
  const dbUpdates: Partial<Project> = {};
  
  // Map DataProject fields to Project database fields, only include provided values
  if (updates.userId !== undefined) {
    dbUpdates.ownerId = updates.userId;
    dbUpdates.userId = updates.userId; // Keep for backward compatibility
  }
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.fileName !== undefined) dbUpdates.fileName = updates.fileName;
  if (updates.fileSize !== undefined) dbUpdates.fileSize = updates.fileSize;
  if (updates.fileType !== undefined) dbUpdates.fileType = updates.fileType;
  if (updates.description !== undefined) dbUpdates.description = updates.description || null;
  if (updates.isTrial !== undefined) dbUpdates.isTrial = updates.isTrial;
  if (updates.schema !== undefined) dbUpdates.schema = updates.schema;
  if (updates.recordCount !== undefined) dbUpdates.recordCount = updates.recordCount;
  if (updates.data !== undefined) dbUpdates.data = updates.data;
  if (updates.processed !== undefined) dbUpdates.processed = updates.processed;
  if (updates.piiAnalysis !== undefined) dbUpdates.piiAnalysis = updates.piiAnalysis;
  if (updates.uniqueIdentifiers !== undefined) dbUpdates.uniqueIdentifiers = updates.uniqueIdentifiers;
  if (updates.dataSource !== undefined) dbUpdates.dataSource = updates.dataSource;
  if (updates.sourceMetadata !== undefined) dbUpdates.sourceMetadata = updates.sourceMetadata;
  if (updates.transformations !== undefined) dbUpdates.transformations = updates.transformations;
  if (updates.joinedFiles !== undefined) dbUpdates.joinedFiles = updates.joinedFiles;
  if (updates.outlierAnalysis !== undefined) dbUpdates.outlierAnalysis = updates.outlierAnalysis;
  if (updates.missingDataAnalysis !== undefined) dbUpdates.missingDataAnalysis = updates.missingDataAnalysis;
  if (updates.normalityTests !== undefined) dbUpdates.normalityTests = updates.normalityTests;
  if (updates.analysisResults !== undefined) dbUpdates.analysisResults = updates.analysisResults;
  if (updates.stepByStepAnalysis !== undefined) dbUpdates.stepByStepAnalysis = updates.stepByStepAnalysis;
  if (updates.visualizations !== undefined) dbUpdates.visualizations = updates.visualizations;
  if (updates.aiInsights !== undefined) dbUpdates.aiInsights = updates.aiInsights;
  if (updates.aiRole !== undefined) dbUpdates.aiRole = updates.aiRole;
  if (updates.aiActions !== undefined) dbUpdates.aiActions = updates.aiActions;
  if (updates.mcpResources !== undefined) dbUpdates.mcpResources = updates.mcpResources;
  if (updates.purchasedFeatures !== undefined) dbUpdates.purchasedFeatures = updates.purchasedFeatures;
  if (updates.isPaid !== undefined) dbUpdates.isPaid = updates.isPaid;
  if (updates.selectedFeatures !== undefined) dbUpdates.selectedFeatures = updates.selectedFeatures;
  if (updates.paymentIntentId !== undefined) dbUpdates.paymentIntentId = updates.paymentIntentId;
  if (updates.upgradedAt !== undefined) dbUpdates.upgradedAt = updates.upgradedAt;
  
  return dbUpdates;
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
  removeDatasetFromProject(projectId: string, datasetId: string): Promise<boolean>;
  getProjectDatasets(projectId: string): Promise<{ dataset: Dataset; association: ProjectDataset }[]>;
  getDatasetProjects(datasetId: string): Promise<{ project: DataProject; association: ProjectDataset }[]>;
  
  // Project Artifacts - track workflow from ingestion to results
  createArtifact(artifact: InsertProjectArtifact): Promise<ProjectArtifact>;
  getArtifact(id: string): Promise<ProjectArtifact | undefined>;
  getProjectArtifacts(projectId: string, type?: string): Promise<ProjectArtifact[]>;
  updateArtifact(id: string, updates: Partial<ProjectArtifact>): Promise<ProjectArtifact | undefined>;
  getArtifactChain(artifactId: string): Promise<ProjectArtifact[]>; // Get parent-child chain
  
  // User operations
  createUser(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User>;
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
  private nextId = 1;

  async createProject(projectData: InsertDataProject): Promise<DataProject> {
    const id = `project_${this.nextId++}`;
    const project: DataProject = {
      ...projectData,
      id,
      uploadedAt: new Date(),
      processed: false,
    };
    
    this.projects.set(id, project);
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
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }

  async getProjectsByOwner(ownerId: string): Promise<DataProject[]> {
    return Array.from(this.projects.values()).filter(project => project.userId === ownerId);
  }

  // Dataset operations
  async createDataset(datasetData: InsertDataset): Promise<Dataset> {
    const id = `dataset_${this.nextId++}`;
    const dataset: Dataset = {
      ...datasetData,
      id,
      sourceType: datasetData.sourceType ?? "upload",
      dataType: datasetData.dataType ?? null,
      status: datasetData.status ?? "ready",
      schema: datasetData.schema ?? null,
      recordCount: datasetData.recordCount ?? null,
      preview: datasetData.preview ?? null,
      piiAnalysis: datasetData.piiAnalysis ?? null,
      ingestionMetadata: datasetData.ingestionMetadata ?? null,
      checksum: datasetData.checksum ?? null,
      mode: datasetData.mode ?? "static",
      retentionDays: datasetData.retentionDays ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.datasets.set(id, dataset);
    return dataset;
  }

  async getDataset(id: string): Promise<Dataset | undefined> {
    return this.datasets.get(id);
  }

  async getDatasetsByOwner(ownerId: string): Promise<Dataset[]> {
    return Array.from(this.datasets.values()).filter(dataset => dataset.ownerId === ownerId);
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
  async createUser(userData: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
    const user: User = {
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date(),
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
    await this.createStreamCheckpoint({ sourceId, cursor });
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
}

export class DatabaseStorage implements IStorage {
  // Project operations
  async createProject(projectData: InsertDataProject): Promise<DataProject> {
    const insertData = dataProjectToInsertProject(projectData);
    
    const [project] = await db
      .insert(projects)
      .values({
        ...insertData,
        id: nanoid(),
      })
      .returning();
    
    return projectToDataProject(project);
  }

  async getProject(id: string): Promise<DataProject | undefined> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id));
    
    return project ? projectToDataProject(project) : undefined;
  }

  async getAllProjects(): Promise<DataProject[]> {
    const allProjects = await db.select().from(projects);
    return allProjects.map(projectToDataProject);
  }

  async updateProject(id: string, updates: Partial<DataProject>): Promise<DataProject | undefined> {
    const dbUpdates = projectUpdatesToDb(updates);
    const [project] = await db
      .update(projects)
      .set(dbUpdates)
      .where(eq(projects.id, id))
      .returning();
    
    return project ? projectToDataProject(project) : undefined;
  }

  async deleteProject(id: string): Promise<boolean> {
    const result = await db
      .delete(projects)
      .where(eq(projects.id, id));
    
    return (result.rowCount || 0) > 0;
  }

  // User operations
  async createUser(userData: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        id: userData.id || nanoid(),
      })
      .returning();
    
    return user;
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id));
    
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    
    return user || undefined;
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.emailVerificationToken, token));
    
    return user || undefined;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    
    return user || undefined;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db
      .delete(users)
      .where(eq(users.id, id));
    
    return (result.rowCount || 0) > 0;
  }

  async getAllUsers(): Promise<User[]> {
    const allUsers = await db
      .select()
      .from(users);
    
    return allUsers;
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

  // Missing project method
  async getProjectsByOwner(ownerId: string): Promise<DataProject[]> {
    const ownerProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.ownerId, ownerId));
    
    return ownerProjects.map(projectToDataProject);
  }

  // Dataset operations
  async createDataset(datasetData: InsertDataset): Promise<Dataset> {
    const [dataset] = await db
      .insert(datasets)
      .values({
        ...datasetData,
        id: nanoid(),
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

  async getDatasetsByOwner(ownerId: string): Promise<Dataset[]> {
    return await db
      .select()
      .from(datasets)
      .where(eq(datasets.ownerId, ownerId));
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

  async searchDatasets(ownerId: string, query?: string): Promise<Dataset[]> {
    let dbQuery = db
      .select()
      .from(datasets)
      .where(eq(datasets.ownerId, ownerId));

    if (query) {
      // Use ilike for case-insensitive search on file name
      const { ilike } = await import("drizzle-orm");
      dbQuery = db
        .select()
        .from(datasets)
        .where(
          eq(datasets.ownerId, ownerId)
        );
      // Note: For proper search functionality, we would need to add the ilike condition
      // For now, return all owner datasets and filter in memory
      const allDatasets = await dbQuery;
      return allDatasets.filter(dataset => 
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

    return results.map(result => ({
      dataset: result.datasets,
      association: result.project_datasets,
    }));
  }

  async getDatasetProjects(datasetId: string): Promise<{ project: DataProject; association: ProjectDataset }[]> {
    const results = await db
      .select()
      .from(projectDatasets)
      .innerJoin(projects, eq(projectDatasets.projectId, projects.id))
      .where(eq(projectDatasets.datasetId, datasetId));

    return results.map(result => ({
      project: projectToDataProject(result.projects),
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
    await this.createStreamCheckpoint({ sourceId, cursor });
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
}

// Use HybridStorage for optimal performance with persistence
import { HybridStorage } from './hybrid-storage';
export const storage = new HybridStorage();