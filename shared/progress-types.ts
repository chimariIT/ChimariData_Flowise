export interface ExecutionProgress {
    step: string;
    stepIndex: number;
    totalSteps: number;
    progress: number;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    currentOperation?: string;
    eta?: string;
    startedAt?: string;
    completedAt?: string;
    error?: string;
}

export interface ExecutionStep {
    id: string;
    name: string;
    description: string;
    estimatedDuration?: number;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startedAt?: string;
    completedAt?: string;
    progress?: number;
    operations?: StepOperation[];
    error?: string;
}

export interface StepOperation {
    name: string;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    timestamp?: string;
    duration?: number;
}

export interface AnalysisExecutionState {
    executionId: string;
    projectId: string;
    analysisTypes: string[];
    overallProgress: number;
    currentStep: ExecutionStep;
    completedSteps: ExecutionStep[];
    pendingSteps: ExecutionStep[];
    totalSteps: number;
    startedAt: string;
    estimatedCompletionAt?: string;
    status: 'idle' | 'initializing' | 'running' | 'completed' | 'failed' | 'cancelled';
    error?: string;
}

export const COMMON_OPERATIONS = {
    DATA_LOADING: { name: 'Data Loading', description: 'Loading dataset from storage' },
    SCHEMA_DETECTION: { name: 'Schema Detection', description: 'Analyzing data structure and types' },
    DATA_VALIDATION: { name: 'Data Validation', description: 'Checking data quality and completeness' },
    MISSING_VALUE_HANDLING: { name: 'Missing Value Handling', description: 'Processing missing or null values' },
    CATEGORICAL_ENCODING: { name: 'Categorical Encoding', description: 'Converting categorical variables to numerical' },
    FEATURE_SCALING: { name: 'Feature Scaling', description: 'Normalizing numerical features' },
    TRAIN_TEST_SPLIT: { name: 'Train/Test Split', description: 'Splitting data for model validation' },
    MODEL_TRAINING: { name: 'Model Training', description: 'Training machine learning model' },
    HYPERPARAMETER_TUNING: { name: 'Hyperparameter Tuning', description: 'Optimizing model parameters with AutoML' },
    CROSS_VALIDATION: { name: 'Cross Validation', description: 'Validating model performance' },
    MODEL_EVALUATION: { name: 'Model Evaluation', description: 'Computing evaluation metrics' },
    EXPLAINABILITY_GENERATION: { name: 'Explainability', description: 'Generating SHAP and LIME explanations' },
    VISUALIZATION_CREATION: { name: 'Visualization', description: 'Creating charts and graphs' },
    INSIGHT_GENERATION: { name: 'Insight Generation', description: 'Extracting actionable insights' },
    REPORT_GENERATION: { name: 'Report Generation', description: 'Compiling final report' }
} as const;

export const ANALYSIS_EXECUTION_STEPS = {
    classification: [
        { id: 'data_prep', name: 'Data Preparation', operations: ['DATA_LOADING', 'SCHEMA_DETECTION', 'DATA_VALIDATION', 'MISSING_VALUE_HANDLING', 'CATEGORICAL_ENCODING'] },
        { id: 'feature_eng', name: 'Feature Engineering', operations: ['FEATURE_SCALING', 'TRAIN_TEST_SPLIT'] },
        { id: 'training', name: 'Model Training', operations: ['MODEL_TRAINING', 'HYPERPARAMETER_TUNING'] },
        { id: 'validation', name: 'Model Validation', operations: ['CROSS_VALIDATION', 'MODEL_EVALUATION'] },
        { id: 'insights', name: 'Insights and Reporting', operations: ['EXPLAINABILITY_GENERATION', 'VISUALIZATION_CREATION', 'INSIGHT_GENERATION', 'REPORT_GENERATION'] }
    ],
    regression: [
        { id: 'data_prep', name: 'Data Preparation', operations: ['DATA_LOADING', 'SCHEMA_DETECTION', 'DATA_VALIDATION', 'MISSING_VALUE_HANDLING'] },
        { id: 'feature_eng', name: 'Feature Engineering', operations: ['FEATURE_SCALING', 'TRAIN_TEST_SPLIT'] },
        { id: 'training', name: 'Model Training', operations: ['MODEL_TRAINING', 'HYPERPARAMETER_TUNING'] },
        { id: 'validation', name: 'Model Validation', operations: ['CROSS_VALIDATION', 'MODEL_EVALUATION'] },
        { id: 'insights', name: 'Insights and Reporting', operations: ['EXPLAINABILITY_GENERATION', 'VISUALIZATION_CREATION', 'INSIGHT_GENERATION', 'REPORT_GENERATION'] }
    ],
    descriptive: [
        { id: 'data_prep', name: 'Data Preparation', operations: ['DATA_LOADING', 'SCHEMA_DETECTION', 'DATA_VALIDATION'] },
        { id: 'analysis', name: 'Statistical Analysis', operations: ['MODEL_TRAINING'] },
        { id: 'insights', name: 'Insights and Reporting', operations: ['VISUALIZATION_CREATION', 'INSIGHT_GENERATION', 'REPORT_GENERATION'] }
    ],
    correlation: [
        { id: 'data_prep', name: 'Data Preparation', operations: ['DATA_LOADING', 'SCHEMA_DETECTION', 'DATA_VALIDATION'] },
        { id: 'analysis', name: 'Correlation Analysis', operations: ['MODEL_TRAINING'] },
        { id: 'insights', name: 'Insights and Reporting', operations: ['VISUALIZATION_CREATION', 'INSIGHT_GENERATION', 'REPORT_GENERATION'] }
    ],
    timeseries: [
        { id: 'data_prep', name: 'Data Preparation', operations: ['DATA_LOADING', 'SCHEMA_DETECTION', 'DATA_VALIDATION'] },
        { id: 'decomposition', name: 'Time Series Decomposition', operations: ['MODEL_TRAINING'] },
        { id: 'forecasting', name: 'Forecasting', operations: ['MODEL_TRAINING', 'MODEL_EVALUATION'] },
        { id: 'insights', name: 'Insights and Reporting', operations: ['VISUALIZATION_CREATION', 'INSIGHT_GENERATION', 'REPORT_GENERATION'] }
    ],
    clustering: [
        { id: 'data_prep', name: 'Data Preparation', operations: ['DATA_LOADING', 'SCHEMA_DETECTION', 'DATA_VALIDATION', 'FEATURE_SCALING'] },
        { id: 'clustering', name: 'Cluster Analysis', operations: ['MODEL_TRAINING', 'HYPERPARAMETER_TUNING'] },
        { id: 'validation', name: 'Cluster Validation', operations: ['MODEL_EVALUATION'] },
        { id: 'insights', name: 'Insights and Reporting', operations: ['VISUALIZATION_CREATION', 'INSIGHT_GENERATION', 'REPORT_GENERATION'] }
    ]
} as const;

export type AnalysisType = keyof typeof ANALYSIS_EXECUTION_STEPS;
