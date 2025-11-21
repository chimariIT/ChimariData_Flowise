import { nanoid } from "nanoid";

export interface TemplateSeed {
  id?: string;
  name: string;
  type: string;
  description: string;
  requiredColumns: string[];
  expectedOutcomes: string[];
  businessValue: string;
}

export interface IndustrySeed {
  id?: string;
  industry: string;
  summary: string;
  commonUseCases: string[];
  keyMetrics: string[];
  regulatoryConsiderations: string[];
  templates: TemplateSeed[];
  regulationReferences?: string[];
}

export interface RegulationSeed {
  id?: string;
  name: string;
  description: string;
  requirements: string[];
  applicableIndustries: string[];
}

function withId<T extends { id?: string }>(items: T[]): (T & { id: string })[] {
  return items.map((item) => ({ ...item, id: item.id ?? nanoid() })) as (T & { id: string })[];
}

export const regulationSeeds: (RegulationSeed & { id: string })[] = [
  {
    id: nanoid(),
    name: "GDPR",
    description: "General Data Protection Regulation for EU data privacy",
    requirements: [
      "Explicit consent for data processing",
      "Right to data portability",
      "Right to be forgotten",
      "Data protection by design",
      "Privacy impact assessments",
    ],
    applicableIndustries: ["All industries operating in EU"],
  },
  {
    id: nanoid(),
    name: "HIPAA",
    description: "Health Insurance Portability and Accountability Act",
    requirements: [
      "PHI protection",
      "Access controls",
      "Audit trails",
      "Data encryption",
      "Business associate agreements",
    ],
    applicableIndustries: ["Healthcare", "Health Insurance"],
  },
  {
    id: nanoid(),
    name: "SOX",
    description: "Sarbanes-Oxley Act for financial reporting",
    requirements: [
      "Internal controls documentation",
      "Management certification",
      "Independent auditing",
      "Data retention policies",
    ],
    applicableIndustries: ["Public Companies", "Finance"],
  },
  {
    id: nanoid(),
    name: "Basel III",
    description: "International regulatory framework for banks",
    requirements: [
      "Capital adequacy ratios",
      "Liquidity coverage ratio",
      "Net stable funding ratio",
      "Leverage ratio limits",
      "Stress testing",
    ],
    applicableIndustries: ["Banking", "Financial Services"],
  },
];

export const industrySeeds: (IndustrySeed & { id: string; templates: (TemplateSeed & { id: string })[] })[] = [
  {
    id: nanoid(),
    industry: "Healthcare",
    summary: "Knowledge assets supporting healthcare analytics journeys.",
    commonUseCases: [
      "Patient outcome prediction",
      "Readmission risk analysis",
      "Drug effectiveness studies",
      "Resource optimization",
      "Clinical trial analysis",
    ],
    keyMetrics: [
      "Patient satisfaction scores",
      "Readmission rates",
      "Length of stay",
      "Mortality rates",
      "Cost per patient",
      "Treatment effectiveness",
    ],
    regulatoryConsiderations: [
      "HIPAA compliance",
      "FDA regulations",
      "PHI protection",
      "Clinical trial protocols",
    ],
    regulationReferences: ["HIPAA", "GDPR"],
    templates: withId<TemplateSeed>([
      {
        name: "Patient Risk Stratification",
        type: "machine_learning",
        description: "Identify high-risk patients using demographic and clinical data",
        requiredColumns: ["age", "diagnosis", "vitals", "medical_history"],
        expectedOutcomes: ["Risk scores", "Intervention recommendations", "Cost projections"],
        businessValue: "Reduce readmissions by 15-25% and improve patient outcomes",
      },
      {
        name: "Treatment Effectiveness Analysis",
        type: "statistical",
        description: "Compare treatment outcomes across patient cohorts",
        requiredColumns: ["treatment_type", "outcomes", "demographics", "comorbidities"],
        expectedOutcomes: ["Efficacy comparisons", "Side effect profiles", "Cost-effectiveness"],
        businessValue: "Optimize treatment protocols and reduce costs",
      },
    ]),
  },
  {
    id: nanoid(),
    industry: "Finance",
    summary: "Knowledge assets for financial services analytics and compliance.",
    commonUseCases: [
      "Credit risk assessment",
      "Fraud detection",
      "Algorithmic trading",
      "Portfolio optimization",
      "Regulatory compliance",
    ],
    keyMetrics: [
      "Return on investment",
      "Risk-adjusted returns",
      "Default rates",
      "Sharpe ratio",
      "Value at Risk",
      "Fraud detection rate",
    ],
    regulatoryConsiderations: [
      "Basel III compliance",
      "GDPR for EU customers",
      "Fair Credit Reporting Act",
      "Anti-money laundering",
      "Model risk management",
    ],
    regulationReferences: ["Basel III", "SOX", "GDPR"],
    templates: withId<TemplateSeed>([
      {
        name: "Credit Scoring Model",
        type: "machine_learning",
        description: "Predict default probability using customer financial data",
        requiredColumns: ["credit_history", "income", "debt_ratio", "employment"],
        expectedOutcomes: ["Credit scores", "Default probabilities", "Risk tiers"],
        businessValue: "Improve approval rates while reducing default risk by 20%",
      },
      {
        name: "Portfolio Risk Analysis",
        type: "statistical",
        description: "Analyze portfolio risk and performance metrics",
        requiredColumns: ["asset_returns", "volatility", "correlations", "exposures"],
        expectedOutcomes: ["Risk metrics", "Optimal allocations", "Stress test results"],
        businessValue: "Optimize risk-return profile and regulatory compliance",
      },
    ]),
  },
  {
    id: nanoid(),
    industry: "Retail",
    summary: "Knowledge assets for retail growth and customer intelligence.",
    commonUseCases: [
      "Customer segmentation",
      "Demand forecasting",
      "Price optimization",
      "Inventory management",
      "Churn prediction",
    ],
    keyMetrics: [
      "Customer lifetime value",
      "Conversion rates",
      "Average order value",
      "Inventory turnover",
      "Gross margin",
      "Customer acquisition cost",
    ],
    regulatoryConsiderations: [
      "Consumer privacy laws",
      "Price discrimination regulations",
      "Product safety standards",
      "Advertising standards",
    ],
    regulationReferences: ["GDPR"],
    templates: withId<TemplateSeed>([
      {
        name: "Customer Segmentation",
        type: "machine_learning",
        description: "Segment customers based on behavior and demographics",
        requiredColumns: ["purchase_history", "demographics", "engagement", "preferences"],
        expectedOutcomes: ["Customer segments", "Persona profiles", "Targeting strategies"],
        businessValue: "Increase marketing ROI by 30% through targeted campaigns",
      },
      {
        name: "Demand Forecasting",
        type: "time_series",
        description: "Predict future product demand using historical data",
        requiredColumns: ["sales_history", "seasonality", "promotions", "external_factors"],
        expectedOutcomes: ["Demand forecasts", "Inventory recommendations", "Revenue projections"],
        businessValue: "Reduce stockouts by 25% and optimize inventory costs",
      },
    ]),
  },
  {
    id: nanoid(),
    industry: "Manufacturing",
    summary: "Knowledge assets supporting manufacturing optimization.",
    commonUseCases: [
      "Predictive maintenance",
      "Quality control",
      "Supply chain optimization",
      "Production planning",
      "Energy efficiency",
    ],
    keyMetrics: [
      "Overall equipment effectiveness",
      "Defect rates",
      "Throughput",
      "Downtime",
      "Energy consumption",
      "Labor productivity",
    ],
    regulatoryConsiderations: [
      "ISO quality standards",
      "Environmental regulations",
      "Safety compliance",
      "Product liability",
    ],
    regulationReferences: ["GDPR"],
    templates: withId<TemplateSeed>([
      {
        name: "Predictive Maintenance",
        type: "machine_learning",
        description: "Predict equipment failures before they occur",
        requiredColumns: ["sensor_data", "maintenance_history", "operating_conditions", "failure_modes"],
        expectedOutcomes: ["Failure predictions", "Maintenance schedules", "Cost savings"],
        businessValue: "Reduce unplanned downtime by 40% and maintenance costs by 25%",
      },
      {
        name: "Quality Control Analysis",
        type: "statistical",
        description: "Monitor and improve product quality using process data",
        requiredColumns: ["process_parameters", "quality_measurements", "batch_info", "environmental_conditions"],
        expectedOutcomes: ["Quality trends", "Process improvements", "Defect reduction"],
        businessValue: "Improve product quality and reduce defect rates by 30%",
      },
    ]),
  },
];
