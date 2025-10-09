// server/routes/performance-webhooks.ts
import { Router } from 'express';
import { performanceWebhookService, WebhookEndpoint } from '../services/performance-webhook-service';
import { ensureAuthenticated } from './auth';

const router = Router();

// Middleware to check admin privileges (you may want to implement proper role checking)
const requireAdmin = (req: any, res: any, next: any) => {
    // For now, just check if user is authenticated
    // In production, you'd check for admin role
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if user has admin permissions (implement based on your user model)
    if (req.user.role !== 'admin' && req.user.email !== process.env.ADMIN_EMAIL) {
        return res.status(403).json({ error: 'Admin privileges required' });
    }
    
    next();
};

/**
 * @route GET /api/performance/webhooks
 * @desc Get all registered webhook endpoints
 * @access Admin
 */
router.get('/webhooks', ensureAuthenticated, requireAdmin, (req, res) => {
    try {
        const webhooks = performanceWebhookService.getWebhookEndpoints();
        res.json({
            success: true,
            webhooks: webhooks.map(webhook => ({
                ...webhook,
                secret: webhook.secret ? '[REDACTED]' : undefined // Don't expose secrets
            }))
        });
    } catch (error: any) {
        console.error('Error fetching webhooks:', error);
        res.status(500).json({ error: 'Failed to fetch webhooks' });
    }
});

/**
 * @route POST /api/performance/webhooks
 * @desc Register a new webhook endpoint
 * @access Admin
 */
router.post('/webhooks', ensureAuthenticated, requireAdmin, (req, res) => {
    try {
        const { url, secret, events, thresholds, retrySettings, headers } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'Webhook URL is required' });
        }

        const webhookId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const webhook: WebhookEndpoint = {
            id: webhookId,
            url,
            secret,
            enabled: true,
            events: events || ['slow_operation', 'high_error_rate', 'system_health'],
            thresholds: {
                slowOperationMs: 1000,
                errorRate: 0.1,
                concurrentUsers: 100,
                ...thresholds
            },
            retrySettings: {
                maxRetries: 3,
                retryDelay: 1000,
                ...retrySettings
            },
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ChimariData-Performance-Monitor/1.0',
                ...headers
            }
        };

        performanceWebhookService.registerWebhook(webhook);

        res.json({
            success: true,
            webhook: {
                ...webhook,
                secret: webhook.secret ? '[REDACTED]' : undefined
            }
        });
    } catch (error: any) {
        console.error('Error registering webhook:', error);
        res.status(500).json({ error: 'Failed to register webhook' });
    }
});

/**
 * @route PUT /api/performance/webhooks/:id
 * @desc Update a webhook endpoint
 * @access Admin
 */
router.put('/webhooks/:id', ensureAuthenticated, requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const webhooks = performanceWebhookService.getWebhookEndpoints();
        const existingWebhook = webhooks.find(w => w.id === id);

        if (!existingWebhook) {
            return res.status(404).json({ error: 'Webhook not found' });
        }

        const updatedWebhook: WebhookEndpoint = {
            ...existingWebhook,
            ...updates,
            id // Ensure ID cannot be changed
        };

        performanceWebhookService.registerWebhook(updatedWebhook);

        res.json({
            success: true,
            webhook: {
                ...updatedWebhook,
                secret: updatedWebhook.secret ? '[REDACTED]' : undefined
            }
        });
    } catch (error: any) {
        console.error('Error updating webhook:', error);
        res.status(500).json({ error: 'Failed to update webhook' });
    }
});

/**
 * @route DELETE /api/performance/webhooks/:id
 * @desc Remove a webhook endpoint
 * @access Admin
 */
router.delete('/webhooks/:id', ensureAuthenticated, requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const removed = performanceWebhookService.unregisterWebhook(id);

        if (!removed) {
            return res.status(404).json({ error: 'Webhook not found' });
        }

        res.json({ success: true, message: 'Webhook removed successfully' });
    } catch (error: any) {
        console.error('Error removing webhook:', error);
        res.status(500).json({ error: 'Failed to remove webhook' });
    }
});

/**
 * @route POST /api/performance/webhooks/:id/toggle
 * @desc Enable/disable a webhook endpoint
 * @access Admin
 */
router.post('/webhooks/:id/toggle', ensureAuthenticated, requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const { enabled } = req.body;

        const webhooks = performanceWebhookService.getWebhookEndpoints();
        const webhook = webhooks.find(w => w.id === id);

        if (!webhook) {
            return res.status(404).json({ error: 'Webhook not found' });
        }

        const updatedWebhook: WebhookEndpoint = {
            ...webhook,
            enabled: enabled !== undefined ? enabled : !webhook.enabled
        };

        performanceWebhookService.registerWebhook(updatedWebhook);

        res.json({
            success: true,
            webhook: {
                ...updatedWebhook,
                secret: updatedWebhook.secret ? '[REDACTED]' : undefined
            }
        });
    } catch (error: any) {
        console.error('Error toggling webhook:', error);
        res.status(500).json({ error: 'Failed to toggle webhook' });
    }
});

/**
 * @route POST /api/performance/webhooks/:id/test
 * @desc Send a test payload to a webhook endpoint
 * @access Admin
 */
router.post('/webhooks/:id/test', ensureAuthenticated, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const webhooks = performanceWebhookService.getWebhookEndpoints();
        const webhook = webhooks.find(w => w.id === id);

        if (!webhook) {
            return res.status(404).json({ error: 'Webhook not found' });
        }

        // Send a test performance metric
        await performanceWebhookService.recordMetric({
            timestamp: new Date(),
            service: 'test',
            operation: 'webhook_test',
            duration: 1500, // Intentionally slow to trigger alert
            status: 'success',
            details: {
                testPayload: true,
                triggeredBy: req.user.email,
                message: 'This is a test webhook payload from ChimariData Performance Monitor'
            },
            userId: req.user.id
        });

        res.json({
            success: true,
            message: 'Test webhook sent successfully'
        });
    } catch (error: any) {
        console.error('Error sending test webhook:', error);
        res.status(500).json({ error: 'Failed to send test webhook' });
    }
});

/**
 * @route GET /api/performance/metrics/summary
 * @desc Get performance metrics summary
 * @access Admin
 */
router.get('/metrics/summary', ensureAuthenticated, requireAdmin, (req, res) => {
    try {
        const timeWindow = parseInt(req.query.timeWindow as string) || 300000; // Default 5 minutes
        const summary = performanceWebhookService.getMetricsSummary(timeWindow);

        res.json({
            success: true,
            summary,
            timeWindow: `${timeWindow / 1000}s`
        });
    } catch (error: any) {
        console.error('Error fetching metrics summary:', error);
        res.status(500).json({ error: 'Failed to fetch metrics summary' });
    }
});

/**
 * @route GET /api/performance/health
 * @desc Get system health status
 * @access Public (for monitoring tools)
 */
router.get('/health', (req, res) => {
    try {
        const summary = performanceWebhookService.getMetricsSummary(60000); // Last minute
        const webhooks = performanceWebhookService.getWebhookEndpoints();
        
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            metrics: summary,
            webhooks: {
                total: webhooks.length,
                enabled: webhooks.filter(w => w.enabled).length,
                disabled: webhooks.filter(w => !w.enabled).length
            }
        };

        res.json(health);
    } catch (error: any) {
        console.error('Error fetching health status:', error);
        res.status(500).json({ 
            status: 'unhealthy', 
            error: 'Failed to fetch health status',
            timestamp: new Date().toISOString()
        });
    }
});

export default router;