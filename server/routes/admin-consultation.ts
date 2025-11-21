/**
 * Admin Consultation Management Routes
 *
 * Admin-only endpoints for managing consultations:
 * - View pending quotes
 * - Create and send quotes
 * - View ready-for-pickup consultations
 * - Assign consultations to admins
 * - Mark consultations as complete
 */

import { Router } from 'express';
import { db } from '../db';
import { consultationRequests, users } from '@shared/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { ensureAuthenticated } from './auth';

const router = Router();

type ConsultationRequest = typeof consultationRequests.$inferSelect;

/**
 * Middleware to ensure user is admin
 */
async function ensureAdmin(req: any, res: any, next: any) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Fetch user with role
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check if user has admin role
    // Note: Adjust this check based on your actual role structure
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Attach user to request for downstream handlers
    req.adminUser = user;
    next();
  } catch (error: any) {
    console.error('Error in ensureAdmin middleware:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
}

/**
 * GET /api/admin/consultations/pending-quotes
 * List consultation requests awaiting quotes
 */
router.get('/pending-quotes', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const pendingRequests = await db
      .select({
        id: consultationRequests.id,
        userId: consultationRequests.userId,
        name: consultationRequests.name,
        email: consultationRequests.email,
        company: consultationRequests.company,
        challenge: consultationRequests.challenge,
        analysisGoals: consultationRequests.analysisGoals,
        businessQuestions: consultationRequests.businessQuestions,
        consultationType: consultationRequests.consultationType,
        expertLevel: consultationRequests.expertLevel,
        duration: consultationRequests.duration,
        status: consultationRequests.status,
        createdAt: consultationRequests.createdAt,
      })
      .from(consultationRequests)
      .where(eq(consultationRequests.status, 'pending_quote'))
      .orderBy(desc(consultationRequests.createdAt));

    res.json({
      success: true,
      count: pendingRequests.length,
      requests: pendingRequests
    });

  } catch (error: any) {
    console.error('Error fetching pending quotes:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch pending quotes' });
  }
});

/**
 * POST /api/admin/consultations/:id/quote
 * Create and send a quote for a consultation request
 */
router.post('/:id/quote', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    const { id } = req.params;
    const { quoteAmount, quoteDetails } = req.body;

    if (!quoteAmount || quoteAmount <= 0) {
      return res.status(400).json({ error: 'Valid quote amount is required' });
    }

    // Fetch consultation request
    const [request] = await db
      .select()
      .from(consultationRequests)
      .where(eq(consultationRequests.id, id));

    if (!request) {
      return res.status(404).json({ error: 'Consultation request not found' });
    }

    if (request.status !== 'pending_quote') {
      return res.status(400).json({
        error: `Cannot create quote for request in status: ${request.status}`
      });
    }

    // Update with quote
    const [updated] = await db
      .update(consultationRequests)
      .set({
        quoteAmount,
        quoteDetails,
        quotedBy: adminId,
        quotedAt: new Date(),
        status: 'awaiting_approval',
        updatedAt: new Date(),
      })
      .where(eq(consultationRequests.id, id))
      .returning();

    // TODO: Send email notification to customer

    res.json({
      success: true,
      message: 'Quote created and sent to customer',
      request: {
        id: updated.id,
        status: updated.status,
        quoteAmount: updated.quoteAmount,
        quotedAt: updated.quotedAt,
      }
    });

  } catch (error: any) {
    console.error('Error creating quote:', error);
    res.status(500).json({ error: error.message || 'Failed to create quote' });
  }
});

/**
 * GET /api/admin/consultations/ready-queue
 * List consultations ready for admin pickup
 */
router.get('/ready-queue', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const readyRequests = await db
      .select({
        id: consultationRequests.id,
        userId: consultationRequests.userId,
        name: consultationRequests.name,
        email: consultationRequests.email,
        company: consultationRequests.company,
        challenge: consultationRequests.challenge,
        analysisGoals: consultationRequests.analysisGoals,
        businessQuestions: consultationRequests.businessQuestions,
        consultationType: consultationRequests.consultationType,
        expertLevel: consultationRequests.expertLevel,
        duration: consultationRequests.duration,
        status: consultationRequests.status,
        quoteAmount: consultationRequests.quoteAmount,
        projectId: consultationRequests.projectId,
        dataUploadedAt: consultationRequests.dataUploadedAt,
        createdAt: consultationRequests.createdAt,
      })
      .from(consultationRequests)
      .where(eq(consultationRequests.status, 'ready_for_admin'))
      .orderBy(desc(consultationRequests.dataUploadedAt));

    res.json({
      success: true,
      count: readyRequests.length,
      requests: readyRequests
    });

  } catch (error: any) {
    console.error('Error fetching ready queue:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch ready queue' });
  }
});

/**
 * GET /api/admin/consultations/my-assignments
 * List consultations assigned to the current admin
 */
router.get('/my-assignments', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const adminId = req.adminUser?.id;

    if (!adminId) {
      return res.status(400).json({ error: 'Admin context missing' });
    }

    const assignments = await db
      .select({
        id: consultationRequests.id,
        userId: consultationRequests.userId,
        name: consultationRequests.name,
        email: consultationRequests.email,
        company: consultationRequests.company,
        challenge: consultationRequests.challenge,
        analysisGoals: consultationRequests.analysisGoals,
        businessQuestions: consultationRequests.businessQuestions,
        consultationType: consultationRequests.consultationType,
        expertLevel: consultationRequests.expertLevel,
        duration: consultationRequests.duration,
        status: consultationRequests.status,
        projectId: consultationRequests.projectId,
        assignedAt: consultationRequests.assignedAt,
        scheduledAt: consultationRequests.scheduledAt,
        createdAt: consultationRequests.createdAt,
      })
      .from(consultationRequests)
      .where(
        and(
          eq(consultationRequests.assignedAdminId, adminId),
          inArray(consultationRequests.status, ['in_progress', 'ready_for_admin'])
        )
      )
      .orderBy(desc(consultationRequests.assignedAt));

    res.json({
      success: true,
      count: assignments.length,
      assignments
    });

  } catch (error: any) {
    console.error('Error fetching admin assignments:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch assignments' });
  }
});

/**
 * POST /api/admin/consultations/:id/assign
 * Assign a consultation to an admin (or self-assign)
 */
router.post('/:id/assign', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    const { id } = req.params;
    const { assignToAdminId } = req.body;

    // Use provided admin ID or self-assign
    const targetAdminId = assignToAdminId || adminId;

    // Fetch consultation request
    const [request] = await db
      .select()
      .from(consultationRequests)
      .where(eq(consultationRequests.id, id));

    if (!request) {
      return res.status(404).json({ error: 'Consultation request not found' });
    }

    if (request.status !== 'ready_for_admin') {
      return res.status(400).json({
        error: `Cannot assign consultation in status: ${request.status}`
      });
    }

    // Update with assignment
    const [updated] = await db
      .update(consultationRequests)
      .set({
        assignedAdminId: targetAdminId,
        assignedAt: new Date(),
        status: 'in_progress',
        updatedAt: new Date(),
      })
      .where(eq(consultationRequests.id, id))
      .returning();

    res.json({
      success: true,
      message: `Consultation assigned to ${assignToAdminId ? 'specified admin' : 'you'}`,
      request: {
        id: updated.id,
        status: updated.status,
        assignedAdminId: updated.assignedAdminId,
        assignedAt: updated.assignedAt,
        projectId: updated.projectId,
      }
    });

  } catch (error: any) {
    console.error('Error assigning consultation:', error);
    res.status(500).json({ error: error.message || 'Failed to assign consultation' });
  }
});

/**
 * POST /api/admin/consultations/:id/schedule
 * Schedule a consultation session
 */
router.post('/:id/schedule', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduledAt } = req.body;

    if (!scheduledAt) {
      return res.status(400).json({ error: 'Scheduled date/time is required' });
    }

    const [request] = await db
      .select()
      .from(consultationRequests)
      .where(eq(consultationRequests.id, id));

    if (!request) {
      return res.status(404).json({ error: 'Consultation request not found' });
    }

    if (request.status !== 'in_progress') {
      return res.status(400).json({
        error: `Cannot schedule consultation in status: ${request.status}`
      });
    }

    const [updated] = await db
      .update(consultationRequests)
      .set({
        scheduledAt: new Date(scheduledAt),
        updatedAt: new Date(),
      })
      .where(eq(consultationRequests.id, id))
      .returning();

    // TODO: Send calendar invite to customer

    res.json({
      success: true,
      message: 'Consultation session scheduled',
      request: {
        id: updated.id,
        scheduledAt: updated.scheduledAt,
      }
    });

  } catch (error: any) {
    console.error('Error scheduling consultation:', error);
    res.status(500).json({ error: error.message || 'Failed to schedule consultation' });
  }
});

/**
 * POST /api/admin/consultations/:id/complete
 * Mark a consultation as complete with deliverables
 */
router.post('/:id/complete', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { sessionNotes, deliverables } = req.body;

    const [request] = await db
      .select()
      .from(consultationRequests)
      .where(eq(consultationRequests.id, id));

    if (!request) {
      return res.status(404).json({ error: 'Consultation request not found' });
    }

    if (request.status !== 'in_progress') {
      return res.status(400).json({
        error: `Cannot complete consultation in status: ${request.status}`
      });
    }

    const [updated] = await db
      .update(consultationRequests)
      .set({
        status: 'completed',
        completedAt: new Date(),
        sessionNotes,
        deliverables,
        updatedAt: new Date(),
      })
      .where(eq(consultationRequests.id, id))
      .returning();

    // TODO: Send completion notification and deliverables to customer

    res.json({
      success: true,
      message: 'Consultation marked as complete',
      request: {
        id: updated.id,
        status: updated.status,
        completedAt: updated.completedAt,
      }
    });

  } catch (error: any) {
    console.error('Error completing consultation:', error);
    res.status(500).json({ error: error.message || 'Failed to complete consultation' });
  }
});

/**
 * GET /api/admin/consultations/all
 * List all consultations with filtering
 */
router.get('/all', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const { status, assignedTo } = req.query;

    let query = db.select().from(consultationRequests);

    if (status && assignedTo) {
      query = query.where(and(
        eq(consultationRequests.status, status as string),
        eq(consultationRequests.assignedAdminId, assignedTo as string)
      ));
    } else if (status) {
      query = query.where(eq(consultationRequests.status, status as string));
    } else if (assignedTo) {
      query = query.where(eq(consultationRequests.assignedAdminId, assignedTo as string));
    }

    const allRequests: ConsultationRequest[] = await query.orderBy(desc(consultationRequests.createdAt));

    res.json({
      success: true,
      count: allRequests.length,
      requests: allRequests
    });

  } catch (error: any) {
    console.error('Error fetching all consultations:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch consultations' });
  }
});

/**
 * GET /api/admin/consultations/stats
 * Get consultation statistics for admin dashboard
 */
router.get('/stats', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const allRequests: ConsultationRequest[] = await db.select().from(consultationRequests);

    const filterByStatus = (statusFilter: ConsultationRequest['status']) =>
      allRequests.filter((request: ConsultationRequest) => request.status === statusFilter).length;

    const totalRevenue = allRequests
      .filter((request: ConsultationRequest) => request.paymentStatus === 'succeeded')
      .reduce((sum: number, request: ConsultationRequest) => sum + (request.quoteAmount ?? 0), 0);

    const stats = {
      total: allRequests.length,
      pendingQuote: filterByStatus('pending_quote'),
      awaitingApproval: filterByStatus('awaiting_approval'),
      readyForAdmin: filterByStatus('ready_for_admin'),
      inProgress: filterByStatus('in_progress'),
      completed: filterByStatus('completed'),
      rejected: filterByStatus('rejected'),
      totalRevenue,
    };

    res.json({
      success: true,
      stats
    });

  } catch (error: any) {
    console.error('Error fetching consultation stats:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch consultation stats' });
  }
});

export default router;
