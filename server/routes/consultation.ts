/**
 * Consultation Request API Routes
 *
 * Handles the full consultation workflow:
 * 1. Customer submits consultation request
 * 2. Admin creates quote
 * 3. Customer approves/rejects quote
 * 4. Customer completes payment
 * 5. Customer uploads data
 * 6. Admin picks up and runs analysis
 * 7. Admin completes consultation
 */

import { Router } from 'express';
import { db } from '../db';
import { consultationRequests, consultationPricing, projects, datasets } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { ensureAuthenticated } from './auth';
import Stripe from 'stripe';

const router = Router();

type ConsultationRequestRow = typeof consultationRequests.$inferSelect;

/**
 * GET /api/consultation/pricing
 * Get available consultation pricing options (public endpoint for customers)
 */
router.get('/pricing', async (req, res) => {
  try {
    const pricingTiers = await db
      .select({
        id: consultationPricing.id,
        consultationType: consultationPricing.consultationType,
        displayName: consultationPricing.displayName,
        description: consultationPricing.description,
        basePrice: consultationPricing.basePrice,
        expertLevel: consultationPricing.expertLevel,
        durationHours: consultationPricing.durationHours,
        features: consultationPricing.features,
      })
      .from(consultationPricing)
      .where(eq(consultationPricing.isActive, true))
      .orderBy(consultationPricing.sortOrder);

    res.json({
      success: true,
      count: pricingTiers.length,
      pricingTiers
    });

  } catch (error: any) {
    console.error('Error fetching consultation pricing:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch consultation pricing' });
  }
});

// Initialize Stripe if configured
// FIX Jan 20: Use stable Stripe API version
  const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' as any })
    : null;

/**
 * POST /api/consultation/request
 * Customer submits a new consultation request
 */
router.post('/request', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const {
      name,
      email,
      company,
      challenge,
      analysisGoals,
      businessQuestions,
      consultationType = 'standard',
      expertLevel = 'senior',
      duration = 1
    } = req.body;

    // Validation
    if (!name || !email || !challenge) {
      return res.status(400).json({
        error: 'Missing required fields: name, email, challenge'
      });
    }

    // Create consultation request
    const requestId = `cr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const [newRequest] = await db.insert(consultationRequests).values({
      id: requestId,
      userId,
      name,
      email,
      company,
      challenge,
      analysisGoals,
      businessQuestions,
      consultationType,
      expertLevel,
      duration,
      status: 'pending_quote',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    res.json({
      success: true,
      message: 'Consultation request submitted successfully. You will receive a quote within 24 hours.',
      request: {
        id: newRequest.id,
        status: newRequest.status,
        consultationType: newRequest.consultationType,
        expertLevel: newRequest.expertLevel,
        duration: newRequest.duration,
        createdAt: newRequest.createdAt,
      }
    });

  } catch (error: any) {
    console.error('Error creating consultation request:', error);
    res.status(500).json({ error: error.message || 'Failed to create consultation request' });
  }
});

/**
 * GET /api/consultation/my-requests
 * Customer views their consultation requests
 */
router.get('/my-requests', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const requests = await db
      .select()
      .from(consultationRequests)
      .where(eq(consultationRequests.userId, userId))
      .orderBy(desc(consultationRequests.createdAt));

    res.json({
      success: true,
  requests: requests.map((r: ConsultationRequestRow) => ({
        id: r.id,
        challenge: r.challenge,
        consultationType: r.consultationType,
        expertLevel: r.expertLevel,
        duration: r.duration,
        status: r.status,
        quoteAmount: r.quoteAmount,
        quoteDetails: r.quoteDetails,
        quotedAt: r.quotedAt,
        approvedAt: r.approvedAt,
        rejectedAt: r.rejectedAt,
        paymentStatus: r.paymentStatus,
        paidAt: r.paidAt,
        projectId: r.projectId,
        scheduledAt: r.scheduledAt,
        completedAt: r.completedAt,
        createdAt: r.createdAt,
      }))
    });

  } catch (error: any) {
    console.error('Error fetching consultation requests:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch consultation requests' });
  }
});

/**
 * GET /api/consultation/:id
 * Get details of a specific consultation request
 */
router.get('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const [request] = await db
      .select()
      .from(consultationRequests)
      .where(eq(consultationRequests.id, id));

    if (!request) {
      return res.status(404).json({ error: 'Consultation request not found' });
    }

    // Check ownership (or admin access - to be implemented)
    if (request.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      success: true,
      request: {
        id: request.id,
        name: request.name,
        email: request.email,
        company: request.company,
        challenge: request.challenge,
        analysisGoals: request.analysisGoals,
        businessQuestions: request.businessQuestions,
        consultationType: request.consultationType,
        expertLevel: request.expertLevel,
        duration: request.duration,
        status: request.status,
        quoteAmount: request.quoteAmount,
        quoteDetails: request.quoteDetails,
        quotedBy: request.quotedBy,
        quotedAt: request.quotedAt,
        approvedAt: request.approvedAt,
        rejectedAt: request.rejectedAt,
        rejectionReason: request.rejectionReason,
        paymentIntentId: request.paymentIntentId,
        paymentStatus: request.paymentStatus,
        paidAt: request.paidAt,
        projectId: request.projectId,
        dataUploadedAt: request.dataUploadedAt,
        assignedAdminId: request.assignedAdminId,
        assignedAt: request.assignedAt,
        scheduledAt: request.scheduledAt,
        completedAt: request.completedAt,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      }
    });

  } catch (error: any) {
    console.error('Error fetching consultation request:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch consultation request' });
  }
});

/**
 * POST /api/consultation/:id/approve
 * Customer approves quote and initiates payment
 */
router.post('/:id/approve', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Fetch consultation request
    const [request] = await db
      .select()
      .from(consultationRequests)
      .where(eq(consultationRequests.id, id));

    if (!request) {
      return res.status(404).json({ error: 'Consultation request not found' });
    }

    if (request.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (request.status !== 'awaiting_approval') {
      return res.status(400).json({
        error: `Cannot approve consultation in status: ${request.status}`
      });
    }

    if (!request.quoteAmount) {
      return res.status(400).json({ error: 'No quote amount set' });
    }

    // Create Stripe PaymentIntent
    let paymentIntentId: string | null = null;
    let clientSecret: string | null = null;

    // P0-6 FIX: Block mock payments in production
    const isProduction = process.env.NODE_ENV === 'production';
    if (!stripe && isProduction) {
      console.error('🔴 CRITICAL: Stripe not configured in production - blocking consultation payment!');
      return res.status(503).json({
        success: false,
        error: 'Payment service unavailable. Please contact support.',
        code: 'STRIPE_NOT_CONFIGURED'
      });
    }

    if (stripe) {
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: request.quoteAmount * 100, // Convert to cents
          currency: 'usd',
          metadata: {
            consultationRequestId: request.id,
            userId: userId,
            consultationType: request.consultationType || '',
          },
          description: `Consultation: ${request.consultationType} - ${request.challenge.substring(0, 100)}`,
        });

        paymentIntentId = paymentIntent.id;
        clientSecret = paymentIntent.client_secret;
      } catch (stripeError: any) {
        console.error('Stripe PaymentIntent creation failed:', stripeError);
        return res.status(500).json({
          error: 'Failed to create payment intent',
          details: stripeError.message
        });
      }
    } else {
      // Mock mode for development
      console.warn('⚠️ Stripe not configured - using mock payment intent');
      const mockId = `pi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const mockSecret = `${mockId}_secret_${Math.random().toString(36).slice(2, 24)}`;
      paymentIntentId = mockId;
      clientSecret = mockSecret;
    }

    // Update consultation request
    const [updated] = await db
      .update(consultationRequests)
      .set({
        status: 'approved',
        approvedAt: new Date(),
        paymentIntentId,
        paymentStatus: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(consultationRequests.id, id))
      .returning();

    res.json({
      success: true,
      message: 'Quote approved. Please complete payment to proceed.',
      request: {
        id: updated.id,
        status: updated.status,
        approvedAt: updated.approvedAt,
        paymentIntentId: updated.paymentIntentId,
      },
      clientSecret, // For Stripe Elements
    });

  } catch (error: any) {
    console.error('Error approving consultation:', error);
    res.status(500).json({ error: error.message || 'Failed to approve consultation' });
  }
});

/**
 * POST /api/consultation/:id/reject
 * Customer rejects quote
 */
router.post('/:id/reject', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { reason } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const [request] = await db
      .select()
      .from(consultationRequests)
      .where(eq(consultationRequests.id, id));

    if (!request) {
      return res.status(404).json({ error: 'Consultation request not found' });
    }

    if (request.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (request.status !== 'awaiting_approval') {
      return res.status(400).json({
        error: `Cannot reject consultation in status: ${request.status}`
      });
    }

    const [updated] = await db
      .update(consultationRequests)
      .set({
        status: 'rejected',
        rejectedAt: new Date(),
        rejectionReason: reason || 'Quote declined by customer',
        updatedAt: new Date(),
      })
      .where(eq(consultationRequests.id, id))
      .returning();

    res.json({
      success: true,
      message: 'Quote rejected',
      request: {
        id: updated.id,
        status: updated.status,
        rejectedAt: updated.rejectedAt,
      }
    });

  } catch (error: any) {
    console.error('Error rejecting consultation:', error);
    res.status(500).json({ error: error.message || 'Failed to reject consultation' });
  }
});

/**
 * POST /api/consultation/:id/upload-data
 * Customer uploads data files after payment is complete
 * This creates the actual project and links it to the consultation
 */
router.post('/:id/upload-data', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { datasetIds, projectGoals, detailedQuestions } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const [request] = await db
      .select()
      .from(consultationRequests)
      .where(eq(consultationRequests.id, id));

    if (!request) {
      return res.status(404).json({ error: 'Consultation request not found' });
    }

    if (request.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check payment status
    if (request.paymentStatus !== 'succeeded') {
      return res.status(400).json({
        error: 'Payment must be completed before uploading data'
      });
    }

    if (request.status !== 'approved') {
      return res.status(400).json({
        error: `Cannot upload data in status: ${request.status}`
      });
    }

    // Create project for this consultation
    const projectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const [newProject] = await db.insert(projects).values({
      id: projectId,
      userId,
      ownerId: userId, // Set ownerId for backward compatibility
      name: `Consultation: ${request.challenge.substring(0, 50)}`,
      description: `Expert consultation project for ${request.consultationType}`,
      journeyType: 'consultation',
      objectives: projectGoals || request.analysisGoals || request.challenge,
      businessContext: request.company || '',
      analysisQuestions: detailedQuestions || request.businessQuestions || '',
      status: 'in_progress',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    // Update consultation request with project link
    const [updated] = await db
      .update(consultationRequests)
      .set({
        projectId: newProject.id,
        dataUploadedAt: new Date(),
        status: 'ready_for_admin',
        updatedAt: new Date(),
      })
      .where(eq(consultationRequests.id, id))
      .returning();

    res.json({
      success: true,
      message: 'Data uploaded successfully. Your consultation is now ready for expert review.',
      request: {
        id: updated.id,
        status: updated.status,
        projectId: updated.projectId,
        dataUploadedAt: updated.dataUploadedAt,
      },
      project: {
        id: newProject.id,
        name: newProject.name,
      }
    });

  } catch (error: any) {
    console.error('Error uploading consultation data:', error);
    res.status(500).json({ error: error.message || 'Failed to upload consultation data' });
  }
});

/**
 * GET /api/consultation/:id/status
 * Get current status and progress of consultation
 */
router.get('/:id/status', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const [request] = await db
      .select()
      .from(consultationRequests)
      .where(eq(consultationRequests.id, id));

    if (!request) {
      return res.status(404).json({ error: 'Consultation request not found' });
    }

    if (request.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build status timeline
    const timeline = [
      { stage: 'request_submitted', completed: true, timestamp: request.createdAt },
      { stage: 'quote_created', completed: !!request.quotedAt, timestamp: request.quotedAt },
      { stage: 'quote_approved', completed: !!request.approvedAt, timestamp: request.approvedAt },
      { stage: 'payment_complete', completed: request.paymentStatus === 'succeeded', timestamp: request.paidAt },
      { stage: 'data_uploaded', completed: !!request.dataUploadedAt, timestamp: request.dataUploadedAt },
      { stage: 'admin_assigned', completed: !!request.assignedAt, timestamp: request.assignedAt },
      { stage: 'consultation_scheduled', completed: !!request.scheduledAt, timestamp: request.scheduledAt },
      { stage: 'consultation_completed', completed: !!request.completedAt, timestamp: request.completedAt },
    ];

    res.json({
      success: true,
      status: {
        currentStatus: request.status,
        paymentStatus: request.paymentStatus,
        timeline,
        nextAction: getNextAction(request),
      }
    });

  } catch (error: any) {
    console.error('Error fetching consultation status:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch consultation status' });
  }
});

/**
 * Helper function to determine next action for customer
 */
function getNextAction(request: any): string {
  switch (request.status) {
    case 'pending_quote':
      return 'Waiting for quote from our team';
    case 'awaiting_approval':
      return 'Review and approve/reject the quote';
    case 'approved':
      return request.paymentStatus === 'succeeded'
        ? 'Upload your data files'
        : 'Complete payment';
    case 'rejected':
      return 'Quote was rejected';
    case 'ready_for_admin':
      return 'Waiting for expert assignment';
    case 'in_progress':
      return 'Expert is working on your analysis';
    case 'completed':
      return 'Consultation completed - view deliverables';
    default:
      return 'Unknown status';
  }
}

export default router;
