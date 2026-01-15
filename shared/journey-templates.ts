import { z } from 'zod';

export const JourneyTemplateJourneyTypeSchema = z.enum([
  'non-tech',
  'business',
  'technical',
  'consultation'
]);

export type JourneyTemplateJourneyType = z.infer<typeof JourneyTemplateJourneyTypeSchema>;

export const JourneyTemplateStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  // GAP F + G: Added template_research_agent and data_scientist for PM-coordinated workflow
  agent: z.enum(['technical_ai_agent', 'business_agent', 'project_manager', 'data_engineer', 'template_research_agent', 'data_scientist']),
  tools: z.array(z.string()).min(1),
  estimatedDuration: z.number().nonnegative().default(0),
  dependencies: z.array(z.string()).optional(),
  artifacts: z.array(z.string()).optional(),
  communicationStyle: z
    .enum(['plain-language', 'executive', 'technical', 'consultation', 'mixed'])
    .optional(),
  handoffNotes: z.array(z.string()).optional()
});

export type JourneyTemplateStep = z.infer<typeof JourneyTemplateStepSchema>;

export const JourneyTemplateSchema = z.object({
  id: z.string(),
  journeyType: JourneyTemplateJourneyTypeSchema,
  industry: z.string().optional(),
  title: z.string(),
  summary: z.string(),
  persona: z.string().optional(),
  // GAP F + G: Added template_research_agent and data_scientist for PM-coordinated workflow
  primaryAgent: z.enum(['technical_ai_agent', 'business_agent', 'project_manager', 'data_engineer', 'template_research_agent', 'data_scientist']),
  defaultConfidence: z.number().min(0).max(1).default(0.9),
  expectedArtifacts: z.array(z.string()).optional(),
  communicationStyle: z
    .enum(['plain-language', 'executive', 'technical', 'consultation', 'mixed'])
    .default('plain-language'),
  communicationGuidelines: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  version: z.string().default('1.0.0'),
  lastUpdated: z.string().optional(),
  steps: z.array(JourneyTemplateStepSchema).min(1),
  metadata: z.record(z.any()).optional()
});

export type JourneyTemplate = z.infer<typeof JourneyTemplateSchema>;

export interface JourneyTemplateCatalog {
  'non-tech': JourneyTemplate[];
  business: JourneyTemplate[];
  technical: JourneyTemplate[];
  consultation: JourneyTemplate[];
}

const timestamp = new Date().toISOString();

const nonTechDefaultTemplate = JourneyTemplateSchema.parse({
  id: 'non_tech_guided_essentials',
  journeyType: 'non-tech',
  title: 'Guided Essentials Analysis',
  summary:
    'AI-guided workflow that clarifies analysis goals and required data elements, guides data cleanup, and narrates insights for non-technical stakeholders.',
  persona: 'non-technical stakeholder',
  primaryAgent: 'technical_ai_agent',
  defaultConfidence: 0.92,
  expectedArtifacts: ['executive_summary', 'insight_brief', 'visualizations', 'interactive_dashboard', 'pdf_report', 'powerpoint_deck', 'rest_api_export'],
  communicationStyle: 'plain-language',
  communicationGuidelines: [
    'Use simple, jargon-free explanations for each step.',
    'Highlight business impact before detailing metrics.',
    'Provide actionable recommendations with next steps.',
    'Always confirm or refine the analysis goal and enumerate the data elements required to answer it before proceeding.',
    'Guide the user through any data preparation or transformation steps needed for analysis readiness.',
    'Deliver artifacts that include an interactive dashboard plan, downloadable PDF summary, PowerPoint presentation, and REST API export aligned to the target audience.',
    'Engage the user at every step to confirm needs, approvals, and readiness before advancing.'
  ],
  tags: ['guided', 'ai-assisted', 'executive-ready'],
  version: '1.0.0',
  lastUpdated: timestamp,
  steps: [
    {
      id: 'intake_alignment',
      name: 'Goal Alignment & Intake',
      description: 'Work with the user to confirm or refine the analysis goal, success criteria, audience, and the specific data elements required.',
      agent: 'project_manager',
      tools: ['project_coordinator'],
      estimatedDuration: 2,
      communicationStyle: 'plain-language',
      artifacts: ['checkpoint_summary', 'requirements_brief']
    },
    {
      id: 'auto_schema_detection',
      name: 'Automatic Schema Detection',
      description: 'Detect dataset structure, verify required fields are present, and highlight any missing elements needed for the analysis.',
      agent: 'technical_ai_agent',
      tools: ['schema_generator'],
      estimatedDuration: 2,
      dependencies: ['intake_alignment'],
      artifacts: ['schema_report', 'rest_api_export']
    },
    {
      id: 'data_preparation',
      name: 'Data Preparation & Quality Checks',
      description: 'Clean the dataset, resolve missing values, and capture data quality insights while guiding the user through any required transformations.',
      agent: 'data_engineer',
      tools: ['data_transformer'],
      estimatedDuration: 3,
      dependencies: ['auto_schema_detection'],
      artifacts: ['data_quality_report', 'transformation_walkthrough']
    },
    {
      id: 'guided_analysis',
      name: 'Guided Statistical Analysis',
      description: 'Run descriptive statistics that answer the confirmed analysis goal and highlight notable trends tied to the identified audience.',
      agent: 'technical_ai_agent',
      tools: ['statistical_analyzer'],
      estimatedDuration: 6,
      dependencies: ['data_preparation'],
      communicationStyle: 'plain-language',
      artifacts: ['analysis_summary', 'trend_highlights']
    },
    {
      id: 'insight_curation',
      name: 'Insight Curation & Narration',
      description: 'Translate findings into user-friendly talking points that connect back to the agreed analysis goal and required decisions.',
      agent: 'business_agent',
      tools: ['business_templates'],
      estimatedDuration: 4,
      dependencies: ['guided_analysis'],
      communicationStyle: 'plain-language',
      artifacts: ['insight_brief']
    },
    {
      id: 'visual_storytelling',
      name: 'Visual Storytelling',
      description: 'Generate easy-to-digest visualizations plus an interactive dashboard blueprint aligned with the narrative and required decision makers.',
      agent: 'technical_ai_agent',
      tools: ['visualization_engine'],
      estimatedDuration: 4,
      dependencies: ['insight_curation'],
      artifacts: ['visualizations', 'interactive_dashboard', 'powerpoint_deck']
    },
    {
      id: 'executive_hand_off',
      name: 'Executive Summary & Next Steps',
      description: 'Package the findings and recommended actions for delivery, including an audience-ready PDF summary and dashboard access notes.',
      agent: 'business_agent',
      tools: ['business_templates', 'decision_auditor'],
      estimatedDuration: 3,
      dependencies: ['visual_storytelling'],
      communicationStyle: 'plain-language',
      artifacts: ['executive_summary', 'pdf_report', 'rest_api_export']
    },
    {
      id: 'execute',
      name: 'Execute Analysis',
      description: 'Run the main analysis workflow and generate all required outputs and artifacts.',
      agent: 'technical_ai_agent',
      tools: ['statistical_analyzer', 'business_templates', 'visualization_engine'],
      estimatedDuration: 5,
      dependencies: ['executive_hand_off'],
      communicationStyle: 'plain-language',
      artifacts: ['executive_summary', 'insight_brief', 'visualizations', 'interactive_dashboard', 'pdf_report', 'powerpoint_deck', 'rest_api_export']
    }
  ]
});

const businessRetailTemplate = JourneyTemplateSchema.parse({
  id: 'business_retail_growth_playbook',
  journeyType: 'business',
  industry: 'retail',
  title: 'Retail Revenue Growth Playbook',
  summary:
    'Template-driven revenue diagnostics for retail leaders that clarify analysis goals, specify required data, guide transformation, and deliver audience-ready assets.',
  persona: 'business executive',
  primaryAgent: 'business_agent',
  defaultConfidence: 0.9,
  expectedArtifacts: ['executive_summary', 'kpi_dashboard', 'recommendation_brief', 'pdf_report', 'powerpoint_deck', 'rest_api_export'],
  communicationStyle: 'executive',
  communicationGuidelines: [
    'Lead with KPIs and headline insights.',
    'Reference benchmark comparisons when possible.',
    'Summarize recommended actions with ROI expectations.',
    'Validate the growth analysis goal and list required data elements (metrics, dimensions) before modeling.',
    'Highlight any data preparation work the user must complete or approve prior to analysis.',
    'Ensure the final artifacts include a stakeholder-ready dashboard view, PowerPoint presentation, REST API export, and downloadable PDF briefing.',
    'Engage the user at each milestone to confirm direction, inputs, and approvals.'
  ],
  tags: ['retail', 'growth', 'kpi'],
  version: '1.0.0',
  lastUpdated: timestamp,
  steps: [
    {
      id: 'industry_context',
      name: 'Industry Context Briefing',
      description: 'Align on objectives, refine the growth analysis goal, identify KPIs, and confirm the data elements needed to answer the business questions.',
      agent: 'business_agent',
      tools: ['business_templates'],
      estimatedDuration: 1,
      communicationStyle: 'executive',
      artifacts: ['context_brief']
    },
    {
      id: 'data_health_check',
      name: 'Data Health Check',
      description: 'Evaluate data completeness, recency, and retail-specific quality thresholds, documenting any missing required fields.',
      agent: 'data_engineer',
      tools: ['data_transformer', 'statistical_analyzer'],
      estimatedDuration: 1,
      dependencies: ['industry_context'],
      artifacts: ['data_quality_report', 'anomaly_log', 'rest_api_export']
    },
    {
      id: 'kpi_modeling',
      name: 'KPI Modeling & Cohort Analysis',
      description: 'Model revenue, basket size, and retention cohorts using specialized templates.',
      agent: 'technical_ai_agent',
      tools: ['comprehensive_ml_pipeline', 'statistical_analyzer'],
      estimatedDuration: 10,
      dependencies: ['data_health_check'],
      communicationStyle: 'technical',
      artifacts: ['kpi_model_outputs', 'cohort_tables']
    },
    {
      id: 'visual_storycrafting',
      name: 'Visual Story Crafting',
      description: 'Create executive dashboards and specify visualization layouts aligned with the confirmed goals, segments, and campaign impact.',
      agent: 'technical_ai_agent',
      tools: ['visualization_engine', 'business_templates'],
      estimatedDuration: 6,
      dependencies: ['kpi_modeling'],
      artifacts: ['kpi_dashboard', 'powerpoint_deck']
    },
    {
      id: 'recommendation_roundtable',
      name: 'Recommendation Roundtable',
      description: 'Facilitate cross-agent review and finalize executive recommendations.',
      agent: 'project_manager',
      tools: ['decision_auditor'],
      estimatedDuration: 3,
      dependencies: ['visual_storycrafting'],
      communicationStyle: 'executive',
      artifacts: ['recommendation_brief']
    },
    {
      id: 'executive_package',
      name: 'Executive Package Delivery',
      description: 'Deliver packaged findings with prioritized actions, ROI projections, and a downloadable PDF summary for executive stakeholders.',
      agent: 'business_agent',
      tools: ['business_templates'],
      estimatedDuration: 3,
      dependencies: ['recommendation_roundtable'],
      communicationStyle: 'executive',
      artifacts: ['executive_summary', 'pdf_report', 'rest_api_export']
    },
    {
      id: 'execute',
      name: 'Execute Analysis',
      description: 'Run the main analysis workflow and generate all required outputs and artifacts.',
      agent: 'business_agent',
      tools: ['business_templates', 'statistical_analyzer', 'visualization_engine'],
      estimatedDuration: 5,
      dependencies: ['executive_package'],
      communicationStyle: 'executive',
      artifacts: ['executive_summary', 'kpi_dashboard', 'recommendation_brief', 'pdf_report', 'powerpoint_deck', 'rest_api_export']
    }
  ]
});

const businessFinancialTemplate = JourneyTemplateSchema.parse({
  id: 'business_financial_risk_watch',
  journeyType: 'business',
  industry: 'financial_services',
  title: 'Financial Risk & Compliance Watch',
  summary:
    'Risk scoring and compliance oversight template for financial services teams that clarifies goals, confirms required data, guides preparation, and packages compliance artifacts.',
  persona: 'risk & compliance leader',
  primaryAgent: 'business_agent',
  defaultConfidence: 0.88,
  expectedArtifacts: ['risk_register', 'compliance_heatmap', 'executive_brief', 'pdf_report', 'powerpoint_deck', 'rest_api_export'],
  communicationStyle: 'executive',
  communicationGuidelines: [
    'Focus on risk mitigation impact and regulatory thresholds.',
    'Quantify exposure wherever possible.',
    'Highlight recommended controls with ownership suggestions.',
    'Confirm the compliance analysis goal and enumerate required data sources, controls, and metrics at the outset.',
    'Flag any data preparation or transformation tasks needed to support regulatory calculations.',
    'Provide final outputs as dashboards, PowerPoint decks, REST API exports, and PDF briefs that match regulator and executive expectations.',
    'Engage the user and compliance stakeholders at each step to validate assumptions and approvals.'
  ],
  tags: ['finance', 'risk', 'compliance'],
  version: '1.0.0',
  lastUpdated: timestamp,
  steps: [
    {
      id: 'regulatory_context',
      name: 'Regulatory Context Alignment',
      description: 'Capture current regulatory focus areas, tolerance thresholds, and explicitly document the analysis goal and required data elements.',
      agent: 'business_agent',
      tools: ['business_templates'],
      estimatedDuration: 4,
      communicationStyle: 'executive',
      artifacts: ['regulatory_brief']
    },
    {
      id: 'data_integrity_screen',
      name: 'Data Integrity Screening',
      description: 'Verify completeness, timeliness, and reconciliation checkpoints.',
      agent: 'data_engineer',
      tools: ['data_transformer', 'statistical_analyzer'],
      estimatedDuration: 5,
      dependencies: ['regulatory_context'],
      artifacts: ['data_quality_report']
    },
    {
      id: 'risk_scoring',
      name: 'Risk Scoring & Scenario Modeling',
      description: 'Score risk exposure and run stress-test scenarios.',
      agent: 'technical_ai_agent',
      tools: ['statistical_analyzer', 'comprehensive_ml_pipeline'],
      estimatedDuration: 9,
      dependencies: ['data_integrity_screen'],
      communicationStyle: 'technical',
      artifacts: ['risk_scores', 'scenario_outputs']
    },
    {
      id: 'compliance_visuals',
      name: 'Compliance Heatmaps & Alerts',
      description: 'Create visualizations that highlight compliance breaches and required actions.',
      agent: 'technical_ai_agent',
      tools: ['visualization_engine'],
      estimatedDuration: 5,
      dependencies: ['risk_scoring'],
      artifacts: ['compliance_heatmap']
    },
    {
      id: 'controls_review',
      name: 'Controls Review & Recommendations',
      description: 'Summarize control effectiveness and propose mitigation roadmap.',
      agent: 'business_agent',
      tools: ['business_templates'],
      estimatedDuration: 4,
      dependencies: ['compliance_visuals'],
      communicationStyle: 'executive',
      artifacts: ['recommendation_brief']
    },
    {
      id: 'executive_debrief',
      name: 'Executive Debrief & Action Plan',
      description: 'Deliver the consolidated artifacts with an action playbook and include a compliance-ready PDF briefing for stakeholders.',
      agent: 'project_manager',
      tools: ['decision_auditor', 'business_templates'],
      estimatedDuration: 4,
      dependencies: ['controls_review'],
      communicationStyle: 'executive',
      artifacts: ['executive_brief', 'pdf_report', 'powerpoint_deck', 'rest_api_export']
    },
    {
      id: 'execute',
      name: 'Execute Analysis',
      description: 'Run the main analysis workflow and generate all required outputs and artifacts.',
      agent: 'business_agent',
      tools: ['business_templates', 'statistical_analyzer', 'visualization_engine'],
      estimatedDuration: 5,
      dependencies: ['executive_debrief'],
      communicationStyle: 'executive',
      artifacts: ['risk_register', 'compliance_heatmap', 'executive_brief', 'pdf_report', 'powerpoint_deck', 'rest_api_export']
    }
  ]
});

const technicalAdvancedTemplate = JourneyTemplateSchema.parse({
  id: 'technical_advanced_pipeline',
  journeyType: 'technical',
  title: 'Advanced Technical Pipeline',
  summary:
    'End-to-end technical workflow that validates analysis goals, captures required data elements, guides transformation, and delivers deployment-ready artifacts.',
  persona: 'data scientist',
  primaryAgent: 'technical_ai_agent',
  defaultConfidence: 0.9,
  expectedArtifacts: ['feature_store_snapshot', 'model_card', 'evaluation_report', 'deployment_playbook', 'interactive_dashboard', 'pdf_report', 'powerpoint_deck', 'rest_api_export'],
  communicationStyle: 'technical',
  communicationGuidelines: [
    'Expose configuration and parameter decisions for transparency.',
    'Surface model performance trade-offs and data drift checks.',
    'Document deployment considerations and monitoring hooks.',
    'Validate technical analysis goals and enumerate the data features required before experimentation.',
    'Call out any data transformation pipelines the user must execute or approve prior to modeling.',
    'Ensure outputs include shareable dashboards, notebooks, PowerPoint decks, REST API exports, or PDF reports tailored to engineering stakeholders.',
    'Engage the user or engineering sponsor at each stage to confirm requirements, risks, and deliverable readiness.'
  ],
  tags: ['ml', 'experimentation', 'deployment'],
  version: '1.0.0',
  lastUpdated: timestamp,
  steps: [
    {
      id: 'technical_intake',
      name: 'Technical Intake & Requirements',
      description: 'Capture or refine the modeling objective, constraints, success metrics, and enumerate required data features and sources.',
      agent: 'project_manager',
      tools: ['project_coordinator'],
      estimatedDuration: 3,
      communicationStyle: 'technical',
      artifacts: ['intake_notes']
    },
    {
      id: 'schema_profiling',
      name: 'Schema Profiling & Data Contracts',
      description: 'Profile datasets, define contracts, highlight schema drifts, and confirm that required features for the analysis are available.',
      agent: 'data_engineer',
      tools: ['schema_generator', 'data_transformer'],
      estimatedDuration: 4,
      dependencies: ['technical_intake'],
      artifacts: ['schema_profile', 'data_contract', 'rest_api_export']
    },
    {
      id: 'feature_engineering',
      name: 'Feature Engineering Workbench',
      description: 'Generate feature sets, evaluate importance, document transformations, and guide the user through any pipeline changes needed.',
      agent: 'technical_ai_agent',
      tools: ['data_transformer', 'statistical_analyzer'],
      estimatedDuration: 7,
      dependencies: ['schema_profiling'],
      communicationStyle: 'technical',
      artifacts: ['feature_store_snapshot', 'transformation_walkthrough']
    },
    {
      id: 'ml_experiments',
      name: 'ML Experimentation & Model Selection',
      description: 'Run experiments with AutoML, track trials, and select a champion model that satisfies the confirmed analysis goal and audience needs.',
      agent: 'technical_ai_agent',
      tools: ['comprehensive_ml_pipeline', 'automl_optimizer'],
      estimatedDuration: 12,
      dependencies: ['feature_engineering'],
      communicationStyle: 'technical',
      artifacts: ['experiment_report', 'model_card', 'powerpoint_deck']
    },
    {
      id: 'model_validation',
      name: 'Model Validation & Explainability',
      description: 'Perform validation, fairness checks, generate explainability artifacts, and outline visualization/dashboard requirements for stakeholders.',
      agent: 'technical_ai_agent',
      tools: ['statistical_analyzer', 'visualization_engine'],
      estimatedDuration: 8,
      dependencies: ['ml_experiments'],
      communicationStyle: 'technical',
      artifacts: ['evaluation_report', 'explainability_pack']
    },
    {
      id: 'deployment_readiness',
      name: 'Deployment Readiness & Handoff',
      description: 'Prepare deployment checklist, monitoring hooks, rollback plan, and package dashboard/PDF artifacts for engineering stakeholders.',
      agent: 'project_manager',
      tools: ['decision_auditor'],
      estimatedDuration: 4,
      dependencies: ['model_validation'],
      communicationStyle: 'technical',
      artifacts: ['deployment_playbook', 'interactive_dashboard', 'pdf_report', 'powerpoint_deck', 'rest_api_export']
    },
    {
      id: 'execute',
      name: 'Execute Analysis',
      description: 'Run the main analysis workflow and generate all required outputs and artifacts.',
      agent: 'technical_ai_agent',
      tools: ['comprehensive_ml_pipeline', 'statistical_analyzer', 'visualization_engine'],
      estimatedDuration: 5,
      dependencies: ['deployment_readiness'],
      communicationStyle: 'technical',
      artifacts: ['feature_store_snapshot', 'model_card', 'evaluation_report', 'deployment_playbook', 'interactive_dashboard', 'pdf_report', 'powerpoint_deck', 'rest_api_export']
    }
  ]
});

const consultationDefaultTemplate = JourneyTemplateSchema.parse({
  id: 'consultation_intake_flow',
  journeyType: 'consultation',
  title: 'Consultation Intake & Scoping',
  summary:
    'Structured intake for consultation engagements covering goals, questions, and dataset review before expert scoping.',
  persona: 'consultation requestor',
  primaryAgent: 'project_manager',
  defaultConfidence: 0.87,
  expectedArtifacts: ['consultation_brief', 'scoping_notes', 'next_steps_plan'],
  communicationStyle: 'consultation',
  communicationGuidelines: [
    'Ensure the user confirms goals, key questions, and constraints explicitly.',
    'Surface any data limitations before promising deliverables.',
    'Outline next steps with ownership and expected timelines.'
  ],
  tags: ['consultation', 'intake', 'scoping'],
  version: '1.0.0',
  lastUpdated: timestamp,
  steps: [
    {
      id: 'consultation_form_intake',
      name: 'Consultation Form Intake',
      description: 'Guide the user through goal, question, and data upload form completion.',
      agent: 'project_manager',
      tools: ['project_coordinator'],
      estimatedDuration: 5,
      communicationStyle: 'consultation',
      artifacts: ['intake_form']
    },
    {
      id: 'goal_alignment',
      name: 'Goal & Question Alignment',
      description: 'Validate goals, clarify open questions, and capture success criteria.',
      agent: 'business_agent',
      tools: ['business_templates'],
      estimatedDuration: 4,
      dependencies: ['consultation_form_intake'],
      communicationStyle: 'consultation',
      artifacts: ['goal_brief']
    },
    {
      id: 'dataset_review',
      name: 'Dataset Review & Feasibility',
      description: 'Assess uploaded data for feasibility, sensitivity, and constraints.',
      agent: 'technical_ai_agent',
      tools: ['schema_generator', 'statistical_analyzer'],
      estimatedDuration: 6,
      dependencies: ['goal_alignment'],
      communicationStyle: 'technical',
      artifacts: ['feasibility_notes']
    },
    {
      id: 'multi_agent_scoping',
      name: 'Multi-Agent Scoping Session',
      description: 'Coordinate agents to draft analysis approach and artifact expectations.',
      agent: 'project_manager',
      tools: ['decision_auditor'],
      estimatedDuration: 5,
      dependencies: ['dataset_review'],
      communicationStyle: 'consultation',
      artifacts: ['scoping_notes']
    },
    {
      id: 'consultation_plan_delivery',
      name: 'Consultation Plan Delivery',
      description: 'Share recommended plan, required effort, and follow-up steps with the user.',
      agent: 'business_agent',
      tools: ['business_templates'],
      estimatedDuration: 4,
      dependencies: ['multi_agent_scoping'],
      communicationStyle: 'consultation',
      artifacts: ['next_steps_plan']
    },
    {
      id: 'execute',
      name: 'Execute Analysis',
      description: 'Run the main analysis workflow and generate all required outputs and artifacts.',
      agent: 'project_manager',
      tools: ['business_templates', 'statistical_analyzer', 'visualization_engine'],
      estimatedDuration: 5,
      dependencies: ['consultation_plan_delivery'],
      communicationStyle: 'consultation',
      artifacts: ['consultation_brief', 'scoping_notes', 'next_steps_plan']
    }
  ]
});

export const defaultJourneyTemplateCatalog: JourneyTemplateCatalog = {
  'non-tech': [nonTechDefaultTemplate],
  business: [
    businessRetailTemplate,
    businessFinancialTemplate,
    JourneyTemplateSchema.parse({
      id: 'customer_segmentation',
      journeyType: 'business',
      title: 'Customer Segmentation',
      summary: 'Identify customer groups based on purchasing behavior.',
      persona: 'business analyst',
      primaryAgent: 'business_agent',
      defaultConfidence: 0.9,
      expectedArtifacts: ['segmentation_report', 'customer_profiles', 'dashboard'],
      communicationStyle: 'executive',
      steps: [
        { id: 'intake', name: 'Intake & Goal Alignment', agent: 'business_agent', tools: ['business_templates'], estimatedDuration: 2, artifacts: ['goal_brief'] },
        { id: 'data_prep', name: 'Data Preparation', agent: 'data_engineer', tools: ['data_transformer'], estimatedDuration: 3, dependencies: ['intake'], artifacts: ['data_quality_report'] },
        { id: 'segmentation_analysis', name: 'Segmentation Analysis', agent: 'technical_ai_agent', tools: ['statistical_analyzer'], estimatedDuration: 5, dependencies: ['data_prep'], artifacts: ['segmentation_report'] },
        { id: 'insight_curation', name: 'Insight Curation', agent: 'business_agent', tools: ['business_templates'], estimatedDuration: 2, dependencies: ['segmentation_analysis'], artifacts: ['customer_profiles'] },
        { id: 'dashboard', name: 'Dashboard & Delivery', agent: 'technical_ai_agent', tools: ['visualization_engine'], estimatedDuration: 2, dependencies: ['insight_curation'], artifacts: ['dashboard'] },
        { id: 'execute', name: 'Execute Analysis', agent: 'business_agent', tools: ['business_templates', 'statistical_analyzer', 'visualization_engine'], estimatedDuration: 2, dependencies: ['dashboard'], artifacts: ['segmentation_report', 'customer_profiles', 'dashboard'] }
      ]
    }),
    JourneyTemplateSchema.parse({
      id: 'fraud_detection',
      journeyType: 'business',
      title: 'Fraud Detection',
      summary: 'Identify fraudulent transactions using ML.',
      persona: 'risk analyst',
      primaryAgent: 'business_agent',
      defaultConfidence: 0.9,
      expectedArtifacts: ['fraud_report', 'anomaly_log', 'dashboard'],
      communicationStyle: 'executive',
      steps: [
        { id: 'intake', name: 'Intake & Goal Alignment', agent: 'business_agent', tools: ['business_templates'], estimatedDuration: 2, artifacts: ['goal_brief'] },
        { id: 'data_prep', name: 'Data Preparation', agent: 'data_engineer', tools: ['data_transformer'], estimatedDuration: 3, dependencies: ['intake'], artifacts: ['data_quality_report'] },
        { id: 'fraud_analysis', name: 'Fraud Analysis', agent: 'technical_ai_agent', tools: ['statistical_analyzer', 'comprehensive_ml_pipeline'], estimatedDuration: 5, dependencies: ['data_prep'], artifacts: ['fraud_report', 'anomaly_log'] },
        { id: 'dashboard', name: 'Dashboard & Delivery', agent: 'technical_ai_agent', tools: ['visualization_engine'], estimatedDuration: 2, dependencies: ['fraud_analysis'], artifacts: ['dashboard'] },
        { id: 'execute', name: 'Execute Analysis', agent: 'business_agent', tools: ['business_templates', 'statistical_analyzer', 'visualization_engine'], estimatedDuration: 2, dependencies: ['dashboard'], artifacts: ['fraud_report', 'anomaly_log', 'dashboard'] }
      ]
    }),
    JourneyTemplateSchema.parse({
      id: 'credit_risk_assessment',
      journeyType: 'business',
      title: 'Credit Risk Assessment',
      summary: 'Evaluate borrower creditworthiness and default probability using ML.',
      persona: 'credit analyst',
      primaryAgent: 'business_agent',
      defaultConfidence: 0.9,
      expectedArtifacts: ['risk_report', 'scorecard', 'dashboard'],
      communicationStyle: 'executive',
      steps: [
        { id: 'intake', name: 'Intake & Goal Alignment', agent: 'business_agent', tools: ['business_templates'], estimatedDuration: 2, artifacts: ['goal_brief'] },
        { id: 'data_prep', name: 'Data Preparation', agent: 'data_engineer', tools: ['data_transformer'], estimatedDuration: 3, dependencies: ['intake'], artifacts: ['data_quality_report'] },
        { id: 'risk_analysis', name: 'Risk Analysis', agent: 'technical_ai_agent', tools: ['statistical_analyzer', 'comprehensive_ml_pipeline'], estimatedDuration: 5, dependencies: ['data_prep'], artifacts: ['risk_report', 'scorecard'] },
        { id: 'dashboard', name: 'Dashboard & Delivery', agent: 'technical_ai_agent', tools: ['visualization_engine'], estimatedDuration: 2, dependencies: ['risk_analysis'], artifacts: ['dashboard'] },
        { id: 'execute', name: 'Execute Analysis', agent: 'business_agent', tools: ['business_templates', 'statistical_analyzer', 'visualization_engine'], estimatedDuration: 2, dependencies: ['dashboard'], artifacts: ['risk_report', 'scorecard', 'dashboard'] }
      ]
    }),
    JourneyTemplateSchema.parse({
      id: 'portfolio_optimization',
      journeyType: 'business',
      title: 'Portfolio Optimization',
      summary: 'Optimize investment portfolio allocation using Modern Portfolio Theory.',
      persona: 'portfolio manager',
      primaryAgent: 'business_agent',
      defaultConfidence: 0.9,
      expectedArtifacts: ['optimization_report', 'allocation_plan', 'dashboard'],
      communicationStyle: 'executive',
      steps: [
        { id: 'intake', name: 'Intake & Goal Alignment', agent: 'business_agent', tools: ['business_templates'], estimatedDuration: 2, artifacts: ['goal_brief'] },
        { id: 'data_prep', name: 'Data Preparation', agent: 'data_engineer', tools: ['data_transformer'], estimatedDuration: 3, dependencies: ['intake'], artifacts: ['data_quality_report'] },
        { id: 'optimization_analysis', name: 'Optimization Analysis', agent: 'technical_ai_agent', tools: ['statistical_analyzer', 'comprehensive_ml_pipeline'], estimatedDuration: 5, dependencies: ['data_prep'], artifacts: ['optimization_report', 'allocation_plan'] },
        { id: 'dashboard', name: 'Dashboard & Delivery', agent: 'technical_ai_agent', tools: ['visualization_engine'], estimatedDuration: 2, dependencies: ['optimization_analysis'], artifacts: ['dashboard'] },
        { id: 'execute', name: 'Execute Analysis', agent: 'business_agent', tools: ['business_templates', 'statistical_analyzer', 'visualization_engine'], estimatedDuration: 2, dependencies: ['dashboard'], artifacts: ['optimization_report', 'allocation_plan', 'dashboard'] }
      ]
    }),
    JourneyTemplateSchema.parse({
      id: 'financial_forecasting',
      journeyType: 'business',
      title: 'Financial Forecasting',
      summary: 'Forecast revenue, expenses, and cash flow using time series models.',
      persona: 'finance analyst',
      primaryAgent: 'business_agent',
      defaultConfidence: 0.9,
      expectedArtifacts: ['forecast_report', 'trend_dashboard', 'dashboard'],
      communicationStyle: 'executive',
      steps: [
        { id: 'intake', name: 'Intake & Goal Alignment', agent: 'business_agent', tools: ['business_templates'], estimatedDuration: 2, artifacts: ['goal_brief'] },
        { id: 'data_prep', name: 'Data Preparation', agent: 'data_engineer', tools: ['data_transformer'], estimatedDuration: 3, dependencies: ['intake'], artifacts: ['data_quality_report'] },
        { id: 'forecasting_analysis', name: 'Forecasting Analysis', agent: 'technical_ai_agent', tools: ['statistical_analyzer', 'comprehensive_ml_pipeline'], estimatedDuration: 5, dependencies: ['data_prep'], artifacts: ['forecast_report'] },
        { id: 'dashboard', name: 'Dashboard & Delivery', agent: 'technical_ai_agent', tools: ['visualization_engine'], estimatedDuration: 2, dependencies: ['forecasting_analysis'], artifacts: ['trend_dashboard', 'dashboard'] },
        { id: 'execute', name: 'Execute Analysis', agent: 'business_agent', tools: ['business_templates', 'statistical_analyzer', 'visualization_engine'], estimatedDuration: 2, dependencies: ['dashboard'], artifacts: ['forecast_report', 'trend_dashboard', 'dashboard'] }
      ]
    }),
    JourneyTemplateSchema.parse({
      id: 'anti_money_laundering_detection',
      journeyType: 'business',
      title: 'Anti-Money Laundering Detection',
      summary: 'Detect suspicious transaction patterns for AML compliance.',
      persona: 'compliance analyst',
      primaryAgent: 'business_agent',
      defaultConfidence: 0.9,
      expectedArtifacts: ['aml_report', 'suspicious_activity_log', 'dashboard'],
      communicationStyle: 'executive',
      steps: [
        { id: 'intake', name: 'Intake & Goal Alignment', agent: 'business_agent', tools: ['business_templates'], estimatedDuration: 2, artifacts: ['goal_brief'] },
        { id: 'data_prep', name: 'Data Preparation', agent: 'data_engineer', tools: ['data_transformer'], estimatedDuration: 3, dependencies: ['intake'], artifacts: ['data_quality_report'] },
        { id: 'aml_analysis', name: 'AML Analysis', agent: 'technical_ai_agent', tools: ['statistical_analyzer', 'comprehensive_ml_pipeline'], estimatedDuration: 5, dependencies: ['data_prep'], artifacts: ['aml_report', 'suspicious_activity_log'] },
        { id: 'dashboard', name: 'Dashboard & Delivery', agent: 'technical_ai_agent', tools: ['visualization_engine'], estimatedDuration: 2, dependencies: ['aml_analysis'], artifacts: ['dashboard'] },
        { id: 'execute', name: 'Execute Analysis', agent: 'business_agent', tools: ['business_templates', 'statistical_analyzer', 'visualization_engine'], estimatedDuration: 2, dependencies: ['dashboard'], artifacts: ['aml_report', 'suspicious_activity_log', 'dashboard'] }
      ]
    }),
    JourneyTemplateSchema.parse({
      id: 'employee_attrition_prediction',
      journeyType: 'business',
      title: 'Employee Attrition Prediction',
      summary: 'Predict which employees are at risk of leaving and identify retention strategies.',
      persona: 'hr analyst',
      primaryAgent: 'business_agent',
      defaultConfidence: 0.9,
      expectedArtifacts: ['attrition_report', 'retention_plan', 'dashboard'],
      communicationStyle: 'executive',
      steps: [
        { id: 'intake', name: 'Intake & Goal Alignment', agent: 'business_agent', tools: ['business_templates'], estimatedDuration: 2, artifacts: ['goal_brief'] },
        { id: 'data_prep', name: 'Data Preparation', agent: 'data_engineer', tools: ['data_transformer'], estimatedDuration: 3, dependencies: ['intake'], artifacts: ['data_quality_report'] },
        { id: 'attrition_analysis', name: 'Attrition Analysis', agent: 'technical_ai_agent', tools: ['statistical_analyzer', 'comprehensive_ml_pipeline'], estimatedDuration: 5, dependencies: ['data_prep'], artifacts: ['attrition_report'] },
        { id: 'dashboard', name: 'Dashboard & Delivery', agent: 'technical_ai_agent', tools: ['visualization_engine'], estimatedDuration: 2, dependencies: ['attrition_analysis'], artifacts: ['retention_plan', 'dashboard'] },
        { id: 'execute', name: 'Execute Analysis', agent: 'business_agent', tools: ['business_templates', 'statistical_analyzer', 'visualization_engine'], estimatedDuration: 2, dependencies: ['dashboard'], artifacts: ['attrition_report', 'retention_plan', 'dashboard'] }
      ]
    }),
    JourneyTemplateSchema.parse({
      id: 'compensation_equity_analysis',
      journeyType: 'business',
      title: 'Compensation Equity Analysis',
      summary: 'Analyze pay equity across demographics and identify compensation gaps.',
      persona: 'hr analyst',
      primaryAgent: 'business_agent',
      defaultConfidence: 0.9,
      expectedArtifacts: ['equity_report', 'gap_analysis', 'dashboard'],
      communicationStyle: 'executive',
      steps: [
        { id: 'intake', name: 'Intake & Goal Alignment', agent: 'business_agent', tools: ['business_templates'], estimatedDuration: 2, artifacts: ['goal_brief'] },
        { id: 'data_prep', name: 'Data Preparation', agent: 'data_engineer', tools: ['data_transformer'], estimatedDuration: 3, dependencies: ['intake'], artifacts: ['data_quality_report'] },
        { id: 'equity_analysis', name: 'Equity Analysis', agent: 'technical_ai_agent', tools: ['statistical_analyzer', 'comprehensive_ml_pipeline'], estimatedDuration: 5, dependencies: ['data_prep'], artifacts: ['equity_report', 'gap_analysis'] },
        { id: 'dashboard', name: 'Dashboard & Delivery', agent: 'technical_ai_agent', tools: ['visualization_engine'], estimatedDuration: 2, dependencies: ['equity_analysis'], artifacts: ['dashboard'] },
        { id: 'execute', name: 'Execute Analysis', agent: 'business_agent', tools: ['business_templates', 'statistical_analyzer', 'visualization_engine'], estimatedDuration: 2, dependencies: ['dashboard'], artifacts: ['equity_report', 'gap_analysis', 'dashboard'] }
      ]
    }),
    JourneyTemplateSchema.parse({
      id: 'survey_response_analysis',
      journeyType: 'business',
      title: 'Survey Response Analysis',
      summary: 'Analyze survey responses to understand participant sentiment, preferences, and satisfaction.',
      persona: 'business analyst',
      primaryAgent: 'business_agent',
      defaultConfidence: 0.9,
      expectedArtifacts: ['sentiment_report', 'preference_summary', 'satisfaction_dashboard'],
      communicationStyle: 'executive',
      steps: [
        { id: 'intake', name: 'Intake & Goal Alignment', agent: 'business_agent', tools: ['business_templates'], estimatedDuration: 2, artifacts: ['goal_brief'] },
        { id: 'data_prep', name: 'Data Preparation', agent: 'data_engineer', tools: ['data_transformer'], estimatedDuration: 3, dependencies: ['intake'], artifacts: ['data_quality_report'] },
        { id: 'survey_analysis', name: 'Survey Analysis', agent: 'technical_ai_agent', tools: ['statistical_analyzer'], estimatedDuration: 5, dependencies: ['data_prep'], artifacts: ['sentiment_report', 'preference_summary'] },
        { id: 'dashboard', name: 'Dashboard & Delivery', agent: 'technical_ai_agent', tools: ['visualization_engine'], estimatedDuration: 2, dependencies: ['survey_analysis'], artifacts: ['satisfaction_dashboard'] },
        { id: 'execute', name: 'Execute Analysis', agent: 'business_agent', tools: ['business_templates', 'statistical_analyzer', 'visualization_engine'], estimatedDuration: 2, dependencies: ['dashboard'], artifacts: ['sentiment_report', 'preference_summary', 'satisfaction_dashboard'] }
      ]
    }),
    JourneyTemplateSchema.parse({
      id: 'engagement_satisfaction_analysis',
      journeyType: 'business',
      title: 'Engagement & Satisfaction Analysis',
      summary: 'Analyze engagement metrics to understand participation levels, satisfaction trends, and program effectiveness.',
      persona: 'business analyst',
      primaryAgent: 'business_agent',
      defaultConfidence: 0.9,
      expectedArtifacts: ['engagement_report', 'satisfaction_trends', 'dashboard'],
      communicationStyle: 'executive',
      steps: [
        { id: 'intake', name: 'Intake & Goal Alignment', agent: 'business_agent', tools: ['business_templates'], estimatedDuration: 2, artifacts: ['goal_brief'] },
        { id: 'data_prep', name: 'Data Preparation', agent: 'data_engineer', tools: ['data_transformer'], estimatedDuration: 3, dependencies: ['intake'], artifacts: ['data_quality_report'] },
        { id: 'engagement_analysis', name: 'Engagement Analysis', agent: 'technical_ai_agent', tools: ['statistical_analyzer'], estimatedDuration: 5, dependencies: ['data_prep'], artifacts: ['engagement_report', 'satisfaction_trends'] },
        { id: 'dashboard', name: 'Dashboard & Delivery', agent: 'technical_ai_agent', tools: ['visualization_engine'], estimatedDuration: 2, dependencies: ['engagement_analysis'], artifacts: ['dashboard'] },
        { id: 'execute', name: 'Execute Analysis', agent: 'business_agent', tools: ['business_templates', 'statistical_analyzer', 'visualization_engine'], estimatedDuration: 2, dependencies: ['dashboard'], artifacts: ['engagement_report', 'satisfaction_trends', 'dashboard'] }
      ]
    }),
    JourneyTemplateSchema.parse({
      id: 'workforce_planning_optimization',
      journeyType: 'business',
      title: 'Workforce Planning & Optimization',
      summary: 'Forecast hiring needs and optimize workforce allocation.',
      persona: 'hr analyst',
      primaryAgent: 'business_agent',
      defaultConfidence: 0.9,
      expectedArtifacts: ['workforce_plan', 'optimization_report', 'dashboard'],
      communicationStyle: 'executive',
      steps: [
        { id: 'intake', name: 'Intake & Goal Alignment', agent: 'business_agent', tools: ['business_templates'], estimatedDuration: 2, artifacts: ['goal_brief'] },
        { id: 'data_prep', name: 'Data Preparation', agent: 'data_engineer', tools: ['data_transformer'], estimatedDuration: 3, dependencies: ['intake'], artifacts: ['data_quality_report'] },
        { id: 'planning_analysis', name: 'Planning Analysis', agent: 'technical_ai_agent', tools: ['statistical_analyzer', 'comprehensive_ml_pipeline'], estimatedDuration: 5, dependencies: ['data_prep'], artifacts: ['workforce_plan', 'optimization_report'] },
        { id: 'dashboard', name: 'Dashboard & Delivery', agent: 'technical_ai_agent', tools: ['visualization_engine'], estimatedDuration: 2, dependencies: ['planning_analysis'], artifacts: ['dashboard'] },
        { id: 'execute', name: 'Execute Analysis', agent: 'business_agent', tools: ['business_templates', 'statistical_analyzer', 'visualization_engine'], estimatedDuration: 2, dependencies: ['dashboard'], artifacts: ['workforce_plan', 'optimization_report', 'dashboard'] }
      ]
    }),
    JourneyTemplateSchema.parse({
      id: 'recruitment_effectiveness_analysis',
      journeyType: 'business',
      title: 'Recruitment Effectiveness Analysis',
      summary: 'Analyze recruiting funnel performance and optimize hiring processes.',
      persona: 'hr analyst',
      primaryAgent: 'business_agent',
      defaultConfidence: 0.9,
      expectedArtifacts: ['recruitment_report', 'funnel_dashboard', 'dashboard'],
      communicationStyle: 'executive',
      steps: [
        { id: 'intake', name: 'Intake & Goal Alignment', agent: 'business_agent', tools: ['business_templates'], estimatedDuration: 2, artifacts: ['goal_brief'] },
        { id: 'data_prep', name: 'Data Preparation', agent: 'data_engineer', tools: ['data_transformer'], estimatedDuration: 3, dependencies: ['intake'], artifacts: ['data_quality_report'] },
        { id: 'recruitment_analysis', name: 'Recruitment Analysis', agent: 'technical_ai_agent', tools: ['statistical_analyzer', 'comprehensive_ml_pipeline'], estimatedDuration: 5, dependencies: ['data_prep'], artifacts: ['recruitment_report'] },
        { id: 'dashboard', name: 'Dashboard & Delivery', agent: 'technical_ai_agent', tools: ['visualization_engine'], estimatedDuration: 2, dependencies: ['recruitment_analysis'], artifacts: ['funnel_dashboard', 'dashboard'] },
        { id: 'execute', name: 'Execute Analysis', agent: 'business_agent', tools: ['business_templates', 'statistical_analyzer', 'visualization_engine'], estimatedDuration: 2, dependencies: ['dashboard'], artifacts: ['recruitment_report', 'funnel_dashboard', 'dashboard'] }
      ]
    }),
    JourneyTemplateSchema.parse({
      id: 'performance_management_analytics',
      journeyType: 'business',
      title: 'Performance Management Analytics',
      summary: 'Analyze employee performance trends and identify high performers.',
      persona: 'hr analyst',
      primaryAgent: 'business_agent',
      defaultConfidence: 0.9,
      expectedArtifacts: ['performance_report', 'high_performers_list', 'dashboard'],
      communicationStyle: 'executive',
      steps: [
        { id: 'intake', name: 'Intake & Goal Alignment', agent: 'business_agent', tools: ['business_templates'], estimatedDuration: 2, artifacts: ['goal_brief'] },
        { id: 'data_prep', name: 'Data Preparation', agent: 'data_engineer', tools: ['data_transformer'], estimatedDuration: 3, dependencies: ['intake'], artifacts: ['data_quality_report'] },
        { id: 'performance_analysis', name: 'Performance Analysis', agent: 'technical_ai_agent', tools: ['statistical_analyzer', 'comprehensive_ml_pipeline'], estimatedDuration: 5, dependencies: ['data_prep'], artifacts: ['performance_report', 'high_performers_list'] },
        { id: 'dashboard', name: 'Dashboard & Delivery', agent: 'technical_ai_agent', tools: ['visualization_engine'], estimatedDuration: 2, dependencies: ['performance_analysis'], artifacts: ['dashboard'] },
        { id: 'execute', name: 'Execute Analysis', agent: 'business_agent', tools: ['business_templates', 'statistical_analyzer', 'visualization_engine'], estimatedDuration: 2, dependencies: ['dashboard'], artifacts: ['performance_report', 'high_performers_list', 'dashboard'] }
      ]
    })
  ],
  technical: [technicalAdvancedTemplate],
  consultation: [consultationDefaultTemplate]
};

export function cloneJourneyTemplate(template: JourneyTemplate): JourneyTemplate {
  return JSON.parse(JSON.stringify(template));
}

export function cloneCatalog(
  catalog: JourneyTemplateCatalog = defaultJourneyTemplateCatalog
): JourneyTemplateCatalog {
  return {
    'non-tech': catalog['non-tech'].map(cloneJourneyTemplate),
    business: catalog.business.map(cloneJourneyTemplate),
    technical: catalog.technical.map(cloneJourneyTemplate),
    consultation: catalog.consultation.map(cloneJourneyTemplate)
  };
}
