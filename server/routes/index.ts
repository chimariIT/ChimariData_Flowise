import { Router } from 'express';
import crypto from 'crypto';
import authRouter from './auth';
import projectRouter from './project';
import dataRouter from './data';
import aiRouter from './ai';
import exportRouter from './export';
import paymentRouter from './payment';
import interactiveRouter from './interactive';
import analysisRouter from './analysis'; // Import the new analysis router
import userRoleRouter from './user-role';
import usageRouter from './usage';
import aiPaymentRouter from './ai-payment';
import conversationRouter from './conversation';
import workflowRouter from './workflow';
import agentsRouter from './agents';
import templateRouter from './template';
import enhancedAnalysisRouter from './enhanced-analysis';
import analysisExecutionRouter from './analysis-execution';
import billingRouter from './billing';
import pricingRouter from './pricing';
import adminRouter from './admin';
import adminSecuredRouter from './admin-secured';
import systemRouter from './system';
import analyticsRouter from './analytics';
import templateOnboardingRouter from './template-onboarding';
import stripeWebhooksRouter from './stripe-webhooks';
import stripeWebhookTestRouter from './stripe-webhook-test';
import consultationRouter from './consultation';
import adminConsultationRouter from './admin-consultation';
import adminConsultationPricingRouter from './admin-consultation-pricing';
import projectSessionRouter from './project-session';
import customJourneyRouter from './custom-journey';
import analyzeDataRouter from './analyze-data';
import audienceFormattingRouter from './audience-formatting';
import businessTemplateSynthesisRouter from './business-template-synthesis';
import pmClarificationRouter from './pm-clarification';
import { ensureAuthenticated } from './auth'; // Import authentication middleware

const router = Router();

router.use('/auth', authRouter);
router.use('/system', systemRouter); // System health and monitoring endpoints
router.use('/projects', projectRouter);
router.use('/data', dataRouter);
router.use('/ai', aiRouter);
router.use('/export', exportRouter);
router.use('/payment', paymentRouter);
router.use('/interactive', interactiveRouter);
router.use('/analysis', analysisRouter); // Add the new analysis router to the main router
router.use('/user', ensureAuthenticated, userRoleRouter); // User role and permission management - REQUIRES AUTH
router.use('/usage', usageRouter); // Usage tracking and monitoring
router.use('/ai/payment', aiPaymentRouter); // AI payment and pricing management
router.use('/conversation', conversationRouter); // Conversational goal refinement
router.use('/workflow', workflowRouter); // Workflow transparency and audit trail
router.use('/agents', agentsRouter); // Agent activities and intervention
router.use('/template', templateRouter); // Dynamic template generation and management
router.use('/enhanced-analysis', enhancedAnalysisRouter); // Enhanced analysis with full MCP integration
router.use('/analysis-execution', analysisExecutionRouter); // Real data analysis execution
router.use('/billing', billingRouter); // Enhanced billing with capacity tracking
router.use('/pricing', pricingRouter); // Pricing tiers and plans
router.use('/analytics', analyticsRouter); // Tool analytics and system monitoring
router.use('/template-onboarding', templateOnboardingRouter); // Business template research and onboarding
router.use('/consultation', consultationRouter); // Consultation request and workflow management
router.use('/admin/consultations', adminConsultationRouter); // Admin consultation management
router.use('/admin/consultation-pricing', adminConsultationPricingRouter); // Admin consultation pricing configuration
router.use('/project-session', projectSessionRouter); // Secure server-side session state management
router.use('/custom-journey', customJourneyRouter); // Custom "Build Your Own" journey capability selection
router.use('/analyze-data', ensureAuthenticated, analyzeDataRouter); // Analysis with audience formatting
router.use('/audience-formatting', ensureAuthenticated, audienceFormattingRouter); // Audience-specific formatting
router.use('/business-template-synthesis', ensureAuthenticated, businessTemplateSynthesisRouter); // Business template synthesis
router.use('/project-manager', ensureAuthenticated, pmClarificationRouter); // PM Agent goal clarification
router.use('/admin', adminSecuredRouter); // Secured admin routes with RBAC
router.use('/admin-legacy', adminRouter); // Legacy admin routes for compatibility
router.use('/webhooks', stripeWebhooksRouter); // Stripe webhook handlers (must be before JSON parsing)
router.use('/webhooks/stripe-test', stripeWebhookTestRouter); // Stripe webhook testing and diagnostics

// Direct Stripe payment intent endpoint for testing
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, description, metadata } = req.body;

    // Mock payment intent for testing purposes
    // Stripe Elements expects a client_secret shaped like: pi_<id>_secret_<secret>
    // Where <id> and <secret> are base62/hex without underscores. Avoid extra underscores in the id portion.
    const id = `pi_${crypto.randomBytes(12).toString('hex')}`; // pi_<24 hex chars>
    const secret = crypto.randomBytes(24).toString('hex'); // sufficient length secret
    const clientSecret = `${id}_secret_${secret}`;

    res.json({
      clientSecret,
      amount: amount || 29.99,
      currency: 'usd',
      status: 'requires_payment_method'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Mock expert consultation booking endpoint for UI flows/testing
router.post('/consultation-booking', async (req, res) => {
  try {
    const { name, email, company, challenge, consultationType, price } = req.body || {};
    const bookingId = `cb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // In production, store booking and notify via email/provider integration.
    res.json({
      success: true,
      bookingId,
      message: 'Consultation booking received. We will contact you shortly.',
      received: { name, email, company, consultationType, price }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
