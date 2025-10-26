# Database Schema Constraint Review

**Date**: January 16, 2025
**Reviewer**: System Audit
**File**: `shared/schema.ts`

## Executive Summary

The database schema in `shared/schema.ts` uses Drizzle ORM with comprehensive type definitions and Zod validation. However, **foreign key constraints with cascade rules are MISSING**, which is a critical gap for data integrity and referential integrity.

## Critical Findings

### 1. ✅ GOOD: Comprehensive Indexing

The schema has excellent index coverage:
- **User-related indexes**:
  - `user_permission_idx` on `userPermissions.userId`
  - `journeys_user_id_idx`, `eligibility_checks_user_id_idx`
  - `audience_profiles_user_id_idx`

- **Project-related indexes**:
  - `project_artifact_idx` on `projectArtifacts.projectId`
  - `agent_checkpoints_project_id_idx`
  - `decision_audits_project_id_idx`
  - `generated_artifacts_project_id_idx`

- **Dataset indexes**:
  - `project_dataset_idx` on `projectDatasets.(projectId, datasetId)` (composite index)
  - `streaming_sources_dataset_id_idx`
  - `scraping_jobs_dataset_id_idx`

### 2. ❌ CRITICAL: Missing Foreign Key Constraints

**No foreign key relationships are defined**, meaning:
- Orphaned records can exist (e.g., projects without users, artifacts without projects)
- No automatic cascade delete behavior
- Database cannot enforce referential integrity

#### Required Foreign Keys:

**users table** (no FKs needed - root entity)

**userPermissions table**:
```typescript
userId: references(users.id, { onDelete: 'cascade' })
```

**projects table**:
```typescript
userId: references(users.id, { onDelete: 'cascade' })
```

**datasets table**:
```typescript
ownerId: references(users.id, { onDelete: 'cascade' })
```

**projectDatasets table** (junction table):
```typescript
projectId: references(projects.id, { onDelete: 'cascade' })
datasetId: references(datasets.id, { onDelete: 'cascade' })
```

**projectArtifacts table**:
```typescript
projectId: references(projects.id, { onDelete: 'cascade' })
parentArtifactId: references(projectArtifacts.id, { onDelete: 'set null' })
createdBy: references(users.id, { onDelete: 'set null' })
```

**agentCheckpoints table**:
```typescript
projectId: references(projects.id, { onDelete: 'cascade' })
```

**decisionAudits table**:
```typescript
projectId: references(projects.id, { onDelete: 'cascade' })
```

**conversationStates table**:
```typescript
projectId: references(projects.id, { onDelete: 'set null' }) // nullable
userId: references(users.id, { onDelete: 'cascade' })
```

**streamingSources table**:
```typescript
datasetId: references(datasets.id, { onDelete: 'cascade' })
```

**scrapingJobs table**:
```typescript
datasetId: references(datasets.id, { onDelete: 'cascade' })
```

**journeys table**:
```typescript
userId: references(users.id, { onDelete: 'cascade' })
projectId: references(projects.id, { onDelete: 'set null' }) // nullable
```

**costEstimates table**:
```typescript
userId: references(users.id, { onDelete: 'cascade' })
journeyId: references(journeys.id, { onDelete: 'set null' }) // nullable
```

### 3. ⚠️ WEAK: Subscription Tier Validation

**Current Implementation**:
```typescript
subscriptionTier: varchar("subscription_tier").default("none")
```

**Issue**: Accepts any string value - no enum enforcement at database level

**Recommendation**: Use PostgreSQL enum type
```typescript
// Define enum at schema level
export const subscriptionTierEnum = pgEnum('subscription_tier', [
  'none',
  'trial',
  'starter',
  'professional',
  'enterprise'
]);

// Use in users table
subscriptionTier: subscriptionTierEnum("subscription_tier").default("none")
```

### 4. ⚠️ INCONSISTENT: Journey Type Definitions

**Three different representations found**:

1. **Zod enum** (lines 22-23):
```typescript
export const JourneyTypeEnum = z.enum(["ai_guided", "template_based", "self_service", "consultation"]);
```

2. **Database field** (line 392):
```typescript
journeyType: varchar("journey_type")  // No enum constraint
```

3. **Journey tracking** (line 1413):
```typescript
journeyType: varchar("journey_type").notNull()  // Different table, still no enum
```

**Recommendation**: Consolidate to single source of truth using PostgreSQL enum

### 5. ✅ GOOD: Composite Index for Performance

The schema already includes important composite indexes:

```typescript
// projectDatasets table
projectDatasetIdx: index("project_dataset_idx").on(table.projectId, table.datasetId)

// eligibilityChecks table
userFeatureIdx: index("eligibility_checks_user_feature_idx").on(table.userId, table.feature)

// datasetVersions table
versionIdx: index("dataset_versions_version_idx").on(table.datasetId, table.version)
```

**Additional Composite Indexes Recommended**:
```typescript
// users table - for subscription queries
(userId, subscriptionTier)
(userId, subscriptionStatus)

// projects table - for user project filtering
(userId, journeyType)
(userId, status)

// projectArtifacts table - for artifact querying
(projectId, type)
(projectId, status)
```

### 6. ⚠️ OPTIONAL: PII Analysis Field

**Current**:
```typescript
piiAnalysis: z.object({
  detectedPII: z.array(z.string()).optional(),
  userConsent: z.boolean().optional(),
  consentTimestamp: z.date().optional(),
  userDecision: z.string().optional(),
}).optional()  // ❌ Entire object is optional
```

**Issue**: For GDPR/CCPA compliance, PII handling should be **required** when PII is detected

**Recommendation**:
```typescript
piiAnalysis: z.object({
  detectedPII: z.array(z.string()).default([]),
  userConsent: z.boolean().nullable(),  // null = not yet asked
  consentTimestamp: z.date().optional(),
  userDecision: z.enum(['anonymize', 'keep', 'remove']).nullable(),
}).default({ detectedPII: [], userConsent: null, userDecision: null })
```

## Implementation Roadmap

### Phase 1: Foreign Keys (CRITICAL - 2-3 weeks)

**Step 1**: Create migration adding foreign keys
- Use Drizzle's `references()` function
- Start with core relationships (users → projects → artifacts)
- Add cascade rules based on business logic

**Step 2**: Test cascade behavior
- Verify user deletion cascades correctly
- Test orphan prevention
- Ensure performance is acceptable

**Example Migration**:
```typescript
// migrations/005_add_foreign_keys.sql
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_user_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE;

ALTER TABLE "project_artifacts"
  ADD CONSTRAINT "project_artifacts_project_id_fk"
  FOREIGN KEY ("project_id")
  REFERENCES "projects"("id")
  ON DELETE CASCADE;

ALTER TABLE "project_artifacts"
  ADD CONSTRAINT "project_artifacts_parent_artifact_id_fk"
  FOREIGN KEY ("parent_artifact_id")
  REFERENCES "project_artifacts"("id")
  ON DELETE SET NULL;
```

### Phase 2: Enum Constraints (MEDIUM - 1 week)

**Step 1**: Define PostgreSQL enums
```typescript
export const subscriptionTierPgEnum = pgEnum('subscription_tier_enum', [
  'none', 'trial', 'starter', 'professional', 'enterprise'
]);

export const journeyTypePgEnum = pgEnum('journey_type_enum', [
  'ai_guided', 'template_based', 'self_service', 'consultation'
]);

export const userRolePgEnum = pgEnum('user_role_enum', [
  'non-tech', 'business', 'technical', 'consultation'
]);
```

**Step 2**: Migration to convert existing data
```sql
-- Create enum type
CREATE TYPE subscription_tier_enum AS ENUM ('none', 'trial', 'starter', 'professional', 'enterprise');

-- Alter column to use enum (with data conversion)
ALTER TABLE users
  ALTER COLUMN subscription_tier
  TYPE subscription_tier_enum
  USING subscription_tier::subscription_tier_enum;
```

### Phase 3: Additional Indexes (LOW - 1 week)

Add composite indexes for common query patterns:
```typescript
// In users table definition
(table) => ({
  emailIdx: index("users_email_idx").on(table.email),
  subscriptionIdx: index("users_subscription_idx").on(table.userId, table.subscriptionTier),
  statusIdx: index("users_status_idx").on(table.userId, table.subscriptionStatus),
})
```

### Phase 4: PII Compliance (MEDIUM - 1 week)

Make PII analysis required and add validation:
```typescript
// Require PII analysis when dataset contains personal data
const datasetWithRequiredPII = dataset.extend({
  piiAnalysis: z.object({
    detectedPII: z.array(z.string()),
    userConsent: z.boolean().nullable(),
    consentTimestamp: z.date().optional(),
    userDecision: z.enum(['anonymize', 'keep', 'remove']).nullable(),
  }).refine(
    (data) => {
      // If PII detected, user decision is required
      if (data.detectedPII.length > 0) {
        return data.userDecision !== null;
      }
      return true;
    },
    { message: "User decision required when PII is detected" }
  ),
});
```

## Risks and Mitigations

### Risk 1: Cascade Deletes Removing Important Data

**Mitigation**:
- Use `onDelete: 'set null'` for non-critical relationships
- Implement soft deletes for users (add `deletedAt` timestamp)
- Add admin confirmation for user deletions
- Create backup before applying FK constraints

### Risk 2: Migration Fails on Existing Orphaned Data

**Mitigation**:
- Run pre-migration cleanup script:
```sql
-- Find orphaned projects
SELECT p.* FROM projects p
LEFT JOIN users u ON p.user_id = u.id
WHERE u.id IS NULL;

-- Delete orphans or assign to system user
DELETE FROM projects WHERE user_id NOT IN (SELECT id FROM users);
```

### Risk 3: Performance Impact of Foreign Keys

**Mitigation**:
- Ensure all FK columns are indexed (already done)
- Test query performance before/after
- Use connection pooling to minimize overhead
- Monitor slow query log

## Testing Requirements

### Unit Tests
- [ ] Test cascade delete behavior for all FK relationships
- [ ] Test orphan prevention when FK constraint violations occur
- [ ] Test enum validation rejects invalid values
- [ ] Test composite index usage in queries

### Integration Tests
- [ ] Test user deletion cascades to all related entities
- [ ] Test project deletion doesn't orphan artifacts
- [ ] Test dataset deletion removes streaming sources and scraping jobs
- [ ] Test subscription tier changes are validated

### Performance Tests
- [ ] Measure query performance with FKs vs without
- [ ] Test large dataset operations (>10K records)
- [ ] Verify index usage with EXPLAIN ANALYZE

## Success Criteria

✅ Foreign keys added for all core relationships
✅ Cascade rules prevent orphaned records
✅ Enum types enforce valid values at database level
✅ No performance degradation (< 5% slowdown acceptable)
✅ All tests passing
✅ Documentation updated

## Next Steps

1. **Create migration file** (`migrations/005_add_foreign_keys.sql`)
2. **Test on development database** with realistic data
3. **Run performance benchmarks** before/after
4. **Apply to staging** environment
5. **Monitor for issues** before production deployment
6. **Apply to production** during maintenance window

---

**Estimated Effort**: 4-5 weeks total
**Priority**: P0 (Critical for data integrity)
**Dependencies**: None - can start immediately
**Owner**: Backend Team Lead
