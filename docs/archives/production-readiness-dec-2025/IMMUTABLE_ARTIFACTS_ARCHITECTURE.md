# Immutable Artifacts Architecture

## Overview

Each step creates its own immutable artifact that subsequent steps read from but never modify. This eliminates race conditions and makes the data flow clear and predictable.

## Artifact Flow

```
Step 2: Preparation
  ↓ Creates
ARTIFACT 1: requirementsDocument (IMMUTABLE)
  ├── userGoals: string[]
  ├── userQuestions: string[]
  ├── analysisPath: AnalysisRecommendation[]
  └── requiredDataElements: DataElement[]
  
  ↓ Read by Step 3 (never modified)
  
Step 3: Verification  
  ↓ Creates (builds on requirementsDocument)
ARTIFACT 2: mappingDocument (IMMUTABLE)
  ├── requirementsDocument: (snapshot)
  └── elementMappings: ElementMapping[]
      ├── elementId → sourceColumn mapping
      └── transformationLogic (if needed)
  
  ↓ Read by Step 4 (never modified)
  
Step 4: Transformation
  ↓ Creates (builds on mappingDocument)
ARTIFACT 3: transformationDocument (IMMUTABLE)
  ├── mappingDocument: (snapshot)
  ├── transformationSteps: TransformationStep[]
  └── transformedDatasetId: string
  
  ↓ Read by Step 5+ (never modified)
```

## Implementation Rules

### Rule 1: Each artifact is created ONCE and NEVER updated

- `requirementsDocument`: Created in Preparation step, locked immediately
- `mappingDocument`: Created in Verification step, never modified
- `transformationDocument`: Created in Transformation step, never modified

### Rule 2: Subsequent steps READ previous artifacts, don't modify them

- Verification reads `requirementsDocument` but creates new `mappingDocument`
- Transformation reads `mappingDocument` but creates new `transformationDocument`

### Rule 3: PATCH endpoint NEVER touches artifact fields

The generic `PATCH /api/projects/:id/progress` endpoint must exclude:
- `requirementsDocument`
- `mappingDocument`
- `transformationDocument`

These can ONLY be created/updated via dedicated endpoints.

### Rule 4: Artifacts can contain snapshots of previous artifacts

For convenience and audit trail, later artifacts can include snapshots:
- `mappingDocument.requirementsDocument` = snapshot of requirementsDocument
- `transformationDocument.mappingDocument` = snapshot of mappingDocument

This allows each artifact to be self-contained while maintaining clear lineage.

## Schema Structure

```typescript
journeyProgress: {
  // ARTIFACT 1: Requirements (Preparation Step)
  requirementsDocument: {
    userGoals: string[],
    userQuestions: string[],
    analysisPath: AnalysisRecommendation[],
    requiredDataElements: DataElement[],
    questionAnswerMapping: QuestionMapping[],
    generatedAt: string,
    version: number
  },
  
  // ARTIFACT 2: Mapping (Verification Step)
  mappingDocument: {
    requirementsDocument: {...}, // Snapshot
    elementMappings: [
      {
        elementId: string,
        elementName: string,
        sourceColumn: string, // Required
        transformationRequired: boolean,
        transformationLogic: {...}
      }
    ],
    generatedAt: string
  },
  
  // ARTIFACT 3: Transformation (Transformation Step)
  transformationDocument: {
    mappingDocument: {...}, // Snapshot
    transformationSteps: [
      {
        elementId: string,
        targetElement: string,
        sourceColumn: string,
        transformationLogic: string,
        operation: string
      }
    ],
    transformedDatasetId: string,
    generatedAt: string
  }
}
```

## Endpoint Responsibilities

### Preparation Step

**POST /api/projects/:id/generate-data-requirements**
- Generates `requirementsDocument`
- Sets `requirementsLocked: true`
- **Never** updates existing `requirementsDocument` if locked

**GET /api/projects/:id/required-data-elements**
- Returns `requirementsDocument` if exists and locked
- Only generates new if not locked

### Verification Step

**POST /api/projects/:id/create-mapping-document**
- Takes `requirementsDocument` (read-only)
- User maps elements to source columns
- Creates NEW `mappingDocument`
- **Never** modifies `requirementsDocument`

### Transformation Step

**POST /api/projects/:id/execute-transformations**
- Takes `mappingDocument` (read-only) from `journeyProgress`
- Executes transformation steps on datasets
- Creates transformed datasets
- Creates NEW `transformationDocument` artifact
- **Never** modifies `mappingDocument` or `requirementsDocument`

## Migration Strategy

1. **Phase 1**: Add schema fields for `mappingDocument` and `transformationDocument`
2. **Phase 2**: Update Verification step to create `mappingDocument` instead of modifying `requirementsDocument`
3. **Phase 3**: Update Transformation step to create `transformationDocument` instead of modifying `mappingDocument`
4. **Phase 4**: Update PATCH endpoint to exclude all artifact fields
5. **Phase 5**: Remove all code paths that modify artifacts

## Benefits

1. **No Race Conditions**: Each artifact created once, never updated
2. **Clear Data Flow**: Easy to trace what each step produces
3. **Audit Trail**: Each artifact is a snapshot, perfect for debugging
4. **Simpler Code**: No complex locking/merging logic needed
5. **Easier Testing**: Each artifact creation is independent

