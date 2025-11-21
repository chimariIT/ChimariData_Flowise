/**
 * Enhanced Data Intelligence Service
 * Provides deep understanding of data nuances, especially for survey data
 */

export interface ColumnIntelligence {
  name: string;
  detectedType: 'likert_scale' | 'demographic' | 'qualitative' | 'quantitative' | 'identifier' | 'temporal' | 'unknown';
  confidence: number;
  suggestedMeaning: string;
  clarificationNeeded: boolean;
  clarificationQuestion?: string;
  scaleInfo?: {
    min: number;
    max: number;
    labels?: string[];
    reversed?: boolean; // e.g., "1=Strongly Agree, 5=Strongly Disagree"
  };
  demographicInfo?: {
    category: string; // e.g., "department", "grade_level", "location"
    values: string[];
    groupingPotential: boolean;
  };
}

export interface DatasetIntelligence {
  columns: ColumnIntelligence[];
  datasetType: 'survey_responses' | 'roster' | 'transactional' | 'time_series' | 'mixed' | 'unknown';
  clarifications: ClarificationRequest[];
  relationships: DetectedRelationship[];
  qualityIssues: DataQualityIssue[];
}

export interface ClarificationRequest {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  question: string;
  context: string;
  suggestedAnswers?: string[];
  affectedColumns: string[];
}

export interface DetectedRelationship {
  type: 'join_key' | 'hierarchical' | 'temporal' | 'derived';
  sourceColumn: string;
  targetColumn?: string;
  targetDataset?: string;
  confidence: number;
  description: string;
}

export interface DataQualityIssue {
  type: 'missing_values' | 'inconsistent_format' | 'outliers' | 'duplicates' | 'ambiguous_values';
  severity: 'critical' | 'high' | 'medium' | 'low';
  affectedColumns: string[];
  description: string;
  suggestedAction: string;
}

export class EnhancedDataIntelligence {
  /**
   * Analyze dataset and extract deep intelligence
   */
  async analyzeDataset(params: {
    schema: Record<string, any>;
    sampleData: any[];
    fileName: string;
    userGoal?: string;
  }): Promise<DatasetIntelligence> {
    console.log(`🧠 Analyzing dataset intelligence for: ${params.fileName}`);

    const columns: ColumnIntelligence[] = [];
    const clarifications: ClarificationRequest[] = [];
    const relationships: DetectedRelationship[] = [];
    const qualityIssues: DataQualityIssue[] = [];

    // Analyze each column
    for (const [colName, colInfo] of Object.entries(params.schema)) {
      const columnIntel = await this.analyzeColumn(
        colName,
        colInfo,
        params.sampleData,
        params.userGoal
      );
      columns.push(columnIntel);

      // Generate clarification if needed
      if (columnIntel.clarificationNeeded && columnIntel.clarificationQuestion) {
        clarifications.push({
          id: `clarify_${colName}`,
          priority: this.determineClarificationPriority(columnIntel),
          question: columnIntel.clarificationQuestion,
          context: `Column: "${colName}" - ${columnIntel.suggestedMeaning}`,
          suggestedAnswers: this.generateSuggestedAnswers(columnIntel),
          affectedColumns: [colName]
        });
      }
    }

    // Detect dataset type
    const datasetType = this.detectDatasetType(columns, params.fileName);

    // Detect relationships between columns
    relationships.push(...this.detectRelationships(columns, params.sampleData));

    // Identify quality issues
    qualityIssues.push(...this.identifyQualityIssues(columns, params.sampleData, params.schema));

    console.log(`🧠 Analysis complete: ${columns.length} columns, ${clarifications.length} clarifications needed`);

    return {
      columns,
      datasetType,
      clarifications,
      relationships,
      qualityIssues
    };
  }

  /**
   * Analyze individual column for nuanced understanding
   */
  private async analyzeColumn(
    colName: string,
    colInfo: any,
    sampleData: any[],
    userGoal?: string
  ): Promise<ColumnIntelligence> {
    const values = sampleData.map(row => row[colName]).filter(v => v != null);
    const uniqueValues = [...new Set(values)];

    // Detect Likert scale
    const likertDetection = this.detectLikertScale(colName, values, uniqueValues);
    if (likertDetection.isLikert) {
      return {
        name: colName,
        detectedType: 'likert_scale',
        confidence: likertDetection.confidence,
        suggestedMeaning: this.interpretColumnName(colName),
        clarificationNeeded: likertDetection.needsClarification,
        clarificationQuestion: likertDetection.needsClarification
          ? `For column "${colName}", which scale interpretation is correct?`
          : undefined,
        scaleInfo: likertDetection.scaleInfo
      };
    }

    // Detect demographic field
    const demographicDetection = this.detectDemographic(colName, uniqueValues, values);
    if (demographicDetection.isDemographic) {
      return {
        name: colName,
        detectedType: 'demographic',
        confidence: demographicDetection.confidence,
        suggestedMeaning: demographicDetection.meaning,
        clarificationNeeded: demographicDetection.needsClarification,
        clarificationQuestion: demographicDetection.needsClarification
          ? `Should we use "${colName}" to group/segment the data? What do these categories represent?`
          : undefined,
        demographicInfo: demographicDetection.info
      };
    }

    // Detect qualitative text
    const qualitativeDetection = this.detectQualitative(colName, values);
    if (qualitativeDetection.isQualitative) {
      return {
        name: colName,
        detectedType: 'qualitative',
        confidence: qualitativeDetection.confidence,
        suggestedMeaning: qualitativeDetection.meaning,
        clarificationNeeded: false
      };
    }

    // Detect temporal field
    const temporalDetection = this.detectTemporal(colName, values);
    if (temporalDetection.isTemporal) {
      return {
        name: colName,
        detectedType: 'temporal',
        confidence: temporalDetection.confidence,
        suggestedMeaning: temporalDetection.meaning,
        clarificationNeeded: temporalDetection.needsClarification,
        clarificationQuestion: temporalDetection.needsClarification
          ? `What date format is used in "${colName}"? (e.g., MM/DD/YYYY, YYYY-MM-DD)`
          : undefined
      };
    }

    // Detect identifier
    const identifierDetection = this.detectIdentifier(colName, uniqueValues, values);
    if (identifierDetection.isIdentifier) {
      return {
        name: colName,
        detectedType: 'identifier',
        confidence: identifierDetection.confidence,
        suggestedMeaning: identifierDetection.meaning,
        clarificationNeeded: identifierDetection.needsClarification,
        clarificationQuestion: identifierDetection.needsClarification
          ? `Is "${colName}" a unique identifier that can be used to join with other datasets?`
          : undefined
      };
    }

    // Default to quantitative or unknown
    const isNumeric = values.every(v => typeof v === 'number' || !isNaN(parseFloat(String(v))));
    return {
      name: colName,
      detectedType: isNumeric ? 'quantitative' : 'unknown',
      confidence: 0.5,
      suggestedMeaning: this.interpretColumnName(colName),
      clarificationNeeded: true,
      clarificationQuestion: `What does the column "${colName}" represent in your analysis?`
    };
  }

  /**
   * Detect Likert scale patterns
   */
  private detectLikertScale(
    colName: string,
    values: any[],
    uniqueValues: any[]
  ): { isLikert: boolean; confidence: number; needsClarification: boolean; scaleInfo?: any } {
    // Check if values are numeric and within typical Likert range
    const numericValues = values.filter(v => typeof v === 'number' || !isNaN(parseFloat(String(v))));
    if (numericValues.length < values.length * 0.8) {
      return { isLikert: false, confidence: 0, needsClarification: false };
    }

    const nums = numericValues.map(v => typeof v === 'number' ? v : parseFloat(String(v)));
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const range = max - min;

    // Typical Likert scales: 1-5, 1-7, 1-10, 0-10
    const isLikertRange = (
      (min === 1 && max <= 10 && range >= 3 && range <= 9) ||
      (min === 0 && max <= 10 && range >= 3)
    );

    if (!isLikertRange) {
      return { isLikert: false, confidence: 0, needsClarification: false };
    }

    // Check column name for satisfaction/agreement keywords
    const lowerName = colName.toLowerCase();
    const likertKeywords = [
      'satisfaction', 'agree', 'satisfied', 'rating', 'score', 'feel',
      'opinion', 'view', 'perception', 'experience', 'sentiment'
    ];
    const hasKeyword = likertKeywords.some(kw => lowerName.includes(kw));

    const confidence = hasKeyword ? 0.9 : 0.6;

    return {
      isLikert: true,
      confidence,
      needsClarification: !hasKeyword, // If no keyword, need clarification
      scaleInfo: {
        min,
        max,
        labels: this.suggestScaleLabels(min, max)
      }
    };
  }

  /**
   * Suggest scale labels based on range
   */
  private suggestScaleLabels(min: number, max: number): string[] {
    if (min === 1 && max === 5) {
      return ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];
    }
    if (min === 1 && max === 7) {
      return ['Strongly Disagree', 'Disagree', 'Somewhat Disagree', 'Neutral', 'Somewhat Agree', 'Agree', 'Strongly Agree'];
    }
    if (min === 0 && max === 10) {
      return ['Not at all likely', '...', 'Extremely likely'];
    }
    return [`${min} (Low)`, '...', `${max} (High)`];
  }

  /**
   * Detect demographic/grouping fields
   */
  private detectDemographic(
    colName: string,
    uniqueValues: any[],
    allValues: any[]
  ): { isDemographic: boolean; confidence: number; needsClarification: boolean; meaning: string; info?: any } {
    const lowerName = colName.toLowerCase();
    const demographicKeywords = [
      'department', 'team', 'division', 'location', 'office', 'region',
      'role', 'position', 'level', 'grade', 'room', 'group', 'category',
      'manager', 'leader', 'supervisor'
    ];

    const hasKeyword = demographicKeywords.some(kw => lowerName.includes(kw));

    // Check if categorical with reasonable number of categories
    const uniqueCount = uniqueValues.length;
    const isCategorical = uniqueCount > 1 && uniqueCount < allValues.length * 0.5 && uniqueCount < 50;

    if (!isCategorical && !hasKeyword) {
      return { isDemographic: false, confidence: 0, needsClarification: false, meaning: '' };
    }

    const confidence = hasKeyword && isCategorical ? 0.9 : hasKeyword ? 0.7 : 0.5;

    return {
      isDemographic: true,
      confidence,
      needsClarification: !hasKeyword,
      meaning: hasKeyword
        ? `Grouping by ${demographicKeywords.find(kw => lowerName.includes(kw))}`
        : 'Potential grouping field',
      info: {
        category: hasKeyword ? demographicKeywords.find(kw => lowerName.includes(kw))! : 'category',
        values: uniqueValues.map(String).slice(0, 20), // First 20 values
        groupingPotential: true
      }
    };
  }

  /**
   * Detect qualitative text fields
   */
  private detectQualitative(
    colName: string,
    values: any[]
  ): { isQualitative: boolean; confidence: number; meaning: string } {
    const stringValues = values.filter(v => typeof v === 'string');
    if (stringValues.length < values.length * 0.8) {
      return { isQualitative: false, confidence: 0, meaning: '' };
    }

    const avgLength = stringValues.reduce((sum, v) => sum + v.length, 0) / stringValues.length;
    const lowerName = colName.toLowerCase();
    const qualitativeKeywords = [
      'comment', 'feedback', 'response', 'answer', 'note', 'description',
      'remarks', 'suggestions', 'thoughts', 'opinion', 'text', 'write'
    ];

    const hasKeyword = qualitativeKeywords.some(kw => lowerName.includes(kw));
    const isLongText = avgLength > 50; // Average > 50 chars suggests free text

    if (!hasKeyword && !isLongText) {
      return { isQualitative: false, confidence: 0, meaning: '' };
    }

    return {
      isQualitative: true,
      confidence: hasKeyword && isLongText ? 0.95 : hasKeyword || isLongText ? 0.7 : 0.5,
      meaning: 'Qualitative text responses for sentiment/thematic analysis'
    };
  }

  /**
   * Detect temporal/date fields
   */
  private detectTemporal(
    colName: string,
    values: any[]
  ): { isTemporal: boolean; confidence: number; needsClarification: boolean; meaning: string } {
    const lowerName = colName.toLowerCase();
    const temporalKeywords = ['date', 'time', 'timestamp', 'year', 'month', 'quarter', 'period'];
    const hasKeyword = temporalKeywords.some(kw => lowerName.includes(kw));

    // Try to parse as dates
    const parsedDates = values.slice(0, 100).map(v => {
      if (v instanceof Date) return v;
      const parsed = new Date(String(v));
      return isNaN(parsed.getTime()) ? null : parsed;
    }).filter(Boolean);

    const isDate = parsedDates.length > values.slice(0, 100).length * 0.7;

    if (!hasKeyword && !isDate) {
      return { isTemporal: false, confidence: 0, needsClarification: false, meaning: '' };
    }

    return {
      isTemporal: true,
      confidence: hasKeyword && isDate ? 0.95 : hasKeyword || isDate ? 0.7 : 0.5,
      needsClarification: !isDate, // Need format clarification if not auto-parseable
      meaning: 'Temporal field for time-series analysis or filtering'
    };
  }

  /**
   * Detect identifier fields (IDs, keys)
   */
  private detectIdentifier(
    colName: string,
    uniqueValues: any[],
    allValues: any[]
  ): { isIdentifier: boolean; confidence: number; needsClarification: boolean; meaning: string } {
    const lowerName = colName.toLowerCase();
    const idKeywords = ['id', 'key', 'identifier', 'employee', 'number', 'code', 'ref'];
    const hasKeyword = idKeywords.some(kw => lowerName.includes(kw));

    const uniqueCount = uniqueValues.length;
    const totalCount = allValues.length;
    const uniquenessRatio = uniqueCount / totalCount;

    // High uniqueness suggests identifier
    const isUnique = uniquenessRatio > 0.9;

    if (!hasKeyword && !isUnique) {
      return { isIdentifier: false, confidence: 0, needsClarification: false, meaning: '' };
    }

    return {
      isIdentifier: true,
      confidence: hasKeyword && isUnique ? 0.95 : hasKeyword || isUnique ? 0.7 : 0.5,
      needsClarification: !hasKeyword && isUnique, // Clarify if unique but no keyword
      meaning: 'Unique identifier for joining datasets or deduplication'
    };
  }

  /**
   * Interpret column name semantically
   */
  private interpretColumnName(colName: string): string {
    const lowerName = colName.toLowerCase().replace(/_/g, ' ').replace(/-/g, ' ');

    // Extract question-like patterns
    if (lowerName.includes('how') || lowerName.includes('what') || lowerName.includes('why')) {
      return `Survey question: "${colName}"`;
    }

    // Extract meaning from common patterns
    const patterns: Record<string, string> = {
      'avg': 'Average',
      'pct': 'Percentage',
      'cnt': 'Count',
      'sum': 'Sum/Total',
      'min': 'Minimum',
      'max': 'Maximum',
      'std': 'Standard Deviation',
      'score': 'Score/Rating'
    };

    for (const [pattern, meaning] of Object.entries(patterns)) {
      if (lowerName.includes(pattern)) {
        return `${meaning} metric`;
      }
    }

    return `Data field: ${colName}`;
  }

  /**
   * Detect overall dataset type
   */
  private detectDatasetType(
    columns: ColumnIntelligence[],
    fileName: string
  ): DatasetIntelligence['datasetType'] {
    const likertCount = columns.filter(c => c.detectedType === 'likert_scale').length;
    const demographicCount = columns.filter(c => c.detectedType === 'demographic').length;
    const qualitativeCount = columns.filter(c => c.detectedType === 'qualitative').length;
    const temporalCount = columns.filter(c => c.detectedType === 'temporal').length;

    const lowerFileName = fileName.toLowerCase();

    // Survey response indicators
    if (likertCount > 3 || lowerFileName.includes('survey') || lowerFileName.includes('response')) {
      return 'survey_responses';
    }

    // Roster/demographic indicators
    if (demographicCount > 2 && likertCount < 2 && (lowerFileName.includes('roster') || lowerFileName.includes('employee'))) {
      return 'roster';
    }

    // Time series indicators
    if (temporalCount > 0 && columns.length > 5) {
      return 'time_series';
    }

    // Mixed if has various types
    if (likertCount > 0 && demographicCount > 0 && qualitativeCount > 0) {
      return 'mixed';
    }

    return 'unknown';
  }

  /**
   * Detect relationships between columns
   */
  private detectRelationships(
    columns: ColumnIntelligence[],
    sampleData: any[]
  ): DetectedRelationship[] {
    const relationships: DetectedRelationship[] = [];

    // Find potential join keys
    const identifiers = columns.filter(c => c.detectedType === 'identifier');
    for (const id of identifiers) {
      relationships.push({
        type: 'join_key',
        sourceColumn: id.name,
        confidence: id.confidence,
        description: `Potential join key for linking with other datasets containing "${id.name}"`
      });
    }

    // Find hierarchical relationships (e.g., manager -> employee)
    const demographics = columns.filter(c => c.detectedType === 'demographic');
    for (let i = 0; i < demographics.length; i++) {
      for (let j = i + 1; j < demographics.length; j++) {
        const col1 = demographics[i].name.toLowerCase();
        const col2 = demographics[j].name.toLowerCase();

        if ((col1.includes('manager') && col2.includes('employee')) ||
            (col1.includes('team') && col2.includes('member')) ||
            (col1.includes('department') && col2.includes('team'))) {
          relationships.push({
            type: 'hierarchical',
            sourceColumn: demographics[i].name,
            targetColumn: demographics[j].name,
            confidence: 0.7,
            description: `Hierarchical relationship: ${demographics[i].name} → ${demographics[j].name}`
          });
        }
      }
    }

    return relationships;
  }

  /**
   * Identify data quality issues
   */
  private identifyQualityIssues(
    columns: ColumnIntelligence[],
    sampleData: any[],
    schema: Record<string, any>
  ): DataQualityIssue[] {
    const issues: DataQualityIssue[] = [];

    for (const col of columns) {
      const values = sampleData.map(row => row[col.name]);
      const nonNullValues = values.filter(v => v != null && v !== '');
      const missingRatio = 1 - (nonNullValues.length / values.length);

      // Missing values check
      if (missingRatio > 0.5) {
        issues.push({
          type: 'missing_values',
          severity: 'critical',
          affectedColumns: [col.name],
          description: `${(missingRatio * 100).toFixed(0)}% of values are missing in "${col.name}"`,
          suggestedAction: 'Consider removing this column or imputing missing values'
        });
      } else if (missingRatio > 0.2) {
        issues.push({
          type: 'missing_values',
          severity: 'medium',
          affectedColumns: [col.name],
          description: `${(missingRatio * 100).toFixed(0)}% of values are missing in "${col.name}"`,
          suggestedAction: 'Review missing value pattern - may need imputation or exclusion'
        });
      }

      // Ambiguous values check for Likert scales
      if (col.detectedType === 'likert_scale') {
        const ambiguousValues = values.filter(v =>
          v != null && typeof v !== 'number' && isNaN(parseFloat(String(v)))
        );
        if (ambiguousValues.length > 0) {
          issues.push({
            type: 'ambiguous_values',
            severity: 'high',
            affectedColumns: [col.name],
            description: `Found non-numeric values in Likert scale "${col.name}"`,
            suggestedAction: 'Clarify scale mapping or clean data'
          });
        }
      }
    }

    return issues;
  }

  /**
   * Determine clarification priority based on column importance
   */
  private determineClarificationPriority(column: ColumnIntelligence): ClarificationRequest['priority'] {
    if (column.detectedType === 'identifier' && column.confidence < 0.7) {
      return 'critical'; // Need to know join keys
    }
    if (column.detectedType === 'likert_scale' && column.confidence < 0.7) {
      return 'high'; // Important for analysis
    }
    if (column.detectedType === 'demographic' && column.confidence < 0.7) {
      return 'high'; // Important for grouping
    }
    if (column.detectedType === 'unknown') {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Generate suggested answers for clarification
   */
  private generateSuggestedAnswers(column: ColumnIntelligence): string[] | undefined {
    if (column.detectedType === 'likert_scale' && column.scaleInfo) {
      return [
        `${column.scaleInfo.min}=Strongly Disagree, ${column.scaleInfo.max}=Strongly Agree`,
        `${column.scaleInfo.min}=Low, ${column.scaleInfo.max}=High`,
        `${column.scaleInfo.min}=Not at all, ${column.scaleInfo.max}=Extremely`
      ];
    }
    if (column.detectedType === 'demographic') {
      return [
        'Yes, use for grouping/segmentation',
        'No, ignore this field',
        'Use as filter only'
      ];
    }
    return undefined;
  }
}

// Export singleton instance
export const enhancedDataIntelligence = new EnhancedDataIntelligence();
