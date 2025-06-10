import { users, projects, userSettings, type User, type InsertUser, type Project, type InsertProject, type UserSettings, type InsertUserSettings } from "@shared/schema";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Project methods
  createProject(project: InsertProject & { ownerId: number }): Promise<Project>;
  getUserProjects(userId: number): Promise<Project[]>;
  getProject(id: string, userId: number): Promise<Project | undefined>;
  updateProject(id: string, userId: number, updates: Partial<Project>): Promise<Project | undefined>;
  
  // User settings methods
  getUserSettings(userId: number): Promise<UserSettings | undefined>;
  createUserSettings(settings: InsertUserSettings): Promise<UserSettings>;
  updateUserSettings(userId: number, updates: Partial<UserSettings>): Promise<UserSettings | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private projects: Map<string, Project>;
  private userSettings: Map<number, UserSettings>;
  private currentUserId: number;

  constructor() {
    this.users = new Map();
    this.projects = new Map();
    this.userSettings = new Map();
    this.currentUserId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { 
      ...insertUser, 
      id,
      createdAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async createProject(projectData: InsertProject & { ownerId: number }): Promise<Project> {
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
      createdAt: new Date(),
    };
    this.projects.set(id, project);
    return project;
  }

  async getUserProjects(userId: number): Promise<Project[]> {
    return Array.from(this.projects.values()).filter(
      (project) => project.ownerId === userId,
    );
  }

  async getProject(id: string, userId: number): Promise<Project | undefined> {
    const project = this.projects.get(id);
    if (project && project.ownerId === userId) {
      return project;
    }
    return undefined;
  }

  async updateProject(id: string, userId: number, updates: Partial<Project>): Promise<Project | undefined> {
    const project = this.projects.get(id);
    if (project && project.ownerId === userId) {
      const updatedProject = { ...project, ...updates };
      this.projects.set(id, updatedProject);
      return updatedProject;
    }
    return undefined;
  }

  async getUserSettings(userId: number): Promise<UserSettings | undefined> {
    return this.userSettings.get(userId);
  }

  async createUserSettings(insertSettings: InsertUserSettings): Promise<UserSettings> {
    const id = Date.now();
    const settings: UserSettings = {
      id,
      userId: insertSettings.userId,
      aiProvider: insertSettings.aiProvider || "anthropic",
      aiApiKey: insertSettings.aiApiKey || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.userSettings.set(insertSettings.userId, settings);
    return settings;
  }

  async updateUserSettings(userId: number, updates: Partial<UserSettings>): Promise<UserSettings | undefined> {
    const settings = this.userSettings.get(userId);
    if (settings) {
      const updatedSettings = { ...settings, ...updates, updatedAt: new Date() };
      this.userSettings.set(userId, updatedSettings);
      return updatedSettings;
    }
    return undefined;
  }
}

export const storage = new MemStorage();
