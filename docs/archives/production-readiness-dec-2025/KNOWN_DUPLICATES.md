# Known Duplicate Files

## Overview
This document tracks known duplicate service files in the codebase. Per CLAUDE.md, `server/services/` is the target architecture and `server/` root is legacy.

## Active Duplicates (Still in Use)

### Core Services with Duplicates

**1. file-processor.ts**
- Legacy: `server/file-processor.ts`
- Modern: `server/services/file-processor.ts`
- Status: Modern version actively used
- Imports: `server/services/checkpoint-integration.ts`, `server/services/data-engineer-agent.ts`

**2. unified-pii-processor.ts**
- Legacy: `server/unified-pii-processor.ts`
- Modern: `server/services/unified-pii-processor.ts`
- Status: Both may be in use

**3. ml-service.ts**
- Legacy: `server/ml-service.ts`
- Modern: None (replaced by comprehensive-ml-service.ts)
- Imported by: `server/services/checkpoint-integration.ts`, `server/services/real-tool-handlers.ts`
- Status: **Still actively used - cannot remove**

**4. advanced-analyzer.ts**
- Legacy: `server/advanced-analyzer.ts`
- Modern: None direct replacement
- Imported by: `server/services/checkpoint-integration.ts`, `server/services/real-tool-handlers.ts`
- Status: **Still actively used - cannot remove**

**5. visualization-api-service.ts**
- Legacy: `server/visualization-api-service.ts`
- Modern: `server/services/enhanced-visualization-engine.ts`
- Status: Legacy may still be imported

**6. python-visualization.ts**
- Legacy: `server/python-visualization.ts`
- Modern: Functionality in services/
- Status: Check if still used

## Recommendation

**Safe to Remove Now:**
- None identified that are both:
  1. True duplicates with modern equivalents
  2. No longer imported anywhere

**Requires Refactoring (Future Work):**
1. Update imports in `checkpoint-integration.ts` and `real-tool-handlers.ts`
2. Migrate from `ml-service.ts` to `comprehensive-ml-service.ts`
3. Migrate from `advanced-analyzer.ts` to newer services
4. Then remove legacy files

## Cleanup Completed

### Removed Files:
- `shared/custom-journey-capabilities.ts.old` ✅
- Temporary scripts (`find-duplicates.sh`, etc.) ✅
- 148 documentation files archived ✅

### Files Archived:
- PowerShell scripts → `scripts/archived/` (17 files)
- Status/implementation docs → `docs/archives/sessions/` (148 files)

---

**Last Updated**: November 3, 2024
**Action Required**: Refactor imports before removing legacy files
