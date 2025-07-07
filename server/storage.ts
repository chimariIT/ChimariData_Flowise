import { DataProject, InsertDataProject } from "@shared/schema";

export interface IStorage {
  // Project operations
  createProject(project: InsertDataProject): Promise<DataProject>;
  getProject(id: string): Promise<DataProject | undefined>;
  getAllProjects(): Promise<DataProject[]>;
  updateProject(id: string, updates: Partial<DataProject>): Promise<DataProject | undefined>;
  deleteProject(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private projects: Map<string, DataProject> = new Map();
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
}

export const storage = new MemStorage();