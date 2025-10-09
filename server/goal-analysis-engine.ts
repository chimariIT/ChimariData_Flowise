import { multiAIService } from './multi-ai-service';
import { questionAnalyzer, QuestionAnalysisResult } from './question-analyzer';

export interface AnalysisGoal {
  id: string;
  goal: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  type: 'descriptive' | 'predictive' | 'diagnostic' | 'prescriptive';
  complexity: 'basic' | 'intermediate' | 'advanced';
  confidence: number;
  requiredComponents: string[];
  estimatedWorkHours: number;
  dataRequirements: DataRequirement[];
}

export interface DataRequirement {
  type: 'sample_size' | 'feature_engineering' | 'data_quality' | 'preprocessing' | 'validation';
  description: string;
  impact: 'low' | 'medium' | 'high';
  estimatedHours: number;
}

export interface WorkComponent {
  id: string;
  name: string;
  description: string;
  type: 'data_preparation' | 'statistical_analysis' | 'ml_modeling' | 'visualization' | 'validation';
  complexity: 'basic' | 'intermediate' | 'advanced';
  estimatedHours: number;
  dependencies: string[];
  requirements: string[];
}

export interface GoalAnalysisResult {
  goals: AnalysisGoal[];
  totalComplexityScore: number;
  recommendedApproaches: string[];
  estimatedTotalHours: number;
  workComponents: WorkComponent[];
  riskFactors: string[];
  suggestions: string[];
}

export class GoalAnalysisEngine {
  private static instance: GoalAnalysisEngine;

  public static getInstance(): GoalAnalysisEngine {
    if (!GoalAnalysisEngine.instance) {
      GoalAnalysisEngine.instance = new GoalAnalysisEngine();
    }
    return GoalAnalysisEngine.instance;
  }

  /**
   * Analyze journey goals and questions to determine work breakdown and complexity
   */
  async analyzeJourneyGoals(
    goals: string[], 
    questions: string[], 
    journeyType: string,
    dataContext?: {
      columns?: string[];
      recordCount?: number;
      dataTypes?: Record<string, string>;
    }
  ): Promise<GoalAnalysisResult> {
    try {
      console.log(`Analyzing ${goals.length} goals and ${questions.length} questions for ${journeyType} journey`);

      // Step 1: Analyze individual goals
      const analyzedGoals = await this.analyzeIndividualGoals(goals, journeyType, dataContext);
      
      // Step 2: Analyze business questions for additional context
      const questionAnalysis = await this.analyzeBusinessQuestions(questions, dataContext?.columns || []);
      
      // Step 3: Generate work components based on goals and questions
      const workComponents = await this.generateWorkComponents(analyzedGoals, questionAnalysis, journeyType);
      
      // Step 4: Calculate complexity and effort estimates
      const complexityAnalysis = this.calculateComplexityMetrics(analyzedGoals, workComponents);
      
      // Step 5: Generate recommendations and risk assessment
      const recommendations = await this.generateRecommendations(analyzedGoals, workComponents, journeyType);

      return {
        goals: analyzedGoals,
        totalComplexityScore: complexityAnalysis.totalScore,
        recommendedApproaches: recommendations.approaches,
        estimatedTotalHours: complexityAnalysis.totalHours,
        workComponents,
        riskFactors: recommendations.risks,
        suggestions: recommendations.suggestions
      };

    } catch (error) {
      console.error('Goal analysis failed:', error);
      
      // Return fallback analysis
      return this.generateFallbackAnalysis(goals, questions, journeyType);
    }
  }

  /**
   * Analyze individual goals for type, complexity, and requirements
   */
  private async analyzeIndividualGoals(
    goals: string[], 
    journeyType: string,
    dataContext?: any
  ): Promise<AnalysisGoal[]> {
    const analyzedGoals: AnalysisGoal[] = [];

    for (let i = 0; i < goals.length; i++) {
      const goal = goals[i];
      
      try {
        const prompt = `Analyze this data analysis goal for complexity and requirements:
Goal: "${goal}"
Journey Type: ${journeyType}
Data Context: ${JSON.stringify(dataContext || {})}

Provide a JSON response with:
{
  "type": "descriptive|predictive|diagnostic|prescriptive",
  "complexity": "basic|intermediate|advanced", 
  "category": "business category (e.g., Customer Analytics, Financial Analysis)",
  "priority": "high|medium|low",
  "confidence": 0.85,
  "requiredComponents": ["statistical_analysis", "visualization", "data_preprocessing"],
  "estimatedWorkHours": 12,
  "dataRequirements": [
    {
      "type": "sample_size|feature_engineering|data_quality|preprocessing|validation",
      "description": "specific requirement description",
      "impact": "high|medium|low",
      "estimatedHours": 2
    }
  ]
}`;

        const aiResult = await multiAIService.analyzeWithFallback(prompt, dataContext || {});
        const analysis = this.parseGoalAnalysis(aiResult.result, goal, i);
        
        analyzedGoals.push(analysis);
        
      } catch (error) {
        console.error(`Failed to analyze goal ${i + 1}:`, error);
        analyzedGoals.push(this.createFallbackGoalAnalysis(goal, i, journeyType));
      }
    }

    return analyzedGoals;
  }

  /**
   * Analyze business questions for complexity and data requirements
   */
  private async analyzeBusinessQuestions(
    questions: string[], 
    columns: string[]
  ): Promise<QuestionAnalysisResult[]> {
    const results: QuestionAnalysisResult[] = [];

    for (const question of questions) {
      try {
        const analysis = await questionAnalyzer.analyzeQuestion(question, columns);
        results.push(analysis);
      } catch (error) {
        console.error('Question analysis failed:', error);
        results.push({
          entity: "unknown",
          confidence: 0.3,
          suggestedColumns: [],
          analysisType: "descriptive",
          complexity: "medium",
          dataRequirements: []
        });
      }
    }

    return results;
  }

  /**
   * Generate work components based on analyzed goals and questions
   */
  private async generateWorkComponents(
    goals: AnalysisGoal[], 
    questionAnalysis: QuestionAnalysisResult[],
    journeyType: string
  ): Promise<WorkComponent[]> {
    const components: WorkComponent[] = [];
    const componentSet = new Set<string>();

    // Base components needed for all journeys
    const baseComponents = this.getBaseComponents(journeyType);
    baseComponents.forEach(comp => {
      if (!componentSet.has(comp.id)) {
        components.push(comp);
        componentSet.add(comp.id);
      }
    });

    // Add components based on goal analysis
    for (const goal of goals) {
      const goalComponents = this.mapGoalToComponents(goal, questionAnalysis);
      goalComponents.forEach(comp => {
        if (!componentSet.has(comp.id)) {
          components.push(comp);
          componentSet.add(comp.id);
        }
      });
    }

    // Add complexity-specific components
    const complexityComponents = this.getComplexityComponents(goals, journeyType);
    complexityComponents.forEach(comp => {
      if (!componentSet.has(comp.id)) {
        components.push(comp);
        componentSet.add(comp.id);
      }
    });

    return components;
  }

  /**
   * Calculate overall complexity metrics and effort estimates
   */
  private calculateComplexityMetrics(goals: AnalysisGoal[], workComponents: WorkComponent[]) {
    // Base complexity from goals
    const goalComplexity = goals.reduce((total, goal) => {
      const complexityWeight = { basic: 1, intermediate: 2, advanced: 3 }[goal.complexity];
      const priorityWeight = { low: 1, medium: 1.5, high: 2 }[goal.priority];
      return total + (complexityWeight * priorityWeight);
    }, 0);

    // Component complexity
    const componentComplexity = workComponents.reduce((total, component) => {
      const complexityWeight = { basic: 1, intermediate: 2, advanced: 3 }[component.complexity];
      return total + complexityWeight;
    }, 0);

    // Calculate total hours
    const goalHours = goals.reduce((total, goal) => total + goal.estimatedWorkHours, 0);
    const componentHours = workComponents.reduce((total, component) => total + component.estimatedHours, 0);
    const totalHours = Math.max(goalHours, componentHours); // Take the higher estimate

    return {
      totalScore: goalComplexity + componentComplexity,
      totalHours,
      averageGoalComplexity: goalComplexity / Math.max(goals.length, 1),
      averageComponentComplexity: componentComplexity / Math.max(workComponents.length, 1)
    };
  }

  /**
   * Generate recommendations and risk assessment
   */
  private async generateRecommendations(
    goals: AnalysisGoal[], 
    workComponents: WorkComponent[],
    journeyType: string
  ) {
    const approaches: string[] = [];
    const risks: string[] = [];
    const suggestions: string[] = [];

    // Determine recommended approaches based on goal types
    const goalTypes = Array.from(new Set(goals.map(g => g.type)));
    const complexityLevels = Array.from(new Set(goals.map(g => g.complexity)));

    // Approach recommendations
    if (goalTypes.includes('predictive')) {
      approaches.push('machine_learning');
    }
    if (goalTypes.includes('descriptive')) {
      approaches.push('statistical_analysis');
    }
    if (goalTypes.includes('diagnostic')) {
      approaches.push('correlation_analysis');
    }
    if (complexityLevels.includes('advanced')) {
      approaches.push('advanced_analytics');
    }

    // Risk assessment
    if (complexityLevels.includes('advanced') && journeyType === 'guided') {
      risks.push('Complex analysis may require expert guidance');
    }
    if (goals.length > 5) {
      risks.push('Large number of goals may increase delivery time');
    }
    if (goals.some(g => g.confidence < 0.6)) {
      risks.push('Some goals may require clarification');
    }

    // Suggestions
    if (journeyType === 'guided' && complexityLevels.includes('advanced')) {
      suggestions.push('Consider upgrading to technical journey for advanced features');
    }
    if (goalTypes.includes('predictive') && !workComponents.some(c => c.type === 'ml_modeling')) {
      suggestions.push('Machine learning models recommended for predictive goals');
    }

    return { approaches, risks, suggestions };
  }

  /**
   * Parse AI response for goal analysis
   */
  private parseGoalAnalysis(aiResponse: string, originalGoal: string, index: number): AnalysisGoal {
    try {
      const parsed = JSON.parse(aiResponse);
      return {
        id: `goal_${index + 1}`,
        goal: originalGoal,
        category: parsed.category || 'General Analysis',
        priority: parsed.priority || 'medium',
        type: parsed.type || 'descriptive',
        complexity: parsed.complexity || 'intermediate',
        confidence: parsed.confidence || 0.7,
        requiredComponents: parsed.requiredComponents || ['statistical_analysis'],
        estimatedWorkHours: parsed.estimatedWorkHours || 8,
        dataRequirements: parsed.dataRequirements || []
      };
    } catch (error) {
      console.error('Failed to parse goal analysis:', error);
      return this.createFallbackGoalAnalysis(originalGoal, index, 'guided');
    }
  }

  /**
   * Create fallback goal analysis when AI fails
   */
  private createFallbackGoalAnalysis(goal: string, index: number, journeyType: string): AnalysisGoal {
    // Simple heuristics for fallback analysis
    const isComplex = goal.toLowerCase().includes('predict') || goal.toLowerCase().includes('model') || goal.toLowerCase().includes('machine');
    const isDescriptive = goal.toLowerCase().includes('analyze') || goal.toLowerCase().includes('understand') || goal.toLowerCase().includes('explore');
    
    return {
      id: `goal_${index + 1}`,
      goal,
      category: 'General Analysis',
      priority: 'medium',
      type: isComplex ? 'predictive' : isDescriptive ? 'descriptive' : 'diagnostic',
      complexity: isComplex ? 'advanced' : 'intermediate',
      confidence: 0.5,
      requiredComponents: isComplex ? ['ml_modeling', 'data_preprocessing'] : ['statistical_analysis'],
      estimatedWorkHours: isComplex ? 16 : 8,
      dataRequirements: [{
        type: 'data_quality',
        description: 'Standard data quality checks required',
        impact: 'medium',
        estimatedHours: 2
      }]
    };
  }

  /**
   * Get base components required for all journey types
   */
  private getBaseComponents(journeyType: string): WorkComponent[] {
    const base: WorkComponent[] = [
      {
        id: 'data_upload',
        name: 'Data Upload & Validation',
        description: 'Upload and validate data files',
        type: 'data_preparation',
        complexity: 'basic',
        estimatedHours: 1,
        dependencies: [],
        requirements: ['valid_data_file']
      },
      {
        id: 'data_exploration',
        name: 'Data Exploration',
        description: 'Initial data exploration and profiling',
        type: 'statistical_analysis',
        complexity: 'basic',
        estimatedHours: 2,
        dependencies: ['data_upload'],
        requirements: ['clean_data']
      }
    ];

    if (journeyType === 'technical') {
      base.push({
        id: 'advanced_preprocessing',
        name: 'Advanced Data Preprocessing',
        description: 'Feature engineering and advanced data transformations',
        type: 'data_preparation',
        complexity: 'advanced',
        estimatedHours: 4,
        dependencies: ['data_exploration'],
        requirements: ['domain_knowledge']
      });
    }

    return base;
  }

  /**
   * Map goals to specific work components
   */
  private mapGoalToComponents(goal: AnalysisGoal, questionAnalysis: QuestionAnalysisResult[]): WorkComponent[] {
    const components: WorkComponent[] = [];

    // Add components based on goal type
    if (goal.type === 'predictive') {
      components.push({
        id: 'ml_modeling',
        name: 'Machine Learning Modeling',
        description: 'Build and train predictive models',
        type: 'ml_modeling',
        complexity: goal.complexity,
        estimatedHours: goal.complexity === 'advanced' ? 12 : 8,
        dependencies: ['data_preprocessing'],
        requirements: ['sufficient_data', 'target_variable']
      });
    }

    if (goal.complexity === 'advanced') {
      components.push({
        id: 'advanced_visualization',
        name: 'Advanced Visualization',
        description: 'Create interactive and advanced visualizations',
        type: 'visualization',
        complexity: 'advanced',
        estimatedHours: 4,
        dependencies: ['statistical_analysis'],
        requirements: ['visualization_requirements']
      });
    }

    return components;
  }

  /**
   * Get additional components based on overall complexity
   */
  private getComplexityComponents(goals: AnalysisGoal[], journeyType: string): WorkComponent[] {
    const components: WorkComponent[] = [];
    const hasAdvancedGoals = goals.some(g => g.complexity === 'advanced');
    const hasPredictiveGoals = goals.some(g => g.type === 'predictive');

    if (hasAdvancedGoals) {
      components.push({
        id: 'model_validation',
        name: 'Model Validation & Testing',
        description: 'Validate model performance and conduct statistical tests',
        type: 'validation',
        complexity: 'advanced',
        estimatedHours: 6,
        dependencies: ['ml_modeling'],
        requirements: ['test_data']
      });
    }

    if (hasPredictiveGoals && journeyType === 'technical') {
      components.push({
        id: 'hyperparameter_tuning',
        name: 'Hyperparameter Optimization',
        description: 'Optimize model parameters for best performance',
        type: 'ml_modeling',
        complexity: 'advanced',
        estimatedHours: 8,
        dependencies: ['ml_modeling'],
        requirements: ['computational_resources']
      });
    }

    return components;
  }

  /**
   * Generate fallback analysis when full analysis fails
   */
  private generateFallbackAnalysis(goals: string[], questions: string[], journeyType: string): GoalAnalysisResult {
    const fallbackGoals: AnalysisGoal[] = goals.map((goal, index) => 
      this.createFallbackGoalAnalysis(goal, index, journeyType)
    );

    const baseComponents = this.getBaseComponents(journeyType);

    return {
      goals: fallbackGoals,
      totalComplexityScore: fallbackGoals.length * 2, // Simple fallback scoring
      recommendedApproaches: ['statistical_analysis'],
      estimatedTotalHours: fallbackGoals.reduce((total, goal) => total + goal.estimatedWorkHours, 0),
      workComponents: baseComponents,
      riskFactors: ['Analysis performed with limited AI assistance'],
      suggestions: ['Consider providing more specific goals for better analysis']
    };
  }
}

export const goalAnalysisEngine = GoalAnalysisEngine.getInstance();