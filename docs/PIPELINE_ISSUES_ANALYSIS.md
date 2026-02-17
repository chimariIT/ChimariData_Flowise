# Chimaridata Pipeline: Comprehensive Issue Analysis

**Date**: February 11, 2026 (Rev 3: Added data continuity, admin, and billing analysis)
**Scope**: End-to-end pipeline from data element decomposition through results presentation
**Files Analyzed**: 55+ core files, ~35,000 lines of TypeScript + 4,600 lines of Python

---

## Executive Summary

The platform has a sophisticated architecture with multi-agent coordination, progressive artifacts, and multi-tier fallback strategies. However, **14 systemic root causes** produce cascading failures across all pipeline stages. Fixing these root causes will resolve the majority of observed issues.

Rev 3 adds three critical dimensions missed in prior revisions: (1) **end-to-end data continuity** tracing goals→questions→elements→mappings→transformations→execution→results, (2) **admin configuration** gaps and cache staleness, and (3) **comprehensive billing/payment** architecture issues.

### Root Causes at a Glance

| # | Root Cause | Stages Affected | Severity |
|---|-----------|----------------|----------|
| RC-1 | Transformation compiler passes empty dependency array | Steps 3-4-6 | **CRITICAL** |
| RC-2 | Source-to-target mappings not fully persisted to DB | Steps 3-4-5-6 | **CRITICAL** |
| RC-3 | Analysis-type-specific data prep missing from pipeline | Steps 4-6 | **CRITICAL** |
| RC-8 | **Multi-dataset join config silently discarded on navigation** | Steps 1-3-5-6 | **CRITICAL** |
| RC-9 | **PII leakage when analysis falls back to raw dataset.data** | Steps 1-5-6 | **CRITICAL** |
| RC-10 | **End-to-end data continuity broken at 5 handoff points** | Steps 1-2-3-5-6-8 | **CRITICAL** |
| RC-4 | Disconnected pricing calculation paths | Steps 5-7 | **HIGH** |
| RC-5 | Evidence chain (question→insight) uses brittle keyword matching | Steps 6-8 | **HIGH** |
| RC-11 | **Payment status field mismatch across 3 naming conventions** | Steps 5-7-8 | **HIGH** |
| RC-12 | **Post-payment redirect points to 3 different URLs** | Step 7-8 | **HIGH** |
| RC-13 | **Admin pricing cache never invalidated after changes** | Steps 4-7 | **HIGH** |
| RC-14 | **Checkout metadata missing analysisType, lockedCostCents** | Step 7 | **HIGH** |
| RC-6 | Field name inconsistency across services | All steps | **MEDIUM** |
| RC-7 | Semantic pipeline tables stubbed as null | Steps 3-6-8 | **MEDIUM** |

---

## Stage-by-Stage Issue Decomposition

---

### STAGE 1: Required Data Elements Decomposition

**Files**: `server/services/tools/required-data-elements-tool.ts` (3,287 lines), `server/services/business-definition-registry.ts` (~800 lines)

#### What's Working
- Progressive artifact design (Phase 1→2→3) is architecturally sound
- 9-tier scoring in `findCandidateFieldsEnhanced()` with 50+ domain patterns
- Business definition enrichment with formula decomposition
- Multi-strategy element-to-analysis linking (4 fallback tiers)

#### What's Broken

**Issue 1.1: Irrelevant Data Elements Generated**
**Symptom**: Elements like "Company Is Turnover Rate" appear that don't directly map to dataset columns
**Root Cause**: Phase 1 `defineRequirements()` generates CONCEPTUAL elements (business metrics), not column references. This is by design (line 256-267). However, the **naming** can be misleading — "Company Is Turnover Rate" should be "Turnover Rate" with calculation metadata.
**Location**: `required-data-elements-tool.ts:280-351` (enrichment step)
**Fix**: The DS Agent prompt at `inferRequiredDataElementsFromAnalyses()` needs tighter constraints:
- Element names must be clean metric/dimension names (not sentences)
- Element must have `calculationType` set (direct vs derived vs composite)
- Derived elements MUST have `formula.componentFields` populated

**Issue 1.2: Fallback Over-Inclusion**
**Symptom**: All numeric elements get added to analysis paths that don't need them
**Root Cause**: Line ~453 fallback: "If nothing else matches, use ALL numeric elements"
**Location**: `required-data-elements-tool.ts:453`
**Fix**: Replace with type-specific defaults:
- Descriptive → all numeric + categorical dimensions
- Correlation → numeric only
- Regression → numeric target + numeric/categorical predictors
- Clustering → numeric features only

**Issue 1.3: Business Definition Lookup Timeout Silently Drops Enrichment**
**Symptom**: Elements arrive at mapping step without formulas or componentFields
**Root Cause**: 10-second parallel timeout (line 280-351) — if enrichment is slow, elements proceed WITHOUT calculation definitions
**Fix**: Make enrichment blocking (not parallel) OR increase timeout to 30s OR cache definitions

---

### STAGE 1B: Multi-Dataset Joining (RC-8) — CRITICAL

**Files**: `client/src/pages/data-transformation-step.tsx` (5,000+ lines), `server/routes/project.ts:7404-8182`

> **Critique Response**: Rev 1 incorrectly listed "Multi-dataset join validation" as Working in Stage 5. The Antigravity Agent critique correctly identified that join configurations are **silently discarded** when the user navigates without clicking "Execute Transformations". Code verification confirms this.

#### What's Actually Broken

**Issue 1B.1: JoinConfig Only Persisted via Execute Endpoint — CRITICAL**
**Symptom**: User uploads 2+ datasets, frontend auto-detects join keys, but if user clicks "Next" instead of "Execute Transformations", secondary datasets are silently ignored during analysis.
**Root Cause**: `joinConfig` is ONLY sent to the backend inside the `executeTransformations` payload (`data-transformation-step.tsx:1985-1990`). The `handleNext()` function (`data-transformation-step.tsx:2464-2502`) updates `journeyProgress` but does NOT include `joinConfig` in the update.
**Evidence**:
- `server/routes/project.ts:8182` — joinConfig persisted ONLY inside `execute-transformations` endpoint
- `data-transformation-step.tsx:2464-2502` — `handleNext()` saves `joinedData.preview`, `schema`, `rowCount` but NOT `joinConfig`
- `analysis-execution.ts:732-748` — Checks for `transformedData` at execution time and throws error, but by then user is already 3 steps ahead

**Impact**: All secondary datasets silently lost. Analysis runs on primary dataset only. User gets results that appear complete but are based on partial data.

**Fix**:
1. **Mandatory execution gate**: Block "Next" navigation if `allDatasets.length > 1` and `joinConfig.enabled` but transformations not yet executed. The current `promptJoinApproval()` dialog (`data-transformation-step.tsx:2153-2161`) exists but can be dismissed.
2. **Auto-persist joinConfig on navigation**: Even if user doesn't click Execute, save `joinConfig` to `journeyProgress.joinedData.joinConfig` in `handleNext()`:
```typescript
// In handleNext(), add to updateProgressAsync:
joinedData: {
  ...existing,
  joinConfig: allDatasets.length > 1 ? joinConfig : null,  // ADD THIS
  preview: previewData,
  schema: previewSchema,
}
```
3. **Backend validation**: In analysis-execution route, if `journeyProgress.joinedData.joinConfig` exists but no `transformedData` — return 400 with actionable message directing user back to transformation step.

---

### STAGE 1C: PII Data Safety (RC-9) — CRITICAL

**Files**: `server/routes/project.ts:4316-4350,8345-8477`, `server/services/analysis-execution.ts:1860-1999`, `server/services/pii-helper.ts`

> **Critique Response**: Rev 1 mentioned PII column exclusion as "Working" in Stage 5 and referenced SSOT violations in passing. The Antigravity Agent critique correctly identified that the raw data fallback path can **leak unmasked PII to analysis engines**. Code verification confirms this is a real vulnerability.

#### The Vulnerability Chain

1. **Upload**: `dataset.data` stores raw, unmasked PII (`project.ts:4348` — `data: processedData.data`). PII is detected (`PIIAnalyzer.analyzePII()`) but NOT masked at this point.
2. **PII Decision**: User marks columns for exclusion. `apply-pii-exclusions` endpoint (`project.ts:8345-8477`) filters `dataset.data` in-place. **But this step can be skipped or fail.**
3. **Fallback**: `extractDatasetRows()` (`analysis-execution.ts:1924-1956`) falls back to raw `dataset.data` if no `transformedData` exists.
4. **Filter Gate**: `filterPIIColumns()` (`analysis-execution.ts:1860-1889`) is called with `columnsToExclude` from `journeyProgress.piiDecisions`. **If `piiDecisions` is empty or unset, the filter returns data unchanged.**
5. **Leak**: Raw PII reaches Python analysis scripts (`python/*.py`).

#### When PII Leaks

| Scenario | piiDecisions set? | transformedData exists? | dataset.data masked? | PII Leaks? |
|----------|-------------------|------------------------|---------------------|------------|
| Normal path | Yes | Yes | Yes | No |
| Skip transformation | Yes | **No** | Yes (if apply-pii ran) | No* |
| Skip PII step entirely | **No** | No | **No** | **YES** |
| apply-pii-exclusions fails | **Partial** | No | **No** | **YES** |
| Go back and re-upload | May be stale | May be stale | **No** (fresh upload) | **YES** |

*Only safe if `apply-pii-exclusions` succeeded AND `filterPIIColumns()` receives a non-empty set.

**Fix** (Defense in Depth):
1. **Hard gate at analysis execution**: Before `extractDatasetRows()`, check if project has PII detection results (`dataset.piiAnalysis`) but empty `columnsToExclude`. If PII was detected but no decision was made, BLOCK execution:
```typescript
if (dataset.piiAnalysis?.hasPII && (!columnsToExclude || columnsToExclude.size === 0)) {
  throw new Error('PII detected but no exclusion decision recorded. Complete the PII review step first.');
}
```
2. **In-memory PII masking on fallback**: If falling back to raw data AND PII was detected, apply masking in-memory regardless of `columnsToExclude`:
```typescript
if (usingRawFallback && dataset.piiAnalysis?.piiColumns?.length > 0) {
  const piiCols = new Set(dataset.piiAnalysis.piiColumns.map(c => c.columnName));
  result = result.map(row => {
    const clean = {...row};
    for (const col of piiCols) delete clean[col];
    return clean;
  });
}
```
3. **Mask at upload time**: Optionally, store a `dataset.maskedData` copy alongside `dataset.data` at upload, where detected PII columns are removed. Use `maskedData` as the fallback instead of raw `data`.

---

### STAGE 1D: End-to-End Data Continuity (RC-10) — CRITICAL

**Files**: Multiple — this is a cross-cutting issue affecting the entire pipeline

> **Rev 3 Addition**: The previous revisions focused on individual component bugs but missed the systemic issue: the **semantic thread** connecting user goals → business questions → data elements → mappings → transformations → execution → results → answers is **broken at 5 critical handoff points**. Data enters each stage but context about *why* it exists (which question it answers, which goal it serves) is lost or degraded.

#### The Continuity Chain (Expected vs. Actual)

```
EXPECTED:
Goal → Question(q_1) → Element(turnover_rate, questionId=q_1) → Mapping(turnover_rate→Termination_Date)
  → Transformation(count separated by date) → Execution(correlation on turnover_rate)
  → Insight(i_1, answersQuestion=q_1) → Answer("Turnover rate correlates with...")

ACTUAL:
Goal → Question("What is our turnover?") → Element(relatedQuestions=["What is our turnover?"])
  → Mapping(sourceColumn=null in requirementsDoc) → Transformation(businessContext logged but unused)
  → Execution(keyword match "turnover" vs insight text) → Insight(answersQuestions=maybe)
  → Answer(may match wrong question)
```

#### Break Point 1: Question Linkage via Text, Not IDs

**Location**: `required-data-elements-tool.ts:31,1212-1213`
**Problem**: `relatedQuestions: string[]` stores the full question *text*, not stable question IDs. Downstream services can't reliably join elements back to questions.
**Evidence**:
```typescript
// Line 31: Type definition
relatedQuestions: string[]; // The business questions this element helps answer

// Line 1213: ID generation is a HACK - sequential index, not tied to actual question IDs
questionIds: inferredEl.relatedQuestions?.map((q, idx) => `q-${idx}`),
```
The `q-{idx}` IDs generated at line 1213 are local indices within the element's `relatedQuestions` array — they do NOT match the `q_1, q_2` IDs used in `questionAnswerMapping` at analysis execution time (line 837: `questionId: \`q_${idx + 1}\``). This means element-to-question linkage is **impossible to trace** from the artifact alone.

**Impact**: Cannot determine which data elements serve which user questions. Audit trail is broken. The evidence chain cannot prove "this analysis answered that question."

**Fix**:
1. Store stable question IDs (e.g., `q_1`, `q_2`) in `relatedQuestions` instead of text
2. Generate question IDs at the goals/questions step and persist to `journeyProgress.businessQuestions[].id`
3. Pass question IDs through to elements, transformations, and insights

#### Break Point 2: Element Mappings Split Across Two Sources

**Location**: `required-data-elements-tool.ts:1214` (sets `sourceAvailable: false`), `source-column-mapper.ts` (performs actual mapping)
**Problem**: After the DS Agent creates elements, `sourceColumn` is always `null` in the `requirementsDocument`. The actual column mapping happens later in `source-column-mapper.ts` and is stored in `dataset.ingestionMetadata.columnMappings` — a DIFFERENT location. No service merges these two sources.
**Evidence**:
- `required-data-elements-tool.ts:1214`: `sourceAvailable: false` — always starts unmapped
- Mappings stored in `dataset.ingestionMetadata.columnMappings` (RC-2: often not persisted)
- `requirementsDocument.requiredDataElements[].sourceColumn` stays `null`
- No service writes back the resolved mapping to the requirements document

**Impact**: If you read `requirementsDocument` at any later stage (e.g., analysis execution), `sourceColumn` is null even though the user mapped it in the UI. Services that need to know which columns feed which elements must check a separate, inconsistent location.

**Fix**:
1. After mapping completes, write back `sourceColumn` to `requirementsDocument.requiredDataElements[]`
2. Create a single accessor: `getResolvedMappings(project)` that merges both sources
3. Fix RC-2 (persist columnMappings) as prerequisite

#### Break Point 3: Business Definitions Loaded but IGNORED in Transformation

**Location**: `server/routes/project.ts:7525-7545` (loaded), `project.ts:7647-7665` (logged), transformation switch statement (NOT USED)
**Problem**: The `businessContext` dictionary is correctly constructed from `requirementsDocument.requiredDataElements[].calculationDefinition` at lines 7525-7545. It is **logged** at lines 7647-7665. But the actual transformation generation switch statement does NOT reference `businessContext` for deriving transformation logic.
**Evidence**:
```
Line 7529: Loading business context from ${reqDoc.requiredDataElements.length} DS Agent elements  ← LOADS
Line 7542: ${elementName}: ${calcDef.calculationType} - ${calcDef.formula?.businessDescription}   ← LOGS
```
The `businessContext` variable is passed to some helper functions but the core transformation switch that decides WHAT transformations to create doesn't use the business definitions to INFORM the transformation type. The transformation compiler relies on the `calculationDefinition` passed directly through `elementDefinitions`, not the enriched business context.

**Impact**: If the DS Agent specifies a nuanced business formula (e.g., "Annual Turnover Rate = (Separations / Avg Headcount) × 100, where Separations are voluntary only"), the business context is loaded but the transformation may generate a simpler formula because the switch statement doesn't consult it.

**Fix**:
1. Pass `businessContext` into `TransformationCompiler.compile()` as a parameter
2. Use `businessContext[elementName].formula.businessDescription` to inform code generation
3. The compiler should check `businessContext` for element-specific business rules

#### Break Point 4: Analysis Insights NOT Linked to Questions via Stable IDs

**Location**: `analysis-execution.ts:895-948`
**Problem**: After analysis execution, insights are tagged with `answersQuestions[]` using **keyword matching** (RC-5). There is no `questionId` field on the insight type at creation time. The linkage is post-hoc, brittle, and lossy.
**Evidence**:
```typescript
// Line 937-939: answersQuestions is OPTIONAL and based on keyword matching
const taggedInsight = {
  ...insight,
  answersQuestions: relatedQuestionIds.length > 0 ? relatedQuestionIds : undefined
};
```
The `questionAnswerMapping` at line 836-843 generates `q_1, q_2` IDs from `businessQuestions` text. Insights from Python scripts have NO concept of which question they serve. The only linkage is text similarity between question text and insight title+description.

**Impact**: If a question is "What drives employee turnover?" and an insight title is "Attrition correlates with department size", keyword matching fails ("turnover" ≠ "attrition"). The question gets no answer even though the insight is directly relevant.

**Fix**: (Depends on fixing Break Point 1)
1. Pass question IDs through to Python scripts as part of the analysis config
2. Each Python script returns insights with `forQuestionId` field
3. Keyword matching becomes a FALLBACK, not the primary linkage mechanism

#### Break Point 5: Verification Step Does Not Confirm Element Satisfaction

**Location**: Gap between data verification step and element requirements
**Problem**: After the user verifies data quality, there's no check that the uploaded dataset(s) actually CONTAIN columns needed by the required data elements. The verification step checks data quality (nulls, types, distributions) but doesn't validate against the requirements document.
**Evidence**: No code in the verification endpoint references `requirementsDocument.requiredDataElements`. The verification step and the mapping step are disconnected — you can verify data quality as "good" even if key columns are missing entirely.

**Impact**: User proceeds through verification with confidence, only to discover at the mapping step that critical columns are absent. By then they're 2 steps deep and must backtrack.

**Fix**:
1. At verification completion, cross-reference `dataset.columns` against `requirementsDocument.requiredDataElements[].sourceColumn` (or component fields)
2. Show warnings: "3 of 8 required elements have no matching column in your dataset"
3. Provide suggestions: "Upload additional data" or "Adjust requirements"

---

### STAGE 2: Source-to-Target Mapping

**Files**: `server/services/source-column-mapper.ts` (1,202 lines), `client/src/components/DataElementsMappingUI.tsx` (~800 lines)

#### What's Working
- 7-tier fallback matching (exact → normalized → RAG → fuzzy → semantic → embedding)
- Semantic column discovery for composite elements
- Cardinality-based identifier selection
- UI properly syncs auto-mappings via useEffect

#### What's Broken

**Issue 2.1: Mapped Source Columns NOT Persisted (RC-2)**
**Symptom**: After user maps elements and navigates away, mappings are lost
**Root Cause**: `server/routes/project.ts:6343-6355` saves `transformedData` but NOT `columnMappings`. The evidence chain breaks — you can't trace which columns fed which elements.
**Location**: `server/routes/project.ts` (transformation execute endpoint)
**Fix**:
```typescript
await storage.updateDataset(primaryDataset.id, {
  ingestionMetadata: {
    ...existing,
    columnMappings: req.body.mappings,  // ADD THIS
    transformedData: workingData,
    transformedAt: new Date().toISOString()
  }
} as any);
```

**Issue 2.2: Field Name Inconsistency (RC-6)**
**Symptom**: Auto-mappings sometimes don't display in UI
**Root Cause**: Three different field names used for the same concept:
- `sourceField` (backend primary)
- `sourceColumn` (frontend expects this)
- `mappedColumn` (used in some places)
**Location**: UI checks all three at line 176: `elem.sourceColumn || elem.sourceField || elem.mappedColumn`
**Fix**: Standardize on `sourceColumn` everywhere, remove aliases

**Issue 2.3: AI Mapping Confidence Threshold Logic**
**Symptom**: AI sometimes doesn't override poor pattern matches
**Root Cause**: Line 704: `aiConfidence >= existingConfidence * 0.9` — an 85% AI match won't override an 82% pattern match (threshold = 73.8%, so it does pass, but the logic is confusing)
**Fix**: Simpler: `if (!element.sourceAvailable || aiConfidence > existingConfidence)`

**Issue 2.4: Composite Element Source Columns Array**
**Symptom**: Screenshot shows "Company Is Turnover Rate" with source columns `number_of_employees_left, average_number_of_employees` — these are ABSTRACT component field names, not actual dataset columns
**Root Cause**: After DS Agent sets componentFields, the mapper should resolve them to actual columns (e.g., `Termination_Date`, `Employee_ID`). But if `matchComponentFields()` fails to find matches OR the enriched descriptors aren't available, the abstract names persist.
**Location**: `required-data-elements-tool.ts:542-592` (enrichment) + `source-column-mapper.ts:1559-1793` (matching)
**Fix**:
1. Ensure `enrichDefinitionWithDatasetContext()` is called BEFORE mapping
2. If abstract names can't be resolved, mark element as "needs_manual_mapping" (not auto-resolved)
3. UI should show warning for unresolved abstract component fields

---

### STAGE 3: Analysis-Type-Specific Data Transformation

**Files**: `server/services/transformation-compiler.ts` (856 lines), `python/execute_transformations.py` (300+ lines)

#### What's Working
- Multi-step KPI compilation (row-level → aggregate → formula)
- Multi-engine support (Polars/Pandas/JS based on row count)
- Python execution script handles 12+ aggregation methods
- Date-aware calculations with semantic null interpretation

#### What's Broken

**Issue 3.1: Empty Dependency Array (RC-1) — CRITICAL**
**Symptom**: Multi-step transformations execute in wrong order, derived columns reference columns that don't exist yet
**Root Cause**: `transformation-compiler.ts:134` passes `[]` as `allElements`:
```typescript
dependencies: this.resolveDependencies(element, sourceColumns, [])
//                                                              ^^ BUG: should be all elements
```
**Impact**: If Element B (Turnover Rate formula) depends on Element A (_is_separated indicator), the dependency isn't detected. Execution order may be wrong.
**Fix**: Pass the full elements array:
```typescript
dependencies: this.resolveDependencies(element, sourceColumns, allElementsBeingCompiled)
```

**Issue 3.2: No Analysis-Type-Specific Preparation (RC-3) — CRITICAL**
**Symptom**: Per the PDF requirements, each analysis type needs specific data prep (e.g., regression needs train/test split, encoding, multicollinearity check). Currently, transformations only create derived columns — they don't prepare data FOR specific analysis types.
**Root Cause**: The transformation pipeline creates new columns (aggregations, formulas) but doesn't:
- Handle missing values per analysis requirements
- Encode categorical variables for regression/ML
- Normalize/standardize features for clustering
- Check linearity assumptions for regression
- Split data into train/test sets

These happen INSIDE the Python scripts at execution time, but the **transformation step** (Step 4) doesn't communicate what prep each analysis needs.
**Location**: Gap between `transformation-compiler.ts` and `python/*.py`
**Fix**: Add analysis-type-specific preparation as additional transformation steps:
```typescript
// After element-level transformations, add per-analysis prep
for (const analysis of analysisPath) {
  const prepSteps = getAnalysisPreparationSteps(analysis.analysisType, transformedSchema);
  transformationPlan.push(...prepSteps);
}
```

**Issue 3.3: Circular Dependency Silently Ignored**
**Symptom**: If circular deps exist, transformations run in original (wrong) order
**Root Cause**: `transformation-compiler.ts:796`: `console.warn(...)` then returns unsorted array
**Fix**: Throw error with specific cycle information

**Issue 3.4: exec() Security Risk in Python**
**Symptom**: Generated code executed via `exec()` in `execute_transformations.py:76,166,218,286`
**Root Cause**: AI-generated Python code is executed directly without sandboxing
**Mitigation**: Add validation that generated code only uses allowed operations (no `import`, `os`, `subprocess`, `eval`, etc.)

---

### STAGE 4: Analysis Plan & Cost Estimation

**Files**: `server/services/project-manager-agent.ts`, `server/services/cost-estimation-service.ts`, `server/services/pricing.ts`, `shared/pricing-config.ts`

#### What's Working
- PM Agent coordinates DS, DE, BA for plan generation
- Lock mechanism prevents concurrent plan creation
- Industry auto-detection with 6+ industry patterns
- Dual cost estimation with fallback (CostEstimationService → PricingService)

#### What's Broken

**Issue 4.1: Disconnected Pricing Systems (RC-4) — HIGH**
**Symptom**: "Estimated cost is not accurate and likely not coming from Admin configured values" (from PDF requirements)
**Root Cause**: Three independent pricing calculations:
1. `CostEstimationService` — uses hardcoded constants ($0.50 base, $0.10/1K rows)
2. `server/routes/analysis-payment.ts:buildPricing()` — uses $5 base + size/complexity multipliers
3. Frontend `calculatePricing()` — journey-based prices ($29-$99)

These produce DIFFERENT numbers for the same analysis.
**Fix**: Single pricing authority:
1. Admin UI configures prices in DB (`admin-billing` routes)
2. `CostEstimationService` reads from DB (not hardcoded)
3. All other callers delegate to `CostEstimationService`
4. Frontend displays backend-calculated price ONLY

**Issue 4.2: Plan Step Analysis Costs Not Synced to Execution**
**Symptom**: Plan shows estimated cost, but execution uses different calculation
**Root Cause**: Plan step calculates cost via PM Agent's `estimateCost()`, execution calculates via separate path
**Fix**: Lock cost in `journeyProgress.lockedCostEstimate` at plan approval. Execution reads from there.

**Issue 4.3: Quota Validation Shows $0 Overage**
**Symptom**: "Quota validation and overage price $0 does not match the analysis costs" (from PDF)
**Root Cause**: Quota check returns "exceeded" but overage price calculation uses uninitialized or zero values
**Location**: `routes/analysis-execution.ts:288-325`
**Fix**: Ensure overage calculation uses same pricing as plan estimate

**Issue 4.4: Plan Modal Text Not Dynamic**
**Symptom**: "Some of the text on the analysis plan modals are not dynamic" (from PDF)
**Root Cause**: Static strings in Plan Step UI instead of data from DS Agent recommendations
**Fix**: Map plan step descriptions from `analysisPath[].description` and `expectedArtifacts[]`

---

### STAGE 5: Analysis Execution

**Files**: `server/services/analysis-execution.ts` (2,915 lines), `server/routes/analysis-execution.ts` (877 lines), `python/*.py` (4,631 lines)

#### What's Working
- Per-analysis parallel execution with Promise.allSettled
- 8-phase orchestrator workflow
- Compute engine selection (Local/Polars/Spark)
- Multi-dataset join validation **(PARTIAL — see RC-8: join config can be silently lost before this check runs)**
- PII column exclusion **(CONDITIONAL — see RC-9: only works if `piiDecisions` is populated and `apply-pii-exclusions` succeeded)**
- Subscription-first payment gate with idempotent credit deduction

#### What's Broken

**Issue 5.1: 404 Error on Results Fetch**
**Symptom**: `GET /api/analysis-execution/results/68scaNcAWJEupM2szuKlN 404` (from PDF)
**Root Cause**: Multiple possible causes:
1. Project ID format mismatch (nanoid vs uuid)
2. `canAccessProject()` returns "Project not found" → 404 (line 662)
3. Analysis ran but `analysisResults` never saved (transaction failure)
4. `executionStatus` not set to 'executing' before async execution starts
**Location**: `routes/analysis-execution.ts:646-720`
**Fix**:
1. Add logging of project ID format at route entry
2. Verify transaction commits properly in `analysis-execution.ts:1061-1087`
3. Set `executionStatus = 'executing'` BEFORE spawning async work (currently done at line 362)
4. Add explicit error handling if project save fails after analysis completes

**Issue 5.2: Transformed Data Not Used Consistently**
**Symptom**: Analysis runs on raw data instead of transformed data
**Root Cause**: `extractDatasetRows()` priority chain checks `ingestionMetadata.transformedData` first, but if transformation step didn't save properly (Issue 2.1), it falls back to raw data
**Fix**: If `journeyProgress.completedSteps` includes 'transformation' but no transformedData exists, throw error instead of silently falling back

**Issue 5.3: Kendall Correlation P-Value Bug**
**Location**: `python/correlation_analysis.py:80` — uses placeholder `p_val = 0.05`
**Fix**: Calculate actual p-value using normal approximation

**Issue 5.4: No Per-Analysis Timeout**
**Symptom**: Single slow analysis blocks entire execution
**Root Cause**: `Promise.allSettled()` has no per-promise timeout
**Fix**: Wrap each analysis promise in `Promise.race()` with 5-minute timeout

**Issue 5.5: Regression Script Config Parsing**
**Symptom**: Regression analysis may fail if config passed via env var or stdin
**Root Cause**: `regression_analysis.py` only reads `sys.argv[1]`, unlike other scripts that check env var → stdin → argv
**Fix**: Standardize all scripts to same 3-priority config parsing

---

### STAGE 6: Question Reconciliation / Evidence Chain

**Files**: `server/services/analysis-execution.ts:776-934`, `server/services/semantic-data-pipeline.ts`

#### What's Working
- Two-stage matching (analysis type alignment + keyword matching)
- Question-answer service with AI-generated answers
- Reverse map building (questionId → [insightIds])
- Question ID stability (q_1, q_2, etc.)

#### What's Broken

**Issue 6.1: Brittle Keyword Matching (RC-5) — HIGH**
**Symptom**: Questions get wrong insights or no insights mapped
**Root Cause**: `analysis-execution.ts:900-934` uses keyword matching (2+ matches OR 30% threshold). "budget" doesn't match "spending". "turnover" won't match "attrition" algorithmically.
**Fix**: Use embedding-based semantic similarity for question-insight matching:
```typescript
// Instead of keyword matching:
const similarity = await embeddingService.cosineSimilarity(
  questionEmbedding, insightEmbedding
);
if (similarity > 0.7) tagInsight(questionId, insightId);
```

**Issue 6.2: Semantic Pipeline Tables Null (RC-7)**
**Symptom**: Evidence chain storage fails silently
**Root Cause**: `semantic-data-pipeline.ts:29-32` stubs tables as null:
```typescript
const dataElements: any = null;
// Later: await db.insert(dataElements).values({...})  // FAILS
```
**Fix**: Either use the `semantic_links` unified table, or re-enable the legacy tables

**Issue 6.3: QA Service Failure Silently Continues**
**Symptom**: User sees empty question answers without error indication
**Root Cause**: `analysis-execution.ts:1162-1185` catches QA error and continues
**Fix**: Surface failure status to frontend with retry option

---

### STAGE 7: Billing & Payment (Expanded in Rev 3)

**Files**: `server/services/billing/unified-billing-service.ts` (2,300+ lines), `server/routes/analysis-payment.ts` (550 lines), `server/routes/payment.ts` (330 lines), `server/routes/admin-billing.ts` (1,200+ lines), `server/services/pricing.ts` (400+ lines), `server/services/cost-estimation-service.ts` (500+ lines), `client/src/pages/pricing-step.tsx`, `client/src/pages/analysis-payment.tsx`

> **Rev 3 Addition**: Previous revisions identified billing issues at a surface level. This section now provides a comprehensive 12-issue decomposition of the billing/payment architecture.

#### What's Working
- Unified billing service (canonical, 2,300+ lines)
- Subscription-first model with tier checks
- Trial credits with idempotent deduction
- Stripe webhook handling with DB-backed idempotency (partially)
- Preview results gating for unpaid users
- Admin pricing CRUD endpoints (admin-billing.ts)
- Campaign/coupon validation (separate from application)

#### What's Broken

**Issue 7.1: Three Competing Pricing Systems (RC-4, expanded)**
**Symptom**: User sees different prices at different stages of the journey
**Root Cause**: Three independent pricing calculators produce different results:
- **System A** — `CostEstimationService` (`server/services/cost-estimation-service.ts`): Uses admin-configured tiered pricing matrix per analysis type × volume tier × complexity
- **System B** — `buildPricing()` in `analysis-payment.ts:43-88`: Delegates to CostEstimationService (System A) — so these ARE now aligned
- **System C** — `calculatePricing()` in `client/src/pages/pricing-step.tsx:386-425`: Client-side pricing with different base constants (`runtimeConfig?.basePlatformFee ?? 0.50` vs backend values)
**Evidence**: Frontend System C uses a potentially stale `runtimeConfig` value. If admin changes pricing in the backend, the frontend doesn't know until page refresh — and even then, the formulas may differ.
**Fix**: Frontend MUST NOT calculate prices independently. All pricing must come from a single backend API: `GET /api/projects/:id/cost-estimate`. Frontend displays only backend-calculated values.

**Issue 7.2: Payment Status Field Mismatch (RC-11) — HIGH**
**Symptom**: Successful payments appear FAILED or status checks inconsistent
**Root Cause**: Three different field names used to track payment status:
- `project.isPaid` (boolean) — used in `analysis-execution.ts:201`, `analysis-payment.ts:333,435`
- `paymentComplete` (boolean) — returned by `analysis-payment.ts:338`
- `paymentStatus` (string: 'paid'|'pending') — expected by `client/src/pages/analysis-payment.tsx:435-441`
**Evidence**:
```typescript
// Backend sets: (analysis-payment.ts:333,338)
await storage.updateProject(projectId, { isPaid: true } as any);
res.json({ success: true, paymentComplete: true });

// Frontend checks: (analysis-payment.tsx:435)
if (data?.paymentComplete) // Works IF backend returns paymentComplete

// But payment.ts uses different field:
res.json({ status: 'verified' }); // Frontend expects 'paymentStatus' not 'status'
```
**Fix**: Standardize on a single payment status contract:
1. Backend always returns `{ isPaid: boolean, paymentStatus: 'paid'|'pending'|'failed' }`
2. Frontend checks `response.isPaid` only
3. Remove `paymentComplete`, `status: 'verified'` variants

**Issue 7.3: Post-Payment Redirect Points to 3 Different URLs (RC-12) — HIGH**
**Symptom**: "Post checkout goes to a restart journey project view instead of presenting results"
**Root Cause**: Three places define post-payment redirect, each differently:
1. **Stripe success_url** (`unified-billing-service.ts:1807`): `/journeys/${journeyType}/execute?projectId=...&payment=success`
2. **Frontend return_url** (`analysis-payment.tsx:114`): `/projects/${projectId}` (project dashboard root)
3. **Frontend onSuccess** (`analysis-payment.tsx:960-964`): navigates to `/journeys/${jType}/execute`

URL #1 goes to the execute step (correct but pre-results). URL #2 goes to the project overview (wrong — shows journey start). URL #3 goes to execute step (correct but duplicates #1).

**Fix**: All three must point to the same URL: `/journeys/${journeyType}/results?projectId=${projectId}` (or execute step with auto-redirect to results when complete).

**Issue 7.4: Locked Cost Not Reliably Persisted (RC-4 cascading)**
**Symptom**: Cost changes between plan approval and payment
**Root Cause**: Cost locking exists (`project.ts:9366-9391` — `lock-cost-estimate` endpoint) and reads from journeyProgress SSOT (`project.ts:8973-8990`). However:
1. The lock endpoint requires explicit frontend call — if the frontend doesn't call it at plan approval, the cost is never locked
2. Two sources checked: `journeyProgress.lockedCostEstimate` then `project.lockedCostEstimate` (dual read)
3. Race condition: if pricing changes between plan approval and lock API call, user pays different amount
**Fix**:
1. Auto-lock cost at plan approval step (not as a separate API call)
2. Persist to SSOT (`journeyProgress.lockedCostEstimate`) ONLY — remove project-level fallback
3. Payment endpoint must REJECT if lockedCostEstimate is missing (already does at `analysis-payment.ts:244-254`)

**Issue 7.5: Stripe Checkout Metadata Missing Key Fields (RC-14) — HIGH**
**Symptom**: Cannot reconcile Stripe transactions to specific analysis types or locked costs
**Root Cause**: Checkout session metadata (`unified-billing-service.ts:1832-1838`) includes `projectId`, `userId`, `type`, `journeyType` but NOT:
- `analysisType` (which specific analysis was paid for)
- `lockedCostCents` (what the user was quoted)
- `subscriptionTierId` (which tier the user was on)
**Evidence**:
```typescript
metadata: {
  projectId,
  userId,
  type: 'one_off_analysis',
  journeyType,
  ...metadata  // Extra metadata IF caller passes it — but no caller does
}
```
**Fix**: Add to checkout metadata: `analysisType`, `lockedCostCents: Math.round(amount * 100)`, `quotedAt: new Date().toISOString()`

**Issue 7.6: Webhook Idempotency Race Condition**
**Symptom**: Duplicate webhook processing in high-concurrency scenarios
**Root Cause**: `unified-billing-service.ts:1993-1994` marks event in cache BEFORE the transaction completes:
```typescript
this.processedWebhooksCache.add(event.id);  // Line 1994 — cached BEFORE tx
await db.transaction(async (tx) => { ... }); // Line 1997 — tx starts AFTER
```
If the transaction fails (e.g., DB error), the event is in cache but NOT processed. Subsequent retries from Stripe will be skipped (cache hit at line 1970-1973). DB-backed dedup check (line 1976-1986) correctly checks a `decisionAudits` table but the audit record is written INSIDE the transaction — so if tx fails, no DB record exists either. However, in-memory cache still says "processed".

**Fix**: Move cache insertion to AFTER successful transaction:
```typescript
await db.transaction(async (tx) => { ... });
this.processedWebhooksCache.add(event.id); // Only cache after success
```

**Issue 7.7: Campaign/Coupon Usage Incremented on Apply (Not Checkout)**
**Symptom**: Campaign usage can be inflated if user applies coupon multiple times or abandons checkout
**Root Cause**: `applyCampaign()` (`unified-billing-service.ts:1296-1329`) increments `campaign.currentUses` immediately when called. If the user:
1. Applies coupon → usage incremented
2. Navigates away without paying → usage consumed but no revenue
3. Returns and applies again → usage incremented AGAIN
**Evidence**: `campaign.currentUses += 1` at line 1312. Separate `validateCampaign()` at line 1332-1383 does NOT increment. But the flow may call `applyCampaign` vs `validateCampaign` inconsistently.
**Fix**: Only increment usage at payment completion (inside webhook handler), not at coupon application time.

**Issue 7.8: Multiple Legacy Billing Services Still Referenced**
**Symptom**: Different billing results depending on code path
**Root Cause**: Legacy files still imported:
- `enhanced-billing-service.ts` (deprecated but still referenced)
- `enhanced-subscription-billing.ts` (deprecated but still referenced)
**Fix**: Delete legacy files, update all imports to unified service

**Issue 7.9: Stripe Connection Failures**
**Symptom**: "Failure to connect to stripe" (from PDF)
**Root Cause**: Missing or incorrect `STRIPE_SECRET_KEY` in env, or Stripe API key is test key in production context
**Fix**: Validate Stripe key at server startup, fail fast if invalid

**Issue 7.10: Duplicate Subscription Utilization Sections**
**Symptom**: Two subscription sections shown on payment page
**Root Cause**: Both legacy and new billing components render simultaneously
**Fix**: Remove legacy billing UI component

**Issue 7.11: Dev Mode Auto-Marks Paid Without Stripe**
**Symptom**: In development, projects are marked paid without actual payment processing
**Location**: `analysis-payment.ts:427-489`
**Root Cause**: Dev mode bypass calls `storage.updateProject(projectId, { isPaid: true })` directly, skipping Stripe entirely. This is intentional for dev but:
1. No clear flag distinguishes dev-paid from Stripe-paid
2. If `ENABLE_MOCK_MODE` is accidentally `true` in staging/production, all payments are auto-approved
**Fix**: Add `paymentMethod: 'dev_bypass'|'stripe'|'subscription'` field to distinguish payment sources. Ensure dev bypass ONLY works when `NODE_ENV === 'development'`.

**Issue 7.12: Currency Always USD**
**Symptom**: International users cannot pay in local currency
**Root Cause**: `currency` is hardcoded to `'usd'` throughout the billing service
**Fix**: Low priority — but note it for international expansion

---

### STAGE 8: Dashboard & Artifact Presentation

**Files**: `client/src/pages/project-results.tsx`, `client/src/pages/dashboard-step.tsx`

#### What's Working
- Per-analysis filter dropdown (Phase 7)
- Analysis status cards with timing
- Multi-audience result translation
- Artifact download (PDF, PPTX, CSV)
- Real-time WebSocket progress

#### What's Broken

**Issue 8.1: Locked Results Tabs**
**Symptom**: Results tabs locked even after analysis completes
**Root Cause**: Tab lock state checks `isPaid` but doesn't account for subscription-covered users OR trial users
**Fix**: Tab unlock logic: `isPaid || hasActiveSubscription || hasTrialCredits`

**Issue 8.2: No Artifact Status Endpoint**
**Symptom**: Frontend can't tell if artifact generation failed vs. still running
**Root Cause**: Artifacts generated via `setImmediate()` (fire-and-forget) with no status tracking
**Fix**: Add `GET /api/analysis-execution/artifacts/status/:projectId` endpoint

**Issue 8.3: Visualization Not Clear**
**Symptom**: "Visualization is not clear on what users must expect" (from PDF)
**Root Cause**: Plan step shows generic artifact descriptions instead of specific deliverables
**Fix**: Map visualization descriptions from DS Agent's `expectedArtifacts` with audience-specific language

---

## Admin Configuration System (New in Rev 3)

**Files**: `server/routes/admin-billing.ts` (1,200+ lines), `server/services/pricing.ts` (400+ lines), `server/routes/admin.ts`, `server/routes/admin-secured.ts`

> **Rev 3 Addition**: The user asked about admin functions and their connection to the pipeline. This section documents the admin pricing configuration system, its connection to the analysis pipeline, and critical gaps.

### What's Working (Admin → Pipeline Connection)
- **Tiered pricing matrix**: Admin configures per-analysis-type pricing via `POST /api/admin/billing/analysis-pricing`. These are stored in `analysis_pricing_config` DB table and loaded by `PricingService.loadFromDatabase()`.
- **Service pricing**: Admin manages service-level pricing (consultation, premium support) via `service_pricing` table.
- **Subscription tiers**: Admin CRUD for tier definitions with quotas, stored in `subscription_tier_pricing` table.
- **Campaign management**: Admin creates/manages billing campaigns with coupon codes, date ranges, and usage limits.
- **Audit logging**: Admin actions logged to `admin_audit_log` table with actor, action, and metadata.
- **9 admin UI components**: AnalysisPricingManager, ServicePricingManager, SubscriptionTierManager, CampaignManager, AdminOverview, AdminBillingDashboard, AdminFinancialMetrics, AdminRevenueDashboard, AdminUserManagement.

### What's Broken

**Issue Admin-1: Pricing Cache Never Invalidated After Admin Changes (RC-13) — HIGH**
**Symptom**: Admin changes pricing in dashboard, but users continue to see old prices until server restart
**Root Cause**: `PricingService.loadFromDatabase()` at line 118 is called **once at server startup** (line 116: "Called once at server initialization"). There is NO mechanism to reload pricing when admin updates it.
**Evidence**:
- `loadFromDatabase()` sets `this.dbLoaded = true` and never re-queries
- No `refreshPricing()` or `invalidateCache()` method exists on PricingService
- Admin billing endpoints (`admin-billing.ts`) write to DB but do NOT call `PricingService.loadFromDatabase()` after writes
- In multi-server deployments, even a per-server refresh wouldn't propagate to other instances (no Redis pubsub for pricing invalidation)
**Fix**:
1. Add `PricingService.refreshFromDatabase()` method
2. Call it after every admin pricing update in `admin-billing.ts`
3. For multi-server: publish pricing change event via Redis pubsub → all servers reload
4. Add TTL-based auto-refresh (e.g., reload every 5 minutes) as defense-in-depth

**Issue Admin-2: Dual Source for Platform Fee**
**Symptom**: Platform fee may differ between CostEstimationService and frontend
**Root Cause**: `CostEstimationService` reads `basePlatformFee` from admin config. Frontend uses `runtimeConfig?.basePlatformFee ?? 0.50`. If admin changes the backend value, frontend fallback may be stale.
**Fix**: Frontend must fetch platform fee from backend API, never use hardcoded fallback.

**Issue Admin-3: Hard-Coded Analysis Type Enum**
**Symptom**: Adding a new analysis type requires code changes in multiple places
**Root Cause**: Analysis types (`descriptive`, `correlation`, `regression`, `clustering`, `time_series`) are hardcoded in:
- Python script filenames
- `transformation-compiler.ts` switch statements
- `analysis-execution.ts` type routing
- Admin pricing UI dropdown
- Frontend journey templates
**Fix**: Move analysis type registry to DB-configurable list with metadata (script name, display name, required fields, default complexity). Admin can add types without code changes.

**Issue Admin-4: No Real-Time Broadcast of Admin Changes**
**Symptom**: Active user sessions don't reflect admin changes until page refresh
**Root Cause**: No WebSocket event emitted when admin changes pricing, campaigns, or feature flags. Users may see stale data for the duration of their session.
**Fix**: Emit WebSocket event `admin:config-updated` when admin changes occur. Client invalidates relevant React Query caches on receipt.

---

## Cross-Cutting Issues

### Issue X.1: Monolithic analysis-execution.ts (2,915 lines)
**Impact**: Extremely difficult to maintain, debug, and test
**Fix**: Split into:
- `analysis-executor.ts` (core execution)
- `user-context-loader.ts` (SSOT context retrieval)
- `question-answer-generator.ts` (Q&A)
- `audience-translator.ts` (BA translation)
- `artifact-orchestrator.ts` (artifact generation)

### Issue X.2: SSOT Violations
**Pattern**: Multiple services read from legacy locations instead of `journeyProgress`
**Examples**:
- PII: `journeyProgress.piiDecisions` vs `project.metadata.piiDecision` vs `dataset.ingestionMetadata.piiMaskingChoices`
- Cost: `journeyProgress.lockedCostEstimate` vs `project.lockedCostEstimate`
- Questions: 4-level priority chain
**Fix**: Create typed accessor functions that enforce SSOT:
```typescript
export function getPIIDecisions(project: Project): Record<string, string> {
  return (project as any).journeyProgress?.piiDecisions || {};
  // NO FALLBACKS - if not in SSOT, it doesn't exist
}
```

### Issue X.3: Agent Activity Messages Are Largely Hardcoded (Upgraded from P3 to P1)

> **Critique Response**: Rev 1 categorized this as P3-2 "Mock Data in Production Paths" with fix "Gate behind `ENABLE_MOCK_MODE`". The Antigravity Agent critique correctly identified that hiding mock data doesn't fix the issue — it just shows **nothing**. The real problem is a logic gap: agents aren't generating context-aware status messages. Code verification confirms the messages are hardcoded.

**Evidence**:
- `server/routes/agents.ts:59-70` — PM Agent activity is hardcoded: `'Coordinating workflow'` / `'Monitoring progress'`
- `server/routes/agents.ts:74-85` — DS Agent: `'Processing data'` / `'Waiting for data'`
- `server/services/agent-coordination-service.ts:325-532` — Phase messages are static strings: `'Data Engineer: Assessing data quality'`, `'Data Scientist: Planning analysis'`, etc.
- `server/routes/agents.ts:102-164` — Journey-state fallback is a hardcoded state machine with predefined strings
- **Partially dynamic**: Completion messages append some context (quality scores, recommended analyses), but base strings are still hardcoded

**What's Missing**: No dataset name, no specific analysis type, no specific data quality issue, no percentage progress, no streaming real-time updates about what's actually happening.

**Fix** (Two-part):
1. **Remove mock/simulated data**: Gate `technical-ai-agent.ts:97-107` (simulated metrics), `technical-ai-agent.ts:582-636` (random ML confidence), `customer-support-agent.ts:945,949` (`Math.random()`) behind `ENABLE_MOCK_MODE`
2. **Implement dynamic context-aware messages**: Each agent phase should emit messages that include:
   - Dataset name(s) being processed
   - Specific analysis types being planned/executed
   - Specific quality issues found (not just count)
   - Element names being mapped
   - Percentage progress within each phase
   - Example: `"Data Scientist: Planning regression analysis for 'Employee Turnover' dataset — identified 3 target variables"` instead of `"Data Scientist: Planning analysis"`

---

## Priority Fix Matrix (Revised Rev 3)

### P0 — Critical (Must fix, blocks core functionality)

| # | Issue | Root Cause | Files | Effort |
|---|-------|-----------|-------|--------|
| **P0-1** | **Multi-dataset join config silently discarded** | **RC-8** | **data-transformation-step.tsx, project.ts** | **2 hrs** |
| **P0-2** | **PII leakage when falling back to raw data** | **RC-9** | **analysis-execution.ts, pii-helper.ts** | **3 hrs** |
| P0-3 | Dependency resolution empty array | RC-1 | transformation-compiler.ts:134 | 30 min |
| P0-4 | Column mappings not persisted | RC-2 | server/routes/project.ts | 1 hr |
| P0-5 | Analysis-type-specific data prep missing | RC-3 | transformation-compiler.ts + new service | 4 hrs |
| P0-6 | 404 on results fetch | Execution save | routes/analysis-execution.ts | 2 hrs |
| P0-7 | Transformed data not used | RC-2 cascading | analysis-execution.ts | 1 hr |
| **P0-8** | **Question→Element linkage uses text not IDs** | **RC-10 (Break 1)** | **required-data-elements-tool.ts:31,1213** | **3 hrs** |
| **P0-9** | **Element mappings split, sourceColumn always null in reqDoc** | **RC-10 (Break 2)** | **required-data-elements-tool.ts, source-column-mapper.ts** | **2 hrs** |

### P1 — High (Degraded user experience, incorrect results)

| # | Issue | Root Cause | Files | Effort |
|---|-------|-----------|-------|--------|
| P1-1 | Disconnected pricing systems (3 calculators) | RC-4 | pricing.ts, cost-estimation-service.ts, pricing-step.tsx | 3 hrs |
| P1-2 | Evidence chain keyword matching | RC-5 | analysis-execution.ts:900 | 2 hrs |
| **P1-3** | **Agent activity messages hardcoded** | **Logic gap** | **agents.ts, agent-coordination-service.ts** | **4 hrs** |
| **P1-4** | **Post-payment redirects to 3 different URLs** | **RC-12** | **unified-billing-service.ts:1807, analysis-payment.tsx:114,960** | **1 hr** |
| P1-5 | Quota $0 overage | RC-4 cascading | routes/analysis-execution.ts | 1 hr |
| **P1-6** | **Payment status field mismatch (isPaid vs paymentComplete vs paymentStatus)** | **RC-11** | **analysis-payment.ts, payment.ts, analysis-payment.tsx** | **2 hrs** |
| P1-7 | Irrelevant data elements | DS prompt | required-data-elements-tool.ts | 2 hrs |
| P1-8 | Kendall p-value placeholder | Python bug | python/correlation_analysis.py | 15 min |
| **P1-9** | **Admin pricing cache never invalidated** | **RC-13** | **pricing.ts, admin-billing.ts** | **2 hrs** |
| **P1-10** | **Business definitions loaded but ignored in transformation** | **RC-10 (Break 3)** | **project.ts:7525-7665, transformation-compiler.ts** | **3 hrs** |
| **P1-11** | **Checkout metadata missing analysisType, lockedCostCents** | **RC-14** | **unified-billing-service.ts:1832-1838** | **30 min** |
| **P1-12** | **Webhook idempotency race (cache before tx)** | **Race condition** | **unified-billing-service.ts:1993-1997** | **30 min** |
| **P1-13** | **Coupon usage incremented on apply, not on payment** | **Logic gap** | **unified-billing-service.ts:1296-1329** | **1 hr** |

### P2 — Medium (Reliability, maintainability)

| # | Issue | Root Cause | Files | Effort |
|---|-------|-----------|-------|--------|
| P2-1 | Field name inconsistency | RC-6 | 6+ files | 2 hrs |
| P2-2 | Semantic pipeline tables null | RC-7 | semantic-data-pipeline.ts | 1 hr |
| P2-3 | Circular dependency silent | Error handling | transformation-compiler.ts | 30 min |
| P2-4 | No artifact status endpoint | Missing API | routes/analysis-execution.ts | 2 hrs |
| P2-5 | Duplicate billing services | Legacy code | 3 billing files | 2 hrs |
| P2-6 | exec() security in Python | Sandboxing | execute_transformations.py | 2 hrs |
| P2-7 | Plan text not dynamic | Static UI | plan-step.tsx | 1 hr |
| **P2-8** | **Verification step doesn't check element satisfaction** | **RC-10 (Break 5)** | **data-verification-step.tsx** | **2 hrs** |
| **P2-9** | **Dev mode auto-marks paid without Stripe** | **Config gap** | **analysis-payment.ts:427-489** | **1 hr** |
| **P2-10** | **Admin has no real-time broadcast of config changes** | **Missing WS event** | **admin-billing.ts, realtime-agent-bridge.ts** | **2 hrs** |
| **P2-11** | **Hard-coded analysis type enum** | **Extensibility gap** | **Multiple files** | **4 hrs** |

### P3 — Low (Polish, future-proofing)

| # | Issue | Files | Effort |
|---|-------|-------|--------|
| P3-1 | Monolithic analysis-execution.ts | analysis-execution.ts | 4 hrs |
| P3-2 | No per-analysis timeout | analysis-execution.ts | 1 hr |
| P3-3 | Regression config parsing | regression_analysis.py | 30 min |
| P3-4 | Locked results tabs | project-results.tsx | 1 hr |
| **P3-5** | **Currency always USD** | **unified-billing-service.ts** | **2 hrs** |
| **P3-6** | **Dual source for platform fee (admin vs frontend)** | **pricing.ts, pricing-step.tsx** | **1 hr** |

---

## Recommended Fix Order (Revised Rev 3)

### Sprint 1: Data Integrity & Safety (12 hours) — HIGHEST PRIORITY

> These issues cause **silent data loss**, **privacy violations**, and **broken audit trails**. They must be fixed first.

1. **P0-1**: Enforce multi-dataset join persistence on navigation (2 hrs)
   - Block "Next" if join detected but not executed
   - Auto-save joinConfig to journeyProgress in handleNext()
   - Add backend validation in analysis-execution route
2. **P0-2**: PII safety on raw data fallback (3 hrs)
   - Hard gate: block execution if PII detected but no exclusion decision
   - In-memory PII masking when falling back to raw data
   - Use `dataset.piiAnalysis.piiColumns` as defense-in-depth filter
3. **P0-3**: Fix dependency resolution empty array (30 min)
4. **P0-4**: Persist column mappings to DB (1 hr)
5. **P0-7**: Ensure transformed data used (fail instead of silent fallback) (1 hr)
6. **P0-8**: Fix question→element linkage to use stable IDs (3 hrs)
   - Generate question IDs at goals step, persist to journeyProgress
   - Store question IDs (not text) in element.relatedQuestions
   - Align question IDs between elements and questionAnswerMapping
7. **P1-8**: Kendall p-value placeholder (15 min)
8. **P2-3**: Circular dependency error (30 min)

### Sprint 2: Billing & Payment Fixes (10 hours)

1. **P1-6**: Standardize payment status fields (isPaid only) (2 hrs)
2. **P1-4**: Unify post-payment redirect to results page (1 hr)
3. **P1-11**: Add analysisType, lockedCostCents to Stripe metadata (30 min)
4. **P1-12**: Fix webhook idempotency (cache after tx, not before) (30 min)
5. **P1-13**: Move coupon usage increment to payment completion (1 hr)
6. **P1-1**: Unify 3 pricing systems to single backend authority (3 hrs)
7. **P1-5**: Fix $0 overage pricing (1 hr)
8. **P1-9**: Add pricing cache invalidation after admin updates (1 hr)

### Sprint 3: Data Continuity & Execution (12 hours)

1. **P0-9**: Merge element mappings — write back sourceColumn to requirementsDocument (2 hrs)
2. **P1-10**: Feed businessContext into TransformationCompiler.compile() (3 hrs)
   - Use business definitions to inform transformation code generation
   - Not just log them — actually use them in switch statements
3. **P0-6**: Fix 404 on results fetch (2 hrs)
4. **P1-2**: Semantic evidence chain matching with embeddings (2 hrs)
5. **P0-5**: Analysis-type-specific data preparation (3 hrs)

### Sprint 4: Agent Activity & UX Polish (10 hours)

1. **P1-3**: Dynamic agent activity messages (4 hrs)
   - Replace hardcoded strings with context-aware messages
   - Include dataset names, analysis types, specific findings
   - Stream real-time progress with percentage
2. **P1-7**: Tighten data element generation (2 hrs)
3. **P2-8**: Add element satisfaction check at verification step (2 hrs)
4. **P2-7**: Plan text dynamic (1 hr)
5. **P2-9**: Fix dev mode auto-pay to require NODE_ENV=development (1 hr)

### Sprint 5: Reliability & Maintenance (12 hours)

1. **P2-1**: Standardize field names (2 hrs)
2. **P2-2**: Fix semantic pipeline tables (1 hr)
3. **P2-4**: Add artifact status endpoint (2 hrs)
4. **P2-5**: Remove duplicate billing services (1 hr)
5. **P2-6**: Python exec() sandboxing (2 hrs)
6. **P2-10**: Admin real-time broadcast of config changes (2 hrs)
7. **P2-11**: Move analysis type enum to DB-configurable registry (2 hrs — phase 1)

### Sprint 6: Polish & Hardening (8 hours)

1. **P3-1**: Split monolithic analysis-execution.ts (4 hrs)
2. **P3-2**: No per-analysis timeout (1 hr)
3. **P3-4**: Locked results tabs (1 hr)
4. **P3-5**: Currency support beyond USD (2 hrs — phase 1)

### Total Estimated Effort: ~64 hours across 6 sprints

---

## Architecture Strengths (Keep These)

1. **Progressive artifact design** — requirements document evolves through phases without losing prior work
2. **Multi-tier fallback matching** — 7-9 tier scoring prevents "not found" failures
3. **Multi-engine code generation** — JS/Polars/Pandas/Spark based on data size
4. **SSOT via journeyProgress** — single authoritative location (when properly enforced)
5. **Per-analysis parallel execution** — Promise.allSettled for graceful degradation
6. **Multi-audience translation** — executive, technical, analyst views
7. **Agent separation of concerns** — DS defines WHAT, DE maps HOW, BA explains WHY
8. **Subscription-first billing** — clean tier/quota/overage model

---

## Rev 2 Amendments — Antigravity Agent Critique Response

**Critique Document**: `docs/CRITIQUE_OF_PIPELINE_ANALYSIS.md` (February 11, 2026)

### Accepted Critiques (3/3)

| Critique | Verdict | Action Taken |
|----------|---------|-------------|
| **Multi-dataset join config silently discarded** | **VALID — Confirmed by code inspection** | Added as RC-8 / P0-1. `joinConfig` is only persisted inside `execute-transformations` endpoint. `handleNext()` does not include it. Added Stage 1B with full analysis and fix. |
| **PII leakage when falling back to raw data** | **VALID — Confirmed by code inspection** | Added as RC-9 / P0-2. `dataset.data` stores raw PII at upload. `filterPIIColumns()` is conditional on `columnsToExclude` being non-empty. Added Stage 1C with defense-in-depth fix. |
| **Agent activity messages hardcoded (not just mock data)** | **VALID — Confirmed by code inspection** | Upgraded from P3-2 to P1-3. Rewritten issue X.3 to address the logic gap: implement dynamic context-aware messages rather than just gating mock data. |

### Corrections Applied

1. **Stage 5 "What's Working"**: Added caveats to "Multi-dataset join validation" and "PII column exclusion" — both are conditional, not unconditionally working
2. **Root Cause table**: Expanded from 7 to 9 root causes (added RC-8, RC-9)
3. **Priority matrix**: Renumbered all items. RC-8 and RC-9 are now P0-1 and P0-2 (highest priority). Agent activity upgraded from P3-2 to P1-3.
4. **Sprint plan**: Restructured. Sprint 1 now focuses entirely on data integrity and safety (joins + PII) before other fixes.
5. **Issue X.3**: Completely rewritten from "gate behind mock flag" to "implement dynamic context-aware agent messaging"

---

## Rev 3 Amendments — Data Continuity, Admin, and Billing Analysis

**Date**: February 11, 2026
**Trigger**: User feedback that Rev 2 still missed critical dimensions: end-to-end data continuity, admin configuration system, and comprehensive billing/payment analysis.

### New Root Causes Added (5)

| # | Root Cause | Source | Action |
|---|-----------|--------|--------|
| **RC-10** | End-to-end data continuity broken at 5 handoff points | Data flow trace | Added Stage 1D with full continuity chain analysis. New P0-8 (question IDs), P0-9 (mapping merge), P1-10 (business definitions), P2-8 (verification check). |
| **RC-11** | Payment status field mismatch (isPaid vs paymentComplete vs paymentStatus) | Billing analysis | Added as Issue 7.2 (expanded) and P1-6 (upgraded). |
| **RC-12** | Post-payment redirect points to 3 different URLs | Billing analysis | Added as Issue 7.3 (expanded) and P1-4 (upgraded with details). |
| **RC-13** | Admin pricing cache never invalidated after changes | Admin analysis | Added Admin Configuration System section with Issue Admin-1. New P1-9. |
| **RC-14** | Checkout metadata missing analysisType, lockedCostCents | Billing analysis | Added as Issue 7.5 and P1-11. |

### New Sections Added

1. **Stage 1D: End-to-End Data Continuity (RC-10)** — 5 break points in the semantic thread from goals to results:
   - Break 1: Question IDs are synthetic indices, not stable identifiers
   - Break 2: Element source mappings live in two disconnected locations
   - Break 3: Business definitions loaded and logged but not used in transformation
   - Break 4: Insights linked to questions only via keyword matching (no stable IDs)
   - Break 5: Verification step doesn't check element satisfaction against dataset

2. **Admin Configuration System** — Analysis of admin pricing CRUD, its connection to the pipeline (confirmed working via DB), and critical gaps:
   - Admin-1: Pricing cache never invalidated (RC-13)
   - Admin-2: Dual source for platform fee
   - Admin-3: Hard-coded analysis type enum
   - Admin-4: No real-time broadcast of admin changes

3. **Stage 7: Billing & Payment (Expanded)** — From 5 issues to 12 issues:
   - 7.1: Three competing pricing systems (expanded detail)
   - 7.2: Payment status field mismatch (RC-11, new)
   - 7.3: Post-payment redirect to 3 URLs (RC-12, new)
   - 7.4: Locked cost persistence (expanded)
   - 7.5: Checkout metadata gaps (RC-14, new)
   - 7.6: Webhook idempotency race condition (new)
   - 7.7: Coupon usage increment timing (new)
   - 7.8-7.12: Various (legacy services, Stripe config, dev mode, currency)

### Priority Matrix Changes

- **New P0**: P0-8 (question ID linkage), P0-9 (element mapping merge)
- **New P1**: P1-9 (admin cache), P1-10 (business def usage), P1-11 (checkout metadata), P1-12 (webhook race), P1-13 (coupon usage)
- **Upgraded P1**: P1-4 now includes 3-URL detail, P1-6 now includes 3-field mismatch detail
- **New P2**: P2-8 (verification element check), P2-9 (dev auto-pay), P2-10 (admin broadcast), P2-11 (analysis type enum)
- **New P3**: P3-5 (currency), P3-6 (dual platform fee)

### Sprint Plan Changes

- Sprint 1 expanded to 12 hrs (added P0-8 for question ID linkage)
- **New Sprint 2**: Dedicated billing & payment sprint (10 hrs) — consolidates all payment fixes
- Sprint 3: Data continuity & execution (12 hrs) — addresses mapping merge, business def usage, evidence chain
- Sprint 4-6: Agent activity, reliability, polish
- Total effort increased from ~44 hrs to **~64 hrs** across 6 sprints (was 5)

### Key Insight

The most impactful finding in Rev 3 is **RC-10 (Data Continuity)**. While individual component bugs (RC-1 through RC-9) cause specific failures, the continuity breaks mean the system fundamentally cannot trace WHY it produced a given result. Even if all other bugs are fixed, the lack of stable question IDs flowing through elements→transformations→insights means the evidence chain from "user asked X" to "system answered Y" remains unprovable. **P0-8 (question ID linkage) should be addressed alongside P0-3/P0-4 in Sprint 1.**
