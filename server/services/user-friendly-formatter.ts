/**
 * User-Friendly Message Formatter
 *
 * Converts technical details into plain language for non-technical users.
 * Adds billing transparency, next steps, and clear explanations to checkpoints.
 *
 * Principles:
 * - No technical jargon
 * - Clear, actionable language
 * - Transparent about costs
 * - Explain "why" not just "what"
 */

export interface BillingInfo {
  estimatedCost: number;
  itemizedCharges?: Array<{
    item: string;
    cost: number;
  }>;
  remainingQuota?: number;
  willExceedQuota?: boolean;
}

export interface FormattedCheckpoint {
  title: string;
  message: string;
  explanation: string;
  artifacts: Array<{
    name: string;
    description: string;
    canModify: boolean;
  }>;
  billing: {
    cost: string;
    breakdown: string;
    warning?: string;
  };
  nextSteps: string[];
  recommendation: string;
}

export class UserFriendlyFormatter {
  /**
   * Format checkpoint message for user review
   */
  formatCheckpointMessage(
    stage: string,
    artifacts: any[],
    billing: BillingInfo,
    technicalDetails?: any
  ): FormattedCheckpoint {
    const stageTitles = {
      'data_upload': '📂 Review Your Data',
      'schema_review': '🔍 Confirm Data Structure',
      'quality_check': '✅ Data Quality Report',
      'analysis_planning': '📊 Review Analysis Plan',
      'execution_approval': '🚀 Ready to Run Analysis',
      'results_review': '📈 Your Results Are Ready',
      'delivery': '🎁 Download Your Insights'
    };

    const stageMessages = {
      'data_upload': "Let's make sure we have the right data for your analysis.",
      'schema_review': "I've analyzed your data structure. Please confirm the column types are correct.",
      'quality_check': "I've checked your data quality. Here's what I found:",
      'analysis_planning': "Based on your goals, here's my recommended analysis approach:",
      'execution_approval': "Everything is ready! Review the plan and we'll run the analysis.",
      'results_review': "Your analysis is complete! Let's review what we discovered:",
      'delivery': "Your insights are ready to download and share!"
    };

    const stageExplanations = {
      'data_upload': "Before we begin, I want to make sure we're working with the right information. This helps ensure accurate results.",
      'schema_review': "Understanding your data structure helps me recommend the best analysis methods and avoid errors.",
      'quality_check': "Quality checks catch issues early - like missing values or inconsistencies - so we get reliable insights.",
      'analysis_planning': "I've designed an analysis plan tailored to your goals. You can modify it or approve to proceed.",
      'execution_approval': "Once you approve, I'll run the analysis. This is where we transform your data into insights.",
      'results_review': "Let's look at what the data revealed. I'll highlight the key findings and what they mean for you.",
      'delivery': "All your reports, visualizations, and data are packaged and ready. You can share these with your team."
    };

    // Format billing
    const billingFormatted = {
      cost: `$${billing.estimatedCost.toFixed(2)}`,
      breakdown: this.formatBillingBreakdown(billing),
      warning: billing.willExceedQuota ? '⚠️ This will use additional credits beyond your plan.' : undefined
    };

    // Format artifacts
    const artifactsFormatted = artifacts.map(artifact => ({
      name: this.makeFriendlyName(artifact.name || artifact.type),
      description: this.explainArtifact(artifact.type),
      canModify: ['schema', 'analysis_plan', 'cost_estimate'].includes(artifact.type)
    }));

    // Determine next steps
    const nextSteps = this.getNextSteps(stage);

    // Generate recommendation
    const recommendation = this.generateRecommendation(stage, artifacts, billing);

    return {
      title: stageTitles[stage as keyof typeof stageTitles] || '📋 Review',
      message: stageMessages[stage as keyof typeof stageMessages] || 'Please review and approve to continue.',
      explanation: stageExplanations[stage as keyof typeof stageExplanations] || 'This step helps ensure quality results.',
      artifacts: artifactsFormatted,
      billing: billingFormatted,
      nextSteps,
      recommendation
    };
  }

  /**
   * Format progress report for user dashboard
   */
  formatProgressReport(
    currentStage: string,
    completedStages: string[],
    totalStages: number,
    artifacts: any[],
    totalCost: number
  ): {
    progress: number;
    currentActivity: string;
    completedActivities: string[];
    nextUp: string;
    estimatedTimeRemaining: string;
    artifactsSummary: string;
    costSummary: string;
  } {
    const progress = Math.round((completedStages.length / totalStages) * 100);

    const stageActivities = {
      'goal_definition': 'Understanding your goals',
      'data_discovery': 'Finding the right data',
      'data_upload': 'Uploading and validating data',
      'schema_validation': 'Reviewing data structure',
      'quality_check': 'Checking data quality',
      'analysis_planning': 'Planning your analysis',
      'execution': 'Running analysis',
      'results_generation': 'Generating results',
      'insight_synthesis': 'Creating insights',
      'delivery': 'Preparing deliverables'
    };

    return {
      progress,
      currentActivity: stageActivities[currentStage as keyof typeof stageActivities] || 'Working on it...',
      completedActivities: completedStages.map(s => stageActivities[s as keyof typeof stageActivities]),
      nextUp: this.getNextActivity(currentStage),
      estimatedTimeRemaining: this.estimateTimeRemaining(totalStages - completedStages.length),
      artifactsSummary: `${artifacts.length} ${artifacts.length === 1 ? 'artifact' : 'artifacts'} ready`,
      costSummary: `$${totalCost.toFixed(2)} total`
    };
  }

  /**
   * Convert technical error to user-friendly message
   */
  formatErrorMessage(error: Error, context?: string): string {
    const errorMessages: Record<string, string> = {
      'ENOENT': "I couldn't find that file. Please check the file path and try again.",
      'EACCES': "I don't have permission to access that file. Please check the file permissions.",
      'ENOMEM': "The dataset is too large for available memory. Try uploading a smaller sample first.",
      'ETIMEDOUT': "The operation took too long. Your data might be very large - let's try breaking it into smaller chunks.",
      'INVALID_SCHEMA': "The data structure doesn't match what I expected. Let's review the columns together.",
      'QUALITY_ISSUES': "I found some data quality issues that need attention before we proceed.",
      'QUOTA_EXCEEDED': "You've reached your plan's usage limit. Consider upgrading or we can prioritize the most important analysis."
    };

    // Try to match error message
    for (const [key, message] of Object.entries(errorMessages)) {
      if (error.message.includes(key) || error.name.includes(key)) {
        return context ? `${message} (Context: ${context})` : message;
      }
    }

    // Generic user-friendly error
    return "Something unexpected happened. Don't worry - I've logged the details and we can try a different approach.";
  }

  /**
   * Format data quality report for non-technical users
   */
  formatQualityReport(qualityScore: number, issues: any[]): {
    headline: string;
    summary: string;
    issues: Array<{ severity: string; description: string; whatToDo: string }>;
    canProceed: boolean;
    recommendation: string;
  } {
    const headline = qualityScore >= 90 ? '✅ Your data looks great!' :
                     qualityScore >= 70 ? '⚠️ Your data needs some attention' :
                     '❌ We found significant data issues';

    const summary = qualityScore >= 90 ?
      'Your data is clean and ready for analysis. No issues found!' :
      qualityScore >= 70 ?
      `Your data quality score is ${qualityScore}/100. We found ${issues.length} issues that should be addressed for best results.` :
      `Your data quality score is ${qualityScore}/100. We need to fix ${issues.filter(i => i.severity === 'critical').length} critical issues before proceeding.`;

    const formattedIssues = issues.map(issue => ({
      severity: issue.severity === 'critical' ? '🔴 Critical' :
                issue.severity === 'high' ? '🟠 High' :
                issue.severity === 'medium' ? '🟡 Medium' : '🟢 Low',
      description: this.explainQualityIssue(issue),
      whatToDo: issue.recommendation || 'Let me know if you need help fixing this.'
    }));

    return {
      headline,
      summary,
      issues: formattedIssues,
      canProceed: qualityScore >= 70,
      recommendation: qualityScore >= 70 ?
        'You can proceed with analysis. I recommend addressing these issues for even better results.' :
        'Let\'s fix the critical issues first. I can help you clean the data or you can re-upload a corrected version.'
    };
  }

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  private formatBillingBreakdown(billing: BillingInfo): string {
    if (!billing.itemizedCharges || billing.itemizedCharges.length === 0) {
      return `Next step will cost $${billing.estimatedCost.toFixed(2)}`;
    }

    const breakdown = billing.itemizedCharges
      .map(charge => `${charge.item}: $${charge.cost.toFixed(2)}`)
      .join(', ');

    return breakdown;
  }

  private makeFriendlyName(technicalName: string): string {
    const friendlyNames: Record<string, string> = {
      'schema': 'Data Structure',
      'data_sample': 'Data Preview',
      'analysis_plan': 'Analysis Approach',
      'visualization': 'Chart or Graph',
      'insight': 'Key Finding',
      'cost_estimate': 'Cost Breakdown',
      'recommendation': 'My Recommendation',
      'quality_report': 'Data Quality Check',
      'statistical_report': 'Statistical Analysis',
      'ml_model': 'Prediction Model',
      'dashboard': 'Interactive Dashboard'
    };

    return friendlyNames[technicalName] || technicalName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private explainArtifact(type: string): string {
    const explanations: Record<string, string> = {
      'schema': 'Shows how your data is organized - column names and types.',
      'data_sample': 'A preview of your actual data so you can verify it looks right.',
      'analysis_plan': 'The statistical methods and approach I\'ll use to answer your questions.',
      'visualization': 'A visual representation of patterns or trends in your data.',
      'insight': 'A key discovery or finding from analyzing your data.',
      'cost_estimate': 'Breakdown of what the next steps will cost.',
      'recommendation': 'My suggested next steps based on the analysis.',
      'quality_report': 'Assessment of your data\'s completeness, accuracy, and readiness.',
      'statistical_report': 'Detailed statistical analysis results and interpretations.',
      'ml_model': 'A trained model that can make predictions based on patterns in your data.',
      'dashboard': 'An interactive view where you can explore your data and results.'
    };

    return explanations[type] || 'Additional analysis output';
  }

  private getNextSteps(stage: string): string[] {
    const nextSteps: Record<string, string[]> = {
      'data_upload': [
        'Review the data preview',
        'Confirm column names make sense',
        'Approve to continue'
      ],
      'schema_review': [
        'Check if column types are correct',
        'Modify any incorrect types',
        'Approve the structure'
      ],
      'quality_check': [
        'Review quality issues',
        'Decide if we should clean the data',
        'Approve to continue or fix issues'
      ],
      'analysis_planning': [
        'Review the proposed approach',
        'Ask questions if anything is unclear',
        'Approve the plan'
      ],
      'execution_approval': [
        'Review the cost estimate',
        'Confirm you want to proceed',
        'Analysis will run automatically'
      ],
      'results_review': [
        'Explore your results',
        'Download reports and visualizations',
        'Request additional analysis if needed'
      ],
      'delivery': [
        'Download all artifacts',
        'Share with your team',
        'Start a new analysis if needed'
      ]
    };

    return nextSteps[stage] || ['Review', 'Approve', 'Continue'];
  }

  private generateRecommendation(stage: string, artifacts: any[], billing: BillingInfo): string {
    if (billing.willExceedQuota) {
      return "This will use extra credits. If you'd like to stay within your plan, we can simplify the analysis or you can upgrade your subscription.";
    }

    const recommendations: Record<string, string> = {
      'data_upload': "Everything looks good! I recommend proceeding to validate the data structure.",
      'schema_review': "The structure looks correct. Let's move forward with quality checks.",
      'quality_check': "Your data quality is good enough to proceed. We can always clean it later if needed.",
      'analysis_planning': "This approach will answer your questions effectively. I recommend approving it.",
      'execution_approval': "The cost is reasonable for this analysis. Ready to get your insights?",
      'results_review': "Take time to explore these findings. Let me know if you want deeper analysis on anything.",
      'delivery': "All done! Your results are comprehensive and ready to share."
    };

    return recommendations[stage] || "I recommend reviewing the details and approving when ready.";
  }

  private getNextActivity(currentStage: string): string {
    const nextActivities: Record<string, string> = {
      'goal_definition': 'Uploading your data',
      'data_discovery': 'Validating data structure',
      'data_upload': 'Checking data quality',
      'schema_validation': 'Planning your analysis',
      'quality_check': 'Designing analysis approach',
      'analysis_planning': 'Running the analysis',
      'execution': 'Generating visualizations',
      'results_generation': 'Creating insights',
      'insight_synthesis': 'Preparing deliverables',
      'delivery': 'All done!'
    };

    return nextActivities[currentStage] || 'Continuing...';
  }

  private estimateTimeRemaining(remainingStages: number): string {
    if (remainingStages === 0) return 'Complete!';
    if (remainingStages <= 2) return '5-10 minutes';
    if (remainingStages <= 5) return '15-30 minutes';
    return '30-60 minutes';
  }

  private explainQualityIssue(issue: any): string {
    const issueExplanations: Record<string, (issue: any) => string> = {
      'completeness': (i) => `Some values are missing in the '${i.affectedField}' column (${i.affectedRows} rows).`,
      'validity': (i) => `The '${i.affectedField}' column has values that don't match the expected format.`,
      'consistency': (i) => `Data inconsistency detected in '${i.affectedField}' - values don't align with related fields.`,
      'uniqueness': (i) => `The '${i.affectedField}' column has duplicate values where they should be unique.`,
      'accuracy': (i) => `Potential data accuracy issue in '${i.affectedField}' - values seem unusual.`
    };

    const explainer = issueExplanations[issue.type];
    return explainer ? explainer(issue) : issue.description;
  }
}

// Singleton instance
export const userFriendlyFormatter = new UserFriendlyFormatter();
