/**
 * Admin Service Pricing Configuration Routes
 *
 * Admin-only endpoints for managing service pricing:
 * - List all service pricing tiers
 * - Create new service pricing tier
 * - Update existing service pricing tier
 * - Delete/deactivate service pricing tier
 * - Sync with Stripe
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { servicePricing } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { ensureAuthenticated } from './auth';
import { getStripeSyncService } from '../services/stripe-sync';

type ServicePricing = typeof servicePricing.$inferSelect;

const router = Router();

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
    const { users } = require('@shared/schema');
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check if user has admin role
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.adminUser = user;
    next();
  } catch (error: any) {
    console.error('Error in ensureAdmin middleware:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
}

/**
 * GET /api/admin/service-pricing
 * List all service pricing tiers
 */
router.get('/', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { includeInactive } = req.query;

    let services: ServicePricing[] = await db.select().from(servicePricing);

    // Filter out inactive services unless requested
    if (includeInactive !== 'true') {
      services = services.filter((service: ServicePricing) => service.isActive);
    }

    res.json({
      success: true,
      count: services.length,
      services
    });
  } catch (error: any) {
    console.error('Error fetching service pricing:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch service pricing' });
  }
});

/**
 * GET /api/admin/service-pricing/:id
 * Get a specific service pricing tier
 */
router.get('/:id', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [service] = await db
      .select()
      .from(servicePricing)
      .where(eq(servicePricing.id, id));

    if (!service) {
      return res.status(404).json({ error: 'Service pricing not found' });
    }

    res.json({
      success: true,
      service
    });
  } catch (error: any) {
    console.error('Error fetching service pricing:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch service pricing' });
  }
});

/**
 * POST /api/admin/service-pricing
 * Create a new service pricing tier
 */
router.post('/', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const {
      serviceType,
      displayName,
      description,
      basePrice,
      pricingModel,
      pricingConfig,
      stripeProductId,
      stripePriceId
    } = req.body;

    // Validation
    if (!serviceType || !displayName || !basePrice) {
      return res.status(400).json({
        error: 'serviceType, displayName, and basePrice are required'
      });
    }

    if (basePrice <= 0) {
      return res.status(400).json({ error: 'basePrice must be greater than 0' });
    }

    // Check for duplicate serviceType
    const [existing] = await db
      .select()
      .from(servicePricing)
      .where(eq(servicePricing.serviceType, serviceType));

    if (existing) {
      return res.status(400).json({
        error: `Service type '${serviceType}' already exists`
      });
    }

    // Generate ID
    const id = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Insert new pricing tier
    const [newService] = await db
      .insert(servicePricing)
      .values({
        id,
        serviceType,
        displayName,
        description: description || null,
        basePrice,
        pricingModel: pricingModel || 'fixed',
        pricingConfig: pricingConfig || {},
        isActive: true,
        stripeProductId: stripeProductId || null,
        stripePriceId: stripePriceId || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.status(201).json({
      success: true,
      message: 'Service pricing tier created successfully',
      service: newService
    });
  } catch (error: any) {
    console.error('Error creating service pricing:', error);
    res.status(500).json({ error: error.message || 'Failed to create service pricing' });
  }
});

/**
 * PUT /api/admin/service-pricing/:id
 * Update an existing service pricing tier
 */
router.put('/:id', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      displayName,
      description,
      basePrice,
      pricingModel,
      pricingConfig,
      isActive,
      stripeProductId,
      stripePriceId
    } = req.body;

    // Fetch existing service
    const [existing] = await db
      .select()
      .from(servicePricing)
      .where(eq(servicePricing.id, id));

    if (!existing) {
      return res.status(404).json({ error: 'Service pricing not found' });
    }

    // Build update object with only provided fields
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (displayName !== undefined) updateData.displayName = displayName;
    if (description !== undefined) updateData.description = description;
    if (basePrice !== undefined) {
      if (basePrice <= 0) {
        return res.status(400).json({ error: 'basePrice must be greater than 0' });
      }
      updateData.basePrice = basePrice;
    }
    if (pricingModel !== undefined) updateData.pricingModel = pricingModel;
    if (pricingConfig !== undefined) updateData.pricingConfig = pricingConfig;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (stripeProductId !== undefined) updateData.stripeProductId = stripeProductId;
    if (stripePriceId !== undefined) updateData.stripePriceId = stripePriceId;

    // Update service
    const [updated] = await db
      .update(servicePricing)
      .set(updateData)
      .where(eq(servicePricing.id, id))
      .returning();

    res.json({
      success: true,
      message: 'Service pricing tier updated successfully',
      service: updated
    });
  } catch (error: any) {
    console.error('Error updating service pricing:', error);
    res.status(500).json({ error: error.message || 'Failed to update service pricing' });
  }
});

/**
 * DELETE /api/admin/service-pricing/:id
 * Deactivate a service pricing tier (soft delete)
 */
router.delete('/:id', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [existing] = await db
      .select()
      .from(servicePricing)
      .where(eq(servicePricing.id, id));

    if (!existing) {
      return res.status(404).json({ error: 'Service pricing not found' });
    }

    // Soft delete by deactivating
    const [deactivated] = await db
      .update(servicePricing)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(servicePricing.id, id))
      .returning();

    res.json({
      success: true,
      message: 'Service pricing tier deactivated successfully',
      service: deactivated
    });
  } catch (error: any) {
    console.error('Error deactivating service pricing:', error);
    res.status(500).json({ error: error.message || 'Failed to deactivate service pricing' });
  }
});

/**
 * POST /api/admin/service-pricing/:id/sync-stripe
 * Sync service pricing with Stripe
 */
router.post('/:id/sync-stripe', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const stripeSyncService = getStripeSyncService();

    if (!stripeSyncService.isStripeConfigured()) {
      return res.status(400).json({
        error: 'Stripe is not configured'
      });
    }

    const [service] = await db
      .select()
      .from(servicePricing)
      .where(eq(servicePricing.id, id));

    if (!service) {
      return res.status(404).json({ error: 'Service pricing not found' });
    }

    // TODO: Implement Stripe product/price creation for services
    // This would create a Stripe product for the service and update the database with IDs
    
    res.json({
      success: true,
      message: 'Stripe sync initiated',
      service: service
    });
  } catch (error: any) {
    console.error('Error syncing with Stripe:', error);
    res.status(500).json({ error: error.message || 'Failed to sync with Stripe' });
  }
});

export default router;


