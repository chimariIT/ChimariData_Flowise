import crypto from 'crypto';

export interface PIIDetectionResult {
  hasPII: boolean;
  detectedTypes: PIIType[];
  affectedColumns: string[];
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
}

export interface PIIType {
  type: 'ssn' | 'email' | 'phone' | 'address' | 'name' | 'credit_card' | 'ip_address' | 'date_of_birth';
  column: string;
  confidence: number;
  sampleValue?: string;
  count: number;
}

export interface AnonymizationResult {
  anonymizedData: any[];
  lookupTable: Record<string, Record<string, string>>;
  summary: {
    totalRecords: number;
    anonymizedFields: number;
    preservedStructure: boolean;
  };
}

export class PIIDetector {
  private static readonly PII_PATTERNS = {
    ssn: {
      regex: /\b\d{3}-?\d{2}-?\d{4}\b/g,
      name: 'Social Security Number'
    },
    email: {
      regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      name: 'Email Address'
    },
    phone: {
      regex: /\b(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
      name: 'Phone Number'
    },
    credit_card: {
      regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
      name: 'Credit Card Number'
    },
    ip_address: {
      regex: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
      name: 'IP Address'
    },
    date_of_birth: {
      regex: /\b(?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12][0-9]|3[01])[-/](?:19|20)\d{2}\b/g,
      name: 'Date of Birth'
    }
  };

  private static readonly NAME_INDICATORS = [
    'name', 'first_name', 'last_name', 'firstname', 'lastname', 'full_name',
    'customer_name', 'employee_name', 'contact_name', 'person_name', 'client_name',
    'author', 'reviewer', 'owner'
  ];

  private static readonly ADDRESS_INDICATORS = [
    'address', 'street', 'city', 'state', 'zip', 'zipcode', 'postal_code',
    'home_address', 'work_address', 'billing_address', 'shipping_address',
    'location', 'residence'
  ];

  // Exclude columns that are commonly non-PII but might have capitalized words
  private static readonly NON_PII_INDICATORS = [
    'country', 'province', 'region', 'state', 'city', 'district', 'area',
    'variety', 'type', 'category', 'classification', 'genre', 'style',
    'brand', 'model', 'product', 'item', 'title', 'subject',
    'winery', 'vineyard', 'brewery', 'company', 'organization',
    'designation', 'appellation', 'description', 'notes', 'comments'
  ];

  static async detectPII(data: any[], schema: Record<string, string>): Promise<PIIDetectionResult> {
    const detectedTypes: PIIType[] = [];
    const affectedColumns: string[] = [];

    // Analyze each column
    for (const [columnName, dataType] of Object.entries(schema)) {
      const columnData = data.map(row => row[columnName]).filter(val => val != null);
      
      if (columnData.length === 0) continue;

      // Check for pattern-based PII
      for (const [piiType, pattern] of Object.entries(this.PII_PATTERNS)) {
        const matches = this.findPatternMatches(columnData, pattern.regex);
        if (matches.count > 0) {
          detectedTypes.push({
            type: piiType as PIIType['type'],
            column: columnName,
            confidence: Math.min(matches.count / columnData.length, 1.0),
            sampleValue: this.maskSample(matches.sample),
            count: matches.count
          });
          if (!affectedColumns.includes(columnName)) {
            affectedColumns.push(columnName);
          }
        }
      }

      // Check for name columns
      if (this.isNameColumn(columnName, columnData)) {
        detectedTypes.push({
          type: 'name',
          column: columnName,
          confidence: 0.9,
          sampleValue: this.maskSample(columnData[0]),
          count: columnData.length
        });
        if (!affectedColumns.includes(columnName)) {
          affectedColumns.push(columnName);
        }
      }

      // Check for address columns
      if (this.isAddressColumn(columnName, columnData)) {
        detectedTypes.push({
          type: 'address',
          column: columnName,
          confidence: 0.8,
          sampleValue: this.maskSample(columnData[0]),
          count: columnData.length
        });
        if (!affectedColumns.includes(columnName)) {
          affectedColumns.push(columnName);
        }
      }
    }

    const riskLevel = this.calculateRiskLevel(detectedTypes);
    const recommendations = this.generateRecommendations(detectedTypes);

    return {
      hasPII: detectedTypes.length > 0,
      detectedTypes,
      affectedColumns,
      riskLevel,
      recommendations
    };
  }

  static async anonymizeData(
    data: any[], 
    piiColumns: string[],
    preserveStructure: boolean = true
  ): Promise<AnonymizationResult> {
    const lookupTable: Record<string, Record<string, string>> = {};
    const anonymizedData = [...data];

    // Initialize lookup tables for each PII column
    piiColumns.forEach(column => {
      lookupTable[column] = {};
    });

    // Process each record
    anonymizedData.forEach((record, index) => {
      piiColumns.forEach(column => {
        const originalValue = record[column];
        if (originalValue != null && originalValue !== '') {
          const stringValue = String(originalValue);
          // Check if we already have an anonymized version
          if (!lookupTable[column][stringValue]) {
            lookupTable[column][stringValue] = this.generateAnonymizedValue(column, originalValue, preserveStructure);
          }
          record[column] = lookupTable[column][stringValue];
        }
      });
    });

    return {
      anonymizedData,
      lookupTable,
      summary: {
        totalRecords: data.length,
        anonymizedFields: piiColumns.length,
        preservedStructure: preserveStructure
      }
    };
  }

  private static findPatternMatches(columnData: any[], regex: RegExp): { count: number; sample: string } {
    let count = 0;
    let sample = '';

    for (const value of columnData) {
      const stringValue = String(value);
      const matches = stringValue.match(regex);
      if (matches && matches.length > 0) {
        count++;
        if (!sample) sample = matches[0];
      }
    }

    return { count, sample };
  }

  private static isNameColumn(columnName: string, columnData: any[]): boolean {
    const lowerName = columnName.toLowerCase();
    
    // First check if this column should be excluded from name detection
    if (this.NON_PII_INDICATORS.some(indicator => lowerName.includes(indicator))) {
      return false;
    }
    
    // Check if column name explicitly indicates it contains names
    if (this.NAME_INDICATORS.some(indicator => lowerName.includes(indicator))) {
      return true;
    }

    // For non-explicit columns, use stricter criteria for name detection
    const sampleValues = columnData.slice(0, 20).map(val => String(val).trim());
    
    // Check for common non-name patterns that should be excluded
    const hasCommonWords = sampleValues.some(val => {
      const words = val.toLowerCase().split(/\s+/);
      // Common geographic, product, or descriptive words that aren't names
      const commonNonNameWords = [
        'valley', 'mountain', 'river', 'county', 'state', 'province', 'region',
        'wine', 'red', 'white', 'sweet', 'dry', 'blend', 'reserve', 'estate',
        'vintage', 'barrel', 'oak', 'fruit', 'berry', 'spice', 'herb',
        'california', 'france', 'italy', 'spain', 'australia', 'chile',
        'cabernet', 'chardonnay', 'pinot', 'merlot', 'sauvignon', 'riesling'
      ];
      return words.some(word => commonNonNameWords.includes(word));
    });
    
    if (hasCommonWords) {
      return false;
    }

    // Only detect as names if column explicitly contains name indicators
    // Remove the pattern-based detection that was causing false positives
    return false;
  }

  private static isAddressColumn(columnName: string, columnData: any[]): boolean {
    const lowerName = columnName.toLowerCase();
    
    // First check if this column should be excluded from address detection
    if (this.NON_PII_INDICATORS.some(indicator => lowerName.includes(indicator))) {
      return false;
    }
    
    // Check if column name explicitly indicates it contains addresses
    if (this.ADDRESS_INDICATORS.some(indicator => lowerName.includes(indicator))) {
      return true;
    }

    // Use stricter criteria for pattern-based address detection
    const sampleValues = columnData.slice(0, 20).map(val => String(val).trim());
    
    // Only consider as address if it has clear street address patterns
    const addressPatterns = sampleValues.filter(val => {
      // Must have number + street type combination
      return /^\d+\s+.*(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|place|pl)\b/i.test(val) &&
             val.length > 10; // Addresses are typically longer
    });

    // Require a higher threshold for address detection
    return addressPatterns.length >= Math.min(3, sampleValues.length * 0.7);
  }

  private static calculateRiskLevel(detectedTypes: PIIType[]): 'low' | 'medium' | 'high' {
    const highRiskTypes = ['ssn', 'credit_card'];
    const mediumRiskTypes = ['email', 'phone', 'address', 'date_of_birth'];

    if (detectedTypes.some(type => highRiskTypes.includes(type.type))) {
      return 'high';
    } else if (detectedTypes.some(type => mediumRiskTypes.includes(type.type))) {
      return 'medium';
    } else if (detectedTypes.length > 0) {
      return 'low';
    }
    return 'low';
  }

  private static generateRecommendations(detectedTypes: PIIType[]): string[] {
    const recommendations: string[] = [];

    if (detectedTypes.some(type => ['ssn', 'credit_card'].includes(type.type))) {
      recommendations.push('High-risk PII detected. Strong anonymization recommended.');
      recommendations.push('Consider removing sensitive fields if not essential for analysis.');
    }

    if (detectedTypes.some(type => type.type === 'name')) {
      recommendations.push('Personal names detected. Consider using initials or generic identifiers.');
    }

    if (detectedTypes.some(type => type.type === 'address')) {
      recommendations.push('Address information found. Consider using geographic regions instead.');
    }

    if (detectedTypes.some(type => ['email', 'phone'].includes(type.type))) {
      recommendations.push('Contact information detected. Hash or anonymize for privacy protection.');
    }

    if (recommendations.length === 0) {
      recommendations.push('Review data sensitivity and apply appropriate protection measures.');
    }

    return recommendations;
  }

  private static generateAnonymizedValue(columnType: string, originalValue: any, preserveStructure: boolean): string {
    const stringValue = String(originalValue);
    const hash = crypto.createHash('sha256').update(stringValue).digest('hex').substring(0, 8);

    if (!preserveStructure) {
      return `ANON_${hash}`;
    }

    // Generate structure-preserving anonymized values
    if (columnType.toLowerCase().includes('name')) {
      return `Person_${hash}`;
    } else if (columnType.toLowerCase().includes('address')) {
      return `Address_${hash}`;
    } else if (columnType.toLowerCase().includes('email')) {
      return `user_${hash}@anonymized.com`;
    } else if (columnType.toLowerCase().includes('phone')) {
      return `555-${hash.substring(0, 3)}-${hash.substring(3, 7)}`;
    } else {
      return `ANON_${hash}`;
    }
  }

  private static maskSample(value: string): string {
    if (!value || value.length <= 4) {
      return '***';
    }
    return value.substring(0, 2) + '*'.repeat(Math.min(value.length - 4, 6)) + value.substring(value.length - 2);
  }
}