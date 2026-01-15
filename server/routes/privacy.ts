/**
 * Privacy Compliance API Routes
 * 
 * Handles GDPR/CCPA privacy requests and consent management
 */

import { Router } from 'express';
import { PrivacyComplianceService } from '../services/privacy-compliance';
import { ensureAuthenticated } from './auth';
import { requireAdmin } from '../middleware/rbac';
import { auditMiddleware } from '../middleware/audit';

const router = Router();

/**
 * Submit a privacy request
 * POST /api/privacy/request
 */
router.post('/request', ensureAuthenticated, auditMiddleware, async (req, res) => {
    try {
        const { requestType, details } = req.body;

        if (!['ACCESS', 'ERASURE', 'RECTIFICATION', 'PORTABILITY'].includes(requestType)) {
            return res.status(400).json({ error: 'Invalid request type' });
        }

        const userId = req.user!.id;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found' });
        }

        const request = await PrivacyComplianceService.createPrivacyRequest(
            userId,
            requestType,
            details
        );

        res.json({
            success: true,
            request,
            message: 'Privacy request submitted successfully. We will process it within 30 days as required by GDPR.'
        });
    } catch (error: any) {
        console.error('Privacy request error:', error);
        res.status(500).json({ error: 'Failed to submit privacy request' });
    }
});

/**
 * Get user's privacy requests
 * GET /api/privacy/requests
 */
router.get('/requests', ensureAuthenticated, async (req, res) => {
    try {
        // Implementation would query user's requests
        res.json({ requests: [] });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

/**
 * Download user data
 * GET /api/privacy/download
 */
router.get('/download', ensureAuthenticated, auditMiddleware, async (req, res) => {
    try {
        const format = (req.query.format as string) || 'JSON';
        const userId = req.user!.id || '';
        if (!userId) return res.status(401).json({ error: 'User ID not found' });

        const userData = await PrivacyComplianceService.getUserData(userId);

        if (format === 'JSON') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="my-data-${Date.now()}.json"`);
            res.json(userData);
        } else {
            res.status(400).json({ error: 'Unsupported format' });
        }
    } catch (error: any) {
        console.error('Data download error:', error);
        res.status(500).json({ error: 'Failed to download data' });
    }
});

/**
 * Grant or revoke consent
 * POST /api/privacy/consent
 */
router.post('/consent', ensureAuthenticated, auditMiddleware, async (req, res) => {
    try {
        const { consentType, granted } = req.body;

        if (!['MARKETING', 'ANALYTICS', 'DATA_PROCESSING', 'THIRD_PARTY_SHARING'].includes(consentType)) {
            return res.status(400).json({ error: 'Invalid consent type' });
        }

        const userId = req.user!.id || '';
        if (!userId) return res.status(401).json({ error: 'User ID not found' });

        const consent = await PrivacyComplianceService.trackConsent(
            userId,
            consentType,
            granted,
            req.ip
        );

        res.json({
            success: true,
            consent,
            message: `Consent ${granted ? 'granted' : 'revoked'} successfully`
        });
    } catch (error: any) {
        console.error('Consent tracking error:', error);
        res.status(500).json({ error: 'Failed to update consent' });
    }
});

/**
 * Get consent history
 * GET /api/privacy/consents
 */
router.get('/consents', ensureAuthenticated, async (req, res) => {
    try {
        const userId = req.user!.id || '';
        if (!userId) return res.status(401).json({ error: 'User ID not found' });
        const consents = await PrivacyComplianceService.getConsentHistory(userId);
        res.json({ consents });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch consent history' });
    }
});

// ============================================================================
// Admin Routes
// ============================================================================

/**
 * Get all pending privacy requests (admin only)
 * GET /api/admin/privacy/requests
 */
router.get('/admin/requests', ensureAuthenticated, requireAdmin, async (req, res) => {
    try {
        const requests = await PrivacyComplianceService.getPendingRequests();
        res.json({ requests });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

/**
 * Approve privacy request (admin only)
 * POST /api/admin/privacy/approve/:id
 */
router.post('/admin/approve/:id', ensureAuthenticated, requireAdmin, auditMiddleware, async (req, res) => {
    try {
        const adminUserId = req.user!.id || '';
        if (!adminUserId) return res.status(401).json({ error: 'User ID not found' });
        await PrivacyComplianceService.approveRequest(req.params.id, adminUserId);
        res.json({ success: true, message: 'Request approved' });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to approve request' });
    }
});

/**
 * Reject privacy request (admin only)
 * POST /api/admin/privacy/reject/:id
 */
router.post('/admin/reject/:id', ensureAuthenticated, requireAdmin, auditMiddleware, async (req, res) => {
    try {
        const { reason } = req.body;
        const adminUserId = req.user!.id || '';
        if (!adminUserId) return res.status(401).json({ error: 'User ID not found' });
        await PrivacyComplianceService.rejectRequest(req.params.id, adminUserId, reason);
        res.json({ success: true, message: 'Request rejected' });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to reject request' });
    }
});

/**
 * Process approved request (admin only)
 * POST /api/admin/privacy/process/:id
 */
router.post('/admin/process/:id', ensureAuthenticated, requireAdmin, auditMiddleware, async (req, res) => {
    try {
        const request = await PrivacyComplianceService.processDataAccessRequest(req.params.id);
        res.json({ success: true, data: request });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to process request' });
    }
});

export default router;
