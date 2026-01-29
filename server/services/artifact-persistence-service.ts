/**
 * Artifact Persistence Service
 *
 * Fixes the broken artifact chain where tool-generated artifacts are lost in memory.
 * This service persists artifacts to the project_artifacts table and updates
 * journeyProgress with the artifact chain for traceability.
 *
 * Flow: Agent -> executeTool() -> Returns {artifacts: [...]} -> Persist to DB -> Link in journeyProgress
 */

import { storage } from '../storage';
import type { ToolExecutionResult } from './agent-tool-handlers';
import { nanoid } from 'nanoid';

export interface PersistedArtifact {
  id: string;
  projectId: string;
  type: string;  // 'dataset' | 'analysis' | 'visualization' | 'definition' | 'mapping' | 'report' | etc.
  name: string;
  data: any;
  createdBy: string;  // agent name, tool name, or 'user'
  toolName?: string;
  chainedFrom?: string;  // Previous artifact ID for traceability
  metadata?: any;
  createdAt: Date;
}

export interface ArtifactChainEntry {
  artifactId: string;
  type: string;
  toolName: string;
  createdAt: string;
}

export class ArtifactPersistenceService {
  private static instance: ArtifactPersistenceService;

  static getInstance(): ArtifactPersistenceService {
    if (!ArtifactPersistenceService.instance) {
      ArtifactPersistenceService.instance = new ArtifactPersistenceService();
    }
    return ArtifactPersistenceService.instance;
  }

  /**
   * Persist artifacts from a tool execution result to the database
   * and update the project's journeyProgress with the artifact chain
   */
  async persistToolArtifacts(
    projectId: string,
    agentId: string,
    toolResult: ToolExecutionResult
  ): Promise<string[]> {
    const artifactIds: string[] = [];

    if (!toolResult.artifacts?.length) {
      return artifactIds;
    }

    console.log(`📦 [Artifact] Persisting ${toolResult.artifacts.length} artifact(s) from ${toolResult.toolId}`);

    for (const artifact of toolResult.artifacts) {
      try {
        // Create the artifact in the database
        const persisted = await storage.createArtifact({
          projectId,
          type: artifact.type || 'unknown',
          status: 'completed',
          output: artifact.data,
          params: artifact.metadata || {},
          createdBy: agentId,
          parentArtifactId: (artifact as any).sourceArtifactId || (artifact as any).chainedFrom || null,
          inputRefs: [toolResult.executionId],
          metrics: {
            toolName: toolResult.toolId,
            duration: toolResult.metrics?.duration || 0,
            cost: toolResult.metrics?.cost || 0
          }
        });

        artifactIds.push(persisted.id);
        console.log(`   📦 Persisted ${artifact.type} artifact: ${persisted.id}`);
      } catch (error) {
        console.error(`   ❌ Failed to persist artifact:`, error);
      }
    }

    // Update journeyProgress with artifact chain
    if (artifactIds.length > 0) {
      await this.updateArtifactChain(projectId, artifactIds, toolResult.toolId);
    }

    return artifactIds;
  }

  /**
   * Update the project's journeyProgress with new artifacts in the chain
   */
  private async updateArtifactChain(
    projectId: string,
    newArtifactIds: string[],
    toolName: string
  ): Promise<void> {
    try {
      const project = await storage.getProject(projectId);
      if (!project) {
        console.warn(`⚠️ [Artifact] Project ${projectId} not found, skipping chain update`);
        return;
      }

      const existingProgress = (project as any).journeyProgress || {};
      const existingChain: ArtifactChainEntry[] = existingProgress.artifactChain || [];

      // Create new chain entries
      const newEntries: ArtifactChainEntry[] = newArtifactIds.map(id => ({
        artifactId: id,
        type: 'tool_output',
        toolName,
        createdAt: new Date().toISOString()
      }));

      const updatedChain = [...existingChain, ...newEntries];

      await storage.updateProject(projectId, {
        journeyProgress: {
          ...existingProgress,
          artifactChain: updatedChain,
          lastArtifactAt: new Date().toISOString(),
          totalArtifacts: updatedChain.length
        }
      } as any);

      console.log(`   🔗 [Artifact] Updated artifact chain for project ${projectId} (total: ${updatedChain.length})`);
    } catch (error) {
      console.error(`   ❌ [Artifact] Failed to update artifact chain:`, error);
    }
  }

  /**
   * Get the full artifact chain for a project
   */
  async getArtifactChain(projectId: string): Promise<PersistedArtifact[]> {
    try {
      const artifacts = await storage.getProjectArtifacts(projectId);
      return artifacts.map(a => ({
        id: a.id,
        projectId: a.projectId,
        type: a.type,
        name: (a as any).name || `${a.type}-${a.id}`,
        data: a.output,
        createdBy: a.createdBy || 'unknown',
        toolName: (a.metrics as any)?.toolName,
        chainedFrom: a.parentArtifactId || undefined,
        metadata: a.params,
        createdAt: a.createdAt || new Date()
      }));
    } catch (error) {
      console.error(`❌ [Artifact] Failed to get artifact chain:`, error);
      return [];
    }
  }

  /**
   * Get artifacts of a specific type for a project
   */
  async getArtifactsByType(projectId: string, type: string): Promise<PersistedArtifact[]> {
    try {
      const artifacts = await storage.getProjectArtifacts(projectId, type);
      return artifacts.map(a => ({
        id: a.id,
        projectId: a.projectId,
        type: a.type,
        name: (a as any).name || `${a.type}-${a.id}`,
        data: a.output,
        createdBy: a.createdBy || 'unknown',
        toolName: (a.metrics as any)?.toolName,
        chainedFrom: a.parentArtifactId || undefined,
        metadata: a.params,
        createdAt: a.createdAt || new Date()
      }));
    } catch (error) {
      console.error(`❌ [Artifact] Failed to get artifacts by type:`, error);
      return [];
    }
  }

  /**
   * Get the most recent artifact from a specific tool
   */
  async getLatestToolArtifact(projectId: string, toolName: string): Promise<PersistedArtifact | null> {
    try {
      const artifacts = await storage.getProjectArtifacts(projectId);
      const toolArtifacts = artifacts.filter(a =>
        (a.metrics as any)?.toolName === toolName
      ).sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });

      if (toolArtifacts.length === 0) return null;

      const a = toolArtifacts[0];
      return {
        id: a.id,
        projectId: a.projectId,
        type: a.type,
        name: (a as any).name || `${a.type}-${a.id}`,
        data: a.output,
        createdBy: a.createdBy || 'unknown',
        toolName: (a.metrics as any)?.toolName,
        chainedFrom: a.parentArtifactId || undefined,
        metadata: a.params,
        createdAt: a.createdAt || new Date()
      };
    } catch (error) {
      console.error(`❌ [Artifact] Failed to get latest tool artifact:`, error);
      return null;
    }
  }

  /**
   * Link an artifact to another artifact (for chaining)
   */
  async linkArtifact(artifactId: string, parentArtifactId: string): Promise<void> {
    try {
      await storage.updateArtifact(artifactId, {
        parentArtifactId
      });
      console.log(`🔗 [Artifact] Linked ${artifactId} -> ${parentArtifactId}`);
    } catch (error) {
      console.error(`❌ [Artifact] Failed to link artifacts:`, error);
    }
  }

  /**
   * Persist a manual artifact (not from tool execution)
   */
  async persistArtifact(
    projectId: string,
    type: string,
    data: any,
    options: {
      name?: string;
      createdBy?: string;
      metadata?: any;
      chainedFrom?: string;
    } = {}
  ): Promise<string> {
    const persisted = await storage.createArtifact({
      projectId,
      type,
      status: 'completed',
      output: data,
      params: options.metadata || {},
      createdBy: options.createdBy || 'manual',
      parentArtifactId: options.chainedFrom || null
    });

    // Update chain
    await this.updateArtifactChain(projectId, [persisted.id], options.name || type);

    console.log(`📦 [Artifact] Manually persisted ${type}: ${persisted.id}`);
    return persisted.id;
  }
}

// Export singleton instance
export const artifactService = ArtifactPersistenceService.getInstance();
