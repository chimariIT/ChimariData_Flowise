/**
 * Admin Knowledge Base Management Routes
 *
 * CRUD for knowledge graph nodes and edges, stats overview, seeding.
 * All endpoints require admin authentication.
 */

import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db';
import {
  knowledgeNodes,
  knowledgeEdges,
  analysisPatterns,
  templateFeedback,
} from '@shared/schema';
import { eq, and, or, ilike, sql, desc, count, inArray } from 'drizzle-orm';
import { ensureAuthenticated } from './auth';
import { requireAdmin } from '../middleware/rbac';
import { AdminAuditLogService } from '../services/admin-audit-log';

const router = Router();
const ensureAdmin = requireAdmin;

// Valid knowledge node types
const VALID_NODE_TYPES = ['industry', 'regulation', 'template', 'analysis_type', 'question_pattern', 'column_pattern'];

// ============================================================================
// STATS / OVERVIEW
// ============================================================================

router.get('/stats', ensureAuthenticated, ensureAdmin, async (_req: Request, res: Response) => {
  try {
    // Node counts by type
    const nodeCountRows = await db
      .select({ type: knowledgeNodes.type, count: count() })
      .from(knowledgeNodes)
      .groupBy(knowledgeNodes.type);

    const nodesByType: Record<string, number> = {};
    let totalNodes = 0;
    for (const row of nodeCountRows) {
      nodesByType[row.type] = Number(row.count);
      totalNodes += Number(row.count);
    }

    // Edge counts by relationship
    const edgeCountRows = await db
      .select({ relationship: knowledgeEdges.relationship, count: count() })
      .from(knowledgeEdges)
      .groupBy(knowledgeEdges.relationship);

    const edgesByRelationship: Record<string, number> = {};
    let totalEdges = 0;
    for (const row of edgeCountRows) {
      edgesByRelationship[row.relationship] = Number(row.count);
      totalEdges += Number(row.count);
    }

    // Pending analysis patterns
    const [pendingResult] = await db
      .select({ count: count() })
      .from(analysisPatterns)
      .where(eq(analysisPatterns.status, 'pending_review'));
    const pendingPatterns = Number(pendingResult?.count ?? 0);

    // Unprocessed template feedback
    const [feedbackResult] = await db
      .select({ count: count() })
      .from(templateFeedback)
      .where(eq(templateFeedback.processed, false));
    const unprocessedFeedback = Number(feedbackResult?.count ?? 0);

    res.json({
      success: true,
      data: {
        nodesByType,
        edgesByRelationship,
        totalNodes,
        totalEdges,
        pendingPatterns,
        unprocessedFeedback,
      },
    });
  } catch (error: any) {
    console.error('Error fetching knowledge stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// NODE CRUD
// ============================================================================

// List nodes with pagination, type filter, and search
router.get('/nodes', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const offset = (page - 1) * limit;
    const typeFilter = req.query.type as string | undefined;
    const search = req.query.search as string | undefined;

    const filters: any[] = [];
    if (typeFilter && VALID_NODE_TYPES.includes(typeFilter)) {
      filters.push(eq(knowledgeNodes.type, typeFilter));
    }
    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      filters.push(
        or(
          ilike(knowledgeNodes.label, searchPattern),
          ilike(knowledgeNodes.summary, searchPattern),
        ),
      );
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const [nodes, [totalResult]] = await Promise.all([
      db.select().from(knowledgeNodes).where(whereClause).orderBy(desc(knowledgeNodes.updatedAt)).limit(limit).offset(offset),
      db.select({ count: count() }).from(knowledgeNodes).where(whereClause),
    ]);

    const total = Number(totalResult?.count ?? 0);

    res.json({
      success: true,
      data: {
        nodes,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error listing knowledge nodes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single node with connected edges
router.get('/nodes/:id', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [node] = await db.select().from(knowledgeNodes).where(eq(knowledgeNodes.id, id)).limit(1);
    if (!node) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }

    // Fetch connected edges
    const [outgoingEdges, incomingEdges] = await Promise.all([
      db.select().from(knowledgeEdges).where(eq(knowledgeEdges.sourceId, id)),
      db.select().from(knowledgeEdges).where(eq(knowledgeEdges.targetId, id)),
    ]);

    // Batch-fetch labels for connected nodes
    const connectedIds = new Set<string>();
    outgoingEdges.forEach((e: any) => connectedIds.add(e.targetId));
    incomingEdges.forEach((e: any) => connectedIds.add(e.sourceId));

    const connectedNodes: Array<{ id: string; type: string; label: string }> = connectedIds.size > 0
      ? await db.select({ id: knowledgeNodes.id, type: knowledgeNodes.type, label: knowledgeNodes.label })
        .from(knowledgeNodes)
        .where(inArray(knowledgeNodes.id, Array.from(connectedIds)))
      : [];

    const nodeMap = new Map(connectedNodes.map((n: { id: string; type: string; label: string }) => [n.id, n]));

    const outgoing = outgoingEdges.map((e: any) => ({
      ...e,
      targetLabel: nodeMap.get(e.targetId)?.label || 'Unknown',
      targetType: nodeMap.get(e.targetId)?.type || 'unknown',
    }));

    const incoming = incomingEdges.map((e: any) => ({
      ...e,
      sourceLabel: nodeMap.get(e.sourceId)?.label || 'Unknown',
      sourceType: nodeMap.get(e.sourceId)?.type || 'unknown',
    }));

    res.json({ success: true, data: { node, outgoingEdges: outgoing, incomingEdges: incoming } });
  } catch (error: any) {
    console.error('Error fetching knowledge node:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create node
router.post('/nodes', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { type, label, summary, attributes } = req.body;

    if (!type || !label) {
      return res.status(400).json({ success: false, error: 'type and label are required' });
    }
    if (!VALID_NODE_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: `Invalid node type. Must be one of: ${VALID_NODE_TYPES.join(', ')}` });
    }

    // Check uniqueness
    const [existing] = await db.select().from(knowledgeNodes)
      .where(and(eq(knowledgeNodes.type, type), eq(knowledgeNodes.label, label)))
      .limit(1);
    if (existing) {
      return res.status(409).json({ success: false, error: `Node with type="${type}" and label="${label}" already exists` });
    }

    let parsedAttributes = attributes || {};
    if (typeof parsedAttributes === 'string') {
      try {
        parsedAttributes = JSON.parse(parsedAttributes);
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid JSON in attributes' });
      }
    }

    const id = nanoid();
    await db.insert(knowledgeNodes).values({
      id,
      type,
      label,
      summary: summary || null,
      attributes: parsedAttributes,
    });

    const [created] = await db.select().from(knowledgeNodes).where(eq(knowledgeNodes.id, id)).limit(1);

    const adminId = (req.user as any)?.id || 'unknown';
    await AdminAuditLogService.log({
      action: 'create_knowledge_node',
      adminId,
      entityType: 'other',
      changes: { type, label },
      metadata: { nodeId: id },
    });

    res.status(201).json({ success: true, message: 'Knowledge node created', data: created });
  } catch (error: any) {
    console.error('Error creating knowledge node:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update node
router.put('/nodes/:id', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { label, summary, attributes } = req.body;

    const [existing] = await db.select().from(knowledgeNodes).where(eq(knowledgeNodes.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (label !== undefined) updates.label = label;
    if (summary !== undefined) updates.summary = summary;
    if (attributes !== undefined) {
      let parsedAttributes = attributes;
      if (typeof parsedAttributes === 'string') {
        try {
          parsedAttributes = JSON.parse(parsedAttributes);
        } catch {
          return res.status(400).json({ success: false, error: 'Invalid JSON in attributes' });
        }
      }
      updates.attributes = parsedAttributes;
    }

    await db.update(knowledgeNodes).set(updates).where(eq(knowledgeNodes.id, id));

    const [updated] = await db.select().from(knowledgeNodes).where(eq(knowledgeNodes.id, id)).limit(1);

    const adminId = (req.user as any)?.id || 'unknown';
    await AdminAuditLogService.log({
      action: 'update_knowledge_node',
      adminId,
      entityType: 'other',
      changes: { label, summary, hasAttributeUpdate: attributes !== undefined },
      metadata: { nodeId: id },
    });

    res.json({ success: true, message: 'Knowledge node updated', data: updated });
  } catch (error: any) {
    console.error('Error updating knowledge node:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete node (cascade deletes edges via FK)
router.delete('/nodes/:id', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [existing] = await db.select().from(knowledgeNodes).where(eq(knowledgeNodes.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }

    await db.delete(knowledgeNodes).where(eq(knowledgeNodes.id, id));

    const adminId = (req.user as any)?.id || 'unknown';
    await AdminAuditLogService.log({
      action: 'delete_knowledge_node',
      adminId,
      entityType: 'other',
      changes: { type: existing.type, label: existing.label },
      metadata: { nodeId: id },
    });

    res.json({ success: true, message: `Node "${existing.label}" deleted (edges cascaded)` });
  } catch (error: any) {
    console.error('Error deleting knowledge node:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Score a node (merge adminScore into attributes JSONB)
router.put('/nodes/:id/score', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { score, notes } = req.body;

    if (score === undefined || typeof score !== 'number' || score < 0 || score > 100) {
      return res.status(400).json({ success: false, error: 'score must be a number between 0 and 100' });
    }

    const [existing] = await db.select().from(knowledgeNodes).where(eq(knowledgeNodes.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }

    const adminId = (req.user as any)?.id || 'unknown';
    const currentAttrs = (existing.attributes ?? {}) as Record<string, any>;
    const updatedAttrs = {
      ...currentAttrs,
      adminScore: score,
      scoreNotes: notes || null,
      scoredAt: new Date().toISOString(),
      scoredBy: adminId,
    };

    await db.update(knowledgeNodes)
      .set({ attributes: updatedAttrs, updatedAt: new Date() })
      .where(eq(knowledgeNodes.id, id));

    res.json({ success: true, message: `Node scored: ${score}/100` });
  } catch (error: any) {
    console.error('Error scoring knowledge node:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// EDGE CRUD
// ============================================================================

// List edges with pagination and filters
router.get('/edges', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const offset = (page - 1) * limit;
    const relationship = req.query.relationship as string | undefined;
    const sourceId = req.query.sourceId as string | undefined;
    const targetId = req.query.targetId as string | undefined;

    const filters: any[] = [];
    if (relationship) filters.push(eq(knowledgeEdges.relationship, relationship));
    if (sourceId) filters.push(eq(knowledgeEdges.sourceId, sourceId));
    if (targetId) filters.push(eq(knowledgeEdges.targetId, targetId));

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const [edges, [totalResult]] = await Promise.all([
      db.select().from(knowledgeEdges).where(whereClause).orderBy(desc(knowledgeEdges.updatedAt)).limit(limit).offset(offset),
      db.select({ count: count() }).from(knowledgeEdges).where(whereClause),
    ]);

    const total = Number(totalResult?.count ?? 0);

    // Batch-fetch source/target labels for display
    const nodeIds = new Set<string>();
    edges.forEach((e: any) => { nodeIds.add(e.sourceId); nodeIds.add(e.targetId); });

    const nodeLabels: Array<{ id: string; type: string; label: string }> = nodeIds.size > 0
      ? await db.select({ id: knowledgeNodes.id, type: knowledgeNodes.type, label: knowledgeNodes.label })
        .from(knowledgeNodes)
        .where(inArray(knowledgeNodes.id, Array.from(nodeIds)))
      : [];

    const nodeMap = new Map(nodeLabels.map((n: { id: string; type: string; label: string }) => [n.id, n]));

    const enrichedEdges = edges.map((e: any) => ({
      ...e,
      sourceLabel: nodeMap.get(e.sourceId)?.label || 'Unknown',
      sourceType: nodeMap.get(e.sourceId)?.type || 'unknown',
      targetLabel: nodeMap.get(e.targetId)?.label || 'Unknown',
      targetType: nodeMap.get(e.targetId)?.type || 'unknown',
    }));

    res.json({
      success: true,
      data: {
        edges: enrichedEdges,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error listing knowledge edges:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update edge
router.put('/edges/:id', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { weight, attributes } = req.body;

    const [existing] = await db.select().from(knowledgeEdges).where(eq(knowledgeEdges.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Edge not found' });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (weight !== undefined) updates.weight = weight;
    if (attributes !== undefined) {
      let parsedAttributes = attributes;
      if (typeof parsedAttributes === 'string') {
        try {
          parsedAttributes = JSON.parse(parsedAttributes);
        } catch {
          return res.status(400).json({ success: false, error: 'Invalid JSON in attributes' });
        }
      }
      updates.attributes = parsedAttributes;
    }

    await db.update(knowledgeEdges).set(updates).where(eq(knowledgeEdges.id, id));

    const [updated] = await db.select().from(knowledgeEdges).where(eq(knowledgeEdges.id, id)).limit(1);

    res.json({ success: true, message: 'Edge updated', data: updated });
  } catch (error: any) {
    console.error('Error updating knowledge edge:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete edge
router.delete('/edges/:id', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [existing] = await db.select().from(knowledgeEdges).where(eq(knowledgeEdges.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Edge not found' });
    }

    await db.delete(knowledgeEdges).where(eq(knowledgeEdges.id, id));

    res.json({ success: true, message: 'Edge deleted' });
  } catch (error: any) {
    console.error('Error deleting knowledge edge:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Score an edge
router.put('/edges/:id/score', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { score, notes } = req.body;

    if (score === undefined || typeof score !== 'number' || score < 0 || score > 100) {
      return res.status(400).json({ success: false, error: 'score must be a number between 0 and 100' });
    }

    const [existing] = await db.select().from(knowledgeEdges).where(eq(knowledgeEdges.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Edge not found' });
    }

    const adminId = (req.user as any)?.id || 'unknown';
    const currentAttrs = (existing.attributes ?? {}) as Record<string, any>;
    const updatedAttrs = {
      ...currentAttrs,
      adminScore: score,
      scoreNotes: notes || null,
      scoredAt: new Date().toISOString(),
      scoredBy: adminId,
    };

    await db.update(knowledgeEdges)
      .set({ attributes: updatedAttrs, updatedAt: new Date() })
      .where(eq(knowledgeEdges.id, id));

    res.json({ success: true, message: `Edge scored: ${score}/100` });
  } catch (error: any) {
    console.error('Error scoring knowledge edge:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// SEEDING
// ============================================================================

router.post('/seed', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { force } = req.body;

    if (force) {
      // Delete all edges first (FK cascade would handle it, but explicit is clearer)
      await db.delete(knowledgeEdges);
      await db.delete(knowledgeNodes);
      console.log('🗑️ [Admin KB] Force-cleared all knowledge nodes and edges');
    }

    // Create a fresh KnowledgeGraphService instance — constructor seeds if needed
    const { KnowledgeGraphService } = await import('../services/knowledge-graph-service');
    const kgService = new KnowledgeGraphService();
    // Trigger seeding by calling any method that invokes ensureSeeded()
    await kgService.listIndustries();

    // Count what we have now
    const [nodeCount] = await db.select({ count: count() }).from(knowledgeNodes);
    const [edgeCount] = await db.select({ count: count() }).from(knowledgeEdges);

    const adminId = (req.user as any)?.id || 'unknown';
    await AdminAuditLogService.log({
      action: force ? 'force_reseed_knowledge_graph' : 'seed_knowledge_graph',
      adminId,
      entityType: 'other',
      metadata: { force, nodesAfter: Number(nodeCount?.count ?? 0), edgesAfter: Number(edgeCount?.count ?? 0) },
    });

    res.json({
      success: true,
      message: force ? 'Knowledge graph force-reseeded' : 'Knowledge graph seeded (skipped if already populated)',
      data: {
        nodes: Number(nodeCount?.count ?? 0),
        edges: Number(edgeCount?.count ?? 0),
      },
    });
  } catch (error: any) {
    console.error('Error seeding knowledge graph:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
