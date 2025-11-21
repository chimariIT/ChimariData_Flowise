/**
 * Admin Consultation Pricing Configuration Routes
 *
 * Admin-only endpoints for managing consultation pricing:
 * - List all pricing tiers
 * - Create new pricing tier
 * - Update existing pricing tier
 * - Delete/deactivate pricing tier
 */

import { Router } from 'express';
import { db } from '../db';
import { consultationPricing, users } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { ensureAuthenticated } from './auth';

const router = Router();

type ConsultationPricing = typeof consultationPricing.$inferSelect;

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
 * GET /api/admin/consultation-pricing
 * List all consultation pricing tiers
 */
router.get('/', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const { includeInactive } = req.query;

    let pricingTiers: ConsultationPricing[] = await db
      .select()
      .from(consultationPricing)
      .orderBy(consultationPricing.sortOrder, desc(consultationPricing.createdAt));

    // Filter out inactive tiers unless requested
    if (includeInactive !== 'true') {
      pricingTiers = pricingTiers.filter((tier: ConsultationPricing) => tier.isActive);
    }

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

/**
 * GET /api/admin/consultation-pricing/:id
 * Get a specific pricing tier
 */
router.get('/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [tier] = await db
      .select()
      .from(consultationPricing)
      .where(eq(consultationPricing.id, id));

    if (!tier) {
      return res.status(404).json({ error: 'Pricing tier not found' });
    }

    res.json({
      success: true,
      pricingTier: tier
    });

  } catch (error: any) {
    console.error('Error fetching pricing tier:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch pricing tier' });
  }
});

/**
 * POST /api/admin/consultation-pricing
 * Create a new consultation pricing tier
 */
router.post('/', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    const {
      consultationType,
      displayName,
      description,
      basePrice,
      expertLevel,
      durationHours,
      features,
      sortOrder
    } = req.body;

    // Validation
    if (!consultationType || !displayName || !basePrice) {
      return res.status(400).json({
        error: 'consultationType, displayName, and basePrice are required'
      });
    }

    if (basePrice <= 0) {
      return res.status(400).json({ error: 'basePrice must be greater than 0' });
    }

    // Check for duplicate consultationType
    const [existing] = await db
      .select()
      .from(consultationPricing)
      .where(eq(consultationPricing.consultationType, consultationType));

    if (existing) {
      return res.status(400).json({
        error: `Consultation type '${consultationType}' already exists`
      });
    }

    // Generate ID
    const id = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Insert new pricing tier
    const [newTier] = await db
      .insert(consultationPricing)
      .values({
        id,
        consultationType,
        displayName,
        description: description || null,
        basePrice,
        expertLevel: expertLevel || 'senior',
        durationHours: durationHours || 1,
        features: features || null,
        isActive: true,
        sortOrder: sortOrder || 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: adminId,
        updatedBy: adminId,
      })
      .returning();

    res.status(201).json({
      success: true,
      message: 'Consultation pricing tier created successfully',
      pricingTier: newTier
    });

  } catch (error: any) {
    console.error('Error creating pricing tier:', error);
    res.status(500).json({ error: error.message || 'Failed to create pricing tier' });
  }
});

/**
 * PUT /api/admin/consultation-pricing/:id
 * Update an existing consultation pricing tier
 */
router.put('/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    const { id } = req.params;
    const {
      displayName,
      description,
      basePrice,
      expertLevel,
      durationHours,
      features,
      isActive,
      sortOrder
    } = req.body;

    // Fetch existing tier
    const [existing] = await db
      .select()
      .from(consultationPricing)
      .where(eq(consultationPricing.id, id));

    if (!existing) {
      return res.status(404).json({ error: 'Pricing tier not found' });
    }

    // Build update object with only provided fields
    const updateData: any = {
      updatedAt: new Date(),
      updatedBy: adminId,
    };

    if (displayName !== undefined) updateData.displayName = displayName;
    if (description !== undefined) updateData.description = description;
    if (basePrice !== undefined) {
      if (basePrice <= 0) {
        return res.status(400).json({ error: 'basePrice must be greater than 0' });
      }
      updateData.basePrice = basePrice;
    }
    if (expertLevel !== undefined) updateData.expertLevel = expertLevel;
    if (durationHours !== undefined) updateData.durationHours = durationHours;
    if (features !== undefined) updateData.features = features;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

    // Update tier
    const [updated] = await db
      .update(consultationPricing)
      .set(updateData)
      .where(eq(consultationPricing.id, id))
      .returning();

    res.json({
      success: true,
      message: 'Consultation pricing tier updated successfully',
      pricingTier: updated
    });

  } catch (error: any) {
    console.error('Error updating pricing tier:', error);
    res.status(500).json({ error: error.message || 'Failed to update pricing tier' });
  }
});

/**
 * DELETE /api/admin/consultation-pricing/:id
 * Deactivate a consultation pricing tier (soft delete)
 */
router.delete('/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    const { id } = req.params;

    const [existing] = await db
      .select()
      .from(consultationPricing)
      .where(eq(consultationPricing.id, id));

    if (!existing) {
      return res.status(404).json({ error: 'Pricing tier not found' });
    }

    // Soft delete by deactivating
    const [deactivated] = await db
      .update(consultationPricing)
      .set({
        isActive: false,
        updatedAt: new Date(),
        updatedBy: adminId,
      })
      .where(eq(consultationPricing.id, id))
      .returning();

    res.json({
      success: true,
      message: 'Consultation pricing tier deactivated successfully',
      pricingTier: deactivated
    });

  } catch (error: any) {
    console.error('Error deactivating pricing tier:', error);
    res.status(500).json({ error: error.message || 'Failed to deactivate pricing tier' });
  }
});

/**
 * POST /api/admin/consultation-pricing/:id/activate
 * Reactivate a deactivated pricing tier
 */
router.post('/:id/activate', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    const { id } = req.params;

    const [existing] = await db
      .select()
      .from(consultationPricing)
      .where(eq(consultationPricing.id, id));

    if (!existing) {
      return res.status(404).json({ error: 'Pricing tier not found' });
    }

    const [activated] = await db
      .update(consultationPricing)
      .set({
        isActive: true,
        updatedAt: new Date(),
        updatedBy: adminId,
      })
      .where(eq(consultationPricing.id, id))
      .returning();

    res.json({
      success: true,
      message: 'Consultation pricing tier activated successfully',
      pricingTier: activated
    });

  } catch (error: any) {
    console.error('Error activating pricing tier:', error);
    res.status(500).json({ error: error.message || 'Failed to activate pricing tier' });
  }
});

/**
 * POST /api/admin/consultation-pricing/seed-defaults
 * Seed default consultation pricing tiers (for initial setup)
 */
router.post('/seed-defaults', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const adminId = req.adminUser?.id;

    const defaultTiers = [
      {
        id: `cp_default_standard`,
        consultationType: 'standard',
        displayName: 'Standard Consultation',
        description: 'One-on-one consultation with a senior data expert for strategic guidance',
        basePrice: 29900, // $299
        expertLevel: 'senior',
        durationHours: 1,
        features: JSON.stringify([
          '1-hour video consultation',
          'Senior expert guidance',
          'Analysis review and recommendations',
          'Follow-up email summary',
          '7-day Q&A support'
        ]),
        isActive: true,
        sortOrder: 1,
        createdBy: adminId,
        updatedBy: adminId,
      },
      {
        id: `cp_default_premium`,
        consultationType: 'premium',
        displayName: 'Premium Consultation',
        description: 'Extended consultation with principal-level expert and custom analysis',
        basePrice: 59900, // $599
        expertLevel: 'principal',
        durationHours: 2,
        features: JSON.stringify([
          '2-hour video consultation',
          'Principal expert guidance',
          'Custom analysis deep-dive',
          'Detailed recommendations report',
          '30-day Q&A support',
          'Code review and optimization'
        ]),
        isActive: true,
        sortOrder: 2,
        createdBy: adminId,
        updatedBy: adminId,
      },
      {
        id: `cp_default_enterprise`,
        consultationType: 'enterprise',
        displayName: 'Enterprise Consultation',
        description: 'Comprehensive consultation package with team collaboration and ongoing support',
        basePrice: 149900, // $1499
        expertLevel: 'principal',
        durationHours: 4,
        features: JSON.stringify([
          '4-hour consultation (split sessions)',
          'Principal expert + team collaboration',
          'Full analysis audit and optimization',
          'Implementation roadmap',
          '90-day ongoing support',
          'Custom model development',
          'Team training session'
        ]),
        isActive: true,
        sortOrder: 3,
        createdBy: adminId,
        updatedBy: adminId,
      }
    ];

    // Insert defaults (ignore if already exist)
    const inserted = [];
    for (const tier of defaultTiers) {
      const [existing] = await db
        .select()
        .from(consultationPricing)
        .where(eq(consultationPricing.consultationType, tier.consultationType));

      if (!existing) {
        const [newTier] = await db
          .insert(consultationPricing)
          .values({
            ...tier,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        inserted.push(newTier);
      }
    }

    res.json({
      success: true,
      message: `Seeded ${inserted.length} default consultation pricing tiers`,
      insertedCount: inserted.length,
      pricingTiers: inserted
    });

  } catch (error: any) {
    console.error('Error seeding default pricing tiers:', error);
    res.status(500).json({ error: error.message || 'Failed to seed default pricing tiers' });
  }
});

export default router;
