/**
 * Business Template Integration
 *
 * Provides industry-specific analysis templates for common business use cases.
 * Templates map user goals to pre-configured analysis workflows.
 */

import { nanoid } from 'nanoid';

export type BusinessDomain = 'retail' | 'finance' | 'healthcare' | 'manufacturing' | 'technology' | 'marketing' | 'hr';
export type AnalysisGoal = 'increase_revenue' | 'reduce_costs' | 'customer_retention' | 'fraud_detection' | 'demand_forecasting' | 'talent_management' | 'employee_engagement' | 'workforce_optimization' | 'risk_management' | 'compliance' | 'performance_analysis';

export interface BusinessTemplate {
    templateId: string;
    name: string;
    description: string;
    domain: BusinessDomain;
    goals: AnalysisGoal[];
    workflow: TemplateWorkflowStep[];
    requiredDataFields: TemplateDataField[];
    visualizations: TemplateVisualization[];
    deliverables: TemplateDeliverable[];
    popularity: number;
    complexity: 'beginner' | 'intermediate' | 'advanced';
    tags: string[];
}

export interface TemplateWorkflowStep {
    stepId: string;
    name: string;
    component: 'data_ingestion' | 'transformation' | 'statistical_analysis' | 'ml_training' | 'visualization';
    config: Record<string, any>;
    checkpointQuestions: string[];
}

export interface TemplateDataField {
    fieldName: string;
    dataType: 'string' | 'number' | 'date' | 'boolean';
    description: string;
    example: string;
}

export interface TemplateVisualization {
    type: 'bar' | 'line' | 'scatter' | 'pie' | 'heatmap';
    title: string;
    xAxis: string;
    yAxis: string;
}

export interface TemplateDeliverable {
    name: string;
    type: 'report' | 'dashboard' | 'model';
    format: string[];
}

export class BusinessTemplateLibrary {
    private templates: Map<string, BusinessTemplate> = new Map();

    constructor() {
        this.initializeTemplates();
    }

    private initializeTemplates(): void {
        // Retail Customer Segmentation
        this.registerTemplate({
            templateId: 'retail_customer_segmentation',
            name: 'Customer Segmentation',
            description: 'Identify customer groups based on purchasing behavior',
            domain: 'retail',
            goals: ['customer_retention', 'increase_revenue'],
            workflow: [
                {
                    stepId: 'data_prep',
                    name: 'Prepare Customer Data',
                    component: 'transformation',
                    config: { normalization: { method: 'min-max' } },
                    checkpointQuestions: ['Review data quality metrics']
                },
                {
                    stepId: 'clustering',
                    name: 'Customer Clustering',
                    component: 'ml_training',
                    config: { algorithm: 'kmeans' },
                    checkpointQuestions: ['Review optimal number of clusters']
                }
            ],
            requiredDataFields: [
                { fieldName: 'customer_id', dataType: 'string', description: 'Unique customer identifier', example: 'CUST001' },
                { fieldName: 'purchase_amount', dataType: 'number', description: 'Total purchase value', example: '149.99' }
            ],
            visualizations: [
                { type: 'pie', title: 'Customer Segment Distribution', xAxis: 'segment', yAxis: 'count' },
                { type: 'bar', title: 'Revenue by Segment', xAxis: 'segment', yAxis: 'revenue' }
            ],
            deliverables: [
                { name: 'Customer Segment Profiles', type: 'report', format: ['PDF'] },
                { name: 'Segmentation Dashboard', type: 'dashboard', format: ['Web'] }
            ],
            popularity: 95,
            complexity: 'intermediate',
            tags: ['retail', 'customers', 'segmentation']
        });

        // Finance Fraud Detection
        this.registerTemplate({
            templateId: 'finance_fraud_detection',
            name: 'Fraud Detection',
            description: 'Identify fraudulent transactions using ML',
            domain: 'finance',
            goals: ['fraud_detection'],
            workflow: [
                {
                    stepId: 'feature_engineering',
                    name: 'Transaction Feature Engineering',
                    component: 'transformation',
                    config: {},
                    checkpointQuestions: ['Review engineered features']
                },
                {
                    stepId: 'anomaly_detection',
                    name: 'Anomaly Detection',
                    component: 'ml_training',
                    config: { algorithm: 'isolation_forest' },
                    checkpointQuestions: ['Review anomaly threshold']
                }
            ],
            requiredDataFields: [
                { fieldName: 'transaction_id', dataType: 'string', description: 'Transaction ID', example: 'TXN001' },
                { fieldName: 'amount', dataType: 'number', description: 'Transaction amount', example: '1250.00' }
            ],
            visualizations: [
                { type: 'scatter', title: 'Anomaly Scores', xAxis: 'timestamp', yAxis: 'anomaly_score' }
            ],
            deliverables: [
                { name: 'Fraud Detection Model', type: 'model', format: ['joblib'] }
            ],
            popularity: 90,
            complexity: 'advanced',
            tags: ['finance', 'fraud', 'anomaly']
        });

        // ==========================================
        // FINANCIAL INDUSTRY TEMPLATES
        // ==========================================

        // Credit Risk Assessment
        this.registerTemplate({
            templateId: 'finance_credit_risk',
            name: 'Credit Risk Assessment',
            description: 'Evaluate borrower creditworthiness and default probability using ML',
            domain: 'finance',
            goals: ['risk_management', 'reduce_costs'],
            workflow: [
                {
                    stepId: 'data_prep',
                    name: 'Credit Data Preparation',
                    component: 'transformation',
                    config: {
                        imputation: { strategy: 'median' },
                        outliers: { method: 'iqr', action: 'cap' },
                        encoding: { method: 'one-hot', columns: ['employment_type', 'loan_purpose'] }
                    },
                    checkpointQuestions: ['Review credit history completeness', 'Confirm feature engineering approach']
                },
                {
                    stepId: 'risk_scoring',
                    name: 'Risk Score Calculation',
                    component: 'statistical_analysis',
                    config: { analysisType: 'logistic_regression' },
                    checkpointQuestions: ['Review risk factors and weights']
                },
                {
                    stepId: 'default_prediction',
                    name: 'Default Prediction Model',
                    component: 'ml_training',
                    config: { algorithm: 'gradient_boosting', targetColumn: 'default_flag' },
                    checkpointQuestions: ['Review model performance metrics', 'Approve risk thresholds']
                },
                {
                    stepId: 'risk_visualization',
                    name: 'Risk Visualization',
                    component: 'visualization',
                    config: { charts: ['roc_curve', 'confusion_matrix', 'feature_importance'] },
                    checkpointQuestions: ['Review risk distribution visualizations']
                }
            ],
            requiredDataFields: [
                { fieldName: 'applicant_id', dataType: 'string', description: 'Unique applicant identifier', example: 'APP12345' },
                { fieldName: 'credit_score', dataType: 'number', description: 'Credit score', example: '720' },
                { fieldName: 'annual_income', dataType: 'number', description: 'Annual income', example: '75000' },
                { fieldName: 'debt_to_income', dataType: 'number', description: 'Debt-to-income ratio', example: '0.35' },
                { fieldName: 'employment_length', dataType: 'number', description: 'Years employed', example: '5' },
                { fieldName: 'loan_amount', dataType: 'number', description: 'Requested loan amount', example: '25000' }
            ],
            visualizations: [
                { type: 'bar', title: 'Risk Score Distribution', xAxis: 'risk_category', yAxis: 'count' },
                { type: 'scatter', title: 'Income vs Default Rate', xAxis: 'annual_income', yAxis: 'default_probability' },
                { type: 'heatmap', title: 'Credit Factor Correlation', xAxis: 'factor', yAxis: 'correlation' }
            ],
            deliverables: [
                { name: 'Credit Risk Model', type: 'model', format: ['joblib', 'PMML'] },
                { name: 'Risk Assessment Report', type: 'report', format: ['PDF'] },
                { name: 'Real-time Scoring Dashboard', type: 'dashboard', format: ['Web'] }
            ],
            popularity: 93,
            complexity: 'advanced',
            tags: ['finance', 'credit', 'risk', 'lending', 'default']
        });

        // Portfolio Optimization
        this.registerTemplate({
            templateId: 'finance_portfolio_optimization',
            name: 'Portfolio Optimization',
            description: 'Optimize investment portfolio allocation using Modern Portfolio Theory',
            domain: 'finance',
            goals: ['increase_revenue', 'risk_management'],
            workflow: [
                {
                    stepId: 'asset_analysis',
                    name: 'Asset Performance Analysis',
                    component: 'statistical_analysis',
                    config: { analysisType: 'timeseries' },
                    checkpointQuestions: ['Review historical return distributions']
                },
                {
                    stepId: 'correlation_analysis',
                    name: 'Correlation and Covariance',
                    component: 'statistical_analysis',
                    config: { analysisType: 'correlation' },
                    checkpointQuestions: ['Review asset correlation matrix']
                },
                {
                    stepId: 'optimization',
                    name: 'Portfolio Optimization',
                    component: 'ml_training',
                    config: { algorithm: 'mean_variance_optimization' },
                    checkpointQuestions: ['Set risk tolerance level', 'Approve optimal allocation']
                }
            ],
            requiredDataFields: [
                { fieldName: 'asset_id', dataType: 'string', description: 'Asset ticker symbol', example: 'AAPL' },
                { fieldName: 'date', dataType: 'date', description: 'Trading date', example: '2024-01-15' },
                { fieldName: 'closing_price', dataType: 'number', description: 'Daily closing price', example: '182.45' },
                { fieldName: 'returns', dataType: 'number', description: 'Daily returns', example: '0.015' }
            ],
            visualizations: [
                { type: 'line', title: 'Efficient Frontier', xAxis: 'risk', yAxis: 'return' },
                { type: 'pie', title: 'Optimal Portfolio Allocation', xAxis: 'asset', yAxis: 'weight' },
                { type: 'heatmap', title: 'Asset Correlation Matrix', xAxis: 'asset1', yAxis: 'asset2' }
            ],
            deliverables: [
                { name: 'Portfolio Optimization Report', type: 'report', format: ['PDF'] },
                { name: 'Allocation Strategy', type: 'report', format: ['Excel', 'PDF'] }
            ],
            popularity: 85,
            complexity: 'advanced',
            tags: ['finance', 'portfolio', 'investment', 'optimization', 'risk']
        });

        // Financial Forecasting
        this.registerTemplate({
            templateId: 'finance_forecasting',
            name: 'Financial Forecasting',
            description: 'Forecast revenue, expenses, and cash flow using time series models',
            domain: 'finance',
            goals: ['increase_revenue', 'reduce_costs', 'performance_analysis'],
            workflow: [
                {
                    stepId: 'historical_analysis',
                    name: 'Historical Trend Analysis',
                    component: 'statistical_analysis',
                    config: { analysisType: 'timeseries_decomposition' },
                    checkpointQuestions: ['Review seasonal patterns', 'Identify trend components']
                },
                {
                    stepId: 'forecasting',
                    name: 'Financial Forecasting',
                    component: 'ml_training',
                    config: { algorithm: 'prophet', forecast_periods: 12 },
                    checkpointQuestions: ['Review forecast confidence intervals', 'Approve forecast methodology']
                }
            ],
            requiredDataFields: [
                { fieldName: 'date', dataType: 'date', description: 'Period date', example: '2024-01-01' },
                { fieldName: 'revenue', dataType: 'number', description: 'Revenue amount', example: '125000' }
            ],
            visualizations: [
                { type: 'line', title: 'Revenue Forecast', xAxis: 'date', yAxis: 'revenue' },
                { type: 'bar', title: 'Forecast Accuracy', xAxis: 'period', yAxis: 'mape' }
            ],
            deliverables: [
                { name: 'Financial Forecast Report', type: 'report', format: ['PDF', 'Excel'] },
                { name: 'Forecast Model', type: 'model', format: ['joblib'] }
            ],
            popularity: 88,
            complexity: 'intermediate',
            tags: ['finance', 'forecasting', 'revenue', 'planning']
        });

        // Anti-Money Laundering (AML)
        this.registerTemplate({
            templateId: 'finance_aml',
            name: 'Anti-Money Laundering Detection',
            description: 'Detect suspicious transaction patterns for AML compliance',
            domain: 'finance',
            goals: ['compliance', 'risk_management', 'fraud_detection'],
            workflow: [
                {
                    stepId: 'transaction_profiling',
                    name: 'Transaction Pattern Profiling',
                    component: 'transformation',
                    config: { featureEngineering: { interactions: [['amount', 'frequency'], ['location', 'time']] } },
                    checkpointQuestions: ['Review suspicious transaction indicators']
                },
                {
                    stepId: 'aml_detection',
                    name: 'AML Risk Scoring',
                    component: 'ml_training',
                    config: { algorithm: 'random_forest', targetColumn: 'suspicious_flag' },
                    checkpointQuestions: ['Set alert thresholds', 'Review false positive rate']
                }
            ],
            requiredDataFields: [
                { fieldName: 'transaction_id', dataType: 'string', description: 'Transaction ID', example: 'TXN98765' },
                { fieldName: 'account_id', dataType: 'string', description: 'Account ID', example: 'ACC12345' },
                { fieldName: 'amount', dataType: 'number', description: 'Transaction amount', example: '15000' },
                { fieldName: 'timestamp', dataType: 'date', description: 'Transaction timestamp', example: '2024-01-15 14:30:00' }
            ],
            visualizations: [
                { type: 'scatter', title: 'Suspicious Activity Map', xAxis: 'amount', yAxis: 'frequency' },
                { type: 'bar', title: 'Alert Distribution', xAxis: 'risk_level', yAxis: 'count' }
            ],
            deliverables: [
                { name: 'AML Compliance Report', type: 'report', format: ['PDF'] },
                { name: 'Real-time Alert Dashboard', type: 'dashboard', format: ['Web'] }
            ],
            popularity: 87,
            complexity: 'advanced',
            tags: ['finance', 'aml', 'compliance', 'fraud']
        });

        // ==========================================
        // HR INDUSTRY TEMPLATES
        // ==========================================

        // Employee Attrition Prediction
        this.registerTemplate({
            templateId: 'hr_attrition_prediction',
            name: 'Employee Attrition Prediction',
            description: 'Predict which employees are at risk of leaving and identify retention strategies',
            domain: 'hr',
            goals: ['talent_management', 'reduce_costs', 'employee_engagement'],
            workflow: [
                {
                    stepId: 'employee_data_prep',
                    name: 'Employee Data Preparation',
                    component: 'transformation',
                    config: {
                        imputation: { strategy: 'mode' },
                        encoding: { method: 'one-hot', columns: ['department', 'job_role', 'education_level'] },
                        normalization: { method: 'min-max' }
                    },
                    checkpointQuestions: ['Review employee data quality', 'Confirm sensitive data handling']
                },
                {
                    stepId: 'risk_factor_analysis',
                    name: 'Attrition Risk Factor Analysis',
                    component: 'statistical_analysis',
                    config: { analysisType: 'correlation' },
                    checkpointQuestions: ['Review key attrition drivers']
                },
                {
                    stepId: 'attrition_model',
                    name: 'Attrition Prediction Model',
                    component: 'ml_training',
                    config: { algorithm: 'random_forest', targetColumn: 'attrition_flag' },
                    checkpointQuestions: ['Review prediction accuracy', 'Approve intervention thresholds']
                },
                {
                    stepId: 'retention_strategies',
                    name: 'Personalized Retention Strategies',
                    component: 'visualization',
                    config: { charts: ['feature_importance', 'risk_segmentation'] },
                    checkpointQuestions: ['Review recommended retention actions']
                }
            ],
            requiredDataFields: [
                { fieldName: 'employee_id', dataType: 'string', description: 'Unique employee identifier', example: 'EMP12345' },
                { fieldName: 'tenure_months', dataType: 'number', description: 'Months employed', example: '36' },
                { fieldName: 'satisfaction_score', dataType: 'number', description: 'Job satisfaction (1-5)', example: '3.5' },
                { fieldName: 'performance_rating', dataType: 'number', description: 'Performance rating (1-5)', example: '4.2' },
                { fieldName: 'salary', dataType: 'number', description: 'Annual salary', example: '65000' },
                { fieldName: 'department', dataType: 'string', description: 'Department name', example: 'Engineering' }
            ],
            visualizations: [
                { type: 'bar', title: 'Attrition Risk Distribution', xAxis: 'risk_level', yAxis: 'employee_count' },
                { type: 'scatter', title: 'Satisfaction vs Tenure', xAxis: 'tenure_months', yAxis: 'satisfaction_score' },
                { type: 'heatmap', title: 'Attrition Factors by Department', xAxis: 'department', yAxis: 'factor' }
            ],
            deliverables: [
                { name: 'Attrition Risk Report', type: 'report', format: ['PDF'] },
                { name: 'Retention Action Plan', type: 'report', format: ['PDF', 'Excel'] },
                { name: 'Employee Risk Dashboard', type: 'dashboard', format: ['Web'] }
            ],
            popularity: 92,
            complexity: 'intermediate',
            tags: ['hr', 'attrition', 'retention', 'turnover', 'talent']
        });

        // Compensation Analysis
        this.registerTemplate({
            templateId: 'hr_compensation_analysis',
            name: 'Compensation Equity Analysis',
            description: 'Analyze pay equity across demographics and identify compensation gaps',
            domain: 'hr',
            goals: ['compliance', 'employee_engagement', 'talent_management'],
            workflow: [
                {
                    stepId: 'compensation_data_prep',
                    name: 'Compensation Data Preparation',
                    component: 'transformation',
                    config: { normalization: { method: 'z-score' } },
                    checkpointQuestions: ['Confirm data anonymization', 'Review compensation structure']
                },
                {
                    stepId: 'equity_analysis',
                    name: 'Pay Equity Statistical Analysis',
                    component: 'statistical_analysis',
                    config: { analysisType: 'regression' },
                    checkpointQuestions: ['Review compensation gaps', 'Identify equity issues']
                },
                {
                    stepId: 'market_comparison',
                    name: 'Market Competitiveness Analysis',
                    component: 'statistical_analysis',
                    config: { analysisType: 'comparative' },
                    checkpointQuestions: ['Review market benchmarks']
                }
            ],
            requiredDataFields: [
                { fieldName: 'employee_id', dataType: 'string', description: 'Employee ID (anonymized)', example: 'EMP_XXX' },
                { fieldName: 'job_level', dataType: 'string', description: 'Job level', example: 'Senior' },
                { fieldName: 'years_experience', dataType: 'number', description: 'Years of experience', example: '8' },
                { fieldName: 'salary', dataType: 'number', description: 'Annual salary', example: '95000' },
                { fieldName: 'performance_rating', dataType: 'number', description: 'Latest performance rating', example: '4.0' }
            ],
            visualizations: [
                { type: 'bar', title: 'Compensation by Level', xAxis: 'job_level', yAxis: 'avg_salary' },
                { type: 'scatter', title: 'Experience vs Compensation', xAxis: 'years_experience', yAxis: 'salary' },
                { type: 'bar', title: 'Pay Equity Gaps', xAxis: 'demographic_group', yAxis: 'gap_percentage' }
            ],
            deliverables: [
                { name: 'Pay Equity Report', type: 'report', format: ['PDF'] },
                { name: 'Compensation Recommendations', type: 'report', format: ['PDF', 'Excel'] }
            ],
            popularity: 85,
            complexity: 'intermediate',
            tags: ['hr', 'compensation', 'equity', 'pay', 'compliance']
        });

        // Workforce Planning
        this.registerTemplate({
            templateId: 'hr_workforce_planning',
            name: 'Workforce Planning & Optimization',
            description: 'Forecast hiring needs and optimize workforce allocation',
            domain: 'hr',
            goals: ['workforce_optimization', 'reduce_costs', 'performance_analysis'],
            workflow: [
                {
                    stepId: 'demand_forecasting',
                    name: 'Workforce Demand Forecasting',
                    component: 'ml_training',
                    config: { algorithm: 'prophet', forecast_periods: 12 },
                    checkpointQuestions: ['Review hiring demand forecast']
                },
                {
                    stepId: 'skills_gap_analysis',
                    name: 'Skills Gap Analysis',
                    component: 'statistical_analysis',
                    config: { analysisType: 'gap_analysis' },
                    checkpointQuestions: ['Review critical skill gaps']
                },
                {
                    stepId: 'allocation_optimization',
                    name: 'Workforce Allocation',
                    component: 'ml_training',
                    config: { algorithm: 'optimization' },
                    checkpointQuestions: ['Approve allocation strategy']
                }
            ],
            requiredDataFields: [
                { fieldName: 'department', dataType: 'string', description: 'Department name', example: 'Engineering' },
                { fieldName: 'headcount', dataType: 'number', description: 'Current headcount', example: '50' },
                { fieldName: 'date', dataType: 'date', description: 'Planning period', example: '2024-01-01' }
            ],
            visualizations: [
                { type: 'line', title: 'Headcount Forecast', xAxis: 'date', yAxis: 'headcount' },
                { type: 'bar', title: 'Skills Gap by Department', xAxis: 'department', yAxis: 'gap_severity' }
            ],
            deliverables: [
                { name: 'Workforce Planning Report', type: 'report', format: ['PDF'] },
                { name: 'Hiring Plan', type: 'report', format: ['Excel'] }
            ],
            popularity: 80,
            complexity: 'advanced',
            tags: ['hr', 'workforce', 'planning', 'hiring', 'optimization']
        });

        // Recruitment Analytics
        this.registerTemplate({
            templateId: 'hr_recruitment_analytics',
            name: 'Recruitment Effectiveness Analysis',
            description: 'Analyze recruiting funnel performance and optimize hiring processes',
            domain: 'hr',
            goals: ['talent_management', 'reduce_costs', 'performance_analysis'],
            workflow: [
                {
                    stepId: 'funnel_analysis',
                    name: 'Recruitment Funnel Analysis',
                    component: 'statistical_analysis',
                    config: { analysisType: 'funnel_conversion' },
                    checkpointQuestions: ['Review conversion rates at each stage']
                },
                {
                    stepId: 'source_effectiveness',
                    name: 'Recruitment Source Analysis',
                    component: 'statistical_analysis',
                    config: { analysisType: 'comparative' },
                    checkpointQuestions: ['Identify most effective recruitment channels']
                },
                {
                    stepId: 'time_to_hire',
                    name: 'Time-to-Hire Optimization',
                    component: 'statistical_analysis',
                    config: { analysisType: 'process_mining' },
                    checkpointQuestions: ['Review hiring timeline bottlenecks']
                }
            ],
            requiredDataFields: [
                { fieldName: 'candidate_id', dataType: 'string', description: 'Candidate ID', example: 'CAND12345' },
                { fieldName: 'application_date', dataType: 'date', description: 'Application date', example: '2024-01-01' },
                { fieldName: 'source', dataType: 'string', description: 'Recruitment source', example: 'LinkedIn' },
                { fieldName: 'stage', dataType: 'string', description: 'Current stage', example: 'Interview' },
                { fieldName: 'outcome', dataType: 'string', description: 'Final outcome', example: 'Hired' }
            ],
            visualizations: [
                { type: 'bar', title: 'Conversion Rates by Stage', xAxis: 'stage', yAxis: 'conversion_rate' },
                { type: 'pie', title: 'Hires by Source', xAxis: 'source', yAxis: 'count' },
                { type: 'line', title: 'Time-to-Hire Trend', xAxis: 'month', yAxis: 'avg_days' }
            ],
            deliverables: [
                { name: 'Recruitment Analytics Report', type: 'report', format: ['PDF'] },
                { name: 'Hiring Process Optimization Plan', type: 'report', format: ['PDF'] }
            ],
            popularity: 78,
            complexity: 'beginner',
            tags: ['hr', 'recruitment', 'hiring', 'talent', 'analytics']
        });

        // Performance Management
        this.registerTemplate({
            templateId: 'hr_performance_management',
            name: 'Performance Management Analytics',
            description: 'Analyze employee performance trends and identify high performers',
            domain: 'hr',
            goals: ['performance_analysis', 'talent_management', 'employee_engagement'],
            workflow: [
                {
                    stepId: 'performance_trends',
                    name: 'Performance Trend Analysis',
                    component: 'statistical_analysis',
                    config: { analysisType: 'timeseries' },
                    checkpointQuestions: ['Review performance distributions']
                },
                {
                    stepId: 'high_performer_identification',
                    name: 'High Performer Segmentation',
                    component: 'ml_training',
                    config: { algorithm: 'kmeans', features: ['performance_rating', 'goal_achievement', 'peer_feedback'] },
                    checkpointQuestions: ['Review high performer profiles']
                },
                {
                    stepId: 'performance_predictors',
                    name: 'Performance Driver Analysis',
                    component: 'statistical_analysis',
                    config: { analysisType: 'regression' },
                    checkpointQuestions: ['Identify key performance drivers']
                }
            ],
            requiredDataFields: [
                { fieldName: 'employee_id', dataType: 'string', description: 'Employee ID', example: 'EMP12345' },
                { fieldName: 'review_period', dataType: 'date', description: 'Review period', example: '2024-Q1' },
                { fieldName: 'performance_rating', dataType: 'number', description: 'Performance rating (1-5)', example: '4.5' },
                { fieldName: 'goal_achievement', dataType: 'number', description: 'Goal achievement %', example: '95' }
            ],
            visualizations: [
                { type: 'bar', title: 'Performance Distribution', xAxis: 'rating', yAxis: 'count' },
                { type: 'scatter', title: 'Performance vs Tenure', xAxis: 'tenure', yAxis: 'rating' },
                { type: 'heatmap', title: 'Performance Factors', xAxis: 'factor', yAxis: 'correlation' }
            ],
            deliverables: [
                { name: 'Performance Analytics Report', type: 'report', format: ['PDF'] },
                { name: 'Talent Development Plan', type: 'report', format: ['PDF'] }
            ],
            popularity: 83,
            complexity: 'intermediate',
            tags: ['hr', 'performance', 'talent', 'development', 'management']
        });

        console.log(`Initialized ${this.templates.size} business templates`);
    }

    registerTemplate(template: BusinessTemplate): void {
        this.templates.set(template.templateId, template);
    }

    getTemplate(templateId: string): BusinessTemplate | undefined {
        return this.templates.get(templateId);
    }

    getAllTemplates(): BusinessTemplate[] {
        return Array.from(this.templates.values());
    }

    getTemplatesByDomain(domain: BusinessDomain): BusinessTemplate[] {
        return this.getAllTemplates().filter(t => t.domain === domain);
    }

    getTemplatesByGoal(goal: AnalysisGoal): BusinessTemplate[] {
        return this.getAllTemplates().filter(t => t.goals.includes(goal));
    }

    getRecommendedTemplates(userGoals: AnalysisGoal[], domain?: BusinessDomain): BusinessTemplate[] {
        let filtered = this.getAllTemplates();

        if (userGoals.length > 0) {
            filtered = filtered.filter(t => t.goals.some(goal => userGoals.includes(goal)));
        }

        if (domain) {
            filtered = filtered.filter(t => t.domain === domain);
        }

        return filtered.sort((a, b) => b.popularity - a.popularity);
    }
}

export const businessTemplateLibrary = new BusinessTemplateLibrary();

// Namespace export for compatibility with enhanced-mcp-service.ts
export const BusinessTemplates = {
    list: () => businessTemplateLibrary.getAllTemplates(),
    matchByUseCase: (useCase: string) => {
        const templates = businessTemplateLibrary.getAllTemplates();
        // Simple matching based on tags or name
        return templates.find(t =>
            t.tags.some(tag => useCase.toLowerCase().includes(tag.toLowerCase())) ||
            t.name.toLowerCase().includes(useCase.toLowerCase())
        );
    },
    getTemplate: (id: string) => businessTemplateLibrary.getTemplate(id),
    getByDomain: (domain: BusinessDomain) => businessTemplateLibrary.getTemplatesByDomain(domain),
    getByGoal: (goal: AnalysisGoal) => businessTemplateLibrary.getTemplatesByGoal(goal),
    getRecommended: (goals: AnalysisGoal[], domain?: BusinessDomain) =>
        businessTemplateLibrary.getRecommendedTemplates(goals, domain)
};
