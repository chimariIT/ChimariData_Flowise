# Question → Element → Transformation → Analysis Pipeline Analysis Report

**Date**: February 26, 2026
**Status**: Critical Issues Identified
**Impact**: Pipeline not completing successfully with correct results interpretation

---

## Executive Summary

The Chimaridata platform's core value proposition is using agents and RAG pipeline to understand user requirements, transform data appropriately, and interpret results to answer user's specific questions. However, the **Question → Element → Transformation → Analysis** chain has several critical gaps that prevent successful completion.

**Root Cause**: The pipeline has disjointed execution flows where semantic links, business definitions, and question mappings are created but not consistently propagated or used across steps.

---

## Critical Issues Identified

### Issue 1: Question → Element Link Timing Gap

**Location**: `server/services/semantic-data-pipeline.ts:306`

**Problem**:
```typescript
// Line 306 - Links created from questionAnswerMapping
await this.linkQuestionToElement(projectId, mapping.questionId, elementId, 0.9);
```

The `createQuestionElementLinksFromRequirements()` method creates question→element links, BUT:

1. **When is it called?** This method exists but is not called from any of the main workflow routes (project.ts, agents.ts, analysis-execution.ts)
2. **Missing trigger**: There's no evidence that questionAnswerMapping is being populated with requiredDataElements at the right time
3. **No validation**: Links are created with fixed 0.9 confidence regardless of actual semantic match

**Impact**: Semantic traceability from questions to data elements is not established during the workflow.

---

### Issue 2: Business Definition Loading vs. Execution Mismatch

**Location**: `server/routes/project.ts:7923-7951` vs `project.ts:8123-8240`

**Problem**:

The business context is loaded correctly from DS Agent's calculation definitions:
```typescript
// Lines 7923-7951 - Loads business context
const businessContext: Record<string, any> = {};
for (const element of reqDoc.requiredDataElements) {
    const calcDef = element.calculationDefinition;
    if (calcDef) {
        businessContext[elementName] = {
            calculationType: calcDef.calculationType,
            formula: calcDef.formula,
            componentFields: calcDef.formula?.componentFields || [],
            aggregationMethod: calcDef.formula?.aggregationMethod,
            // ...
        };
    }
}
```

BUT the transformation execution switch statement (lines 8142-8240) only uses this context for specific operations:
- **'derive'**: Uses `businessContext[targetElement]` (line 8225)
- **'filter'**: Uses `businessContext[field]` for validRange (line 8155)
- **Other operations**: No business context usage

**Impact**: Business definitions are loaded but inconsistently applied during transformation execution.

---

### Issue 3: Column Mapping Write-Back Not Persisting to Execution

**Location**: `server/routes/project.ts:8099-8121` vs `server/services/analysis-execution.ts:630-681`

**Problem**:

Column mappings are written back to requirementsDocument:
```typescript
// Lines 8099-8121 - Write back column mappings
for (const element of reqDoc.requiredDataElements) {
    const mapped = columnLookup.get(element.elementName);
    if (mapped) {
        element.sourceColumn = mapped;
        writebackCount++;
    }
}
await storage.atomicMergeJourneyProgress(projectId, { requirementsDocument: reqDoc });
```

BUT the analysis-execution.ts has a 3-tier priority system for loading questionAnswerMapping that doesn't guarantee these mappings are used:
1. **Priority 1**: `request.questionAnswerMapping` (from frontend)
2. **Priority 2**: `transformationMetadata.questionAnswerMapping` (from datasets)
3. **Priority 3**: Fallback to `businessQuestions` from journeyProgress

**Impact**: The column mappings written back may not be propagated to the analysis execution if the wrong priority path is taken.

---

### Issue 4: QuestionAnswerMapping Not Populated with Elements

**Location**: `server/services/analysis-execution.ts:630-681`

**Problem**:

The questionAnswerMapping structure expects:
```typescript
{
    questionId: string;
    questionText: string;
    requiredDataElements: string[];  // <-- Expected but often empty
    recommendedAnalyses: string[];
    transformationsNeeded: string[];
}
```

BUT the actual questionAnswerMapping loaded from the frontend often has:
- `questionId`: ✅ Present
- `questionText`: ✅ Present
- `requiredDataElements`: ❌ **Often empty or undefined**
- `recommendedAnalyses`: ❌ **Often empty or undefined**

**Root Cause**: The Prepare step may not be populating requiredDataElements into the questionAnswerMapping structure.

**Impact**: The semantic pipeline's `createQuestionElementLinksFromRequirements()` method iterates over `mapping.requiredDataElements`, but if this is empty, no links are created.

---

### Issue 5: Element → Transformation → Analysis Chain Not Traced

**Location**: `server/services/analysis-execution.ts:833-845`

**Problem**:

Insights are tagged with `answersQuestions`:
```typescript
// Line 836 - Tag insight with related questions
const taggedInsight = {
    ...insight,
    answersQuestions: relatedQuestionIds.length > 0 ? relatedQuestionIds : undefined
};
```

BUT the evidence chain is incomplete:
- ✅ Questions exist with stable IDs (via `generateStableQuestionId()`)
- ⚠️ Elements exist in requirementsDocument
- ⚠️ Transformations exist in transformationMetadata
- ❌ No link from elements → transformations (element_to_transformation links not created)
- ❌ No link from transformations → insights (transformation_to_insight links not created)

**Impact**: Users cannot trace which transformations contributed to which insights for which questions.

---

### Issue 6: Intent Analysis Not Connected to Execution

**Location**: `server/services/question-intent-analyzer.ts` vs pipeline execution

**Problem**:

The `QuestionIntentAnalyzer` correctly identifies:
- `intentType`: 'comparison' | 'trend' | 'relationship' | etc.
- `recommendedAnalysisTypes`: Maps intent to analysis types (INTENT_TO_ANALYSIS_TYPES)
- `subjectConcept`: Domain concept being analyzed (e.g., "churn", "engagement")

BUT these intents are stored in `journeyProgress.questionIntents` but are NOT used during:
1. **Transformation compilation**: Doesn't consider intent when deciding how to transform
2. **Analysis execution**: Doesn't filter analyses by intent
3. **Result interpretation**: Doesn't format answers based on intent

**Impact**: The platform identifies what the user wants but doesn't use that information during execution.

---

### Issue 7: Semantic Links Not Created During Workflow

**Location**: `server/services/semantic-data-pipeline.ts:120-143` (linkQuestionToElement)

**Problem**:

The semantic pipeline has methods to create:
- `linkQuestionToElement()` - ✅ Exists
- `linkElementToTransformation()` - ✅ Exists
- `linkTransformationToInsight()` - ❌ **Does not exist**

These methods are defined but are NOT called during the main workflow:
- Prepare step: Should create question→element links
- Transformation step: Should create element→transformation links
- Execution step: Should create transformation→insight links

**Impact**: The semantic links table is not populated during the user journey, making traceability impossible.

---

## Recommended Fixes

### Priority 1: Fix Question → Element Link Creation

**Action**: Add call to `semanticDataPipeline.createQuestionElementLinksFromRequirements()` in the Prepare step workflow.

**Location**: `server/routes/agents.ts` or `server/routes/project.ts` (Prepare step endpoint)

**Implementation**:
```typescript
// After requirementsDocument is created
if (reqDoc.requiredDataElements && reqDoc.requiredDataElements.length > 0) {
    const questionAnswerMapping = buildQuestionAnswerMapping(
        userQuestions,
        reqDoc.requiredDataElements,
        analysisTypes
    );
    await semanticDataPipeline.createQuestionElementLinksFromRequirements(
        projectId,
        questionAnswerMapping
    );
}
```

---

### Priority 2: Populate RequiredDataElements in QuestionAnswerMapping

**Action**: Ensure the Prepare step populates `requiredDataElements` into the questionAnswerMapping structure.

**Location**: Wherever `questionAnswerMapping` is created (likely in the Prepare step)

**Implementation**:
```typescript
const questionAnswerMapping: QuestionAnalysisMapping[] = userQuestions.map((q) => {
    const relatedElements = reqDoc.requiredDataElements.filter(el =>
        el.neededForQuestions?.includes(q.id) ||
        el.neededForQuestions?.includes(q.text)
    );
    return {
        questionId: q.id,
        questionText: q.text,
        requiredDataElements: relatedElements.map(el => el.elementId || el.id),
        recommendedAnalyses: relatedElements.flatMap(el =>
            el.neededForAnalyses || []
        ),
        transformationsNeeded: relatedElements.flatMap(el =>
            el.transformationsNeeded || []
        ),
    };
});
```

---

### Priority 3: Create Element → Transformation Links

**Action**: Add `linkElementToTransformation()` call in the transformation execution workflow.

**Location**: `server/routes/project.ts:8123-8350` (execute-transformations)

**Implementation**:
```typescript
// After each transformation is executed successfully
for (const step of transformationSteps) {
    // ... execute transformation ...

    if (step.success) {
        await semanticDataPipeline.linkElementToTransformation(
            projectId,
            step.targetElement,  // element ID
            step.transformationId,  // transformation ID
            1.0,  // confidence
            'transformation_executor'
        );
    }
}
```

---

### Priority 4: Create Transformation → Insight Links

**Action**: Add link creation in analysis execution.

**Location**: `server/services/analysis-execution.ts:833-845`

**Implementation**:
```typescript
// Add to semantic-data-pipeline.ts
async linkTransformationToInsight(
    projectId: string,
    transformationId: string,
    insightId: string,
    confidence: number = 1.0
): Promise<void> {
    await storage.createSemanticLink({
        projectId,
        linkType: 'transformation_insight',
        sourceId: transformationId,
        sourceType: 'transformation',
        targetId: insightId,
        targetType: 'insight',
        confidence,
        metadata: { linkedAt: new Date().toISOString() }
    });
}

// Then call in analysis-execution.ts after creating insights
for (const insight of allInsights) {
    const relatedTransformations = this.findRelatedTransformations(insight, transformationMetadata);
    for (const transId of relatedTransformations) {
        await semanticDataPipeline.linkTransformationToInsight(
            request.projectId,
            transId,
            insight.id,
            insight.confidence
        );
    }
}
```

---

### Priority 5: Use Business Definitions Consistently

**Action**: Ensure all transformation operations use businessContext where available.

**Location**: `server/routes/project.ts:8142-8240`

**Implementation**:
- **'filter'**: ✅ Already using validRange (line 8155)
- **'derive'**: ✅ Already using componentFields and aggregationMethod (line 8225)
- **'aggregate'**: ❌ Add business context support
- **'join'**: ❌ Add business context support
- **'rename'**: ❌ Add business context support

---

### Priority 6: Connect Intent Analysis to Execution

**Action**: Use question intents during analysis execution to filter/select appropriate analyses.

**Location**: `server/services/analysis-execution.ts:630-681`

**Implementation**:
```typescript
// Load question intents from journeyProgress
const questionIntents = journeyProgress.questionIntents || {};

// Filter analysis types based on intent
const filteredAnalysisTypes = request.analysisTypes.filter(analysisType => {
    // Check if this analysis type is recommended for any question's intent
    for (const qId of Object.keys(questionIntents)) {
        const intent = questionIntents[qId];
        if (intent?.recommendedAnalysisTypes?.includes(analysisType)) {
            return true;
        }
    }
    return false;
});
```

---

## Summary

| Issue | Severity | Impact | Fix Complexity |
|-------|----------|---------|----------------|
| Issue 1: Question → Element Link Timing | High | No semantic traceability | Medium |
| Issue 2: Business Definition Mismatch | Medium | Inconsistent transformations | Low |
| Issue 3: Column Mapping Propagation | High | Mappings not used | Low |
| Issue 4: RequiredDataElements Empty | Critical | Semantic links not created | Medium |
| Issue 5: Evidence Chain Incomplete | High | No traceability | Medium |
| Issue 6: Intent Not Used | Medium | Wrong analyses selected | Low |
| Issue 7: Semantic Links Not Created | Critical | No traceability | Low |

**Critical Path**:
1. Fix Issue 4 (RequiredDataElements Empty) - Enables semantic links
2. Fix Issue 1 (Question → Element Link Timing) - Creates semantic links
3. Fix Issue 3 (Column Mapping Propagation) - Ensures mappings are used
4. Fix Issue 5 (Evidence Chain Incomplete) - Completes traceability

---

## Testing Recommendations

After fixes, validate the pipeline with:

1. **End-to-End Test**: Upload data → Set questions → Run Prepare → Verify element mappings → Transform → Execute → Check results
2. **Traceability Test**: Verify semantic_links table has:
   - question_element links
   - element_transformation links
   - transformation_insight links
3. **Business Context Test**: Verify business definitions are used in all transformation types
4. **Intent Test**: Verify question intents drive analysis type selection

---

## Conclusion

The platform has the foundational infrastructure for the Question → Element → Transformation → Analysis chain, but the connections between these components are not fully established during the workflow. The fixes above will ensure that:

1. Questions are linked to elements via semantic embeddings
2. Elements are transformed using business definitions
3. Transformations are traced to insights
4. Users can see the complete evidence chain from their questions to results

**Next Step**: Implement Priority 1-4 fixes to establish the core traceability chain, then enhance with Priority 5-6 for intelligent execution.
