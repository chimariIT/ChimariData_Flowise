// server/services/natural-language-translator.ts
import type { UserRole } from '../../shared/schema';

export interface DataSchema {
  [fieldName: string]: {
    type: string;
    nullable?: boolean;
    description?: string;
    example?: any;
  };
}

export interface DataRelationship {
  sourceField: string;
  targetField?: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many' | 'derived';
  description?: string;
}

export interface AnalysisComponent {
  type: 'statistical_test' | 'ml_model' | 'visualization' | 'data_transformation';
  name: string;
  technicalDescription: string;
  parameters?: Record<string, any>;
}

export interface NaturalLanguageExplanation {
  title: string;
  summary: string;
  details: string[];
  examples: string[];
  whyItMatters: string;
}

export interface MethodologyExplanation {
  overview: string;
  steps: {
    stepNumber: number;
    title: string;
    description: string;
    businessPurpose: string;
  }[];
  expectedOutcome: string;
  timeEstimate: string;
}

export interface UserFriendlyInsights {
  executiveSummary: string;
  keyFindings: {
    finding: string;
    impact: string;
    priority: 'high' | 'medium' | 'low';
    actionable: boolean;
  }[];
  recommendations: string[];
  nextSteps: string[];
}

/**
 * Natural Language Translator Service
 *
 * Translates technical outputs to business-friendly language
 * based on user role (non-tech, business, technical, consultation)
 */
export class NaturalLanguageTranslator {

  /**
   * Translate data schema to natural language
   */
  translateSchema(schema: DataSchema, userRole: UserRole): NaturalLanguageExplanation {
    const fieldCount = Object.keys(schema).length;

    switch (userRole) {
      case 'non-tech':
        return {
          title: 'Your Data Fields',
          summary: `We identified ${fieldCount} pieces of information in your data.`,
          details: Object.entries(schema).map(([field, meta]) =>
            `**${this.humanizeFieldName(field)}**: ${this.explainFieldForNonTech(field, meta)}`
          ),
          examples: this.generateSchemaExamples(schema, 'non-tech'),
          whyItMatters: 'Understanding your data structure helps us create accurate analysis and insights.'
        };

      case 'business':
        return {
          title: 'Data Schema Overview',
          summary: `Dataset contains ${fieldCount} fields with business-relevant information.`,
          details: Object.entries(schema).map(([field, meta]) =>
            `**${this.humanizeFieldName(field)}** (${meta.type}): ${this.explainFieldForBusiness(field, meta)}`
          ),
          examples: this.generateSchemaExamples(schema, 'business'),
          whyItMatters: 'Proper schema understanding ensures KPI calculations and business logic are correctly applied.'
        };

      case 'technical':
        return {
          title: 'Data Schema Specification',
          summary: `Schema includes ${fieldCount} fields with defined types and constraints.`,
          details: Object.entries(schema).map(([field, meta]) =>
            `\`${field}\`: ${meta.type}${meta.nullable ? ' (nullable)' : ' (required)'} - ${meta.description || 'No description'}`
          ),
          examples: this.generateSchemaExamples(schema, 'technical'),
          whyItMatters: 'Schema validation ensures data quality and supports reproducible analysis.'
        };

      case 'consultation':
        return {
          title: 'Schema Analysis & Recommendations',
          summary: `Comprehensive schema review of ${fieldCount} fields with optimization opportunities.`,
          details: Object.entries(schema).map(([field, meta]) =>
            `${field}: ${this.analyzeFieldForConsultation(field, meta)}`
          ),
          examples: this.generateSchemaExamples(schema, 'consultation'),
          whyItMatters: 'Schema optimization impacts analysis performance, accuracy, and scalability.'
        };

      default:
        return this.translateSchema(schema, 'business');
    }
  }

  /**
   * Explain data relationships in user-friendly terms
   */
  explainRelationships(
    relationships: DataRelationship[],
    userRole: UserRole
  ): NaturalLanguageExplanation {
    switch (userRole) {
      case 'non-tech':
        return {
          title: 'How Your Data Connects',
          summary: `We found ${relationships.length} important connections in your data.`,
          details: relationships.map(rel =>
            `${this.humanizeFieldName(rel.sourceField)} → ${this.explainRelationshipForNonTech(rel)}`
          ),
          examples: [
            'Example: Customer ID connects to Order History (one customer can have many orders)',
            'Example: Product Price is calculated from Base Price + Tax'
          ],
          whyItMatters: 'Understanding connections helps us analyze patterns and relationships in your business.'
        };

      case 'business':
        return {
          title: 'Data Relationship Model',
          summary: `${relationships.length} relationships identified for business logic validation.`,
          details: relationships.map(rel =>
            `${this.humanizeFieldName(rel.sourceField)} [${rel.type}] → ${this.explainRelationshipForBusiness(rel)}`
          ),
          examples: relationships.slice(0, 3).map(rel =>
            `Business Rule: ${rel.description || this.inferBusinessRule(rel)}`
          ),
          whyItMatters: 'Relationship validation ensures business rules are correctly implemented in analysis.'
        };

      case 'technical':
        return {
          title: 'Data Model & Entity Relationships',
          summary: `Entity-relationship diagram with ${relationships.length} defined relationships.`,
          details: relationships.map(rel =>
            `${rel.sourceField} [${rel.type}]${rel.targetField ? ` → ${rel.targetField}` : ' (derived)'}`
          ),
          examples: relationships.map(rel => this.generateSQLExample(rel)),
          whyItMatters: 'Proper relationship modeling is essential for JOIN operations and data integrity.'
        };

      default:
        return this.explainRelationships(relationships, 'business');
    }
  }

  /**
   * Explain analysis methodology in natural language
   */
  explainMethodology(
    analysisComponents: AnalysisComponent[],
    template: any,
    userRole: UserRole
  ): MethodologyExplanation {
    switch (userRole) {
      case 'non-tech':
        return {
          overview: `We'll analyze your data in ${analysisComponents.length} simple steps to answer your questions.`,
          steps: analysisComponents.map((comp, idx) => ({
            stepNumber: idx + 1,
            title: this.simplifyComponentName(comp.name),
            description: this.explainComponentForNonTech(comp),
            businessPurpose: this.explainWhyThisMatters(comp, 'non-tech')
          })),
          expectedOutcome: 'You\'ll get clear answers to your questions with easy-to-understand charts and recommendations.',
          timeEstimate: this.estimateTimeForUser(analysisComponents, 'non-tech')
        };

      case 'business':
        return {
          overview: `${analysisComponents.length}-step analytical approach aligned with ${template.name || 'business objectives'}.`,
          steps: analysisComponents.map((comp, idx) => ({
            stepNumber: idx + 1,
            title: comp.name,
            description: this.explainComponentForBusiness(comp),
            businessPurpose: this.mapToKPIs(comp, template)
          })),
          expectedOutcome: 'Strategic insights with KPI impact analysis and actionable recommendations.',
          timeEstimate: this.estimateTimeForUser(analysisComponents, 'business')
        };

      case 'technical':
        return {
          overview: `${analysisComponents.length} analytical components with statistical rigor and reproducibility.`,
          steps: analysisComponents.map((comp, idx) => ({
            stepNumber: idx + 1,
            title: comp.name,
            description: comp.technicalDescription,
            businessPurpose: this.explainTechnicalRationale(comp)
          })),
          expectedOutcome: 'Complete analytical artifacts including code, models, statistical reports, and technical documentation.',
          timeEstimate: this.estimateTimeForUser(analysisComponents, 'technical')
        };

      default:
        return this.explainMethodology(analysisComponents, template, 'business');
    }
  }

  /**
   * Translate technical findings to user-friendly insights
   */
  translateFindings(
    technicalResults: any,
    template: any,
    userRole: UserRole
  ): UserFriendlyInsights {
    const findings = technicalResults.findings || [];
    const insights = technicalResults.insights || [];

    switch (userRole) {
      case 'non-tech':
        return {
          executiveSummary: this.generateNonTechSummary(findings, insights),
          keyFindings: findings.slice(0, 5).map((finding: any) => ({
            finding: this.simplifyFinding(finding),
            impact: this.explainImpactForNonTech(finding),
            priority: finding.significance,
            actionable: true
          })),
          recommendations: this.generateSimpleRecommendations(findings, template),
          nextSteps: [
            'Review the key findings above',
            'Look at the charts we created',
            'Read our recommendations',
            'Let us know if you have questions'
          ]
        };

      case 'business':
        return {
          executiveSummary: this.generateBusinessSummary(findings, insights, template),
          keyFindings: findings.map((finding: any) => ({
            finding: finding.title,
            impact: this.quantifyBusinessImpact(finding, template),
            priority: finding.significance,
            actionable: this.isActionable(finding)
          })),
          recommendations: this.generateBusinessRecommendations(findings, template),
          nextSteps: [
            'Share findings with stakeholders',
            'Implement top 3 recommendations',
            'Monitor KPI changes',
            'Schedule 30-day review'
          ]
        };

      case 'technical':
        return {
          executiveSummary: this.generateTechnicalSummary(findings, insights, technicalResults),
          keyFindings: findings.map((finding: any) => ({
            finding: `${finding.title} (confidence: ${finding.confidence})`,
            impact: this.describeTechnicalImpact(finding),
            priority: finding.significance,
            actionable: finding.category !== 'exploratory'
          })),
          recommendations: this.generateTechnicalRecommendations(findings, technicalResults),
          nextSteps: [
            'Review statistical assumptions and limitations',
            'Validate model performance on holdout set',
            'Document methodology for reproducibility',
            'Consider production deployment requirements'
          ]
        };

      default:
        return this.translateFindings(technicalResults, template, 'business');
    }
  }

  /**
   * Explain data quality issues in user-friendly terms
   */
  translateDataQuality(
    qualityReport: any,
    userRole: UserRole
  ): NaturalLanguageExplanation {
    const issueCount = qualityReport.issues?.length || 0;
    const qualityScore = qualityReport.qualityScore || 0;

    switch (userRole) {
      case 'non-tech':
        return {
          title: 'Data Quality Check',
          summary: `Your data is ${qualityScore}% ready for analysis. ${issueCount > 0 ? `We found ${issueCount} things to fix.` : 'Everything looks good!'}`,
          details: (qualityReport.issues || []).map((issue: any) =>
            `• ${this.explainQualityIssueForNonTech(issue)}`
          ),
          examples: [
            'Example: 15% of email addresses are blank (we can work with this)',
            'Example: Some phone numbers have different formats (we\'ll standardize them)'
          ],
          whyItMatters: 'Clean data gives you more accurate results and better insights.'
        };

      case 'business':
        return {
          title: 'Data Quality Assessment',
          summary: `Quality Score: ${qualityScore}/100 with ${issueCount} issues requiring attention.`,
          details: (qualityReport.issues || []).map((issue: any) =>
            `• ${issue.type}: ${issue.description} (${issue.affectedRecords} records, ${issue.severity} severity)`
          ),
          examples: qualityReport.issues?.slice(0, 3).map((issue: any) =>
            `Impact: ${this.quantifyQualityImpact(issue)}`
          ) || [],
          whyItMatters: 'Data quality directly impacts decision confidence and ROI from analysis.'
        };

      case 'technical':
        return {
          title: 'Data Quality Metrics',
          summary: `Completeness: ${qualityReport.completeness}%, Validity: ${qualityReport.validity}%, Consistency: ${qualityReport.consistency}%`,
          details: (qualityReport.issues || []).map((issue: any) =>
            `${issue.field || 'Multiple fields'}: ${issue.rule} - ${issue.message}`
          ),
          examples: (qualityReport.issues || []).map((issue: any) =>
            `Remediation: ${this.suggestTechnicalFix(issue)}`
          ),
          whyItMatters: 'Data quality validation ensures statistical assumptions and model performance.'
        };

      default:
        return this.translateDataQuality(qualityReport, 'business');
    }
  }

  // ============ PRIVATE HELPER METHODS ============

  private humanizeFieldName(field: string): string {
    return field
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  private explainFieldForNonTech(field: string, meta: any): string {
    const typeExplanations: Record<string, string> = {
      'string': 'text information',
      'number': 'numeric value',
      'integer': 'whole number',
      'boolean': 'yes/no value',
      'date': 'date',
      'timestamp': 'date and time'
    };

    const typeDesc = typeExplanations[meta.type] || meta.type;
    const nullableDesc = meta.nullable ? ' (can be blank)' : '';

    return `${typeDesc}${nullableDesc}${meta.example ? ` (e.g., ${meta.example})` : ''}`;
  }

  private explainFieldForBusiness(field: string, meta: any): string {
    return meta.description || `${meta.type} field used for ${this.inferBusinessPurpose(field)}`;
  }

  private analyzeFieldForConsultation(field: string, meta: any): string {
    const analysis = [];
    analysis.push(`Type: ${meta.type}, Nullable: ${meta.nullable || false}`);

    if (this.isKeyField(field)) {
      analysis.push('⚠️ Identified as key field - ensure uniqueness');
    }

    if (meta.type === 'string' && !meta.example) {
      analysis.push('💡 Consider adding validation rules or enum constraints');
    }

    return analysis.join(' | ');
  }

  private isKeyField(field: string): boolean {
    return field.toLowerCase().includes('id') || field.toLowerCase().includes('key');
  }

  private inferBusinessPurpose(field: string): string {
    const lowerField = field.toLowerCase();

    if (lowerField.includes('revenue') || lowerField.includes('price')) return 'financial tracking';
    if (lowerField.includes('customer') || lowerField.includes('user')) return 'customer identification';
    if (lowerField.includes('date') || lowerField.includes('time')) return 'temporal tracking';
    if (lowerField.includes('status') || lowerField.includes('state')) return 'workflow management';

    return 'business operations';
  }

  private generateSchemaExamples(schema: DataSchema, userRole: UserRole): string[] {
    const sampleFields = Object.entries(schema).slice(0, 3);

    return sampleFields.map(([field, meta]) => {
      if (userRole === 'technical') {
        return `${field}: ${meta.example || this.generateSampleValue(meta.type)}`;
      }
      return `${this.humanizeFieldName(field)}: ${meta.example || this.generateSampleValue(meta.type)}`;
    });
  }

  private generateSampleValue(type: string): string {
    const samples: Record<string, string> = {
      'string': '"Example Text"',
      'number': '42.5',
      'integer': '100',
      'boolean': 'true',
      'date': '2025-01-06',
      'timestamp': '2025-01-06 10:30:00'
    };
    return samples[type] || 'null';
  }

  private explainRelationshipForNonTech(rel: DataRelationship): string {
    const typeExplanations = {
      'one-to-one': 'connects to exactly one',
      'one-to-many': 'can connect to many',
      'many-to-many': 'can connect to many and vice versa',
      'derived': 'is calculated from'
    };

    const target = rel.targetField ? this.humanizeFieldName(rel.targetField) : 'other information';
    return `${typeExplanations[rel.type]} ${target}`;
  }

  private explainRelationshipForBusiness(rel: DataRelationship): string {
    return rel.description || this.inferBusinessRule(rel);
  }

  private inferBusinessRule(rel: DataRelationship): string {
    if (rel.type === 'derived') {
      return `${this.humanizeFieldName(rel.sourceField)} is calculated field`;
    }
    return `${this.humanizeFieldName(rel.sourceField)} relationship validates business logic`;
  }

  private generateSQLExample(rel: DataRelationship): string {
    if (rel.type === 'derived') {
      return `-- Derived: ${rel.sourceField} calculated from base fields`;
    }
    return `-- JOIN ON ${rel.sourceField}${rel.targetField ? ` = ${rel.targetField}` : ''}`;
  }

  private simplifyComponentName(name: string): string {
    const simplifications: Record<string, string> = {
      'statistical_analysis': 'Analyze patterns in your data',
      'correlation_analysis': 'Find relationships between factors',
      'regression_analysis': 'Predict outcomes',
      'classification': 'Categorize your data',
      'clustering': 'Group similar items together'
    };

    return simplifications[name] || name.replace(/_/g, ' ');
  }

  private explainComponentForNonTech(comp: AnalysisComponent): string {
    if (comp.type === 'statistical_test') {
      return 'We\'ll check if patterns in your data are real or just random.';
    }
    if (comp.type === 'ml_model') {
      return 'We\'ll build a prediction model using your data.';
    }
    if (comp.type === 'visualization') {
      return 'We\'ll create charts to show your results visually.';
    }
    return 'We\'ll process your data to extract insights.';
  }

  private explainComponentForBusiness(comp: AnalysisComponent): string {
    return `${comp.name}: ${comp.technicalDescription} → Impact on business KPIs and decision-making`;
  }

  private explainWhyThisMatters(comp: AnalysisComponent, userRole: UserRole): string {
    if (comp.type === 'statistical_test') {
      return 'This tells you if differences you see are meaningful or just coincidence.';
    }
    if (comp.type === 'ml_model') {
      return 'This helps you predict what might happen in the future.';
    }
    return 'This helps you make better decisions based on facts, not guesses.';
  }

  private mapToKPIs(comp: AnalysisComponent, template: any): string {
    const kpis = template?.businessInsights?.kpiImpact || ['Revenue', 'Cost', 'Efficiency'];
    return `Impacts: ${kpis.slice(0, 3).join(', ')}`;
  }

  private explainTechnicalRationale(comp: AnalysisComponent): string {
    return `Statistical method: ${comp.name}. Validates hypotheses and assumptions.`;
  }

  private estimateTimeForUser(components: AnalysisComponent[], userRole: UserRole): string {
    const baseMinutes = components.length * 5;

    if (userRole === 'non-tech') {
      return `About ${Math.ceil(baseMinutes / 60)} hour${baseMinutes > 60 ? 's' : ''}`;
    }
    return `${baseMinutes}-${baseMinutes * 2} minutes`;
  }

  private generateNonTechSummary(findings: any[], insights: any[]): string {
    if (findings.length === 0) return 'Analysis complete. No significant patterns found.';

    const topFinding = findings[0];
    return `We analyzed your data and found ${findings.length} important patterns. ${this.simplifyFinding(topFinding)}`;
  }

  private generateBusinessSummary(findings: any[], insights: any[], template: any): string {
    const kpiCount = template?.businessInsights?.kpiImpact?.length || 0;
    return `Analysis identified ${findings.length} key findings impacting ${kpiCount} business KPIs. Top insight: ${findings[0]?.title || 'See detailed findings below'}.`;
  }

  private generateTechnicalSummary(findings: any[], insights: any[], results: any): string {
    const testsPerformed = results.executionMetrics?.testsPerformed?.length || 0;
    const avgConfidence = findings.reduce((sum: number, f: any) => sum + (f.confidence || 0), 0) / findings.length;
    return `Executed ${testsPerformed} statistical tests. ${findings.length} findings with average confidence ${(avgConfidence * 100).toFixed(1)}%.`;
  }

  private simplifyFinding(finding: any): string {
    return finding.description?.split('.')[0] || finding.title;
  }

  private explainImpactForNonTech(finding: any): string {
    if (finding.significance === 'high') {
      return 'This is important and should influence your decisions.';
    }
    if (finding.significance === 'medium') {
      return 'This is worth noting and may be useful.';
    }
    return 'This is interesting background information.';
  }

  private quantifyBusinessImpact(finding: any, template: any): string {
    const kpis = template?.businessInsights?.kpiImpact || [];
    if (kpis.length > 0) {
      return `Potential impact on ${kpis[0]} and ${kpis.length - 1} other KPIs`;
    }
    return 'Business impact to be quantified based on your specific metrics';
  }

  private describeTechnicalImpact(finding: any): string {
    return `${finding.category} finding with ${finding.confidence ? (finding.confidence * 100).toFixed(1) + '% confidence' : 'high confidence'}`;
  }

  private isActionable(finding: any): boolean {
    return finding.significance === 'high' || finding.category === 'prediction';
  }

  private generateSimpleRecommendations(findings: any[], template: any): string[] {
    const recs = ['Share these results with your team', 'Focus on the high-priority findings first'];

    if (findings.some(f => f.category === 'anomaly')) {
      recs.push('Investigate the unusual patterns we found');
    }

    return recs;
  }

  private generateBusinessRecommendations(findings: any[], template: any): string[] {
    const recs = template?.businessInsights?.actionableRecommendations || [];

    if (recs.length > 0) return recs;

    return [
      'Implement data-driven changes based on top findings',
      'Set up monitoring for key metrics',
      'Schedule quarterly review of analysis results'
    ];
  }

  private generateTechnicalRecommendations(findings: any[], results: any): string[] {
    const recs = [
      'Validate statistical assumptions before deployment',
      'Document methodology for reproducibility'
    ];

    if (results.model) {
      recs.push('Implement model monitoring and retraining pipeline');
    }

    return recs;
  }

  private explainQualityIssueForNonTech(issue: any): string {
    if (issue.type === 'missing_values') {
      return `${issue.affectedRecords} rows have blank ${this.humanizeFieldName(issue.field || 'fields')} (we can handle this)`;
    }
    if (issue.type === 'invalid_format') {
      return `Some ${this.humanizeFieldName(issue.field || 'fields')} have inconsistent formats (we'll fix this)`;
    }
    if (issue.type === 'duplicates') {
      return `${issue.affectedRecords} duplicate entries found (we'll remove these)`;
    }
    return issue.message;
  }

  private quantifyQualityImpact(issue: any): string {
    const pct = ((issue.affectedRecords / issue.totalRecords) * 100).toFixed(1);
    return `${pct}% of data affected - ${issue.severity} impact on analysis accuracy`;
  }

  private suggestTechnicalFix(issue: any): string {
    if (issue.type === 'missing_values') {
      return issue.action === 'filled_with_default' ? 'Imputation with median/mode' : 'Remove rows with missing values';
    }
    if (issue.type === 'invalid_format') {
      return 'Apply regex pattern validation and standardization';
    }
    if (issue.type === 'duplicates') {
      return 'Deduplicate based on primary key fields';
    }
    return issue.action || 'Manual review required';
  }
}

// Export singleton instance
export const naturalLanguageTranslator = new NaturalLanguageTranslator();
