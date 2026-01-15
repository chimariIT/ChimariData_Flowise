/**
 * Data Masking Service
 * 
 * Provides PII detection and data masking capabilities to protect
 * sensitive information in query results and exports.
 * 
 * @module DataMaskingService
 */

/** Masking strategies */
export enum MaskingStrategy {
    REDACTION = 'redaction',           // ***-**-1234
    HASHING = 'hashing',               // SHA-256 hash
    TOKENIZATION = 'tokenization',     // Replace with token
    PARTIAL = 'partial',               // Show first/last N chars
    ENCRYPTION = 'encryption',         // AES encryption
    NULLIFICATION = 'nullification'    // Replace with NULL
}

/** PII data types */
export type PIIDataType = 'SSN' | 'EMAIL' | 'PHONE' | 'CREDIT_CARD' | 'IP_ADDRESS' | 'CUSTOM';

/** Masking rule */
export interface MaskingRule {
    id: string;
    columnPattern: string;             // Regex or column name
    dataType: PIIDataType;
    strategy: MaskingStrategy;
    config: {
        visibleChars?: number;
        hashAlgorithm?: string;
        encryptionKey?: string;
    };
    applyToRoles: string[];            // Which roles see masked data
    enabled: boolean;
}

/** PII detection result */
export interface PIIDetectionResult {
    hasPII: boolean;
    detectedFields: {
        field: string;
        type: PIIDataType;
        confidence: number;
        sampleValue?: string;
    }[];
    recommendation: string;
}

/**
 * Data Masking Service
 * 
 * Detects and masks PII in datasets to protect sensitive information.
 */
export class DataMaskingService {
    // PII detection patterns
    private static readonly SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;
    private static readonly EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    private static readonly PHONE_PATTERN = /\b(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;
    private static readonly CREDIT_CARD_PATTERN = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/;
    private static readonly IP_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;

    /**
     * Detect PII in dataset
     * 
     * @param data - Array of data records
     * @returns PII detection result
     */
    static detectPII(data: any[]): PIIDetectionResult {
        if (!data || data.length === 0) {
            return {
                hasPII: false,
                detectedFields: [],
                recommendation: 'No data to analyze'
            };
        }

        const detectedFields: PIIDetectionResult['detectedFields'] = [];
        const sample = data[0];

        // Check each field
        Object.keys(sample).forEach(field => {
            const values = data.slice(0, 100).map(row => String(row[field] || ''));
            const detection = this.detectPIIInField(field, values);

            if (detection) {
                detectedFields.push(detection);
            }
        });

        return {
            hasPII: detectedFields.length > 0,
            detectedFields,
            recommendation: detectedFields.length > 0
                ? `Found ${detectedFields.length} fields with PII. Consider applying masking.`
                : 'No PII detected'
        };
    }

    /**
     * Detect PII in a specific field
     */
    private static detectPIIInField(
        fieldName: string,
        values: string[]
    ): PIIDetectionResult['detectedFields'][0] | null {
        // Check field name patterns
        const fieldLower = fieldName.toLowerCase();

        if (fieldLower.includes('ssn') || fieldLower.includes('social')) {
            const matches = values.filter(v => this.SSN_PATTERN.test(v)).length;
            if (matches > 0) {
                return {
                    field: fieldName,
                    type: 'SSN',
                    confidence: matches / values.length,
                    sampleValue: values.find(v => this.SSN_PATTERN.test(v))
                };
            }
        }

        if (fieldLower.includes('email')) {
            const matches = values.filter(v => this.EMAIL_PATTERN.test(v)).length;
            if (matches > 0) {
                return {
                    field: fieldName,
                    type: 'EMAIL',
                    confidence: matches / values.length,
                    sampleValue: values.find(v => this.EMAIL_PATTERN.test(v))
                };
            }
        }

        if (fieldLower.includes('phone') || fieldLower.includes('mobile')) {
            const matches = values.filter(v => this.PHONE_PATTERN.test(v)).length;
            if (matches > 0) {
                return {
                    field: fieldName,
                    type: 'PHONE',
                    confidence: matches / values.length,
                    sampleValue: values.find(v => this.PHONE_PATTERN.test(v))
                };
            }
        }

        if (fieldLower.includes('card') || fieldLower.includes('credit')) {
            const matches = values.filter(v => this.CREDIT_CARD_PATTERN.test(v)).length;
            if (matches > 0) {
                return {
                    field: fieldName,
                    type: 'CREDIT_CARD',
                    confidence: matches / values.length
                };
            }
        }

        // Check value patterns
        const ssnMatches = values.filter(v => this.SSN_PATTERN.test(v)).length;
        if (ssnMatches / values.length > 0.5) {
            return {
                field: fieldName,
                type: 'SSN',
                confidence: ssnMatches / values.length
            };
        }

        const emailMatches = values.filter(v => this.EMAIL_PATTERN.test(v)).length;
        if (emailMatches / values.length > 0.5) {
            return {
                field: fieldName,
                type: 'EMAIL',
                confidence: emailMatches / values.length
            };
        }

        return null;
    }

    /**
     * Apply masking to dataset
     * 
     * @param data - Data to mask
     * @param rules - Masking rules
     * @param userRole - User role (determines which rules apply)
     * @returns Masked data
     */
    static maskData(data: any[], rules: MaskingRule[], userRole: string): any[] {
        if (!data || data.length === 0) return data;

        // Filter rules applicable to this user role
        const applicableRules = rules.filter(
            rule => rule.enabled && rule.applyToRoles.includes(userRole)
        );

        if (applicableRules.length === 0) return data;

        // Apply masking
        return data.map(row => {
            const maskedRow = { ...row };

            applicableRules.forEach(rule => {
                Object.keys(maskedRow).forEach(field => {
                    if (this.fieldMatchesPattern(field, rule.columnPattern)) {
                        maskedRow[field] = this.maskField(
                            maskedRow[field],
                            rule.strategy,
                            rule.config
                        );
                    }
                });
            });

            return maskedRow;
        });
    }

    /**
     * Check if field matches pattern
     */
    private static fieldMatchesPattern(field: string, pattern: string): boolean {
        try {
            const regex = new RegExp(pattern, 'i');
            return regex.test(field);
        } catch {
            return field.toLowerCase() === pattern.toLowerCase();
        }
    }

    /**
     * Mask a single field value
     * 
     * @param value - Value to mask
     * @param strategy - Masking strategy
     * @param config - Strategy configuration
     * @returns Masked value
     */
    static maskField(value: any, strategy: MaskingStrategy, config: any = {}): any {
        if (value === null || value === undefined) return value;

        const strValue = String(value);

        switch (strategy) {
            case MaskingStrategy.REDACTION:
                return this.redact(strValue);

            case MaskingStrategy.PARTIAL:
                return this.partialMask(strValue, config.visibleChars || 4);

            case MaskingStrategy.HASHING:
                return this.hash(strValue, config.hashAlgorithm || 'sha256');

            case MaskingStrategy.NULLIFICATION:
                return null;

            case MaskingStrategy.TOKENIZATION:
                return this.tokenize(strValue);

            default:
                return value;
        }
    }

    /**
     * Redact value (replace with asterisks)
     */
    private static redact(value: string): string {
        if (value.length <= 4) return '****';
        return '*'.repeat(value.length - 4) + value.slice(-4);
    }

    /**
     * Partial masking (show first/last N characters)
     */
    private static partialMask(value: string, visibleChars: number): string {
        if (value.length <= visibleChars * 2) {
            return '*'.repeat(value.length);
        }

        const start = value.slice(0, visibleChars);
        const end = value.slice(-visibleChars);
        const middle = '*'.repeat(value.length - visibleChars * 2);

        return `${start}${middle}${end}`;
    }

    /**
     * Hash value
     */
    private static hash(value: string, algorithm: string): string {
        // Simplified - in production, use crypto module
        return `[HASHED:${algorithm}:${value.length}chars]`;
    }

    /**
     * Tokenize value (replace with random token)
     */
    private static tokenize(value: string): string {
        // Simplified - in production, use proper tokenization
        return `TOKEN_${Math.random().toString(36).substring(7).toUpperCase()}`;
    }

    /**
     * Mask SSN
     */
    static maskSSN(ssn: string): string {
        return ssn.replace(/\d{3}-\d{2}-(\d{4})/, '***-**-$1');
    }

    /**
     * Mask email
     */
    static maskEmail(email: string): string {
        const [local, domain] = email.split('@');
        if (!domain) return email;

        const maskedLocal = local.length > 2
            ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
            : local;

        return `${maskedLocal}@${domain}`;
    }

    /**
     * Mask credit card
     */
    static maskCreditCard(cc: string): string {
        return cc.replace(/\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?(\d{4})/, '****-****-****-$1');
    }

    /**
     * Mask phone number
     */
    static maskPhone(phone: string): string {
        return phone.replace(/(\d{3})[-.\s]?(\d{3})[-.\s]?(\d{4})/, '***-***-$3');
    }
}
