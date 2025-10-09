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
        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required' });
        }

        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // In a real app, you'd use the actual cost from the project or analysis
        const amount = project.costEstimation || 50; // Default to 50 if no estimation
        const currency = 'USD';

        const session = await PricingService.createCheckoutSession(projectId, amount, currency);
        res.json(session);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
