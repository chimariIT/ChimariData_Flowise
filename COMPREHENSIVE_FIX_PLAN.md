# COMPREHENSIVE FIX PLAN - ChimariData Platform Issues

**Created**: November 5, 2025
**Status**: Ready for Implementation
**Priority**: CRITICAL - Production Blocking Issues

---

## EXECUTIVE SUMMARY

This document provides a comprehensive plan to fix the 4 critical issues identified in the ChimariData platform:

1. **Post-Login Navigation** - Users not directed to dashboard
2. **Project Lifecycle** - Missing steps and unclear workflow
3. **File Upload Retention** - Original and transformed files not persisted
4. **Agent Authentication** - Agents stuck/blocked from accessing data

**Impact**: These issues prevent the platform from functioning as a production-ready analytics service.

**Estimated Effort**: 3-4 days of focused development + 1-2 days testing

---

## ISSUE #1: POST-LOGIN NAVIGATION & DASHBOARD ACCESS

### Problem Statement
After successful login, users are redirected to the main landing page (`/`) instead of their dashboard. Users must manually click "Dashboard" to reach `/dashboard`, creating friction in the user experience.

### Root Cause
**File**: `client/src/pages/auth.tsx` and `client/src/App.tsx`

1. Login success handler redirects to `/` unconditionally
2. Protected routes don't store the intended destination before showing login
3. `routeStorage.setIntendedRoute()` exists but is never called
4. Dashboard is not the default post-authentication destination

### Current Flow
```
User Login → auth.tsx handleLogin() → res.ok check → setLocation("/") → User manually clicks Dashboard
```

### Desired Flow
```
User Login → Check intended route → Redirect to dashboard (or intended route) → User sees their workspace
```

### Solution: 3-Part Fix

#### Part 1: Update Login Handler
**File**: `client/src/pages/auth.tsx` (around line 150-180)

**Current Code**:
```typescript
const handleLogin = async (e: React.FormEvent) => {
  // ... validation ...
  const res = await apiClient.post('/api/auth/login', { email, password });
  if (res.ok) {
    const data = await res.json();
    setUser(data.user);
    setLocation("/"); // ❌ Always redirects to landing
  }
};
```

**Fixed Code**:
```typescript
import { routeStorage } from '@/lib/api';

const handleLogin = async (e: React.FormEvent) => {
  // ... validation ...
  const res = await apiClient.post('/api/auth/login', { email, password });
  if (res.ok) {
    const data = await res.json();
    setUser(data.user);

    // ✅ Check for intended route, default to dashboard
    const intendedRoute = routeStorage.getIntendedRoute();
    if (intendedRoute && intendedRoute !== '/auth') {
      setLocation(intendedRoute);
      routeStorage.clearIntendedRoute();
    } else {
      setLocation("/dashboard"); // Default to dashboard
    }
  }
};
```

#### Part 2: Store Intended Route in Protected Routes
**File**: `client/src/App.tsx` (around lines 202-265)

**Before Each Protected Route**, add intended route storage:

```typescript
// Example for dashboard route
<Route path="/dashboard">
  {() => {
    if (!user) {
      // ✅ Store intended route before redirecting to login
      routeStorage.setIntendedRoute("/dashboard");
      return <Navigate to="/auth" />;
    }
    return <UserDashboard />;
  }}
</Route>

// Repeat for all protected routes: /projects, /pricing, /settings, etc.
```

**Apply to Routes**:
- `/dashboard`
- `/projects`
- `/projects/:id`
- `/pricing`
- `/settings`
- `/admin/*`
- `/journeys/:type/*`

#### Part 3: Add Logout Endpoint
**File**: `server/routes/auth.ts` (add after login endpoint, around line 150)

```typescript
// Logout endpoint (currently returns 404)
router.post("/logout", ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;

    // Clear server-side session if using sessions
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destruction error:', err);
        }
      });
    }

    console.log(`✅ User ${userId} logged out`);
    res.json({ success: true, message: "Logged out successfully" });
  } catch (error: any) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed', details: error.message });
  }
});
```

### Testing Checklist
- [ ] Login redirects to dashboard by default
- [ ] Accessing `/projects` while logged out → stores route → login → redirects to `/projects`
- [ ] Logout endpoint returns 200 OK
- [ ] Token cleared on logout (client-side)
- [ ] Session destroyed on logout (server-side)

---

## ISSUE #2: PROJECT LIFECYCLE IMPLEMENTATION

### Problem Statement
The desired project lifecycle doesn't match the current implementation:

**Desired**: Goals → Audience → Schema → Ingestion → Exploration → Transformation → Analysis → Preview → Payment → Access

**Current**: Prepare → Project-Setup → Data → Data-Verification → Execute → Preview → Pricing → Results

**Missing**:
1. **Plan Step** - Exists but not integrated into journey wizard
2. **Transformation Step** - Tools exist but no dedicated journey step
3. **Exploration Step** - Bundled with data-verification, needs separation

### Root Cause Analysis

#### Plan Step Not Integrated
- **File Exists**: `client/src/pages/plan-step.tsx` (300+ lines, fully functional)
- **Not in JourneyWizard**: `client/src/components/JourneyWizard.tsx` steps array (lines 50-115)
- **Not in Routes**: Missing from `/journeys/:type/plan` in `App.tsx`
- **Agent Coordination Works**: Data Engineer + Data Scientist create plans via `/api/projects/:id/agent-recommendations`

#### Transformation Step Missing
- **UI Exists**: `client/src/components/data-transformation-ui.tsx`
- **API Exists**: `server/routes/data-transformation.ts`
- **Not a Journey Step**: Never integrated into multi-step wizard

#### Exploration Undersized
- **Current**: Data-verification step does schema validation + quality checks
- **Missing**: Statistical summaries, distributions, pattern detection
- **Tools Exist**: `server/services/advanced-analyzer.ts` has descriptive statistics

### Solution: 3-Part Journey Enhancement

#### Part 1: Integrate Plan Step into Journey
**File**: `client/src/components/JourneyWizard.tsx`

**Add Plan Step** (between data-verification and execute):

```typescript
const steps: JourneyStep[] = [
  // ... existing prepare, project-setup, data, data-verification ...
  {
    id: 'data-verification',
    title: 'Data Verification',
    description: 'Review data quality, schema, and privacy',
    route: `/journeys/${journeyType}/data-verification`,
    icon: CheckCircle,
    completed: false
  },
  // ✅ ADD THIS NEW STEP
  {
    id: 'plan',
    title: 'Analysis Planning',
    description: 'AI agents design analysis plan with cost estimate',
    route: `/journeys/${journeyType}/plan`,
    icon: Lightbulb, // Import from lucide-react
    completed: false
  },
  {
    id: 'execute',
    title: 'Analysis Configuration',
    description: 'Configure analysis parameters and execute',
    route: `/journeys/${journeyType}/execute`,
    icon: BarChart3,
    completed: false
  },
  // ... rest of steps
];
```

**Update Import**:
```typescript
import PlanStep from "@/pages/plan-step";
import { Lightbulb } from "lucide-react";
```

**Update Total Steps**: Now 9 steps instead of 8

#### Part 2: Add Plan Step Route
**File**: `client/src/App.tsx` (around line 230, after data-verification route)

```typescript
<Route path="/journeys/:type/data-verification">
  {(params) => user ? (
    <JourneyWizard journeyType={params.type} currentStage="data-verification" />
  ) : (
    <>
      {routeStorage.setIntendedRoute(`/journeys/${params.type}/data-verification`)}
      <Navigate to="/auth" />
    </>
  )}
</Route>

{/* ✅ ADD THIS NEW ROUTE */}
<Route path="/journeys/:type/plan">
  {(params) => user ? (
    <JourneyWizard journeyType={params.type} currentStage="plan" />
  ) : (
    <>
      {routeStorage.setIntendedRoute(`/journeys/${params.type}/plan`)}
      <Navigate to="/auth" />
    </>
  )}
</Route>

<Route path="/journeys/:type/execute">
  {(params) => user ? (
    <JourneyWizard journeyType={params.type} currentStage="execute" />
  ) : (
    <>
      {routeStorage.setIntendedRoute(`/journeys/${params.type}/execute`)}
      <Navigate to="/auth" />
    </>
  )}
</Route>
```

#### Part 3: Render Plan Step in Wizard
**File**: `client/src/components/JourneyWizard.tsx` (around line 170-200)

**Add to Render Logic**:
```typescript
const renderStepContent = () => {
  switch (currentStage) {
    case 'prepare': return <PrepareStep />;
    case 'project-setup': return <ProjectSetupStep />;
    case 'data': return <DataStep />;
    case 'data-verification': return <DataVerificationStep />;
    case 'plan': return <PlanStep />; // ✅ ADD THIS
    case 'execute': return <ExecuteStep />;
    case 'preview': return <ResultsPreviewStep />;
    case 'pricing': return <PricingStep />;
    case 'results': return <ResultsStep />;
    default: return <div>Unknown step</div>;
  }
};
```

#### Part 4: Add Transformation Step (Optional but Recommended)
**File**: Create `client/src/pages/transformation-step.tsx`

```typescript
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import DataTransformationUI from '@/components/data-transformation-ui';
import { apiClient } from '@/lib/api';

export default function TransformationStep() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [originalData, setOriginalData] = useState<any[]>([]);
  const [transformedData, setTransformedData] = useState<any[]>([]);
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Load project from session
    const loadProject = async () => {
      const session = await apiClient.get('/api/project-session');
      if (session.ok) {
        const data = await session.json();
        setProjectId(data.projectId);

        // Load project data
        const projectRes = await apiClient.get(`/api/projects/${data.projectId}`);
        if (projectRes.ok) {
          const project = await projectRes.json();
          setOriginalData(project.data || []);
          setTransformedData(project.transformedData || project.data || []);
        }
      }
    };
    loadProject();
  }, []);

  const handleTransformationApply = async (transformations: any[]) => {
    if (!projectId) return;

    // Apply transformations
    const res = await apiClient.post(`/api/projects/${projectId}/transformations`, {
      transformations
    });

    if (res.ok) {
      const result = await res.json();
      setTransformedData(result.transformedData);
    }
  };

  const handleContinue = () => {
    // Mark step complete and proceed to analysis
    setLocation(`/journeys/${journeyType}/execute`);
  };

  return (
    <div className="container mx-auto p-6">
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-4">Data Transformation</h2>
        <p className="text-muted-foreground mb-6">
          Review and apply transformations to prepare your data for analysis
        </p>

        <DataTransformationUI
          originalData={originalData}
          transformedData={transformedData}
          onApply={handleTransformationApply}
        />

        <div className="flex justify-between mt-6">
          <Button variant="outline" onClick={() => setLocation(-1)}>
            Back
          </Button>
          <Button onClick={handleContinue}>
            Continue to Analysis
          </Button>
        </div>
      </Card>
    </div>
  );
}
```

**Then add to JourneyWizard** (between plan and execute):
```typescript
{
  id: 'transformation',
  title: 'Data Transformation',
  description: 'Clean and transform data for analysis',
  route: `/journeys/${journeyType}/transformation`,
  icon: Settings,
  completed: false
}
```

#### Part 5: Update Journey State Manager
**File**: `server/services/journey-state-manager.ts`

**Update Standard Steps** (lines 26-40):
```typescript
const standardSteps: JourneyStep[] = [
  { id: 'prepare', name: 'Preparation', description: 'Define goals and questions', order: 1 },
  { id: 'project-setup', name: 'Project Setup', description: 'Create and configure project', order: 2 },
  { id: 'data', name: 'Data Upload', description: 'Upload data files', order: 3 },
  { id: 'data-verification', name: 'Data Verification', description: 'Validate quality and schema', order: 4 },
  { id: 'plan', name: 'Analysis Planning', description: 'AI agents design plan', order: 5 }, // ✅ ADD
  { id: 'transformation', name: 'Transformation', description: 'Clean and transform data', order: 6 }, // ✅ ADD (optional)
  { id: 'execute', name: 'Analysis Execution', description: 'Run analysis', order: 7 }, // Update order
  { id: 'preview', name: 'Results Preview', description: 'Preview outputs', order: 8 },
  { id: 'pricing', name: 'Pricing & Payment', description: 'Review and pay', order: 9 },
  { id: 'results', name: 'Final Results', description: 'Access artifacts', order: 10 }
];
```

### Updated Lifecycle Mapping

| Desired Step | Implementation | Status |
|--------------|----------------|--------|
| Goals/Questions | Prepare | ✅ Implemented |
| Audience/Artifacts | Project-Setup + Plan | ✅ Will be complete |
| Required Data/Schema | Data + Data-Verification | ✅ Implemented |
| Data Ingestion | Data | ✅ Implemented |
| Exploration | Data-Verification | ⚠️ Could be enhanced |
| Transformation | **NEW: Transformation Step** | ✅ Will be complete |
| Analysis | Execute | ✅ Implemented |
| Preview | Preview | ✅ Implemented |
| Payment | Pricing | ✅ Implemented |
| Access | Results | ✅ Implemented |

### Testing Checklist
- [ ] Plan step appears after data-verification in wizard
- [ ] Plan step loads multi-agent analysis plan
- [ ] User can approve/reject/modify plan
- [ ] Transformation step shows before/after data preview
- [ ] Journey state manager tracks all 9-10 steps
- [ ] Progress bar updates correctly
- [ ] Users can navigate back/forward through steps

---

## ISSUE #3: FILE UPLOAD RETENTION

### Problem Statement
Uploaded files are not persisted to disk. Only processed data is stored in the database as JSON. Original files and transformed versions are not retained for:
- Audit trails
- Re-processing
- Compliance (GDPR right to data portability)
- Download/export functionality

### Root Cause Analysis

#### Current Storage Architecture
**File**: `server/routes/project.ts` (lines 124-130, 445-557)

1. **Multer Memory Storage**: Files buffered in memory only
   ```typescript
   const upload = multer({
     storage: multer.memoryStorage(), // ❌ No disk write
     limits: { fileSize: 100 * 1024 * 1024 }
   });
   ```

2. **Processing Pipeline**: Buffer → Parse → Store JSON → Discard buffer
   ```typescript
   const processedData = await FileProcessor.processFile(req.file.buffer, ...);
   await storage.createDataset({ data: processedData.data, ... });
   // req.file.buffer is garbage collected - original file lost
   ```

3. **Database Storage**: Only parsed JSON rows stored
   ```typescript
   data: processedData.data,  // Parsed rows only
   storageUri: `mem://${project.id}/${req.file.originalname}` // Virtual URI, not real file
   ```

4. **Transformation Storage**: Transformations stored but original overwritten
   ```typescript
   transformedData: transformedData,  // New version
   transformations: transformations   // Steps applied
   // Original data field is overwritten, not versioned
   ```

#### What's Missing
- ❌ Original file not saved to disk
- ❌ Transformed file not exported to disk
- ❌ No file versioning system
- ❌ No download endpoints for original files
- ❌ GDPR data export incomplete (no original files)

### Solution: Hybrid Storage Architecture

#### Part 1: Add Disk Storage to Multer
**File**: `server/routes/project.ts`

**Replace Memory Storage** with Disk Storage:

```typescript
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

// Create uploads directory structure
const UPLOADS_DIR = process.env.UPLOAD_DIR || './uploads';
const ORIGINAL_FILES_DIR = path.join(UPLOADS_DIR, 'originals');
const TRANSFORMED_FILES_DIR = path.join(UPLOADS_DIR, 'transformed');

// Ensure directories exist on startup
const initializeUploadDirs = async () => {
  await fs.mkdir(ORIGINAL_FILES_DIR, { recursive: true });
  await fs.mkdir(TRANSFORMED_FILES_DIR, { recursive: true });
};
initializeUploadDirs();

// Configure multer with disk storage
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, ORIGINAL_FILES_DIR);
    },
    filename: (req, file, cb) => {
      const userId = (req.user as any)?.id || 'anonymous';
      const timestamp = Date.now();
      const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `${userId}_${timestamp}_${sanitized}`;
      cb(null, filename);
    }
  }),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
  fileFilter: (req, file, cb) => {
    // Accept CSV, JSON, Excel
    const allowedTypes = ['.csv', '.json', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not supported. Allowed: ${allowedTypes.join(', ')}`));
    }
  }
});
```

#### Part 2: Update Upload Handler to Store File Path
**File**: `server/routes/project.ts` (around lines 445-557)

```typescript
router.post("/upload", ensureAuthenticated, upload.single("file"), async (req, res) => {
  try {
    const userId = (req.user as any)?.id;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // ✅ File now saved to disk at req.file.path
    const originalFilePath = req.file.path; // e.g., uploads/originals/user123_1699999999_data.csv
    const originalFileName = req.file.originalname;

    console.log(`✅ File saved to disk: ${originalFilePath}`);

    // Read file for processing
    const fileBuffer = await fs.readFile(originalFilePath);

    // Process file (parse CSV/JSON/Excel)
    const processedData = await FileProcessor.processFile(
      fileBuffer,
      originalFileName,
      req.file.mimetype
    );

    // PII detection
    const piiAnalysis = await UnifiedPIIProcessor.analyzePII(processedData.data);

    // Create dataset with file path
    const dataset = await storage.createDataset({
      userId: userId,
      sourceType: 'upload',
      originalFileName: originalFileName,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      storageUri: originalFilePath,  // ✅ Real file path, not virtual URI
      schema: processedData.schema,
      recordCount: processedData.recordCount,
      data: processedData.data,
      piiAnalysis: piiAnalysis,
      metadata: {
        uploadedAt: new Date().toISOString(),
        originalPath: originalFilePath,
        checksumMd5: crypto.createHash('md5').update(fileBuffer).digest('hex')
      }
    });

    res.json({
      success: true,
      dataset: dataset,
      originalFilePath: originalFilePath, // Return path for client reference
      piiDetected: piiAnalysis?.hasPII || false
    });
  } catch (error: any) {
    console.error('Upload error:', error);

    // Clean up file if processing failed
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(err =>
        console.error('Failed to delete file after error:', err)
      );
    }

    res.status(500).json({ error: error.message });
  }
});
```

#### Part 3: Store Transformed Files
**File**: `server/routes/data-transformation.ts` (or `server/routes/project.ts`)

**Add Transformation Export Endpoint**:

```typescript
router.post("/:id/apply-transformations", ensureAuthenticated, async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = (req.user as any)?.id;
    const { transformations } = req.body;

    // Verify ownership
    const project = await storage.getProject(projectId);
    if (!project || project.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Apply transformations
    const originalData = project.data || [];
    const transformedData = await DataTransformationService.applyTransformations(
      originalData,
      transformations
    );

    // ✅ Export transformed data to file
    const timestamp = Date.now();
    const transformedFileName = `${userId}_${timestamp}_transformed_${project.name}.json`;
    const transformedFilePath = path.join(TRANSFORMED_FILES_DIR, transformedFileName);

    await fs.writeFile(
      transformedFilePath,
      JSON.stringify(transformedData, null, 2),
      'utf-8'
    );

    console.log(`✅ Transformed data saved: ${transformedFilePath}`);

    // Update project with transformation metadata
    await storage.updateProject(projectId, {
      transformedData: transformedData,
      transformations: transformations,
      metadata: {
        ...project.metadata,
        transformedFilePath: transformedFilePath,
        transformedAt: new Date().toISOString(),
        transformationCount: transformations.length
      }
    });

    res.json({
      success: true,
      transformedData: transformedData,
      transformedFilePath: transformedFilePath,
      recordCount: transformedData.length
    });
  } catch (error: any) {
    console.error('Transformation error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

#### Part 4: Add File Download Endpoints
**File**: `server/routes/project.ts`

```typescript
// Download original uploaded file
router.get("/:id/download/original", ensureAuthenticated, async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = (req.user as any)?.id;

    const project = await storage.getProject(projectId);
    if (!project || project.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get original file path from dataset
    const datasets = await storage.getProjectDatasets(projectId);
    if (!datasets.length) {
      return res.status(404).json({ error: "No uploaded files found" });
    }

    const originalFilePath = datasets[0].storageUri;

    // Verify file exists
    const fileExists = await fs.access(originalFilePath).then(() => true).catch(() => false);
    if (!fileExists) {
      return res.status(404).json({ error: "Original file no longer available" });
    }

    // Send file
    res.download(originalFilePath, datasets[0].originalFileName);
  } catch (error: any) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download transformed file
router.get("/:id/download/transformed", ensureAuthenticated, async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = (req.user as any)?.id;

    const project = await storage.getProject(projectId);
    if (!project || project.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const transformedFilePath = project.metadata?.transformedFilePath;
    if (!transformedFilePath) {
      return res.status(404).json({ error: "No transformed file available" });
    }

    // Verify file exists
    const fileExists = await fs.access(transformedFilePath).then(() => true).catch(() => false);
    if (!fileExists) {
      return res.status(404).json({ error: "Transformed file no longer available" });
    }

    // Send file
    res.download(transformedFilePath, `transformed_${project.name}.json`);
  } catch (error: any) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

#### Part 5: Update Database Schema for File Paths
**File**: `shared/schema.ts`

**Update Datasets Table**:
```typescript
export const datasets = pgTable("datasets", {
  // ... existing fields ...
  storageUri: varchar("storage_uri").notNull(), // Now stores real file path
  originalFilePath: varchar("original_file_path"), // ✅ Explicit original file path
  transformedFilePath: varchar("transformed_file_path"), // ✅ Transformed file path
  checksumMd5: varchar("checksum_md5"), // ✅ File integrity verification
  // ... rest of fields ...
});
```

**Update Projects Table**:
```typescript
export const projects = pgTable("projects", {
  // ... existing fields ...
  metadata: jsonb("metadata").default('{}'), // Add file paths to metadata
  // metadata will contain:
  // {
  //   originalFilePath: string,
  //   transformedFilePath: string,
  //   transformedAt: string,
  //   checksumMd5: string
  // }
});
```

**Run Migration**:
```bash
npm run db:push
```

#### Part 6: Add File Cleanup Service (Optional)
**File**: `server/services/file-cleanup-service.ts`

```typescript
import fs from 'fs/promises';
import path from 'path';
import { storage } from './storage';

export class FileCleanupService {
  private static readonly RETENTION_DAYS = 90; // Keep files for 90 days

  /**
   * Delete files for completed and paid projects older than retention period
   */
  static async cleanupOldFiles(): Promise<void> {
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - this.RETENTION_DAYS);

    console.log(`🧹 Starting file cleanup (retention: ${this.RETENTION_DAYS} days)`);

    // Get completed projects older than retention
    const oldProjects = await storage.getCompletedProjects({
      completedBefore: retentionDate
    });

    for (const project of oldProjects) {
      try {
        // Delete original file
        if (project.metadata?.originalFilePath) {
          await fs.unlink(project.metadata.originalFilePath);
          console.log(`✅ Deleted original file: ${project.metadata.originalFilePath}`);
        }

        // Keep transformed file longer (or delete if desired)
        // await fs.unlink(project.metadata.transformedFilePath);

      } catch (error) {
        console.error(`Failed to cleanup files for project ${project.id}:`, error);
      }
    }
  }

  /**
   * Delete orphaned files (files on disk not referenced in database)
   */
  static async cleanupOrphanedFiles(): Promise<void> {
    const uploadsDir = process.env.UPLOAD_DIR || './uploads';
    const originalDir = path.join(uploadsDir, 'originals');

    const files = await fs.readdir(originalDir);

    for (const file of files) {
      const filePath = path.join(originalDir, file);

      // Check if file is referenced in any dataset
      const isReferenced = await storage.isFileReferenced(filePath);

      if (!isReferenced) {
        // Check file age (don't delete recent uploads)
        const stats = await fs.stat(filePath);
        const fileAge = Date.now() - stats.mtimeMs;
        const oneDayMs = 24 * 60 * 60 * 1000;

        if (fileAge > oneDayMs) {
          await fs.unlink(filePath);
          console.log(`🗑️  Deleted orphaned file: ${file}`);
        }
      }
    }
  }
}

// Schedule cleanup to run daily
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    FileCleanupService.cleanupOldFiles().catch(console.error);
    FileCleanupService.cleanupOrphanedFiles().catch(console.error);
  }, 24 * 60 * 60 * 1000); // Every 24 hours
}
```

### Updated Storage Architecture

**Before**:
```
Upload → Memory Buffer → Parse → Database JSON → Discard Buffer
                                      ↓
                              Original File Lost
```

**After**:
```
Upload → Disk Storage → Parse → Database JSON + File Path
          ↓                            ↓
    Original File Retained      Reference Stored
          ↓
    Transformation Applied
          ↓
    Transformed File Saved
          ↓
    Both Versions Available
```

### Testing Checklist
- [ ] File upload saves to `uploads/originals/` directory
- [ ] Database stores real file path in `storageUri`
- [ ] Original file can be downloaded via `/api/projects/:id/download/original`
- [ ] Transformation creates file in `uploads/transformed/`
- [ ] Transformed file can be downloaded via `/api/projects/:id/download/transformed`
- [ ] File cleanup service runs without errors
- [ ] Orphaned file detection works correctly
- [ ] GDPR data export includes both original and transformed files

---

## ISSUE #4: AGENT AUTHENTICATION & DATA ACCESS

### Problem Statement
Agents are getting stuck and not activating because:
1. Agents receive only text parameters (no userId, projectId, or data)
2. Agents cannot access project data from database (no storage import)
3. Agents cannot verify user ownership
4. Message broker events don't match subscriptions
5. Checkpoint approvals don't continue workflow

### Root Cause Analysis

#### Context Loss at Agent Call
**File**: `server/routes/project.ts` (line 260-265)

```typescript
// Route handler HAS full context
const userId = (req.user as any)?.id;
const project = await storage.getProject(projectId);
const projectData = project.data || [];

// But agent call LOSES context
const dataEstimate = await dataEngineerAgent.estimateDataRequirements({
  goals,           // ❌ Text only
  questions,       // ❌ Text only
  dataSource,      // ❌ String only
  journeyType      // ❌ String only
  // ❌ Missing: userId, projectId, project, projectData, schema
});
```

#### Agent Has No Database Access
**File**: `server/services/data-engineer-agent.ts`

```typescript
// ❌ Missing imports
// import { storage } from '../services/storage';
// import { db } from '../db';

class DataEngineerAgent {
  async estimateDataRequirements(params) {
    // ❌ No way to access database
    // ❌ No way to verify ownership
    // ❌ Can only analyze text keywords
  }
}
```

### Solution: 5-Part Agent Context Fix

#### Part 1: Create Agent Context Interface
**File**: Create `server/types/agent-context.ts`

```typescript
export interface AgentExecutionContext {
  // User context
  userId: string;
  userRole: 'non-tech' | 'business' | 'technical' | 'consultation';
  isAdmin: boolean;

  // Project context
  projectId: string;
  project: {
    id: string;
    userId: string;
    name: string;
    description?: string;
    journeyType: string;
    status: string;
    data?: any[];
    schema?: any;
    transformedData?: any[];
  };

  // Data access
  data: any[];
  schema: any;
  recordCount: number;

  // Ownership verification
  ownershipVerified: boolean;
}

export interface DataEngineerContext extends AgentExecutionContext {
  goals: string;
  questions: string[];
  dataSource: string;
  journeyType: string;
}

export interface DataScientistContext extends AgentExecutionContext {
  analysisType?: string;
  complexity?: 'low' | 'medium' | 'high' | 'very_high';
}
```

#### Part 2: Update Agent Method Signatures
**File**: `server/services/data-engineer-agent.ts`

```typescript
import { storage } from '../services/storage';
import { db } from '../db';
import type { DataEngineerContext } from '../types/agent-context';

class DataEngineerAgent {
  /**
   * Estimate data requirements with full context
   */
  async estimateDataRequirements(context: DataEngineerContext): Promise<DataEstimate> {
    // ✅ Now has full context
    const { userId, projectId, project, data, schema, goals, questions } = context;

    // ✅ Verify ownership (though already verified by route middleware)
    if (!context.ownershipVerified) {
      throw new Error('Ownership not verified for agent execution');
    }

    // ✅ Can access actual data
    const actualRecordCount = data.length;
    const actualColumnCount = Object.keys(data[0] || {}).length;

    // ✅ Analyze real data characteristics
    const dataProfile = this.analyzeDataProfile(data, schema);

    // ✅ Estimate based on real data, not keywords
    const estimate = {
      estimatedRecords: actualRecordCount,
      estimatedColumns: actualColumnCount,
      estimatedSize: this.calculateDataSize(data),
      dataQuality: dataProfile.quality,
      missingValueRatio: dataProfile.missingRatio,
      dataTypes: dataProfile.types,
      recommendations: this.generateRecommendations(dataProfile, questions)
    };

    console.log(`✅ Data Engineer (Project ${projectId}): Analyzed ${actualRecordCount} records`);

    return estimate;
  }

  /**
   * Analyze real data profile
   */
  private analyzeDataProfile(data: any[], schema: any) {
    const totalCells = data.length * Object.keys(data[0] || {}).length;
    let missingCells = 0;
    const types: Record<string, string> = {};

    // Count missing values
    data.forEach(row => {
      Object.entries(row).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') {
          missingCells++;
        }
        types[key] = typeof value;
      });
    });

    const missingRatio = missingCells / totalCells;
    const quality = missingRatio < 0.05 ? 'high' : missingRatio < 0.15 ? 'medium' : 'low';

    return { quality, missingRatio, types };
  }
}
```

**File**: `server/services/data-scientist-agent.ts` (or `technical-ai-agent.ts`)

```typescript
import { storage } from '../services/storage';
import type { DataScientistContext } from '../types/agent-context';

class DataScientistAgent {
  async recommendAnalysis(context: DataScientistContext): Promise<AnalysisRecommendation> {
    const { userId, projectId, data, schema, questions } = context;

    // ✅ Analyze actual data distribution
    const statisticalProfile = await this.analyzeDistributions(data);

    // ✅ Recommend tests based on real data characteristics
    const recommendations = this.selectAppropriateTests(statisticalProfile, questions);

    console.log(`✅ Data Scientist (Project ${projectId}): Recommended ${recommendations.length} tests`);

    return {
      analysisType: this.determineAnalysisType(questions, data),
      complexity: this.assessComplexity(data, recommendations),
      recommendedTests: recommendations,
      estimatedRuntime: this.estimateRuntime(data.length, recommendations.length),
      dataCharacteristics: statisticalProfile
    };
  }
}
```

#### Part 3: Update Route Handlers to Pass Context
**File**: `server/routes/project.ts`

**Replace Existing Agent Calls**:

```typescript
router.post("/:id/agent-recommendations", ensureAuthenticated, async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;
    const userRole = (req.user as any)?.userRole || 'non-tech';

    // Get project with ownership check
    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Verify ownership (or admin bypass)
    if (!isAdmin && project.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { goals, questions, dataSource, journeyType } = req.body;

    // ✅ Build agent context with full information
    const agentContext: DataEngineerContext = {
      // User context
      userId,
      userRole,
      isAdmin,

      // Project context
      projectId,
      project: {
        id: project.id,
        userId: project.userId,
        name: project.name,
        description: project.description,
        journeyType: project.journeyType,
        status: project.status,
        data: project.data,
        schema: project.schema,
        transformedData: project.transformedData
      },

      // Data access
      data: project.data || [],
      schema: project.schema || {},
      recordCount: (project.data || []).length,

      // Ownership
      ownershipVerified: true,

      // Request-specific
      goals,
      questions,
      dataSource,
      journeyType
    };

    console.log(`🤖 Starting agent workflow for project ${projectId} (${agentContext.recordCount} records)`);

    // ✅ Call Data Engineer with full context
    const dataEstimate = await dataEngineerAgent.estimateDataRequirements(agentContext);

    // ✅ Publish event with context
    await messageBroker.emit('data:requirements_estimated', {
      projectId,
      userId,
      dataEstimate,
      timestamp: new Date().toISOString()
    });
    console.log('📤 Data Engineer → Broadcast: Requirements estimated');

    // ✅ Call Data Scientist with full context
    const scientistContext: DataScientistContext = {
      ...agentContext,
      analysisType: 'exploratory',
      complexity: dataEstimate.complexity
    };
    const analysisRec = await dataScientistAgent.recommendAnalysis(scientistContext);

    // ✅ Publish event
    await messageBroker.emit('analysis:recommended', {
      projectId,
      userId,
      analysisRec,
      timestamp: new Date().toISOString()
    });
    console.log('📤 Data Scientist → Broadcast: Analysis recommended');

    res.json({
      success: true,
      dataEstimate,
      analysisRecommendations: analysisRec
    });

  } catch (error: any) {
    console.error('Agent recommendation error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

#### Part 4: Fix Message Broker Event Mismatches
**File**: `server/routes/project.ts` (lines 64-103)

**Add Missing Event Publications**:

```typescript
// Subscriber for data quality assessment
messageBroker.on('data:quality_assessed', async (message) => {
  console.log('📨 PM ← DE: Data quality assessed', message.data?.projectId);
});

// ✅ Publish this event when quality assessment completes
router.post("/:id/assess-quality", ensureAuthenticated, async (req, res) => {
  try {
    const projectId = req.params.id;
    const project = await storage.getProject(projectId);

    // Build context
    const context = buildAgentContext(req.user, project);

    // Run quality assessment
    const qualityReport = await dataEngineerAgent.assessDataQuality(context);

    // ✅ Publish event
    await messageBroker.emit('data:quality_assessed', {
      projectId,
      userId: context.userId,
      qualityReport,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, qualityReport });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Subscriber for project configuration approval
messageBroker.on('project:configuration_approved', async (message) => {
  console.log('📨 Agents ← User: Configuration approved', message.data?.projectId);
});

// ✅ Publish this event when user approves configuration
router.post("/:id/approve-configuration", ensureAuthenticated, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { configuration } = req.body;

    // Save approved configuration
    await storage.updateProject(projectId, {
      approvedConfiguration: configuration,
      status: 'plan_approved'
    });

    // ✅ Publish event
    await messageBroker.emit('project:configuration_approved', {
      projectId,
      userId: (req.user as any)?.id,
      configuration,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

#### Part 5: Fix Checkpoint Workflow Continuation
**File**: `server/routes/project.ts` (lines 1136-1164)

**Add Workflow Continuation After Checkpoint Approval**:

```typescript
router.post("/:projectId/checkpoints/:checkpointId/feedback",
  ensureAuthenticated,
  async (req, res) => {
    try {
      const { projectId, checkpointId } = req.params;
      const { feedback, approved } = req.body;
      const userId = (req.user as any)?.id;

      // ✅ Add ownership verification
      const project = await storage.getProject(projectId);
      if (!project || project.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Handle checkpoint feedback
      await projectAgentOrchestrator.handleCheckpointFeedback(
        projectId,
        checkpointId,
        feedback || '',
        approved === true
      );

      // ✅ Continue workflow if approved
      if (approved) {
        console.log(`✅ Checkpoint ${checkpointId} approved - continuing workflow`);

        // Determine next agent task based on checkpoint type
        const checkpoint = await storage.getCheckpoint(checkpointId);

        if (checkpoint.agentType === 'data_engineer' && checkpoint.checkpointType === 'schema_validation') {
          // Schema approved → trigger analysis planning
          const context = buildAgentContext(req.user, project);
          const analysisRec = await dataScientistAgent.recommendAnalysis(context);

          await messageBroker.emit('analysis:recommended', {
            projectId,
            userId,
            analysisRec,
            timestamp: new Date().toISOString()
          });

        } else if (checkpoint.checkpointType === 'analysis_plan') {
          // Analysis plan approved → execute analysis
          await messageBroker.emit('project:configuration_approved', {
            projectId,
            userId,
            configuration: checkpoint.proposedData,
            timestamp: new Date().toISOString()
          });

          // Update project status to execute
          await storage.updateProject(projectId, {
            status: 'plan_approved',
            approvedPlanId: checkpoint.id
          });
        }
      } else {
        // Rejected - request modifications
        console.log(`❌ Checkpoint ${checkpointId} rejected - agent will revise`);

        await messageBroker.emit('checkpoint:rejected', {
          projectId,
          userId,
          checkpointId,
          feedback,
          timestamp: new Date().toISOString()
        });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Checkpoint feedback error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);
```

#### Part 6: Add requireOwnership Middleware to All Agent Endpoints
**File**: `server/routes/project.ts`

**Import Middleware**:
```typescript
import { requireOwnership } from '../middleware/ownership';
```

**Apply to Agent Endpoints**:
```typescript
// Before
router.post("/:id/agent-recommendations", ensureAuthenticated, async (req, res) => { ... });

// After
router.post("/:id/agent-recommendations",
  ensureAuthenticated,
  requireOwnership('project'),  // ✅ Add this
  async (req, res) => { ... }
);

// Apply to all agent endpoints:
// - /:id/agent-recommendations
// - /:id/assess-quality
// - /:id/approve-configuration
// - /:projectId/checkpoints/:checkpointId/feedback
```

### Agent Context Helper Function
**File**: `server/routes/project.ts`

```typescript
/**
 * Build agent execution context from request and project
 */
function buildAgentContext(user: any, project: any): AgentExecutionContext {
  return {
    userId: user.id,
    userRole: user.userRole || 'non-tech',
    isAdmin: user.isAdmin || false,
    projectId: project.id,
    project: {
      id: project.id,
      userId: project.userId,
      name: project.name,
      description: project.description,
      journeyType: project.journeyType,
      status: project.status,
      data: project.data,
      schema: project.schema,
      transformedData: project.transformedData
    },
    data: project.data || [],
    schema: project.schema || {},
    recordCount: (project.data || []).length,
    ownershipVerified: true
  };
}
```

### Testing Checklist
- [ ] Agents receive full context (userId, projectId, data, schema)
- [ ] Agents can access project data directly
- [ ] Ownership verification works for all agent endpoints
- [ ] Message broker events match subscriptions
- [ ] Checkpoint approval continues workflow
- [ ] Checkpoint rejection triggers agent revision
- [ ] Console logs show agent coordination flow
- [ ] No context loss between route handler and agent

---

## IMPLEMENTATION ROADMAP

### Phase 1: Critical Fixes (Days 1-2)
**Priority**: CRITICAL - Production blockers

1. **Fix Post-Login Navigation** (4 hours)
   - [ ] Update auth.tsx login handler
   - [ ] Add intended route storage to protected routes
   - [ ] Add logout endpoint
   - [ ] Test login/logout flow

2. **Fix Agent Context Loss** (8 hours)
   - [ ] Create agent-context.ts types
   - [ ] Update Data Engineer agent signature
   - [ ] Update Data Scientist agent signature
   - [ ] Update route handlers to pass context
   - [ ] Add buildAgentContext() helper
   - [ ] Test agent coordination

3. **Fix File Upload Retention** (6 hours)
   - [ ] Replace multer memory storage with disk storage
   - [ ] Update upload handler to store file paths
   - [ ] Update database schema for file paths
   - [ ] Add download endpoints
   - [ ] Test upload/download flow

### Phase 2: Journey Enhancements (Day 3)
**Priority**: HIGH - User experience improvements

4. **Integrate Plan Step** (4 hours)
   - [ ] Add plan step to JourneyWizard steps array
   - [ ] Add plan step route to App.tsx
   - [ ] Update journey state manager
   - [ ] Test plan step navigation

5. **Fix Message Broker Events** (3 hours)
   - [ ] Add missing event publications
   - [ ] Fix checkpoint workflow continuation
   - [ ] Test agent coordination events

6. **Add Transformation Step** (5 hours) - Optional
   - [ ] Create transformation-step.tsx
   - [ ] Add to JourneyWizard
   - [ ] Add route to App.tsx
   - [ ] Test transformation workflow

### Phase 3: Polish & Testing (Day 4)
**Priority**: MEDIUM - Quality assurance

7. **Comprehensive Testing** (6 hours)
   - [ ] End-to-end user journey tests
   - [ ] Agent coordination tests
   - [ ] File upload/download tests
   - [ ] Navigation flow tests

8. **Documentation Updates** (2 hours)
   - [ ] Update CLAUDE.md with changes
   - [ ] Update API documentation
   - [ ] Add architecture diagrams

9. **File Cleanup Service** (3 hours) - Optional
   - [ ] Implement FileCleanupService
   - [ ] Add scheduled cleanup
   - [ ] Test orphaned file detection

### Phase 4: Production Deployment (Day 5)
**Priority**: CRITICAL - Deployment readiness

10. **Pre-Deployment Checklist**
    - [ ] Run all tests
    - [ ] Verify environment variables
    - [ ] Test with production data
    - [ ] Performance testing
    - [ ] Security audit

11. **Deployment**
    - [ ] Deploy to staging
    - [ ] Smoke tests on staging
    - [ ] Deploy to production
    - [ ] Monitor for errors

---

## TESTING STRATEGY

### Unit Tests
- Agent context building
- File storage operations
- Journey state transitions
- Message broker events

### Integration Tests
- Agent coordination flow
- File upload → storage → download
- Journey step navigation
- Checkpoint approval workflow

### End-to-End Tests
```typescript
// tests/user-journey-complete.spec.ts
test('Complete user journey: login → upload → plan → transform → analyze → pay → results', async () => {
  // 1. Login
  await page.goto('/auth');
  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');

  // ✅ Should redirect to dashboard
  await expect(page).toHaveURL('/dashboard');

  // 2. Start journey
  await page.click('text=Start Analysis');
  await page.click('text=Non-Technical Guided');

  // 3. Upload file
  await page.setInputFiles('input[type="file"]', 'test-data.csv');
  await page.click('text=Upload');

  // ✅ File should be saved to disk
  const uploadResponse = await page.waitForResponse('/api/projects/upload');
  const uploadData = await uploadResponse.json();
  expect(uploadData.originalFilePath).toContain('uploads/originals/');

  // 4. Approve plan (agent coordination)
  await page.click('text=Approve Plan');

  // ✅ Agents should continue workflow
  await page.waitForSelector('text=Analysis Executing');

  // 5. Download results
  await page.click('text=Download Original File');

  // ✅ File should download
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('text=Download')
  ]);
  expect(download.suggestedFilename()).toBe('test-data.csv');
});
```

---

## RISK MITIGATION

### Backward Compatibility
- **File Storage**: Existing projects with `mem://` URIs will need migration
  - **Solution**: Add migration script to move data to disk storage
  - **Fallback**: Keep database JSON as fallback if file missing

### Performance
- **Disk I/O**: File operations may be slower than memory
  - **Solution**: Use streaming for large files
  - **Solution**: Add caching layer for frequently accessed files

### Security
- **File Access**: Ensure ownership verification on all download endpoints
  - **Solution**: Use `requireOwnership` middleware consistently
  - **Solution**: Never expose file paths to client

### Data Loss
- **File Deletion**: Accidental file cleanup could lose data
  - **Solution**: Implement soft delete with recovery period
  - **Solution**: Add file backup before deletion

---

## SUCCESS CRITERIA

### Issue #1: Post-Login Navigation ✅
- [ ] 100% of logins redirect to dashboard
- [ ] Intended routes preserved across login
- [ ] Logout endpoint returns 200 OK

### Issue #2: Project Lifecycle ✅
- [ ] Plan step appears in journey wizard
- [ ] All 9-10 steps navigable
- [ ] Journey progress tracked correctly
- [ ] Transformation step functional (if implemented)

### Issue #3: File Upload Retention ✅
- [ ] Original files saved to disk (100% retention)
- [ ] Transformed files exported to disk
- [ ] Download endpoints working
- [ ] File paths stored in database

### Issue #4: Agent Authentication ✅
- [ ] Agents receive full context
- [ ] Agents access project data successfully
- [ ] Agent coordination events fire correctly
- [ ] Checkpoint approvals continue workflow
- [ ] 0 agent failures due to authentication

---

## APPENDIX: FILE CHECKLIST

### Files to Modify
- [ ] `client/src/pages/auth.tsx` - Login handler
- [ ] `client/src/App.tsx` - Routes and intended route storage
- [ ] `client/src/components/JourneyWizard.tsx` - Add plan step
- [ ] `server/routes/auth.ts` - Add logout endpoint
- [ ] `server/routes/project.ts` - Agent context, file storage, events
- [ ] `server/services/data-engineer-agent.ts` - Context-aware methods
- [ ] `server/services/data-scientist-agent.ts` - Context-aware methods
- [ ] `shared/schema.ts` - Add file path fields
- [ ] `server/types/agent-context.ts` - NEW: Agent context types

### Files to Create
- [ ] `client/src/pages/transformation-step.tsx` - Optional transformation step
- [ ] `server/services/file-cleanup-service.ts` - File cleanup scheduler

### Directories to Create
- [ ] `uploads/originals/` - Original uploaded files
- [ ] `uploads/transformed/` - Transformed files

---

**END OF COMPREHENSIVE FIX PLAN**

*This plan provides a complete roadmap to fix all 4 critical issues and restore the ChimariData platform to production-ready status.*
