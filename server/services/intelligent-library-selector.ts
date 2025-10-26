/**
 * Intelligent Library Selection Service for Visualization and Analysis
 * 
 * Automatically selects the most performant and appropriate libraries
 * based on dataset characteristics, analysis requirements, and performance needs.
 */

export interface DatasetCharacteristics {
  size: number; // Number of rows
  columns: number; // Number of columns
  dataTypes: {
    numeric: number;
    categorical: number;
    datetime: number;
    text: number;
    boolean: number;
  };
  memoryFootprint: number; // Estimated MB
  sparsity: number; // Percentage of missing values
  cardinality: Record<string, number>; // Unique values per column
}

export interface AnalysisRequirements {
  type: 'descriptive' | 'inferential' | 'predictive' | 'exploratory';
  complexity: 'simple' | 'moderate' | 'complex';
  realTime: boolean;
  interactive: boolean;
  exportFormats: string[];
  performancePriority: 'speed' | 'memory' | 'accuracy' | 'balanced';
}

export interface VisualizationRequirements {
  chartTypes: string[];
  interactivity: 'static' | 'interactive' | 'dashboard';
  dataSize: 'small' | 'medium' | 'large' | 'massive';
  styling: 'basic' | 'professional' | 'custom';
  exportFormats: string[];
  performancePriority: 'speed' | 'memory' | 'quality' | 'balanced';
}

export interface LibraryRecommendation {
  library: string;
  confidence: number; // 0-1
  reasoning: string;
  performanceScore: number; // 0-100
  features: string[];
  limitations: string[];
  alternatives: string[];
}

export class IntelligentLibrarySelector {
  
  /**
   * Select optimal visualization library based on requirements
   */
  selectVisualizationLibrary(
    dataset: DatasetCharacteristics,
    requirements: VisualizationRequirements
  ): LibraryRecommendation[] {
    const recommendations: LibraryRecommendation[] = [];

    // Matplotlib - Best for static, publication-quality plots
    if (requirements.interactivity === 'static' && requirements.styling === 'professional') {
      recommendations.push({
        library: 'matplotlib',
        confidence: 0.9,
        reasoning: 'Matplotlib excels at static, publication-quality visualizations with fine-grained control',
        performanceScore: this.calculateMatplotlibScore(dataset, requirements),
        features: ['publication_quality', 'fine_control', 'extensive_customization', 'latex_integration'],
        limitations: ['no_interactivity', 'steep_learning_curve', 'verbose_syntax'],
        alternatives: ['seaborn', 'plotly']
      });
    }

    // Plotly - Best for interactive visualizations
    if (requirements.interactivity === 'interactive' || requirements.interactivity === 'dashboard') {
      recommendations.push({
        library: 'plotly',
        confidence: 0.95,
        reasoning: 'Plotly provides excellent interactive capabilities with web-based rendering',
        performanceScore: this.calculatePlotlyScore(dataset, requirements),
        features: ['interactive_charts', 'web_based', 'dash_integration', '3d_support'],
        limitations: ['larger_file_sizes', 'browser_dependency'],
        alternatives: ['bokeh', 'altair']
      });
    }

    // Seaborn - Best for statistical visualizations
    if (requirements.chartTypes.some(type => 
      ['distribution', 'correlation', 'regression', 'categorical'].includes(type)
    )) {
      recommendations.push({
        library: 'seaborn',
        confidence: 0.85,
        reasoning: 'Seaborn specializes in statistical visualizations with beautiful defaults',
        performanceScore: this.calculateSeabornScore(dataset, requirements),
        features: ['statistical_plots', 'beautiful_defaults', 'pandas_integration', 'easy_styling'],
        limitations: ['limited_customization', 'matplotlib_dependency'],
        alternatives: ['matplotlib', 'plotly']
      });
    }

    // Bokeh - Best for large datasets and web applications
    if (dataset.size > 100000 || requirements.performancePriority === 'memory') {
      recommendations.push({
        library: 'bokeh',
        confidence: 0.8,
        reasoning: 'Bokeh handles large datasets efficiently with server-side rendering',
        performanceScore: this.calculateBokehScore(dataset, requirements),
        features: ['large_dataset_support', 'server_rendering', 'web_apps', 'streaming_data'],
        limitations: ['complex_setup', 'learning_curve'],
        alternatives: ['plotly', 'dash']
      });
    }

    // Altair - Best for grammar of graphics approach
    if (requirements.complexity === 'moderate' && requirements.styling === 'professional') {
      recommendations.push({
        library: 'altair',
        confidence: 0.75,
        reasoning: 'Altair provides a clean grammar of graphics with Vega-Lite backend',
        performanceScore: this.calculateAltairScore(dataset, requirements),
        features: ['grammar_of_graphics', 'declarative_syntax', 'vega_lite', 'jupyter_integration'],
        limitations: ['limited_chart_types', 'performance_with_large_data'],
        alternatives: ['plotly', 'seaborn']
      });
    }

    // D3.js - Best for custom, highly interactive visualizations
    if (requirements.styling === 'custom' && requirements.interactivity === 'interactive') {
      recommendations.push({
        library: 'd3',
        confidence: 0.7,
        reasoning: 'D3.js provides ultimate flexibility for custom interactive visualizations',
        performanceScore: this.calculateD3Score(dataset, requirements),
        features: ['ultimate_flexibility', 'custom_interactions', 'web_standards', 'extensive_ecosystem'],
        limitations: ['steep_learning_curve', 'development_time', 'javascript_required'],
        alternatives: ['plotly', 'bokeh']
      });
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Select optimal statistical analysis library
   */
  selectStatisticalLibrary(
    dataset: DatasetCharacteristics,
    requirements: AnalysisRequirements
  ): LibraryRecommendation[] {
    const recommendations: LibraryRecommendation[] = [];

    // SciPy - Best for general statistical analysis
    if (requirements.type === 'inferential' || requirements.type === 'descriptive') {
      recommendations.push({
        library: 'scipy',
        confidence: 0.9,
        reasoning: 'SciPy provides comprehensive statistical functions and hypothesis testing',
        performanceScore: this.calculateSciPyScore(dataset, requirements),
        features: ['statistical_tests', 'distributions', 'optimization', 'signal_processing'],
        limitations: ['no_dataframe_integration', 'manual_data_preparation'],
        alternatives: ['statsmodels', 'pandas']
      });
    }

    // Statsmodels - Best for econometric and statistical modeling
    if (requirements.type === 'inferential' && requirements.complexity === 'complex') {
      recommendations.push({
        library: 'statsmodels',
        confidence: 0.95,
        reasoning: 'Statsmodels excels at econometric analysis and statistical modeling',
        performanceScore: this.calculateStatsmodelsScore(dataset, requirements),
        features: ['regression_analysis', 'time_series', 'econometric_models', 'hypothesis_testing'],
        limitations: ['memory_intensive', 'slower_than_scipy'],
        alternatives: ['scipy', 'sklearn']
      });
    }

    // Pandas - Best for exploratory data analysis
    if (requirements.type === 'exploratory' || requirements.type === 'descriptive') {
      recommendations.push({
        library: 'pandas',
        confidence: 0.85,
        reasoning: 'Pandas provides excellent tools for data manipulation and exploratory analysis',
        performanceScore: this.calculatePandasScore(dataset, requirements),
        features: ['data_manipulation', 'groupby_operations', 'time_series', 'data_io'],
        limitations: ['memory_usage', 'single_threaded'],
        alternatives: ['dask', 'polars']
      });
    }

    // NumPy - Best for numerical computations
    if (requirements.performancePriority === 'speed' && dataset.dataTypes.numeric > dataset.dataTypes.categorical) {
      recommendations.push({
        library: 'numpy',
        confidence: 0.8,
        reasoning: 'NumPy provides the fastest numerical computations for array operations',
        performanceScore: this.calculateNumPyScore(dataset, requirements),
        features: ['fast_array_ops', 'linear_algebra', 'random_sampling', 'broadcasting'],
        limitations: ['no_dataframe_features', 'manual_indexing'],
        alternatives: ['pandas', 'numba']
      });
    }

    // Dask - Best for large datasets
    if (dataset.size > 1000000 || requirements.performancePriority === 'memory') {
      recommendations.push({
        library: 'dask',
        confidence: 0.75,
        reasoning: 'Dask enables parallel processing for large datasets that exceed memory',
        performanceScore: this.calculateDaskScore(dataset, requirements),
        features: ['parallel_processing', 'out_of_core', 'distributed_computing', 'pandas_compatible'],
        limitations: ['overhead_for_small_data', 'complexity'],
        alternatives: ['pandas', 'polars']
      });
    }

    // Polars - Best for high-performance data processing
    if (requirements.performancePriority === 'speed' && dataset.size > 100000) {
      recommendations.push({
        library: 'polars',
        confidence: 0.8,
        reasoning: 'Polars provides extremely fast data processing with Rust backend',
        performanceScore: this.calculatePolarsScore(dataset, requirements),
        features: ['rust_backend', 'lazy_evaluation', 'parallel_processing', 'memory_efficient'],
        limitations: ['newer_ecosystem', 'learning_curve'],
        alternatives: ['pandas', 'dask']
      });
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Select optimal advanced analysis library
   */
  selectAdvancedAnalysisLibrary(
    dataset: DatasetCharacteristics,
    requirements: AnalysisRequirements
  ): LibraryRecommendation[] {
    const recommendations: LibraryRecommendation[] = [];

    // Scikit-learn - Best for machine learning and advanced analytics
    if (requirements.type === 'predictive' || requirements.complexity === 'complex') {
      recommendations.push({
        library: 'sklearn',
        confidence: 0.9,
        reasoning: 'Scikit-learn provides comprehensive machine learning algorithms and tools',
        performanceScore: this.calculateSklearnScore(dataset, requirements),
        features: ['ml_algorithms', 'model_selection', 'preprocessing', 'evaluation_metrics'],
        limitations: ['single_machine', 'limited_deep_learning'],
        alternatives: ['xgboost', 'lightgbm', 'tensorflow']
      });
    }

    // XGBoost - Best for gradient boosting
    if (requirements.type === 'predictive' && dataset.dataTypes.categorical > 0) {
      recommendations.push({
        library: 'xgboost',
        confidence: 0.85,
        reasoning: 'XGBoost excels at gradient boosting with excellent performance on structured data',
        performanceScore: this.calculateXGBoostScore(dataset, requirements),
        features: ['gradient_boosting', 'categorical_support', 'feature_importance', 'early_stopping'],
        limitations: ['memory_intensive', 'hyperparameter_tuning'],
        alternatives: ['lightgbm', 'catboost']
      });
    }

    // LightGBM - Best for speed and memory efficiency
    if (requirements.performancePriority === 'speed' && requirements.type === 'predictive') {
      recommendations.push({
        library: 'lightgbm',
        confidence: 0.8,
        reasoning: 'LightGBM provides fast gradient boosting with low memory usage',
        performanceScore: this.calculateLightGBMScore(dataset, requirements),
        features: ['fast_training', 'low_memory', 'categorical_features', 'gpu_support'],
        limitations: ['small_dataset_overfitting', 'parameter_sensitivity'],
        alternatives: ['xgboost', 'catboost']
      });
    }

    // TensorFlow - Best for deep learning and neural networks
    if (requirements.complexity === 'complex' && dataset.dataTypes.text > 0) {
      recommendations.push({
        library: 'tensorflow',
        confidence: 0.75,
        reasoning: 'TensorFlow excels at deep learning and neural network applications',
        performanceScore: this.calculateTensorFlowScore(dataset, requirements),
        features: ['deep_learning', 'neural_networks', 'gpu_acceleration', 'production_deployment'],
        limitations: ['steep_learning_curve', 'overkill_for_simple_tasks'],
        alternatives: ['pytorch', 'sklearn']
      });
    }

    // PyTorch - Best for research and experimentation
    if (requirements.complexity === 'complex' && requirements.type === 'predictive') {
      recommendations.push({
        library: 'pytorch',
        confidence: 0.7,
        reasoning: 'PyTorch provides flexible deep learning with dynamic computation graphs',
        performanceScore: this.calculatePyTorchScore(dataset, requirements),
        features: ['dynamic_graphs', 'research_friendly', 'pythonic', 'gpu_acceleration'],
        limitations: ['production_deployment', 'learning_curve'],
        alternatives: ['tensorflow', 'sklearn']
      });
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }

  // Performance calculation methods
  private calculateMatplotlibScore(dataset: DatasetCharacteristics, requirements: VisualizationRequirements): number {
    let score = 70;
    if (requirements.styling === 'professional') score += 20;
    if (requirements.interactivity === 'static') score += 10;
    if (dataset.size > 100000) score -= 15;
    return Math.max(0, Math.min(100, score));
  }

  private calculatePlotlyScore(dataset: DatasetCharacteristics, requirements: VisualizationRequirements): number {
    let score = 80;
    if (requirements.interactivity === 'interactive') score += 15;
    if (requirements.interactivity === 'dashboard') score += 10;
    if (dataset.size > 500000) score -= 20;
    return Math.max(0, Math.min(100, score));
  }

  private calculateSeabornScore(dataset: DatasetCharacteristics, requirements: VisualizationRequirements): number {
    let score = 75;
    if (requirements.chartTypes.includes('distribution')) score += 15;
    if (requirements.styling === 'professional') score += 10;
    if (dataset.size > 200000) score -= 10;
    return Math.max(0, Math.min(100, score));
  }

  private calculateBokehScore(dataset: DatasetCharacteristics, requirements: VisualizationRequirements): number {
    let score = 65;
    if (dataset.size > 100000) score += 25;
    if (requirements.performancePriority === 'memory') score += 15;
    if (requirements.interactivity === 'dashboard') score += 10;
    return Math.max(0, Math.min(100, score));
  }

  private calculateAltairScore(dataset: DatasetCharacteristics, requirements: VisualizationRequirements): number {
    let score = 70;
    if (requirements.styling === 'professional') score += 15;
    if (requirements.complexity === 'moderate') score += 10;
    if (dataset.size > 100000) score -= 20;
    return Math.max(0, Math.min(100, score));
  }

  private calculateD3Score(dataset: DatasetCharacteristics, requirements: VisualizationRequirements): number {
    let score = 60;
    if (requirements.styling === 'custom') score += 25;
    if (requirements.interactivity === 'interactive') score += 15;
    if (requirements.complexity === 'complex') score += 10;
    return Math.max(0, Math.min(100, score));
  }

  private calculateSciPyScore(dataset: DatasetCharacteristics, requirements: AnalysisRequirements): number {
    let score = 85;
    if (requirements.type === 'inferential') score += 10;
    if (requirements.performancePriority === 'speed') score += 10;
    if (dataset.dataTypes.numeric > dataset.dataTypes.categorical) score += 5;
    return Math.max(0, Math.min(100, score));
  }

  private calculateStatsmodelsScore(dataset: DatasetCharacteristics, requirements: AnalysisRequirements): number {
    let score = 80;
    if (requirements.type === 'inferential') score += 15;
    if (requirements.complexity === 'complex') score += 10;
    if (dataset.dataTypes.datetime > 0) score += 5;
    return Math.max(0, Math.min(100, score));
  }

  private calculatePandasScore(dataset: DatasetCharacteristics, requirements: AnalysisRequirements): number {
    let score = 75;
    if (requirements.type === 'exploratory') score += 15;
    if (requirements.type === 'descriptive') score += 10;
    if (dataset.size > 1000000) score -= 15;
    return Math.max(0, Math.min(100, score));
  }

  private calculateNumPyScore(dataset: DatasetCharacteristics, requirements: AnalysisRequirements): number {
    let score = 90;
    if (requirements.performancePriority === 'speed') score += 10;
    if (dataset.dataTypes.numeric > dataset.dataTypes.categorical * 2) score += 10;
    if (dataset.size > 1000000) score -= 5;
    return Math.max(0, Math.min(100, score));
  }

  private calculateDaskScore(dataset: DatasetCharacteristics, requirements: AnalysisRequirements): number {
    let score = 70;
    if (dataset.size > 1000000) score += 25;
    if (requirements.performancePriority === 'memory') score += 15;
    if (dataset.size < 100000) score -= 20;
    return Math.max(0, Math.min(100, score));
  }

  private calculatePolarsScore(dataset: DatasetCharacteristics, requirements: AnalysisRequirements): number {
    let score = 80;
    if (requirements.performancePriority === 'speed') score += 15;
    if (dataset.size > 100000) score += 10;
    if (requirements.type === 'exploratory') score += 5;
    return Math.max(0, Math.min(100, score));
  }

  private calculateSklearnScore(dataset: DatasetCharacteristics, requirements: AnalysisRequirements): number {
    let score = 85;
    if (requirements.type === 'predictive') score += 10;
    if (requirements.complexity === 'complex') score += 10;
    if (dataset.dataTypes.numeric > dataset.dataTypes.categorical) score += 5;
    return Math.max(0, Math.min(100, score));
  }

  private calculateXGBoostScore(dataset: DatasetCharacteristics, requirements: AnalysisRequirements): number {
    let score = 80;
    if (requirements.type === 'predictive') score += 15;
    if (dataset.dataTypes.categorical > 0) score += 10;
    if (dataset.size > 10000) score += 5;
    return Math.max(0, Math.min(100, score));
  }

  private calculateLightGBMScore(dataset: DatasetCharacteristics, requirements: AnalysisRequirements): number {
    let score = 75;
    if (requirements.performancePriority === 'speed') score += 20;
    if (requirements.type === 'predictive') score += 10;
    if (dataset.size > 100000) score += 10;
    return Math.max(0, Math.min(100, score));
  }

  private calculateTensorFlowScore(dataset: DatasetCharacteristics, requirements: AnalysisRequirements): number {
    let score = 70;
    if (requirements.complexity === 'complex') score += 20;
    if (dataset.dataTypes.text > 0) score += 15;
    if (requirements.type === 'predictive') score += 10;
    return Math.max(0, Math.min(100, score));
  }

  private calculatePyTorchScore(dataset: DatasetCharacteristics, requirements: AnalysisRequirements): number {
    let score = 65;
    if (requirements.complexity === 'complex') score += 20;
    if (requirements.type === 'predictive') score += 15;
    if (dataset.dataTypes.text > 0) score += 10;
    return Math.max(0, Math.min(100, score));
  }
}

export const intelligentLibrarySelector = new IntelligentLibrarySelector();


