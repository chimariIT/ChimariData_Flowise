import { DataProject, InsertDataProject } from "@shared/schema";
import { users, projects, enterpriseInquiries, guidedAnalysisOrders, datasets, projectDatasets, projectArtifacts, streamingSources, streamChunks, streamCheckpoints, scrapingJobs, scrapingRuns, datasetVersions, journeys, journeyStepProgress, costEstimates, eligibilityChecks } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

// Local type aliases derived from Drizzle tables
type User = typeof users.$inferSelect;
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

// Convert between DataProject and Project types
function projectToDataProject(project: Project): DataProject {
  const journeyType = (project.journeyType || "non-tech") as DataProject["journeyType"];

  return {
    id: project.id,
    userId: project.userId,
    journeyType,
    name: project.name,
    fileName: "",
    fileSize: 0,
    fileType: "",
    uploadedAt: project.createdAt ?? new Date(),
    description: project.description || undefined,
    isTrial: false,
    schema: undefined,
    recordCount: undefined,
    data: undefined,
    processed: false,
    piiAnalysis: undefined,
    uniqueIdentifiers: undefined,
    dataSource: "upload",
    sourceMetadata: undefined,
    transformations: undefined,
    joinedFiles: undefined,
    outlierAnalysis: undefined,
    missingDataAnalysis: undefined,
    normalityTests: undefined,
    analysisResults: undefined,
    stepByStepAnalysis: undefined,
    visualizations: undefined,
    aiInsights: undefined,
    aiRole: undefined,
    aiActions: undefined,
    mcpResources: undefined,
    purchasedFeatures: undefined,
    isPaid: false,
    selectedFeatures: undefined,
    paymentIntentId: undefined,
    upgradedAt: undefined,
  };
}

function dataProjectToInsertProject(dataProject: InsertDataProject): Omit<InsertProject, "id"> {
  return {
    userId: dataProject.userId || "",
    journeyType: dataProject.journeyType || "non-tech",
    name: dataProject.name,
    description: dataProject.description || null,
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
    // Only execute database operations if db is available
    if (!db) {
      console.log('⚠️ Database not available, skipping persistence operation:', operation);
      return;
    }

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
        await db.update(users).set({ hashedPassword: data.hashedPassword }).where(eq(users.id, data.userId));
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

      // Store db reference locally to prevent race conditions
      const currentDb = db;
      
      // Only try to load from database if db is available
      if (currentDb) {
        // Try to load users
        try {
          dbUsers = await currentDb.select().from(users);
        } catch (error) {
          console.error('Failed to load users from database:', error);
        }

        // Try to load projects
        try {
          dbProjects = await currentDb.select().from(projects);
        } catch (error) {
          console.error('Failed to load projects from database:', error);
        }

        // Try to load enterprise inquiries
        try {
          dbInquiries = await currentDb.select().from(enterpriseInquiries);
        } catch (error) {
          console.error('Failed to load enterprise inquiries from database:', error);
        }

        // Try to load guided analysis orders
        try {
          dbOrders = await currentDb.select().from(guidedAnalysisOrders);
        } catch (error) {
          console.error('Failed to load guided analysis orders from database:', error);
        }
      } else {
        console.log('⚠️ Database not available, using memory-only storage');
      }

      // Populate caches with field mapping
      for (const user of dbUsers) {
        // Map database 'password' field to application 'hashedPassword' field
        // Note: Drizzle converts database 'hashed_password' column to 'hashedPassword' TypeScript field
        const mappedUser = {
          ...user,
          hashedPassword: user.hashedPassword,
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
      // Ensure DB receives hashedPassword column only
      hashedPassword: newUser.hashedPassword
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
    
    // Check database only if db is available
    if (db) {
      try {
        const [dbUser] = await db.select().from(users).where(eq(users.emailVerificationToken, token));
        if (dbUser) {
          const user = {
            ...dbUser,
            hashedPassword: dbUser.hashedPassword,
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
    
    // Return cached users if database is not available
    if (!db) {
      return Array.from(this.userCache.values());
    }
    
    try {
      const dbUsers = await db.select().from(users);
      const mappedUsers = dbUsers.map((user: User) => ({
        ...user,
        hashedPassword: user.hashedPassword,
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
      hashedPassword: this.userCache.get(user.id)?.hashedPassword ?? null,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
      profileImageUrl: user.profileImageUrl || null,
      provider: this.userCache.get(user.id)?.provider ?? 'local',
      providerId: this.userCache.get(user.id)?.providerId ?? null,
      emailVerified: this.userCache.get(user.id)?.emailVerified ?? false,
      emailVerificationToken: this.userCache.get(user.id)?.emailVerificationToken ?? null,
      emailVerificationExpires: this.userCache.get(user.id)?.emailVerificationExpires ?? null,
      passwordResetToken: this.userCache.get(user.id)?.passwordResetToken ?? null,
      passwordResetExpires: this.userCache.get(user.id)?.passwordResetExpires ?? null,
      subscriptionTier: this.userCache.get(user.id)?.subscriptionTier ?? 'none',
      subscriptionStatus: this.userCache.get(user.id)?.subscriptionStatus ?? 'inactive',
      stripeCustomerId: this.userCache.get(user.id)?.stripeCustomerId ?? null,
      stripeSubscriptionId: this.userCache.get(user.id)?.stripeSubscriptionId ?? null,
      subscriptionExpiresAt: this.userCache.get(user.id)?.subscriptionExpiresAt ?? null,
        subscriptionBalances: this.userCache.get(user.id)?.subscriptionBalances ?? {},
  credits: this.userCache.get(user.id)?.credits ?? "0",
      isPaid: this.userCache.get(user.id)?.isPaid ?? false,
      monthlyUploads: this.userCache.get(user.id)?.monthlyUploads ?? 0,
      monthlyDataVolume: this.userCache.get(user.id)?.monthlyDataVolume ?? 0,
      monthlyAIInsights: this.userCache.get(user.id)?.monthlyAIInsights ?? 0,
      monthlyAnalysisComponents: this.userCache.get(user.id)?.monthlyAnalysisComponents ?? 0,
      monthlyVisualizations: this.userCache.get(user.id)?.monthlyVisualizations ?? 0,
      currentStorageGb: this.userCache.get(user.id)?.currentStorageGb ?? null as any,
      monthlyDataProcessedGb: this.userCache.get(user.id)?.monthlyDataProcessedGb ?? null as any,
      userRole: this.userCache.get(user.id)?.userRole ?? 'non-tech',
      technicalLevel: this.userCache.get(user.id)?.technicalLevel ?? 'beginner',
      industry: this.userCache.get(user.id)?.industry ?? null,
      preferredJourney: this.userCache.get(user.id)?.preferredJourney ?? null,
      journeyCompletions: this.userCache.get(user.id)?.journeyCompletions ?? null as any,
      onboardingCompleted: this.userCache.get(user.id)?.onboardingCompleted ?? false,
      usageResetAt: this.userCache.get(user.id)?.usageResetAt ?? new Date(),
      role: this.userCache.get(user.id)?.role ?? null,
      isAdmin: this.userCache.get(user.id)?.isAdmin ?? false,
      // P0-1 Fix: Add trial credits fields
      trialCredits: this.userCache.get(user.id)?.trialCredits ?? 100,
      trialCreditsUsed: this.userCache.get(user.id)?.trialCreditsUsed ?? 0,
      trialCreditsRefreshedAt: this.userCache.get(user.id)?.trialCreditsRefreshedAt ?? new Date(),
      trialCreditsExpireAt: this.userCache.get(user.id)?.trialCreditsExpireAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
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
    
    // Fall back to database query only if db is available
    const currentDb = db;
    if (currentDb) {
      try {
        const [dbUser] = await currentDb.select().from(users).where(eq(users.email, email));
        if (dbUser) {
          // Map database fields to application fields
          const mappedUser = {
            ...dbUser,
            hashedPassword: dbUser.hashedPassword,
          };
          
          // Update cache for future lookups
          this.userCache.set(mappedUser.id, mappedUser);
          this.usersByEmail.set(email, mappedUser);
          
          return mappedUser;
        }
      } catch (error) {
        console.error('Error querying user by email from database:', error);
      }
    }
    
    return undefined;
  }

  // remove duplicate getUserByVerificationToken - unified earlier version handles DB fallback

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

  // Duplicate createUser removed; using the generic version defined earlier in this class

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
      updatedAt: new Date() 
    };
    this.userCache.set(userId, updatedUser);
    if (user.email) {
      this.usersByEmail.set(user.email, updatedUser);
    }

    // CRITICAL: Make auth operations synchronous to prevent race conditions
    // Write immediately to database instead of using write-behind cache
    if (db) {
      await db.update(users).set({ hashedPassword }).where(eq(users.id, userId));
    } else {
      console.log('⚠️ Database not available, password update stored in memory only');
    }
  }

  // Dataset operations
  async createDataset(datasetData: InsertDataset): Promise<Dataset> {
    await this.init();
    const id = nanoid();
    const dataset: Dataset = {
      ...datasetData,
      id,
      sourceType: datasetData.sourceType ?? "upload",
      // no format field in schema
      dataType: datasetData.dataType ?? null,
  data: (datasetData as any).data ?? null,
  status: (datasetData as any).status ?? 'ready',
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
    
    // Check database only if db is available
    if (db) {
      try {
        const [dataset] = await db.select().from(datasets).where(eq(datasets.id, id));
        if (dataset) {
          this.datasetCache.set(id, dataset);
          return dataset;
        }
      } catch (error) {
        console.error('Error getting dataset:', error);
      }
    }
    
    return undefined;
  }

  async getDatasetsByOwner(ownerId: string): Promise<Dataset[]> {
    await this.init();
    
    // Return cached datasets if database is not available
    if (!db) {
      return Array.from(this.datasetCache.values()).filter(dataset => dataset.userId === ownerId);
    }
    
    try {
      const allDatasets = await db.select().from(datasets).where(eq(datasets.userId, ownerId));
      
      // Update cache
      for (const dataset of allDatasets) {
        this.datasetCache.set(dataset.id, dataset);
      }
      
      return allDatasets;
    } catch (error) {
      console.error('Error getting datasets by owner:', error);
      return Array.from(this.datasetCache.values()).filter(dataset => dataset.userId === ownerId);
    }
  }

  async updateDataset(id: string, updates: Partial<Dataset>): Promise<Dataset | undefined> {
    await this.init();
    
    const existing = this.datasetCache.get(id);
    let base = existing;
    if (!base) {
      // Try to get from database
      const dataset = await this.getDataset(id);
      if (!dataset) return undefined;
      base = dataset;
    }
    
    const updatedDataset: Dataset = { ...(base as Dataset), ...(updates as Partial<Dataset>), updatedAt: new Date() };
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
      const allDatasets = await db.select().from(datasets).where(eq(datasets.userId, ownerId));
      
      if (!query) {
        return allDatasets;
      }
      
      // Filter by query string (search in original file name)
      return allDatasets.filter((dataset: Dataset) => 
        dataset.originalFileName.toLowerCase().includes(query.toLowerCase())
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
      status: artifactData.status ?? 'pending',
      inputRefs: artifactData.inputRefs ?? null,
      params: artifactData.params ?? null,
      metrics: artifactData.metrics ?? null,
      output: (artifactData as any).output ?? null,
      fileRefs: (artifactData as any).fileRefs ?? null,
      createdBy: (artifactData as any).createdBy ?? null,
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
      
  const filtered = type ? artifacts.filter((a: any) => a.type === type) : artifacts;
      
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

  // Queue for async persistence - map only supported fields
  const dbUpdates: Partial<InsertProject> = {} as any;
  if ((updates as any).userId !== undefined) (dbUpdates as any).ownerId = (updates as any).userId as string;
  if ((updates as any).name !== undefined) (dbUpdates as any).name = (updates as any).name as string;
  if ((updates as any).description !== undefined) (dbUpdates as any).description = ((updates as any).description as string | undefined) ?? null;
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
      ...inquiry,
      id: nanoid(),
      submittedAt: now,
      status: (inquiry as any).status ?? 'pending',
      phone: (inquiry as any).phone ?? null,
      message: (inquiry as any).message ?? null,
    } as EnterpriseInquiry;

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
      ...order,
      id: nanoid(),
      createdAt: now,
      updatedAt: now,
      status: (order as any).status ?? 'pending',
      projectId: (order as any).projectId ?? null,
      userId: (order as any).userId ?? null,
      configuration: (order as any).configuration ?? null,
      orderData: (order as any).orderData ?? null,
    } as GuidedAnalysisOrder;

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
      status: (source as any).status ?? 'inactive',
      headers: (source as any).headers ?? null,
      params: (source as any).params ?? null,
      parseSpec: (source as any).parseSpec ?? null,
      batchSize: (source as any).batchSize ?? 1000,
      flushMs: (source as any).flushMs ?? 5000,
      maxBuffer: (source as any).maxBuffer ?? 100000,
      dedupeKeyPath: (source as any).dedupeKeyPath ?? null,
      timestampPath: (source as any).timestampPath ?? null,
      lastCheckpoint: (source as any).lastCheckpoint ?? null,
      lastError: (source as any).lastError ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as StreamingSource;
    
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
  return { ...chunk, id, createdAt: new Date() } as StreamChunk;
  }

  async getStreamChunks(datasetId: string, limit = 100): Promise<StreamChunk[]> {
    return [];
  }

  async getStreamChunksByTimeRange(datasetId: string, fromTs: Date, toTs: Date): Promise<StreamChunk[]> {
    return [];
  }

  async createStreamCheckpoint(checkpoint: InsertStreamCheckpoint): Promise<StreamCheckpoint> {
    const id = nanoid();
    return { ...checkpoint, id, ts: (checkpoint as any).ts ?? new Date() } as StreamCheckpoint;
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
      status: (job as any).status ?? 'inactive',
      schedule: (job as any).schedule ?? null,
      extractionSpec: (job as any).extractionSpec ?? null,
      paginationSpec: (job as any).paginationSpec ?? null,
      loginSpec: (job as any).loginSpec ?? null,
      rateLimitRPM: (job as any).rateLimitRPM ?? 60,
      concurrency: (job as any).concurrency ?? 1,
      respectRobots: (job as any).respectRobots ?? true,
      lastRunAt: (job as any).lastRunAt ?? null,
      nextRunAt: (job as any).nextRunAt ?? null,
      lastError: (job as any).lastError ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ScrapingJob;
    
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
    const now = new Date();
    return {
      ...run,
      id,
      createdAt: now,
      startedAt: (run as any).startedAt ?? now,
      finishedAt: (run as any).finishedAt ?? null,
      status: (run as any).status ?? 'running',
      recordCount: (run as any).recordCount ?? null,
      artifactId: (run as any).artifactId ?? null,
    } as ScrapingRun;
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
    return { ...version, id, createdAt: new Date(), schema: (version as any).schema ?? null } as DatasetVersion;
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
      updatedAt: new Date(),
      title: (journey as any).title ?? null,
      description: (journey as any).description ?? null,
      goals: (journey as any).goals ?? null,
      questions: (journey as any).questions ?? null,
      suggestedPlan: (journey as any).suggestedPlan ?? null,
      selectedDatasets: (journey as any).selectedDatasets ?? null,
      costEstimateId: (journey as any).costEstimateId ?? null,
      eligibilityCheckId: (journey as any).eligibilityCheckId ?? null,
      artifacts: (journey as any).artifacts ?? null,
      completedAt: (journey as any).completedAt ?? null,
      projectId: (journey as any).projectId ?? null,
    } as Journey;
    
    // Store in memory immediately for fast access
    // Note: HybridStorage doesn't seem to have journeyCache, so we'll create journeys on demand
    
    // Queue for database persistence
    this.writeBackCache.enqueue(`journey-${id}`, 'create-journey', newJourney);
    
    return newJourney;
  }

  async getJourney(id: string): Promise<Journey | undefined> {
    await this.init();
    
    // Query database directly only if db is available
    if (!db) {
      return undefined;
    }
    
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
    
    // Return empty array if database is not available
    if (!db) {
      return [];
    }
    
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
    const now = new Date();
    return { 
      ...progress, 
      id, 
      createdAt: now, 
      updatedAt: now,
      startedAt: (progress as any).startedAt ?? null,
      completedAt: (progress as any).completedAt ?? null,
      progress: (progress as any).progress ?? 0,
      stepData: (progress as any).stepData ?? null,
      errors: (progress as any).errors ?? null,
      costIncurred: (progress as any).costIncurred ?? 0,
    } as JourneyStepProgress;
  }

  async getJourneyProgress(journeyId: string): Promise<JourneyStepProgress[]> {
    return [];
  }

  async updateJourneyStepProgress(id: string, updates: Partial<JourneyStepProgress>): Promise<JourneyStepProgress | undefined> {
    return undefined;
  }

  async createCostEstimate(estimate: InsertCostEstimate): Promise<CostEstimate> {
    const id = nanoid();
    const now = new Date();
    return { 
      ...estimate, 
      id, 
      createdAt: now,
      approvedAt: (estimate as any).approvedAt ?? null,
      journeyId: (estimate as any).journeyId ?? null,
    } as CostEstimate;
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
    const now = new Date();
    return { 
      ...check, 
      id, 
      createdAt: now,
    } as EligibilityCheck;
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