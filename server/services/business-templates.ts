export type BusinessTemplate = {
  id: string;
  name: string;
  industry?: string;
  useCases: string[];
  kpis: string[];
  deliverables: Array<'executive_summary' | 'business_report' | 'presentation_deck' | 'dashboard' | 'roi_analysis'>;
  sections: Array<{ key: string; title: string; description: string }>;
  chartDefaults?: Array<{ type: string; title: string; fields?: string[] }>;
};

const templates: BusinessTemplate[] = [
  {
    id: 'biz_generic_growth',
    name: 'Generic Growth & Retention',
    useCases: ['growth', 'retention', 'churn'],
    kpis: ['Conversion Rate', 'CAC', 'LTV', 'Churn Rate', 'ARPU'],
    deliverables: ['executive_summary', 'business_report', 'presentation_deck', 'dashboard'],
    sections: [
      { key: 'exec', title: 'Executive Summary', description: 'Top-line insights and actions.' },
      { key: 'kpis', title: 'KPIs & Benchmarks', description: 'Current performance vs. targets.' },
      { key: 'drivers', title: 'Drivers & Correlations', description: 'What’s driving outcomes.' },
      { key: 'recommend', title: 'Recommendations', description: 'Prioritized action plan.' }
    ],
    chartDefaults: [
      { type: 'line_chart', title: 'KPI Trends Over Time' },
      { type: 'bar_chart', title: 'Channel Performance' },
      { type: 'heatmap', title: 'Feature Correlation Matrix' }
    ]
  },
  {
    id: 'biz_ecommerce',
    name: 'E-commerce Funnel Optimization',
    industry: 'retail',
    useCases: ['funnel', 'conversion', 'ab_test'],
    kpis: ['Add-to-Cart Rate', 'Checkout Rate', 'Conversion Rate', 'Average Order Value'],
    deliverables: ['executive_summary', 'business_report', 'presentation_deck', 'roi_analysis'],
    sections: [
      { key: 'funnel', title: 'Funnel Analysis', description: 'Drop-offs and uplift opportunities.' },
      { key: 'cohorts', title: 'Cohort Analysis', description: 'Retention by acquisition cohorts.' },
      { key: 'ab', title: 'A/B Test Results', description: 'Experiments and impacts.' }
    ]
  }
];

export const BusinessTemplates = {
  list(): BusinessTemplate[] {
    return templates;
  },
  get(id: string): BusinessTemplate | undefined {
    return templates.find(t => t.id === id);
  },
  matchByUseCase(useCase: string): BusinessTemplate | undefined {
    return templates.find(t => t.useCases.includes(useCase));
  }
};
