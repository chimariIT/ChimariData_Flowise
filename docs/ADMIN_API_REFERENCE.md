# Admin API Reference

**Part of ChimariData Documentation** | [← Back to Main](../CLAUDE.md) | **Last Updated**: February 13, 2026

Comprehensive reference for all admin API endpoints. All endpoints require authentication (`ensureAuthenticated`) and admin authorization (`isAdmin: true`).

---

## Route Files Overview

| File | Mount Prefix | Endpoints | Description |
|------|-------------|-----------|-------------|
| `admin.ts` | `/api/admin` | ~80 | Core admin operations |
| `admin-billing.ts` | `/api/admin/billing` | ~25 | Billing, campaigns, analysis pricing |
| `admin-secured.ts` | `/api/admin/secured` | ~20 | Extra-secured RBAC endpoints |
| `admin-consultation.ts` | `/api/admin/consultations` | ~9 | Consultation lifecycle |
| `admin-consultation-pricing.ts` | `/api/admin/consultation-pricing` | ~7 | Consultation pricing CRUD |
| `admin-service-pricing.ts` | `/api/admin/service-pricing` | ~6 | Service pricing CRUD |

**Total**: 165+ endpoints

---

## 1. Core Admin (`admin.ts`)

### Authentication & Permissions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/permissions` | Get current user's admin role and permissions |

### User Management

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/users` | Create a new user |
| PUT | `/api/admin/users/:userId` | Update user details |
| PUT | `/api/admin/users/:userId/subscription` | Change user subscription tier |
| POST | `/api/admin/users/:userId/credits` | Award or revoke credits |
| POST | `/api/admin/users/:userId/refund` | Process refund for user |
| PUT | `/api/admin/users/:userId/trial-extension` | Extend user trial period |
| GET | `/api/admin/users/:userId/metrics` | Get user billing metrics |

### Agent Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/agents` | List all agents with status and metrics |
| GET | `/api/admin/agents/:agentId` | Get specific agent details |
| POST | `/api/admin/agents` | Register a new agent |
| PUT | `/api/admin/agents/:agentId` | Update agent configuration |
| DELETE | `/api/admin/agents/:agentId` | Unregister an agent |
| POST | `/api/admin/agents/:agentId/restart` | Restart an agent |

### Tool Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/tools` | List all registered tools |
| GET | `/api/admin/tools/:toolName` | Get specific tool details |
| POST | `/api/admin/tools` | Register a new tool |
| DELETE | `/api/admin/tools/:toolName` | Unregister a tool |
| GET | `/api/admin/tools/catalog` | Get full tool catalog |
| GET | `/api/admin/tools/by-category/:category` | Filter tools by category |
| GET | `/api/admin/tools/for-agent/:agentId` | Get tools accessible to agent |

### Agent Templates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/templates` | List all agent templates (filter by `?category=` or `?search=`) |
| GET | `/api/admin/templates/:templateId` | Get specific template |
| POST | `/api/admin/templates/:templateId/create` | Create agent from template |
| GET | `/api/admin/templates/recommendations` | Get template recommendations (`?useCase=`) |

### Journey Templates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/journey-templates` | List all journey templates |
| GET | `/api/admin/journey-templates/:templateId` | Get specific journey template |
| POST | `/api/admin/journey-templates` | Create journey template |
| PUT | `/api/admin/journey-templates/:templateId` | Update journey template |
| DELETE | `/api/admin/journey-templates/:templateId` | Delete journey template |
| POST | `/api/admin/journey-templates/:templateId/reset` | Reset template to defaults |

### Project Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/projects` | List all projects |
| GET | `/api/admin/projects/:projectId` | Get project details |
| POST | `/api/admin/projects` | Create project (admin) |
| PUT | `/api/admin/projects/:projectId` | Update project |
| DELETE | `/api/admin/projects/:projectId` | Delete project |
| POST | `/api/admin/projects/:projectId/archive` | Archive project |
| GET | `/api/admin/projects/stuck` | List stuck projects |
| POST | `/api/admin/projects/:projectId/retry` | Retry stuck project |

### System Status & Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/system/status` | Overall system status |
| GET | `/api/admin/system/initialization-status` | Server initialization status |

### Circuit Breakers

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/circuit-breakers/status` | All circuit breaker states |
| POST | `/api/admin/circuit-breakers/reset` | Reset all circuit breakers |
| GET | `/api/admin/circuit-breakers/health` | Circuit breaker health summary |

### WebSocket Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/websocket/status` | WebSocket server status |
| GET | `/api/admin/websocket/health` | WebSocket health check |
| POST | `/api/admin/websocket/reset-metrics` | Reset WebSocket metrics |

### Database Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/database/status` | Database connection status |
| GET | `/api/admin/database/health` | Database health check |
| GET | `/api/admin/database/optimization/health` | DB optimization health |
| GET | `/api/admin/database/optimization/metrics` | DB optimization metrics |
| GET | `/api/admin/database/optimization/slow-queries` | Slow query log |
| POST | `/api/admin/database/optimization/migration` | Run DB migration |

### Error Tracking

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/errors/statistics` | Error statistics summary |
| GET | `/api/admin/errors/circuit-breakers` | Error-related circuit breakers |
| POST | `/api/admin/errors/circuit-breakers/:name/reset` | Reset specific circuit breaker |

### Billing (via admin.ts)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/billing/tiers` | List subscription tiers |
| GET | `/api/admin/billing/tiers/:tier` | Get specific tier config |
| PUT | `/api/admin/billing/tiers/:tier/pricing` | Update tier pricing |
| PUT | `/api/admin/billing/tiers/:tier/quotas` | Update tier quotas |
| PUT | `/api/admin/billing/tiers/:tier/features` | Update tier features |
| GET | `/api/admin/billing/analysis-pricing` | Analysis pricing config |
| PUT | `/api/admin/billing/analysis-pricing` | Update analysis pricing |
| POST | `/api/admin/billing/estimate-cost` | Estimate analysis cost |
| GET | `/api/admin/billing/analytics/revenue` | Revenue analytics |
| GET | `/api/admin/billing/analytics/usage` | Usage analytics |

### Performance & Monitoring

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/performance/cache/metrics` | Cache performance metrics |
| POST | `/api/admin/performance/cache/clear` | Clear cache |
| GET | `/api/admin/performance/queue/metrics` | Queue metrics |
| GET | `/api/admin/monitoring/dashboard` | Monitoring dashboard data |
| GET | `/api/admin/monitoring/metrics/history` | Historical metrics |
| GET | `/api/admin/monitoring/alerts` | Active alerts |
| POST | `/api/admin/monitoring/alerts/:alertId/acknowledge` | Acknowledge alert |
| POST | `/api/admin/monitoring/alerts/:alertId/resolve` | Resolve alert |
| GET | `/api/admin/monitoring/insights` | System insights |
| GET | `/api/admin/monitoring/batch-processing` | Batch processing status |

### Customer & Billing Events

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/customers` | List all customers |
| GET | `/api/admin/quota-alerts` | Active quota alerts |
| GET | `/api/admin/billing-events` | Recent billing events |

---

## 2. Admin Billing (`admin-billing.ts`)

### Overview & Analytics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/billing/overview` | Revenue overview and metrics |
| GET | `/api/admin/billing/analytics/revenue` | Revenue analytics |
| GET | `/api/admin/billing/analytics/campaigns` | Campaign usage analytics |

### Tier Configuration

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/billing/tiers` | List all tier configurations |
| POST | `/api/admin/billing/tiers` | Create new tier |
| DELETE | `/api/admin/billing/tiers/:tierId` | Delete tier |

### Consumption Rates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/billing/consumption-rates` | Get consumption rates |
| POST | `/api/admin/billing/consumption-rates` | Update consumption rates |

### Campaign Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/billing/campaigns` | List all campaigns |
| POST | `/api/admin/billing/campaigns` | Create campaign |
| PUT | `/api/admin/billing/campaigns/:campaignId` | Update campaign |
| PUT | `/api/admin/billing/campaigns/:campaignId/toggle` | Toggle campaign active |
| DELETE | `/api/admin/billing/campaigns/:campaignId` | Delete campaign |

### Tax & Currency

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/billing/tax-config` | Get tax configuration |
| POST | `/api/admin/billing/tax-config` | Update tax configuration |
| GET | `/api/admin/billing/currency-config` | Get currency configuration |
| POST | `/api/admin/billing/currency-config` | Update currency configuration |

### Bulk Operations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/billing/bulk-operations/tier-pricing-update` | Bulk update tier pricing |
| POST | `/api/admin/billing/bulk-operations/consumption-rate-update` | Bulk update consumption rates |

### Analysis Pricing

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/billing/analysis-pricing` | Get analysis pricing config |
| PUT | `/api/admin/billing/analysis-pricing` | Update analysis pricing |
| POST | `/api/admin/billing/analysis-pricing/reset` | Reset to defaults |
| POST | `/api/admin/billing/analysis-pricing/preview` | Preview cost calculation |

### Testing

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/billing/test/calculate-cost` | Test cost calculation |
| POST | `/api/admin/billing/test/apply-campaign` | Test campaign application |

---

## 3. Admin Secured (`admin-secured.ts`)

Additional endpoints with extra RBAC validation beyond basic admin check.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/secured/permissions` | Get secured permissions |
| GET | `/api/admin/secured/dashboard` | Secured dashboard data |
| GET | `/api/admin/secured/users` | List users (secured) |
| PUT | `/api/admin/secured/users/:userId/role` | Change user role (secured) |
| GET | `/api/admin/secured/projects` | List projects (secured) |
| GET | `/api/admin/secured/agents/status` | Agent status (secured) |
| POST | `/api/admin/secured/agents/configure` | Configure agent (secured) |
| GET | `/api/admin/secured/billing/overview` | Billing overview (secured) |
| PUT | `/api/admin/secured/subscriptions/:subscriptionId` | Update subscription (secured) |
| GET | `/api/admin/secured/system/health` | System health (secured) |
| GET | `/api/admin/secured/analytics` | Analytics (secured) |
| GET | `/api/admin/secured/customers` | List customers (secured) |
| GET | `/api/admin/secured/quota-alerts` | Quota alerts (secured) |
| GET | `/api/admin/secured/billing-events` | Billing events (secured) |
| GET | `/api/admin/secured/users/:customerId/metrics` | User metrics (secured) |
| GET | `/api/admin/secured/billing/analytics/revenue` | Revenue analytics (secured) |
| GET | `/api/admin/secured/billing/analytics/usage` | Usage analytics (secured) |
| GET | `/api/admin/secured/billing/analysis-pricing` | Analysis pricing (secured) |
| POST | `/api/admin/secured/billing/analysis-pricing/preview` | Preview pricing (secured) |
| PUT | `/api/admin/secured/billing/analysis-pricing` | Update pricing (secured) |
| POST | `/api/admin/secured/billing/analysis-pricing/reset` | Reset pricing (secured) |

---

## 4. Admin Consultation (`admin-consultation.ts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/consultations/pending-quotes` | Consultations awaiting quote |
| POST | `/api/admin/consultations/:id/quote` | Send quote to client |
| GET | `/api/admin/consultations/ready-queue` | Consultations ready for assignment |
| GET | `/api/admin/consultations/my-assignments` | Current admin's assignments |
| POST | `/api/admin/consultations/:id/assign` | Assign consultation to expert |
| POST | `/api/admin/consultations/:id/schedule` | Schedule consultation session |
| POST | `/api/admin/consultations/:id/complete` | Mark consultation complete |
| GET | `/api/admin/consultations/all` | List all consultations |
| GET | `/api/admin/consultations/stats` | Consultation statistics |

---

## 5. Admin Consultation Pricing (`admin-consultation-pricing.ts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/consultation-pricing` | List all pricing tiers |
| GET | `/api/admin/consultation-pricing/:id` | Get specific pricing tier |
| POST | `/api/admin/consultation-pricing` | Create pricing tier |
| PUT | `/api/admin/consultation-pricing/:id` | Update pricing tier |
| DELETE | `/api/admin/consultation-pricing/:id` | Delete pricing tier |
| POST | `/api/admin/consultation-pricing/:id/activate` | Activate pricing tier |
| POST | `/api/admin/consultation-pricing/seed-defaults` | Seed default pricing |

---

## 6. Admin Service Pricing (`admin-service-pricing.ts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/service-pricing` | List all service pricing |
| GET | `/api/admin/service-pricing/:id` | Get specific service pricing |
| POST | `/api/admin/service-pricing` | Create service pricing |
| PUT | `/api/admin/service-pricing/:id` | Update service pricing |
| DELETE | `/api/admin/service-pricing/:id` | Delete service pricing |
| POST | `/api/admin/service-pricing/:id/sync-stripe` | Sync pricing to Stripe |

---

## Authentication Pattern

All admin endpoints use this pattern:

```typescript
router.get('/endpoint', ensureAuthenticated, async (req, res) => {
  const isAdmin = (req.user as any)?.isAdmin || false;
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  // ... endpoint logic
});
```

`admin-secured.ts` adds additional RBAC checks beyond the basic `isAdmin` flag.

---

## WebSocket Events (Admin)

Admin operations broadcast real-time events to connected clients:

| Event Type | Trigger | Data |
|-----------|---------|------|
| `agent_created` | POST `/api/admin/agents` | Agent details |
| `agent_deleted` | DELETE `/api/admin/agents/:id` | Agent ID |
| `agent_updated` | PUT `/api/admin/agents/:id` | Updated fields |
| `tool_created` | POST `/api/admin/tools` | Tool details |
| `tool_deleted` | DELETE `/api/admin/tools/:name` | Tool name |
| `analysis_pricing_updated` | PUT `/api/admin/billing/analysis-pricing` | Timestamp, updater |
| `tier_pricing_updated` | PUT `/api/admin/billing/tiers/:tier/pricing` | Timestamp, updater |
| `campaign_updated` | PUT/POST campaign endpoints | Timestamp, updater |
| `consumption_rates_updated` | POST consumption-rates | Timestamp, updater |

---

## Rate Limiting

Admin endpoints are rate-limited to **100 requests per 15 minutes** per authenticated user. Violations are logged with user email and IP address. Returns `429 Too Many Requests` with `retry-after` header.

---

**Related Documentation**:
- [Billing & Admin Guide](BILLING_ADMIN.md)
- [Admin Interface](ADMIN_INTERFACE.md)
- [Architecture Guide](ARCHITECTURE.md)
- [← Back to Main](../CLAUDE.md)
