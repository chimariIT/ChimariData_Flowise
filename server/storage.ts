import { DataProject, InsertDataProject } from "@shared/schema";

// User interface for authentication
interface User {
  id: string;
  email: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  provider: string;
  emailVerified?: boolean;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  providerId?: string;
  profileImageUrl?: string;
  username?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IStorage {
  // Project operations
  createProject(project: InsertDataProject): Promise<DataProject>;
  getProject(id: string): Promise<DataProject | undefined>;
  getAllProjects(): Promise<DataProject[]>;
  updateProject(id: string, updates: Partial<DataProject>): Promise<DataProject | undefined>;
  deleteProject(id: string): Promise<boolean>;
  
  // User operations
  createUser(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User>;
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  
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

export const storage = new MemStorage();