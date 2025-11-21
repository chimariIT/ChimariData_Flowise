# Pricing Centralization - Implementation Guide

## ✅ Existing Infrastructure Found

The codebase already has substantial pricing infrastructure:

### Database Tables
1. `consultation_pricing` - Already exists in schema for consultation service pricing
   - Admin-managed consultation tiers
   - Base price, expert level, duration, features
   - Active/inactive status

### Admin Endpoints
1. `server/routes/admin-consultation-pricing.ts` - Full CRUD for consultation pricing
   - GET `/api/admin/consultation-pricing` - List tiers
   - POST `/api/admin/consultation-pricing` - Create tier
   - PUT `/api/admin/consultation-pricing/:id` - Update tier
   - DELETE `/api/admin/consultation-pricing/:id` - Deactivate tier

### Configuration Files
1. `shared/ml-llm-pricing-config.ts` - ML/LLM pricing configuration
   - Feature access by tier
   - Pricing calculators
   - Default configurations

## ❌ What's Missing

### Issue 1: Consultation Pricing Not Used
- Frontend hardcodes "$150" in `client/src/pages/pricing.tsx` line 501
- Should fetch from `/api/admin/consultation-pricing`
- Should use the consultation pricing table

### Issue 2: Pay-Per-Analysis Pricing Not Centralized
- Hardcoded "$25" in `client/src/pages/pricing.tsx` line 457
- `client/src/pages/pay-per-analysis.tsx` has dynamic pricing logic but base price is hardcoded
- Need database table for service pricing

### Issue 3: Subscription Tier Pricing Not in Database
- Currently using `shared/unified-subscription-tiers.ts`
- Need database-backed subscription tier management
- Admin API exists but not fully implemented

## Action Items

### Priority 1: Fix Consultation Pricing (5 min)
```typescript
// In client/src/pages/pricing.tsx
// Change hardcoded $150 to fetch from database
const { data: consultationPricing } = useQuery({
  queryKey: ['/api/admin/consultation-pricing'],
  queryFn: () => apiClient.get('/api/admin/consultation-pricing'),
});
const consultPrice = consultationPricing?.[0]?.basePrice / 100 || 150;
```

### Priority 2: Create Service Pricing Table
Add to schema:
```typescript
export const servicePricing = pgTable("service_pricing", {
  id: varchar("id").primaryKey().notNull(),
  serviceType: varchar("service_type").notNull().unique(), // "pay-per-analysis", "expert-consultation"
  displayName: varchar("display_name").notNull(),
  description: text("description"),
  basePrice: integer("base_price").notNull(), // in cents
  pricingModel: varchar("pricing_model").notNull(), // "fixed", "calculated"
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### Priority 3: Update Frontend
- Remove all hardcoded prices
- Fetch from API in all pricing pages
- Use actual database prices
