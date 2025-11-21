# Presentation Templates

This directory contains default Chimari presentation templates for different audience types.

## Template Types

### 1. executive.pptx
**Audience**: Non-technical stakeholders (executives, board members)
**Content Focus**: High-level insights, key metrics, plain-language summaries
**Slides**: Cover, executive summary, top 3 visualizations, recommendations, next steps
**Style**: Clean, minimal text, large visuals

### 2. business.pptx
**Audience**: Business users (managers, analysts, product teams)
**Content Focus**: KPI dashboards, business context, actionable recommendations
**Slides**: Cover, business context, KPI metrics, all visualizations, recommendations, appendix
**Style**: Professional, data-driven, business-focused

### 3. technical.pptx
**Audience**: Technical stakeholders (data scientists, engineers, architects)
**Content Focus**: Methodology, model diagnostics, feature importance, technical details
**Slides**: Cover, methodology, data overview, all visualizations, model performance, feature importance, technical appendix
**Style**: Detailed, technical depth, code snippets allowed

### 4. consultation.pptx
**Audience**: Consultation clients (mixed technical/business)
**Content Focus**: Customizable mix of business and technical content
**Slides**: Cover, project overview, methodology (optional), visualizations, insights, recommendations, technical details (optional)
**Style**: Flexible, professional, branded

## Required Placeholders

All templates should include these placeholders for dynamic content injection:

- `{ProjectName}` - Project title
- `{GeneratedDate}` - Generation timestamp
- `{CompanyName}` - Client company name (optional)
- `{ExecutiveSummary}` - High-level summary text
- `{KeyInsights}` - Bullet points of insights
- `{Recommendations}` - Action items
- `{ChartPlaceholder1}` - First visualization
- `{ChartPlaceholder2}` - Second visualization
- `{ChartPlaceholder3}` - Third visualization
- `{KPIDashboard}` - KPI metrics section
- `{Methodology}` - Technical methodology
- `{ModelDiagnostics}` - Model performance metrics
- `{FeatureImportance}` - Feature importance chart

## Branding

Templates support custom branding via:
- Logo replacement (top-right corner)
- Primary color theme
- Secondary color for accents
- Company fonts (if available)

## Creating Templates

Templates can be created in Microsoft PowerPoint:

1. Design slides with desired layout
2. Add placeholder text using curly braces: `{PlaceholderName}`
3. Save as `.pptx` format
4. Place in this directory with appropriate name
5. Test with presentation generator service

## User Templates

Users can upload custom templates to `uploads/templates/presentations/{userId}/` for personalized branding.
