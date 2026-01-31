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
        const { projectId, amount: clientAmount } = req.body;
        const userId = (req.user as any)?.id;

        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required' });
        }

        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // PHASE 5 SSOT FIX: Use ONLY journeyProgress.lockedCostEstimate (no fallbacks)
        const projectAny = project as any;
        const journeyProgress = projectAny.journeyProgress || {};
        const lockedCostEstimate = journeyProgress.lockedCostEstimate;

        if (!lockedCostEstimate || parseFloat(lockedCostEstimate) <= 0) {
            console.error(`❌ [Payment SSOT] No locked cost estimate found in journeyProgress for project ${projectId}`);
            return res.status(400).json({
                error: 'COST_NOT_LOCKED',
                message: 'Cost must be locked before payment. Please return to the pricing step to lock your cost estimate.'
            });
        }

        const amount = parseFloat(lockedCostEstimate);

        // Guard: Verify frontend-sent amount matches the locked cost (tolerance: 1 cent)
        if (clientAmount != null) {
            const clientAmountNum = parseFloat(clientAmount);
            if (!isNaN(clientAmountNum) && Math.abs(clientAmountNum - amount) > 0.01) {
                console.error(`❌ [Payment] Amount mismatch! Client sent $${clientAmountNum.toFixed(2)}, locked cost is $${amount.toFixed(2)} for project ${projectId}`);
                return res.status(400).json({
                    error: 'COST_MISMATCH',
                    message: 'The displayed cost does not match the locked cost. Please refresh the page and try again.'
                });
            }
        }

        console.log(`✅ [Payment SSOT] Using journeyProgress.lockedCostEstimate: $${amount.toFixed(2)} for project ${projectId}`);

        const currency = 'USD';

        // Lazy load service to avoid circular dependencies if any
        const { getBillingService } = await import('../services/billing/unified-billing-service');

        // Initialize if needed (though it should be singleton)
        const unifiedBillingService = getBillingService();

        // Retry logic: 1 retry with 2s delay for transient Stripe errors
        let session;
        let lastError: any;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                session = await unifiedBillingService.createCheckoutSession(projectId, userId, amount, currency);
                break;
            } catch (err: any) {
                lastError = err;
                const errorType = err?.type || err?.code || '';
                const isTransient = errorType === 'StripeConnectionError' ||
                    errorType === 'StripeRateLimitError' ||
                    err?.statusCode === 429 ||
                    err?.statusCode === 502 ||
                    err?.statusCode === 503;

                if (isTransient && attempt === 0) {
                    console.warn(`⚠️ [Payment] Transient Stripe error, retrying in 2s: ${err.message}`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }
                throw err;
            }
        }

        if (!session) {
            throw lastError || new Error('Checkout session creation failed after retry');
        }

        // P1 FIX: Return both 'id' and 'sessionId' for frontend compatibility
        // Frontend checks for 'response.url' first, then 'response.id' as fallback
        res.json({
            ...session,
            id: session.sessionId,  // Frontend compatibility - checks 'id' not 'sessionId'
            success: true
        });
    } catch (error: any) {
        console.error('❌ [Payment] Checkout session creation failed:', error);

        // Classify Stripe errors for specific user feedback
        const stripeErrorType = error?.type || error?.code || '';
        let statusCode = 500;
        let errorType = 'checkout_creation_failed';
        let userMessage = 'Payment processing failed. Please try again.';

        if (stripeErrorType === 'StripeAuthenticationError' || error?.message?.includes('API key')) {
            statusCode = 503;
            errorType = 'payment_service_unavailable';
            userMessage = 'Payment service is temporarily unavailable. Please try again later.';
        } else if (stripeErrorType === 'StripeInvalidRequestError') {
            statusCode = 400;
            errorType = 'invalid_payment_request';
            userMessage = `Invalid payment request: ${error.message}`;
        } else if (stripeErrorType === 'StripeConnectionError') {
            statusCode = 503;
            errorType = 'payment_service_unavailable';
            userMessage = 'Could not connect to payment provider. Please check your connection and try again.';
        } else if (stripeErrorType === 'StripeRateLimitError') {
            statusCode = 429;
            errorType = 'payment_rate_limited';
            userMessage = 'Too many payment requests. Please wait a moment and try again.';
        }

        res.status(statusCode).json({
            success: false,
            error: userMessage,
            errorType,
            retryable: statusCode === 503 || statusCode === 429
        });
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

        // P0-A FIX: Normalize paymentStatus to only 'paid' or 'failed' - never expose internal status strings
        res.json({
            success: verification.success,
            status: verification.status,
            paymentStatus: verification.success ? 'paid' : 'failed',
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
