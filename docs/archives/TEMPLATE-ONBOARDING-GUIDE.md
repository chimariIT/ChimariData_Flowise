# Business Template Onboarding Guide

## Overview

The Business Template Onboarding System provides an **automated AI-powered workflow** for researching, generating, validating, and deploying new business analysis templates. This system enables business research agents to rapidly expand the template library based on emerging industry needs and best practices.

## Architecture

### Components

1. **Template Research Agent** (`server/services/template-research-agent.ts`)
   - AI-powered template generation from natural language descriptions
   - Industry-specific knowledge base with 7 industries and 35+ use cases
   - Automated workflow generation using analysis patterns
   - Market demand and complexity assessment

2. **Template Onboarding API** (`server/routes/template-onboarding.ts`)
   - RESTful endpoints for template research and validation
   - Template approval and registration workflow
   - Industry-specific suggestions and use case recommendations

3. **Template Onboarding UI** (`client/src/pages/template-onboarding.tsx`)
   - Interactive 3-step wizard for template creation
   - Real-time validation and quality assessment
   - Visual feedback on template impact and relevance

## Quick Start

### For Business Research Agents

#### Method 1: Natural Language Generation (Easiest)

1. **Navigate to Template Onboarding Page**
   - URL: `/template-onboarding`

2. **Describe the Use Case**
   ```
   Example: "I want to predict which employees are likely to leave
   based on their satisfaction scores, performance reviews, and
   tenure at the company."
   ```

3. **Review Generated Template**
   - The AI automatically:
     - Infers industry (HR in this example)
     - Maps to business goals (talent_management, reduce_costs)
     - Generates workflow steps
     - Identifies required data fields
     - Recommends visualizations

4. **Validate & Approve**
   - Click "Validate Template" to run quality checks
   - Review validation results and recommendations
   - Click "Approve & Register" to add to template library

**Total Time: 2-3 minutes per template**

#### Method 2: Programmatic API (For Batch Operations)

```typescript
// Generate template from description
const response = await fetch('/api/template-onboarding/generate-from-description', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    description: 'Customer lifetime value prediction using purchase history',
    industry: 'retail' // optional
  })
});

const { template, metadata } = await response.json();

// Validate template
const validation = await fetch('/api/template-onboarding/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ template, metadata })
});

const { onboarding } = await validation.json();

// Approve if validation passes
if (onboarding.status === 'approved') {
  await fetch('/api/template-onboarding/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template })
  });
}
```

## API Reference

### POST /api/template-onboarding/generate-from-description

Generate a complete template from natural language description.

**Request:**
```json
{
  "description": "Predict customer churn using behavior and demographics",
  "industry": "retail" // optional, will auto-detect if omitted
}
```

**Response:**
```json
{
  "success": true,
  "template": {
    "templateId": "retail_customer_churn_prediction",
    "name": "Customer Churn Prediction",
    "description": "Comprehensive analysis for customer churn prediction...",
    "domain": "retail",
    "goals": ["customer_retention", "reduce_costs"],
    "workflow": [...],
    "requiredDataFields": [...],
    "visualizations": [...],
    "deliverables": [...],
    "complexity": "intermediate",
    "tags": ["retail", "prediction", "customer"]
  },
  "metadata": {
    "confidence": 0.85,
    "marketDemand": "high",
    "implementationComplexity": "medium",
    "estimatedPopularity": 88,
    "researchSources": [...]
  }
}
```

### POST /api/template-onboarding/validate

Validate template quality and estimate impact.

**Request:**
```json
{
  "template": { /* template object */ },
  "metadata": { /* metadata from generation */ }
}
```

**Response:**
```json
{
  "success": true,
  "onboarding": {
    "templateId": "retail_customer_churn_prediction",
    "status": "approved", // or "review_needed", "draft", "rejected"
    "validationErrors": [],
    "recommendations": [
      "Add more visualizations for better insights"
    ],
    "estimatedImpact": {
      "potentialUsers": 1000,
      "industryRelevance": 92,
      "uniqueness": 75
    }
  }
}
```

### POST /api/template-onboarding/approve

Approve and register template in the library.

**Request:**
```json
{
  "template": { /* complete template object */ }
}
```

**Response:**
```json
{
  "success": true,
  "templateId": "retail_customer_churn_prediction",
  "message": "Template approved and registered successfully"
}
```

### GET /api/template-onboarding/suggestions

Get template suggestions for an industry.

**Query Parameters:**
- `industry` (optional): Filter by industry

**Response:**
```json
{
  "success": true,
  "suggestions": [
    {
      "useCase": "Customer Lifetime Value Prediction",
      "description": "Predict customer lifetime value...",
      "industry": "retail",
      "complexity": "intermediate",
      "estimatedDemand": "high"
    }
  ]
}
```

### GET /api/template-onboarding/common-use-cases/:industry

Get common use cases for a specific industry.

**Response:**
```json
{
  "success": true,
  "industry": "finance",
  "useCases": [
    "Loan default prediction",
    "Risk portfolio analysis",
    "Customer credit scoring",
    ...
  ]
}
```

## Template Validation Rules

The validation system checks:

### Required Fields
- ✅ `templateId` - Unique identifier
- ✅ `name` - Human-readable name
- ✅ `description` - Clear description of purpose
- ✅ `domain` - Industry classification
- ✅ `goals` - At least one business goal
- ✅ `workflow` - At least one workflow step
- ✅ `requiredDataFields` - At least one data field

### Quality Checks
- **Workflow Depth**: ≥3 steps recommended for comprehensive analysis
- **Data Field Richness**: ≥4 fields enable richer insights
- **Visualization Coverage**: ≥2 visualizations for better understanding
- **Confidence Threshold**: ≥70% for automatic approval

### Validation Statuses

| Status | Description | Next Action |
|--------|-------------|-------------|
| **approved** | Meets all requirements, high confidence | Automatically registered |
| **review_needed** | Meets requirements but needs human review | Manual approval required |
| **draft** | Basic requirements met, needs refinement | Edit and re-validate |
| **rejected** | Missing required fields or critical errors | Fix errors and resubmit |

## Industry Knowledge Base

The research agent has pre-loaded knowledge for:

### Supported Industries

1. **Retail** (8 use cases)
   - Customer lifetime value prediction
   - Inventory optimization
   - Price elasticity analysis
   - Store location analysis
   - Product recommendation engine
   - Seasonal demand forecasting
   - Customer churn prediction
   - Basket analysis

2. **Finance** (8 use cases)
   - Loan default prediction
   - Algorithmic trading strategy
   - Risk portfolio analysis
   - Customer credit scoring
   - Fraud pattern detection
   - Regulatory compliance monitoring
   - Market sentiment analysis
   - Cash flow forecasting

3. **Healthcare** (8 use cases)
   - Patient readmission prediction
   - Disease outbreak forecasting
   - Treatment effectiveness analysis
   - Resource allocation optimization
   - Medical imaging analysis
   - Clinical trial optimization
   - Patient risk stratification
   - Healthcare cost prediction

4. **HR** (8 use cases)
   - Talent acquisition optimization
   - Skills gap analysis
   - Employee engagement prediction
   - Succession planning
   - Training effectiveness analysis
   - Diversity and inclusion metrics
   - Remote work productivity analysis
   - Compensation benchmarking

5. **Manufacturing** (8 use cases)
   - Predictive maintenance
   - Quality control optimization
   - Supply chain optimization
   - Production yield forecasting
   - Equipment failure prediction
   - Energy consumption optimization
   - Defect detection
   - Demand-driven production planning

6. **Marketing** (8 use cases)
   - Campaign ROI optimization
   - Customer segmentation
   - Lead scoring
   - Content performance analysis
   - Attribution modeling
   - Social media sentiment analysis
   - Marketing mix modeling
   - Customer journey analysis

7. **Technology** (8 use cases)
   - User behavior analytics
   - System performance optimization
   - Security threat detection
   - Feature adoption analysis
   - API usage forecasting
   - Code quality analysis
   - Tech debt assessment
   - DevOps metrics analysis

### Analysis Patterns

The agent uses 3 pre-built analysis patterns:

1. **Predictive ML Pattern**
   - Data preparation with imputation and normalization
   - Feature engineering
   - Model training with cross-validation

2. **Time Series Pattern**
   - Historical trend analysis with decomposition
   - Forecasting with Prophet/ARIMA

3. **Clustering Pattern**
   - Data normalization with z-score
   - K-means or hierarchical clustering

## Best Practices

### Writing Effective Descriptions

**✅ Good Examples:**

```
"Predict which customers are likely to stop using our service
based on their usage patterns, support tickets, and payment history"
```

```
"Optimize our marketing spend across channels by analyzing
campaign performance, conversion rates, and customer acquisition costs"
```

```
"Forecast inventory needs for the next 6 months using historical
sales data, seasonal trends, and promotional calendars"
```

**❌ Poor Examples:**

```
"Customer analysis" (too vague)
```

```
"Make predictions" (no context about what to predict)
```

```
"Dashboard" (not analysis-focused)
```

### Tips for High-Quality Templates

1. **Be Specific**: Include what you're predicting, analyzing, or optimizing
2. **Mention Data Sources**: Reference the types of data you'll use
3. **State Business Goal**: Explain why this analysis matters
4. **Include Time Frame**: Specify if it's historical, real-time, or forecasting
5. **Note Complexity**: Use words like "simple", "comprehensive", or "advanced" to guide complexity inference

## Extending the System

### Adding New Industries

Edit `server/services/template-research-agent.ts`:

```typescript
this.commonUseCases.set('education', [
    'Student performance prediction',
    'Course recommendation engine',
    'Dropout risk analysis',
    // ... more use cases
]);
```

### Adding New Analysis Patterns

```typescript
this.analysisPatterns.set('nlp_analysis', [
    {
        stepId: 'text_preprocessing',
        name: 'Text Preprocessing',
        component: 'transformation',
        config: { textCleaning: true },
        checkpointQuestions: ['Review text cleaning approach']
    },
    // ... more steps
]);
```

### Customizing Validation Rules

Edit the `onboardTemplate` method in `template-research-agent.ts`:

```typescript
// Add custom validation
if (template.workflow && template.workflow.length < 5) {
    validationErrors.push('Complex analyses require at least 5 workflow steps');
}

// Add custom quality checks
if (template.domain === 'healthcare' && !template.tags.includes('hipaa')) {
    recommendations.push('Consider adding HIPAA compliance checks');
}
```

## Workflow Examples

### Example 1: Retail Churn Prediction

**Input:**
```json
{
  "description": "Predict customer churn using purchase history and engagement metrics",
  "industry": "retail"
}
```

**Generated Template Highlights:**
- **Template ID**: `retail_customer_churn_using_purchase_history_and_engagement_metrics`
- **Goals**: `customer_retention`, `reduce_costs`
- **Workflow**: 3 steps (data prep, feature engineering, model training)
- **Data Fields**: customer_id, timestamp, purchase_amount, engagement_score
- **Visualizations**: Churn distribution, feature importance, predicted vs actual
- **Confidence**: 85%
- **Estimated Popularity**: 90

### Example 2: Financial Fraud Detection

**Input:**
```json
{
  "description": "Detect fraudulent transactions in real-time using transaction patterns and user behavior",
  "industry": "finance"
}
```

**Generated Template Highlights:**
- **Template ID**: `finance_detect_fraudulent_transactions_in_real_time_using_transaction_patterns_and_user_behavior`
- **Goals**: `fraud_detection`, `risk_management`
- **Workflow**: 3 steps (transaction profiling, anomaly detection, real-time scoring)
- **Data Fields**: transaction_id, amount, timestamp, user_behavior_score
- **Visualizations**: Anomaly scores, fraud distribution, pattern analysis
- **Confidence**: 90%
- **Estimated Popularity**: 95

## Monitoring & Analytics

Track template onboarding success:

```sql
-- Templates created per day
SELECT DATE(created_at), COUNT(*)
FROM business_templates
GROUP BY DATE(created_at);

-- Validation status distribution
SELECT status, COUNT(*)
FROM template_validations
GROUP BY status;

-- Most popular industries
SELECT domain, AVG(popularity)
FROM business_templates
GROUP BY domain
ORDER BY AVG(popularity) DESC;
```

## Troubleshooting

### Template Not Generating

**Issue**: API returns 500 error
**Solution**: Check server logs for specific error. Common causes:
- Missing required dependencies
- Invalid industry value
- Empty description

### Low Confidence Score

**Issue**: Confidence < 70%
**Solution**: Improve description with:
- More specific use case details
- Clearer business goals
- Mention of data types
- Complexity indicators

### Validation Fails

**Issue**: Status is "rejected"
**Solution**: Review `validationErrors` array and fix:
- Missing required fields
- Invalid workflow configuration
- Incomplete data field definitions

## Future Enhancements

Planned features:

1. **Template Versioning**: Track template evolution over time
2. **A/B Testing**: Compare template performance
3. **User Feedback Loop**: Collect usage data to improve generation
4. **Batch Import**: Upload CSV of use cases for bulk generation
5. **Template Marketplace**: Share and discover community templates
6. **Analytics Dashboard**: Visualize template usage and impact

## Support

For questions or issues:
- **Documentation**: `/docs/template-onboarding`
- **API Reference**: `/api-docs#template-onboarding`
- **Examples**: `/examples/template-onboarding`
