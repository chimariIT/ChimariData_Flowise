import { goalAnalysisEngine, AnalysisGoal, WorkComponent } from './goal-analysis-engine';

export interface CostBreakdown {
  component: WorkComponent;
  baseCost: number;
  complexityMultiplier: number;
  journeyMultiplier: number;
  dataSizeMultiplier: number;
  finalCost: number;
  reasoning: string;
}

export interface WorkBreakdownResult {
  workComponents: WorkComponent[];
  costBreakdowns: CostBreakdown[];
  totalEstimatedCost: number;
  totalEstimatedHours: number;
  complexityScore: number;
  recommendations: string[];
  riskAdjustment: number;
}

export class WorkBreakdownService {
  private static instance: WorkBreakdownService;

  // Base hourly rates in cents (divide by 100 for dollars)
  private readonly HOURLY_RATES = {
    data_preparation: 2500, // $25/hour
    statistical_analysis: 3500, // $35/hour  
    ml_modeling: 5000, // $50/hour
    visualization: 3000, // $30/hour
    validation: 4000, // $40/hour
  };

  // Complexity multipliers for work components
  private readonly COMPLEXITY_MULTIPLIERS = {
    basic: 1.0,
    intermediate: 1.3,
    advanced: 1.8,
  };

  // Journey type multipliers
  private readonly JOURNEY_MULTIPLIERS = {
    guided: 1.0,
    business: 1.15,
    technical: 1.4,
  };

  // Data size cost factors (per MB processed)
  private readonly DATA_SIZE_FACTORS = {
    data_preparation: 15, // $0.15 per MB
    statistical_analysis: 10, // $0.10 per MB
    ml_modeling: 25, // $0.25 per MB
    visualization: 5, // $0.05 per MB
    validation: 20, // $0.20 per MB
  };

  public static getInstance(): WorkBreakdownService {
    if (!WorkBreakdownService.instance) {
      WorkBreakdownService.instance = new WorkBreakdownService();
    }
    return WorkBreakdownService.instance;
  }

  /**
   * Break down analysis goals into detailed work components with cost estimates
   */
  async breakdownGoalsToWork(
    goals: string[],
    questions: string[],
    journeyType: string,
    dataContext: {
      sizeInMB?: number;
      recordCount?: number;
      columns?: string[];
      complexity?: string;
    } = {}
  ): Promise<WorkBreakdownResult> {
    try {
      console.log(`Breaking down ${goals.length} goals for ${journeyType} journey`);

      // Use goal analysis engine to get detailed goal analysis
      const goalAnalysis = await goalAnalysisEngine.analyzeJourneyGoals(
        goals, 
        questions, 
        journeyType,
        dataContext
      );

      // Calculate cost breakdown for each work component
      const costBreakdowns = this.calculateComponentCosts(
        goalAnalysis.workComponents,
        journeyType,
        dataContext.sizeInMB || 0,
        goalAnalysis.totalComplexityScore
      );

      // Calculate total costs and apply risk adjustments
      const { totalCost, riskAdjustment } = this.calculateTotalCostWithRisk(
        costBreakdowns,
        goalAnalysis.riskFactors,
        journeyType
      );

      // Generate recommendations for cost optimization
      const recommendations = this.generateCostOptimizationRecommendations(
        costBreakdowns,
        goalAnalysis,
        journeyType
      );

      return {
        workComponents: goalAnalysis.workComponents,
        costBreakdowns,
        totalEstimatedCost: totalCost,
        totalEstimatedHours: goalAnalysis.estimatedTotalHours,
        complexityScore: goalAnalysis.totalComplexityScore,
        recommendations,
        riskAdjustment
      };

    } catch (error) {
      console.error('Work breakdown failed:', error);
      return this.generateFallbackBreakdown(goals, journeyType, dataContext);
    }
  }

  /**
   * Calculate detailed cost breakdown for each work component
   */
  private calculateComponentCosts(
    components: WorkComponent[],
    journeyType: string,
    dataSizeInMB: number,
    complexityScore: number
  ): CostBreakdown[] {
    return components.map(component => {
      // Base cost from hourly rate and estimated hours
      const hourlyRate = this.HOURLY_RATES[component.type] || 3000;
      const baseCost = hourlyRate * component.estimatedHours;

      // Apply multipliers
      const complexityMultiplier = this.COMPLEXITY_MULTIPLIERS[component.complexity];
      const journeyMultiplier = this.JOURNEY_MULTIPLIERS[journeyType as keyof typeof this.JOURNEY_MULTIPLIERS] || 1.0;
      
      // Data size impact
      const dataSizeFactor = this.DATA_SIZE_FACTORS[component.type] || 10;
      const dataSizeMultiplier = 1 + (dataSizeInMB * dataSizeFactor / 10000); // Scale factor

      // Calculate final cost
      const finalCost = Math.round(
        baseCost * complexityMultiplier * journeyMultiplier * dataSizeMultiplier
      );

      // Generate reasoning
      const reasoning = this.generateCostReasoning(
        component,
        baseCost,
        complexityMultiplier,
        journeyMultiplier,
        dataSizeMultiplier
      );

      return {
        component,
        baseCost,
        complexityMultiplier,
        journeyMultiplier,
        dataSizeMultiplier,
        finalCost,
        reasoning
      };
    });
  }

  /**
   * Calculate total cost with risk adjustments
   */
  private calculateTotalCostWithRisk(
    costBreakdowns: CostBreakdown[],
    riskFactors: string[],
    journeyType: string
  ): { totalCost: number; riskAdjustment: number } {
    const subtotal = costBreakdowns.reduce((sum, breakdown) => sum + breakdown.finalCost, 0);

    // Risk adjustment factors
    let riskMultiplier = 1.0;

    // High complexity risk
    if (riskFactors.some(risk => risk.includes('Complex analysis'))) {
      riskMultiplier += 0.15;
    }

    // Large scope risk
    if (riskFactors.some(risk => risk.includes('Large number of goals'))) {
      riskMultiplier += 0.1;
    }

    // Clarity risk
    if (riskFactors.some(risk => risk.includes('require clarification'))) {
      riskMultiplier += 0.2;
    }

    // Journey type specific risks
    if (journeyType === 'guided' && costBreakdowns.some(b => b.component.complexity === 'advanced')) {
      riskMultiplier += 0.1; // Guided users may need more support for advanced tasks
    }

    const riskAdjustment = (riskMultiplier - 1.0) * 100; // Convert to percentage
    const totalCost = Math.round(subtotal * riskMultiplier);

    return { totalCost, riskAdjustment };
  }

  /**
   * Generate cost optimization recommendations
   */
  private generateCostOptimizationRecommendations(
    costBreakdowns: CostBreakdown[],
    goalAnalysis: any,
    journeyType: string
  ): string[] {
    const recommendations: string[] = [];

    // Check for expensive components
    const expensiveComponents = costBreakdowns.filter(b => b.finalCost > 5000); // $50+
    if (expensiveComponents.length > 0) {
      recommendations.push(`Consider simplifying goals to reduce costs in: ${expensiveComponents.map(c => c.component.name).join(', ')}`);
    }

    // Check journey type optimization
    if (journeyType === 'guided' && costBreakdowns.some(b => b.component.complexity === 'advanced')) {
      recommendations.push('Consider technical journey for better value on advanced analysis');
    }

    // Data size optimization
    const dataSizeImpact = costBreakdowns.some(b => b.dataSizeMultiplier > 1.5);
    if (dataSizeImpact) {
      recommendations.push('Consider data sampling to reduce processing costs');
    }

    // Multiple goal optimization
    if (goalAnalysis.goals?.length > 3) {
      recommendations.push('Consider phasing goals across multiple analyses for better budget control');
    }

    return recommendations;
  }

  /**
   * Generate reasoning for cost calculation
   */
  private generateCostReasoning(
    component: WorkComponent,
    baseCost: number,
    complexityMultiplier: number,
    journeyMultiplier: number,
    dataSizeMultiplier: number
  ): string {
    const parts: string[] = [];
    
    parts.push(`Base: $${(baseCost / 100).toFixed(2)} (${component.estimatedHours}h × $${(this.HOURLY_RATES[component.type] / 100).toFixed(2)}/h)`);
    
    if (complexityMultiplier !== 1.0) {
      parts.push(`${component.complexity} complexity: ×${complexityMultiplier}`);
    }
    
    if (journeyMultiplier !== 1.0) {
      parts.push(`journey type: ×${journeyMultiplier}`);
    }
    
    if (dataSizeMultiplier > 1.1) {
      parts.push(`data size: ×${dataSizeMultiplier.toFixed(2)}`);
    }

    return parts.join(', ');
  }

  /**
   * Generate fallback breakdown when analysis fails
   */
  private generateFallbackBreakdown(
    goals: string[],
    journeyType: string,
    dataContext: any
  ): WorkBreakdownResult {
    const fallbackComponents: WorkComponent[] = [
      {
        id: 'basic_analysis',
        name: 'Basic Data Analysis',
        description: 'Standard statistical analysis and exploration',
        type: 'statistical_analysis',
        complexity: 'intermediate',
        estimatedHours: goals.length * 2,
        dependencies: [],
        requirements: []
      },
      {
        id: 'basic_visualization',
        name: 'Basic Visualizations',
        description: 'Standard charts and graphs',
        type: 'visualization',
        complexity: 'basic',
        estimatedHours: goals.length * 1,
        dependencies: ['basic_analysis'],
        requirements: []
      }
    ];

    const costBreakdowns = this.calculateComponentCosts(
      fallbackComponents,
      journeyType,
      dataContext.sizeInMB || 0,
      goals.length * 2
    );

    const totalCost = costBreakdowns.reduce((sum, breakdown) => sum + breakdown.finalCost, 0);

    return {
      workComponents: fallbackComponents,
      costBreakdowns,
      totalEstimatedCost: totalCost,
      totalEstimatedHours: goals.length * 3,
      complexityScore: goals.length * 2,
      recommendations: ['Fallback pricing used - consider providing more detailed goals'],
      riskAdjustment: 20 // 20% fallback risk
    };
  }

  /**
   * Get simplified cost estimate for quick calculations
   */
  getQuickEstimate(
    goalCount: number,
    questionsCount: number,
    journeyType: string,
    complexity: 'basic' | 'intermediate' | 'advanced' = 'intermediate'
  ): number {
    const basePrice = (goalCount * 2500) + (questionsCount * 1000); // $25 per goal, $10 per question
    const complexityMultiplier = this.COMPLEXITY_MULTIPLIERS[complexity];
    const journeyMultiplier = this.JOURNEY_MULTIPLIERS[journeyType as keyof typeof this.JOURNEY_MULTIPLIERS] || 1.0;
    
    return Math.round(basePrice * complexityMultiplier * journeyMultiplier);
  }
}

export const workBreakdownService = WorkBreakdownService.getInstance();