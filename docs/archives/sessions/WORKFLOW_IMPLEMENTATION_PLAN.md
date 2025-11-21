# Agent-Driven Workflow Implementation Plan

## Overview
Implement agent-driven configuration recommendations to eliminate manual data entry after file upload.

## Priority
🔴 **CRITICAL** - Defeats purpose of multi-agent system without this

## Changes Required

### 1. Backend - Agent File Analysis Endpoint

**File**: `server/routes/project.ts`
**Action**: Add new endpoint for agent recommendations

```typescript
/**
 * POST /api/projects/:id/agent-recommendations
 * Get agent recommendations for analysis configuration
 */
router.post('/:id/agent-recommendations', async (req, res) => {
  // TODO: Implement
});
```

### 2. Backend - Data Engineer Agent Methods

**File**: `server/services/data-engineer-agent.ts` 
**Action**: Add file analysis methods

```typescript
export class DataEngineerAgent {
  // TODO: Add analyzeUploadedFile method
  // TODO: Add analyzeProjectData method
  // TODO: Add detectRelationships method
  // TODO: Add assessDataQuality method
}
```

### 3. Backend - Data Scientist Agent Recommendations

**File**: `server/services/data-scientist-agent.ts`
**Action**: Add configuration recommendation methods

```typescript
export class DataScientistAgent {
  // TODO: Add recommendAnalysisConfig method
  // TODO: Add analyzeQuestions method
  // TODO: Add calculateComplexity method
  // TODO: Add estimateResources method
}
```

### 4. Backend - PM Agent Synthesis

**File**: `server/services/project-manager-agent.ts`
**Action**: Add recommendation synthesis

```typescript
export class ProjectManagerAgent {
  // TODO: Add synthesizeRecommendation method
}
```

### 5. Frontend - Agent Recommendation Dialog

**File**: `client/src/components/AgentRecommendationDialog.tsx` (NEW)
**Action**: Create new component

### 6. Frontend - JourneyWizard Integration

**File**: `client/src/components/JourneyWizard.tsx`
**Action**: Integrate recommendation flow after file upload

## Implementation Status

- [ ] Backend agent methods
- [ ] API endpoints  
- [ ] Frontend dialog component
- [ ] Integration with JourneyWizard
- [ ] E2E test updates

## Next Steps

1. First, fix the Python import error and get server running
2. Then implement backend agent methods
3. Add API endpoints
4. Create frontend dialog
5. Update E2E test to use recommendations





