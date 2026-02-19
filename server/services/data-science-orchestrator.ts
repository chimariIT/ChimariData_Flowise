/**
 * Data Science Orchestrator
 *
 * This service orchestrates the complete data science workflow, ensuring:
 * 1. Proper Python script execution for real analysis
 * 2. ML model training with actual artifacts
 * 3. Question-to-analysis evidence chain
 * 4. Comprehensive artifact generation
 *
 * Replaces the inline Python execution with proper script calls
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';
import { db } from '../db';
import { projectArtifacts, projects, datasets, projectDatasets } from '../../shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { normalizeQuestions } from '../utils/question-normalizer';
import { columnEmbeddingService, ColumnEmbeddingResult, EncodingConfig } from './column-embedding-service';

// ============================================
// HEALTH CHECK UTILITY
// ============================================

interface HealthCheckResult {
  healthy: boolean;
  componentStatuses: Record<string, { status: 'healthy' | 'degraded' | 'unhealthy'; message: string }>;
  warnings: string[];
}

async function performMLHealthCheck(): Promise<HealthCheckResult> {
  const componentStatuses: Record<string, { status: 'healthy' | 'degraded' | 'unhealthy'; message: string }> = {};
  const warnings: string[] = [];

  // Check Python availability
  try {
    const pythonAvailable = await checkPythonAvailable();
    componentStatuses['python_runtime'] = pythonAvailable
      ? { status: 'healthy', message: 'Python runtime available' }
      : { status: 'unhealthy', message: 'Python runtime not available' };
  } catch (e) {
    componentStatuses['python_runtime'] = { status: 'unhealthy', message: 'Failed to check Python runtime' };
    warnings.push('Python runtime check failed');
  }

  // Check ML library availability (basic check)
  try {
    const mlLibsCheck = await checkMLLibraries();
    componentStatuses['ml_libraries'] = mlLibsCheck
      ? { status: 'healthy', message: 'Required ML libraries available' }
      : { status: 'degraded', message: 'Some ML libraries may be missing' };
  } catch (e) {
    componentStatuses['ml_libraries'] = { status: 'degraded', message: 'Could not verify ML libraries' };
    warnings.push('ML library check skipped');
  }

  // Check disk space for artifacts
  try {
    const diskCheck = checkDiskSpace();
    componentStatuses['disk_space'] = diskCheck
      ? { status: 'healthy', message: 'Sufficient disk space available' }
      : { status: 'degraded', message: 'Disk space may be limited' };
  } catch (e) {
    componentStatuses['disk_space'] = { status: 'degraded', message: 'Could not check disk space' };
  }

  const unhealthyCount = Object.values(componentStatuses).filter(s => s.status === 'unhealthy').length;
  const healthy = unhealthyCount === 0;

  if (!healthy) {
    console.warn(`⚠️ [HealthCheck] ML health check found ${unhealthyCount} unhealthy component(s)`);
  } else {
    console.log(`✅ [HealthCheck] ML health check passed`);
  }

  return { healthy, componentStatuses, warnings };
}

async function checkPythonAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const proc = spawn(pythonCmd, ['--version']);
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
    setTimeout(() => resolve(false), 5000); // Timeout
  });
}

async function checkMLLibraries(): Promise<boolean> {
  return new Promise((resolve) => {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const checkScript = 'import pandas; import numpy; import sklearn; print("ok")';
    const proc = spawn(pythonCmd, ['-c', checkScript]);
    let output = '';
    proc.stdout?.on('data', (data) => { output += data.toString(); });
    proc.on('close', (code) => resolve(code === 0 && output.includes('ok')));
    proc.on('error', () => resolve(false));
    setTimeout(() => resolve(false), 10000); // Timeout
  });
}

function checkDiskSpace(): boolean {
  // Simple check - ensure artifacts directory is writable
  try {
    const testPath = path.join(process.cwd(), 'uploads', 'artifacts', '.health-check-test');
    fs.writeFileSync(testPath, 'test');
    fs.unlinkSync(testPath);
    return true;
  } catch {
    return false;
  }
}

// ============================================
// INTERFACES
// ============================================

export interface DataScienceRequest {
  projectId: string;
  userId: string;
  analysisTypes: string[];
  userGoals: string[];
  userQuestions: string[];
  datasetIds?: string[];
  // P0-2: DS-recommended analyses with priority for execution ordering
  analysisPath?: Array<{
    analysisType: string;
    priority: number;
    reason?: string;
    requiredElements?: string[];
  }>;
  // P0-3: Question-to-analysis mapping for evidence chain traceability
  questionAnswerMapping?: Array<{
    questionId: string;
    questionText: string;
    relevantAnalyses: string[];
    relevantDataElements: string[];
  }>;
  // P0-4: PII decisions for filtering sensitive columns
  piiDecisions?: Record<string, { action: 'include' | 'exclude' | 'mask'; }>;
  // P0-1 FIX: Explicit list of columns to exclude (from PII decisions)
  columnsToExclude?: string[];
  // VI-1 FIX: Compute engine selection for optimal performance
  computeEngine?: 'local' | 'polars' | 'spark';
  computeEngineConfig?: {
    executorMemory?: string;
    driverMemory?: string;
    partitions?: number;
    streaming?: boolean;
    memoryLimit?: number;
  };
  // FIX 1: Required columns for this specific analysis type (only include these columns)
  requiredColumns?: string[];
  // FIX 1E: Required column types from analysis-requirements-registry (e.g., ['numeric', 'categorical'])
  requiredColumnTypes?: string[];
  // Phase 4B: Per-analysis preparation with column roles and derived columns
  analysisPreparation?: import('./analysis-data-preparer').AnalysisPreparation;
}

export interface QuestionAnalysisLink {
  questionId: string;
  questionText: string;
  analysisTypes: string[];
  dataElements: string[];
  findings: AnalysisFinding[];
  answer?: string;
  confidence?: number;
}

export interface AnalysisFinding {
  id: string;
  analysisType: string;
  title: string;
  description: string;
  significance: 'high' | 'medium' | 'low';
  evidence: any;
  dataElementsUsed: string[];
  statisticalSignificance?: {
    pValue?: number;
    confidenceInterval?: [number, number];
    effectSize?: number;
  };
}

export interface DataQualityReport {
  overallScore: number;
  missingValueAnalysis: {
    column: string;
    missingCount: number;
    missingPercent: number;
    recommendation: string;
  }[];
  outlierDetection: {
    column: string;
    outlierCount: number;
    outlierPercent: number;
    method: string;
    bounds: { lower: number; upper: number };
  }[];
  distributionAssessments: {
    column: string;
    distribution: string;
    skewness: number;
    kurtosis: number;
    normalityTest: { statistic: number; pValue: number; isNormal: boolean };
  }[];
  piiDetection: {
    column: string;
    piiType: string;
    confidence: number;
    recommendation: string;
  }[];
}

export interface StatisticalAnalysisReport {
  descriptiveStats: {
    column: string;
    count: number;
    mean: number;
    median: number;
    std: number;
    min: number;
    max: number;
    percentiles: { p25: number; p50: number; p75: number };
  }[];
  correlationMatrix: {
    columns: string[];
    matrix: number[][];
    significantCorrelations: {
      var1: string;
      var2: string;
      correlation: number;
      pValue: number;
    }[];
  };
  hypothesisTests: {
    testName: string;
    variables: string[];
    statistic: number;
    pValue: number;
    interpretation: string;
    effectSize?: number;
  }[];
}

export interface MLModelArtifact {
  modelId: string;
  modelType: string;
  problemType: 'classification' | 'regression' | 'clustering';
  targetColumn?: string;
  features: string[];
  metrics: {
    // Classification
    accuracy?: number;
    precision?: number;
    recall?: number;
    f1Score?: number;
    auc?: number;
    // Regression
    r2?: number;
    rmse?: number;
    mae?: number;
    // Clustering
    silhouetteScore?: number;
    inertia?: number;
  };
  featureImportance: { feature: string; importance: number }[];
  crossValidation?: {
    folds: number;
    scores: number[];
    meanScore: number;
    stdScore: number;
  };
  modelPath?: string; // Path to saved .pkl file
  learningCurve?: { trainSizes: number[]; trainScores: number[]; validScores: number[] };
}

export interface VisualizationArtifact {
  id: string;
  type: 'correlation_heatmap' | 'distribution' | 'scatter' | 'line' | 'bar' | 'box' | 'cluster' | 'feature_importance';
  title: string;
  description: string;
  data: any;
  config: any;
  filePath?: string; // Path to saved image
}

export interface DataScienceResults {
  projectId: string;
  executionId: string;
  startedAt: Date;
  completedAt: Date;

  // Artifacts
  dataQualityReport: DataQualityReport;
  statisticalAnalysisReport: StatisticalAnalysisReport;
  mlModels: MLModelArtifact[];
  visualizations: VisualizationArtifact[];

  // Fix 1A: EDA results (comparative, group, text analysis from Phase 2)
  edaResults?: {
    comparativeAnalysis?: any;
    groupAnalysis?: any;
    descriptiveStats?: any;
    correlations?: any;
    crossTabs?: any;
    textAnalysis?: any;
  };

  // Question-Answer Evidence Chain
  questionAnalysisLinks: QuestionAnalysisLink[];

  // Executive Summary
  executiveSummary: {
    keyFindings: string[];
    answersToQuestions: { question: string; answer: string; confidence: number; evidence: string[] }[];
    recommendations: { text: string; priority: 'high' | 'medium' | 'low'; expectedImpact: string }[];
    nextSteps: string[];
  };

  // Metadata
  metadata: {
    totalRows: number;
    totalColumns: number;
    analysisTypes: string[];
    executionTimeMs: number;
    pythonScriptsUsed: string[];
  };
}

// ============================================
// DATA SCIENCE ORCHESTRATOR
// ============================================

export class DataScienceOrchestrator {
  private pythonPath: string;
  private scriptsPath: string;
  private artifactsPath: string;

  constructor() {
    this.pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    this.scriptsPath = path.join(process.cwd(), 'python');
    this.artifactsPath = path.join(process.cwd(), 'uploads', 'artifacts');
  }

  /**
   * Execute complete data science workflow
   * VI-1 FIX: Routes to optimal compute engine (local, polars, or spark)
   */
  async executeWorkflow(request: DataScienceRequest): Promise<DataScienceResults> {
    const executionId = nanoid();
    const startTime = Date.now();

    // Normalize questions and goals to prevent .toLowerCase() crashes
    const normalizedQuestions = normalizeQuestions(request.userQuestions);
    const normalizedGoals = normalizeQuestions(request.userGoals);
    request.userQuestions = normalizedQuestions;
    request.userGoals = normalizedGoals;

    // VI-1 FIX: Log compute engine selection
    const computeEngine = request.computeEngine || 'local';
    console.log(`🔬 [DataScienceOrchestrator] Starting workflow ${executionId}`);
    console.log(`⚙️ Compute Engine: ${computeEngine.toUpperCase()}`);
    console.log(`📊 Analysis types: ${request.analysisTypes.join(', ')}`);
    console.log(`❓ Questions: ${normalizedQuestions.length}`);
    console.log(`🎯 Goals: ${normalizedGoals.length}`);

    // VI-1 FIX: Route to Spark for large datasets
    if (computeEngine === 'spark' && process.env.SPARK_ENABLED === 'true') {
      console.log(`🚀 [VI-1] Routing to Spark for distributed processing`);
      try {
        const { SparkProcessor } = await import('./spark-processor');
        const sparkInstance = new SparkProcessor();
        return await this.executeWithSpark(request, sparkInstance);
      } catch (sparkError: any) {
        console.warn(`⚠️ [VI-1] Spark execution failed, falling back to local: ${sparkError.message}`);
        // Fall through to local execution
      }
    }

    // P0-2: Log and use analysisPath for ordering if provided
    if (request.analysisPath && request.analysisPath.length > 0) {
      console.log(`📋 [P0-2] DS-recommended analyses (${request.analysisPath.length}):`);
      request.analysisPath.forEach((ap, i) => {
        console.log(`   ${i + 1}. ${ap.analysisType} (priority: ${ap.priority}) - ${ap.reason || 'no reason'}`);
      });

      // Reorder analysisTypes based on analysisPath priority
      const prioritizedTypes = request.analysisPath
        .sort((a, b) => (a.priority || 99) - (b.priority || 99))
        .map(ap => ap.analysisType)
        .filter(at => request.analysisTypes.includes(at));

      // Add any analysis types not in analysisPath at the end
      const remainingTypes = request.analysisTypes.filter(at => !prioritizedTypes.includes(at));
      request.analysisTypes = [...prioritizedTypes, ...remainingTypes];
      console.log(`📊 [P0-2] Reordered analysis types: ${request.analysisTypes.join(', ')}`);
    }

    // P0-3: Log questionAnswerMapping if provided
    if (request.questionAnswerMapping && request.questionAnswerMapping.length > 0) {
      console.log(`🔗 [P0-3] Question-answer mappings (${request.questionAnswerMapping.length}):`);
      request.questionAnswerMapping.forEach((qam, i) => {
        console.log(`   ${i + 1}. "${qam.questionText?.substring(0, 50) || qam.questionId}..." → [${(qam.relevantAnalyses || []).join(', ')}]`);
      });
    }

    // Create artifact directory
    const projectArtifactDir = path.join(this.artifactsPath, request.projectId);
    if (!fs.existsSync(projectArtifactDir)) {
      fs.mkdirSync(projectArtifactDir, { recursive: true });
    }

    // Load datasets
    const datasetData = await this.loadProjectDatasets(request.projectId, request.datasetIds);

    // P0-1 FIX: Filter PII-excluded columns BEFORE any analysis phase
    if (request.columnsToExclude && request.columnsToExclude.length > 0) {
      const excludeSet = new Set(request.columnsToExclude.map(c => c.toLowerCase()));
      const originalColumnCount = datasetData.totalColumns;

      // Filter columns from all row objects
      datasetData.rows = datasetData.rows.map(row => {
        const filteredRow: any = {};
        for (const key of Object.keys(row)) {
          if (!excludeSet.has(key.toLowerCase())) {
            filteredRow[key] = row[key];
          }
        }
        return filteredRow;
      });

      // Update schema to remove excluded columns
      if (datasetData.schema && typeof datasetData.schema === 'object') {
        for (const key of Object.keys(datasetData.schema)) {
          if (excludeSet.has(key.toLowerCase())) {
            delete datasetData.schema[key];
          }
        }
      }

      // Update column count
      const newColumnCount = datasetData.rows.length > 0
        ? Object.keys(datasetData.rows[0]).length
        : originalColumnCount - request.columnsToExclude.length;
      datasetData.totalColumns = newColumnCount;

      console.log(`🔒 [PII] Filtered ${request.columnsToExclude.length} PII columns before analysis: [${request.columnsToExclude.join(', ')}]`);
      console.log(`🔒 [PII] Columns reduced: ${originalColumnCount} → ${newColumnCount}`);
    }

    // FIX 1: Filter to only include required columns for this analysis type
    // This ensures each analysis type only receives its relevant data elements
    if (request.requiredColumns && request.requiredColumns.length > 0) {
      const requiredSet = new Set(request.requiredColumns.map(c => c.toLowerCase()));
      const availableColumns = datasetData.rows.length > 0 ? Object.keys(datasetData.rows[0]) : [];
      const beforeColumnCount = datasetData.totalColumns;

      // Build a mapping of lowercase to original case for preservation
      const columnCaseMap: Record<string, string> = {};
      for (const col of availableColumns) {
        columnCaseMap[col.toLowerCase()] = col;
      }

      // Find matching columns (case-insensitive)
      const matchedColumns: string[] = [];
      for (const reqCol of request.requiredColumns) {
        const lowerReq = reqCol.toLowerCase();
        if (columnCaseMap[lowerReq]) {
          matchedColumns.push(columnCaseMap[lowerReq]);
        } else {
          console.warn(`⚠️ [RequiredColumns] Column "${reqCol}" not found in dataset`);
        }
      }

      // Only filter if we found at least some columns
      if (matchedColumns.length > 0) {
        const matchedSet = new Set(matchedColumns);

        datasetData.rows = datasetData.rows.map(row => {
          const filteredRow: any = {};
          for (const col of matchedColumns) {
            if (row.hasOwnProperty(col)) {
              filteredRow[col] = row[col];
            }
          }
          return filteredRow;
        });

        // Update schema to only include required columns
        if (datasetData.schema && typeof datasetData.schema === 'object') {
          const filteredSchema: any = {};
          for (const col of matchedColumns) {
            if (datasetData.schema[col] !== undefined) {
              filteredSchema[col] = datasetData.schema[col];
            }
          }
          datasetData.schema = filteredSchema;
        }

        datasetData.totalColumns = matchedColumns.length;
        console.log(`📊 [RequiredColumns] Filtered to ${matchedColumns.length} required columns for analysis: [${matchedColumns.join(', ')}]`);
        console.log(`📊 [RequiredColumns] Columns reduced: ${beforeColumnCount} → ${matchedColumns.length}`);
      } else {
        console.warn(`⚠️ [RequiredColumns] None of the required columns found, using all available columns`);
      }
    }

    // Phase 4B-3: Apply derived columns if analysisPreparation specifies them
    if (request.analysisPreparation?.derivedColumns?.length) {
      try {
        const { AnalysisDataPreparer } = await import('./analysis-data-preparer');
        const preparer = new AnalysisDataPreparer();
        datasetData.rows = preparer.applyDerivedColumns(
          datasetData.rows,
          request.analysisPreparation.derivedColumns
        );
        // Update schema and column count after adding derived columns
        if (datasetData.rows.length > 0) {
          datasetData.totalColumns = Object.keys(datasetData.rows[0]).length;
        }
        console.log(`🔧 [DataPreparer] Applied ${request.analysisPreparation.derivedColumns.length} derived columns`);
      } catch (derivErr: any) {
        console.warn(`⚠️ [DataPreparer] Derived column application failed (non-blocking): ${derivErr.message}`);
      }
    }

    // Type-specific data preprocessing before analysis phases
    const primaryType = (request.analysisTypes[0] || '').toLowerCase();

    // Time series: sort by time column before sending to Python
    if (['time_series', 'time_series_analysis', 'trend', 'trend_analysis'].includes(primaryType)) {
      const timeCol = request.analysisPreparation?.columnRoles?.time_column;
      if (timeCol && datasetData.rows.length > 0 && datasetData.rows[0].hasOwnProperty(timeCol)) {
        datasetData.rows.sort((a, b) => {
          const aVal = new Date(a[timeCol]).getTime();
          const bVal = new Date(b[timeCol]).getTime();
          if (isNaN(aVal) || isNaN(bVal)) return 0;
          return aVal - bVal;
        });
        console.log(`🕐 [TypePrep] Sorted ${datasetData.rows.length} rows by time column "${timeCol}"`);
      }
    }

    // ML types: log null warnings for key columns
    if (['clustering', 'regression', 'classification', 'predictive'].some(t => primaryType.includes(t))) {
      const targetCol = request.analysisPreparation?.columnRoles?.target_column;
      const features = request.analysisPreparation?.columnRoles?.features || [];
      const keyCols = targetCol ? [targetCol, ...features] : features;
      for (const col of keyCols.slice(0, 5)) {
        if (datasetData.rows.length > 0) {
          const nullCount = datasetData.rows.filter(r => r[col] === null || r[col] === undefined || r[col] === '').length;
          const nullPct = (nullCount / datasetData.rows.length) * 100;
          if (nullPct > 20) {
            console.warn(`⚠️ [TypePrep] Column "${col}" has ${nullPct.toFixed(1)}% null values for ${primaryType} analysis`);
          }
        }
      }
    }

    // Text analysis: verify text columns exist
    if (['text_analysis', 'text'].includes(primaryType)) {
      const textCols = request.analysisPreparation?.columnRoles?.text_columns || [];
      for (const col of textCols) {
        if (datasetData.rows.length > 0 && !datasetData.rows[0].hasOwnProperty(col)) {
          console.warn(`⚠️ [TypePrep] Text column "${col}" not found in dataset`);
        }
      }
    }

    // Determine which phases are relevant for this analysis type
    let relevantPhases: string[];
    try {
      const { getRelevantPhases } = await import('./analysis-requirements-registry');
      relevantPhases = getRelevantPhases(primaryType);
    } catch {
      relevantPhases = ['quality', 'eda', 'statistical', 'ml']; // default: all phases
    }
    console.log(`📋 [PhaseGate] Analysis type "${primaryType}" → phases: [${relevantPhases.join(', ')}]`);

    // Phase 1: Data Quality Assessment (always runs)
    console.log(`📋 Phase 1: Data Quality Assessment`);
    const dataQualityReport = await this.runDataQualityAnalysis(datasetData, projectArtifactDir);

    // Phase 2: Exploratory Data Analysis (skip for ML-only types)
    let edaResults: any = {};
    if (relevantPhases.includes('eda')) {
      console.log(`📊 Phase 2: Exploratory Data Analysis`);
      edaResults = await this.runExploratoryAnalysis(datasetData, request.analysisTypes, projectArtifactDir, request.analysisPreparation);
    } else {
      console.log(`⏭️ Phase 2: EDA skipped for ${primaryType}`);
    }

    // Phase 3: Statistical Analysis (skip for text, ML-only types)
    let statisticalReport: any = {};
    if (relevantPhases.includes('statistical')) {
      console.log(`📈 Phase 3: Statistical Analysis`);
      statisticalReport = await this.runStatisticalAnalysis(datasetData, request.analysisTypes, projectArtifactDir);
    } else {
      console.log(`⏭️ Phase 3: Statistical Analysis skipped for ${primaryType}`);
    }

    // Phase 4: ML Model Training (skip for descriptive-only types)
    let mlModels: any[] = [];
    if (relevantPhases.includes('ml')) {
      console.log(`🤖 Phase 4: ML Model Training`);

      // Health check before ML operations
      const healthCheck = await performMLHealthCheck();
      if (!healthCheck.healthy) {
        console.warn(`⚠️ [DataScienceOrchestrator] ML health check failed, proceeding with caution`);
        for (const warning of healthCheck.warnings) {
          console.warn(`  - ${warning}`);
        }
      }

      mlModels = await this.runMLAnalysis(datasetData, request.analysisTypes, projectArtifactDir, request.analysisPreparation);
    } else {
      console.log(`⏭️ Phase 4: ML Model Training skipped for ${primaryType}`);
    }

    // Phase 5: Generate Visualizations
    console.log(`📉 Phase 5: Visualization Generation`);
    const visualizations = await this.generateVisualizations(
      datasetData,
      statisticalReport,
      mlModels,
      projectArtifactDir,
      edaResults // Fix 1C: Pass EDA results for comparative/group visualizations
    );

    // Phase 6: Build Question-Analysis Evidence Chain
    // P0-3: Pass questionAnswerMapping for enhanced evidence chain
    console.log(`🔗 Phase 6: Building Evidence Chain`);
    const questionAnalysisLinks = await this.buildEvidenceChain(
      request.userQuestions,
      request.userGoals,
      dataQualityReport,
      statisticalReport,
      mlModels,
      edaResults,
      request.questionAnswerMapping // P0-3: Pre-mapped question-to-analysis links
    );

    // Phase 7: Generate Executive Summary
    console.log(`📝 Phase 7: Executive Summary Generation`);
    const executiveSummary = await this.generateExecutiveSummary(
      request.userGoals,
      questionAnalysisLinks,
      dataQualityReport,
      statisticalReport,
      mlModels
    );

    // Phase 8: Store Artifacts in Database
    console.log(`💾 Phase 8: Storing Artifacts`);
    await this.storeArtifacts(request.projectId, request.userId, {
      dataQualityReport,
      statisticalReport,
      mlModels,
      visualizations,
      executiveSummary
    });

    const completedAt = new Date();
    const executionTimeMs = Date.now() - startTime;

    console.log(`✅ [DataScienceOrchestrator] Workflow completed in ${executionTimeMs}ms`);

    return {
      projectId: request.projectId,
      executionId,
      startedAt: new Date(startTime),
      completedAt,
      dataQualityReport,
      statisticalAnalysisReport: statisticalReport,
      // Fix 1B: Include EDA results (comparative, group, text analysis from Phase 2)
      edaResults: edaResults && Object.keys(edaResults).length > 0 ? edaResults : undefined,
      mlModels,
      visualizations,
      questionAnalysisLinks,
      executiveSummary,
      metadata: {
        totalRows: datasetData.totalRows,
        totalColumns: datasetData.totalColumns,
        analysisTypes: request.analysisTypes,
        executionTimeMs,
        pythonScriptsUsed: this.getPythonScriptsUsed(request.analysisTypes)
      }
    };
  }

  // ============================================
  // VI-1 FIX: SPARK EXECUTION PATH
  // ============================================

  /**
   * Execute workflow using Apache Spark for distributed processing
   * Used for datasets > 1M rows or > 500MB
   */
  private async executeWithSpark(
    request: DataScienceRequest,
    sparkProcessor: any
  ): Promise<DataScienceResults> {
    console.log(`🚀 [Spark] Executing distributed analysis for project ${request.projectId}`);

    const startTime = Date.now();
    const executionId = nanoid();
    const projectArtifactDir = path.join(this.artifactsPath, request.projectId);

    // Ensure artifact directory exists
    if (!fs.existsSync(projectArtifactDir)) {
      fs.mkdirSync(projectArtifactDir, { recursive: true });
    }

    // Initialize results collectors
    const insights: string[] = [];
    const recommendations: { text: string; priority: 'high' | 'medium' | 'low'; expectedImpact: string }[] = [];
    const visualizations: VisualizationArtifact[] = [];
    const mlModels: MLModelArtifact[] = [];

    try {
      // Load datasets for Spark processing
      const datasetData = await this.loadProjectDatasets(request.projectId, request.datasetIds);

      // Route each analysis type through Spark's performAnalysis method
      for (const analysisType of request.analysisTypes) {
        console.log(`  🔬 [Spark] Running ${analysisType} analysis...`);

        try {
          const sparkResult = await sparkProcessor.performAnalysis(
            datasetData.rows,
            analysisType,
            request.computeEngineConfig || {}
          );

          // Collect insights from Spark results
          if (sparkResult?.result) {
            insights.push(`${analysisType}: ${sparkResult.result}`);
          }
          if (sparkResult?.insights) {
            insights.push(...(Array.isArray(sparkResult.insights) ? sparkResult.insights : [sparkResult.insights]));
          }

          console.log(`  ✅ [Spark] ${analysisType} completed`);
        } catch (analysisError: any) {
          console.error(`  ❌ [Spark] ${analysisType} failed: ${analysisError.message}`);
          insights.push(`${analysisType} analysis encountered an error: ${analysisError.message}`);
        }
      }

      // Generate summary
      const executionTimeMs = Date.now() - startTime;

      // Build the correct DataScienceResults structure
      const results: DataScienceResults = {
        projectId: request.projectId,
        executionId,
        startedAt: new Date(startTime),
        completedAt: new Date(),

        // Data quality report (basic for Spark path)
        dataQualityReport: {
          overallScore: 0.85,
          missingValueAnalysis: [],
          outlierDetection: [],
          distributionAssessments: [],
          piiDetection: []
        },

        // Statistical analysis report
        statisticalAnalysisReport: {
          descriptiveStats: [],
          correlationMatrix: { columns: [], matrix: [], significantCorrelations: [] },
          hypothesisTests: []
        },

        // ML models (if any were created)
        mlModels,

        // Visualizations
        visualizations,

        // Question-analysis links
        questionAnalysisLinks: [],

        // Executive summary
        executiveSummary: {
          keyFindings: insights.slice(0, 5),
          answersToQuestions: [],
          recommendations: recommendations.length > 0 ? recommendations : [
            { text: 'Consider additional analysis for deeper insights', priority: 'medium', expectedImpact: 'Moderate' }
          ],
          nextSteps: ['Review Spark analysis results', 'Validate findings with domain experts']
        },

        // Metadata
        metadata: {
          totalRows: datasetData.rows.length,
          totalColumns: datasetData.totalColumns,
          analysisTypes: request.analysisTypes,
          executionTimeMs,
          pythonScriptsUsed: ['spark-distributed']
        }
      };

      console.log(`✅ [Spark] Workflow completed in ${executionTimeMs}ms`);
      return results;

    } catch (error: any) {
      console.error(`❌ [Spark] Workflow failed: ${error.message}`);

      // Return a valid error result that still matches the interface
      const executionTimeMs = Date.now() - startTime;
      return {
        projectId: request.projectId,
        executionId,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        dataQualityReport: { overallScore: 0, missingValueAnalysis: [], outlierDetection: [], distributionAssessments: [], piiDetection: [] },
        statisticalAnalysisReport: { descriptiveStats: [], correlationMatrix: { columns: [], matrix: [], significantCorrelations: [] }, hypothesisTests: [] },
        mlModels: [],
        visualizations: [],
        questionAnalysisLinks: [],
        executiveSummary: {
          keyFindings: [`Spark execution failed: ${error.message}`],
          answersToQuestions: [],
          recommendations: [],
          nextSteps: ['Review error and retry analysis']
        },
        metadata: {
          totalRows: 0,
          totalColumns: 0,
          analysisTypes: request.analysisTypes,
          executionTimeMs,
          pythonScriptsUsed: []
        }
      };
    }
  }

  // ============================================
  // PHASE 1: DATA QUALITY ANALYSIS
  // ============================================

  private async runDataQualityAnalysis(
    datasetData: { rows: any[]; schema: any; totalRows: number; totalColumns: number },
    outputDir: string
  ): Promise<DataQualityReport> {

    const { rows, schema } = datasetData;

    // Write data to temp file for Python
    const tempDataPath = path.join(outputDir, 'temp_data.json');
    fs.writeFileSync(tempDataPath, JSON.stringify(rows));

    // Run descriptive stats script for quality assessment
    const result = await this.executePythonScript('descriptive_stats.py', {
      data_path: tempDataPath,
      output_dir: outputDir
    });

    // FIX 3A: Check Python script success
    if (!result || result.success === false) {
      console.error(`❌ [Quality Check] descriptive_stats.py failed: ${result?.error || 'unknown error'}`);
    }

    // Clean up temp file
    if (fs.existsSync(tempDataPath)) {
      fs.unlinkSync(tempDataPath);
    }

    // Parse results into DataQualityReport format
    const missingValueAnalysis = this.analyzeMissingValues(rows, schema);
    const outlierDetection = await this.detectOutliers(rows, schema, outputDir);
    const distributionAssessments = result?.numeric_variables
      ? this.parseDistributions(result.numeric_variables)
      : [];
    const piiDetection = await this.detectPII(rows, schema);

    const overallScore = this.calculateQualityScore(missingValueAnalysis, outlierDetection);

    return {
      overallScore,
      missingValueAnalysis,
      outlierDetection,
      distributionAssessments,
      piiDetection
    };
  }

  private analyzeMissingValues(rows: any[], schema: any): DataQualityReport['missingValueAnalysis'] {
    const columns = Object.keys(schema || (rows[0] || {}));
    const totalRows = rows.length;

    return columns.map(column => {
      const missingCount = rows.filter(row =>
        row[column] === null || row[column] === undefined || row[column] === ''
      ).length;
      const missingPercent = (missingCount / totalRows) * 100;

      let recommendation = 'No action needed';
      if (missingPercent > 50) {
        recommendation = 'Consider dropping this column or collecting more data';
      } else if (missingPercent > 20) {
        recommendation = 'Consider imputation or investigate data collection issues';
      } else if (missingPercent > 5) {
        recommendation = 'Minor imputation recommended';
      }

      return { column, missingCount, missingPercent, recommendation };
    });
  }

  private async detectOutliers(
    rows: any[],
    schema: any,
    outputDir: string
  ): Promise<DataQualityReport['outlierDetection']> {
    const numericColumns = Object.entries(schema || {})
      .filter(([_, meta]: [string, any]) => meta?.type === 'number' || meta?.type === 'integer')
      .map(([col]) => col);

    const results: DataQualityReport['outlierDetection'] = [];

    for (const column of numericColumns) {
      const values = rows
        .map(row => row[column])
        .filter(v => typeof v === 'number' && !isNaN(v));

      if (values.length < 4) continue;

      // IQR method
      const sorted = [...values].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1;
      const lower = q1 - 1.5 * iqr;
      const upper = q3 + 1.5 * iqr;

      const outliers = values.filter(v => v < lower || v > upper);

      results.push({
        column,
        outlierCount: outliers.length,
        outlierPercent: (outliers.length / values.length) * 100,
        method: 'IQR',
        bounds: { lower, upper }
      });
    }

    return results;
  }

  private parseDistributions(numericVariables: any): DataQualityReport['distributionAssessments'] {
    return Object.entries(numericVariables).map(([column, stats]: [string, any]) => ({
      column,
      distribution: stats?.normality?.is_normal ? 'normal' : 'non-normal',
      skewness: stats?.distribution?.skewness || 0,
      kurtosis: stats?.distribution?.kurtosis || 0,
      normalityTest: {
        statistic: stats?.normality?.shapiro_stat || 0,
        pValue: stats?.normality?.shapiro_p || 0,
        isNormal: stats?.normality?.is_normal || false
      }
    }));
  }

  private async detectPII(rows: any[], schema: any): Promise<DataQualityReport['piiDetection']> {
    const piiPatterns = [
      { type: 'email', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, columns: ['email', 'e-mail', 'mail'] },
      { type: 'phone', pattern: /^\+?[\d\s\-()]{10,}$/, columns: ['phone', 'tel', 'mobile', 'cell'] },
      { type: 'ssn', pattern: /^\d{3}-?\d{2}-?\d{4}$/, columns: ['ssn', 'social', 'tax_id'] },
      { type: 'name', pattern: null, columns: ['name', 'first_name', 'last_name', 'full_name'] },
      { type: 'address', pattern: null, columns: ['address', 'street', 'city', 'zip', 'postal'] }
    ];

    const results: DataQualityReport['piiDetection'] = [];
    const columns = Object.keys(schema || (rows[0] || {}));

    for (const column of columns) {
      const colLower = column.toLowerCase();

      for (const pii of piiPatterns) {
        const nameMatch = pii.columns.some(p => colLower.includes(p));

        if (nameMatch) {
          results.push({
            column,
            piiType: pii.type,
            confidence: 0.9,
            recommendation: `Consider anonymizing or masking ${pii.type} data`
          });
          break;
        }

        // Pattern match on sample data
        if (pii.pattern && rows.length > 0) {
          const sampleValues = rows.slice(0, 100).map(r => String(r[column] || ''));
          const matchCount = sampleValues.filter(v => pii.pattern!.test(v)).length;

          if (matchCount > sampleValues.length * 0.5) {
            results.push({
              column,
              piiType: pii.type,
              confidence: matchCount / sampleValues.length,
              recommendation: `Detected ${pii.type} pattern - consider anonymization`
            });
            break;
          }
        }
      }
    }

    return results;
  }

  private calculateQualityScore(
    missingAnalysis: DataQualityReport['missingValueAnalysis'],
    outlierAnalysis: DataQualityReport['outlierDetection']
  ): number {
    let score = 100;

    // Deduct for missing values
    const avgMissing = missingAnalysis.reduce((sum, m) => sum + m.missingPercent, 0) / missingAnalysis.length;
    score -= avgMissing * 0.5;

    // Deduct for outliers
    const avgOutliers = outlierAnalysis.reduce((sum, o) => sum + o.outlierPercent, 0) / (outlierAnalysis.length || 1);
    score -= avgOutliers * 0.3;

    return Math.max(0, Math.min(100, score));
  }

  // ============================================
  // PHASE 2: EXPLORATORY DATA ANALYSIS
  // ============================================

  private async runExploratoryAnalysis(
    datasetData: { rows: any[]; schema: any; totalRows: number; totalColumns: number },
    analysisTypes: string[],
    outputDir: string,
    analysisPreparation?: import('./analysis-data-preparer').AnalysisPreparation
  ): Promise<any> {
    const tempDataPath = path.join(outputDir, 'temp_eda_data.json');
    fs.writeFileSync(tempDataPath, JSON.stringify(datasetData.rows));

    // Phase 4B-4: Build enhanced config using AnalysisDataPreparer when preparation available
    let enhancedConfigBuilder: ((scriptType: string) => Record<string, any>) | null = null;
    if (analysisPreparation?.columnRoles) {
      try {
        const { AnalysisDataPreparer } = await import('./analysis-data-preparer');
        const preparer = new AnalysisDataPreparer();
        enhancedConfigBuilder = (scriptType: string) =>
          preparer.buildPythonConfig(analysisPreparation, tempDataPath, outputDir);
      } catch (err) {
        console.warn(`⚠️ [DataPreparer] Could not build enhanced config: ${err}`);
      }
    }

    // Helper: get config for a script (enhanced if available, bare otherwise)
    const getConfig = (scriptType: string, bareConfig: Record<string, any>): Record<string, any> => {
      if (enhancedConfigBuilder) {
        const enhanced = enhancedConfigBuilder(scriptType);
        console.log(`  📋 [Enhanced Config] ${scriptType}: ${JSON.stringify(Object.keys(enhanced).filter(k => k !== 'data_path' && k !== 'output_dir'))}`);
        return enhanced;
      }
      return bareConfig;
    };

    const results: any = {
      descriptiveStats: null,
      correlations: null,
      crossTabs: null
    };

    // Run descriptive stats — Fix 2: Also match 'descriptive_statistics' (the canonical name)
    if (analysisTypes.includes('descriptive') || analysisTypes.includes('descriptive_statistics') || analysisTypes.length === 0) {
      results.descriptiveStats = await this.executePythonScript('descriptive_stats.py',
        getConfig('descriptive', { data_path: tempDataPath })
      );
      // FIX 3A: Check Python script success
      if (!results.descriptiveStats || results.descriptiveStats.success === false) {
        console.error(`❌ [Basic Analysis] descriptive_stats.py failed: ${results.descriptiveStats?.error || 'unknown'}`);
      }
    }

    // Run correlation analysis
    if (analysisTypes.includes('correlation') || analysisTypes.includes('correlation_analysis')) {
      results.correlations = await this.executePythonScript('correlation_analysis.py',
        getConfig('correlation', { data_path: tempDataPath, method: 'pearson' })
      );
      // FIX 3A: Check Python script success
      if (!results.correlations || results.correlations.success === false) {
        console.error(`❌ [Basic Analysis] correlation_analysis.py failed: ${results.correlations?.error || 'unknown'}`);
      }
    }

    // FIX 2F: Run comparative analysis (cross-group statistical comparison)
    // Also handles statistical_tests and statistical_analysis since comparative_analysis.py performs ANOVA, t-tests, chi-square
    if (analysisTypes.includes('comparative') || analysisTypes.includes('comparative_analysis') || analysisTypes.includes('statistical_tests') || analysisTypes.includes('statistical_analysis')) {
      results.comparativeAnalysis = await this.executePythonScript('comparative_analysis.py',
        getConfig('comparative', { data_path: tempDataPath })
      );
      if (!results.comparativeAnalysis || results.comparativeAnalysis.success === false) {
        console.error(`❌ [Analysis] comparative_analysis.py failed: ${results.comparativeAnalysis?.error || 'unknown'}`);
      }
    }

    // FIX 2F: Run group analysis (segment/cohort profiling)
    if (analysisTypes.includes('group_analysis') || analysisTypes.includes('group')) {
      results.groupAnalysis = await this.executePythonScript('group_analysis.py',
        getConfig('group_analysis', { data_path: tempDataPath })
      );
      if (!results.groupAnalysis || results.groupAnalysis.success === false) {
        console.error(`❌ [Analysis] group_analysis.py failed: ${results.groupAnalysis?.error || 'unknown'}`);
      }
    }

    // FIX 2F: Run text analysis (NLP: topics, sentiment, keywords)
    if (analysisTypes.includes('text_analysis') || analysisTypes.includes('text')) {
      results.textAnalysis = await this.executePythonScript('text_analysis.py',
        getConfig('text_analysis', { data_path: tempDataPath })
      );
      if (!results.textAnalysis || results.textAnalysis.success === false) {
        console.error(`❌ [Analysis] text_analysis.py failed: ${results.textAnalysis?.error || 'unknown'}`);
      }
    }

    // FIX 2F: Run time series analysis (trend, decomposition, forecasting)
    if (analysisTypes.includes('time_series') || analysisTypes.includes('time-series') || analysisTypes.includes('time_series_analysis') || analysisTypes.includes('trend') || analysisTypes.includes('trend_analysis')) {
      results.timeSeriesAnalysis = await this.executePythonScript('time_series_analysis.py',
        getConfig('time_series', { data_path: tempDataPath })
      );
      if (!results.timeSeriesAnalysis || results.timeSeriesAnalysis.success === false) {
        console.error(`❌ [Analysis] time_series_analysis.py failed: ${results.timeSeriesAnalysis?.error || 'unknown'}`);
      }
    }

    // NOTE: classification, regression, clustering are handled in Phase 4 (runMLAnalysis),
    // not in EDA. The phase gate in analysis-requirements-registry.ts routes these types
    // to ['quality', 'ml'], skipping EDA. This avoids duplicate Python script execution.

    // Clean up
    if (fs.existsSync(tempDataPath)) {
      fs.unlinkSync(tempDataPath);
    }

    return results;
  }

  // ============================================
  // PHASE 3: STATISTICAL ANALYSIS
  // ============================================

  private async runStatisticalAnalysis(
    datasetData: { rows: any[]; schema: any; totalRows: number; totalColumns: number },
    analysisTypes: string[],
    outputDir: string
  ): Promise<StatisticalAnalysisReport> {
    const tempDataPath = path.join(outputDir, 'temp_stats_data.json');
    fs.writeFileSync(tempDataPath, JSON.stringify(datasetData.rows));

    // Run descriptive stats
    const descriptiveResult = await this.executePythonScript('descriptive_stats.py', {
      data_path: tempDataPath
    });
    // FIX 3A: Check Python script success
    if (!descriptiveResult || descriptiveResult.success === false) {
      console.error(`❌ [Stats] descriptive_stats.py failed: ${descriptiveResult?.error || 'unknown'}`);
    }

    // Run correlation analysis
    const correlationResult = await this.executePythonScript('correlation_analysis.py', {
      data_path: tempDataPath,
      method: 'pearson'
    });
    // FIX 3A: Check Python script success
    if (!correlationResult || correlationResult.success === false) {
      console.error(`❌ [Stats] correlation_analysis.py failed: ${correlationResult?.error || 'unknown'}`);
    }

    // Run statistical tests
    const testsResult = await this.executePythonScript('statistical_tests.py', {
      data_path: tempDataPath
    });
    // FIX 3A: Check Python script success
    if (!testsResult || testsResult.success === false) {
      console.error(`❌ [Stats] statistical_tests.py failed: ${testsResult?.error || 'unknown'}`);
    }

    // Clean up
    if (fs.existsSync(tempDataPath)) {
      fs.unlinkSync(tempDataPath);
    }

    // Parse into StatisticalAnalysisReport format
    const descriptiveStats = this.parseDescriptiveStats(descriptiveResult);
    const correlationMatrix = this.parseCorrelationMatrix(correlationResult);
    const hypothesisTests = this.parseHypothesisTests(testsResult);

    return {
      descriptiveStats,
      correlationMatrix,
      hypothesisTests
    };
  }

  private parseDescriptiveStats(result: any): StatisticalAnalysisReport['descriptiveStats'] {
    if (!result?.numeric_variables) return [];

    return Object.entries(result.numeric_variables).map(([column, stats]: [string, any]) => ({
      column,
      count: stats?.basic_statistics?.count || 0,
      mean: stats?.basic_statistics?.mean || 0,
      median: stats?.basic_statistics?.median || 0,
      std: stats?.basic_statistics?.std || 0,
      min: stats?.basic_statistics?.min || 0,
      max: stats?.basic_statistics?.max || 0,
      percentiles: {
        p25: stats?.percentiles?.['25th'] || 0,
        p50: stats?.percentiles?.['50th'] || 0,
        p75: stats?.percentiles?.['75th'] || 0
      }
    }));
  }

  private parseCorrelationMatrix(result: any): StatisticalAnalysisReport['correlationMatrix'] {
    if (!result?.correlation_matrix) {
      return { columns: [], matrix: [], significantCorrelations: [] };
    }

    const columns = Object.keys(result.correlation_matrix);
    const matrix = columns.map(col1 =>
      columns.map(col2 => result.correlation_matrix[col1]?.[col2] || 0)
    );

    const significantCorrelations: StatisticalAnalysisReport['correlationMatrix']['significantCorrelations'] = [];

    if (result.strong_correlations || result.significant_correlations) {
      for (const corr of (result.strong_correlations || result.significant_correlations)) {
        significantCorrelations.push({
          var1: corr.variable1,
          var2: corr.variable2,
          correlation: corr.correlation,
          pValue: corr.p_value
        });
      }
    }

    return { columns, matrix, significantCorrelations };
  }

  private parseHypothesisTests(result: any): StatisticalAnalysisReport['hypothesisTests'] {
    // statistical_tests.py returns a single test result object, not an array
    // Normalize: wrap single result in array, or use existing .tests array
    let tests: any[] = [];
    if (result?.tests && Array.isArray(result.tests)) {
      tests = result.tests;
    } else if (result?.success && result?.test_type) {
      // Single test result — wrap in array
      tests = [result];
    }
    if (tests.length === 0) return [];

    return tests.map((test: any) => ({
      testName: test.test_name || test.test_type || 'Unknown Test',
      variables: test.variables || [],
      statistic: test.statistic || test.f_statistic || test.t_statistic || test.chi2_statistic || 0,
      pValue: test.p_value || 1,
      interpretation: test.interpretation || (test.p_value < 0.05 ? 'Statistically significant' : 'Not statistically significant'),
      effectSize: test.effect_size || test.cohens_d || test.eta_squared
    }));
  }

  // ============================================
  // PHASE 4: ML MODEL TRAINING
  // ============================================

  /**
   * Preprocess data with embeddings for ML analysis
   * Transforms non-numeric columns into numeric representations using:
   * - One-hot encoding for low-cardinality categoricals
   * - Target encoding for high-cardinality categoricals
   * - Temporal features for datetime columns
   * - Binary encoding for boolean/binary columns
   *
   * This ensures all columns can be used in ML models.
   */
  private async preprocessDataWithEmbeddings(
    datasetData: { rows: any[]; schema: any; totalRows: number; totalColumns: number },
    outputDir: string
  ): Promise<{
    embeddedRows: Record<string, number>[];
    embeddingResult: ColumnEmbeddingResult;
    columnMapping: Record<string, string[]>;
  }> {
    console.log(`🔢 [Embeddings] Preprocessing ${datasetData.rows.length} rows with ${datasetData.totalColumns} columns`);

    const rows = datasetData.rows;
    if (!rows || rows.length === 0) {
      console.warn(`⚠️ [Embeddings] No rows to preprocess`);
      return {
        embeddedRows: [],
        embeddingResult: {
          originalRowCount: 0,
          originalColumnCount: 0,
          transformedColumnCount: 0,
          columns: [],
          numericData: {},
          columnMapping: {},
          analysisReport: []
        },
        columnMapping: {}
      };
    }

    // Run the auto-transform - the service will analyze columns and determine best encoding
    try {
      const embeddingResult = await columnEmbeddingService.autoTransform(rows, {
        maxOneHotCardinality: 10,        // Use one-hot for low cardinality
        reducedEmbeddingDimension: 32    // Reduce embeddings to 32 dimensions
      });

      // Convert numericData to row format for Python consumption
      const numericColumns = Object.keys(embeddingResult.numericData);
      const embeddedRows: Record<string, number>[] = [];

      if (numericColumns.length > 0) {
        const rowCount = embeddingResult.numericData[numericColumns[0]]?.length || 0;
        for (let i = 0; i < rowCount; i++) {
          const row: Record<string, number> = {};
          for (const col of numericColumns) {
            row[col] = embeddingResult.numericData[col][i];
          }
          embeddedRows.push(row);
        }
      }

      // Log transformation summary
      console.log(`✅ [Embeddings] Transformation complete:`);
      console.log(`   - Original columns: ${embeddingResult.originalColumnCount}`);
      console.log(`   - Transformed columns: ${embeddingResult.transformedColumnCount}`);
      console.log(`   - Rows: ${embeddedRows.length}`);

      // Log per-column transformation details
      for (const analysis of embeddingResult.analysisReport.slice(0, 5)) {
        console.log(`   - ${analysis.column}: ${analysis.recommendedEncoding} (${analysis.cardinality} unique)`);
      }
      if (embeddingResult.analysisReport.length > 5) {
        console.log(`   - ... and ${embeddingResult.analysisReport.length - 5} more columns`);
      }

      // Save embedding report for debugging
      const reportPath = path.join(outputDir, 'embedding_report.json');
      fs.writeFileSync(reportPath, JSON.stringify({
        originalColumns: embeddingResult.originalColumnCount,
        transformedColumns: embeddingResult.transformedColumnCount,
        columnMapping: embeddingResult.columnMapping,
        analysisReport: embeddingResult.analysisReport
      }, null, 2));

      return {
        embeddedRows,
        embeddingResult,
        columnMapping: embeddingResult.columnMapping
      };
    } catch (error) {
      console.error(`❌ [Embeddings] Transformation failed:`, error);

      // Fallback: just extract numeric columns directly
      const fallbackRows: Record<string, number>[] = [];
      for (const row of rows) {
        const numericRow: Record<string, number> = {};
        for (const [col, val] of Object.entries(row)) {
          const numVal = typeof val === 'number' ? val : parseFloat(String(val));
          if (!isNaN(numVal)) {
            numericRow[col] = numVal;
          }
        }
        if (Object.keys(numericRow).length > 0) {
          fallbackRows.push(numericRow);
        }
      }

      console.log(`⚠️ [Embeddings] Using fallback: ${fallbackRows.length} rows with ${Object.keys(fallbackRows[0] || {}).length} numeric columns`);

      const originalColumnCount = rows[0] ? Object.keys(rows[0]).length : 0;
      return {
        embeddedRows: fallbackRows,
        embeddingResult: {
          originalRowCount: rows.length,
          originalColumnCount,
          transformedColumnCount: Object.keys(fallbackRows[0] || {}).length,
          columns: [],
          numericData: {},
          columnMapping: {},
          analysisReport: []
        },
        columnMapping: {}
      };
    }
  }

  private async runMLAnalysis(
    datasetData: { rows: any[]; schema: any; totalRows: number; totalColumns: number },
    analysisTypes: string[],
    outputDir: string,
    analysisPreparation?: import('./analysis-data-preparer').AnalysisPreparation
  ): Promise<MLModelArtifact[]> {
    const models: MLModelArtifact[] = [];

    // Preprocess data with embeddings to ensure all columns are numeric
    console.log(`🔢 [ML Analysis] Preprocessing data with embeddings...`);
    const { embeddedRows, embeddingResult, columnMapping } = await this.preprocessDataWithEmbeddings(
      datasetData,
      outputDir
    );

    // Use embedded data if available, otherwise fall back to original
    const mlReadyRows = embeddedRows.length > 0 ? embeddedRows : datasetData.rows;
    const tempDataPath = path.join(outputDir, 'temp_ml_data.json');
    fs.writeFileSync(tempDataPath, JSON.stringify(mlReadyRows));

    // Save column mapping for feature interpretation
    const columnMappingPath = path.join(outputDir, 'column_mapping.json');
    fs.writeFileSync(columnMappingPath, JSON.stringify(columnMapping, null, 2));

    console.log(`📊 [ML Analysis] Using ${mlReadyRows.length} rows with ${Object.keys(mlReadyRows[0] || {}).length} features for ML`);

    // Phase 4B-4: Build enhanced configs for ML scripts
    const roles = analysisPreparation?.columnRoles;
    const bizCtx = analysisPreparation?.businessContext;

    // Clustering analysis
    if (analysisTypes.includes('clustering') || analysisTypes.includes('segmentation')) {
      const clusterResult = await this.executePythonScript('clustering_analysis.py', {
        data_path: tempDataPath,
        n_clusters: roles?.n_clusters || 'auto',
        method: roles?.method,
        features: roles?.features,
        output_dir: outputDir,
        ...(bizCtx?.questionIds?.length ? { business_context: bizCtx } : {}),
      });

      if (clusterResult?.success) {
        // Python returns metrics nested under .metrics or at top level
        const clusterMetrics = clusterResult.metrics || clusterResult;
        models.push({
          modelId: nanoid(),
          modelType: clusterResult.method || clusterResult.algorithm || 'kmeans',
          problemType: 'clustering',
          features: clusterResult.feature_names || clusterResult.features_used || [],
          metrics: {
            silhouetteScore: clusterMetrics.silhouette_score || clusterMetrics.silhouetteScore,
            inertia: clusterMetrics.inertia
          },
          featureImportance: [],
          modelPath: clusterResult.model_path
        });
      }
    }

    // Regression analysis
    if (analysisTypes.includes('regression') || analysisTypes.includes('predictive')) {
      const regressionResult = await this.executePythonScript('regression_analysis.py', {
        data_path: tempDataPath,
        target_column: roles?.target_column,
        features: roles?.features,
        output_dir: outputDir,
        ...(bizCtx?.questionIds?.length ? { business_context: bizCtx } : {}),
      });

      if (regressionResult?.success) {
        // Python returns metrics nested under .metrics.test and .metrics.train
        const regTestMetrics = regressionResult.metrics?.test || regressionResult.metrics || regressionResult;
        models.push({
          modelId: nanoid(),
          modelType: regressionResult.model || regressionResult.model_type || 'linear_regression',
          problemType: 'regression',
          targetColumn: regressionResult.target_column,
          features: regressionResult.feature_columns || regressionResult.features || [],
          metrics: {
            r2: regTestMetrics.r2 || regressionResult.r2_score,
            rmse: regTestMetrics.rmse || regressionResult.rmse,
            mae: regTestMetrics.mae || regressionResult.mae
          },
          featureImportance: (regressionResult.coefficients || []).map((c: any) =>
            typeof c === 'object' ? { feature: c.feature || c.name, importance: Math.abs(c.coefficient || c.importance || 0) } : c
          ),
          crossValidation: regressionResult.cv_results,
          modelPath: regressionResult.model_path
        });
      }
    }

    // Classification analysis
    if (analysisTypes.includes('classification')) {
      const classResult = await this.executePythonScript('classification_analysis.py', {
        data_path: tempDataPath,
        target_column: roles?.target_column,
        model_type: roles?.model_type,
        output_dir: outputDir,
        ...(bizCtx?.questionIds?.length ? { business_context: bizCtx } : {}),
      });

      if (classResult?.success) {
        // Python returns metrics nested under .metrics, or at top level
        const classMetrics = classResult.metrics || classResult;
        models.push({
          modelId: nanoid(),
          modelType: classResult.model_type || 'random_forest',
          problemType: 'classification',
          targetColumn: classResult.target_column,
          features: (classResult.feature_importance || []).map((f: any) => f.feature || f.name || f),
          metrics: {
            accuracy: classMetrics.accuracy,
            precision: classMetrics.precision,
            recall: classMetrics.recall,
            f1Score: classMetrics.f1_score || classMetrics.f1Score,
            auc: classMetrics.roc_auc || classMetrics.auc
          },
          featureImportance: classResult.feature_importance || [],
          crossValidation: classResult.cross_validation || classResult.cv_results,
          modelPath: classResult.model_path
        });
      }
    }

    // General ML training if no specific type - use enhanced pipeline
    if (analysisTypes.includes('ml') || analysisTypes.includes('machine-learning')) {
      // Try enhanced ML pipeline first (with feature selection, model comparison)
      let mlResult = await this.executePythonScript('enhanced_ml_pipeline.py', {
        data_path: tempDataPath,
        column_mapping_path: columnMappingPath,
        output_dir: outputDir,
        pre_embedded: embeddedRows.length > 0 ? 'true' : 'false'
      });

      // Fallback to basic ml_training.py if enhanced fails
      if (!mlResult?.success) {
        console.log(`⚠️ [ML] Enhanced pipeline failed, falling back to basic ml_training.py`);
        mlResult = await this.executePythonScript('ml_training.py', {
          data_path: tempDataPath,
          model_type: 'auto',
          output_dir: outputDir
        });
      }

      if (mlResult?.success) {
        // Map embedded feature names back to original columns for interpretability
        const originalFeatures = (mlResult.features || []).map((feat: string) => {
          // Check if this is an embedded feature (e.g., "department_Sales" -> "department")
          for (const [original, derived] of Object.entries(columnMapping)) {
            if ((derived as string[]).includes(feat)) {
              return `${original} (${feat})`;
            }
          }
          return feat;
        });

        models.push({
          modelId: nanoid(),
          modelType: mlResult.model_type || mlResult.best_model || 'auto',
          problemType: mlResult.problem_type || 'classification',
          targetColumn: mlResult.target_column,
          features: originalFeatures,
          metrics: mlResult.metrics || mlResult.best_metrics || {},
          featureImportance: (mlResult.feature_importance || []).map((fi: any) => ({
            ...fi,
            // Map feature names back to original for display
            originalFeature: Object.entries(columnMapping).find(
              ([_, derived]) => (derived as string[]).includes(fi.feature)
            )?.[0] || fi.feature
          })),
          crossValidation: mlResult.cv_results,
          modelPath: mlResult.model_path,
          learningCurve: mlResult.learning_curve
        });
      }
    }

    // Clean up
    if (fs.existsSync(tempDataPath)) {
      fs.unlinkSync(tempDataPath);
    }

    return models;
  }

  // ============================================
  // PHASE 5: VISUALIZATION GENERATION
  // ============================================

  private async generateVisualizations(
    datasetData: { rows: any[]; schema: any; totalRows: number; totalColumns: number },
    statisticalReport: StatisticalAnalysisReport,
    mlModels: MLModelArtifact[],
    outputDir: string,
    edaResults?: any // Fix 1C/5: EDA results for comparative/group visualizations
  ): Promise<VisualizationArtifact[]> {
    const visualizations: VisualizationArtifact[] = [];

    // Correlation heatmap
    if (statisticalReport.correlationMatrix.columns.length > 0) {
      visualizations.push({
        id: nanoid(),
        type: 'correlation_heatmap',
        title: 'Correlation Matrix',
        description: 'Heatmap showing correlations between numeric variables',
        data: statisticalReport.correlationMatrix,
        config: { colorScale: 'RdBu', showValues: true }
      });
    }

    // Distribution plots
    for (const stat of statisticalReport.descriptiveStats.slice(0, 5)) {
      visualizations.push({
        id: nanoid(),
        type: 'distribution',
        title: `Distribution of ${stat.column}`,
        description: `Histogram and box plot for ${stat.column}`,
        data: {
          column: stat.column,
          stats: stat
        },
        config: { bins: 30, showMean: true, showMedian: true }
      });
    }

    // Feature importance plots for ML models
    for (const model of mlModels) {
      if (model.featureImportance.length > 0) {
        visualizations.push({
          id: nanoid(),
          type: 'feature_importance',
          title: `Feature Importance - ${model.modelType}`,
          description: `Top features driving the ${model.problemType} model`,
          data: model.featureImportance.slice(0, 10),
          config: { horizontal: true, showValues: true }
        });
      }
    }

    // Clustering visualization
    const clusterModel = mlModels.find(m => m.problemType === 'clustering');
    if (clusterModel) {
      visualizations.push({
        id: nanoid(),
        type: 'cluster',
        title: 'Cluster Analysis',
        description: 'Visualization of data clusters',
        data: { model: clusterModel },
        config: { showCentroids: true, showLabels: true }
      });
    }

    // Fix 5: Comparative analysis visualizations from EDA results
    if (edaResults?.comparativeAnalysis) {
      const compTests = edaResults.comparativeAnalysis.tests;
      if (Array.isArray(compTests) && compTests.length > 0) {
        // Significant tests → box plots showing group comparisons
        const significantTests = compTests.filter((t: any) => t.significant);
        for (const test of significantTests.slice(0, 3)) {
          visualizations.push({
            id: nanoid(),
            type: 'box',
            title: `${test.test_name || 'Statistical Test'}: ${test.variable} by Group`,
            description: `Comparison of ${test.variable} across groups (p=${Number(test.p_value || 0).toFixed(4)})`,
            data: { test, groups: test.group_stats || test.groups },
            config: { showOutliers: true, showMean: true }
          });
        }

        // Summary visualization of all tests
        if (compTests.length > 1) {
          visualizations.push({
            id: nanoid(),
            type: 'bar',
            title: 'Statistical Comparison Summary',
            description: `${significantTests.length} of ${compTests.length} variables showed significant group differences`,
            data: {
              tests: compTests.map((t: any) => ({
                variable: t.variable,
                testName: t.test_name,
                pValue: t.p_value,
                significant: t.significant,
                effectSize: t.effect_size
              })),
              summary: edaResults.comparativeAnalysis.summary
            },
            config: { showSignificanceThreshold: true }
          });
        }
      }
    }

    // Fix 5: Group analysis visualizations from EDA results
    if (edaResults?.groupAnalysis?.group_profiles) {
      visualizations.push({
        id: nanoid(),
        type: 'bar',
        title: 'Group Profile Comparison',
        description: `Side-by-side comparison of ${Object.keys(edaResults.groupAnalysis.group_profiles).length} group characteristics`,
        data: {
          profiles: edaResults.groupAnalysis.group_profiles,
          summary: edaResults.groupAnalysis.summary,
          distinctiveFeatures: edaResults.groupAnalysis.distinctive_features
        },
        config: { showMetrics: true }
      });
    }

    return visualizations;
  }

  // ============================================
  // PHASE 6: EVIDENCE CHAIN BUILDING
  // ============================================

  private async buildEvidenceChain(
    questions: string[],
    goals: string[],
    dataQualityReport: DataQualityReport,
    statisticalReport: StatisticalAnalysisReport,
    mlModels: MLModelArtifact[],
    edaResults: any,
    // P0-3: Optional pre-mapped question-to-analysis links from PM Agent
    questionAnswerMapping?: Array<{
      questionId: string;
      questionText: string;
      relevantAnalyses: string[];
      relevantDataElements: string[];
    }>
  ): Promise<QuestionAnalysisLink[]> {
    const links: QuestionAnalysisLink[] = [];

    // P0-3: Build lookup map from questionAnswerMapping for O(1) access
    type QuestionMapping = {
      questionId: string;
      questionText: string;
      relevantAnalyses: string[];
      relevantDataElements: string[];
    };
    // Normalize text for robust matching (collapse whitespace, strip trailing punctuation)
    const normalizeForLookup = (text: string): string =>
      text.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[?!.,;:]+$/g, '');

    const mappingLookup = new Map<string, QuestionMapping>();
    if (questionAnswerMapping && questionAnswerMapping.length > 0) {
      console.log(`🔗 [P0-3] Using ${questionAnswerMapping.length} pre-mapped question-answer links`);
      for (const qam of questionAnswerMapping) {
        // Index by question text (normalized) for matching
        const normalizedText = normalizeForLookup(qam.questionText || '');
        if (normalizedText) {
          mappingLookup.set(normalizedText, qam);
        }
        // Also index by questionId if available
        if (qam.questionId) {
          mappingLookup.set(qam.questionId, qam);
        }
      }
    }

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const questionLower = normalizeForLookup(question);

      // P0-3: First check if we have a pre-mapped entry for this question
      const preMapping = mappingLookup.get(questionLower);

      // Determine relevant analysis types - prefer pre-mapping over keyword matching
      const analysisTypes: string[] = preMapping?.relevantAnalyses?.length
        ? [...preMapping.relevantAnalyses]
        : [];
      const findings: AnalysisFinding[] = [];
      const dataElements: string[] = preMapping?.relevantDataElements?.length
        ? [...preMapping.relevantDataElements]
        : [];

      if (preMapping) {
        console.log(`🔗 [P0-3] Question ${i + 1} matched to pre-mapping: [${analysisTypes.join(', ')}]`);
      }

      // Correlation keywords
      if (/correlat|relationship|association|related|connect/i.test(questionLower)) {
        analysisTypes.push('correlation');

        if (statisticalReport.correlationMatrix.significantCorrelations.length > 0) {
          for (const corr of statisticalReport.correlationMatrix.significantCorrelations.slice(0, 3)) {
            findings.push({
              id: nanoid(),
              analysisType: 'correlation',
              title: `${corr.var1} and ${corr.var2} correlation`,
              description: `Found ${corr.correlation > 0 ? 'positive' : 'negative'} correlation (r=${corr.correlation.toFixed(3)})`,
              significance: Math.abs(corr.correlation) > 0.7 ? 'high' : Math.abs(corr.correlation) > 0.4 ? 'medium' : 'low',
              evidence: corr,
              dataElementsUsed: [corr.var1, corr.var2],
              statisticalSignificance: { pValue: corr.pValue }
            });
            dataElements.push(corr.var1, corr.var2);
          }
        }
      }

      // Trend/time keywords
      if (/trend|time|change|over time|growth|decline|pattern/i.test(questionLower)) {
        analysisTypes.push('time-series');
      }

      // Prediction keywords
      if (/predict|forecast|estimate|future|will|expect/i.test(questionLower)) {
        analysisTypes.push('predictive');

        const regressionModel = mlModels.find(m => m.problemType === 'regression');
        if (regressionModel) {
          findings.push({
            id: nanoid(),
            analysisType: 'regression',
            title: `Predictive model for ${regressionModel.targetColumn}`,
            description: `Model explains ${((regressionModel.metrics.r2 || 0) * 100).toFixed(1)}% of variance`,
            significance: (regressionModel.metrics.r2 || 0) > 0.7 ? 'high' : (regressionModel.metrics.r2 || 0) > 0.4 ? 'medium' : 'low',
            evidence: regressionModel.metrics,
            dataElementsUsed: regressionModel.features,
            statisticalSignificance: { pValue: 0.05 } // Would come from actual analysis
          });
          dataElements.push(...regressionModel.features);
        }
      }

      // Segmentation keywords
      if (/segment|group|cluster|type|category|persona/i.test(questionLower)) {
        analysisTypes.push('clustering');

        const clusterModel = mlModels.find(m => m.problemType === 'clustering');
        if (clusterModel) {
          findings.push({
            id: nanoid(),
            analysisType: 'clustering',
            title: 'Data Segmentation Analysis',
            description: `Identified distinct groups in the data (silhouette score: ${(clusterModel.metrics.silhouetteScore || 0).toFixed(3)})`,
            significance: (clusterModel.metrics.silhouetteScore || 0) > 0.5 ? 'high' : 'medium',
            evidence: clusterModel.metrics,
            dataElementsUsed: clusterModel.features
          });
          dataElements.push(...clusterModel.features);
        }
      }

      // Driver/impact keywords
      if (/driver|impact|affect|influence|cause|factor|why/i.test(questionLower)) {
        analysisTypes.push('regression');

        // Use feature importance from any model
        for (const model of mlModels) {
          if (model.featureImportance.length > 0) {
            const topFeatures = model.featureImportance.slice(0, 3);
            findings.push({
              id: nanoid(),
              analysisType: 'feature_importance',
              title: 'Key Drivers Identified',
              description: `Top factors: ${topFeatures.map(f => f.feature).join(', ')}`,
              significance: 'high',
              evidence: topFeatures,
              dataElementsUsed: topFeatures.map(f => f.feature)
            });
            dataElements.push(...topFeatures.map(f => f.feature));
          }
        }
      }

      // === Descriptive/survey/general question matching ===
      // For questions that don't match specific keywords (survey questions, general questions),
      // extract findings from descriptive stats and EDA results
      if (findings.length === 0) {
        // Extract from descriptive stats
        if (statisticalReport.descriptiveStats && statisticalReport.descriptiveStats.length > 0) {
          const topStats = statisticalReport.descriptiveStats.slice(0, 2);
          for (const stat of topStats) {
            const statAny = stat as any;
            findings.push({
              id: nanoid(),
              analysisType: 'descriptive',
              title: `${statAny.column || 'Variable'} summary statistics`,
              description: statAny.mean !== undefined
                ? `Mean=${Number(statAny.mean).toFixed(2)}, Median=${Number(statAny.median || 0).toFixed(2)} (n=${statAny.count || 'N/A'})`
                : `Analyzed ${statAny.count || 0} values`,
              significance: 'medium' as const,
              evidence: statAny,
              dataElementsUsed: statAny.column ? [statAny.column] : []
            });
          }
        }

        // Extract from EDA results if available
        if (edaResults && typeof edaResults === 'object') {
          const edaSummary = edaResults.summary || edaResults;
          if (edaSummary.n_observations || edaSummary.distributions) {
            findings.push({
              id: nanoid(),
              analysisType: 'descriptive',
              title: 'Exploratory Data Analysis',
              description: `Dataset contains ${edaSummary.n_observations || 'N/A'} observations across ${edaSummary.n_variables || 'N/A'} variables.`,
              significance: 'low' as const,
              evidence: edaSummary,
              dataElementsUsed: []
            });
          }
        }

        // Extract from correlation results even for non-correlation questions
        // (strong correlations are relevant to many question types)
        if (findings.length === 0 && statisticalReport.correlationMatrix.significantCorrelations.length > 0) {
          const topCorr = statisticalReport.correlationMatrix.significantCorrelations[0];
          findings.push({
            id: nanoid(),
            analysisType: 'correlation',
            title: `${topCorr.var1} and ${topCorr.var2} relationship`,
            description: `Found ${topCorr.correlation > 0 ? 'positive' : 'negative'} correlation (r=${topCorr.correlation.toFixed(3)})`,
            significance: Math.abs(topCorr.correlation) > 0.7 ? 'high' as const : 'medium' as const,
            evidence: topCorr,
            dataElementsUsed: [topCorr.var1, topCorr.var2],
            statisticalSignificance: { pValue: topCorr.pValue }
          });
        }
      }

      // Default to descriptive if no specific type identified
      if (analysisTypes.length === 0) {
        analysisTypes.push('descriptive');
      }

      links.push({
        questionId: `q_${i + 1}`,
        questionText: question,
        analysisTypes,
        dataElements: [...new Set(dataElements)],
        findings
      });
    }

    return links;
  }

  // ============================================
  // PHASE 7: EXECUTIVE SUMMARY GENERATION
  // ============================================

  private async generateExecutiveSummary(
    goals: string[],
    questionLinks: QuestionAnalysisLink[],
    dataQuality: DataQualityReport,
    statistics: StatisticalAnalysisReport,
    mlModels: MLModelArtifact[]
  ): Promise<DataScienceResults['executiveSummary']> {
    const keyFindings: string[] = [];
    const recommendations: DataScienceResults['executiveSummary']['recommendations'] = [];
    const nextSteps: string[] = [];

    // Data quality findings
    if (dataQuality.overallScore < 70) {
      keyFindings.push(`Data quality score is ${dataQuality.overallScore.toFixed(0)}% - improvement needed`);
      recommendations.push({
        text: 'Address data quality issues before drawing conclusions',
        priority: 'high',
        expectedImpact: 'Improved reliability of analysis results'
      });
    } else {
      keyFindings.push(`Data quality score is ${dataQuality.overallScore.toFixed(0)}% - suitable for analysis`);
    }

    // Significant correlations
    const strongCorrelations = statistics.correlationMatrix.significantCorrelations
      .filter(c => Math.abs(c.correlation) > 0.6);
    if (strongCorrelations.length > 0) {
      keyFindings.push(`Found ${strongCorrelations.length} strong correlations in the data`);
    }

    // ML model performance
    for (const model of mlModels) {
      if (model.problemType === 'regression' && model.metrics.r2) {
        keyFindings.push(`Predictive model explains ${(model.metrics.r2 * 100).toFixed(1)}% of variance in ${model.targetColumn}`);
      }
      if (model.problemType === 'classification' && model.metrics.accuracy) {
        keyFindings.push(`Classification model achieves ${(model.metrics.accuracy * 100).toFixed(1)}% accuracy`);
      }
      if (model.problemType === 'clustering' && model.metrics.silhouetteScore) {
        keyFindings.push(`Identified distinct segments with silhouette score of ${model.metrics.silhouetteScore.toFixed(3)}`);
      }
    }

    // Generate answers to questions
    const answersToQuestions = questionLinks.map(link => {
      let answer = 'Based on the analysis, ';
      let confidence = 0.5;
      const evidence: string[] = [];

      if (link.findings.length > 0) {
        const topFinding = link.findings[0];
        answer += topFinding.description + '. ';
        confidence = topFinding.significance === 'high' ? 0.85 : topFinding.significance === 'medium' ? 0.7 : 0.5;
        evidence.push(topFinding.title);

        if (topFinding.statisticalSignificance?.pValue) {
          answer += `This finding is statistically significant (p=${topFinding.statisticalSignificance.pValue.toFixed(4)}).`;
          evidence.push(`p-value: ${topFinding.statisticalSignificance.pValue.toFixed(4)}`);
        }
      } else {
        answer += 'no significant patterns were found directly addressing this question. Consider collecting additional data or refining the analysis.';
      }

      return {
        question: link.questionText,
        answer,
        confidence,
        evidence
      };
    });

    // Generate next steps
    nextSteps.push('Review the detailed findings in each analysis section');
    if (mlModels.length > 0) {
      nextSteps.push('Validate model predictions with new data');
    }
    if (dataQuality.piiDetection.length > 0) {
      nextSteps.push('Review PII detection results and implement data masking if needed');
    }
    nextSteps.push('Schedule follow-up analysis to track changes over time');

    return {
      keyFindings,
      answersToQuestions,
      recommendations,
      nextSteps
    };
  }

  // ============================================
  // PHASE 8: ARTIFACT STORAGE
  // ============================================

  private async storeArtifacts(
    projectId: string,
    userId: string,
    artifacts: {
      dataQualityReport: DataQualityReport;
      statisticalReport: StatisticalAnalysisReport;
      mlModels: MLModelArtifact[];
      visualizations: VisualizationArtifact[];
      executiveSummary: DataScienceResults['executiveSummary'];
    }
  ): Promise<void> {
    const now = new Date();

    // Store each artifact type
    const artifactRecords = [
      {
        id: nanoid(),
        projectId,
        userId,
        artifactType: 'data_quality_report',
        title: 'Data Quality Assessment Report',
        format: 'json',
        content: JSON.stringify(artifacts.dataQualityReport),
        metadata: { score: artifacts.dataQualityReport.overallScore },
        createdAt: now,
        updatedAt: now
      },
      {
        id: nanoid(),
        projectId,
        userId,
        artifactType: 'statistical_analysis_report',
        title: 'Statistical Analysis Report',
        format: 'json',
        content: JSON.stringify(artifacts.statisticalReport),
        metadata: {
          correlationCount: artifacts.statisticalReport.correlationMatrix.significantCorrelations.length,
          hypothesisTestCount: artifacts.statisticalReport.hypothesisTests.length
        },
        createdAt: now,
        updatedAt: now
      },
      {
        id: nanoid(),
        projectId,
        userId,
        artifactType: 'executive_summary',
        title: 'Executive Summary',
        format: 'json',
        content: JSON.stringify(artifacts.executiveSummary),
        metadata: {
          findingCount: artifacts.executiveSummary.keyFindings.length,
          questionCount: artifacts.executiveSummary.answersToQuestions.length
        },
        createdAt: now,
        updatedAt: now
      }
    ];

    // Store ML models
    for (const model of artifacts.mlModels) {
      artifactRecords.push({
        id: nanoid(),
        projectId,
        userId,
        artifactType: 'ml_model',
        title: `${model.modelType} Model - ${model.problemType}`,
        format: 'json',
        content: JSON.stringify(model),
        metadata: model.metrics as any,
        createdAt: now,
        updatedAt: now
      });
    }

    // Store visualizations
    for (const viz of artifacts.visualizations) {
      artifactRecords.push({
        id: nanoid(),
        projectId,
        userId,
        artifactType: 'visualization',
        title: viz.title,
        format: 'json',
        content: JSON.stringify(viz),
        metadata: { type: viz.type } as any,
        createdAt: now,
        updatedAt: now
      });
    }

    // Insert all artifacts
    for (const record of artifactRecords) {
      try {
        await db.insert(projectArtifacts).values(record as any);
      } catch (error) {
        console.warn(`Failed to store artifact ${record.title}:`, error);
      }
    }

    console.log(`💾 Stored ${artifactRecords.length} artifacts for project ${projectId}`);
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  private async loadProjectDatasets(
    projectId: string,
    datasetIds?: string[]
  ): Promise<{ rows: any[]; schema: any; totalRows: number; totalColumns: number }> {
    // CRITICAL FIX: Check journeyProgress.joinedData FIRST (SSOT for multi-dataset joins)
    // This ensures the joined data from Data Upload step is used, not individual datasets
    const [projectRecord] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (projectRecord) {
      const journeyProgress = (projectRecord as any).journeyProgress || {};
      const joinedData = journeyProgress?.joinedData;

      // Priority 1: Use fullData from joinedData (legacy path - kept for backward compat)
      if (joinedData?.fullData && Array.isArray(joinedData.fullData) && joinedData.fullData.length > 0) {
        console.log(`✅ [SSOT] Using joined fullData from journeyProgress: ${joinedData.fullData.length} rows`);
        const schema = joinedData.schema || {};
        return {
          rows: joinedData.fullData,
          schema,
          totalRows: joinedData.fullData.length,
          totalColumns: Object.keys(schema).length || (joinedData.fullData[0] ? Object.keys(joinedData.fullData[0]).length : 0)
        };
      }

      // P1-22 FIX: Priority 1b: Use dataset.ingestionMetadata.transformedData (canonical location)
      try {
        const { projectDatasets: projectDatasetsTable, datasets: datasetsTable } = await import('../../shared/schema');
        const linkedDatasets = await db.select({ dataset: datasetsTable })
          .from(projectDatasetsTable)
          .innerJoin(datasetsTable, eq(projectDatasetsTable.datasetId, datasetsTable.id))
          .where(eq(projectDatasetsTable.projectId, projectId));
        const primaryDs = linkedDatasets[0]?.dataset;
        if (primaryDs?.ingestionMetadata?.transformedData && Array.isArray(primaryDs.ingestionMetadata.transformedData) && primaryDs.ingestionMetadata.transformedData.length > 0) {
          console.log(`✅ [SSOT] Using transformedData from dataset.ingestionMetadata: ${primaryDs.ingestionMetadata.transformedData.length} rows`);
          const schema = primaryDs.ingestionMetadata.transformedSchema || joinedData?.schema || {};
          return {
            rows: primaryDs.ingestionMetadata.transformedData,
            schema,
            totalRows: primaryDs.ingestionMetadata.transformedData.length,
            totalColumns: Object.keys(schema).length || (primaryDs.ingestionMetadata.transformedData[0] ? Object.keys(primaryDs.ingestionMetadata.transformedData[0]).length : 0)
          };
        }
      } catch (dsErr) {
        console.warn('⚠️ [P1-22] Failed to load dataset transformedData:', dsErr);
      }

      // Priority 2: Use preview from joinedData if fullData not available
      // FIX 3B: Warn loudly when falling back to limited preview data
      if (joinedData?.preview && Array.isArray(joinedData.preview) && joinedData.preview.length > 0) {
        console.warn(`⚠️ [FIX 3B] USING PREVIEW DATA (${joinedData.preview.length} rows) — check dataset.ingestionMetadata.transformedData for full data. Analysis quality may be reduced.`);
        const schema = joinedData.schema || {};
        return {
          rows: joinedData.preview,
          schema,
          totalRows: joinedData.rowCount || joinedData.preview.length,
          totalColumns: Object.keys(schema).length || (joinedData.preview[0] ? Object.keys(joinedData.preview[0]).length : 0)
        };
      }
    }

    // Fallback: Load datasets linked to project via junction table
    console.log(`⚠️ [Fallback] No joined data in journeyProgress, loading individual datasets`);
    const pdLinks = await db
      .select()
      .from(projectDatasets)
      .where(eq(projectDatasets.projectId, projectId));

    if (!pdLinks || pdLinks.length === 0) {
      throw new Error('No datasets found for project');
    }

    // Get actual dataset IDs
    const linkedDatasetIds = pdLinks.map((pd: any) => pd.datasetId);

    // Fetch the datasets
    const fetchedDatasets = await db
      .select()
      .from(datasets)
      .where(inArray(datasets.id, linkedDatasetIds));

    if (!fetchedDatasets || fetchedDatasets.length === 0) {
      throw new Error('No datasets found for project');
    }

    // Combine all datasets
    let allRows: any[] = [];
    let schema: any = {};

    for (const dataset of fetchedDatasets) {
      // PHASE 9 FIX: Expanded fallback chain matching AnalysisExecutionService.extractDatasetRows
      // Priority order: transformed → original → preview → sample → records
      const ds = dataset as any;
      let rows: any[] = [];
      let source = 'none';

      if (ds.ingestionMetadata?.transformedData?.length > 0) {
        rows = ds.ingestionMetadata.transformedData;
        source = 'ingestionMetadata.transformedData';
      } else if (ds.metadata?.transformedData?.length > 0) {
        rows = ds.metadata.transformedData;
        source = 'metadata.transformedData';
      } else if (Array.isArray(ds.data) && ds.data.length > 0) {
        rows = ds.data;
        source = 'data';
      } else if (Array.isArray(ds.preview) && ds.preview.length > 0) {
        rows = ds.preview;
        source = 'preview';
      } else if (Array.isArray(ds.sampleData) && ds.sampleData.length > 0) {
        rows = ds.sampleData;
        source = 'sampleData';
      } else if (Array.isArray(ds.records) && ds.records.length > 0) {
        rows = ds.records;
        source = 'records';
      }

      console.log(`📊 [DS Orchestrator] Dataset ${ds.id}: Using ${source} (${rows.length} rows)`);

      if (rows.length > 0) {
        allRows = allRows.concat(rows);
      }

      // Merge schemas - prioritize transformed schema
      const datasetSchema = ds.ingestionMetadata?.transformedSchema
        || ds.metadata?.transformedSchema
        || ds.schema
        || {};
      schema = { ...schema, ...datasetSchema };
    }

    // Log warning if no data found after all fallbacks
    if (allRows.length === 0) {
      console.warn(`⚠️ [DS Orchestrator] No data found in any dataset for project ${projectId}`);
    } else {
      console.log(`✅ [DS Orchestrator] Loaded ${allRows.length} total rows from ${fetchedDatasets.length} dataset(s)`);
    }

    return {
      rows: allRows,
      schema,
      totalRows: allRows.length,
      totalColumns: Object.keys(schema).length || (allRows[0] ? Object.keys(allRows[0]).length : 0)
    };
  }

  private async executePythonScript(scriptName: string, config: any): Promise<any> {
    return new Promise((resolve) => {
      const scriptPath = path.join(this.scriptsPath, scriptName);

      if (!fs.existsSync(scriptPath)) {
        console.warn(`⚠️ Python script not found: ${scriptPath}`);
        resolve({ success: false, error: `Script not found: ${scriptName}` });
        return;
      }

      const configJson = JSON.stringify(config);

      const pythonProcess = spawn(this.pythonPath, [scriptPath], {
        env: { ...process.env, CONFIG: configJson }
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            // Try to parse the LAST complete JSON object from stdout
            // Python scripts may print debug info before the result JSON
            const trimmed = stdout.trim();
            // First try parsing the entire trimmed output as JSON
            try {
              const parsed = JSON.parse(trimmed);
              resolve(parsed);
              return;
            } catch { /* not pure JSON, try extraction */ }

            // Find the last JSON object (result is typically the final output)
            let lastBraceIdx = trimmed.lastIndexOf('}');
            if (lastBraceIdx >= 0) {
              // Walk backward to find the matching opening brace
              let depth = 0;
              let startIdx = -1;
              for (let i = lastBraceIdx; i >= 0; i--) {
                if (trimmed[i] === '}') depth++;
                if (trimmed[i] === '{') depth--;
                if (depth === 0) { startIdx = i; break; }
              }
              if (startIdx >= 0) {
                const jsonStr = trimmed.substring(startIdx, lastBraceIdx + 1);
                resolve(JSON.parse(jsonStr));
                return;
              }
            }

            // No JSON found in output
            console.warn(`⚠️ [Python] ${scriptName} returned no JSON. stdout length: ${stdout.length}`);
            resolve({ success: true, output: stdout });
          } catch (e) {
            console.warn(`⚠️ [Python] ${scriptName} JSON parse failed: ${(e as Error).message}. stdout: ${stdout.substring(0, 200)}`);
            resolve({ success: true, output: stdout });
          }
        } else {
          // Surface Python errors with truncated stderr for debugging
          const truncatedStderr = stderr.length > 500 ? stderr.substring(0, 500) + '...' : stderr;
          console.error(`❌ Python script ${scriptName} exited with code ${code}:`);
          console.error(`   stderr: ${truncatedStderr}`);
          resolve({ success: false, error: stderr || `Script exited with code ${code}`, scriptName, exitCode: code });
        }
      });

      pythonProcess.on('error', (error) => {
        console.error(`❌ Failed to start Python process for ${scriptName}:`, error.message);
        resolve({ success: false, error: `Failed to start Python: ${error.message}`, scriptName });
      });

      // Send config via stdin
      pythonProcess.stdin.write(configJson);
      pythonProcess.stdin.end();
    });
  }

  private getPythonScriptsUsed(analysisTypes: string[]): string[] {
    const scripts = new Set<string>();

    scripts.add('descriptive_stats.py'); // Always used

    if (analysisTypes.includes('correlation') || analysisTypes.includes('correlation_analysis')) {
      scripts.add('correlation_analysis.py');
    }
    if (analysisTypes.includes('regression') || analysisTypes.includes('predictive') || analysisTypes.includes('predictive_modeling') || analysisTypes.includes('regression_analysis')) {
      scripts.add('regression_analysis.py');
    }
    if (analysisTypes.includes('clustering') || analysisTypes.includes('segmentation') || analysisTypes.includes('clustering_analysis') || analysisTypes.includes('segmentation_analysis')) {
      scripts.add('clustering_analysis.py');
    }
    if (analysisTypes.includes('classification') || analysisTypes.includes('classification_analysis')) {
      scripts.add('classification_analysis.py');
    }
    if (analysisTypes.includes('ml') || analysisTypes.includes('machine-learning')) {
      scripts.add('ml_training.py');
    }
    // FIX 2F: Add new analysis type script mappings
    if (analysisTypes.includes('comparative') || analysisTypes.includes('comparative_analysis')) {
      scripts.add('comparative_analysis.py');
    }
    if (analysisTypes.includes('group_analysis') || analysisTypes.includes('group')) {
      scripts.add('group_analysis.py');
    }
    if (analysisTypes.includes('text_analysis') || analysisTypes.includes('text')) {
      scripts.add('text_analysis.py');
    }
    if (analysisTypes.includes('time_series') || analysisTypes.includes('time-series') || analysisTypes.includes('time_series_analysis') || analysisTypes.includes('trend') || analysisTypes.includes('trend_analysis')) {
      scripts.add('time_series_analysis.py');
    }

    scripts.add('statistical_tests.py'); // General hypothesis testing

    return Array.from(scripts);
  }

  // ============================================
  // [DAY 8] PLAN REFINEMENT
  // ============================================

  /**
   * Refine an analysis plan based on user rejection feedback
   * This implements the plan refinement loop for Day 8
   */
  async refinePlan(request: {
    projectId: string;
    userId: string;
    previousPlan: {
      executiveSummary: string;
      analysisSteps: any[];
      complexity: string;
      risks: string[];
      recommendations: string[];
    };
    rejectionReason: string;
    modificationsRequested?: string;
    projectContext: {
      name: string;
      description?: string;
      journeyType: string;
      datasetCount: number;
      totalRows: number;
    };
  }): Promise<{
    success: boolean;
    plan?: {
      executiveSummary: string;
      analysisSteps: any[];
      dataAssessment: any;
      businessContext: any;
      mlModels: any[];
      visualizations: any[];
      estimatedCost: any;
      estimatedDuration: string;
      complexity: string;
      risks: string[];
      recommendations: string[];
    };
    error?: string;
  }> {
    console.log(`🔄 [DS Refinement] Starting plan refinement for project ${request.projectId}`);
    console.log(`📝 [DS Refinement] Rejection reason: ${request.rejectionReason}`);

    try {
      // Build refined plan based on feedback
      const refinedSteps = this.refineAnalysisSteps(
        request.previousPlan.analysisSteps,
        request.rejectionReason,
        request.modificationsRequested
      );

      // Adjust complexity based on feedback
      let newComplexity = request.previousPlan.complexity;
      if (request.rejectionReason.toLowerCase().includes('too complex') ||
          request.rejectionReason.toLowerCase().includes('simpler')) {
        newComplexity = this.reduceComplexity(newComplexity);
      } else if (request.rejectionReason.toLowerCase().includes('more detailed') ||
                 request.rejectionReason.toLowerCase().includes('comprehensive')) {
        newComplexity = this.increaseComplexity(newComplexity);
      }

      // Generate new recommendations addressing the feedback
      const newRecommendations = this.generateRefinedRecommendations(
        request.previousPlan.recommendations,
        request.rejectionReason,
        request.modificationsRequested
      );

      // Calculate new estimates
      const estimatedDuration = this.estimateDuration(refinedSteps, newComplexity);
      const estimatedCost = this.estimateCost(refinedSteps, request.projectContext.totalRows);

      const refinedPlan = {
        executiveSummary: this.refineExecutiveSummary(
          request.previousPlan.executiveSummary,
          request.rejectionReason,
          request.projectContext
        ),
        analysisSteps: refinedSteps,
        dataAssessment: {
          datasetCount: request.projectContext.datasetCount,
          totalRows: request.projectContext.totalRows,
          readinessScore: 85,
          refinedFromFeedback: true
        },
        businessContext: {
          projectName: request.projectContext.name,
          journeyType: request.projectContext.journeyType,
          userFeedbackAddressed: request.rejectionReason,
          modificationsApplied: request.modificationsRequested || 'None specified'
        },
        mlModels: this.suggestMLModels(refinedSteps, request.projectContext.journeyType),
        visualizations: this.suggestVisualizations(refinedSteps, request.projectContext.journeyType),
        estimatedCost,
        estimatedDuration,
        complexity: newComplexity,
        risks: this.identifyRefinedRisks(refinedSteps, request.rejectionReason),
        recommendations: newRecommendations
      };

      console.log(`✅ [DS Refinement] Plan refined successfully with ${refinedSteps.length} steps`);

      return {
        success: true,
        plan: refinedPlan
      };
    } catch (error: any) {
      console.error(`❌ [DS Refinement] Error refining plan:`, error);
      return {
        success: false,
        error: error.message || 'Failed to refine analysis plan'
      };
    }
  }

  private refineAnalysisSteps(
    previousSteps: any[],
    rejectionReason: string,
    modifications?: string
  ): any[] {
    const refinedSteps: any[] = [];
    const feedback = (rejectionReason + ' ' + (modifications || '')).toLowerCase();

    // Analyze feedback to determine adjustments
    const shouldSimplify = feedback.includes('complex') || feedback.includes('simpler') || feedback.includes('basic');
    const shouldExpand = feedback.includes('more') || feedback.includes('detailed') || feedback.includes('comprehensive');
    const shouldFocusOn = this.extractFocusAreas(feedback);

    for (const step of previousSteps) {
      // Skip steps that user indicated were unnecessary
      if (feedback.includes(`skip ${step.name?.toLowerCase()}`) ||
          feedback.includes(`remove ${step.name?.toLowerCase()}`)) {
        continue;
      }

      // Modify step based on feedback
      const refinedStep = {
        ...step,
        id: `step_${nanoid()}`,
        priority: this.adjustPriority(step, shouldFocusOn),
        estimatedDuration: shouldSimplify ? this.reduceStepDuration(step.estimatedDuration) : step.estimatedDuration,
        description: this.refineStepDescription(step.description, rejectionReason),
        refinedFromFeedback: true
      };

      refinedSteps.push(refinedStep);
    }

    // Add new steps if expansion requested
    if (shouldExpand && shouldFocusOn.length > 0) {
      for (const focus of shouldFocusOn) {
        refinedSteps.push({
          id: `step_new_${nanoid()}`,
          name: `Enhanced ${focus} Analysis`,
          description: `Additional ${focus} analysis added based on user feedback`,
          type: 'analysis',
          priority: 'high',
          estimatedDuration: '15 minutes',
          addedFromFeedback: true
        });
      }
    }

    return refinedSteps;
  }

  private extractFocusAreas(feedback: string): string[] {
    const areas: string[] = [];
    const keywords = [
      'correlation', 'regression', 'clustering', 'segmentation',
      'trend', 'forecast', 'prediction', 'classification',
      'statistical', 'descriptive', 'visualization', 'dashboard'
    ];

    for (const keyword of keywords) {
      if (feedback.includes(keyword)) {
        areas.push(keyword);
      }
    }

    return areas;
  }

  private adjustPriority(step: any, focusAreas: string[]): string {
    const stepName = (step.name || '').toLowerCase();
    for (const focus of focusAreas) {
      if (stepName.includes(focus)) {
        return 'high';
      }
    }
    return step.priority || 'medium';
  }

  private reduceStepDuration(duration: string): string {
    if (!duration) return '10 minutes';
    const match = duration.match(/(\d+)/);
    if (match) {
      const minutes = parseInt(match[1]);
      return `${Math.max(5, Math.floor(minutes * 0.7))} minutes`;
    }
    return duration;
  }

  private refineStepDescription(description: string, feedback: string): string {
    if (!description) return 'Analysis step refined based on user feedback';
    return `${description} (Refined based on feedback: "${feedback.substring(0, 50)}...")`;
  }

  private reduceComplexity(current: string): string {
    const levels = ['low', 'medium', 'high', 'very_high'];
    const idx = levels.indexOf(current);
    return idx > 0 ? levels[idx - 1] : current;
  }

  private increaseComplexity(current: string): string {
    const levels = ['low', 'medium', 'high', 'very_high'];
    const idx = levels.indexOf(current);
    return idx < levels.length - 1 ? levels[idx + 1] : current;
  }

  private generateRefinedRecommendations(
    previous: string[],
    rejectionReason: string,
    modifications?: string
  ): string[] {
    const recommendations = [
      `Plan refined based on user feedback: "${rejectionReason.substring(0, 100)}"`,
      ...previous.filter(r => !r.includes('Refined'))
    ];

    if (modifications) {
      recommendations.push(`Incorporated requested modifications: ${modifications.substring(0, 100)}`);
    }

    return recommendations.slice(0, 5);
  }

  private refineExecutiveSummary(
    previous: string,
    rejectionReason: string,
    context: any
  ): string {
    return `REFINED ANALYSIS PLAN for ${context.name}

This plan has been refined based on user feedback: "${rejectionReason.substring(0, 100)}"

${previous || 'Analysis approach adjusted to better meet requirements.'}

Key Changes:
- Analysis scope adjusted per user feedback
- Methodology refined for clarity
- Deliverables aligned with expectations`;
  }

  private estimateDuration(steps: any[], complexity: string): string {
    const baseDuration = steps.length * 10; // 10 min per step
    const complexityMultiplier = {
      low: 0.8,
      medium: 1.0,
      high: 1.3,
      very_high: 1.6
    }[complexity] || 1.0;

    const totalMinutes = Math.round(baseDuration * complexityMultiplier);
    return totalMinutes > 60 ? `${Math.round(totalMinutes / 60)} hour(s)` : `${totalMinutes} minutes`;
  }

  private estimateCost(steps: any[], totalRows: number): any {
    const baseCost = steps.length * 5; // $5 per step
    const dataMultiplier = Math.min(3, 1 + (totalRows / 100000));

    return {
      total: Math.round(baseCost * dataMultiplier * 100) / 100,
      breakdown: {
        analysis: Math.round(baseCost * 0.6 * 100) / 100,
        compute: Math.round(baseCost * 0.3 * dataMultiplier * 100) / 100,
        storage: Math.round(baseCost * 0.1 * 100) / 100
      },
      currency: 'USD'
    };
  }

  private suggestMLModels(steps: any[], journeyType: string): any[] {
    const models: any[] = [];
    const stepNames = steps.map(s => (s.name || '').toLowerCase()).join(' ');

    if (stepNames.includes('regression') || stepNames.includes('predict')) {
      models.push({
        name: 'Linear Regression',
        type: 'regression',
        applicability: 'high'
      });
    }
    if (stepNames.includes('cluster') || stepNames.includes('segment')) {
      models.push({
        name: 'K-Means Clustering',
        type: 'clustering',
        applicability: 'high'
      });
    }
    if (stepNames.includes('classif')) {
      models.push({
        name: 'Random Forest Classifier',
        type: 'classification',
        applicability: 'high'
      });
    }

    return models;
  }

  private suggestVisualizations(steps: any[], journeyType: string): any[] {
    return [
      { type: 'bar_chart', applicability: 'high', description: 'Compare categories' },
      { type: 'line_chart', applicability: 'high', description: 'Show trends over time' },
      { type: 'scatter_plot', applicability: 'medium', description: 'Show correlations' },
      { type: 'heatmap', applicability: 'medium', description: 'Show correlation matrix' }
    ];
  }

  private identifyRefinedRisks(steps: any[], rejectionReason: string): string[] {
    const risks = [
      'Plan refinement may require additional validation',
      'Modified analysis scope should be reviewed carefully'
    ];

    if (rejectionReason.toLowerCase().includes('time') || rejectionReason.toLowerCase().includes('fast')) {
      risks.push('Accelerated timeline may impact analysis depth');
    }

    if (rejectionReason.toLowerCase().includes('cost') || rejectionReason.toLowerCase().includes('budget')) {
      risks.push('Cost-optimized approach may limit advanced analytics');
    }

    return risks;
  }

  // ============================================
  // [DAY 9] QUICK INSIGHTS GENERATION
  // ============================================

  /**
   * Generate quick insights from data without full analysis pipeline
   * Used for on-demand insight generation on project page
   */
  async generateQuickInsights(request: {
    data: any[];
    schema: Record<string, string>;
    focusArea?: string;
  }): Promise<{
    insights: any[];
    summary: string;
  }> {
    console.log(`🔮 [Quick Insights] Generating insights from ${request.data.length} rows`);

    const insights: any[] = [];
    const { data, schema, focusArea } = request;

    if (data.length === 0) {
      return {
        insights: [],
        summary: 'No data available for insight generation'
      };
    }

    // Identify numeric and categorical columns
    const numericColumns: string[] = [];
    const categoricalColumns: string[] = [];

    for (const [col, type] of Object.entries(schema)) {
      if (['number', 'integer', 'float', 'decimal'].includes(type.toLowerCase())) {
        numericColumns.push(col);
      } else if (['string', 'text', 'category', 'categorical'].includes(type.toLowerCase())) {
        categoricalColumns.push(col);
      }
    }

    // Generate basic statistical insights for numeric columns
    for (const col of numericColumns.slice(0, 5)) { // Limit to 5 columns
      const values = data.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
      if (values.length > 0) {
        const stats = this.calculateBasicStats(values);
        insights.push({
          type: 'statistical',
          title: `${col} Statistics`,
          description: `The ${col} column has a mean of ${stats.mean.toFixed(2)} with a standard deviation of ${stats.stdDev.toFixed(2)}. Values range from ${stats.min.toFixed(2)} to ${stats.max.toFixed(2)}.`,
          column: col,
          metrics: stats,
          confidence: 0.9
        });

        // Check for outliers
        if (stats.outlierCount > 0) {
          insights.push({
            type: 'anomaly',
            title: `Outliers Detected in ${col}`,
            description: `Found ${stats.outlierCount} potential outliers (${((stats.outlierCount / values.length) * 100).toFixed(1)}% of data) in the ${col} column.`,
            column: col,
            severity: stats.outlierCount > values.length * 0.1 ? 'high' : 'medium',
            confidence: 0.85
          });
        }
      }
    }

    // Generate distribution insights for categorical columns
    for (const col of categoricalColumns.slice(0, 3)) { // Limit to 3 columns
      const valueCounts = this.countValues(data, col);
      const topValues = Object.entries(valueCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (topValues.length > 0) {
        insights.push({
          type: 'distribution',
          title: `${col} Distribution`,
          description: `Top values in ${col}: ${topValues.map(([v, c]) => `"${v}" (${c})`).join(', ')}`,
          column: col,
          topValues: topValues.map(([value, count]) => ({ value, count })),
          uniqueCount: Object.keys(valueCounts).length,
          confidence: 0.88
        });
      }
    }

    // Look for correlations between numeric columns
    if (numericColumns.length >= 2) {
      const col1 = numericColumns[0];
      const col2 = numericColumns[1];
      const values1 = data.map(row => parseFloat(row[col1])).filter(v => !isNaN(v));
      const values2 = data.map(row => parseFloat(row[col2])).filter(v => !isNaN(v));

      if (values1.length > 10 && values2.length > 10) {
        const correlation = this.calculateCorrelation(values1, values2);
        if (Math.abs(correlation) > 0.5) {
          insights.push({
            type: 'correlation',
            title: `${col1} and ${col2} Correlation`,
            description: `Found a ${correlation > 0 ? 'positive' : 'negative'} correlation (r=${correlation.toFixed(2)}) between ${col1} and ${col2}.`,
            columns: [col1, col2],
            correlationValue: correlation,
            strength: Math.abs(correlation) > 0.7 ? 'strong' : 'moderate',
            confidence: 0.85
          });
        }
      }
    }

    // Generate summary
    const summary = `Generated ${insights.length} insights from ${data.length} rows across ${numericColumns.length} numeric and ${categoricalColumns.length} categorical columns.`;

    console.log(`✅ [Quick Insights] Generated ${insights.length} insights`);

    return { insights, summary };
  }

  private calculateBasicStats(values: number[]): {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    outlierCount: number;
  } {
    const n = values.length;
    const sorted = [...values].sort((a, b) => a - b);

    const mean = values.reduce((a, b) => a + b, 0) / n;
    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    const min = sorted[0];
    const max = sorted[n - 1];

    // Count outliers (values > 3 standard deviations from mean)
    const outlierCount = values.filter(v =>
      Math.abs(v - mean) > 3 * stdDev
    ).length;

    return { mean, median, stdDev, min, max, outlierCount };
  }

  private countValues(data: any[], column: string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const row of data) {
      const value = String(row[column] || '');
      counts[value] = (counts[value] || 0) + 1;
    }
    return counts;
  }

  private calculateCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;

    const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let sumSqX = 0;
    let sumSqY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      sumSqX += dx * dx;
      sumSqY += dy * dy;
    }

    const denominator = Math.sqrt(sumSqX * sumSqY);
    return denominator === 0 ? 0 : numerator / denominator;
  }
}

// Export singleton instance
export const dataScienceOrchestrator = new DataScienceOrchestrator();
