import { DataProject, InsertDataProject, User, Project, InsertProject, EnterpriseInquiry, InsertEnterpriseInquiry, GuidedAnalysisOrder, InsertGuidedAnalysisOrder, Dataset, InsertDataset, ProjectDataset, InsertProjectDataset, ProjectArtifact, InsertProjectArtifact, StreamingSource, InsertStreamingSource, StreamChunk, InsertStreamChunk, StreamCheckpoint, InsertStreamCheckpoint, ScrapingJob, InsertScrapingJob, ScrapingRun, InsertScrapingRun, DatasetVersion, InsertDatasetVersion, Journey, InsertJourney, JourneyStepProgress, InsertJourneyStepProgress, CostEstimate, InsertCostEstimate, EligibilityCheck, InsertEligibilityCheck } from "@shared/schema";
import { users, projects, enterpriseInquiries, guidedAnalysisOrders, datasets, projectDatasets, projectArtifacts, streamingSources, streamChunks, streamCheckpoints, scrapingJobs, scrapingRuns, datasetVersions, journeys, journeyStepProgress, costEstimates, eligibilityChecks } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

// Convert between DataProject and Project types
function projectToDataProject(project: Project): DataProject {
  return {
    id: project.id,
    name: project.name,
    fileName: project.fileName,
    fileSize: project.fileSize,
    fileType: project.fileType,
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
    userId: dataProject.userId || '',
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

// HybridStorage implements the full IStorage interface with all methods

// Write-behind cache for async persistence
class WriteBackCache {
  private pendingWrites = new Map<string, { operation: string; data: any; timestamp: number }>();
  private processingQueue = false;
  private batchSize = 10;
  private maxBatchDelay = 1000; // 1 second max delay

  constructor() {
    // Process queue periodically
    setInterval(() => this.processQueue(), 500);
  }

  enqueue(key: string, operation: string, data: any) {
    this.pendingWrites.set(key, {
      operation,
      data,
      timestamp: Date.now()
    });
    
    // Process immediately if queue is large or old
    if (this.pendingWrites.size >= this.batchSize || this.hasOldEntries()) {
      this.processQueue();
    }
  }

  private hasOldEntries(): boolean {
    const now = Date.now();
    for (const [, entry] of this.pendingWrites) {
      if (now - entry.timestamp > this.maxBatchDelay) {
        return true;
      }
    }
    return false;
  }

  private async processQueue() {
    if (this.processingQueue || this.pendingWrites.size === 0) return;
    
    this.processingQueue = true;
    const batch = new Map(this.pendingWrites);
    this.pendingWrites.clear();

    try {
      const promises = Array.from(batch.values()).map(async (entry) => {
        try {
          await this.executePersistenceOperation(entry.operation, entry.data);
        } catch (error) {
          console.error(`Failed to persist ${entry.operation}:`, error);
          // Re-queue failed operations with exponential backoff
          setTimeout(() => {
            this.enqueue(`${entry.operation}-${Date.now()}`, entry.operation, entry.data);
          }, Math.random() * 2000 + 1000);
        }
      });

      await Promise.all(promises);
    } finally {
      this.processingQueue = false;
    }
  }

  private async executePersistenceOperation(operation: string, data: any) {
    switch (operation) {
      case 'upsert-user':
        await db.insert(users).values(data).onConflictDoUpdate({
          target: users.id,
          set: {
            ...data,
            updatedAt: new Date(),
          },
        });
        break;
      case 'create-user':
        await db.insert(users).values(data);
        break;
      case 'delete-user':
        await db.delete(users).where(eq(users.id, data.id));
        break;
      case 'update-user-password':
        await db.update(users).set({ password: data.hashedPassword }).where(eq(users.id, data.userId));
        break;
      case 'create-project':
        await db.insert(projects).values(data);
        break;
      case 'update-project':
        await db.update(projects).set(data.updates).where(eq(projects.id, data.id));
        break;
      case 'delete-project':
        await db.delete(projects).where(eq(projects.id, data.id));
        break;
      case 'create-dataset':
        await db.insert(datasets).values(data);
        break;
      case 'update-dataset':
        await db.update(datasets).set(data.updates).where(eq(datasets.id, data.id));
        break;
      case 'delete-dataset':
        await db.delete(datasets).where(eq(datasets.id, data.id));
        break;
      case 'create-project-dataset':
        await db.insert(projectDatasets).values(data);
        break;
      case 'delete-project-dataset':
        await db.delete(projectDatasets).where(eq(projectDatasets.id, data.id));
        break;
      case 'create-artifact':
        await db.insert(projectArtifacts).values(data);
        break;
      case 'update-artifact':
        await db.update(projectArtifacts).set(data.updates).where(eq(projectArtifacts.id, data.id));
        break;
      case 'create-enterprise-inquiry':
        await db.insert(enterpriseInquiries).values(data);
        break;
      case 'create-guided-analysis-order':
        await db.insert(guidedAnalysisOrders).values(data);
        break;
      case 'update-user':
        await db.update(users).set(data.updates).where(eq(users.id, data.id));
        break;
      case 'update-guided-analysis-order':
        await db.update(guidedAnalysisOrders).set(data.updates).where(eq(guidedAnalysisOrders.id, data.id));
        break;
      case 'store-guided-analysis-order':
        await db.insert(guidedAnalysisOrders).values(data).onConflictDoUpdate({
          target: guidedAnalysisOrders.id,
          set: { ...data, updatedAt: new Date() }
        });
        break;
      case 'create-journey':
        await db.insert(journeys).values(data);
        break;
      case 'update-journey':
        await db.update(journeys).set(data.updates).where(eq(journeys.id, data.id));
        break;
      case 'delete-journey':
        await db.delete(journeys).where(eq(journeys.id, data.id));
        break;
    }
  }
}

export class HybridStorage {
  private userCache = new Map<string, User>();
  private usersByEmail = new Map<string, User>();
  private projectCache = new Map<string, DataProject>();
  private datasetCache = new Map<string, Dataset>();
  private projectDatasetCache = new Map<string, ProjectDataset>();
  private artifactCache = new Map<string, ProjectArtifact>();
  private streamingSourceCache = new Map<string, StreamingSource>();
  private scrapingJobCache = new Map<string, ScrapingJob>();
  private enterpriseInquiryCache: EnterpriseInquiry[] = [];
  private guidedAnalysisOrderCache: GuidedAnalysisOrder[] = [];
  private writeBackCache = new WriteBackCache();
  private initialized = false;

  async init() {
    if (this.initialized) return;
    
    try {
      // Load existing data from database on startup with error handling for individual queries
      let dbUsers: User[] = [];
      let dbProjects: Project[] = [];
      let dbInquiries: EnterpriseInquiry[] = [];
      let dbOrders: GuidedAnalysisOrder[] = [];

      // Try to load users
      try {
        dbUsers = await db.select().from(users);
      } catch (error) {
        console.error('Failed to load users from database:', error);
      }

      // Try to load projects
      try {
        dbProjects = await db.select().from(projects);
      } catch (error) {
        console.error('Failed to load projects from database:', error);
      }

      // Try to load enterprise inquiries
      try {
        dbInquiries = await db.select().from(enterpriseInquiries);
      } catch (error) {
        console.error('Failed to load enterprise inquiries from database:', error);
      }

      // Try to load guided analysis orders
      try {
        dbOrders = await db.select().from(guidedAnalysisOrders);
      } catch (error) {
        console.error('Failed to load guided analysis orders from database:', error);
      }

      // Populate caches with field mapping
      for (const user of dbUsers) {
        // Map database 'password' field to application 'hashedPassword' field
        // Note: Drizzle converts database 'hashed_password' column to 'hashedPassword' TypeScript field
        const mappedUser = {
          ...user,
          hashedPassword: user.password || user.hashedPassword, // Handle both legacy and new fields
          password: undefined, // Clear database password field for security
        };
        this.userCache.set(user.id, mappedUser);
        if (user.email) {
          this.usersByEmail.set(user.email, mappedUser);
        }
      }

      for (const project of dbProjects) {
        try {
          this.projectCache.set(project.id, projectToDataProject(project));
        } catch (error) {
          console.error(`Failed to convert project ${project.id}:`, error);
        }
      }

      this.enterpriseInquiryCache = dbInquiries;
      this.guidedAnalysisOrderCache = dbOrders;

      this.initialized = true;
      console.log(`HybridStorage initialized: ${dbUsers.length} users, ${dbProjects.length} projects, ${dbInquiries.length} inquiries, ${dbOrders.length} orders`);
    } catch (error) {
      console.error('Failed to initialize HybridStorage, continuing with empty cache:', error);
      this.initialized = true;
    }
  }

  // User operations
  // User operations (complete set)
  async createUser(userData: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
    await this.init();
    
    const now = new Date();
    const newUser: User = {
      ...userData,
      id: userData.id || nanoid(),
      createdAt: now,
      updatedAt: now,
    };

    // Update cache immediately
    this.userCache.set(newUser.id, newUser);
    if (newUser.email) {
      this.usersByEmail.set(newUser.email, newUser);
    }

    // Queue for persistence
    this.writeBackCache.enqueue(`user-create-${newUser.id}`, 'create-user', {
      ...newUser,
      password: newUser.hashedPassword, // Map hashedPassword to password for DB
      hashedPassword: undefined
    });
    
    return newUser;
  }

  async getUser(id: string): Promise<User | undefined> {
    await this.init();
    return this.userCache.get(id);
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    await this.init();
    
    // Check cache first
    for (const user of this.userCache.values()) {
      if (user.emailVerificationToken === token) {
        return user;
      }
    }
    
    // Check database
    try {
      const [dbUser] = await db.select().from(users).where(eq(users.emailVerificationToken, token));
      if (dbUser) {
        const user = {
          ...dbUser,
          hashedPassword: dbUser.password,
          password: undefined,
        };
        this.userCache.set(user.id, user);
        if (user.email) {
          this.usersByEmail.set(user.email, user);
        }
        return user;
      }
    } catch (error) {
      console.error('Error getting user by verification token:', error);
    }
    
    return undefined;
  }

  async deleteUser(id: string): Promise<boolean> {
    await this.init();
    
    const user = this.userCache.get(id);
    if (!user) return false;
    
    // Update cache immediately
    this.userCache.delete(id);
    if (user.email) {
      this.usersByEmail.delete(user.email);
    }

    // Queue for persistence
    this.writeBackCache.enqueue(`user-delete-${id}`, 'delete-user', { id });
    
    return true;
  }

  async getAllUsers(): Promise<User[]> {
    await this.init();
    
    try {
      const dbUsers = await db.select().from(users);
      const mappedUsers = dbUsers.map(user => ({
        ...user,
        hashedPassword: user.password,
        password: undefined,
      }));
      
      // Update cache
      for (const user of mappedUsers) {
        this.userCache.set(user.id, user);
        if (user.email) {
          this.usersByEmail.set(user.email, user);
        }
      }
      
      return mappedUsers;
    } catch (error) {
      console.error('Error getting all users:', error);
      return Array.from(this.userCache.values());
    }
  }

  async getProjectsByOwner(ownerId: string): Promise<DataProject[]> {
    await this.init();
    return Array.from(this.projectCache.values()).filter(project => project.userId === ownerId);
  }

  async upsertUser(user: { id: string; email: string; firstName?: string; lastName?: string; profileImageUrl?: string }): Promise<User> {
    await this.init();
    
    const now = new Date();
    const upsertedUser: User = {
      id: user.id,
      email: user.email,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
      profileImageUrl: user.profileImageUrl || null,
      password: null,
      createdAt: this.userCache.get(user.id)?.createdAt || now,
      updatedAt: now,
    };

    // Update cache immediately
    this.userCache.set(user.id, upsertedUser);
    if (user.email) {
      this.usersByEmail.set(user.email, upsertedUser);
    }

    // Queue for async persistence
    this.writeBackCache.enqueue(`user-${user.id}`, 'upsert-user', upsertedUser);
    
    return upsertedUser;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    await this.init();
    
    // Check cache first
    const cachedUser = this.usersByEmail.get(email);
    if (cachedUser) {
      return cachedUser;
    }
    
    // Fall back to database query
    try {
      const [dbUser] = await db.select().from(users).where(eq(users.email, email));
      if (dbUser) {
        // Map database fields to application fields
        const mappedUser = {
          ...dbUser,
          hashedPassword: dbUser.password || dbUser.hashedPassword, // Handle both legacy and new fields
          password: undefined, // Clear database password field for security
        };
        
        // Update cache for future lookups
        this.userCache.set(mappedUser.id, mappedUser);
        this.usersByEmail.set(email, mappedUser);
        
        return mappedUser;
      }
    } catch (error) {
      console.error('Error querying user by email from database:', error);
    }
    
    return undefined;
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    await this.init();
    return Array.from(this.userCache.values()).find(user => user.emailVerificationToken === token);
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    await this.init();
    
    const existingUser = this.userCache.get(id);
    if (!existingUser) {
      return undefined;
    }

    const updatedUser = { ...existingUser, ...updates, updatedAt: new Date() };
    this.userCache.set(id, updatedUser);
    if (updatedUser.email) {
      this.usersByEmail.set(updatedUser.email, updatedUser);
    }

    // Queue for async persistence
    this.writeBackCache.enqueue(`user-update-${id}`, 'update-user', { id, updates });
    
    return updatedUser;
  }

  async createUser(user: { email: string; hashedPassword: string; firstName?: string; lastName?: string; provider?: string; emailVerified?: boolean; emailVerificationToken?: string; emailVerificationExpires?: Date }): Promise<User> {
    await this.init();
    
    const now = new Date();
    const newUser: User = {
      id: nanoid(),
      email: user.email,
      hashedPassword: user.hashedPassword, // Store in hashedPassword field for application
      firstName: user.firstName || null,
      lastName: user.lastName || null,
      profileImageUrl: null,
      provider: user.provider || "local", // Use 'local' instead of 'email' for consistency
      providerId: null,
      emailVerified: user.emailVerified || false,
      emailVerificationToken: user.emailVerificationToken || null,
      emailVerificationExpires: user.emailVerificationExpires || null,
      passwordResetToken: null,
      passwordResetExpires: null,
      subscriptionTier: "none",
      subscriptionStatus: "inactive",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionExpiresAt: null,
      monthlyUploads: 0,
      monthlyDataVolume: 0,
      monthlyAIInsights: 0,
      usageResetAt: now,
      createdAt: now,
      updatedAt: now,
    };

    // Update cache immediately
    this.userCache.set(newUser.id, newUser);
    this.usersByEmail.set(user.email, newUser);

    // CRITICAL: Make auth operations synchronous to prevent race conditions
    // Write immediately to database instead of using write-behind cache
    try {
      const dbUser = {
        ...newUser,
        password: user.hashedPassword, // Store in database password field (primary field)
        hashedPassword: undefined, // Clear hashedPassword for database insert
        hashed_password: undefined // Clear alternative password field
      };
      await db.insert(users).values(dbUser);
    } catch (error) {
      // Remove from cache if database insert fails
      this.userCache.delete(newUser.id);
      this.usersByEmail.delete(user.email);
      throw error;
    }
    
    return newUser;
  }

  async validateUserCredentials(email: string, password: string): Promise<User | null> {
    await this.init();
    
    const user = this.usersByEmail.get(email);
    if (!user || !user.hashedPassword) return null;
    
    const bcrypt = await import('bcrypt');
    const isValid = await bcrypt.compare(password, user.hashedPassword);
    return isValid ? user : null;
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await this.init();
    
    const user = this.userCache.get(userId);
    if (!user) return;

    // Update cache immediately - use hashedPassword field for security
    const updatedUser = { 
      ...user, 
      hashedPassword: hashedPassword,
      password: undefined, // Clear database password field
      updatedAt: new Date() 
    };
    this.userCache.set(userId, updatedUser);
    if (user.email) {
      this.usersByEmail.set(user.email, updatedUser);
    }

    // CRITICAL: Make auth operations synchronous to prevent race conditions
    // Write immediately to database instead of using write-behind cache
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId));
  }

  // Dataset operations
  async createDataset(datasetData: InsertDataset): Promise<Dataset> {
    await this.init();
    const id = nanoid();
    const dataset: Dataset = {
      ...datasetData,
      id,
      sourceType: datasetData.sourceType ?? "upload",
      format: datasetData.format ?? "csv",
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
    
    this.datasetCache.set(id, dataset);
    
    // Queue for persistence
    this.writeBackCache.enqueue(`dataset-create-${id}`, 'create-dataset', dataset);
    
    return dataset;
  }

  async getDataset(id: string): Promise<Dataset | undefined> {
    await this.init();
    
    // Check cache first
    if (this.datasetCache.has(id)) {
      return this.datasetCache.get(id);
    }
    
    // Check database
    try {
      const [dataset] = await db.select().from(datasets).where(eq(datasets.id, id));
      if (dataset) {
        this.datasetCache.set(id, dataset);
        return dataset;
      }
    } catch (error) {
      console.error('Error getting dataset:', error);
    }
    
    return undefined;
  }

  async getDatasetsByOwner(ownerId: string): Promise<Dataset[]> {
    await this.init();
    
    try {
      const allDatasets = await db.select().from(datasets).where(eq(datasets.ownerId, ownerId));
      
      // Update cache
      for (const dataset of allDatasets) {
        this.datasetCache.set(dataset.id, dataset);
      }
      
      return allDatasets;
    } catch (error) {
      console.error('Error getting datasets by owner:', error);
      return [];
    }
  }

  async updateDataset(id: string, updates: Partial<Dataset>): Promise<Dataset | undefined> {
    await this.init();
    
    const existing = this.datasetCache.get(id);
    if (!existing) {
      // Try to get from database
      const dataset = await this.getDataset(id);
      if (!dataset) return undefined;
    }
    
    const updatedDataset = { ...existing, ...updates, updatedAt: new Date() };
    this.datasetCache.set(id, updatedDataset);
    
    // Queue for persistence
    this.writeBackCache.enqueue(`dataset-update-${id}`, 'update-dataset', { id, updates });
    
    return updatedDataset;
  }

  async deleteDataset(id: string): Promise<boolean> {
    await this.init();
    
    const exists = this.datasetCache.has(id) || await this.getDataset(id);
    if (!exists) return false;
    
    this.datasetCache.delete(id);
    
    // Queue for persistence
    this.writeBackCache.enqueue(`dataset-delete-${id}`, 'delete-dataset', { id });
    
    return true;
  }

  async searchDatasets(ownerId: string, query?: string): Promise<Dataset[]> {
    await this.init();
    
    // Query the database for datasets by owner
    try {
      const allDatasets = await db.select().from(datasets).where(eq(datasets.ownerId, ownerId));
      
      if (!query) {
        return allDatasets;
      }
      
      // Filter by query string (search in filename and display name)
      return allDatasets.filter(dataset => 
        dataset.originalFileName.toLowerCase().includes(query.toLowerCase()) ||
        (dataset.displayName && dataset.displayName.toLowerCase().includes(query.toLowerCase()))
      );
    } catch (error) {
      console.error('Error searching datasets:', error);
      return [];
    }
  }

  // Project operations
  // Project-Dataset associations
  async addDatasetToProject(projectId: string, datasetId: string, role = 'primary', alias?: string): Promise<ProjectDataset> {
    await this.init();
    
    const id = nanoid();
    const association: ProjectDataset = {
      id,
      projectId,
      datasetId,
      role,
      alias: alias || null,
      addedAt: new Date(),
    };
    
    this.projectDatasetCache.set(id, association);
    
    // Queue for persistence
    this.writeBackCache.enqueue(`project-dataset-${id}`, 'create-project-dataset', association);
    
    return association;
  }

  async removeDatasetFromProject(projectId: string, datasetId: string): Promise<boolean> {
    await this.init();
    
    const toDelete = Array.from(this.projectDatasetCache.entries())
      .find(([_, assoc]) => assoc.projectId === projectId && assoc.datasetId === datasetId);
      
    if (toDelete) {
      this.projectDatasetCache.delete(toDelete[0]);
      
      // Queue for persistence
      this.writeBackCache.enqueue(`project-dataset-delete-${toDelete[0]}`, 'delete-project-dataset', { id: toDelete[0] });
      
      return true;
    }
    return false;
  }

  async getProjectDatasets(projectId: string): Promise<{ dataset: Dataset; association: ProjectDataset }[]> {
    await this.init();
    
    try {
      // Get from database to ensure consistency
      const associations = await db.select().from(projectDatasets).where(eq(projectDatasets.projectId, projectId));
      const result = [];
      
      for (const association of associations) {
        const dataset = await this.getDataset(association.datasetId);
        if (dataset) {
          result.push({ dataset, association });
        }
      }
      
      return result;
    } catch (error) {
      console.error('Error getting project datasets:', error);
      return [];
    }
  }

  async getDatasetProjects(datasetId: string): Promise<{ project: DataProject; association: ProjectDataset }[]> {
    await this.init();
    
    try {
      const associations = await db.select().from(projectDatasets).where(eq(projectDatasets.datasetId, datasetId));
      const result = [];
      
      for (const association of associations) {
        const project = await this.getProject(association.projectId);
        if (project) {
          result.push({ project, association });
        }
      }
      
      return result;
    } catch (error) {
      console.error('Error getting dataset projects:', error);
      return [];
    }
  }

  // Project Artifacts  
  async createArtifact(artifactData: InsertProjectArtifact): Promise<ProjectArtifact> {
    await this.init();
    
    const id = nanoid();
    const artifact: ProjectArtifact = {
      ...artifactData,
      id,
      status: artifactData.status ?? null,
      params: artifactData.params ?? null,
      inputRefs: artifactData.inputRefs ?? null,
      metrics: artifactData.metrics ?? null,
      outputs: artifactData.outputs ?? null,
      error: artifactData.error ?? null,
      parentArtifactId: artifactData.parentArtifactId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.artifactCache.set(id, artifact);
    
    // Queue for persistence
    this.writeBackCache.enqueue(`artifact-${id}`, 'create-artifact', artifact);
    
    return artifact;
  }

  async getArtifact(id: string): Promise<ProjectArtifact | undefined> {
    await this.init();
    
    if (this.artifactCache.has(id)) {
      return this.artifactCache.get(id);
    }
    
    try {
      const [artifact] = await db.select().from(projectArtifacts).where(eq(projectArtifacts.id, id));
      if (artifact) {
        this.artifactCache.set(id, artifact);
        return artifact;
      }
    } catch (error) {
      console.error('Error getting artifact:', error);
    }
    
    return undefined;
  }

  async getProjectArtifacts(projectId: string, type?: string): Promise<ProjectArtifact[]> {
    await this.init();
    
    try {
      let query = db.select().from(projectArtifacts).where(eq(projectArtifacts.projectId, projectId));
      const artifacts = await query;
      
      const filtered = type ? artifacts.filter(a => a.type === type) : artifacts;
      
      // Update cache
      for (const artifact of filtered) {
        this.artifactCache.set(artifact.id, artifact);
      }
      
      return filtered;
    } catch (error) {
      console.error('Error getting project artifacts:', error);
      return [];
    }
  }

  async updateArtifact(id: string, updates: Partial<ProjectArtifact>): Promise<ProjectArtifact | undefined> {
    await this.init();
    
    const existing = this.artifactCache.get(id) || await this.getArtifact(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.artifactCache.set(id, updated);
    
    // Queue for persistence
    this.writeBackCache.enqueue(`artifact-update-${id}`, 'update-artifact', { id, updates });
    
    return updated;
  }

  async getArtifactChain(artifactId: string): Promise<ProjectArtifact[]> {
    await this.init();
    
    const chain: ProjectArtifact[] = [];
    let current = await this.getArtifact(artifactId);
    
    while (current) {
      chain.unshift(current);
      current = current.parentArtifactId ? await this.getArtifact(current.parentArtifactId) : undefined;
    }
    
    return chain;
  }

  async getProject(id: string): Promise<DataProject | undefined> {
    await this.init();
    return this.projectCache.get(id);
  }

  async getProjects(): Promise<DataProject[]> {
    await this.init();
    return Array.from(this.projectCache.values());
  }

  async getAllProjects(): Promise<DataProject[]> {
    await this.init();
    return Array.from(this.projectCache.values());
  }

  async getProjectsByUser(userId: string): Promise<DataProject[]> {
    await this.init();
    return Array.from(this.projectCache.values()).filter(project => project.userId === userId);
  }

  async createProject(project: InsertDataProject): Promise<DataProject> {
    await this.init();
    
    const now = new Date();
    const newProject: DataProject = {
      id: nanoid(),
      uploadedAt: now,
      processed: false,
      ...project,
    };

    // Update cache immediately
    this.projectCache.set(newProject.id, newProject);

    // Queue for async persistence
    const dbProject = {
      id: newProject.id,
      ...dataProjectToInsertProject(newProject),
      uploadedAt: now,
      processed: false,
    };
    this.writeBackCache.enqueue(`project-${newProject.id}`, 'create-project', dbProject);
    
    return newProject;
  }

  async updateProject(id: string, updates: Partial<InsertDataProject>): Promise<DataProject> {
    await this.init();
    
    const existingProject = this.projectCache.get(id);
    if (!existingProject) {
      throw new Error(`Project ${id} not found`);
    }

    const updatedProject: DataProject = {
      ...existingProject,
      ...updates,
    };

    // Update cache immediately
    this.projectCache.set(id, updatedProject);

    // Queue for async persistence
    const dbUpdates = dataProjectToInsertProject(updates);
    this.writeBackCache.enqueue(`project-update-${id}`, 'update-project', { id, updates: dbUpdates });
    
    return updatedProject;
  }

  async deleteProject(id: string): Promise<void> {
    await this.init();
    
    // Update cache immediately
    this.projectCache.delete(id);

    // Queue for async persistence
    this.writeBackCache.enqueue(`project-delete-${id}`, 'delete-project', { id });
  }

  // Enterprise inquiry operations
  async createEnterpriseInquiry(inquiry: InsertEnterpriseInquiry): Promise<EnterpriseInquiry> {
    await this.init();
    
    const now = new Date();
    const newInquiry: EnterpriseInquiry = {
      id: nanoid(),
      createdAt: now,
      ...inquiry,
    };

    // Update cache immediately
    this.enterpriseInquiryCache.push(newInquiry);

    // Queue for async persistence
    this.writeBackCache.enqueue(`inquiry-${newInquiry.id}`, 'create-enterprise-inquiry', newInquiry);
    
    return newInquiry;
  }

  async getEnterpriseInquiries(): Promise<EnterpriseInquiry[]> {
    await this.init();
    return [...this.enterpriseInquiryCache];
  }

  // Guided analysis operations
  async createGuidedAnalysisOrder(order: InsertGuidedAnalysisOrder): Promise<GuidedAnalysisOrder> {
    await this.init();
    
    const now = new Date();
    const newOrder: GuidedAnalysisOrder = {
      id: nanoid(),
      createdAt: now,
      ...order,
    };

    // Update cache immediately
    this.guidedAnalysisOrderCache.push(newOrder);

    // Queue for async persistence
    this.writeBackCache.enqueue(`order-${newOrder.id}`, 'create-guided-analysis-order', newOrder);
    
    return newOrder;
  }

  async getGuidedAnalysisOrders(): Promise<GuidedAnalysisOrder[]> {
    await this.init();
    return [...this.guidedAnalysisOrderCache];
  }

  async getGuidedAnalysisOrder(id: string): Promise<GuidedAnalysisOrder | undefined> {
    await this.init();
    return this.guidedAnalysisOrderCache.find(order => order.id === id);
  }

  async updateGuidedAnalysisOrder(id: string, updates: any): Promise<void> {
    await this.init();
    
    const index = this.guidedAnalysisOrderCache.findIndex(order => order.id === id);
    if (index !== -1) {
      this.guidedAnalysisOrderCache[index] = { 
        ...this.guidedAnalysisOrderCache[index], 
        ...updates, 
        updatedAt: new Date() 
      };
      
      // Queue for async persistence
      this.writeBackCache.enqueue(`guided-analysis-update-${id}`, 'update-guided-analysis-order', { id, updates });
    }
  }

  async storeGuidedAnalysisOrder(id: string, order: any): Promise<void> {
    await this.init();
    
    const existingIndex = this.guidedAnalysisOrderCache.findIndex(o => o.id === id);
    if (existingIndex !== -1) {
      this.guidedAnalysisOrderCache[existingIndex] = { ...order, updatedAt: new Date() };
    } else {
      this.guidedAnalysisOrderCache.push({ id, ...order, createdAt: new Date() });
    }
    
    // Queue for async persistence
    this.writeBackCache.enqueue(`guided-analysis-store-${id}`, 'store-guided-analysis-order', { id, ...order });
  }

  async listGuidedAnalysisOrders(userId?: string): Promise<any[]> {
    await this.init();
    
    const orders = [...this.guidedAnalysisOrderCache];
    
    if (userId) {
      return orders.filter(order => order.userId === userId);
    }
    
    return orders;
  }

  // Streaming Sources - Basic stub implementations for interface compatibility
  async createStreamingSource(source: InsertStreamingSource): Promise<StreamingSource> {
    await this.init();
    
    const id = nanoid();
    const streamingSource: StreamingSource = {
      ...source,
      id,
      status: 'created',
      lastSyncAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.streamingSourceCache.set(id, streamingSource);
    return streamingSource;
  }

  async getStreamingSource(id: string): Promise<StreamingSource | undefined> {
    await this.init();
    return this.streamingSourceCache.get(id);
  }

  async getStreamingSourcesByDataset(datasetId: string): Promise<StreamingSource[]> {
    await this.init();
    return Array.from(this.streamingSourceCache.values())
      .filter(source => source.datasetId === datasetId);
  }

  async updateStreamingSource(id: string, updates: Partial<StreamingSource>): Promise<StreamingSource | undefined> {
    await this.init();
    
    const existing = this.streamingSourceCache.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.streamingSourceCache.set(id, updated);
    return updated;
  }

  async deleteStreamingSource(id: string): Promise<boolean> {
    await this.init();
    return this.streamingSourceCache.delete(id);
  }

  async startStreamingSource(id: string): Promise<boolean> {
    await this.init();
    
    const source = this.streamingSourceCache.get(id);
    if (!source) return false;
    
    const updated = { ...source, status: 'active' as any, updatedAt: new Date() };
    this.streamingSourceCache.set(id, updated);
    return true;
  }

  async stopStreamingSource(id: string): Promise<boolean> {
    await this.init();
    
    const source = this.streamingSourceCache.get(id);
    if (!source) return false;
    
    const updated = { ...source, status: 'stopped' as any, updatedAt: new Date() };
    this.streamingSourceCache.set(id, updated);
    return true;
  }

  async getActiveStreamingSources(): Promise<StreamingSource[]> {
    await this.init();
    return Array.from(this.streamingSourceCache.values())
      .filter(source => source.status === 'active');
  }

  // Basic stub implementations for remaining interface methods  
  async createStreamChunk(chunk: InsertStreamChunk): Promise<StreamChunk> {
    const id = nanoid();
    return { ...chunk, id, ingestedAt: new Date() };
  }

  async getStreamChunks(datasetId: string, limit = 100): Promise<StreamChunk[]> {
    return [];
  }

  async getStreamChunksByTimeRange(datasetId: string, fromTs: Date, toTs: Date): Promise<StreamChunk[]> {
    return [];
  }

  async createStreamCheckpoint(checkpoint: InsertStreamCheckpoint): Promise<StreamCheckpoint> {
    const id = nanoid();
    return { ...checkpoint, id, createdAt: new Date() };
  }

  async getLatestCheckpoint(sourceId: string): Promise<StreamCheckpoint | undefined> {
    return undefined;
  }

  async updateCheckpoint(sourceId: string, cursor: string): Promise<boolean> {
    return true;
  }

  async createScrapingJob(job: InsertScrapingJob): Promise<ScrapingJob> {
    await this.init();
    
    const id = nanoid();
    const scrapingJob: ScrapingJob = {
      ...job,
      id,
      status: 'created',
      lastRunAt: null,
      nextRunAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.scrapingJobCache.set(id, scrapingJob);
    return scrapingJob;
  }

  async getScrapingJob(id: string): Promise<ScrapingJob | undefined> {
    await this.init();
    return this.scrapingJobCache.get(id);
  }

  async getScrapingJobsByDataset(datasetId: string): Promise<ScrapingJob[]> {
    await this.init();
    return Array.from(this.scrapingJobCache.values())
      .filter(job => job.datasetId === datasetId);
  }

  async updateScrapingJob(id: string, updates: Partial<ScrapingJob>): Promise<ScrapingJob | undefined> {
    await this.init();
    
    const existing = this.scrapingJobCache.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.scrapingJobCache.set(id, updated);
    return updated;
  }

  async deleteScrapingJob(id: string): Promise<boolean> {
    await this.init();
    return this.scrapingJobCache.delete(id);
  }

  async getJobsToRun(): Promise<ScrapingJob[]> {
    await this.init();
    const now = new Date();
    return Array.from(this.scrapingJobCache.values())
      .filter(job => job.nextRunAt && job.nextRunAt <= now);
  }

  async updateJobNextRun(id: string, nextRunAt: Date): Promise<boolean> {
    await this.init();
    
    const job = this.scrapingJobCache.get(id);
    if (!job) return false;
    
    const updated = { ...job, nextRunAt, updatedAt: new Date() };
    this.scrapingJobCache.set(id, updated);
    return true;
  }

  // More stub implementations for complete interface compatibility
  async createScrapingRun(run: InsertScrapingRun): Promise<ScrapingRun> {
    const id = nanoid();
    return { ...run, id, startedAt: new Date() };
  }

  async getScrapingRuns(jobId: string, limit = 50): Promise<ScrapingRun[]> {
    return [];
  }

  async updateScrapingRun(id: string, updates: Partial<ScrapingRun>): Promise<ScrapingRun | undefined> {
    return undefined;
  }

  async getLatestScrapingRun(jobId: string): Promise<ScrapingRun | undefined> {
    return undefined;
  }

  async createDatasetVersion(version: InsertDatasetVersion): Promise<DatasetVersion> {
    const id = nanoid();
    return { ...version, id, createdAt: new Date() };
  }

  async getDatasetVersions(datasetId: string): Promise<DatasetVersion[]> {
    return [];
  }

  async getLatestDatasetVersion(datasetId: string): Promise<DatasetVersion | undefined> {
    return undefined;
  }

  async deleteDatasetVersion(id: string): Promise<boolean> {
    return true;
  }

  async createJourney(journey: InsertJourney): Promise<Journey> {
    await this.init();
    
    const id = nanoid();
    const newJourney: Journey = { 
      ...journey, 
      id, 
      createdAt: new Date(), 
      updatedAt: new Date() 
    };
    
    // Store in memory immediately for fast access
    // Note: HybridStorage doesn't seem to have journeyCache, so we'll create journeys on demand
    
    // Queue for database persistence
    this.writeBackCache.enqueue(`journey-${id}`, 'create-journey', newJourney);
    
    return newJourney;
  }

  async getJourney(id: string): Promise<Journey | undefined> {
    await this.init();
    
    // Query database directly since there's no journey cache
    try {
      const dbJourneys = await db.select().from(journeys).where(eq(journeys.id, id));
      return dbJourneys.length > 0 ? dbJourneys[0] : undefined;
    } catch (error) {
      console.error('Error fetching journey from database:', error);
      return undefined;
    }
  }

  async getJourneysByUser(userId: string): Promise<Journey[]> {
    await this.init();
    
    try {
      return await db.select().from(journeys).where(eq(journeys.userId, userId));
    } catch (error) {
      console.error('Error fetching user journeys from database:', error);
      return [];
    }
  }

  async updateJourney(id: string, updates: Partial<Journey>): Promise<Journey | undefined> {
    await this.init();
    
    try {
      const updatedData = {
        ...updates,
        updatedAt: new Date()
      };
      
      // Queue for database persistence
      this.writeBackCache.enqueue(`journey-update-${id}`, 'update-journey', { id, updates: updatedData });
      
      // Return updated journey by fetching it
      const [updated] = await db.update(journeys)
        .set(updatedData)
        .where(eq(journeys.id, id))
        .returning();
        
      return updated || undefined;
    } catch (error) {
      console.error('Error updating journey:', error);
      return undefined;
    }
  }

  async deleteJourney(id: string): Promise<boolean> {
    await this.init();
    
    try {
      // Queue deletion for persistence
      this.writeBackCache.enqueue(`journey-delete-${id}`, 'delete-journey', { id });
      
      const result = await db.delete(journeys).where(eq(journeys.id, id));
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('Error deleting journey:', error);
      return false;
    }
  }

  async createJourneyStepProgress(progress: InsertJourneyStepProgress): Promise<JourneyStepProgress> {
    const id = nanoid();
    return { ...progress, id, createdAt: new Date(), updatedAt: new Date() };
  }

  async getJourneyProgress(journeyId: string): Promise<JourneyStepProgress[]> {
    return [];
  }

  async updateJourneyStepProgress(id: string, updates: Partial<JourneyStepProgress>): Promise<JourneyStepProgress | undefined> {
    return undefined;
  }

  async createCostEstimate(estimate: InsertCostEstimate): Promise<CostEstimate> {
    const id = nanoid();
    return { ...estimate, id, createdAt: new Date(), updatedAt: new Date() };
  }

  async getCostEstimate(id: string): Promise<CostEstimate | undefined> {
    return undefined;
  }

  async getCostEstimatesByUser(userId: string): Promise<CostEstimate[]> {
    return [];
  }

  async getCostEstimatesByJourney(journeyId: string): Promise<CostEstimate[]> {
    return [];
  }

  async updateCostEstimate(id: string, updates: Partial<CostEstimate>): Promise<CostEstimate | undefined> {
    return undefined;
  }

  async getValidCostEstimates(userId: string): Promise<CostEstimate[]> {
    return [];
  }

  async createEligibilityCheck(check: InsertEligibilityCheck): Promise<EligibilityCheck> {
    const id = nanoid();
    return { ...check, id, createdAt: new Date(), updatedAt: new Date() };
  }

  async getEligibilityCheck(id: string): Promise<EligibilityCheck | undefined> {
    return undefined;
  }

  async getEligibilityChecksByUser(userId: string): Promise<EligibilityCheck[]> {
    return [];
  }

  async getEligibilityChecksByFeature(userId: string, feature: string): Promise<EligibilityCheck[]> {
    return [];
  }

  async getLatestEligibilityCheck(userId: string, feature: string): Promise<EligibilityCheck | undefined> {
    return undefined;
  }

  // User Settings - return basic user settings object
  async getUserSettings(userId: string): Promise<any> {
    await this.init();
    
    const user = this.userCache.get(userId);
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
    await this.init();
    
    // For now, return basic settings since journeys are placeholder
    // This can be expanded when journey functionality is fully implemented
    return {
      journeyId: journeyId,
      settings: {
        allowDataExport: true,
        enableNotifications: true,
        securityLevel: 'standard'
      },
      preferences: {
        analysisDepth: 'comprehensive',
        visualizationTypes: ['charts', 'tables', 'insights']
      }
    };
  }

  // Usage Logging - track user actions and AI usage
  async logUsage(usage: { userId: string; projectId?: string | null; action: string; provider?: string; tokensUsed?: number; cost?: string }): Promise<void> {
    await this.init();
    
    // Log to console for now (can be expanded to database later)
    console.log('Usage logged:', {
      timestamp: new Date().toISOString(),
      userId: usage.userId,
      projectId: usage.projectId,
      action: usage.action,
      provider: usage.provider,
      tokensUsed: usage.tokensUsed,
      cost: usage.cost
    });
    
    // Could be expanded to store in database for analytics
    // For now, just console logging to prevent errors
  }
}

export const storage = new HybridStorage();