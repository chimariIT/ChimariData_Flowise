import { DataProject, InsertDataProject, User, Project, InsertProject, EnterpriseInquiry, InsertEnterpriseInquiry, GuidedAnalysisOrder, InsertGuidedAnalysisOrder } from "@shared/schema";
import { users, projects, enterpriseInquiries, guidedAnalysisOrders } from "@shared/schema";
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
    userId: null,
  };
}

// Interface for storage operations
export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: { id: string; email: string; firstName?: string; lastName?: string; profileImageUrl?: string }): Promise<User>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: { email: string; hashedPassword: string; firstName?: string; lastName?: string }): Promise<User>;
  validateUserCredentials(email: string, password: string): Promise<User | null>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<void>;
  
  // Project operations
  getProject(id: string): Promise<DataProject | undefined>;
  getProjects(): Promise<DataProject[]>;
  getAllProjects(): Promise<DataProject[]>;
  createProject(project: InsertDataProject): Promise<DataProject>;
  updateProject(id: string, project: Partial<InsertDataProject>): Promise<DataProject>;
  deleteProject(id: string): Promise<void>;
  
  // Enterprise inquiry operations
  createEnterpriseInquiry(inquiry: InsertEnterpriseInquiry): Promise<EnterpriseInquiry>;
  getEnterpriseInquiries(): Promise<EnterpriseInquiry[]>;
  
  // Guided analysis operations
  createGuidedAnalysisOrder(order: InsertGuidedAnalysisOrder): Promise<GuidedAnalysisOrder>;
  getGuidedAnalysisOrders(): Promise<GuidedAnalysisOrder[]>;
}

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
      case 'create-enterprise-inquiry':
        await db.insert(enterpriseInquiries).values(data);
        break;
      case 'create-guided-analysis-order':
        await db.insert(guidedAnalysisOrders).values(data);
        break;
    }
  }
}

export class HybridStorage implements IStorage {
  private userCache = new Map<string, User>();
  private usersByEmail = new Map<string, User>();
  private projectCache = new Map<string, DataProject>();
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

      // Populate caches
      for (const user of dbUsers) {
        this.userCache.set(user.id, user);
        if (user.email) {
          this.usersByEmail.set(user.email, user);
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
  async getUser(id: string): Promise<User | undefined> {
    await this.init();
    return this.userCache.get(id);
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
      hashedPassword: null,
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
    return this.usersByEmail.get(email);
  }

  async createUser(user: { email: string; hashedPassword: string; firstName?: string; lastName?: string }): Promise<User> {
    await this.init();
    
    const now = new Date();
    const newUser: User = {
      id: nanoid(),
      email: user.email,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
      profileImageUrl: null,
      hashedPassword: user.hashedPassword,
      createdAt: now,
      updatedAt: now,
    };

    // Update cache immediately
    this.userCache.set(newUser.id, newUser);
    this.usersByEmail.set(user.email, newUser);

    // Queue for async persistence
    this.writeBackCache.enqueue(`user-${newUser.id}`, 'create-user', newUser);
    
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

    // Update cache immediately
    const updatedUser = { ...user, hashedPassword, updatedAt: new Date() };
    this.userCache.set(userId, updatedUser);
    if (user.email) {
      this.usersByEmail.set(user.email, updatedUser);
    }

    // Queue for async persistence
    this.writeBackCache.enqueue(`user-password-${userId}`, 'update-user-password', { userId, hashedPassword });
  }

  // Project operations
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
}

export const storage = new HybridStorage();