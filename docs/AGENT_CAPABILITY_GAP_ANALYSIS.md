# Agent Capability Gap Analysis for 6-Phase Journey

**Date**: January 6, 2025
**Status**: ✅ VALIDATED
**Priority**: CRITICAL

---

## Executive Summary

Comprehensive validation of all agents and tools required for the 6-phase user journey framework. This document identifies existing capabilities, missing methods, and implementation priorities.

### Overall Status: 85% Ready

**✅ Agents Present**:
- Project Manager Agent
- Business Agent
- Data Scientist Agent
- Data Engineer Agent
- Enhanced Subscription Billing (Billing Agent functionality)

**🔴 Critical Gaps**:
1. Missing orchestration methods for multi-source template retrieval
2. No natural language translation service
3. Checkpoint presentation UI components not built
4. Schema validation and approval flow incomplete
5. Role-specific artifact delivery system needs extension

---

## Part 1: Agent-by-Agent Capability Assessment

### 1. Project Manager Agent

**Location**: `server/services/project-manager-agent.ts`

#### ✅ Existing Capabilities (70% Complete)

**Workflow Orchestration**:
```typescript
✓ decideProject(userDescription, userId) → project decision
✓ startGoalExtraction(projectId, userDescription, journeyType)
✓ confirmPathAndEstimateCost(projectId, userFeedback)
✓ approveCostAndExecute(projectId, userApproval)
✓ createWorkflowPlan(analysisPath, project) → dependencies
✓ executeWorkflow(projectId, workflow) → results
✓ getExecutionOrder(dependencies) → ordered steps
✓ executeWorkflowStep(stepName, dependency, project, results)
✓ getProjectArtifacts(projectId) → artifacts[]
✓ getArtifactLineage(projectId, artifactId) → artifact chain
```

**Orchestration State Management**:
```typescript
✓ OrchestrationState interface with status tracking
✓ WorkflowDependency tracking
✓ ProjectArtifact management
✓ History logging
```

#### ❌ Missing Capabilities (30% Gap)

**Phase 1 - Requirements & Template Selection**:
```typescript
❌ consolidateRequirements(userInput, userRole) → ProjectScope
❌ requestTemplateFromBusinessAgent(userContext) → Templates[]
❌ rankTemplatesByRelevance(templates, context) → RankedTemplates[]
❌ presentTemplatesToUser(templates, userRole) → UserSelection
```

**Phase 2 - Roadmap Creation**:
```typescript
❌ createAnalysisRoadmap(goals, templates, dataContext) → RoadmapWithArtifacts
   // Current: createWorkflowPlan exists but doesn't use templates
❌ presentRoadmapForApproval(roadmap, userRole) → UserApproval
❌ mapRoadmapToArtifacts(roadmap) → DetailedArtifacts[]
```

**Checkpoint Coordination**:
```typescript
❌ coordinateCheckpoint(checkpointType, leadAgent, artifacts) → CheckpointResult
❌ determineLeadAgent(checkpointType) → AgentId
❌ presentToUser(checkpoint, presentation) → UserResponse
❌ processUserModifications(modifications) → UpdatedArtifacts
```

**Async Iterator for Checkpoints**:
```typescript
❌ async *executeWithCheckpoints(projectId, workflow): AsyncIterableIterator<CheckpointYield>
   // Needed to pause at each checkpoint for user approval
```

#### 🔧 Required Extensions

1. **Add Checkpoint Support to OrchestrationState**:
```typescript
interface OrchestrationState {
  // EXISTING
  status: OrchestrationStatus;
  history: Array<...>;
  dependencies?: WorkflowDependency[];
  artifacts?: ProjectArtifact[];

  // NEW - ADD THESE
  selectedTemplate?: string;
  currentCheckpoint?: string;
  checkpointHistory?: CheckpointRecord[];
  awaitingUserApproval?: boolean;
  userFeedbackRequired?: CheckpointRequest;
}
```

2. **Template Integration**:
```typescript
// Modify existing methods to accept templates
async createWorkflowPlan(
  analysisPath: any,
  project: any,
  template?: EnhancedBusinessTemplate // ADD THIS
): Promise<{ dependencies: WorkflowDependency[] }>
```

---

### 2. Business Agent

**Location**: `server/services/business-agent.ts`

#### ✅ Existing Capabilities (75% Complete)

**Goal Extraction**:
```typescript
✓ extractGoals(userDescription, journeyType, context) → structured goals
✓ decideOnProject(userDescription, existingProjects) → decision
✓ findTemplates(businessArea) → templates[]
```

**Industry Knowledge**:
```typescript
✓ getIndustryTemplate(industry) → IndustryTemplate
✓ getApplicableRegulations(industry) → RegulatoryFramework[]
✓ generateIndustryInsights(context) → insights
✓ validateRegulatoryCompliance(analysis, industry) → complianceReport
✓ generateBusinessKPIs(industry, analysisType) → KPIs
✓ suggestDataEnrichment(context) → enrichment suggestions
```

**Templates**:
```typescript
✓ 4 Industry templates: Healthcare, Finance, Retail, Manufacturing
✓ 4 Regulatory frameworks: GDPR, HIPAA, SOX, Basel III
✓ IndustryTemplate with analysis templates
```

#### ❌ Missing Capabilities (25% Gap)

**Multi-Source Template Retrieval**:
```typescript
❌ sourceTemplates(userContext) → {system, user, online}
   // Current: findTemplates only searches system templates
❌ researchOnlineTemplates(industry, LOB, queries) → OnlineTemplates[]
❌ parseUserTemplate(file) → Template
❌ rankAndDeduplicateTemplates(allTemplates, context) → RankedTemplates[]
```

**Template-to-Context Matching**:
```typescript
❌ matchTemplatesToContext(templates, userContext) → MatchScore[]
   // Need scoring based on industry, LOB, subject area, goals
❌ recommendTemplates(userContext, count) → TopTemplates[]
```

**Business Validation During Execution**:
```typescript
❌ validateSchemaAlignment(template, schema) → ValidationResult
❌ validateBusinessLogic(template, relationships) → ValidationResult
❌ validateMethodologyAlignment(goals, methodology) → ValidationResult
❌ validateCleaningApproach(template, cleaningPlan) → ValidationResult
❌ validateFindingsReasonableness(template, results) → ValidationResult
```

**Natural Language Translation**:
```typescript
❌ translateToNaturalLanguage(technicalOutput, userRole) → BusinessLanguage
❌ translateToBusiness(output, userRole) → string
❌ explainSchema(schema, userRole) → NaturalLanguageExplanation
❌ explainRelationships(relationships, userRole) → BusinessContext
❌ explainMethodology(analysisComponents, userRole) → WhyThisApproach
❌ translateQualityToImpact(dataQualityReport) → BusinessImpact
❌ translateFindings(results, template, userRole) → UserFriendlyInsights
```

**Business Insights Extraction**:
```typescript
❌ extractBusinessInsights(analysisResults, template) → ActionableInsights
❌ explainWhyThisMethodology(template) → BusinessRationale
```

#### 🔧 Required Extensions

1. **Expand Template System**:
```typescript
// ADD: Enhanced template structure
interface EnhancedBusinessTemplate extends IndustryTemplate {
  matchingCriteria: {
    industry: string[];
    lineOfBusiness: string[];
    subjectArea: string[];
    analysisGoals: string[];
    keywords: string[];
  };
  analysisComponents: {
    dataPreparation: { ... };
    statisticalTests: { ... };
    mlModels: { ... };
    visualizations: { ... };
    businessInsights: { ... };
  };
  approvalCheckpoints: CheckpointDefinition[];
}
```

2. **Online Research Capability**:
```typescript
// Integrate with web search for industry templates
async researchOnlineTemplates(context: {
  industry: string;
  lob: string;
  queries: string[];
}): Promise<Template[]>
```

---

### 3. Data Scientist Agent

**Location**: `server/services/data-scientist-agent.ts`

#### ✅ Existing Capabilities (90% Complete)

**Analysis Execution**:
```typescript
✓ performStatisticalAnalysis(task) → AnalysisResult
✓ developMLModel(task) → ModelResult
✓ performExploratoryAnalysis(task) → EDAResult
✓ buildPredictiveModel(task) → PredictionResult
✓ createVisualizations(task) → Visualizations[]
✓ generateInsights(task) → Insights[]
✓ performComprehensiveAnalysis(task) → CombinedResult
```

**Statistical Methods**:
```typescript
✓ calculateDescriptiveStats(data, schema) → stats
✓ calculateCorrelations(data, columns) → correlationMatrix
✓ analyzeDistribution(data, column) → distributionReport
✓ detectOutliers(data, columns) → outlierReport
✓ pearsonCorrelation(data, col1, col2) → coefficient
```

**Spark Integration**:
```typescript
✓ Uses SparkProcessor for datasets > 1000 records
✓ Distributed ML model training
```

**Analysis Results**:
```typescript
✓ Finding, Visualization, Insight, AnalysisArtifact interfaces
✓ executionMetrics tracking
```

#### ❌ Missing Capabilities (10% Gap)

**Roadmap Artifact Mapping**:
```typescript
❌ mapArtifactsToComponents(roadmapArtifacts) → AnalysisComponents
   // Need explicit mapping from template artifacts to analysis steps
❌ defineRequiredSchema(analysisComponents) → DataSchema
   // Generate schema requirements from planned analysis
❌ validateSchemaFitsAnalysis(schema, artifacts) → ValidationResult
```

**Collaboration Methods**:
```typescript
❌ collaborateOnInsights(results, businessAgent) → EnrichedInsights
   // Current: exists but not fully implemented
❌ prepareCheckpointPresentation(checkpoint, artifacts, userRole) → Presentation
```

#### 🔧 Required Extensions

1. **Add Schema Definition Methods**:
```typescript
async defineRequiredSchema(
  analysisComponents: AnalysisComponent[]
): Promise<RequiredDataSchema> {
  const requiredFields = [];
  const optionalFields = [];
  const derivedMetrics = [];

  // Map analysis components to data requirements
  for (const component of analysisComponents) {
    if (component.type === 'statistical_analysis') {
      requiredFields.push(...component.requiredColumns);
    }
    // ... more mapping
  }

  return { requiredFields, optionalFields, derivedMetrics };
}
```

---

### 4. Data Engineer Agent

**Location**: `server/services/data-engineer-agent.ts`

#### ✅ Existing Capabilities (80% Complete)

**Data Pipeline**:
```typescript
✓ handlePipelineRequest(task) → PipelineResult
✓ handleDataCleaning(task) → CleaningResult
✓ handleDataTransformation(task) → TransformationResult
✓ handleDataValidation(task) → ValidationResult
✓ handleETLProcessing(task) → ETLResult
✓ handleUserCommunication(task) → Response
```

**Pipeline Execution**:
```typescript
✓ createExecutionPlan(request) → ExecutionPlan
✓ executePipeline(pipelineId, request) → executionId
✓ generateOutputSchema(transformations) → schema
```

**Interfaces**:
```typescript
✓ DataPipelineRequest, DataTransformation, ValidationRule
✓ PipelineExecution, PipelineLog, PipelineError
```

#### ❌ Missing Capabilities (20% Gap)

**User Interaction for Data Upload**:
```typescript
❌ guideDataUpload(requiredSchema, userRole) → UploadedData
   // Need interactive upload wizard
❌ validateUploadedData(data, requiredSchema) → ValidationReport
❌ suggestDataSources(schema, industry) → SourceSuggestions[]
```

**Data Quality with User Approval**:
```typescript
❌ assessDataQuality(data, schema) → QualityReport
❌ proposeCleaningPlan(qualityReport, userRole) → CleaningPlan
❌ awaitUserApprovalForCleaning(plan) → UserApproval
❌ applyApprovedCleaning(data, approvedPlan) → CleanedData
```

**Derived Metrics Creation**:
```typescript
❌ createDerivedMetrics(data, metricDefinitions) → EnrichedData
   // Exists in interface but not implemented
❌ prepareDataForAnalysis(data, schema) → AnalysisReadyData
   // Needs full implementation
```

#### 🔧 Required Extensions

1. **Interactive Upload Flow**:
```typescript
async guideDataUpload(
  requiredSchema: DataSchema,
  userRole: UserRole
): Promise<UploadGuidance> {
  return {
    instructions: generateRoleSpe cificInstructions(userRole),
    acceptedFormats: ['csv', 'excel', 'json', 'parquet'],
    sampleTemplate: generateSampleTemplate(requiredSchema),
    validationRules: extractValidationRules(requiredSchema),
    helpText: generateHelpText(userRole)
  };
}
```

---

### 5. Billing Agent (Enhanced Subscription Billing)

**Location**: `server/services/enhanced-subscription-billing.ts`

#### ✅ Existing Capabilities (95% Complete)

**Usage Tracking**:
```typescript
✓ UsageMetrics comprehensive tracking
✓ dataUsage, computeUsage, storageMetrics, networkUsage
✓ collaborationMetrics, costBreakdown, quotaUtilization
```

**Subscription Tiers**:
```typescript
✓ 4 tiers: trial, starter, professional, enterprise
✓ Each with limits, overagePricing, discounts, support, compliance
```

**Billing Events**:
```typescript
✓ BillingEvent tracking by category
✓ QuotaAlert with alert levels
✓ UsageProjection with recommendations
```

#### ❌ Missing Capabilities (5% Gap)

**Checkpoint-Level Eligibility**:
```typescript
❌ checkStepEligibility(userId, step, estimatedResources) → EligibilityResult
   // Need to check before each workflow step
❌ estimateStepCost(step, dataVolume) → CostEstimate
❌ trackStepExecution(userId, step, actualResources) → UsageRecord
❌ applySubscriptionDiscount(cost, tier) → AdjustedCost
```

**Real-Time Quota Monitoring**:
```typescript
❌ checkQuotaRemaining(userId, component) → QuotaStatus
❌ requestPaymentApproval(cost, userId) → PaymentStatus
   // Needed before executing overage operations
```

#### 🔧 Required Extensions

1. **Step-Level Billing Integration**:
```typescript
class BillingAgent {
  async checkStepEligibility(
    userId: string,
    step: WorkflowStep,
    estimatedResources: ResourceEstimate
  ): Promise<BillingCheckResult> {
    const user = await storage.getUser(userId);
    const currentUsage = await this.getCurrentMonthUsage(userId);
    const tierLimits = getTierLimits(user.subscriptionTier);

    // Check quota availability
    const quotaCheck = {
      dataVolume: {
        required: estimatedResources.dataSizeMB,
        available: tierLimits.maxDataSizeMB - currentUsage.dataMB,
        sufficient: estimatedResources.dataSizeMB <= (tierLimits.maxDataSizeMB - currentUsage.dataMB)
      },
      // ... more checks
    };

    // Determine if overage payment needed
    if (!quotaCheck.dataVolume.sufficient) {
      return {
        eligible: true,
        requiresPayment: true,
        overageCost: this.calculateOverage(quotaCheck, user.subscriptionTier)
      };
    }

    return { eligible: true, requiresPayment: false, quotaCovered: true };
  }
}
```

---

## Part 2: Missing Infrastructure Components

### 1. Natural Language Translation Service

**Status**: ❌ NOT IMPLEMENTED

**Required**: `server/services/natural-language-translator.ts`

```typescript
export class NaturalLanguageTranslator {
  translateSchema(schema: DataSchema, userRole: UserRole): NaturalLanguageExplanation {
    // Convert technical schema to user-friendly descriptions
  }

  explainRelationships(relationships: DataRelationship[], userRole: UserRole): string {
    // Explain data relationships in business terms
  }

  explainMethodology(
    analysisComponents: AnalysisComponent[],
    template: Template,
    userRole: UserRole
  ): MethodologyExplanation {
    // Translate technical analysis plan to natural language
  }

  translateFindings(
    technicalResults: AnalysisResult,
    template: Template,
    userRole: UserRole
  ): UserFriendlyInsights {
    // Convert statistical findings to actionable insights
  }
}
```

### 2. Checkpoint Validator Service

**Status**: ❌ NOT IMPLEMENTED

**Required**: `server/services/checkpoint-validator.ts`

```typescript
export class CheckpointValidator {
  async validateCheckpoint(
    template: Template,
    checkpoint: CheckpointDefinition,
    userResponse: UserResponse
  ): Promise<ValidationResult> {
    // Validate user response against checkpoint criteria
  }

  async validateSchemaAlignment(
    template: Template,
    userSchema: DataSchema
  ): Promise<ValidationResult> {
    // Check if user's schema supports template requirements
  }

  async validateBusinessLogic(
    template: Template,
    artifacts: Artifact[]
  ): Promise<ValidationResult> {
    // Ensure business logic is sound
  }
}
```

### 3. Template Sourcer Service

**Status**: ⚠️ PARTIALLY IMPLEMENTED (system templates only)

**Required Extensions**: `server/services/template-sourcer.ts`

```typescript
export class TemplateSourcer {
  async sourceFromSystemLibrary(context: UserContext): Promise<Template[]> {
    // ✓ EXISTS in business-agent.ts as findTemplates()
  }

  async sourceFromUserUpload(file: File): Promise<Template> {
    // ❌ NEW - Parse user-provided template files
  }

  async sourceFromOnlineResearch(context: {
    industry: string;
    lob: string;
    queries: string[];
  }): Promise<Template[]> {
    // ❌ NEW - Web search for industry templates
  }

  async rankAndDeduplicate(
    templates: Template[],
    context: UserContext
  ): Promise<RankedTemplate[]> {
    // ❌ NEW - Score templates by relevance
  }
}
```

### 4. Enhanced Template Library

**Status**: ⚠️ BASIC TEMPLATES EXIST (4 industries, 2 templates each)

**Required**: `server/services/enhanced-business-templates.ts`

**Need 15+ Templates**:
- SaaS (Churn, Product Analytics, Pricing, Usage)
- E-commerce (Segmentation, Demand Forecast, Cart Abandonment)
- Healthcare (Patient Outcomes, Readmission, Resource Optimization)
- Finance (Credit Risk, Fraud, Portfolio)
- Manufacturing (Predictive Maintenance, Quality Control)

**Each Template Needs**:
- matchingCriteria (industry, LOB, subject, goals)
- analysisComponents (data prep, tests, models, viz)
- approvalCheckpoints (5+ checkpoints)
- businessContext and expectedOutcomes

---

## Part 3: Priority Implementation Matrix

### Critical (Week 1-2) - Blocks Entire Journey

| Component | Agent | Method | Effort | Blocker |
|-----------|-------|--------|--------|---------|
| Template Sourcing | Business | `sourceTemplates()` | High | Phase 1 |
| Natural Language Service | New Service | All methods | High | All checkpoints |
| Roadmap Creation | Project Manager | `createAnalysisRoadmap()` | Medium | Phase 2 |
| Checkpoint Coordination | Project Manager | `coordinateCheckpoint()` | High | All phases |
| Schema Definition | Data Scientist | `defineRequiredSchema()` | Medium | Phase 3 |

### High Priority (Week 3-4) - Major Features

| Component | Agent | Method | Effort | Impact |
|-----------|-------|--------|--------|--------|
| Template Library | Business | 15+ templates | High | User experience |
| Checkpoint Validator | New Service | All validation methods | Medium | Quality |
| Async Checkpoint Iterator | Project Manager | `executeWithCheckpoints()` | High | Flow control |
| Upload Guidance | Data Engineer | `guideDataUpload()` | Medium | Phase 4 |
| Step-Level Billing | Billing | `checkStepEligibility()` | Medium | Cost transparency |

### Medium Priority (Week 5-6) - Enhancements

| Component | Agent | Method | Effort | Impact |
|-----------|-------|--------|--------|--------|
| Business Validation | Business | All `validate*()` methods | High | Accuracy |
| Artifact Mapping | Data Scientist | `mapArtifactsToComponents()` | Low | Completeness |
| Quality Assessment | Data Engineer | `assessDataQuality()` | Medium | Data prep |
| Online Template Research | Business | `researchOnlineTemplates()` | High | Template variety |

### Low Priority (Week 7-8) - Nice-to-Have

| Component | Agent | Method | Effort | Impact |
|-----------|-------|--------|--------|--------|
| User Template Upload | Business | `parseUserTemplate()` | Medium | Flexibility |
| Advanced Insights | Business | `extractBusinessInsights()` | Medium | Value-add |
| Collaboration Features | Data Scientist | `collaborateOnInsights()` | Low | Team features |

---

## Part 4: Implementation Checklist

### Phase 1: Requirements & Template Selection

- [ ] **Business Agent**:
  - [ ] Implement `sourceTemplates(userContext)` with 3 sources
  - [ ] Build `matchTemplatesToContext()` scoring algorithm
  - [ ] Create `researchOnlineTemplates()` web search integration
  - [ ] Add `parseUserTemplate()` file parser

- [ ] **Project Manager**:
  - [ ] Add `consolidateRequirements()` method
  - [ ] Implement `presentTemplatesToUser()` with role adaptation
  - [ ] Update OrchestrationState with template tracking

- [ ] **Billing Agent**:
  - [ ] Add `checkEligibility()` for template selection

### Phase 2: Analysis Roadmap Creation

- [ ] **Project Manager**:
  - [ ] Extend `createWorkflowPlan()` to accept templates
  - [ ] Implement `mapRoadmapToArtifacts()` detailed mapping
  - [ ] Add `presentRoadmapForApproval()` with role-specific views

- [ ] **Data Scientist**:
  - [ ] Implement `mapArtifactsToComponents()`
  - [ ] Build collaboration with Project Manager

- [ ] **Business Agent**:
  - [ ] Add `validateBusinessAlignment()` for roadmap

### Phase 3: Data Schema Definition

- [ ] **Data Scientist**:
  - [ ] Implement `defineRequiredSchema()`
  - [ ] Add `validateSchemaFitsAnalysis()`

- [ ] **Business Agent**:
  - [ ] Build `explainSchema()` natural language translator
  - [ ] Implement `validateSchemaAlignment()`

- [ ] **Project Manager**:
  - [ ] Add `presentSchemaForApproval()`

### Phase 4: Data Upload & Transformation

- [ ] **Data Engineer**:
  - [ ] Implement `guideDataUpload()` interactive wizard
  - [ ] Build `validateUploadedData()`
  - [ ] Add `assessDataQuality()` with user-friendly reports
  - [ ] Implement `proposeCleaningPlan()`

- [ ] **Project Manager**:
  - [ ] Coordinate data quality checkpoint

### Phase 5: Analysis Execution

- [ ] **Project Manager**:
  - [ ] Implement `async *executeWithCheckpoints()` iterator
  - [ ] Add `coordinateCheckpoint()` for each analysis step
  - [ ] Build `processUserModifications()`

- [ ] **Data Scientist**:
  - [ ] Add checkpoint presentation methods
  - [ ] Enhance `collaborateOnInsights()` with Business Agent

- [ ] **Business Agent**:
  - [ ] Implement all `validate*()` methods
  - [ ] Build `translateFindings()` for each checkpoint

### Phase 6: Final Delivery

- [ ] **Project Manager**:
  - [ ] Extend `finalizeDelivery()` with role-specific packages
  - [ ] Add presentation generation

- [ ] **Data Scientist & Business Agent**:
  - [ ] Collaborate on insight generation
  - [ ] Build role-specific artifact creation

---

## Part 5: Testing Requirements

### Unit Tests Needed

1. **Template Sourcing**: Test system, user, online retrieval
2. **Schema Validation**: Test all validation rules
3. **Checkpoint Flow**: Test async iteration and pause/resume
4. **Billing Integration**: Test eligibility checks at each step
5. **Natural Language**: Test translation for all user roles

### Integration Tests Needed

1. **Full Phase 1**: Template selection end-to-end
2. **Full Phase 2**: Roadmap creation and approval
3. **Full Phase 3**: Schema definition and validation
4. **Full Phase 4**: Data upload and transformation
5. **Full Phase 5**: Analysis with checkpoints
6. **Full Phase 6**: Artifact delivery

### E2E Journey Tests Needed

1. **Non-Tech User Journey**: Maximum handholding, simplified language
2. **Business User Journey**: Template-driven, KPI-focused
3. **Technical User Journey**: Detailed control, code generation
4. **Consultation User Journey**: Expert-level customization

---

## Part 6: Summary & Recommendations

### Current State: 85% Ready

**Strong Foundation**:
- ✅ All 5 core agents implemented
- ✅ Workflow orchestration exists
- ✅ Statistical analysis comprehensive
- ✅ Data pipeline infrastructure solid
- ✅ Billing system feature-complete

**Critical Gaps (15%)**:
- ❌ Multi-source template retrieval
- ❌ Natural language translation service
- ❌ Checkpoint coordination framework
- ❌ Interactive user approval flows
- ❌ Role-specific presentation generation

### Immediate Actions (Week 1-2)

1. **Create Natural Language Translator Service** (3-4 days)
   - Essential for all user interactions
   - Blocks checkpoints in all phases

2. **Extend Business Agent with Multi-Source Templates** (2-3 days)
   - Required for Phase 1
   - Foundation for template-driven workflows

3. **Implement Checkpoint Coordination in Project Manager** (4-5 days)
   - Core of interactive workflow
   - Enables user approval at each step

4. **Add Schema Definition to Data Scientist** (2 days)
   - Required for Phase 3
   - Drives data collection strategy

### Recommended Sequence

**Week 1-2**: Build infrastructure (Natural Language, Checkpoints)
**Week 3-4**: Extend agents with missing methods
**Week 5-6**: Build template library (15+ templates)
**Week 7-8**: Integration testing and UI components

### Success Criteria

- [ ] User can complete full journey in each role
- [ ] Checkpoints pause and wait for approval
- [ ] Natural language explanations clear to non-tech users
- [ ] Templates match accurately to user context
- [ ] Billing integrates seamlessly at each step
- [ ] All 11 checkpoints functional with validation

---

*Generated by Agent Capability Gap Analysis - January 6, 2025*
