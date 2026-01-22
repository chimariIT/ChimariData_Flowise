import { Router } from 'express';
import { PricingService } from '../services';
import { ensureAuthenticated } from './auth';
import { storage } from '../services/storage';

const router = Router();


/**
 * @summary Estimates the cost of an analysis.
 * @description Calculates a cost estimate based on the type of analysis, number of records, and complexity.
 * This does not trigger any payment.
 * @route POST /api/payment/estimate-cost
 * @auth Required (`ensureAuthenticated` middleware).
 * @input
 * - `req.body`: { analysisType: string, recordCount: number, complexity?: string }
 * @process
 * 1. Validates that `analysisType` and `recordCount` are provided.
 * 2. Calls `PricingService.calculateAnalysisCost` to get the cost.
 * @output
 * - Success: 200 { cost: number, currency: string, details: object }
 * - Error: 400 or 500 with an error message.
 * @dependencies `PricingService`.
 */
router.post('/estimate-cost', ensureAuthenticated, async (req, res) => {
    try {
        const { analysisType, recordCount, complexity } = req.body;
        if (!analysisType || !recordCount) {
            return res.status(400).json({ error: 'analysisType and recordCount are required' });
        }

        const cost = PricingService.calculateAnalysisCost(analysisType, recordCount, complexity);
        res.json(cost);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @summary Creates a Stripe checkout session for a project.
 * @description Initiates a payment flow. It retrieves the project's estimated cost and creates a
 * checkout session with a payment provider (e.g., Stripe).
 * @route POST /api/payment/create-checkout-session
 * @auth Required (`ensureAuthenticated` middleware).
 * @input
 * - `req.body`: { projectId: string }
 * @process
 * 1. Fetches the project from `storage`.
 * 2. Retrieves the `costEstimation` from the project object (defaults if not present).
 * 3. Calls `PricingService.createCheckoutSession` to get a session URL/ID from the payment provider.
 * @output
 * - Success: 200 { id: string, url: string, ... } (session object from payment provider)
 * - Error: 400, 404, or 500 with an error message.
 * @dependencies `storage`, `PricingService`.
 */
router.post('/create-checkout-session', ensureAuthenticated, async (req, res) => {
    try {
        const { projectId } = req.body;
        const userId = (req.user as any)?.id;

        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required' });
        }

        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // ✅ PHASE 6 FIX: Use locked cost estimate with better fallback chain
        // Priority: 1. Request amount (from frontend), 2. lockedCostEstimate, 3. costEstimation, 4. costBreakdown, 5. fallback
        const projectAny = project as any;
        const requestAmount = req.body.amount;  // PHASE 6: Frontend can pass exact amount
        const lockedCost = projectAny.lockedCostEstimate;
        const costEstimation = (project as any).costEstimation;

        let amount: number;

        // Priority 1: Use amount from request (frontend calculated, most accurate)
        if (requestAmount && parseFloat(requestAmount) > 0) {
            amount = parseFloat(requestAmount);
            console.log(`✅ [Payment] Using frontend-provided amount: $${amount.toFixed(2)} for project ${projectId}`);

            // Also save to project for record keeping
            try {
                await storage.updateProject(projectId, { lockedCostEstimate: amount.toString() } as any);
                console.log(`✅ [Payment] Saved lockedCostEstimate: $${amount.toFixed(2)}`);
            } catch (saveError) {
                console.warn(`⚠️ [Payment] Could not save lockedCostEstimate:`, saveError);
            }
        }
        // Priority 2: Use lockedCostEstimate from database
        else if (lockedCost && parseFloat(lockedCost) > 0) {
            amount = parseFloat(lockedCost);
            console.log(`✅ [Payment] Using lockedCostEstimate: $${amount.toFixed(2)} for project ${projectId}`);
        }
        // Priority 3: Use costEstimation
        else if (costEstimation && parseFloat(costEstimation) > 0) {
            amount = parseFloat(costEstimation);
            console.log(`✅ [Payment] Using costEstimation: $${amount.toFixed(2)} for project ${projectId}`);
        }
        // Priority 4: Use costBreakdown.total
        else if (projectAny.costBreakdown?.total && parseFloat(projectAny.costBreakdown.total) > 0) {
            amount = parseFloat(projectAny.costBreakdown.total);
            console.log(`✅ [Payment] Using costBreakdown.total: $${amount.toFixed(2)} for project ${projectId}`);
        }
        // Priority 5: Last resort fallback
        else {
            amount = 35;
            console.warn(`⚠️ [Payment] No cost found for project ${projectId}, using fallback: $${amount}`);
        }

        const currency = 'USD';

        // Lazy load service to avoid circular dependencies if any
        const { getBillingService } = await import('../services/billing/unified-billing-service');

        // Initialize if needed (though it should be singleton)
        const unifiedBillingService = getBillingService();

        const session = await unifiedBillingService.createCheckoutSession(projectId, userId, amount, currency);
        res.json(session);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @summary Verifies a completed checkout session
 * @description Called after user returns from Stripe checkout to verify payment was successful
 * @route POST /api/payment/verify-session
 * @auth Required
 */
router.post('/verify-session', ensureAuthenticated, async (req, res) => {
    try {
        const { sessionId, projectId } = req.body;
        const userId = (req.user as any)?.id;

        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        let verification = { success: false, status: 'unknown' };
        const isProduction = process.env.NODE_ENV === 'production';

        // ==========================================
        // PRODUCTION SAFETY CHECK
        // ==========================================
        // In production, NEVER allow simulated payments
        // This prevents accidental deployment with mock data
        if (isProduction && !process.env.STRIPE_SECRET_KEY) {
            console.error('🔴 [Payment] CRITICAL: STRIPE_SECRET_KEY not configured in production!');
            return res.status(500).json({
                error: 'Payment system not configured',
                message: 'Stripe is not properly configured for production. Please contact support.'
            });
        }

        // Verify the session with Stripe if configured
        if (process.env.STRIPE_SECRET_KEY) {
            try {
                const Stripe = await import('stripe');
                const stripe = new Stripe.default(process.env.STRIPE_SECRET_KEY);
                const session = await stripe.checkout.sessions.retrieve(sessionId);

                verification = {
                    success: session.payment_status === 'paid',
                    status: session.payment_status
                };
            } catch (stripeError) {
                console.warn('⚠️ [Payment] Stripe verification failed:', stripeError);

                // ==========================================
                // DEVELOPMENT-ONLY FALLBACK
                // ==========================================
                // ONLY allow simulated success in development
                // Production will return failure
                if (!isProduction && sessionId.startsWith('cs_')) {
                    console.warn('⚠️ [Payment] Using SIMULATED payment success (development only)');
                    verification = { success: true, status: 'simulated_dev_only' };
                } else if (isProduction) {
                    console.error('🔴 [Payment] Stripe verification failed in production');
                    return res.status(400).json({
                        error: 'Payment verification failed',
                        message: 'Unable to verify payment with Stripe. Please try again or contact support.'
                    });
                }
            }
        } else if (!isProduction) {
            // No Stripe key - ONLY allow simulation in development
            console.warn('⚠️ [Payment] Using SIMULATED payment (no Stripe key - development only)');
            verification = { success: true, status: 'simulated_dev_only' };
        }
        // If isProduction and no Stripe key, we already returned 500 above

        if (verification.success && projectId) {
            // Update project payment status and mark as paid
            // isPaid: true allows access through the payment gate in analysis-execution.ts
            await storage.updateProject(projectId, {
                isPaid: true,  // ✅ Critical: This enables pay-per-use access
                paymentStatus: 'completed',
                paymentSessionId: sessionId,
                paidAt: new Date().toISOString()
            } as any);

            console.log(`✅ [Payment] Session ${sessionId} verified for project ${projectId} - marked as paid`);
        }

        res.json({
            success: verification.success,
            status: verification.status,
            paymentStatus: verification.success ? 'paid' : verification.status,
            projectId,
            message: verification.success ? 'Payment verified successfully' : 'Payment verification failed'
        });
    } catch (error: any) {
        console.error('Failed to verify payment session:', error);
        res.status(500).json({ error: error.message || 'Failed to verify session' });
    }
});

/**
 * @summary Cancels a pending payment/checkout
 * @description Allows user to cancel a payment flow before completion
 * @route POST /api/payment/cancel
 * @auth Required
 */
router.post('/cancel', ensureAuthenticated, async (req, res) => {
    try {
        const { projectId, sessionId } = req.body;
        const userId = (req.user as any)?.id;

        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required' });
        }

        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Update project to reflect cancelled payment
        await storage.updateProject(projectId, {
            paymentStatus: 'cancelled',
            paymentCancelledAt: new Date().toISOString()
        } as any);

        console.log(`❌ [Payment] Payment cancelled for project ${projectId}`);

        res.json({
            success: true,
            projectId,
            message: 'Payment cancelled successfully'
        });
    } catch (error: any) {
        console.error('Failed to cancel payment:', error);
        res.status(500).json({ error: error.message || 'Failed to cancel payment' });
    }
});

export default router;
