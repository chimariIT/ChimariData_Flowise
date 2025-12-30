# Sustainable State Management Architecture Proposal

## Problem Statement

The current approach using JSONB deep merges with atomic updates and complex locking mechanisms is:
- **Complex**: Multiple code paths trying to handle race conditions
- **Fragile**: Race conditions between frontend PATCH calls and backend atomic JSONB updates
- **Hard to debug**: Lock status lost during concurrent updates
- **Not scalable**: Adding new locked fields requires more special-case logic

## Proposed Solution: Hybrid Approach with Clear Separation of Concerns

### Core Principle: **Separate Mutable State from Immutable/Locked Data**

Instead of trying to lock fields within a JSONB structure, we separate concerns:

1. **Mutable State** → JSONB `journeyProgress` (simple updates)
2. **Immutable/Locked Data** → Separate columns or dedicated endpoints
3. **Critical Operations** → Dedicated endpoints (never go through generic PATCH)

---

## Architecture Design

### 1. Split State Storage

```
projects table:
├── journey_progress (JSONB)              → Mutable state only
│   ├── currentStep
│   ├── stepTimestamps
│   ├── completedSteps
│   └── [other mutable fields]
│
├── requirements_document (JSONB)         → Locked, immutable after generation
│   └── [requirementsDocument content]
│
├── requirements_locked (BOOLEAN)         → Simple boolean flag
├── requirements_locked_at (TIMESTAMP)    → Audit trail
│
└── joined_data (JSONB)                   → Large, immutable after creation
    └── [joinedData content]
```

**OR** (if we want to keep JSONB but simplify):

```
projects table:
├── journey_progress (JSONB)              → All state, but with clear rules
│   ├── _meta: { version, updatedAt }    → Version for optimistic locking
│   ├── _locked: { fields: [...] }       → List of locked field paths
│   └── [actual state]
```

### 2. Operation Patterns

#### Pattern A: Dedicated Endpoints for Critical Operations (RECOMMENDED)

```typescript
// ✅ GOOD: Dedicated endpoint - owns its own locking
POST /api/projects/:id/generate-requirements
  → Generates requirements
  → Sets requirements_locked = true
  → Returns success

// ✅ GOOD: Read-only, safe
GET /api/projects/:id/requirements
  → Returns requirements_document (if locked) or generates (if not)

// ✅ GOOD: Simple PATCH for mutable state only
PATCH /api/projects/:id/progress
  → Only updates: currentStep, stepTimestamps, completedSteps
  → NEVER touches requirements_document or joined_data
```

**Benefits:**
- Clear ownership: Each endpoint knows what it's responsible for
- No race conditions: Critical operations don't compete with generic PATCH
- Easier to reason about: Locking logic lives in one place
- Easier to test: Each endpoint has a single responsibility

#### Pattern B: Optimistic Locking (ALTERNATIVE)

```typescript
// Add version field to journey_progress
journey_progress._meta.version = 1

// On update:
PATCH /api/projects/:id/progress
  → Read current version
  → Check if requirements are locked (separate field)
  → If locked and trying to modify requirements → reject with 409 Conflict
  → Otherwise, increment version and update
```

**Benefits:**
- Still uses JSONB (no schema changes needed)
- Detects conflicts instead of preventing them
- Simpler than current approach

---

## Recommended Implementation Plan

### Phase 1: Immediate Fix (Minimal Changes)

**Option 1A: Protect PATCH Endpoint from Locked Fields**

```typescript
// server/routes/project.ts
router.patch('/:id/progress', async (req, res) => {
  const project = await getProject(id);
  const progress = parseJourneyProgress(project);
  
  // Define locked field paths (clear list)
  const LOCKED_FIELDS = [
    'requirementsDocument',
    'requirementsLocked',
    'requirementsLockedAt',
    'joinedData.fullData',  // Can update preview, but not fullData
  ];
  
  // Remove any locked fields from update
  const sanitizedUpdate = removeLockedFields(progressUpdate, LOCKED_FIELDS);
  
  // Simple merge - no complex logic needed
  const merged = { ...progress, ...sanitizedUpdate };
  
  await db.execute(sql`UPDATE projects SET journey_progress = ${merged}::jsonb WHERE id = ${id}`);
});
```

**Key Change:** PATCH endpoint **explicitly excludes** locked fields. Locked data can ONLY be updated via dedicated endpoints.

### Phase 2: Move to Separate Columns (Better Long-term)

```sql
-- Migration
ALTER TABLE projects 
  ADD COLUMN requirements_document JSONB,
  ADD COLUMN requirements_locked BOOLEAN DEFAULT FALSE,
  ADD COLUMN requirements_locked_at TIMESTAMP;

-- Move existing data
UPDATE projects 
SET 
  requirements_document = journey_progress->'requirementsDocument',
  requirements_locked = (journey_progress->>'requirementsLocked')::boolean,
  requirements_locked_at = (journey_progress->>'requirementsLockedAt')::timestamp
WHERE journey_progress->'requirementsDocument' IS NOT NULL;

-- Remove from JSONB
UPDATE projects
SET journey_progress = journey_progress - 'requirementsDocument' - 'requirementsLocked' - 'requirementsLockedAt';
```

**Benefits:**
- Locked data is in a separate column (can't be accidentally modified)
- JSONB only contains mutable state (simpler, faster)
- Easier to query (can index requirements_locked)
- Clear separation of concerns

### Phase 3: Add Version Field for Optimistic Locking (Optional)

```typescript
journey_progress._meta = {
  version: 1,
  updatedAt: '2025-01-01T00:00:00Z'
}

// On update, check version matches
PATCH /api/projects/:id/progress
  → Check version matches
  → If not, return 409 Conflict with current version
  → Frontend retries with new version
```

---

## Migration Strategy

### Immediate (Can do today):

1. **Simplify PATCH endpoint** to exclude locked fields
2. **Ensure dedicated endpoints** (generate-requirements, etc.) handle their own locking
3. **Remove complex merge logic** from PATCH

### Short-term (Next sprint):

1. Move `requirementsDocument` to separate column
2. Update all endpoints to use new column
3. Remove requirements logic from PATCH entirely

### Long-term (Future):

1. Consider moving other large/immutable data (joinedData.fullData) to separate storage
2. Add version field for optimistic locking if needed
3. Consider event sourcing for audit trail

---

## Code Examples

### Before (Complex):

```typescript
// Complex merge with special cases
const merged = deepMergeJourneyProgress(existing, update);
if (existing.requirementsLocked) {
  merged.requirementsDocument = existing.requirementsDocument;
  merged.requirementsLocked = true;
  // ... more special cases
}
```

### After (Simple):

```typescript
// Simple: Remove locked fields, merge rest
const LOCKED_PATHS = ['requirementsDocument', 'requirementsLocked', ...];
const sanitized = removePaths(update, LOCKED_PATHS);
const merged = { ...existing, ...sanitized };
```

### Dedicated Endpoint (Clear Ownership):

```typescript
POST /api/projects/:id/generate-requirements
  → Generate requirements
  → Store in requirements_document column
  → Set requirements_locked = true
  → Return success
  
// No race conditions because:
// 1. This endpoint owns requirements_document
// 2. PATCH endpoint never touches it
// 3. Clear separation of concerns
```

---

## Recommendation

**Start with Phase 1 (Immediate Fix):**
- Simplest change
- Fixes current issues
- No schema changes
- Can implement today

**Then move to Phase 2 (Separate Columns):**
- More sustainable long-term
- Clear separation of concerns
- Easier to maintain
- Better performance

**Consider Phase 3 (Optimistic Locking) only if:**
- We have many concurrent updates
- Conflicts are frequent
- We need audit trail

---

## Questions to Consider

1. **Do we want to keep JSONB for everything, or split to columns?**
   - Recommendation: Split (Phase 2)

2. **How important is it to prevent all race conditions vs. detect them?**
   - Current: Prevent (complex)
   - Alternative: Detect with optimistic locking (simpler)

3. **Should we add a version field now, or wait?**
   - Recommendation: Wait until we see if conflicts are still an issue after Phase 1/2

4. **Should we move joinedData.fullData to separate storage?**
   - Recommendation: Yes, if it's large (>100MB) - consider S3 or separate table

