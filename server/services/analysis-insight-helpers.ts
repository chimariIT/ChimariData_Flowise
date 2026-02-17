// server/services/analysis-insight-helpers.ts
/**
 * P3-1: Extracted from analysis-execution.ts
 * Result parsing and quality scoring. Pure transformation functions that convert
 * Python results into structured insights and recommendations.
 */

import type { AnalysisInsight, AnalysisRecommendation } from './analysis-types';

/**
 * Parse Python results into structured insights
 */
export function parseInsights(pythonResults: any, datasetName: string): AnalysisInsight[] {
  const insights: AnalysisInsight[] = [];
  let insightId = 1;

  // Parse descriptive statistics
  if (pythonResults.descriptive) {
    const desc = pythonResults.descriptive;
    insights.push({
      id: insightId++,
      title: `Data Overview: ${datasetName}`,
      description: `Dataset contains ${desc.rowCount || 'N/A'} rows and ${desc.columnCount || 'N/A'} columns. ${desc.missingValues ? `Found ${desc.missingValues} missing values.` : ''}`,
      impact: 'Medium',
      confidence: 100,
      category: 'Data Quality',
      dataSource: datasetName,
      details: desc
    });
  }

  // Parse correlation findings
  if (pythonResults.correlations && pythonResults.correlations.length > 0) {
    pythonResults.correlations.forEach((corr: any) => {
      const strength = Math.abs(corr.correlation) > 0.7 ? 'Strong' : Math.abs(corr.correlation) > 0.4 ? 'Moderate' : 'Weak';
      insights.push({
        id: insightId++,
        title: `${strength} Correlation Found`,
        description: `${corr.variable1} and ${corr.variable2} show ${strength.toLowerCase()} correlation (r=${corr.correlation.toFixed(2)}). ${corr.correlation > 0 ? 'As one increases, the other tends to increase.' : 'As one increases, the other tends to decrease.'}`,
        impact: Math.abs(corr.correlation) > 0.7 ? 'High' : 'Medium',
        confidence: Math.round(Math.abs(corr.correlation) * 100),
        category: 'Correlation',
        dataSource: datasetName,
        details: corr
      });
    });
  }

  // Parse regression results
  if (pythonResults.regression) {
    const reg = pythonResults.regression;
    insights.push({
      id: insightId++,
      title: `Predictive Model Performance`,
      description: `Built prediction model with R² score of ${reg.r2?.toFixed(2) || 'N/A'}. ${reg.topFeatures ? `Key factors: ${reg.topFeatures.slice(0, 3).join(', ')}.` : ''}`,
      impact: reg.r2 > 0.7 ? 'High' : 'Medium',
      confidence: Math.round((reg.r2 || 0.5) * 100),
      category: 'Predictive Analysis',
      dataSource: datasetName,
      details: reg
    });
  }

  // Parse clustering results
  if (pythonResults.clustering) {
    const clust = pythonResults.clustering;
    insights.push({
      id: insightId++,
      title: `${clust.nClusters || 'Multiple'} Distinct Groups Identified`,
      description: `Clustering analysis revealed ${clust.nClusters || 'multiple'} natural groups in your data. ${clust.description || 'Each group has unique characteristics.'}`,
      impact: 'High',
      confidence: Math.round((clust.silhouetteScore || 0.5) * 100),
      category: 'Segmentation',
      dataSource: datasetName,
      details: clust
    });
  }

  // Parse time series trends
  if (pythonResults.timeSeries) {
    const ts = pythonResults.timeSeries;
    insights.push({
      id: insightId++,
      title: `Trend Analysis: ${ts.trend || 'Patterns'} Detected`,
      description: `Time series analysis shows ${ts.trend?.toLowerCase() || 'patterns'} with ${ts.seasonality ? 'seasonal patterns' : 'no clear seasonality'}. ${ts.forecast ? `Forecast suggests ${ts.forecast}.` : ''}`,
      impact: 'Medium',
      confidence: 75,
      category: 'Trends',
      dataSource: datasetName,
      details: ts
    });
  }

  // Parse qualitative/text insights
  if (pythonResults.textInsights && pythonResults.textInsights.length > 0) {
    pythonResults.textInsights.forEach((textInsight: any) => {
      insights.push({
        id: insightId++,
        title: textInsight.title || `Qualitative Insight${textInsight.column ? `: ${textInsight.column}` : ''}`,
        description: textInsight.summary || textInsight.description || 'Key qualitative themes detected.',
        impact: textInsight.impact || 'Medium',
        confidence: textInsight.confidence || 65,
        category: textInsight.category || 'Qualitative',
        dataSource: datasetName,
        details: textInsight
      });
    });
  }

  // If no specific insights, add generic summary
  if (insights.length === 0) {
    insights.push({
      id: insightId++,
      title: `Analysis Completed: ${datasetName}`,
      description: `Successfully analyzed dataset. ${pythonResults.rowCount ? `Processed ${pythonResults.rowCount} rows of data.` : ''} Additional insights may require more specific analysis types.`,
      impact: 'Low',
      confidence: 50,
      category: 'Summary',
      dataSource: datasetName
    });
  }

  return insights;
}

/**
 * Generate actionable recommendations based on insights
 */
export function generateRecommendations(insights: AnalysisInsight[]): AnalysisRecommendation[] {
  const recommendations: AnalysisRecommendation[] = [];
  let recId = 1;

  // Recommendation based on high-impact insights
  const highImpactInsights = insights.filter(i => i.impact === 'High');
  if (highImpactInsights.length > 0) {
    recommendations.push({
      id: recId++,
      title: 'Focus on High-Impact Findings',
      description: `Prioritize action on the ${highImpactInsights.length} high-impact insight${highImpactInsights.length > 1 ? 's' : ''} identified. These areas show the strongest patterns and potential for improvement.`,
      priority: 'High',
      effort: 'Medium',
      expectedImpact: 'Significant business value'
    });
  }

  // Recommendation for data quality issues
  const qualityInsights = insights.filter(i => i.category === 'Data Quality');
  if (qualityInsights.some(i => i.description.includes('missing'))) {
    recommendations.push({
      id: recId++,
      title: 'Improve Data Collection',
      description: 'Address missing values in your dataset to improve analysis accuracy. Consider implementing data validation at the source.',
      priority: 'Medium',
      effort: 'Low',
      expectedImpact: 'Better data reliability'
    });
  }

  // Recommendation for correlations
  const correlationInsights = insights.filter(i => i.category === 'Correlation');
  if (correlationInsights.length > 0) {
    recommendations.push({
      id: recId++,
      title: 'Leverage Identified Relationships',
      description: `Use the ${correlationInsights.length} correlation${correlationInsights.length > 1 ? 's' : ''} found to optimize operations. Focus monitoring and improvements on strongly correlated factors.`,
      priority: 'High',
      effort: 'Medium',
      expectedImpact: 'Operational efficiency gains'
    });
  }

  // Generic recommendation if none specific
  if (recommendations.length === 0) {
    recommendations.push({
      id: recId++,
      title: 'Review Analysis Results',
      description: 'Examine the insights generated and discuss with your team to determine next steps and action items.',
      priority: 'Medium',
      effort: 'Low',
      expectedImpact: 'Informed decision-making'
    });
  }

  return recommendations;
}

/**
 * Calculate overall quality score
 */
export function calculateQualityScore(insights: AnalysisInsight[]): number {
  if (insights.length === 0) return 0;

  const avgConfidence = insights.reduce((sum, i) => sum + i.confidence, 0) / insights.length;
  const highImpactCount = insights.filter(i => i.impact === 'High').length;
  const impactBonus = Math.min(highImpactCount * 5, 20);

  return Math.min(Math.round(avgConfidence + impactBonus), 100);
}
