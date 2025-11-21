# Content Library

This directory contains reusable presentation slides that can be merged into any presentation.

## Available Content Modules

### ChartSlides.pptx
Reusable visualization slides including:
- Bar chart layouts (single series, grouped, stacked)
- Line chart layouts (trend analysis, multi-series)
- Scatter plot layouts (correlation analysis)
- Pie/donut chart layouts (distribution analysis)
- Heatmap layouts (correlation matrices)
- Box plot layouts (statistical distributions)

### DataTables.pptx
Reusable data table slides including:
- Summary statistics tables
- Model performance comparison tables
- Feature importance tables
- KPI metric tables
- Regression coefficients tables

## Usage Pattern

Content library slides are merged into presentations using pptx-automizer:

```typescript
const automizer = new Automizer({
  templateDir: 'templates/presentations',
  outputDir: 'uploads/artifacts/presentations'
});

const pres = automizer
  .loadRoot('business.pptx')              // Load main template
  .load('content-library/ChartSlides.pptx', 'charts')  // Load chart library
  .load('content-library/DataTables.pptx', 'tables');  // Load table library

// Add specific slides from library
pres.addSlide('charts', 1);  // Add first chart slide
pres.addSlide('tables', 2);  // Add second table slide
```

## Creating Content Modules

1. Create new `.pptx` file with multiple slides
2. Each slide should be self-contained with placeholders
3. Use consistent naming for placeholders across modules
4. Save in this directory
5. Update this README with module description
