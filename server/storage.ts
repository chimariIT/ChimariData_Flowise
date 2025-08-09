import { DataProject, InsertDataProject, User, Project, InsertProject, EnterpriseInquiry, InsertEnterpriseInquiry, GuidedAnalysisOrder, InsertGuidedAnalysisOrder } from "@shared/schema";
import { users, projects, enterpriseInquiries, guidedAnalysisOrders } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

// Convert between DataProject and Project types
function projectToDataProject(project: Project): DataProject {
  return {
    id: project.id,
    userId: project.userId || '',
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
    userId: dataProject.userId,
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

export interface IStorage {
  // Project operations
  createProject(project: InsertDataProject): Promise<DataProject>;
  getProject(id: string): Promise<DataProject | undefined>;
  getAllProjects(): Promise<DataProject[]>;
  updateProject(id: string, updates: Partial<DataProject>): Promise<DataProject | undefined>;
  deleteProject(id: string): Promise<boolean>;
  
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: { id: string; email: string; firstName?: string; lastName?: string; profileImageUrl?: string; }): Promise<User>;
  createUser(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User>;
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
}

export class MemStorage implements IStorage {
  private projects: Map<string, DataProject> = new Map();
  private users: Map<string, User> = new Map();
  private guidedAnalysisOrders: Map<string, any> = new Map();
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

  // User operations (required for Replit Auth)
  async upsertUser(userData: { id: string; email: string; firstName?: string; lastName?: string; profileImageUrl?: string; }): Promise<User> {
    const existingUser = this.users.get(userData.id);
    if (existingUser) {
      const updatedUser = {
        ...existingUser,
        email: userData.email,
        firstName: userData.firstName || existingUser.firstName,
        lastName: userData.lastName || existingUser.lastName,
        profileImageUrl: userData.profileImageUrl || existingUser.profileImageUrl,
        updatedAt: new Date(),
      };
      this.users.set(userData.id, updatedUser);
      return updatedUser;
    }
    
    const newUser: User = {
      id: userData.id,
      email: userData.email,
      hashedPassword: null,
      firstName: userData.firstName || null,
      lastName: userData.lastName || null,
      profileImageUrl: userData.profileImageUrl || null,
      provider: "replit",
      providerId: userData.id,
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
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
      usageResetAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.users.set(userData.id, newUser);
    return newUser;
  }

  async createUser(userData: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
    // Ensure the user has an ID
    const userId = userData.id || crypto.randomUUID();
    const user: User = {
      ...userData,
      id: userId, // Explicitly set the ID
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    console.log("Creating user with data:", {
      id: user.id,
      email: user.email,
      provider: user.provider,
      hasPassword: !!user.hashedPassword
    });
    
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
}

export class DatabaseStorage implements IStorage {
  // User operations (required for Replit Auth)
  async upsertUser(userData: { id: string; email: string; firstName?: string; lastName?: string; profileImageUrl?: string; }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        id: userData.id,
        email: userData.email,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        profileImageUrl: userData.profileImageUrl || null,
        provider: 'replit',
        providerId: userData.id,
        emailVerified: true,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName || null,
          lastName: userData.lastName || null,
          profileImageUrl: userData.profileImageUrl || null,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    return user;
  }

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
    const [project] = await db
      .update(projects)
      .set(updates as any)
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
}

// Use HybridStorage for optimal performance with persistence
import { HybridStorage } from './hybrid-storage';
export const storage = new MemStorage();