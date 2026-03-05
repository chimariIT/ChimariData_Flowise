/**
 * Semantic Links API Routes
 *
 * Provides endpoints for querying semantic links to verify
 * the Question → Element → Transformation → Analysis evidence chain.
 */

import { Router } from 'express';
import { ensureAuthenticated } from './auth';
import { db } from '../db';
import { semanticLinks } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { canAccessProject } from '../middleware/ownership';

const router = Router();

/**
 * GET /api/semantic/links
 *
 * Query semantic links for a project with optional filtering
 *
 * Query params:
 * - projectId: Required - Project ID to query links for
 * - linkType: Optional - Filter by link type (question_element, element_to_transformation, transformation_insight)
 * - sourceId: Optional - Filter by source ID
 * - targetId: Optional - Filter by target ID
 */
router.get('/links', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;
    const { projectId, linkType, sourceId, targetId } = req.query;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'projectId parameter is required'
      });
    }

    // Access check
    const access = await canAccessProject(userId, projectId as string, isAdmin);
    if (!access.allowed) {
      return res.status(403).json({
        success: false,
        error: access.reason
      });
    }

    // Build query conditions
    const conditions = [
      eq(semanticLinks.projectId, projectId as string)
    ];

    if (linkType) {
      conditions.push(eq(semanticLinks.linkType, linkType as string));
    }

    if (sourceId) {
      conditions.push(eq(semanticLinks.sourceId, sourceId as string));
    }

    if (targetId) {
      conditions.push(eq(semanticLinks.targetId, targetId as string));
    }

    // Query semantic links
    const links = await db
      .select()
      .from(semanticLinks)
      .where(and(...conditions))
      .orderBy(desc(semanticLinks.createdAt))
      .limit(1000); // Limit to prevent huge responses

    console.log(`📊 [Semantic Links API] Retrieved ${links.length} links for project ${projectId}`);

    res.json({
      success: true,
      links,
      count: links.length,
      projectId,
      filters: {
        linkType: linkType || 'all',
        sourceId: sourceId || 'all',
        targetId: targetId || 'all'
      }
    });

  } catch (error: any) {
    console.error('❌ Error querying semantic links:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to query semantic links'
    });
  }
});

/**
 * GET /api/semantic/links/evidence-chain
 *
 * Get complete evidence chain for a project
 * Returns counts for each link type to validate chain completeness
 */
router.get('/links/evidence-chain', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;
    const { projectId } = req.query;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'projectId parameter is required'
      });
    }

    // Access check
    const access = await canAccessProject(userId, projectId as string, isAdmin);
    if (!access.allowed) {
      return res.status(403).json({
        success: false,
        error: access.reason
      });
    }

    // Get project's journeyProgress for link counts
    const [project] = await db
      .select({
        journeyProgress: (p: any) => p.journeyProgress
      })
      .from(require('@shared/schema').projects)
      .where(eq(require('@shared/schema').projects.id, projectId as string))
      .limit(1);

    const journeyProgress = project?.journeyProgress || {};

    // Count links by type from semantic_links table
    const questionElementLinks = await db
      .select({ count: require('drizzle-orm').count() })
      .from(semanticLinks)
      .where(and(
        eq(semanticLinks.projectId, projectId as string),
        eq(semanticLinks.linkType, 'question_element')
      ));

    const elementTransformLinks = await db
      .select({ count: require('drizzle-orm').count() })
      .from(semanticLinks)
      .where(and(
        eq(semanticLinks.projectId, projectId as string),
        eq(semanticLinks.linkType, 'element_to_transformation')
      ));

    const transformInsightLinks = await db
      .select({ count: require('drizzle-orm').count() })
      .from(semanticLinks)
      .where(and(
        eq(semanticLinks.projectId, projectId as string),
        eq(semanticLinks.linkType, 'transformation_insight')
      ));

    const questionTransformLinks = await db
      .select({ count: require('drizzle-orm').count() })
      .from(semanticLinks)
      .where(and(
        eq(semanticLinks.projectId, projectId as string),
        eq(semanticLinks.linkType, 'question_transformation')
      ));

    const evidenceChain = {
      questionToElements: {
        linkType: 'question_element',
        dbCount: Number(questionElementLinks?.[0]?.count || 0),
        jpCount: journeyProgress.questionElementLinks || 0,
        complete: (Number(questionElementLinks?.[0]?.count || 0) > 0)
      },
      elementsToTransformations: {
        linkType: 'element_to_transformation',
        dbCount: Number(elementTransformLinks?.[0]?.count || 0),
        jpCount: journeyProgress.elementTransformationLinks || 0,
        complete: (Number(elementTransformLinks?.[0]?.count || 0) > 0)
      },
      transformationsToInsights: {
        linkType: 'transformation_insight',
        dbCount: Number(transformInsightLinks?.[0]?.count || 0),
        jpCount: journeyProgress.insightTransformationLinks || 0,
        complete: (Number(transformInsightLinks?.[0]?.count || 0) > 0)
      },
      questionsToTransformations: {
        linkType: 'question_transformation',
        dbCount: Number(questionTransformLinks?.[0]?.count || 0),
        complete: (Number(questionTransformLinks?.[0]?.count || 0) > 0)
      }
    };

    // Overall completeness check
    const isComplete = Object.values(evidenceChain).every(link => link.complete);

    console.log(`🔗 [Evidence Chain API] Project ${projectId} chain status:`, {
      complete: isComplete,
      links: Object.fromEntries(
        Object.entries(evidenceChain).map(([key, value]) => [key, value.dbCount])
      )
    });

    res.json({
      success: true,
      projectId,
      evidenceChain,
      isComplete,
      summary: {
        totalLinks: Object.values(evidenceChain).reduce((sum, link) => sum + link.dbCount, 0),
        completeStages: Object.values(evidenceChain).filter(link => link.complete).length,
        totalStages: Object.values(evidenceChain).length,
        completenessPercentage: Math.round(
          (Object.values(evidenceChain).filter(link => link.complete).length / Object.values(evidenceChain).length) * 100
        )
      }
    });

  } catch (error: any) {
    console.error('❌ Error querying evidence chain:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to query evidence chain'
    });
  }
});

export default router;
