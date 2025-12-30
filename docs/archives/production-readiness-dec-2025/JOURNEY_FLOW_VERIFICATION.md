# Journey Flow Verification - Complete U2A2A2A2U Architecture

**Date**: December 2025  
**Purpose**: Verify complete journey flow from data upload to results, ensuring U2A2A2A2U architecture with agents leveraging MCP tools

---

## Overview

This document verifies the complete 8-step journey flow, ensuring:
1. ✅ Data flows correctly between steps
2. ✅ Agents are called at the right points
3. ✅ MCP tools are used correctly via tool registry
4. ✅ Billing is calculated correctly
5. ✅ Analysis execution works
6. ✅ Results are displayed correctly

---

## Step-by-Step Verification

### Step 1: Data Upload & Setup

**Route**: `/journeys/:type/data`  
**Component**: `client/src/pages/data-upload-step.tsx`  
**Backend**: `server/routes/project.ts` (POST `/api/projects/upload`)

#### Verification Checklist

- [ ] **Project Creation**
  - Project auto-created on first file upload
  - Project ID stored in `localStorage` and `journeyProgress`
  - Project linked to user

- [ ] **Dataset Upload**
  - File uploaded and processed
  - Dataset created in `datasets` table
  - Dataset linked to project via `project_datasets` table
  - Schema extracted and stored

- [ ] **PII Detection**
  - PII detection runs automatically
  - PII findings stored in `dataset.piiAnalysis`
  - User can review and exclude PII columns
  - PII decisions stored in `journeyProgress.piiDecision` and `project.metadata.piiDecision`

- [ ] **Dataset Joining** (if multiple files)
  - Multiple datasets can be uploaded
  - Data Engineer agent suggests join keys
  - Joined dataset preview generated
  - Full joined data stored in `journeyProgress.joinedData.fullData`
  - Joined schema stored in `journeyProgress.joinedData.schema`

- [ ] **Data Storage**
  - Data stored in `journeyProgress` (SSOT)
  - `journeyProgress.joinedData.preview` for preview
  - `journeyProgress.joinedData.fullData` for full dataset
  - `journeyProgress.joinedData.schema` for schema

#### Agent Activity

- **Data Engineer Agent**: Suggests join keys for multi-dataset scenarios
- **Technical AI Agent**: PII detection (via `pii_detector` tool)

#### MCP Tools Used

- `pii_detector` - PII detection
- `data_joiner` - Dataset joining (if multiple files)

---

### Step 2: Analysis Preparation

**Route**: `/journeys/:type/prepare`  
**Component**: `client/src/pages/prepare-step.tsx`  
**Backend**: `server/routes/project.ts` (POST `/api/projects/:id/generate-data-requirements`)

#### Verification Checklist

- [ ] **Goals & Questions Capture**
  - User enters analysis goal
  - User enters business questions
  - Goals/questions stored in `journeyProgress.goals` and `journeyProgress.questions`

- [ ] **PM Agent Recommendations**
  - Project Manager Agent analyzes goals/questions
  - PM Agent provides clarifications if needed
  - Recommendations stored in `journeyProgress.pmRecommendations`

- [ ] **Requirements Generation**
  - Data Scientist Agent generates analysis recommendations
  - Required data elements defined
  - Question-to-analysis mapping created
  - Requirements document stored in `journeyProgress.requirementsDocument`
  - Requirements locked (`requirementsLocked: true`)

- [ ] **Data Structure**
  - `requirementsDocument.analysisPath` - Analysis recommendations
  - `requirementsDocument.requiredDataElements` - Required data elements
  - `requirementsDocument.questionAnswerMapping` - Question-to-analysis linkage
  - `requirementsDocument.userGoals` - User goals
  - `requirementsDocument.userQuestions` - User questions

#### Agent Activity

- **Project Manager Agent**: Analyzes goals/questions, provides recommendations
- **Data Scientist Agent**: Generates analysis recommendations and required data elements
- **Template Research Agent**: Suggests industry templates (if applicable)

#### MCP Tools Used

- `required_data_elements_tool` - Generate requirements document
- `analysis_recommender` - Recommend analysis types

---

### Step 3: Data Verification

**Route**: `/journeys/:type/data-verification`  
**Component**: `client/src/pages/data-verification-step.tsx`  
**Backend**: `server/routes/project.ts` (POST `/api/projects/:id/create-mapping-document`)

#### Verification Checklist

- [ ] **Requirements Loading**
  - Requirements document loaded from `journeyProgress.requirementsDocument` (SSOT)
  - No regeneration if requirements are locked
  - Falls back to API only if not locked and document missing

- [ ] **Data Element Mapping**
  - User maps required data elements to source columns
  - Mappings saved to `journeyProgress.requirementsDocument.requiredDataElements[].sourceColumn`

- [ ] **Data Engineer Enhancement**
  - Data Engineer agent called via `/api/projects/:id/enhance-requirements-mappings`
  - Source field mappings added
  - Transformation logic in natural language added
  - Stored in `requirementsDocument.requiredDataElements[].transformationLogic`

- [ ] **Schema Display**
  - Joined schema displayed (from `journeyProgress.joinedData.schema`)
  - Shows all columns from all datasets (if joined)

- [ ] **Data Quality**
  - Data quality metrics displayed
  - User can approve quality

#### Agent Activity

- **Data Engineer Agent**: Adds source field mappings and transformation logic

#### MCP Tools Used

- `data_quality_checker` - Data quality assessment
- `schema_validator` - Schema validation

---

### Step 4: Data Transformation

**Route**: `/journeys/:type/data-transformation`  
**Component**: `client/src/pages/data-transformation-step.tsx`  
**Backend**: `server/routes/data-transformation.ts` (POST `/api/projects/:id/execute-transformations`)

#### Verification Checklist

- [ ] **Transformation Logic Loading**
  - Uses stored transformation logic from verification step
  - `element.transformationLogic.description` (natural language)
  - `element.transformationLogic.code` (if provided)

- [ ] **Transformation Execution**
  - Transformations applied to joined dataset
  - Transformed data stored in `dataset.ingestionMetadata.transformedData`
  - Transformed schema stored in `dataset.ingestionMetadata.transformedSchema`

- [ ] **Data Storage**
  - Transformed data available for analysis execution
  - Transformation steps stored in `journeyProgress.transformationSteps`

#### Agent Activity

- **Data Engineer Agent**: Executes transformations based on stored logic

#### MCP Tools Used

- `data_transformer` - Execute transformations
- `transformation_validator` - Validate transformation results

---

### Step 5: Analysis Plan

**Route**: `/journeys/:type/plan`  
**Component**: `client/src/pages/plan-step.tsx`  
**Backend**: `server/routes/project.ts` (POST `/api/projects/:id/create-analysis-plan`)

#### Verification Checklist

- [ ] **Execution Plan Generation**
  - Plan generated from `requirementsDocument.analysisPath`
  - Expected artifacts defined
  - Execution steps outlined

- [ ] **Cost Calculation**
  - Billing service calculates costs
  - Based on analysis types, data volume, compute requirements
  - Costs displayed to user

- [ ] **Plan Approval**
  - User reviews plan
  - User approves plan
  - Plan stored in `analysis_plans` table
  - `project.approvedPlanId` set

#### Agent Activity

- **Project Manager Agent**: Coordinates plan generation
- **Business Agent**: Validates business alignment

#### MCP Tools Used

- `cost_calculator` - Calculate analysis costs
- `plan_generator` - Generate execution plan

---

### Step 6: Execution

**Route**: `/journeys/:type/execute`  
**Component**: `client/src/pages/execute-step.tsx`  
**Backend**: `server/services/analysis-execution.ts` (AnalysisExecutionService.executeAnalysis)

#### Verification Checklist

- [ ] **Analysis Execution**
  - Uses transformed data from Step 4
  - Executes analyses from `requirementsDocument.analysisPath`
  - Each analysis type executed via appropriate MCP tool

- [ ] **Agent Coordination**
  - Data Scientist Agent: Executes statistical analyses
  - Technical AI Agent: Executes ML/AI analyses
  - Business Agent: Adds business context
  - Project Manager Agent: Coordinates workflow

- [ ] **MCP Tool Usage**
  - `statistical_analyzer` - Statistical analyses
  - `ml_pipeline` - Machine learning analyses
  - `visualization_engine` - Generate visualizations
  - Tools called via `executeTool()` with proper agent context

- [ ] **Checkpoint Approvals**
  - Checkpoints created at key decision points
  - User approval required before proceeding
  - Checkpoint status tracked in `journeyProgress.checkpoints`

- [ ] **Results Generation**
  - Analysis results stored in `project.analysisResults`
  - Artifacts saved to `uploads/artifacts/{projectId}/`
  - Insights linked to questions via `questionAnswerMapping`

- [ ] **Usage Tracking**
  - Tool usage tracked via `tool-analytics` service
  - Usage reported to billing service
  - Billing integration records usage for Stripe

#### Agent Activity

- **Data Scientist Agent**: Executes statistical analyses
- **Technical AI Agent**: Executes ML/AI analyses (used by Data Scientist)
- **Business Agent**: Adds business context to results
- **Project Manager Agent**: Coordinates workflow, creates checkpoints

#### MCP Tools Used

- `statistical_analyzer` - Statistical analyses
- `ml_pipeline` - Machine learning
- `comprehensive_ml_pipeline` - Advanced ML
- `visualization_engine` - Visualizations
- `enhanced_visualization_engine` - Enhanced visualizations

---

### Step 7: Billing & Payment

**Route**: `/journeys/:type/pricing`  
**Component**: `client/src/pages/pricing-step.tsx`  
**Backend**: `server/routes/payment.ts` (POST `/api/payment/create-checkout-session`)

#### Verification Checklist

- [ ] **Usage Calculation**
  - Usage tracked from Step 6 execution
  - Tool usage recorded via `billing-analytics-integration`
  - Feature usage tracked per analysis type

- [ ] **Cost Calculation**
  - Unified Billing Service calculates costs
  - Subscription credits applied
  - Overage costs calculated
  - Feature costs calculated

- [ ] **Stripe Integration**
  - Checkout session created
  - Payment processed
  - Invoice generated
  - `project.analysisBilledAt` set

- [ ] **Usage Reporting**
  - Usage reported to Stripe for metered billing
  - Usage metrics stored in database

#### Agent Activity

- **Billing Service**: Calculates costs, processes payment

#### MCP Tools Used

- None (billing is service-level, not tool-based)

---

### Step 8: Results & Dashboard

**Route**: `/journeys/:type/results`  
**Component**: `client/src/pages/dashboard-step.tsx`  
**Backend**: `server/routes/project.ts` (GET `/api/projects/:id/results`)

#### Verification Checklist

- [ ] **Results Display**
  - Analysis results loaded from `project.analysisResults`
  - Results linked to questions via `questionAnswerMapping`
  - Results linked to analysis types via `requirementsDocument.analysisPath`

- [ ] **Artifacts Display**
  - Artifacts loaded from `uploads/artifacts/{projectId}/`
  - Visualizations displayed
  - Reports available for download

- [ ] **Question-Answer Linking**
  - Each result shows which questions it answers
  - Traceability from question → analysis → result

- [ ] **Export Functionality**
  - Results can be exported
  - Artifacts can be downloaded

#### Agent Activity

- None (display only)

#### MCP Tools Used

- None (display only)

---

## U2A2A2A2U Architecture Verification

### User → Agent Flow

1. **User Input** (Step 1-2)
   - User uploads data, enters goals/questions
   - Stored in `journeyProgress`

2. **Agent Processing** (Step 2-6)
   - Agents read from `journeyProgress`
   - Agents use MCP tools via `executeTool()`
   - Agent results stored back in `journeyProgress`

3. **User Approval** (Checkpoints)
   - Checkpoints created at key decision points
   - User approves before proceeding
   - Approval stored in `journeyProgress.checkpoints`

4. **Final Results** (Step 8)
   - Results displayed to user
   - Linked back to original questions

### Agent → Tool Flow

1. **Tool Discovery**
   - Agents use `MCPToolRegistry.findToolsByCapability()`
   - Tools discovered based on semantic capabilities

2. **Tool Execution**
   - Agents call `executeTool(toolName, agentId, input, context)`
   - Tool registry validates permissions
   - Tool handler executes
   - Results returned to agent

3. **Usage Tracking**
   - Tool usage tracked automatically
   - Usage reported to billing service
   - Billing integration records for Stripe

---

## Data Flow Verification

### SSOT: `journeyProgress`

All journey state stored in `project.journeyProgress` (JSONB):

```typescript
{
  // Step 1
  joinedData: { preview, fullData, schema },
  piiDecision: { ... },
  
  // Step 2
  goals: [...],
  questions: [...],
  requirementsDocument: {
    analysisPath: [...],
    requiredDataElements: [...],
    questionAnswerMapping: [...],
    userGoals: [...],
    userQuestions: [...]
  },
  requirementsLocked: true,
  
  // Step 3
  requirementsDocument: {
    requiredDataElements: [{
      sourceColumn: "...",
      transformationLogic: { description: "...", code: "..." }
    }]
  },
  
  // Step 4
  transformationSteps: [...],
  
  // Step 5
  executionPlan: {...},
  estimatedCosts: {...},
  
  // Step 6
  analysisResults: [...],
  checkpoints: [...],
  
  // Step 7
  paymentCompleted: true,
  invoiceId: "..."
}
```

---

## Verification Status

- [ ] Step 1: Data Upload & Setup
- [ ] Step 2: Analysis Preparation
- [ ] Step 3: Data Verification
- [ ] Step 4: Data Transformation
- [ ] Step 5: Analysis Plan
- [ ] Step 6: Execution
- [ ] Step 7: Billing & Payment
- [ ] Step 8: Results & Dashboard

---

## Next Steps

1. Run end-to-end test for each step
2. Verify agent calls at each step
3. Verify MCP tool usage
4. Verify billing calculations
5. Verify results display

