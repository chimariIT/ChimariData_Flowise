import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface PIIAnalysisResult {
  detectedPII: string[];
  columnAnalysis: Record<string, {
    isPII: boolean;
    confidence: number;
    type: string;
  }>;
  recommendations: string[];
}

export class PIIAnalyzer {
  private static readonly PII_PATTERNS = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    ipAddress: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
  };

  static async analyzePII(data: any[], schema: Record<string, any>): Promise<PIIAnalysisResult> {
    const detectedPII: string[] = [];
    const columnAnalysis: Record<string, { isPII: boolean; confidence: number; type: string }> = {};
    const recommendations: string[] = [];

    // Analyze each column
    for (const [columnName, columnInfo] of Object.entries(schema)) {
      const analysis = this.analyzeColumn(columnName, data, columnInfo);
      columnAnalysis[columnName] = analysis;

      if (analysis.isPII) {
        detectedPII.push(columnName);
      }
    }

    // Generate recommendations
    if (detectedPII.length > 0) {
      recommendations.push(`Found ${detectedPII.length} column(s) with potential PII: ${detectedPII.join(', ')}`);
      recommendations.push('Consider anonymizing or removing PII columns if not necessary for analysis');
      recommendations.push('Ensure proper data handling compliance (GDPR, CCPA, etc.)');
    }

    return {
      detectedPII,
      columnAnalysis,
      recommendations
    };
  }

  private static analyzeColumn(columnName: string, data: any[], columnInfo: any): { isPII: boolean; confidence: number; type: string } {
    const lowerColumnName = columnName.toLowerCase();
    let confidence = 0;
    let type = 'unknown';

    // Check column name patterns
    if (this.isPIIColumnName(lowerColumnName)) {
      confidence += 0.6;
      type = this.getPIIType(lowerColumnName);
    }

    // Check data patterns
    const sampleValues = data.slice(0, 100).map(row => row[columnName]).filter(val => val != null);
    const patternAnalysis = this.analyzeDataPatterns(sampleValues);
    
    confidence += patternAnalysis.confidence;
    if (patternAnalysis.type !== 'unknown') {
      type = patternAnalysis.type;
    }

    return {
      isPII: confidence > 0.5,
      confidence: Math.min(confidence, 1),
      type
    };
  }

  private static isPIIColumnName(columnName: string): boolean {
    const piiKeywords = [
      'email', 'mail', 'phone', 'mobile', 'tel', 'ssn', 'social', 'security',
      'credit', 'card', 'passport', 'license', 'id', 'identifier', 'address',
      'zip', 'postal', 'birth', 'dob', 'age', 'gender', 'race', 'ethnicity',
      'name', 'first', 'last', 'surname', 'given', 'middle', 'initial'
    ];

    return piiKeywords.some(keyword => columnName.includes(keyword));
  }

  private static getPIIType(columnName: string): string {
    if (columnName.includes('email') || columnName.includes('mail')) return 'email';
    if (columnName.includes('phone') || columnName.includes('mobile') || columnName.includes('tel')) return 'phone';
    if (columnName.includes('ssn') || columnName.includes('social')) return 'ssn';
    if (columnName.includes('credit') || columnName.includes('card')) return 'credit_card';
    if (columnName.includes('address')) return 'address';
    if (columnName.includes('name')) return 'name';
    if (columnName.includes('birth') || columnName.includes('dob')) return 'date_of_birth';
    return 'personal_identifier';
  }

  private static analyzeDataPatterns(values: any[]): { confidence: number; type: string } {
    let confidence = 0;
    let type = 'unknown';

    if (values.length === 0) return { confidence, type };

    const stringValues = values.map(v => String(v)).filter(v => v && v.length > 0);
    if (stringValues.length === 0) return { confidence, type };

    // Check for email patterns
    const emailMatches = stringValues.filter(v => this.PII_PATTERNS.email.test(v));
    if (emailMatches.length > stringValues.length * 0.5) {
      confidence += 0.8;
      type = 'email';
    }

    // Check for phone patterns
    const phoneMatches = stringValues.filter(v => this.PII_PATTERNS.phone.test(v));
    if (phoneMatches.length > stringValues.length * 0.5) {
      confidence += 0.7;
      type = 'phone';
    }

    // Check for SSN patterns
    const ssnMatches = stringValues.filter(v => this.PII_PATTERNS.ssn.test(v));
    if (ssnMatches.length > stringValues.length * 0.3) {
      confidence += 0.9;
      type = 'ssn';
    }

    // Check for credit card patterns
    const ccMatches = stringValues.filter(v => this.PII_PATTERNS.creditCard.test(v));
    if (ccMatches.length > stringValues.length * 0.3) {
      confidence += 0.9;
      type = 'credit_card';
    }

    // Check for potential names (multiple words, capitalized)
    const namePattern = /^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/;
    const nameMatches = stringValues.filter(v => namePattern.test(v));
    if (nameMatches.length > stringValues.length * 0.6) {
      confidence += 0.4;
      type = 'name';
    }

    return { confidence, type };
  }

  static async requestUserConsent(detectedPII: string[]): Promise<boolean> {
    // This would typically be handled by the frontend
    // For now, we'll return true to allow processing
    return true;
  }
}