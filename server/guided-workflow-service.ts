import { DynamicPricingService } from "./dynamic-pricing-service";
import { 
  DynamicPricingRequest, 
  PricingResult, 
  WorkflowStep 
} from "@shared/dynamic-pricing-schema";

export class GuidedWorkflowService {
  private static workflows = new Map<string, WorkflowStep>();

  /**
   * Initialize a new guided workflow for a user
   */
  static initializeWorkflow(projectId: string, userId: string): WorkflowStep {
    const workflow: WorkflowStep = {
      projectId,
      userId,
      currentStep: "file_upload",
      stepData: {},
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.workflows.set(projectId, workflow);
    return workflow;
  }

  /**
   * Get current workflow state
   */
  static getWorkflow(projectId: string): WorkflowStep | null {
    return this.workflows.get(projectId) || null;
  }

  /**
   * Update workflow step with data
   */
  static updateWorkflow(
    projectId: string, 
    step: WorkflowStep['currentStep'], 
    stepData: any
  ): WorkflowStep | null {
    const workflow = this.workflows.get(projectId);
    if (!workflow) return null;

    workflow.currentStep = step;
    workflow.stepData = { ...workflow.stepData, ...stepData };
    workflow.updatedAt = new Date();
    
    this.workflows.set(projectId, workflow);
    return workflow;
  }

  /**
   * Analyze uploaded file and suggest next steps
   */
  static analyzeFileAndSuggestFeatures(fileAnalysis: {
    fileSizeBytes: number;
    recordCount: number;
    columnCount: number;
    schema: Record<string, any>;
    dataPreview: any[];
    piiDetected: boolean;
    piiColumns: string[];
    missingDataPercentage: number;
    outliersDetected: boolean;
    dataTypes: Record<string, number>;
  }): {
    suggestedFeatures: string[];
    requiredSteps: string[];
    estimatedComplexity: "low" | "medium" | "high" | "very_high";
    recommendations: Array<{
      feature: string;
      reason: string;
      priority: "required" | "recommended" | "optional";
      estimatedCost: number;
    }>;
  } {
    const suggestions = {
      suggestedFeatures: [] as string[],
      requiredSteps: [] as string[],
      estimatedComplexity: "low" as "low" | "medium" | "high" | "very_high",
      recommendations: [] as Array<{
        feature: string;
        reason: string;
        priority: "required" | "recommended" | "optional";
        estimatedCost: number;
      }>
    };

    // Always suggest data transformation if there are data quality issues
    if (fileAnalysis.missingDataPercentage > 5 || 
        fileAnalysis.outliersDetected || 
        fileAnalysis.piiDetected) {
      suggestions.suggestedFeatures.push("data_transformation");
      suggestions.requiredSteps.push("Data cleaning and preparation needed");
      
      suggestions.recommendations.push({
        feature: "data_transformation",
        reason: `Data quality issues detected: ${fileAnalysis.missingDataPercentage.toFixed(1)}% missing data${fileAnalysis.outliersDetected ? ', outliers present' : ''}${fileAnalysis.piiDetected ? ', PII detected' : ''}`,
        priority: "required",
        estimatedCost: 15
      });
    }

    // Suggest visualization based on data characteristics
    const numericColumns = fileAnalysis.dataTypes.numerical || 0;
    const categoricalColumns = fileAnalysis.dataTypes.categorical || 0;
    
    if (numericColumns > 0 || categoricalColumns > 0) {
      suggestions.suggestedFeatures.push("data_visualization");
      suggestions.recommendations.push({
        feature: "data_visualization",
        reason: `Dataset contains ${numericColumns} numeric and ${categoricalColumns} categorical columns suitable for visualization`,
        priority: "recommended",
        estimatedCost: 20
      });
    }

    // Suggest analysis based on data structure
    if (fileAnalysis.recordCount > 100 && numericColumns > 1) {
      suggestions.suggestedFeatures.push("data_analysis");
      let analysisReason = "Statistical analysis recommended for";
      
      if (numericColumns > 2) {
        analysisReason += " correlation and regression analysis";
      }
      if (categoricalColumns > 0) {
        analysisReason += " group comparisons";
      }
      if (fileAnalysis.recordCount > 1000) {
        analysisReason += " and machine learning";
      }

      suggestions.recommendations.push({
        feature: "data_analysis",
        reason: analysisReason,
        priority: "recommended",
        estimatedCost: 25
      });
    }

    // Suggest AI insights for complex datasets
    if (fileAnalysis.recordCount > 500 && fileAnalysis.columnCount > 5) {
      suggestions.suggestedFeatures.push("ai_insights");
      suggestions.recommendations.push({
        feature: "ai_insights",
        reason: "Large dataset with multiple variables - AI can provide automated insights and pattern detection",
        priority: "optional",
        estimatedCost: 35
      });
    }

    // Determine complexity
    if (fileAnalysis.fileSizeBytes > 50 * 1024 * 1024 || // > 50MB
        fileAnalysis.recordCount > 100000 || 
        fileAnalysis.columnCount > 50) {
      suggestions.estimatedComplexity = "very_high";
    } else if (fileAnalysis.fileSizeBytes > 10 * 1024 * 1024 || // > 10MB
               fileAnalysis.recordCount > 10000 || 
               fileAnalysis.columnCount > 20) {
      suggestions.estimatedComplexity = "high";
    } else if (fileAnalysis.fileSizeBytes > 1024 * 1024 || // > 1MB
               fileAnalysis.recordCount > 1000 || 
               fileAnalysis.columnCount > 10) {
      suggestions.estimatedComplexity = "medium";
    }

    // Add required steps based on findings
    if (fileAnalysis.piiDetected) {
      suggestions.requiredSteps.push("PII handling decision required");
    }
    
    return suggestions;
  }

  /**
   * Generate step-by-step workflow based on selected features
   */
  static generateWorkflowSteps(
    selectedFeatures: string[],
    fileAnalysis: any,
    userGoals?: string[]
  ): Array<{
    step: string;
    title: string;
    description: string;
    estimatedTime: number;
    requirements: string[];
    optional: boolean;
  }> {
    const steps = [];

    // Always start with data preview
    steps.push({
      step: "data_preview",
      title: "Data Preview & Validation",
      description: "Review your data structure, types, and quality",
      estimatedTime: 2,
      requirements: ["Data uploaded successfully"],
      optional: false
    });

    // PII handling if needed
    if (fileAnalysis?.piiDetected) {
      steps.push({
        step: "pii_handling",
        title: "PII Data Handling",
        description: "Decide how to handle personally identifiable information",
        estimatedTime: 3,
        requirements: ["PII columns identified"],
        optional: false
      });
    }

    // Feature-specific steps
    if (selectedFeatures.includes("data_transformation")) {
      steps.push({
        step: "data_transformation_config",
        title: "Data Transformation Setup",
        description: "Configure cleaning, normalization, and transformation operations",
        estimatedTime: 5,
        requirements: ["Data quality issues identified"],
        optional: false
      });
    }

    if (selectedFeatures.includes("data_analysis")) {
      steps.push({
        step: "analysis_config",
        title: "Analysis Configuration", 
        description: "Select statistical tests, machine learning algorithms, and target variables",
        estimatedTime: 8,
        requirements: ["Analysis goals defined", "Variables selected"],
        optional: false
      });
    }

    if (selectedFeatures.includes("data_visualization")) {
      steps.push({
        step: "visualization_config",
        title: "Visualization Setup",
        description: "Choose chart types, variables, and styling options",
        estimatedTime: 4,
        requirements: ["Visualization goals defined"],
        optional: false
      });
    }

    if (selectedFeatures.includes("ai_insights")) {
      steps.push({
        step: "ai_config",
        title: "AI Insights Configuration",
        description: "Select insight types, business context, and AI model preferences",
        estimatedTime: 6,
        requirements: ["Business goals defined"],
        optional: false
      });
    }

    // Final steps
    steps.push({
      step: "pricing_review",
      title: "Review & Pricing",
      description: "Review selected features and confirm pricing",
      estimatedTime: 2,
      requirements: ["All configurations complete"],
      optional: false
    });

    steps.push({
      step: "processing",
      title: "Data Processing",
      description: "Execute selected features and generate results",
      estimatedTime: 15,
      requirements: ["Payment confirmed"],
      optional: false
    });

    return steps;
  }

  /**
   * Calculate detailed pricing with step-by-step breakdown
   */
  static calculateStepByStepPricing(
    fileAnalysis: any,
    selectedFeatures: string[],
    featureConfigurations: Record<string, any>
  ): {
    pricing: PricingResult;
    stepByStepCosts: Array<{
      step: string;
      feature: string;
      description: string;
      cost: number;
      complexity: string;
    }>;
    totalEstimatedTime: number;
  } {
    // Build dynamic pricing request
    const pricingRequest: DynamicPricingRequest = {
      fileSizeBytes: fileAnalysis.fileSizeBytes,
      recordCount: fileAnalysis.recordCount,
      columnCount: fileAnalysis.columnCount,
      complexityFactors: {
        piiColumnsCount: fileAnalysis.piiColumns?.length || 0,
        uniqueIdentifiersCount: 0, // Could be enhanced
        missingDataPercentage: fileAnalysis.missingDataPercentage,
        dataTypes: fileAnalysis.dataTypes,
        outliersDetected: fileAnalysis.outliersDetected,
        needsNormalization: fileAnalysis.needsNormalization || false
      },
      selectedFeatures: selectedFeatures as any,
      featureRequirements: featureConfigurations
    };

    const pricing = DynamicPricingService.calculateDynamicPricing(pricingRequest);

    // Generate step-by-step cost breakdown
    const stepByStepCosts = [];
    
    // Base processing costs
    stepByStepCosts.push({
      step: "file_processing",
      feature: "base",
      description: "File upload and initial processing",
      cost: pricing.baseCosts.fileProcessing,
      complexity: "automatic"
    });

    stepByStepCosts.push({
      step: "data_complexity",
      feature: "base",
      description: "Data complexity and quality assessment",
      cost: pricing.baseCosts.dataComplexity,
      complexity: "automatic"
    });

    // Feature-specific costs
    for (const feature of selectedFeatures) {
      const featureCost = pricing.featureCosts[feature];
      if (featureCost) {
        stepByStepCosts.push({
          step: `${feature}_processing`,
          feature,
          description: this.getFeatureDescription(feature),
          cost: featureCost.totalFeatureCost,
          complexity: featureCost.complexityMultiplier > 1.2 ? "high" : "standard"
        });
      }
    }

    return {
      pricing,
      stepByStepCosts,
      totalEstimatedTime: pricing.estimatedProcessing.timeMinutes
    };
  }

  /**
   * Get next recommended action based on current workflow state
   */
  static getNextAction(projectId: string): {
    action: string;
    title: string;
    description: string;
    required: boolean;
    estimatedTime: number;
  } | null {
    const workflow = this.workflows.get(projectId);
    if (!workflow) return null;

    const nextActions: Record<string, any> = {
      file_upload: {
        action: "upload_file",
        title: "Upload Your Data",
        description: "Upload CSV, Excel, JSON, or text files up to 100MB",
        required: true,
        estimatedTime: 2
      },
      data_preview: {
        action: "review_data",
        title: "Review Data Structure",
        description: "Examine your data schema, types, and sample values",
        required: true,
        estimatedTime: 3
      },
      pii_handling: {
        action: "handle_pii",
        title: "Handle PII Data",
        description: "Choose how to process personally identifiable information",
        required: true,
        estimatedTime: 5
      },
      feature_selection: {
        action: "select_features",
        title: "Select Features",
        description: "Choose which data processing features you need",
        required: true,
        estimatedTime: 5
      },
      requirements_gathering: {
        action: "configure_requirements",
        title: "Configure Processing Requirements",
        description: "Set up detailed requirements for selected features",
        required: true,
        estimatedTime: 10
      },
      pricing_review: {
        action: "review_pricing",
        title: "Review Pricing",
        description: "Review costs and processing timeline",
        required: true,
        estimatedTime: 3
      },
      payment: {
        action: "process_payment",
        title: "Complete Payment",
        description: "Secure payment processing via Stripe",
        required: true,
        estimatedTime: 2
      },
      processing: {
        action: "wait_processing",
        title: "Data Processing",
        description: "Your data is being processed according to your specifications",
        required: false,
        estimatedTime: 15
      },
      results: {
        action: "view_results",
        title: "View Results",
        description: "Access your processed data, analysis, and insights",
        required: false,
        estimatedTime: 0
      }
    };

    return nextActions[workflow.currentStep] || null;
  }

  private static getFeatureDescription(feature: string): string {
    const descriptions = {
      data_transformation: "Data cleaning, normalization, and transformation",
      data_visualization: "Chart creation and visual analysis",
      data_analysis: "Statistical analysis and machine learning",
      ai_insights: "AI-powered insights and recommendations"
    };
    return descriptions[feature as keyof typeof descriptions] || feature;
  }

  /**
   * Generate personalized recommendations based on user goals
   */
  static generatePersonalizedRecommendations(
    userGoals: string[],
    fileAnalysis: any,
    userExperience: "beginner" | "intermediate" | "advanced" = "intermediate"
  ): Array<{
    feature: string;
    title: string;
    description: string;
    reasoning: string;
    priority: "high" | "medium" | "low";
    estimatedValue: string;
    complexity: "easy" | "moderate" | "advanced";
  }> {
    const recommendations = [];

    // Analyze user goals and map to features
    const goalMappings = {
      "predictive analysis": {
        features: ["data_analysis", "ai_insights"],
        complexity: "advanced"
      },
      "data visualization": {
        features: ["data_visualization"],
        complexity: "easy"
      },
      "data cleaning": {
        features: ["data_transformation"],
        complexity: "moderate"
      },
      "business insights": {
        features: ["ai_insights", "data_analysis"],
        complexity: "moderate"
      },
      "statistical analysis": {
        features: ["data_analysis"],
        complexity: "moderate"
      }
    };

    // Generate recommendations based on goals
    for (const goal of userGoals) {
      const mapping = goalMappings[goal.toLowerCase() as keyof typeof goalMappings];
      if (mapping) {
        for (const feature of mapping.features) {
          if (!recommendations.find(r => r.feature === feature)) {
            recommendations.push({
              feature,
              title: this.getFeatureTitle(feature),
              description: this.getFeatureDescription(feature),
              reasoning: `Required for "${goal}" objective`,
              priority: "high" as const,
              estimatedValue: "High business impact expected",
              complexity: mapping.complexity as any
            });
          }
        }
      }
    }

    // Add data-driven recommendations
    if (fileAnalysis.missingDataPercentage > 10) {
      recommendations.push({
        feature: "data_transformation",
        title: "Data Transformation",
        description: "Clean and prepare your data",
        reasoning: `${fileAnalysis.missingDataPercentage.toFixed(1)}% missing data detected`,
        priority: "high",
        estimatedValue: "Critical for accurate analysis",
        complexity: "moderate"
      });
    }

    return recommendations;
  }

  private static getFeatureTitle(feature: string): string {
    const titles = {
      data_transformation: "Data Engineering",
      data_visualization: "Data Visualization",
      data_analysis: "Data Analysis",
      ai_insights: "AI Insights"
    };
    return titles[feature as keyof typeof titles] || feature;
  }
}