/**
 * Data Lineage Service
 * 
 * Tracks data flow from source through transformations to outputs.
 * Enables impact analysis and data provenance tracking.
 * 
 * @module DataLineageService
 */

import { db } from '../db';
import { dataLineage } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';

/** Lineage node types */
export type LineageNodeType = 'SOURCE' | 'TRANSFORMATION' | 'OUTPUT';

/** Lineage node */
export interface LineageNode {
    id: string;
    projectId: string;
    nodeType: LineageNodeType;
    nodeName: string;
    nodeDetails: any;
    parentNodes: string[];
    metadata: any;
    createdAt: Date;
}

/** Lineage graph */
export interface LineageGraph {
    nodes: LineageNode[];
    edges: Array<{ from: string; to: string }>;
    metadata: {
        totalNodes: number;
        sources: number;
        transformations: number;
        outputs: number;
    };
}

/**
 * Data Lineage Service
 * 
 * Tracks and visualizes data flow through the system
 */
export class DataLineageService {
    /**
     * Record a data source
     * 
     * @param projectId - Project ID
     * @param sourceName - Source name
     * @param sourceDetails - Source details (file path, database, API, etc.)
     * @returns Created lineage node
     */
    static async recordDataSource(
        projectId: string,
        sourceName: string,
        sourceDetails: any
    ): Promise<LineageNode> {
        const [node] = await db
            .insert(dataLineage)
            .values({
                id: nanoid(),
                projectId,
                nodeType: 'SOURCE',
                nodeName: sourceName,
                nodeDetails: sourceDetails,
                parentNodes: [],
                metadata: { recordedAt: new Date() },
                createdAt: new Date()
            })
            .returning();

        return node as LineageNode;
    }

    /**
     * Record a transformation
     * 
     * @param projectId - Project ID
     * @param transformationName - Transformation name
     * @param transformationDetails - Transformation details
     * @param parentNodeIds - Parent node IDs (inputs)
     * @returns Created lineage node
     */
    static async recordTransformation(
        projectId: string,
        transformationName: string,
        transformationDetails: any,
        parentNodeIds: string[]
    ): Promise<LineageNode> {
        const [node] = await db
            .insert(dataLineage)
            .values({
                id: nanoid(),
                projectId,
                nodeType: 'TRANSFORMATION',
                nodeName: transformationName,
                nodeDetails: transformationDetails,
                parentNodes: parentNodeIds,
                metadata: { recordedAt: new Date() },
                createdAt: new Date()
            })
            .returning();

        return node as LineageNode;
    }

    /**
     * Record an output
     * 
     * @param projectId - Project ID
     * @param outputName - Output name
     * @param outputDetails - Output details
     * @param parentNodeIds - Parent node IDs (sources)
     * @returns Created lineage node
     */
    static async recordOutput(
        projectId: string,
        outputName: string,
        outputDetails: any,
        parentNodeIds: string[]
    ): Promise<LineageNode> {
        const [node] = await db
            .insert(dataLineage)
            .values({
                id: nanoid(),
                projectId,
                nodeType: 'OUTPUT',
                nodeName: outputName,
                nodeDetails: outputDetails,
                parentNodes: parentNodeIds,
                metadata: { recordedAt: new Date() },
                createdAt: new Date()
            })
            .returning();

        return node as LineageNode;
    }

    /**
     * Get lineage for a project
     * 
     * @param projectId - Project ID
     * @returns All lineage nodes for the project
     */
    static async getLineage(projectId: string): Promise<LineageNode[]> {
        const nodes = await db
            .select()
            .from(dataLineage)
            .where(eq(dataLineage.projectId, projectId));

        return nodes as LineageNode[];
    }

    /**
     * Generate lineage graph
     * 
     * @param projectId - Project ID
     * @returns Lineage graph with nodes and edges
     */
    static async generateLineageGraph(projectId: string): Promise<LineageGraph> {
        const nodes = await this.getLineage(projectId);

        // Generate edges from parent relationships
        const edges: Array<{ from: string; to: string }> = [];
        nodes.forEach(node => {
            node.parentNodes.forEach(parentId => {
                edges.push({ from: parentId, to: node.id });
            });
        });

        // Calculate metadata
        const metadata = {
            totalNodes: nodes.length,
            sources: nodes.filter(n => n.nodeType === 'SOURCE').length,
            transformations: nodes.filter(n => n.nodeType === 'TRANSFORMATION').length,
            outputs: nodes.filter(n => n.nodeType === 'OUTPUT').length
        };

        return { nodes, edges, metadata };
    }

    /**
     * Get impact analysis - what depends on this node?
     * 
     * @param nodeId - Node ID
     * @returns Downstream nodes affected by this node
     */
    static async getImpactAnalysis(nodeId: string): Promise<LineageNode[]> {
        // Get the node
        const [node] = await db
            .select()
            .from(dataLineage)
            .where(eq(dataLineage.id, nodeId));

        if (!node) return [];

        // Find all nodes that have this node as a parent
        const allNodes = await db
            .select()
            .from(dataLineage)
            .where(eq(dataLineage.projectId, node.projectId));

        // Recursively find all downstream nodes
        const impactedNodes: LineageNode[] = [];
        const visited = new Set<string>();

        const findDownstream = (currentId: string) => {
            if (visited.has(currentId)) return;
            visited.add(currentId);

            allNodes.forEach((n: typeof dataLineage.$inferSelect) => {
                const parentNodes = (n.parentNodes || []) as string[];
                if (parentNodes.includes(currentId)) {
                    impactedNodes.push(n as LineageNode);
                    findDownstream(n.id);
                }
            });
        };

        findDownstream(nodeId);

        return impactedNodes;
    }

    /**
     * Get provenance - where did this data come from?
     * 
     * @param nodeId - Node ID
     * @returns Upstream nodes that contributed to this node
     */
    static async getProvenance(nodeId: string): Promise<LineageNode[]> {
        // Get the node
        const [node] = await db
            .select()
            .from(dataLineage)
            .where(eq(dataLineage.id, nodeId));

        if (!node || !node.parentNodes.length) return [];

        // Get all nodes in the project
        const allNodes = await db
            .select()
            .from(dataLineage)
            .where(eq(dataLineage.projectId, node.projectId));

        // Recursively find all upstream nodes
        const provenanceNodes: LineageNode[] = [];
        const visited = new Set<string>();

        const findUpstream = (parentIds: string[]) => {
            parentIds.forEach(parentId => {
                if (visited.has(parentId)) return;
                visited.add(parentId);

                const parentNode = allNodes.find((n: typeof dataLineage.$inferSelect) => n.id === parentId);
                if (parentNode) {
                    provenanceNodes.push(parentNode as LineageNode);
                    findUpstream(parentNode.parentNodes);
                }
            });
        };

        findUpstream(node.parentNodes);

        return provenanceNodes;
    }

    /**
     * Delete lineage for a project
     * 
     * @param projectId - Project ID
     */
    static async deleteLineage(projectId: string): Promise<void> {
        await db
            .delete(dataLineage)
            .where(eq(dataLineage.projectId, projectId));
    }
}
