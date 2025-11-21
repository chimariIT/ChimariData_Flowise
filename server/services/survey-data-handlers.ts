/**
 * Survey-Specific Data Handlers
 * Specialized handling for survey datasets including:
 * - Excel multi-sheet processing
 * - Roster joining with survey responses
 * - Qualitative text analysis
 * - Likert scale aggregation
 * - Multi-year trend analysis
 */

import * as XLSX from 'xlsx';
import { enhancedDataIntelligence, DatasetIntelligence, ColumnIntelligence } from './enhanced-data-intelligence';

export interface ExcelSheet {
  name: string;
  data: any[];
  schema: Record<string, any>;
  rowCount: number;
  intelligence?: DatasetIntelligence;
}

export interface SurveyDataset {
  type: 'roster' | 'responses' | 'mixed' | 'qualitative';
  sheets: ExcelSheet[];
  joinKeys?: string[];
  timeColumns?: string[];
  qualitativeColumns?: string[];
}

export interface JoinedDataset {
  data: any[];
  schema: Record<string, any>;
  joinedOn: string;
  rosterFields: string[];
  responseFields: string[];
  rowCount: number;
}

export interface LikertAggregation {
  column: string;
  groupBy: string;
  aggregations: {
    group: string;
    mean: number;
    median: number;
    mode: number;
    count: number;
    distribution: Record<number, number>;
  }[];
}

export interface QualitativeAnalysis {
  column: string;
  totalResponses: number;
  responseLength: {
    min: number;
    max: number;
    avg: number;
  };
  themes: {
    theme: string;
    frequency: number;
    keywords: string[];
  }[];
  sentiment?: {
    positive: number;
    neutral: number;
    negative: number;
  };
}

export class SurveyDataHandlers {

  /**
   * Process Excel file with multiple sheets
   */
  async processExcelWithSheets(filePath: string): Promise<ExcelSheet[]> {
    console.log(`📊 Processing multi-sheet Excel file: ${filePath}`);

    try {
      const workbook = XLSX.readFile(filePath);
      const sheets: ExcelSheet[] = [];

      for (const sheetName of workbook.SheetNames) {
        console.log(`  📄 Processing sheet: ${sheetName}`);

        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        if (data.length === 0) {
          console.log(`  ⚠️  Skipping empty sheet: ${sheetName}`);
          continue;
        }

        // Generate schema from first row
        const schema = this.generateSchema(data);

        // Analyze with enhanced data intelligence
        const intelligence = await enhancedDataIntelligence.analyzeDataset({
          schema,
          sampleData: data.slice(0, Math.min(100, data.length)),
          fileName: sheetName
        });

        sheets.push({
          name: sheetName,
          data,
          schema,
          rowCount: data.length,
          intelligence
        });

        console.log(`  ✅ Sheet processed: ${sheetName} (${data.length} rows, ${Object.keys(schema).length} columns)`);
      }

      return sheets;
    } catch (error: any) {
      console.error(`❌ Failed to process Excel file:`, error);
      throw new Error(`Excel processing failed: ${error.message}`);
    }
  }

  /**
   * Automatically identify and join roster with survey responses
   */
  async joinRosterWithResponses(
    rosterSheet: ExcelSheet,
    responsesSheet: ExcelSheet
  ): Promise<JoinedDataset> {
    console.log(`🔗 Joining roster with survey responses...`);

    // Identify potential join keys from intelligence
    const rosterJoinKeys = this.identifyJoinKeys(rosterSheet.intelligence!);
    const responsesJoinKeys = this.identifyJoinKeys(responsesSheet.intelligence!);

    // Find common join key
    const commonKey = rosterJoinKeys.find(k => responsesJoinKeys.includes(k));

    if (!commonKey) {
      console.warn(`⚠️  No common join key found. Using first identifier from each.`);
      // Fallback: use first identifier-type column from each
      const rosterKey = rosterSheet.intelligence?.columns.find(c => c.detectedType === 'identifier')?.name;
      const responsesKey = responsesSheet.intelligence?.columns.find(c => c.detectedType === 'identifier')?.name;

      if (!rosterKey || !responsesKey) {
        throw new Error('Cannot join: No identifier columns found in datasets');
      }

      console.log(`  Using roster key: ${rosterKey}, responses key: ${responsesKey}`);
      return this.performJoin(rosterSheet, responsesSheet, rosterKey, responsesKey);
    }

    console.log(`  ✅ Joining on common key: ${commonKey}`);
    return this.performJoin(rosterSheet, responsesSheet, commonKey, commonKey);
  }

  /**
   * Perform the actual join operation
   */
  private performJoin(
    rosterSheet: ExcelSheet,
    responsesSheet: ExcelSheet,
    rosterKey: string,
    responsesKey: string
  ): JoinedDataset {
    console.log(`  🔄 Performing join: roster.${rosterKey} = responses.${responsesKey}`);

    // Create lookup map from roster
    const rosterMap = new Map<any, any>();
    for (const row of rosterSheet.data) {
      const key = row[rosterKey];
      if (key !== undefined && key !== null) {
        rosterMap.set(String(key).toLowerCase().trim(), row);
      }
    }

    // Join responses with roster data
    const joinedData: any[] = [];
    let matchedCount = 0;

    for (const response of responsesSheet.data) {
      const key = response[responsesKey];
      if (key !== undefined && key !== null) {
        const rosterRow = rosterMap.get(String(key).toLowerCase().trim());

        if (rosterRow) {
          matchedCount++;
          // Merge roster data with response data
          // Prefix roster fields to avoid collisions
          const merged: any = { ...response };
          for (const [rosterField, value] of Object.entries(rosterRow)) {
            if (rosterField !== rosterKey) {
              merged[`roster_${rosterField}`] = value;
            }
          }
          joinedData.push(merged);
        } else {
          // Include unmatched responses with null roster fields
          const merged: any = { ...response };
          for (const rosterField of Object.keys(rosterSheet.schema)) {
            if (rosterField !== rosterKey) {
              merged[`roster_${rosterField}`] = null;
            }
          }
          joinedData.push(merged);
        }
      }
    }

    console.log(`  ✅ Join complete: ${matchedCount}/${responsesSheet.data.length} responses matched`);

    // Extract field names
    const rosterFields = Object.keys(rosterSheet.schema).filter(f => f !== rosterKey).map(f => `roster_${f}`);
    const responseFields = Object.keys(responsesSheet.schema);

    // Generate merged schema
    const schema = this.generateSchema(joinedData);

    return {
      data: joinedData,
      schema,
      joinedOn: rosterKey,
      rosterFields,
      responseFields,
      rowCount: joinedData.length
    };
  }

  /**
   * Aggregate Likert scale responses by groups
   */
  aggregateLikertByGroup(
    data: any[],
    likertColumn: string,
    groupByColumn: string
  ): LikertAggregation {
    console.log(`📊 Aggregating Likert scale: ${likertColumn} by ${groupByColumn}`);

    // Group data
    const groups = new Map<string, number[]>();

    for (const row of data) {
      const group = String(row[groupByColumn] || 'Unknown');
      const value = Number(row[likertColumn]);

      if (!isNaN(value)) {
        if (!groups.has(group)) {
          groups.set(group, []);
        }
        groups.get(group)!.push(value);
      }
    }

    // Calculate aggregations for each group
    const aggregations = Array.from(groups.entries()).map(([group, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const median = sorted[Math.floor(sorted.length / 2)];

      // Calculate mode
      const frequency = new Map<number, number>();
      for (const v of values) {
        frequency.set(v, (frequency.get(v) || 0) + 1);
      }
      const mode = Array.from(frequency.entries()).reduce((a, b) => b[1] > a[1] ? b : a)[0];

      // Distribution
      const distribution: Record<number, number> = {};
      for (const v of values) {
        distribution[v] = (distribution[v] || 0) + 1;
      }

      return {
        group,
        mean: Math.round(mean * 100) / 100,
        median,
        mode,
        count: values.length,
        distribution
      };
    });

    console.log(`  ✅ Aggregated ${aggregations.length} groups`);

    return {
      column: likertColumn,
      groupBy: groupByColumn,
      aggregations
    };
  }

  /**
   * Analyze qualitative text responses
   */
  analyzeQualitativeText(
    data: any[],
    textColumn: string
  ): QualitativeAnalysis {
    console.log(`📝 Analyzing qualitative text: ${textColumn}`);

    const responses: string[] = [];
    const lengths: number[] = [];

    // Collect valid text responses
    for (const row of data) {
      const text = row[textColumn];
      if (text && typeof text === 'string' && text.trim().length > 0) {
        responses.push(text.trim());
        lengths.push(text.trim().length);
      }
    }

    if (responses.length === 0) {
      return {
        column: textColumn,
        totalResponses: 0,
        responseLength: { min: 0, max: 0, avg: 0 },
        themes: []
      };
    }

    // Calculate length statistics
    const responseLength = {
      min: Math.min(...lengths),
      max: Math.max(...lengths),
      avg: Math.round(lengths.reduce((sum, l) => sum + l, 0) / lengths.length)
    };

    // Extract themes using keyword frequency
    const themes = this.extractThemes(responses);

    console.log(`  ✅ Analyzed ${responses.length} text responses, found ${themes.length} themes`);

    return {
      column: textColumn,
      totalResponses: responses.length,
      responseLength,
      themes
    };
  }

  /**
   * Extract themes from text responses using keyword analysis
   */
  private extractThemes(responses: string[]): Array<{theme: string; frequency: number; keywords: string[]}> {
    // Combine all responses
    const allText = responses.join(' ').toLowerCase();

    // Common stop words to filter
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'been', 'be',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'that', 'this',
      'it', 'they', 'we', 'you', 'he', 'she', 'i', 'me', 'my', 'your', 'our', 'their'
    ]);

    // Extract words
    const words = allText
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));

    // Count word frequency
    const wordFrequency = new Map<string, number>();
    for (const word of words) {
      wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
    }

    // Get top keywords
    const topKeywords = Array.from(wordFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    // Group keywords into themes (simple clustering by co-occurrence)
    const themes: Array<{theme: string; frequency: number; keywords: string[]}> = [];

    // Theme 1: Most frequent keywords
    if (topKeywords.length >= 5) {
      themes.push({
        theme: 'Primary Topics',
        frequency: topKeywords.slice(0, 5).reduce((sum, [_, freq]) => sum + freq, 0),
        keywords: topKeywords.slice(0, 5).map(([word, _]) => word)
      });
    }

    // Theme 2: Action words (verbs)
    const actionWords = topKeywords.filter(([word, _]) =>
      word.endsWith('ing') || word.endsWith('ed') || ['need', 'want', 'improve', 'better', 'more', 'less'].includes(word)
    );
    if (actionWords.length > 0) {
      themes.push({
        theme: 'Action Items / Needs',
        frequency: actionWords.reduce((sum, [_, freq]) => sum + freq, 0),
        keywords: actionWords.slice(0, 5).map(([word, _]) => word)
      });
    }

    // Theme 3: Positive sentiment words
    const positiveWords = topKeywords.filter(([word, _]) =>
      ['good', 'great', 'excellent', 'happy', 'satisfied', 'love', 'like', 'enjoy', 'positive', 'well'].includes(word)
    );
    if (positiveWords.length > 0) {
      themes.push({
        theme: 'Positive Feedback',
        frequency: positiveWords.reduce((sum, [_, freq]) => sum + freq, 0),
        keywords: positiveWords.map(([word, _]) => word)
      });
    }

    // Theme 4: Negative sentiment words
    const negativeWords = topKeywords.filter(([word, _]) =>
      ['bad', 'poor', 'terrible', 'unhappy', 'dissatisfied', 'hate', 'dislike', 'negative', 'problem', 'issue'].includes(word)
    );
    if (negativeWords.length > 0) {
      themes.push({
        theme: 'Concerns / Issues',
        frequency: negativeWords.reduce((sum, [_, freq]) => sum + freq, 0),
        keywords: negativeWords.map(([word, _]) => word)
      });
    }

    return themes;
  }

  /**
   * Identify potential join keys from dataset intelligence
   */
  private identifyJoinKeys(intelligence: DatasetIntelligence): string[] {
    const joinKeys: string[] = [];

    // Look for identifier columns
    for (const col of intelligence.columns) {
      if (col.detectedType === 'identifier') {
        joinKeys.push(col.name);
      }
    }

    // Look for columns with "id", "key", "code" in name
    for (const col of intelligence.columns) {
      const name = col.name.toLowerCase();
      if (name.includes('id') || name.includes('key') || name.includes('code') ||
          name.includes('employee') || name.includes('user') || name.includes('person')) {
        if (!joinKeys.includes(col.name)) {
          joinKeys.push(col.name);
        }
      }
    }

    return joinKeys;
  }

  /**
   * Generate schema from data
   */
  private generateSchema(data: any[]): Record<string, any> {
    if (data.length === 0) return {};

    const schema: Record<string, any> = {};
    const firstRow = data[0];

    for (const [key, value] of Object.entries(firstRow)) {
      schema[key] = {
        type: typeof value,
        nullable: true
      };
    }

    return schema;
  }

  /**
   * Detect survey structure from multiple sheets
   */
  async detectSurveyStructure(sheets: ExcelSheet[]): Promise<{
    rosterSheet?: ExcelSheet;
    responsesSheet?: ExcelSheet;
    otherSheets: ExcelSheet[];
    suggestedJoin?: {
      rosterKey: string;
      responsesKey: string;
    };
  }> {
    console.log(`🔍 Detecting survey structure from ${sheets.length} sheets...`);

    let rosterSheet: ExcelSheet | undefined;
    let responsesSheet: ExcelSheet | undefined;
    const otherSheets: ExcelSheet[] = [];

    // Classify sheets based on intelligence
    for (const sheet of sheets) {
      const datasetType = sheet.intelligence?.datasetType;
      const hasLikertScales = sheet.intelligence?.columns.some(c => c.detectedType === 'likert_scale');
      const hasDemographics = sheet.intelligence?.columns.some(c => c.detectedType === 'demographic');

      if (datasetType === 'roster' || (hasDemographics && !hasLikertScales)) {
        rosterSheet = sheet;
        console.log(`  📋 Identified roster sheet: ${sheet.name}`);
      } else if (datasetType === 'survey_responses' || hasLikertScales) {
        responsesSheet = sheet;
        console.log(`  📝 Identified responses sheet: ${sheet.name}`);
      } else {
        otherSheets.push(sheet);
      }
    }

    // Suggest join if both roster and responses found
    let suggestedJoin;
    if (rosterSheet && responsesSheet) {
      const rosterKeys = this.identifyJoinKeys(rosterSheet.intelligence!);
      const responsesKeys = this.identifyJoinKeys(responsesSheet.intelligence!);
      const commonKey = rosterKeys.find(k => responsesKeys.includes(k));

      if (commonKey) {
        suggestedJoin = {
          rosterKey: commonKey,
          responsesKey: commonKey
        };
        console.log(`  🔗 Suggested join on: ${commonKey}`);
      }
    }

    return {
      rosterSheet,
      responsesSheet,
      otherSheets,
      suggestedJoin
    };
  }

  /**
   * Analyze multi-year trends in survey data
   */
  analyzeTrends(
    data: any[],
    yearColumn: string,
    metricColumn: string,
    groupByColumn?: string
  ): Array<{
    year: number;
    group?: string;
    mean: number;
    count: number;
    change?: number;
  }> {
    console.log(`📈 Analyzing trends: ${metricColumn} over ${yearColumn}${groupByColumn ? ` by ${groupByColumn}` : ''}`);

    // Group by year and optional groupBy
    const groups = new Map<string, { year: number; group?: string; values: number[] }>();

    for (const row of data) {
      const year = Number(row[yearColumn]);
      const group = groupByColumn ? String(row[groupByColumn]) : undefined;
      const value = Number(row[metricColumn]);

      if (!isNaN(year) && !isNaN(value)) {
        const key = `${year}${group ? `-${group}` : ''}`;
        if (!groups.has(key)) {
          groups.set(key, { year, group, values: [] });
        }
        groups.get(key)!.values.push(value);
      }
    }

    // Calculate means and changes
    const results = Array.from(groups.values()).map(g => ({
      year: g.year,
      group: g.group,
      mean: Math.round((g.values.reduce((sum, v) => sum + v, 0) / g.values.length) * 100) / 100,
      count: g.values.length,
      change: undefined as number | undefined
    }));

    // Sort by year and group
    results.sort((a, b) => {
      if (a.group && b.group && a.group !== b.group) {
        return a.group.localeCompare(b.group);
      }
      return a.year - b.year;
    });

    // Calculate year-over-year changes
    for (let i = 1; i < results.length; i++) {
      if (!results[i].group || results[i].group === results[i - 1].group) {
        const change = results[i].mean - results[i - 1].mean;
        results[i].change = Math.round(change * 100) / 100;
      }
    }

    console.log(`  ✅ Analyzed ${results.length} trend data points`);

    return results;
  }
}

// Export singleton
export const surveyDataHandlers = new SurveyDataHandlers();
