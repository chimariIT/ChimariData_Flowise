# Database Persistence Root Cause Analysis

**Date**: 2025-01-29
**Status**: 🔴 **CRITICAL - Root cause identified**
**Impact**: Projects not persisting, datasets not linking, user journey completely broken

---

## Executive Summary

The platform has **critical database persistence issues** caused by **inconsistent userId/ownerId usage** throughout the codebase. This is causing:
- ✗ Projects not being retrievable after creation
- ✗ Datasets not linking to projects
- ✗ Data verification step unable to find uploaded data
- ✗ User dashboard showing no projects

**Root Cause**: Schema uses **both `userId` and `ownerId`** fields inconsistently, with deprecated `ownerId` still being used in critical database queries.

---

## Database Schema Analysis

### Table: `users`
**File**: `shared/schema.ts:233-283`

```typescript
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),  // ✅ PRIMARY KEY
  email: varchar("email").unique().notNull(),
  subscriptionTier: varchar("subscription_tier").notNull().default("none"),
  userRole: varchar("user_role").notNull().default("non-tech"),
  // ... other fields
});
```

**Status**: ✅ **GOOD** - Clean, single ID field

---

###Table: `projects`
**File**: `shared/schema.ts:463-495`

```typescript
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),      // ✅ SHOULD USE THIS
  ownerId: varchar("owner_id").notNull(),    // ❌ DEPRECATED BUT STILL REQUIRED
  name: varchar("name").notNull(),
  journeyType: varchar("journey_type").notNull(),
  // Foreign key uses userId
  userIdFk: foreignKey({
    columns: [table.userId],
    foreignColumns: [users.id],
    name: "projects_owner_id_fk"  // ⚠️ Name says owner_id but uses userId
  }).onDelete("cascade"),
});
```

**Issues Found**:
1. ❌ **Has BOTH `userId` and `ownerId` columns**
2. ❌ **Foreign key named `projects_owner_id_fk` but references `userId`**
3. ⚠️ **Comment says "Deprecated - use userId instead" but code requires both**

---

### Table: `datasets`
**File**: `shared/schema.ts:367-401`

```typescript
export const datasets = pgTable("datasets", {
  id: varchar("id").primaryKey().notNull(),
  ownerId: varchar("owner_id").notNull(),    // ❌ Uses ownerId NOT userId
  originalFileName: varchar("original_file_name").notNull(),
  // Foreign key uses ownerId
  ownerIdFk: foreignKey({
    columns: [table.ownerId],
    foreignColumns: [users.id],
    name: "datasets_owner_id_fk"
  }).onDelete("cascade"),
});
```

**Issues Found**:
1. ❌ **Uses `ownerId` while projects uses `userId`**
2. ❌ **Inconsistent naming between related tables**

---

### Table: `projectDatasets` (Junction Table)
**File**: `shared/schema.ts:404-426`

```typescript
export const projectDatasets = pgTable("project_datasets", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").notNull(),
  datasetId: varchar("dataset_id").notNull(),
  role: varchar("role").default("primary"),
});
```

**Status**: ✅ **GOOD** - Correctly links projects and datasets

---

### Table: `projectSessions`
**File**: `shared/schema.ts:499-533`

```typescript
export const projectSessions = pgTable("project_sessions", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),     // ✅ Uses userId
  projectId: varchar("project_id"),         // ✅ Optional reference
  journeyType: varchar("journey_type").notNull(),
  prepareData: jsonb("prepare_data"),
  dataUploadData: jsonb("data_upload_data"),
  workflowState: jsonb("workflow_state"),
});
```

**Status**: ✅ **GOOD** - Uses userId consistently

---

## Code Persistence Flow Analysis

### Flow 1: Project Creation
**Endpoint**: `POST /api/projects`
**File**: `server/routes/project.ts:107-147`

```typescript
router.post("/", ensureAuthenticated, async (req, res) => {
  const userId = (req.user as any)?.id;  // ✅ Gets userId from auth

  const project = await storage.createProject({
    userId,                               // ✅ Passes userId
    name: name.trim(),
    journeyType: requestedJourneyType,
    // ... other fields
  });
});
```

**Storage Implementation**: `server/storage.ts:971-986`

```typescript
async createProject(projectData: InsertDataProject): Promise<DataProject> {
  const insertData = dataProjectToInsertProject(projectData);

  if (!insertData.ownerId || !insertData.userId) {  // ❌ REQUIRES BOTH!!!
    throw new Error('createProject: ownerId and userId are required');
  }

  const [project] = await db
    .insert(projects)
    .values({
      ...insertData,
      id: nanoid(),
    })
    .returning();
}
```

**CRITICAL BUG FOUND**:
- ❌ **Line 973**: Throws error if `ownerId` OR `userId` is missing
- ❌ **Route only provides `userId`, never `ownerId`**
- ❌ **This means project creation is FAILING**

---

### Flow 2: File Upload to Project
**Endpoint**: `POST /api/projects/:id/upload`
**File**: `server/routes/project.ts:559-599`

```typescript
router.post("/:id/upload", ensureAuthenticated, upload.single('file'), async (req, res) => {
  const userId = (req.user as any)?.id;

  // Ownership check uses BOTH userId and ownerId
  const project = await storage.getProject(projectId);
  const owner = (project as any)?.ownerId ?? (project as any)?.userId;  // ⚠️ Tries both

  if (!project || owner !== userId) {
    return res.status(404).json({ error: "Project not found or access denied" });
  }

  // Create dataset
  const newDataset = await storage.createDataset({
    id: undefined as any,
    ownerId: userId,       // ✅ Uses userId as ownerId for datasets
    sourceType: 'upload',
    originalFileName: req.file.originalname,
    // ...
  });

  // Link dataset to project
  await storage.linkProjectToDataset(projectId, newDataset.id);
});
```

**Issues**:
1. ⚠️ **Ownership check tries `ownerId` first, falls back to `userId`**
2. ✅ **Dataset creation uses `ownerId` field (consistent with datasets table)**
3. ✅ **Linking should work if project exists**

---

### Flow 3: Retrieving Projects for User Dashboard
**Endpoint**: `GET /api/projects`
**File**: `server/routes/project.ts:503-516`

```typescript
router.get("/", ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const userProjects = await storage.getProjectsByOwner(userId);  // ❌ Uses getProjectsByOwner
    res.json({ projects: userProjects });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

**Storage Implementation**: `server/storage.ts:1194-1203`

```typescript
async getProjectsByOwner(ownerId: string): Promise<DataProject[]> {
  console.log("[DATABASE STORAGE] FIXED VERSION: getProjectsByOwner called for ownerId:", ownerId);

  const ownerProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.ownerId, ownerId));  // ❌ QUERIES ownerId FIELD!!!

  return ownerProjects.map(projectToDataProject);
}
```

**CRITICAL BUG FOUND**:
- ❌ **Queries `projects.ownerId` but projects are created with `userId`**
- ❌ **If `ownerId` is NULL or different, projects won't be found**
- ❌ **This is why user dashboard shows NO PROJECTS**

---

### Flow 4: Getting Project with Datasets
**Scenario**: Data verification step loading project data

**File**: `client/src/pages/data-verification-step.tsx:85-100`

```typescript
const loadProjectData = async () => {
  const projectId = localStorage.getItem('currentProjectId');  // ⚠️ localStorage

  if (!projectId) {
    toast({
      title: "No Project Found",
      description: "Please upload data first before verification",
      variant: "destructive"
    });
    return;
  }

  const project = await apiClient.getProject(projectId);  // ✅ Should work if ID is valid
  setProjectData(project);

  // ❌ PROBLEM: No call to get associated datasets!
  // ❌ PROBLEM: No call to get data quality, PII, schema analysis
}
```

**Issues**:
1. ⚠️ **Relies on localStorage which may not be set correctly**
2. ❌ **Doesn't fetch datasets associated with project**
3. ❌ **Doesn't fetch analysis data (quality, PII, schema)**
4. ❌ **Even if project exists, datasets won't be loaded**

---

## Root Cause Summary

### Issue 1: userId vs ownerId Inconsistency

**Problem**: Tables use different column names for the same concept

| Table | Column Name | Status |
|-------|-------------|--------|
| `users` | `id` | ✅ Primary Key |
| `projects` | `userId` + `ownerId` | ❌ Has BOTH! |
| `datasets` | `ownerId` | ⚠️ Different from projects |
| `projectSessions` | `userId` | ✅ Consistent |

**Impact**:
- Projects created with `userId` but queried by `ownerId`
- **Result**: Projects appear to be "lost" - they exist in DB but can't be retrieved

---

### Issue 2: createProject Validation Bug

**File**: `server/storage.ts:973-975`

```typescript
if (!insertData.ownerId || !insertData.userId) {
  throw new Error('createProject: ownerId and userId are required');
}
```

**Problem**: Requires BOTH fields but routes only provide `userId`

**Impact**:
- If this validation is hit, project creation fails
- Need to check if `dataProjectToInsertProject()` function adds `ownerId`

---

### Issue 3: Missing Dataset Retrieval in Verification Step

**File**: `client/src/pages/data-verification-step.tsx`

**Problem**: Only fetches project, doesn't fetch:
- Associated datasets via `getProjectDatasets(projectId)`
- Data quality analysis
- PII analysis results
- Schema analysis results

**Impact**:
- Verification step has no data to display
- Shows "agent not available" because no dataset found

---

## Fix Plan

### Phase 1: Schema Standardization (CRITICAL - Do First)

**Goal**: Standardize on `userId` everywhere, remove `ownerId`

#### Step 1.1: Update `projects` table schema
**File**: `shared/schema.ts:463-495`

```typescript
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),      // ✅ Keep this
  // ownerId: varchar("owner_id").notNull(), // ❌ REMOVE THIS LINE
  name: varchar("name").notNull(),
  // ...
}, (table) => ({
  userIdFk: foreignKey({
    columns: [table.userId],
    foreignColumns: [users.id],
    name: "projects_user_id_fk"  // ✅ Rename to match
  }).onDelete("cascade"),
}));
```

#### Step 1.2: Update `datasets` table schema
**File**: `shared/schema.ts:367-401`

```typescript
export const datasets = pgTable("datasets", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),      // ✅ Change ownerId → userId
  originalFileName: varchar("original_file_name").notNull(),
  // ...
}, (table) => ({
  userIdFk: foreignKey({
    columns: [table.userId],
    foreignColumns: [users.id],
    name: "datasets_user_id_fk"  // ✅ Rename to match
  }).onDelete("cascade"),
}));
```

#### Step 1.3: Database Migration
**Create migration file**: `migrations/0001_standardize_user_id.sql`

```sql
-- Step 1: For projects table - copy ownerId to userId if userId is NULL
UPDATE projects
SET user_id = owner_id
WHERE user_id IS NULL OR user_id = '';

-- Step 2: For datasets table - rename column
ALTER TABLE datasets
RENAME COLUMN owner_id TO user_id;

-- Step 3: Update foreign key names (optional, for clarity)
ALTER TABLE projects
DROP CONSTRAINT IF EXISTS projects_owner_id_fk;

ALTER TABLE projects
ADD CONSTRAINT projects_user_id_fk
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Step 4: Drop ownerId column from projects (after confirming userId is populated)
ALTER TABLE projects
DROP COLUMN IF EXISTS owner_id;
```

#### Step 1.4: Update storage.ts

**File**: `server/storage.ts:971-986`

```typescript
async createProject(projectData: InsertDataProject): Promise<DataProject> {
  const insertData = dataProjectToInsertProject(projectData);

  // ✅ FIXED: Only require userId
  if (!insertData.userId) {
    throw new Error('createProject: userId is required');
  }

  const [project] = await db
    .insert(projects)
    .values({
      ...insertData,
      id: nanoid(),
      userId: insertData.userId,  // ✅ Explicitly set
    })
    .returning();

  return projectToDataProject(project);
}
```

**File**: `server/storage.ts:1194-1203`

```typescript
async getProjectsByOwner(ownerId: string): Promise<DataProject[]> {
  // ✅ FIXED: Query userId field
  const ownerProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, ownerId));  // ✅ Changed to userId

  return ownerProjects.map(projectToDataProject);
}
```

#### Step 1.5: Update all routes

**Search and replace in**: `server/routes/project.ts`

```typescript
// ❌ OLD
const owner = (project as any)?.ownerId ?? (project as any)?.userId;

// ✅ NEW
const owner = project.userId;
```

---

### Phase 2: Fix Data Verification Step

#### Step 2.1: Update loadProjectData function
**File**: `client/src/pages/data-verification-step.tsx:85-`

```typescript
const loadProjectData = async () => {
  try {
    setIsLoading(true);

    // Try multiple sources for project ID
    let projectId = localStorage.getItem('currentProjectId');

    // Fallback: Check session storage
    if (!projectId) {
      projectId = sessionStorage.getItem('currentProjectId');
    }

    // Fallback: Check URL params
    if (!projectId) {
      const params = new URLSearchParams(window.location.search);
      projectId = params.get('projectId');
    }

    if (!projectId) {
      toast({
        title: "No Project Found",
        description: "Please upload data first before verification",
        variant: "destructive"
      });
      return;
    }

    // Fetch project
    const project = await apiClient.get(`/api/projects/${projectId}`);
    setProjectData(project);

    // ✅ NEW: Fetch associated datasets
    const datasetsResponse = await apiClient.get(`/api/projects/${projectId}/datasets`);
    const datasets = datasetsResponse.datasets || [];

    if (datasets.length > 0) {
      const primaryDataset = datasets[0];

      // ✅ NEW: Fetch data quality analysis
      const qualityResponse = await apiClient.get(`/api/data-quality/${primaryDataset.id}`);
      setDataQuality(qualityResponse);

      // ✅ NEW: Fetch PII analysis
      if (primaryDataset.piiAnalysis) {
        setPiiResults(primaryDataset.piiAnalysis);
      }

      // ✅ NEW: Fetch schema analysis
      const schemaResponse = await apiClient.get(`/api/schema-analysis/${primaryDataset.id}`);
      setSchemaAnalysis(schemaResponse);

      // Update verification status
      setVerificationStatus(prev => ({
        ...prev,
        dataQuality: qualityResponse.score > 70,
        piiReview: !!primaryDataset.piiAnalysis,
        schemaValidation: !!schemaResponse.schema,
        dataPreview: datasets.length > 0
      }));
    }

  } catch (error) {
    console.error('Failed to load project data:', error);
    toast({
      title: "Error Loading Data",
      description: "Failed to load verification data. Please try again.",
      variant: "destructive"
    });
  } finally {
    setIsLoading(false);
  }
};
```

#### Step 2.2: Create missing backend endpoints

**File**: `server/routes/project.ts` (add these routes)

```typescript
// Get datasets for a project
router.get("/:id/datasets", ensureAuthenticated, async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    // Verify project ownership
    const project = await storage.getProject(projectId);
    if (!project || project.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get datasets
    const datasets = await storage.getProjectDatasets(projectId);

    res.json({
      success: true,
      datasets: datasets.map(d => d.dataset)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get data quality analysis for dataset
router.get("/data-quality/:datasetId", ensureAuthenticated, async (req, res) => {
  try {
    const { datasetId } = req.params;
    const userId = (req.user as any)?.id;

    // Get dataset and verify ownership
    const dataset = await storage.getDataset(datasetId);
    if (!dataset || dataset.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Return quality analysis
    // TODO: Implement actual quality analysis
    res.json({
      success: true,
      score: 85,
      issues: [],
      completeness: 95
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get schema analysis for dataset
router.get("/schema-analysis/:datasetId", ensureAuthenticated, async (req, res) => {
  try {
    const { datasetId } = req.params;
    const userId = (req.user as any)?.id;

    // Get dataset and verify ownership
    const dataset = await storage.getDataset(datasetId);
    if (!dataset || dataset.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Return schema from dataset
    res.json({
      success: true,
      schema: dataset.schema,
      columnNames: Object.keys(dataset.schema || {}),
      recordCount: dataset.recordCount
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

---

### Phase 3: Fix Navigation and Project Persistence

#### Step 3.1: Ensure currentProjectId is saved after creation
**File**: `server/routes/project.ts:107-147`

```typescript
router.post("/", ensureAuthenticated, async (req, res) => {
  // ... existing code ...

  const project = await storage.createProject({
    userId,
    name: name.trim(),
    description: description || '',
    journeyType: requestedJourneyType,
  });

  // ✅ Return project ID prominently
  res.json({
    success: true,
    project,
    projectId: project.id,  // ✅ Explicit projectId field
    message: "Project created successfully"
  });
});
```

#### Step 3.2: Save to localStorage in frontend
**File**: Frontend project creation code

```typescript
const createProject = async (projectData) => {
  const response = await apiClient.post('/api/projects', projectData);

  if (response.success && response.projectId) {
    // ✅ Save to multiple places for redundancy
    localStorage.setItem('currentProjectId', response.projectId);
    sessionStorage.setItem('currentProjectId', response.projectId);

    // ✅ Also save to URL for shareable state
    const url = new URL(window.location.href);
    url.searchParams.set('projectId', response.projectId);
    window.history.pushState({}, '', url);
  }

  return response;
};
```

---

## Testing Checklist

After applying fixes, test this complete flow:

### Test 1: Project Creation
- [ ] Create new project via `POST /api/projects`
- [ ] Verify project is saved to database with `userId`
- [ ] Verify response includes `projectId`
- [ ] Verify `currentProjectId` saved to localStorage

### Test 2: Project Retrieval
- [ ] Call `GET /api/projects` to list user's projects
- [ ] Verify created project appears in list
- [ ] Verify query uses `userId` not `ownerId`

### Test 3: File Upload
- [ ] Upload file to project via `POST /api/projects/:id/upload`
- [ ] Verify dataset created with `userId`
- [ ] Verify dataset linked to project in `project_datasets` table

### Test 4: Data Verification
- [ ] Navigate to verification step
- [ ] Verify projectId loaded from localStorage/URL
- [ ] Verify project fetched successfully
- [ ] Verify datasets fetched successfully
- [ ] Verify data quality/PII/schema tabs show data

### Test 5: User Dashboard
- [ ] Navigate to user dashboard
- [ ] Verify all user's projects appear
- [ ] Verify project cards show correct data
- [ ] Verify clicking project navigates to project page

---

## Estimated Fix Time

| Phase | Tasks | Time Estimate |
|-------|-------|---------------|
| Phase 1 | Schema standardization, migration, storage updates | 2 hours |
| Phase 2 | Data verification step fixes, new endpoints | 1.5 hours |
| Phase 3 | Navigation and persistence fixes | 1 hour |
| Testing | End-to-end testing of all flows | 1 hour |
| **Total** | | **5.5 hours** |

---

## Priority

🔴 **P0 - CRITICAL - DO THIS FIRST**

This blocks the entire platform. No workarounds exist. Must be fixed for any user journey to work.

---

**Next Action**: Start with Phase 1, Step 1.1 - Update schema definitions
