import { faker } from '@faker-js/faker';
import crypto from 'crypto';

export interface AnonymizationTechnique {
  id: string;
  name: string;
  description: string;
  preservesFormat: boolean;
  preservesLength: boolean;
  reversible: boolean;
  category: 'masking' | 'substitution' | 'encryption' | 'generalization';
}

export interface AnonymizationOptions {
  technique: string;
  preserveFormat?: boolean;
  preserveLength?: boolean;
  customPattern?: string;
  encryptionKey?: string;
  generalizationLevel?: number;
}

export interface AnonymizationResult {
  originalValue: string;
  anonymizedValue: string;
  technique: string;
  metadata?: any;
}

export class AnonymizationEngine {
  private static techniques: AnonymizationTechnique[] = [
    {
      id: 'mask_partial',
      name: 'Partial Masking',
      description: 'Replace middle characters with asterisks',
      preservesFormat: true,
      preservesLength: true,
      reversible: false,
      category: 'masking'
    },
    {
      id: 'mask_full',
      name: 'Full Masking',
      description: 'Replace all characters with asterisks',
      preservesFormat: false,
      preservesLength: true,
      reversible: false,
      category: 'masking'
    },
    {
      id: 'substitute_fake',
      name: 'Fake Data Substitution',
      description: 'Replace with realistic fake data',
      preservesFormat: true,
      preservesLength: false,
      reversible: false,
      category: 'substitution'
    },
    {
      id: 'substitute_random',
      name: 'Random Substitution',
      description: 'Replace with random characters',
      preservesFormat: true,
      preservesLength: true,
      reversible: false,
      category: 'substitution'
    },
    {
      id: 'encrypt_aes',
      name: 'AES Encryption',
      description: 'Encrypt with AES-256 (reversible)',
      preservesFormat: false,
      preservesLength: false,
      reversible: true,
      category: 'encryption'
    },
    {
      id: 'hash_sha256',
      name: 'SHA-256 Hash',
      description: 'One-way hash function',
      preservesFormat: false,
      preservesLength: false,
      reversible: false,
      category: 'encryption'
    },
    {
      id: 'generalize_date',
      name: 'Date Generalization',
      description: 'Reduce date precision (year only, month/year, etc.)',
      preservesFormat: true,
      preservesLength: false,
      reversible: false,
      category: 'generalization'
    },
    {
      id: 'generalize_numeric',
      name: 'Numeric Generalization',
      description: 'Group numbers into ranges',
      preservesFormat: false,
      preservesLength: false,
      reversible: false,
      category: 'generalization'
    }
  ];

  static getTechniques(): AnonymizationTechnique[] {
    return this.techniques;
  }

  static anonymizeValue(value: string, options: AnonymizationOptions): AnonymizationResult {
    const technique = this.techniques.find(t => t.id === options.technique);
    if (!technique) {
      throw new Error(`Unknown anonymization technique: ${options.technique}`);
    }

    let anonymizedValue: string;
    let metadata: any = {};

    switch (options.technique) {
      case 'mask_partial':
        anonymizedValue = this.maskPartial(value);
        break;
      case 'mask_full':
        anonymizedValue = '*'.repeat(value.length);
        break;
      case 'substitute_fake':
        anonymizedValue = this.generateFakeData(value, options);
        break;
      case 'substitute_random':
        anonymizedValue = this.randomSubstitution(value, options);
        break;
      case 'encrypt_aes':
        const encrypted = this.encryptAES(value, options.encryptionKey || 'default-key');
        anonymizedValue = encrypted.value;
        metadata = { iv: encrypted.iv };
        break;
      case 'hash_sha256':
        anonymizedValue = this.hashSHA256(value);
        break;
      case 'generalize_date':
        anonymizedValue = this.generalizeDate(value, options.generalizationLevel || 1);
        break;
      case 'generalize_numeric':
        anonymizedValue = this.generalizeNumeric(value, options.generalizationLevel || 10);
        break;
      default:
        throw new Error(`Technique ${options.technique} not implemented`);
    }

    return {
      originalValue: value,
      anonymizedValue,
      technique: options.technique,
      metadata
    };
  }

  static anonymizeDataset(data: any[], columnMappings: Record<string, AnonymizationOptions>): any[] {
    return data.map(row => {
      const anonymizedRow = { ...row };
      
      Object.entries(columnMappings).forEach(([column, options]) => {
        if (row[column] !== undefined && row[column] !== null) {
          const result = this.anonymizeValue(String(row[column]), options);
          anonymizedRow[column] = result.anonymizedValue;
        }
      });

      return anonymizedRow;
    });
  }

  static previewAnonymization(data: any[], columnMappings: Record<string, AnonymizationOptions>, sampleSize: number = 5): any {
    const sample = data.slice(0, sampleSize);
    const preview = sample.map(row => {
      const previewRow: any = {};
      
      Object.keys(row).forEach(column => {
        if (columnMappings[column]) {
          const result = this.anonymizeValue(String(row[column]), columnMappings[column]);
          previewRow[column] = {
            original: result.originalValue,
            anonymized: result.anonymizedValue,
            technique: result.technique
          };
        } else {
          previewRow[column] = {
            original: row[column],
            anonymized: row[column],
            technique: 'none'
          };
        }
      });

      return previewRow;
    });

    return {
      preview,
      summary: this.generateAnonymizationSummary(columnMappings)
    };
  }

  private static maskPartial(value: string): string {
    if (value.length <= 2) return '*'.repeat(value.length);
    if (value.length <= 4) return value[0] + '*'.repeat(value.length - 2) + value[value.length - 1];
    
    const keepStart = Math.ceil(value.length * 0.2);
    const keepEnd = Math.ceil(value.length * 0.2);
    const maskLength = value.length - keepStart - keepEnd;
    
    return value.substring(0, keepStart) + '*'.repeat(maskLength) + value.substring(value.length - keepEnd);
  }

  private static generateFakeData(value: string, options: AnonymizationOptions): string {
    // Detect data type and generate appropriate fake data
    if (this.isEmail(value)) {
      return faker.internet.email();
    } else if (this.isName(value)) {
      return faker.person.fullName();
    } else if (this.isPhoneNumber(value)) {
      return faker.phone.number();
    } else if (this.isAddress(value)) {
      return faker.location.streetAddress();
    } else if (this.isSSN(value)) {
      return faker.string.numeric(9);
    } else if (this.isDate(value)) {
      return faker.date.past().toISOString().split('T')[0];
    } else {
      return faker.string.alphanumeric(value.length);
    }
  }

  private static randomSubstitution(value: string, options: AnonymizationOptions): string {
    const chars = options.preserveFormat ? 
      value.replace(/[a-zA-Z]/g, () => faker.string.alpha(1))
           .replace(/[0-9]/g, () => faker.string.numeric(1)) :
      faker.string.alphanumeric(value.length);
    
    return chars;
  }

  private static encryptAES(value: string, key: string): { value: string, iv: string } {
    const algorithm = 'aes-256-cbc';
    const keyBuffer = crypto.scryptSync(key, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(algorithm, keyBuffer);
    
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      value: encrypted,
      iv: iv.toString('hex')
    };
  }

  private static hashSHA256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private static generalizeDate(value: string, level: number): string {
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;

    switch (level) {
      case 1: // Year only
        return date.getFullYear().toString();
      case 2: // Month/Year
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      case 3: // Quarter/Year
        const quarter = Math.ceil((date.getMonth() + 1) / 3);
        return `Q${quarter} ${date.getFullYear()}`;
      default:
        return value;
    }
  }

  private static generalizeNumeric(value: string, rangeSize: number): string {
    const num = parseFloat(value);
    if (isNaN(num)) return value;

    const lower = Math.floor(num / rangeSize) * rangeSize;
    const upper = lower + rangeSize;
    
    return `${lower}-${upper}`;
  }

  private static generateAnonymizationSummary(columnMappings: Record<string, AnonymizationOptions>): any {
    const summary = {
      totalColumns: Object.keys(columnMappings).length,
      techniqueCount: {},
      categoryCount: {},
      reversibleCount: 0
    };

    Object.values(columnMappings).forEach(options => {
      const technique = this.techniques.find(t => t.id === options.technique);
      if (technique) {
        summary.techniqueCount[technique.name] = (summary.techniqueCount[technique.name] || 0) + 1;
        summary.categoryCount[technique.category] = (summary.categoryCount[technique.category] || 0) + 1;
        if (technique.reversible) summary.reversibleCount++;
      }
    });

    return summary;
  }

  // Helper methods for data type detection
  private static isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private static isName(value: string): boolean {
    return /^[a-zA-Z\s]+$/.test(value) && value.split(' ').length >= 2;
  }

  private static isPhoneNumber(value: string): boolean {
    return /^\+?[\d\s\-\(\)]+$/.test(value) && value.replace(/\D/g, '').length >= 10;
  }

  private static isAddress(value: string): boolean {
    return /\d+\s+[a-zA-Z\s]+/.test(value);
  }

  private static isSSN(value: string): boolean {
    return /^\d{3}-?\d{2}-?\d{4}$/.test(value);
  }

  private static isDate(value: string): boolean {
    return !isNaN(Date.parse(value));
  }
}