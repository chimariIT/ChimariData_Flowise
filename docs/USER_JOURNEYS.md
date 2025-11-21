# User Journeys Guide

**Part of ChimariData Documentation** | [← Back to Main](../CLAUDE.md)

This document covers journey types, workflow steps, analysis components, Python integration, AI services, and Spark processing.

---

## 📋 Table of Contents

- [Journey Framework](#journey-framework)
- [Journey Types](#journey-types)
- [Journey Steps](#journey-steps)
- [Journey Artifacts](#journey-artifacts)
- [Analysis Components](#analysis-components)
- [Python-TypeScript Bridge](#python-typescript-bridge)
- [AI Service Integration](#ai-service-integration)
- [Spark Integration](#spark-integration)
- [Adding New Analysis Features](#adding-new-analysis-features)

---

## Journey Framework

### Overview

User journeys are template-driven workflows that guide users through data analysis projects. Each journey type is optimized for specific user roles and use cases.

### Journey Type to User Role Mapping

**Location**: `shared/canonical-types.ts`

```typescript
ai_guided → ['non-tech']
template_based → ['business']
self_service → ['technical']
consultation → ['technical', 'business', 'consultation']
custom → ['technical', 'business', 'consultation', 'custom']
```

### Journey Template System

**Location**: `shared/journey-templates.ts`

The platform uses a template-driven architecture for journey orchestration:

- **Template Definitions**: Pre-configured journey steps, agents, and tools
- **Journey Types**: `non-tech`, `business`, `technical`, `consultation`
- **Agent Assignment**: Each step specifies required agents with handoff notes
- **Tool Integration**: Templates define which tools are available at each step
- **Modular Workflow**: Journey templates enable consistent, repeatable workflows

### Journey Initiation

Every user journey begins with:

1. **Project Objectives Definition**: Clear goal articulation
2. **Business Context Definition**: Domain and industry context
3. **Analysis Questions**: Specific questions to be answered
4. **Goal Definition**: Success criteria and deliverables

---

## Journey Types

### 1. AI-Guided Journey (`ai_guided`)

**Target Users**: Non-technical users
**Agent Involvement**: Maximum - Full orchestration

**Workflow**:
- PM agent guides every step with plain-language explanations
- Automatic data quality checks and schema detection
- Pre-configured analysis templates based on data characteristics
- Visual dashboards with no technical jargon
- Executive summaries as primary deliverables

**Key Features**:
- No coding required
- Conversational interface
- Automatic insights generation
- PDF reports ready for presentation

---

### 2. Template-Based Journey (`template_based`)

**Target Users**: Business users with domain expertise
**Agent Involvement**: High - Structured guidance

**Workflow**:
- Industry-specific templates (HR, Finance, Marketing, etc.)
- Business Agent provides domain context
- Pre-built analysis workflows (e.g., "Employee Engagement Analysis")
- Customizable parameters within template constraints
- Business-focused outputs (ROI, KPIs, benchmarks)

**Key Features**:
- Industry-specific templates
- Regulatory compliance built-in
- Benchmark comparisons
- Strategic recommendations

---

### 3. Self-Service Journey (`self_service`)

**Target Users**: Technical users (data scientists, analysts)
**Agent Involvement**: Low - Full control

**Workflow**:
- Direct access to all analysis tools
- Code generation for Python/R scripts
- Raw data access and manipulation
- Custom visualization development
- Technical documentation as output

**Key Features**:
- Full tool access
- Code export capabilities
- Advanced statistical methods
- ML model fine-tuning control

---

### 4. Consultation Journey (`consultation`)

**Target Users**: Any user seeking expert assistance
**Agent Involvement**: Maximum - Personalized guidance

**Workflow**:
- Initial consultation with PM agent to understand needs
- Custom methodology design
- Expert review at each checkpoint
- Personalized reports with strategic advisory
- Highest level of customization

**Key Features**:
- Personalized consultation
- Custom methodology
- Peer review insights
- Strategic advisory documents
- Expert involvement

---

### 5. Custom Journey (`custom`)

**Target Users**: Advanced users building custom workflows
**Agent Involvement**: Variable - User-defined

**Workflow**:
- User defines journey steps and agent involvement
- Mix-and-match analysis components
- Custom approval checkpoints
- Flexible artifact generation
- Reusable journey templates

**Key Features**:
- Complete workflow customization
- Reusable journey definitions
- Multi-agent orchestration control
- Custom checkpoint logic

---

## Journey Steps

### Standard Workflow (8 Steps)

#### 1. Project Setup Step

**Location**: `client/src/pages/project-setup-step.tsx`

**Purpose**: Define objectives and context

**User Actions**:
- Enter project name and description
- Define business objectives
- Specify industry and domain
- Set analysis goals and success criteria

**Agent Actions**:
- PM agent validates objectives
- Business agent identifies relevant industry context
- Template research agent suggests applicable templates

---

#### 2. Data Step

**Location**: `client/src/pages/data-step.tsx`

**Purpose**: Upload and validate data

**User Actions**:
- Upload datasets (CSV, Excel, JSON, etc.)
- Select data source type (file upload, live source, stream)
- Preview data

**Agent Actions**:
- Data Engineer performs initial quality assessment
- File processor validates format and detects schema
- PII detection and anonymization if needed

**Critical Services**:
- `server/services/file-processor.ts` - File upload and validation
- `server/services/unified-pii-processor.ts` - PII detection

---

#### 3. Data Verification Step

**Location**: `client/src/pages/data-verification-step.tsx`

**Purpose**: Schema validation and quality checks

**User Actions**:
- Review auto-detected schema
- Confirm or modify column types
- Validate data quality metrics

**Agent Actions**:
- Data Engineer provides detailed quality report
- Schema generator auto-detects column types and constraints
- Data profiling for distributions and anomalies

**Critical Services**:
- `server/services/data-engineer-agent.ts` - Quality assessment
- `server/routes/data-verification.ts` - Verification endpoints

---

#### 4. Plan Step (NEW)

**Location**: `client/src/pages/plan-step.tsx`

**Purpose**: Multi-agent analysis planning with cost estimation

**User Actions**:
- Review agent-generated analysis plan
- Approve, modify, or request clarifications
- Review cost breakdown and resource estimates

**Agent Actions**:
- **Data Engineer**: Estimates data requirements and processing needs
- **Data Scientist**: Recommends analysis configurations and ML models
- **PM Agent**: Coordinates recommendations and presents unified plan

**Critical Services**:
- `server/routes/analysis-plans.ts` - Analysis plan management
- `server/services/project-manager/journey-planner.ts` - Plan generation

**Database**: `analysis_plans` table stores plan details

**Message Broker Events**:
- `data:requirements_estimated` - Data Engineer completes assessment
- `analysis:recommended` - Data Scientist completes recommendations
- `plan:approved` - User approves the plan

---

#### 5. Prepare Step

**Location**: `client/src/pages/prepare-step.tsx`

**Purpose**: Data transformation and feature engineering

**User Actions**:
- Review suggested transformations
- Approve or customize data cleaning steps
- Select features for analysis

**Agent Actions**:
- Data Engineer designs transformation pipeline
- Data transformer executes cleaning and feature engineering
- Spark processor handles heavy transformations

**Critical Services**:
- `server/services/data-transformer.ts` - Transformation logic
- `server/services/spark-processor.ts` - Distributed processing

---

#### 6. Execute Step

**Location**: `client/src/pages/execute-step.tsx`

**Purpose**: Run analysis and generate results

**User Actions**:
- Monitor analysis progress (WebSocket updates)
- View real-time logs and status
- Wait for completion

**Agent Actions**:
- Data Scientist executes statistical tests and ML training
- Visualization engine generates charts and dashboards
- Python scripts perform actual computations

**Critical Services**:
- `server/services/data-scientist-agent.ts` - Analysis execution
- `server/services/python-processor.ts` - Python bridge
- `server/routes/analysis-execution.ts` - Execution endpoints

**WebSocket Events**:
- `analysis:progress` - Progress updates (e.g., "ML training at 45%")
- `analysis:complete` - Execution finished
- `error:notification` - Real-time error alerts

---

#### 7. Results Preview Step

**Location**: `client/src/pages/results-preview-step.tsx`

**Purpose**: Review and approve outputs

**User Actions**:
- Preview generated visualizations
- Review statistical results
- Request modifications if needed

**Agent Actions**:
- PM agent presents results summary
- Visualization engine generates preview charts
- Data Scientist provides interpretation

---

#### 8. Results Step

**Location**: `client/src/pages/results-step.tsx`

**Purpose**: Final deliverables

**User Actions**:
- Download reports (PDF, PPTX, etc.)
- Export visualizations
- Access generated code/models

**Agent Actions**:
- Artifact generator creates final deliverables
- PDF generator for reports
- Code export for technical users

**Critical Services**:
- `server/services/artifact-generator.ts` - Artifact creation
- `python/pdf_generator.py` - PDF report generation

---

## Journey Artifacts

### Non-Tech Journey Artifacts

- **Executive Summaries**: Plain-language insights
- **Visual Dashboards**: Interactive charts with no technical jargon
- **PDF Reports**: Presentation-ready with business recommendations
- **Business Recommendations**: Actionable outcomes

### Business Journey Artifacts

- **Business Intelligence Reports**: Industry benchmarks
- **Regulatory Compliance Insights**: GDPR, HIPAA, etc.
- **ROI Analysis**: Financial impact projections
- **Presentation-Ready Charts**: PowerPoint-compatible
- **Strategic Recommendations**: C-level decision support

### Technical Journey Artifacts

- **Code Generation**: Python/R scripts for reproducibility
- **Statistical Test Results**: Detailed methodologies and p-values
- **ML Model Artifacts**: Trained models, feature importance, confusion matrices
- **Technical Documentation**: Pipeline specifications
- **Raw Data Access**: CSV, JSON exports

### Consultation Journey Artifacts

- **Personalized Consultation Reports**: Custom analysis narratives
- **Custom Methodology Design**: Tailored statistical approaches
- **Peer Review Insights**: Expert validation
- **Strategic Advisory Documents**: Executive briefings
- **Expert Involvement**: Highest customization

---

## Analysis Components

### Data Ingestion

**Location**: `server/services/file-processor.ts`, `server/services/unified-pii-processor.ts`

**Features**:
- File upload with validation and malware scanning
- Automatic PII detection and anonymization
- Schema detection and data profiling
- Cloud storage integration (AWS S3, Azure Blob, Google Cloud Storage)

**Supported Formats**:
- CSV, Excel (XLSX, XLS)
- JSON, JSONL
- Parquet, Avro
- SQL database connections
- Live data sources

---

### Data Transformation

**Location**: `server/services/data-transformer.ts`, `server/services/spark-processor.ts`

**Features**:
- Data cleaning and filtering
- Feature engineering and aggregation
- Multi-dataset joining and merging
- Real-time streaming data processing
- Schema evolution management

**When to Use Spark**:
- Datasets >1GB
- Complex multi-table joins
- Real-time streaming analytics
- Large-scale transformations

---

### Statistical Analysis

**Location**: `server/services/advanced-analyzer.ts`, `python/statistical_tests.py`

**Features**:
- Descriptive statistics (mean, median, std dev, quartiles)
- Inferential statistics (t-tests, chi-square, z-tests)
- Hypothesis testing (ANOVA, ANCOVA, MANOVA, MANCOVA)
- Regression analysis (linear, polynomial, logistic)
- Time series forecasting (ARIMA, seasonal decomposition)
- Anomaly detection and pattern recognition

**UI Component**: `client/src/components/advanced-analysis-modal.tsx`

---

### Machine Learning Pipeline

**Location**: `server/services/ml-service.ts`, `python/ml-analysis.py`

**Features**:
- Feature engineering and selection
- Model training (supervised/unsupervised)
- Model evaluation (cross-validation, metrics)
- Model deployment and real-time scoring
- Hyperparameter tuning
- Ensemble methods

**Supported Algorithms**:
- Classification: Logistic Regression, Random Forest, SVM, XGBoost
- Regression: Linear, Ridge, Lasso, Polynomial
- Clustering: K-means, Hierarchical, DBSCAN
- Dimensionality Reduction: PCA, t-SNE

**Spark MLlib** (for large datasets):
- Distributed model training
- Large-scale feature engineering
- Scalable cross-validation

---

### Visualization Engine

**Location**: `server/services/visualization-api-service.ts`, `python/visualization_generator.py`

**Features**:
- 8 chart types with interactive configuration
- Real-time dashboard updates
- Custom visualization development
- Export capabilities (PNG, SVG, PDF)

**Chart Types**:
1. Line charts (time series)
2. Bar charts (comparisons)
3. Scatter plots (correlations)
4. Histograms (distributions)
5. Box plots (outliers)
6. Heatmaps (correlation matrices)
7. Pie charts (proportions)
8. Area charts (cumulative trends)

---

## Python-TypeScript Bridge

**Location**: `server/services/python-processor.ts`, `server/services/enhanced-python-processor.ts`

### How It Works

The platform uses child process spawning to execute Python analysis scripts:

```typescript
// TypeScript calls Python script
const result = await executePythonScript('statistical_tests.py', {
  data: dataset,
  testType: 'anova',
  config: analysisConfig
});
```

### Python Script Pattern

```python
# python/statistical_tests.py
import json
import sys

def perform_analysis(data, config):
    # Real implementation using statsmodels, scipy, etc.
    result = {"statistics": {...}, "p_value": 0.05}
    return result

if __name__ == "__main__":
    input_json = sys.argv[1]
    input_data = json.loads(input_json)

    result = perform_analysis(input_data['data'], input_data['config'])

    # CRITICAL: Output JSON to stdout for TypeScript parsing
    print(json.dumps(result))
```

### Available Python Scripts

#### Core Analysis (`python/`)

1. **statistical_tests.py** - ANOVA, regression, correlation, t-tests
2. **ml_training.py** - ML model training and evaluation
3. **visualization_generator.py** - Chart generation with matplotlib/plotly
4. **descriptive_stats.py** - Summary statistics and distributions
5. **classification_analysis.py** - Classification models
6. **clustering_analysis.py** - K-means, hierarchical clustering
7. **regression_analysis.py** - Linear, polynomial, ridge regression
8. **correlation_analysis.py** - Pearson, Spearman correlations
9. **llm_fine_tuning.py** - LLM fine-tuning workflows
10. **comprehensive_ml_lifecycle.py** - End-to-end ML pipeline
11. **pdf_generator.py** - PDF report generation
12. **spark/spark_bridge.py** - Spark integration bridge

#### Additional Utilities (`python_scripts/`)

1. **data_analyzer.py** - Comprehensive data analysis
2. **advanced_anova.py** - Advanced ANOVA analysis
3. **trial_analyzer.py** - Clinical trial analysis
4. **outlier_detector.py** - Outlier detection algorithms
5. **normality_tester.py** - Statistical normality tests
6. **missing_data_analyzer.py** - Missing data analysis and imputation
7. **survey_analyzer.py** - Survey data analysis

### Critical Requirements

- ✅ Python scripts must output JSON to stdout for TypeScript parsing
- ✅ Use `server/services/enhanced-python-processor.ts` for advanced error handling
- ✅ All Python dependencies must be in `requirements.txt`
- ✅ Scripts receive input via command-line JSON argument
- ✅ Set `PYTHON_SCRIPT_TIMEOUT` environment variable (default: 300000ms)

### Error Handling

**Enhanced Python Processor** includes:
- Timeout handling (configurable via env var)
- Stderr capturing for detailed error messages
- JSON parsing validation
- Automatic retry logic (optional)
- Process cleanup on failure

---

## AI Service Integration

**Location**: `server/services/role-based-ai.ts`

### Multi-Provider AI Integration

The platform integrates with multiple AI providers with automatic fallback:

**Supported Providers**:
1. **Google Gemini** (default) - `GOOGLE_AI_API_KEY`
2. **OpenAI GPT** models - `OPENAI_API_KEY`
3. **Anthropic Claude** - `ANTHROPIC_API_KEY`

### Usage Pattern

```typescript
import { getRoleBasedAI } from './services/role-based-ai';

const aiService = getRoleBasedAI();
const response = await aiService.generateInsights(userQuery, userRole, context);
```

### Key Features

- **Automatic Provider Selection**: Based on subscription tier and availability
- **Role-Specific Prompt Templating**: Tailored for `non-tech`, `business`, `technical`, `consultation`
- **Token Usage Tracking**: For billing integration
- **Graceful Fallback**: Automatic switch between providers on failure

### Role-Based Prompts

**Non-Tech Users**:
- Plain language explanations
- No technical jargon
- Visual emphasis
- Executive summaries

**Business Users**:
- Industry-specific terminology
- ROI and KPI focus
- Regulatory compliance awareness
- Strategic recommendations

**Technical Users**:
- Detailed methodologies
- Statistical rigor
- Code generation
- Technical documentation

**Consultation Users**:
- Personalized approach
- Custom methodology design
- Expert-level insights
- Strategic advisory

---

## Spark Integration

**Location**: `server/services/spark-processor.ts`

### Heavy Data Processing

**When to Use Spark**:
- Data transformations exceeding memory limits (>1GB)
- Complex multi-table joins and aggregations
- Real-time streaming data analysis
- Large-scale machine learning model training
- Time series analysis on historical datasets (years of data)

### Capabilities

#### Distributed Computing
- Large dataset processing using Spark clusters
- Automatic data partitioning
- In-memory caching for performance

#### Streaming Analytics
- Real-time data processing with Spark Streaming
- Windowed aggregations
- Stream-to-batch integration

#### ML at Scale
- Distributed machine learning with Spark MLlib
- Large-scale feature engineering
- Scalable cross-validation and hyperparameter tuning

#### Data Lake Integration
- Direct access to data lakes (S3, HDFS, Azure Data Lake)
- Warehouse integration (Snowflake, BigQuery, Redshift)
- Parquet and Avro format support

### Performance Optimization

- **Automatic Cluster Scaling**: Based on workload
- **Intelligent Data Partitioning**: Optimized for query patterns
- **Query Optimization**: Catalyst optimizer and Tungsten execution engine
- **Resource Management**: Dynamic resource allocation

### Configuration

**Environment Variables**:
```bash
SPARK_ENABLED="true"                        # Enable Spark processing
SPARK_MASTER_URL="spark://master:7077"      # Spark master URL
SPARK_APP_NAME="ChimariData-Analytics"      # Spark application name
```

**→ See**: [SPARK_FULL_SETUP_GUIDE.md](../SPARK_FULL_SETUP_GUIDE.md)

---

## Adding New Analysis Features

### Step-by-Step Process

#### 1. Define Analysis Type

Edit `shared/schema.ts`:
```typescript
export const analysisTypeEnum = z.enum([
  'descriptive',
  'anova',
  'regression',
  'ml_classification',
  'new_analysis_type',  // Add new type
]);
```

#### 2. Create Python Script

Create `python/new_analysis_type.py`:
```python
import json
import sys
import numpy as np
# Import necessary libraries

def perform_new_analysis(data, config):
    """
    Real implementation of new analysis type.

    Args:
        data: Input dataset (list of dicts or pandas DataFrame)
        config: Analysis configuration parameters

    Returns:
        dict: Analysis results
    """
    # Implement analysis logic
    result = {
        "statistics": {...},
        "visualizations": {...},
        "insights": [...]
    }
    return result

if __name__ == "__main__":
    input_json = sys.argv[1]
    input_data = json.loads(input_json)

    result = perform_new_analysis(input_data['data'], input_data['config'])
    print(json.dumps(result))
```

#### 3. Add Tool Handler

Edit `server/services/real-tool-handlers.ts`:
```typescript
export const NewAnalysisHandler = {
  async execute(input: any, context: any): Promise<ToolResult> {
    const pythonProcessor = require('./python-processor');

    const result = await pythonProcessor.executePythonScript(
      'new_analysis_type.py',
      {
        data: input.data,
        config: input.config
      }
    );

    return {
      status: 'success',
      result,
      metrics: {
        executionTime: Date.now(),
        dataRows: input.data.length
      }
    };
  }
};
```

#### 4. Register Tool

Edit `server/services/mcp-tool-registry.ts`:
```typescript
MCPToolRegistry.registerTool({
  name: 'new_analysis_tool',
  category: 'analysis',
  description: 'Performs new type of analysis',
  inputSchema: z.object({
    data: z.array(z.any()),
    config: z.object({...})
  }),
  outputSchema: z.object({
    statistics: z.any(),
    visualizations: z.any()
  }),
  permissions: ['data_scientist', 'technical'],  // Who can use this tool
  handler: NewAnalysisHandler
});
```

#### 5. Update Agent Logic

Edit `server/services/data-scientist-agent.ts`:
```typescript
async performNewAnalysis(data: any, config: any) {
  const { executeTool } = require('./mcp-tool-registry');

  const result = await executeTool(
    'new_analysis_tool',
    'data_scientist_agent',
    { data, config },
    { userId: this.userId, projectId: this.projectId }
  );

  return result;
}
```

#### 6. Add UI Component

Create `client/src/components/new-analysis-modal.tsx`:
```typescript
export function NewAnalysisModal({ data, onComplete }) {
  const [config, setConfig] = useState({...});

  const handleRunAnalysis = async () => {
    const result = await apiClient.post('/api/analysis/new-type', {
      data,
      config
    });
    onComplete(result);
  };

  return (
    <Dialog>
      {/* Configuration UI */}
      <Button onClick={handleRunAnalysis}>Run Analysis</Button>
    </Dialog>
  );
}
```

#### 7. Test Integration

Create tests:
```typescript
// tests/unit/analysis/new-analysis.test.ts
describe('New Analysis Type', () => {
  it('should execute new analysis correctly', async () => {
    const result = await executeTool('new_analysis_tool', ...);
    expect(result.status).toBe('success');
  });
});

// tests/e2e/new-analysis-e2e.spec.ts
test('user can run new analysis type', async ({ page }) => {
  // E2E test implementation
});
```

#### 8. Update Documentation

Update journey templates in `shared/journey-templates.ts` to include new analysis type.

---

**Related Documentation**:
- [← Back to Main](../CLAUDE.md)
- [Architecture Guide](ARCHITECTURE.md)
- [Agentic System Guide](AGENTIC_SYSTEM.md)
- [Billing & Admin Guide](BILLING_ADMIN.md)
