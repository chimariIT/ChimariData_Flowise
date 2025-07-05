import { users, projects, userSettings, usageLogs, enterpriseInquiries, type User, type InsertUser, type UpsertUser, type Project, type InsertProject, type UserSettings, type InsertUserSettings, type UsageLog, type InsertUsageLog, type EnterpriseInquiry, type InsertEnterpriseInquiry } from "@shared/schema";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByProviderId(provider: string, providerId: string): Promise<User | undefined>;
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  updateUserTokens(userId: string, accessToken: string, refreshToken: string): Promise<User | undefined>;
  updateUserProvider(userId: string, provider: string, providerId: string, accessToken: string, refreshToken: string): Promise<User | undefined>;
  
  // Project methods
  createProject(project: InsertProject & { ownerId: string }): Promise<Project>;
  getUserProjects(userId: string): Promise<Project[]>;
  getProject(id: string, userId: string): Promise<Project | undefined>;
  updateProject(id: string, userId: string, updates: Partial<Project>): Promise<Project | undefined>;
  updateProjectPaymentStatus(projectId: string, isPaid: boolean, paymentIntentId?: string): Promise<Project | undefined>;
  
  // User settings methods
  getUserSettings(userId: string): Promise<UserSettings | undefined>;
  createUserSettings(settings: InsertUserSettings): Promise<UserSettings>;
  updateUserSettings(userId: string, updates: Partial<UserSettings>): Promise<UserSettings | undefined>;
  resetMonthlyUsage(userId: string): Promise<void>;
  updateStripeCustomerId(userId: string, customerId: string): Promise<UserSettings | undefined>;
  updateUserStripeInfo(userId: string, info: { customerId: string; subscriptionId: string }): Promise<UserSettings | undefined>;
  
  // Usage tracking methods
  logUsage(log: InsertUsageLog): Promise<UsageLog>;
  getUserUsageThisMonth(userId: string): Promise<number>;
  canUserMakeQuery(userId: string): Promise<boolean>;
  
  // Enterprise inquiry methods
  createEnterpriseInquiry(inquiry: InsertEnterpriseInquiry): Promise<EnterpriseInquiry>;
  getEnterpriseInquiries(): Promise<EnterpriseInquiry[]>;
  updateEnterpriseInquiry(id: number, updates: Partial<EnterpriseInquiry>): Promise<EnterpriseInquiry | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private projects: Map<string, Project>;
  private userSettings: Map<string, UserSettings>;
  private usageLogs: Map<string, UsageLog>;
  private enterpriseInquiries: Map<number, EnterpriseInquiry>;
  private currentUserId: number;
  private currentLogId: number;
  private currentInquiryId: number;

  constructor() {
    this.users = new Map();
    this.projects = new Map();
    this.userSettings = new Map();
    this.usageLogs = new Map();
    this.enterpriseInquiries = new Map();
    this.currentUserId = 1;
    this.currentLogId = 1;
    this.currentInquiryId = 1;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async getUserByProviderId(provider: string, providerId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.provider === provider && user.providerId === providerId,
    );
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    // Mock implementation for now
    return Array.from(this.users.values()).find(
      (user) => (user as any).emailVerificationToken === token,
    );
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (user) {
      const updatedUser = { ...user, ...updates, updatedAt: new Date() };
      this.users.set(id, updatedUser);
      return updatedUser;
    }
    return undefined;
  }

  async updateUserTokens(userId: string, accessToken: string, refreshToken: string): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (user) {
      user.accessToken = accessToken;
      user.refreshToken = refreshToken;
      this.users.set(userId, user);
      return user;
    }
    return undefined;
  }

  async updateUserProvider(userId: string, provider: string, providerId: string, accessToken: string, refreshToken: string): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (user) {
      user.provider = provider;
      user.providerId = providerId;
      user.accessToken = accessToken;
      user.refreshToken = refreshToken;
      this.users.set(userId, user);
      return user;
    }
    return undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Generate string ID for new user (for compatibility with legacy integer IDs)
    const id = insertUser.id || (this.currentUserId++).toString();
    const user: User = { 
      id: id,
      username: insertUser.username || null,
      password: insertUser.password || null,
      email: insertUser.email || null,
      firstName: insertUser.firstName || null,
      lastName: insertUser.lastName || null,
      profileImageUrl: insertUser.profileImageUrl || null,
      provider: insertUser.provider || null,
      providerId: insertUser.providerId || null,
      accessToken: insertUser.accessToken || null,
      refreshToken: insertUser.refreshToken || null,
      emailVerified: (insertUser as any).emailVerified || false,
      emailVerificationToken: (insertUser as any).emailVerificationToken || null,
      emailVerificationExpires: (insertUser as any).emailVerificationExpires || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(user.id, user);
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const existingUser = this.users.get(userData.id);
    if (existingUser) {
      // Update existing user
      const updatedUser: User = {
        ...existingUser,
        username: userData.username ?? existingUser.username,
        password: userData.password ?? existingUser.password,
        email: userData.email ?? existingUser.email,
        firstName: userData.firstName ?? existingUser.firstName,
        lastName: userData.lastName ?? existingUser.lastName,
        profileImageUrl: userData.profileImageUrl ?? existingUser.profileImageUrl,
        provider: userData.provider ?? existingUser.provider,
        providerId: userData.providerId ?? existingUser.providerId,
        accessToken: userData.accessToken ?? existingUser.accessToken,
        refreshToken: userData.refreshToken ?? existingUser.refreshToken,
        updatedAt: new Date(),
      };
      this.users.set(userData.id, updatedUser);
      return updatedUser;
    } else {
      // Create new user
      const newUser: User = {
        id: userData.id,
        username: userData.username || null,
        password: userData.password || null,
        email: userData.email || null,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        profileImageUrl: userData.profileImageUrl || null,
        provider: userData.provider || null,
        providerId: userData.providerId || null,
        accessToken: userData.accessToken || null,
        refreshToken: userData.refreshToken || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.users.set(userData.id, newUser);
      return newUser;
    }
  }

  async createProject(projectData: InsertProject & { ownerId: string }): Promise<Project> {
    const id = Math.random().toString(36).substring(2, 15);
    const project: Project = {
      id,
      name: projectData.name,
      schema: projectData.schema || {},
      questions: projectData.questions || [],
      insights: projectData.insights || {},
      status: projectData.status || "active",
      recordCount: projectData.recordCount || 0,
      dataSnapshot: projectData.dataSnapshot || null,
      ownerId: projectData.ownerId,
      analysisType: projectData.analysisType || "standard",
      paymentType: projectData.paymentType || "subscription",
      paymentAmount: projectData.paymentAmount || null,
      paymentStatus: projectData.paymentStatus || "pending",
      isPaid: projectData.isPaid || false,
      stripePaymentIntentId: projectData.stripePaymentIntentId || null,
      dataSizeMB: projectData.dataSizeMB || 0,
      complexityScore: projectData.complexityScore || 1,
      fileMetadata: projectData.fileMetadata || null,
      serviceType: projectData.serviceType,
      workflowStep: projectData.workflowStep || "questions",
      dataSource: projectData.dataSource || null,
      malwareScanStatus: projectData.malwareScanStatus || "pending",
      columnSummaries: projectData.columnSummaries || null,
      createdAt: new Date(),
    };
    this.projects.set(id, project);
    return project;
  }

  async getUserProjects(userId: string): Promise<Project[]> {
    return Array.from(this.projects.values()).filter(
      (project) => project.ownerId === userId,
    );
  }

  async getProject(id: string, userId: string): Promise<Project | undefined> {
    const project = this.projects.get(id);
    if (project && project.ownerId === userId) {
      return project;
    }
    return undefined;
  }

  async updateProject(id: string, userId: string, updates: Partial<Project>): Promise<Project | undefined> {
    const project = this.projects.get(id);
    if (project && project.ownerId === userId) {
      const updatedProject = { ...project, ...updates };
      this.projects.set(id, updatedProject);
      return updatedProject;
    }
    return undefined;
  }

  async updateProjectPaymentStatus(projectId: string, isPaid: boolean, paymentIntentId?: string): Promise<Project | undefined> {
    const project = this.projects.get(projectId);
    if (project) {
      const updatedProject = { 
        ...project, 
        isPaid, 
        paymentStatus: isPaid ? "paid" : "pending",
        stripePaymentIntentId: paymentIntentId || project.stripePaymentIntentId
      };
      this.projects.set(projectId, updatedProject);
      return updatedProject;
    }
    return undefined;
  }

  async getUserSettings(userId: string): Promise<UserSettings | undefined> {
    return this.userSettings.get(userId);
  }

  async createUserSettings(insertSettings: InsertUserSettings): Promise<UserSettings> {
    const id = Date.now();
    const settings: UserSettings = {
      id,
      userId: insertSettings.userId,
      aiProvider: insertSettings.aiProvider || "platform",
      aiApiKey: insertSettings.aiApiKey || null,
      subscriptionTier: insertSettings.subscriptionTier || "starter",
      usageQuota: insertSettings.usageQuota || 50,
      usageCount: insertSettings.usageCount || 0,
      lastResetDate: new Date(),
      stripeCustomerId: insertSettings.stripeCustomerId || null,
      stripeSubscriptionId: insertSettings.stripeSubscriptionId || null,
      monthlyUsage: insertSettings.monthlyUsage || 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.userSettings.set(insertSettings.userId, settings);
    return settings;
  }

  async updateUserSettings(userId: string, updates: Partial<UserSettings>): Promise<UserSettings | undefined> {
    const settings = this.userSettings.get(userId);
    if (settings) {
      const updatedSettings = { ...settings, ...updates, updatedAt: new Date() };
      this.userSettings.set(userId, updatedSettings);
      return updatedSettings;
    }
    return undefined;
  }

  async resetMonthlyUsage(userId: string): Promise<void> {
    const settings = this.userSettings.get(userId);
    if (settings) {
      const updatedSettings = { 
        ...settings, 
        usageCount: 0, 
        lastResetDate: new Date(),
        updatedAt: new Date() 
      };
      this.userSettings.set(userId, updatedSettings);
    }
  }

  async updateStripeCustomerId(userId: string, customerId: string): Promise<UserSettings | undefined> {
    const settings = this.userSettings.get(userId);
    if (settings) {
      settings.stripeCustomerId = customerId;
      settings.updatedAt = new Date();
      return settings;
    }
    return undefined;
  }

  async updateUserStripeInfo(userId: string, info: { customerId: string; subscriptionId: string }): Promise<UserSettings | undefined> {
    const settings = this.userSettings.get(userId);
    if (settings) {
      settings.stripeCustomerId = info.customerId;
      settings.stripeSubscriptionId = info.subscriptionId;
      settings.updatedAt = new Date();
      return settings;
    }
    return undefined;
  }

  async logUsage(insertLog: InsertUsageLog): Promise<UsageLog> {
    const id = this.currentLogId++;
    const log: UsageLog = {
      id,
      userId: insertLog.userId,
      projectId: insertLog.projectId || null,
      action: insertLog.action,
      provider: insertLog.provider || null,
      tokensUsed: insertLog.tokensUsed || null,
      cost: insertLog.cost || null,
      createdAt: new Date(),
    };
    this.usageLogs.set(id.toString(), log);
    
    // Increment user usage count
    const settings = await this.getUserSettings(insertLog.userId);
    if (settings) {
      await this.updateUserSettings(insertLog.userId, {
        usageCount: (settings.usageCount || 0) + 1
      });
    }
    
    return log;
  }

  async getUserUsageThisMonth(userId: string): Promise<number> {
    const settings = await this.getUserSettings(userId);
    if (!settings) return 0;
    
    const now = new Date();
    const lastReset = settings.lastResetDate ? new Date(settings.lastResetDate) : new Date();
    
    // Check if we need to reset monthly usage
    if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
      await this.resetMonthlyUsage(userId);
      return 0;
    }
    
    return settings.usageCount || 0;
  }

  async canUserMakeQuery(userId: string): Promise<boolean> {
    const settings = await this.getUserSettings(userId);
    if (!settings) return false;
    
    const currentUsage = await this.getUserUsageThisMonth(userId);
    return currentUsage < (settings.usageQuota || 50);
  }

  async createEnterpriseInquiry(inquiry: InsertEnterpriseInquiry): Promise<EnterpriseInquiry> {
    const id = this.currentInquiryId++;
    const newInquiry: EnterpriseInquiry = {
      id,
      ...inquiry,
      status: inquiry.status || "new",
      priority: inquiry.priority || "medium",
      assignedTo: inquiry.assignedTo || null,
      notes: inquiry.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.enterpriseInquiries.set(id, newInquiry);
    return newInquiry;
  }

  async getEnterpriseInquiries(): Promise<EnterpriseInquiry[]> {
    return Array.from(this.enterpriseInquiries.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async updateEnterpriseInquiry(id: number, updates: Partial<EnterpriseInquiry>): Promise<EnterpriseInquiry | undefined> {
    const inquiry = this.enterpriseInquiries.get(id);
    if (!inquiry) return undefined;

    const updated = {
      ...inquiry,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.enterpriseInquiries.set(id, updated);
    return updated;
  }
}

export const storage = new MemStorage();
