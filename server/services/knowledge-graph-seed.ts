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
  {
    id: nanoid(),
    industry: "Education",
    summary: "Knowledge assets supporting education and school district analytics.",
    commonUseCases: [
      "Student performance analysis",
      "Program effectiveness evaluation",
      "Parent and stakeholder satisfaction surveys",
      "Attendance and engagement tracking",
      "Resource allocation optimization",
    ],
    keyMetrics: [
      "Student Performance Index",
      "Attendance Rate",
      "Parent Satisfaction Score",
      "Program Effectiveness Rating",
      "Graduation Rate",
      "Resource Utilization Rate",
    ],
    regulatoryConsiderations: [
      "FERPA compliance",
      "Student data privacy",
      "Title I reporting requirements",
      "Special education regulations",
    ],
    regulationReferences: ["GDPR"],
    templates: withId<TemplateSeed>([
      {
        name: "Student Performance Analysis",
        type: "statistical",
        description: "Analyze student outcomes across demographics, programs, and grade levels",
        requiredColumns: ["student_id", "grade_level", "assessment_scores", "demographics", "program_enrollment"],
        expectedOutcomes: ["Achievement gap analysis", "Program impact assessment", "Demographic breakdowns"],
        businessValue: "Identify high-impact interventions and close achievement gaps by 15-20%",
      },
      {
        name: "Stakeholder Survey Analysis",
        type: "statistical",
        description: "Analyze parent, teacher, and community satisfaction survey responses",
        requiredColumns: ["respondent_type", "satisfaction_ratings", "open_responses", "demographics"],
        expectedOutcomes: ["Satisfaction trends", "Priority areas", "Demographic comparisons"],
        businessValue: "Improve community engagement and target resources to highest-priority needs",
      },
    ]),
  },
  {
    id: nanoid(),
    industry: "Nonprofit",
    summary: "Knowledge assets supporting nonprofit and community organization analytics.",
    commonUseCases: [
      "Program impact measurement",
      "Donor retention analysis",
      "Stakeholder satisfaction surveys",
      "Community engagement tracking",
      "Grant reporting",
    ],
    keyMetrics: [
      "Program Participation Rate",
      "Stakeholder Satisfaction Score",
      "Donor Retention Rate",
      "Program Impact Score",
      "Community Engagement Index",
      "Cost Per Outcome",
    ],
    regulatoryConsiderations: [
      "Grant reporting requirements",
      "Donor privacy",
      "Tax-exempt compliance",
      "Program evaluation standards",
    ],
    regulationReferences: ["GDPR"],
    templates: withId<TemplateSeed>([
      {
        name: "Program Impact Assessment",
        type: "statistical",
        description: "Measure program effectiveness through participant outcomes and satisfaction",
        requiredColumns: ["participant_id", "program_type", "outcome_measures", "satisfaction_scores"],
        expectedOutcomes: ["Impact metrics", "Program comparisons", "Outcome trends"],
        businessValue: "Demonstrate program value to funders and identify areas for improvement",
      },
      {
        name: "Donor Analytics",
        type: "statistical",
        description: "Analyze donor behavior, retention patterns, and giving trends",
        requiredColumns: ["donor_id", "donation_amount", "donation_date", "donor_demographics"],
        expectedOutcomes: ["Retention analysis", "Giving patterns", "Donor segmentation"],
        businessValue: "Increase donor retention by 20% and optimize fundraising strategies",
      },
    ]),
  },
  {
    id: nanoid(),
    industry: "Survey",
    summary: "Knowledge assets supporting survey research and questionnaire analytics.",
    commonUseCases: [
      "Response distribution analysis",
      "Cross-tabulation and segmentation",
      "Satisfaction and sentiment measurement",
      "Priority and preference ranking",
      "Demographic comparison analysis",
    ],
    keyMetrics: [
      "Response Rate",
      "Net Promoter Score",
      "Satisfaction Index",
      "Engagement Score",
      "Priority Ranking",
      "Agreement Rate",
    ],
    regulatoryConsiderations: [
      "Respondent anonymity",
      "Data privacy compliance",
      "Statistical validity requirements",
      "Response bias mitigation",
    ],
    regulationReferences: ["GDPR"],
    templates: withId<TemplateSeed>([
      {
        name: "Survey Response Analysis",
        type: "statistical",
        description: "Comprehensive analysis of survey responses including distributions, comparisons, and trends",
        requiredColumns: ["response_id", "question_responses", "respondent_demographics"],
        expectedOutcomes: ["Response distributions", "Demographic comparisons", "Key themes", "Priority rankings"],
        businessValue: "Transform raw survey data into actionable insights for decision-making",
      },
      {
        name: "Satisfaction Benchmarking",
        type: "statistical",
        description: "Compare satisfaction scores across groups, time periods, and benchmarks",
        requiredColumns: ["satisfaction_scores", "group_variable", "time_period"],
        expectedOutcomes: ["Satisfaction trends", "Group comparisons", "Benchmark analysis"],
        businessValue: "Identify satisfaction drivers and track improvement initiatives over time",
      },
    ]),
  },
  {
    id: nanoid(),
    industry: "Marketing",
    summary: "Knowledge assets supporting marketing analytics and campaign optimization.",
    commonUseCases: [
      "Campaign performance analysis",
      "Customer segmentation",
      "Attribution modeling",
      "A/B testing analysis",
      "Customer journey optimization",
    ],
    keyMetrics: [
      "Conversion Rate",
      "Customer Acquisition Cost",
      "Return on Ad Spend",
      "Click-Through Rate",
      "Customer Lifetime Value",
      "Campaign ROI",
    ],
    regulatoryConsiderations: [
      "CAN-SPAM compliance",
      "GDPR consent tracking",
      "Data privacy regulations",
      "Ad transparency requirements",
    ],
    regulationReferences: ["GDPR"],
    templates: withId<TemplateSeed>([
      {
        name: "Campaign Performance Analysis",
        type: "statistical",
        description: "Analyze marketing campaign performance across channels and audiences",
        requiredColumns: ["campaign_id", "channel", "impressions", "clicks", "conversions", "spend"],
        expectedOutcomes: ["Channel comparisons", "ROI analysis", "Audience insights", "Optimization recommendations"],
        businessValue: "Optimize marketing spend allocation to improve ROAS by 25-40%",
      },
      {
        name: "Customer Segmentation",
        type: "machine_learning",
        description: "Identify distinct customer segments based on behavior and demographics",
        requiredColumns: ["customer_id", "purchase_history", "engagement_data", "demographics"],
        expectedOutcomes: ["Customer segments", "Segment profiles", "Targeting recommendations"],
        businessValue: "Enable personalized marketing that increases conversion rates by 20-35%",
      },
    ]),
  },
];
