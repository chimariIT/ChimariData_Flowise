# Template Collection & Management Guide

**Last Updated**: November 19, 2025

This guide explains how to continuously add new analysis templates and patterns to the ChimariData platform.

---

## 📊 Current Template Inventory

**Total Templates**: 29 (across 5 industries)

| Industry | Count | Examples |
|----------|-------|----------|
| Finance | 7 | Customer Segmentation, Fraud Detection, Credit Risk, Portfolio Optimization, Forecasting, AML, Risk Monitoring |
| HR | 7 | Attrition Prediction, Compensation Equity, Survey Analysis, Engagement, Workforce Planning, Recruitment, Performance |
| Marketing | 7 | Customer Lifetime Value, Campaign Performance, Churn Prediction, Market Basket, Marketing Mix, Content Performance, Sentiment Analysis |
| Sales | 7 | Sales Forecasting, Lead Scoring, Territory Optimization, Pipeline Health, Win/Loss, Performance Benchmarking, Quota Planning |
| Retail | 1 | Retail Growth Playbook |

**All templates have corresponding analysis patterns and are fully linked.**

---

## 🎯 Adding New Templates

### Option 1: Interactive CLI Tool

**Quickest way to add a new template:**

```bash
npx tsx server/scripts/add-new-template.ts
```

The tool will interactively collect:
- Template name and ID
- Title and summary
- Industry classification
- Target persona
- Primary agent assignment
- Expected artifacts
- Auto-generates default workflow steps
- Creates analysis pattern automatically
- Links template to pattern

**Example Session:**
```
Template Name: Customer Acquisition Cost Analysis
  Generated ID: customer_acquisition_cost_analysis

Title [Customer Acquisition Cost Analysis]:
Summary: Analyze and optimize customer acquisition costs across marketing channels
Industry: marketing
Target Persona: growth analyst
Primary Agent [business_agent]: data_scientist
Artifacts: dashboard,cost_model,channel_analysis,optimization_recommendations
```

### Option 2: Bulk Template Seeding

For adding multiple templates at once, update `server/scripts/seed-templates.ts`:

1. **Add to the appropriate industry section**:

```typescript
const templates = {
  // ... existing industries

  operations: [  // New industry
    {
      id: 'supply_chain_optimization',
      name: 'Supply Chain Optimization',
      title: 'Supply Chain Network Optimization',
      summary: 'Optimize supply chain network for cost and efficiency',
      industry: 'operations',
      persona: 'operations manager',
      primaryAgent: 'data_scientist',
      expectedArtifacts: ['optimization_model', 'network_map', 'cost_analysis', 'dashboard']
    },
    // Add more templates...
  ]
};
```

2. **Run the seeding script**:

```bash
npx tsx server/scripts/seed-templates.ts
```

The script is idempotent - it will skip existing templates.

3. **Link templates to patterns**:

```bash
npx tsx server/scripts/link-all-templates-to-patterns.ts
```

This automatically creates patterns and links them.

---

## 🔍 Template Discovery Sources

### Industry-Specific Resources

**Finance:**
- Financial regulatory reports (SEC, FDIC)
- Industry journals (Journal of Finance, Financial Analysts Journal)
- Consulting firm reports (McKinsey, BCG, Deloitte)
- Academic research papers

**HR:**
- SHRM (Society for Human Resource Management) resources
- Workforce analytics vendors (Workday, ADP, Oracle HCM)
- People analytics conferences
- HR tech blogs and case studies

**Marketing:**
- Marketing analytics platforms (Google Analytics, Adobe, HubSpot)
- Industry conferences (MarTech, Marketing Analytics Summit)
- Marketing journals and publications
- Case studies from leading brands

**Sales:**
- Sales enablement platforms (Salesforce, Gong, Clari)
- Sales operations communities
- B2B/B2B research firms (Forrester, Gartner)
- Sales methodology frameworks (MEDDIC, Challenger, etc.)

**Operations:**
- Supply chain management journals
- Operations research publications
- Industry-specific standards bodies
- Manufacturing and logistics case studies

**Customer Service:**
- Customer experience platforms (Zendesk, Intercom, Freshdesk)
- CX conferences and research
- Service quality frameworks (SERVQUAL, NPS)

**Product:**
- Product management frameworks (AARRR, Jobs-to-be-Done)
- Product analytics platforms (Amplitude, Mixpanel)
- Product conferences (Mind the Product, ProductCon)

### Template Discovery Process

1. **Industry Research**:
   - Monitor industry publications and blogs
   - Track common analysis requests from customers
   - Review competitor offerings
   - Attend industry conferences (virtually or in-person)

2. **Customer Feedback**:
   - Track frequently requested analysis types
   - Monitor support tickets for "I wish you had..." requests
   - Conduct user interviews and surveys
   - Analyze custom journey creations

3. **Academic & Research Papers**:
   - Google Scholar alerts for analysis methodologies
   - ArXiv for data science and ML papers
   - Industry-specific research journals
   - Conference proceedings

4. **Competitive Analysis**:
   - Review templates from Tableau, Power BI, Looker
   - Check data analytics consultancies
   - Monitor startup offerings in analytics space

---

## 📝 Template Quality Standards

Every new template must include:

### Required Fields:
- ✅ **Unique ID**: Lowercase with underscores (e.g., `price_elasticity_analysis`)
- ✅ **Name**: Human-readable (e.g., "Price Elasticity Analysis")
- ✅ **Title**: Full descriptive title
- ✅ **Summary**: One-line description of what the template does
- ✅ **Industry**: Primary industry classification
- ✅ **Persona**: Target user role
- ✅ **Primary Agent**: Which agent leads this analysis
- ✅ **Expected Artifacts**: List of outputs user will receive
- ✅ **Steps**: Complete workflow with 7 standard steps

### Quality Checklist:
- [ ] Summary is clear and jargon-free
- [ ] Industry classification is accurate
- [ ] Persona matches typical users in that industry
- [ ] Artifacts are concrete and valuable
- [ ] Steps follow standard template structure
- [ ] Primary agent assignment makes sense
- [ ] Template doesn't duplicate existing templates
- [ ] Analysis pattern is linked

---

## 🔧 Template Management Scripts

### View All Templates

```bash
npx tsx server/scripts/list-templates.ts
```

### Add New Template (Interactive)

```bash
npx tsx server/scripts/add-new-template.ts
```

### Bulk Seed Templates

```bash
npx tsx server/scripts/seed-templates.ts
```

### Link Templates to Patterns

```bash
npx tsx server/scripts/link-all-templates-to-patterns.ts
```

### Query Templates by Industry

```sql
SELECT name, industry, persona
FROM artifact_templates
WHERE industry = 'marketing'
AND is_active = true
ORDER BY name;
```

---

## 🚀 Expansion Roadmap

### Phase 1: Core Industries (✅ Complete)
- Finance (7 templates)
- HR (7 templates)
- Marketing (7 templates)
- Sales (7 templates)
- Retail (1 template)

### Phase 2: Expand Existing Industries
Target: 10+ templates per industry

**Finance** (Add 3):
- Algorithmic Trading Strategy
- Interest Rate Risk Analysis
- Cryptocurrency Portfolio Analysis

**HR** (Add 3):
- Diversity & Inclusion Analytics
- Learning & Development ROI
- Succession Planning Analysis

**Marketing** (Add 3):
- Attribution Modeling
- Brand Health Tracking
- Influencer ROI Analysis

**Sales** (Add 3):
- Sales Team Productivity Analysis
- Discount Optimization
- Customer Segmentation for Sales

**Retail** (Add 6):
- Inventory Optimization
- Store Performance Analysis
- Customer Traffic Analytics
- Promotion Effectiveness
- Assortment Planning
- Price Optimization

### Phase 3: New Industries (Target: 7 templates each)

**Operations:**
1. Supply Chain Optimization
2. Process Mining & Optimization
3. Quality Control Analytics
4. Predictive Maintenance
5. Demand Forecasting
6. Warehouse Optimization
7. Logistics Route Optimization

**Customer Service:**
1. Call Volume Forecasting
2. Agent Performance Analytics
3. Customer Satisfaction Analysis
4. First Call Resolution Optimization
5. Service Level Agreement Tracking
6. Sentiment Analysis of Support Tickets
7. Knowledge Base Effectiveness

**Product:**
1. Product Usage Analytics
2. Feature Adoption Analysis
3. A/B Test Analysis
4. User Retention & Churn
5. Product-Market Fit Assessment
6. NPS & Customer Feedback Analysis
7. Roadmap Prioritization

**Healthcare:**
1. Patient Readmission Prediction
2. Treatment Effectiveness Analysis
3. Resource Utilization Optimization
4. Clinical Trial Analysis
5. Population Health Analytics
6. Diagnostic Pattern Recognition
7. Healthcare Cost Analysis

**Manufacturing:**
1. Production Optimization
2. Defect Detection & Analysis
3. Equipment Downtime Analysis
4. Capacity Planning
5. Energy Consumption Optimization
6. Supplier Quality Analysis
7. Lean Manufacturing Metrics

---

## 📊 Pattern Creation Guidelines

When adding a new template, the system automatically creates a corresponding analysis pattern. The pattern derives:

- **Pattern ID**: Same as template ID
- **Name**: Same as template name
- **Goal**: Extracted from template summary
- **Industry**: Same as template industry
- **Description**: Template summary
- **Status**: Automatically set to 'ready'
- **Confidence**: Default 85%

### Manual Pattern Enhancement

For complex templates, you may want to manually enhance the pattern with:

- **Tool Sequence**: Specific tools to use in order
- **Required Signals**: Data columns or features needed
- **Fallback Narratives**: Alternative explanations if data is insufficient
- **Applicable Journeys**: Which journey types this pattern supports

Use `AnalysisPatternRegistry.recordPattern()` to update:

```typescript
await AnalysisPatternRegistry.recordPattern({
  id: 'price_elasticity_analysis',
  name: 'Price Elasticity Analysis',
  goal: 'Measure price sensitivity',
  industry: 'retail',
  description: 'Comprehensive price elasticity analysis',
  toolSequence: [
    'statistical_analyzer',  // Run regression
    'visualization_engine',  // Create demand curves
    'business_templates'     // Format for executives
  ],
  requiredSignals: ['price', 'quantity', 'date'],
  fallbackNarratives: ['If insufficient price variation, recommend A/B testing'],
  status: 'ready',
  confidence: 90
});
```

---

## 🎓 Best Practices

1. **Consistent Naming**:
   - Use descriptive, searchable names
   - Avoid abbreviations unless industry-standard
   - Include the analysis type in the name

2. **Industry Classification**:
   - Primary industry should be most specific applicable
   - Cross-industry templates use 'general'
   - Tag metadata can include secondary industries

3. **Persona Targeting**:
   - Be specific about user role
   - Match language complexity to persona
   - Consider technical vs. business personas

4. **Artifact Selection**:
   - Balance comprehensive vs. overwhelming
   - Include at least one visual artifact
   - Provide exportable formats (PDF, API, PowerPoint)

5. **Agent Assignment**:
   - Data Scientist: For predictive/ML-heavy analysis
   - Business Agent: For descriptive/reporting analysis
   - Data Engineer: For data quality/transformation focus
   - Project Manager: For workflow coordination

---

## 📈 Monitoring Template Usage

Track which templates are most popular to guide future additions:

```sql
-- Template usage frequency
SELECT
  t.name,
  t.industry,
  COUNT(p.id) as project_count
FROM artifact_templates t
LEFT JOIN projects p ON p.template_id = t.id
WHERE t.is_system = true
AND t.created_at > now() - interval '90 days'
GROUP BY t.id, t.name, t.industry
ORDER BY project_count DESC
LIMIT 20;
```

---

## 🤝 Contributing Templates

Internal team members can contribute templates by:

1. Using the interactive CLI tool for individual templates
2. Submitting template definitions to `server/scripts/seed-templates.ts`
3. Creating a pull request with templates added
4. Documenting new industry categories in this guide

External contributions welcome via GitHub issues with template suggestions!

---

**Related Files**:
- `server/scripts/add-new-template.ts` - Interactive template creator
- `server/scripts/seed-templates.ts` - Bulk template seeding
- `server/scripts/link-all-templates-to-patterns.ts` - Pattern linking
- `migrations/011_create_artifact_templates.sql` - Database schema
- `server/services/analysis-pattern-registry.ts` - Pattern management

---

**Last Maintenance**: November 19, 2025
**Next Review**: December 2025 (Add 10+ new templates across operations, customer service, product)
