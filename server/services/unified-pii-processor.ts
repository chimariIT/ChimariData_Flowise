/**
 * Unified PII Processor
 * 
 * Centralized service for detecting Personally Identifiable Information (PII)
 * in datasets using both column name matching and value pattern matching.
 */

export interface PIIResult {
    hasPII: boolean;
    piiFields: string[];
    piiTypes: Record<string, string>; // fieldName -> piiType
    confidence: Record<string, number>; // fieldName -> confidence score (0-1)
    sampleMatches: Record<string, string[]>; // fieldName -> sample matched values
}

export const UnifiedPIIProcessor = {
    /**
     * Regex patterns for common PII types
     */
    patterns: {
        email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        phone: /^(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/,
        ssn: /^\d{3}-?\d{2}-?\d{4}$/,
        creditCard: /^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})$/,
        ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
        uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    },

    /**
     * Keywords for column name matching
     */
    keywords: {
        email: ['email', 'e-mail', 'mail'],
        phone: ['phone', 'mobile', 'cell', 'fax', 'contact'],
        name: ['name', 'firstname', 'lastname', 'fullname', 'surname'],
        ssn: ['ssn', 'social', 'security', 'tax', 'id'],
        address: ['address', 'street', 'city', 'zip', 'postal', 'country', 'state'],
        financial: ['card', 'credit', 'debit', 'bank', 'account', 'iban', 'swift'],
        personal: ['birth', 'dob', 'gender', 'sex', 'age', 'race', 'ethnicity']
    },

    /**
     * Process data to detect PII
     * @param data Array of data rows (objects)
     * @param schema Optional schema information
     */
    processPIIData(data: any[], schema?: Record<string, any>): PIIResult {
        console.log("Processing PII data...");
        
        const result: PIIResult = {
            hasPII: false,
            piiFields: [],
            piiTypes: {},
            confidence: {},
            sampleMatches: {}
        };

        if (!data || data.length === 0) {
            return result;
        }

        const columns = Object.keys(data[0]);
        const sampleSize = Math.min(data.length, 100); // Check first 100 rows
        const samples = data.slice(0, sampleSize);

        for (const column of columns) {
            let piiType: string | null = null;
            let confidence = 0;
            let matchedValues: string[] = [];

            // 1. Check Column Name (Heuristic)
            const lowerCol = column.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            for (const [type, keywords] of Object.entries(this.keywords)) {
                if (keywords.some(k => lowerCol.includes(k))) {
                    piiType = type;
                    confidence = 0.6; // Base confidence for name match
                    break;
                }
            }

            // 2. Check Values (Pattern Matching)
            let matchCount = 0;
            let validCount = 0;
            const columnValues = samples.map(row => row[column]).filter(v => v !== null && v !== undefined && v !== '');

            if (columnValues.length > 0) {
                // Check against regex patterns
                for (const [type, pattern] of Object.entries(this.patterns)) {
                    let currentTypeMatches = 0;
                    
                    for (const value of columnValues) {
                        const strValue = String(value).trim();
                        if (pattern.test(strValue)) {
                            currentTypeMatches++;
                            if (matchedValues.length < 3) matchedValues.push(strValue);
                        }
                    }

                    if (currentTypeMatches > 0) {
                        const matchRate = currentTypeMatches / columnValues.length;
                        if (matchRate > 0.5) { // If >50% match pattern
                            piiType = type;
                            confidence = Math.max(confidence, 0.9); // High confidence for value match
                            break; 
                        } else if (matchRate > 0.1) {
                             // Mixed signal, potentially dirty data
                             if (piiType === type) {
                                 confidence = Math.max(confidence, 0.8); // Boost existing name match
                             } else if (!piiType) {
                                 piiType = type;
                                 confidence = 0.5;
                             }
                        }
                    }
                }
            }

            // 3. Register Result if PII detected
            if (piiType && confidence > 0.4) {
                result.hasPII = true;
                result.piiFields.push(column);
                result.piiTypes[column] = piiType;
                result.confidence[column] = confidence;
                result.sampleMatches[column] = matchedValues;
            }
        }

        return result;
    },

    generateProcessingSummary(result: PIIResult): string {
        if (!result.hasPII) {
            return "No PII detected in the dataset.";
        }

        const fields = result.piiFields.map(f => `${f} (${result.piiTypes[f]})`).join(', ');
        return `Detected PII in ${result.piiFields.length} fields: ${fields}. Please review and confirm handling.`;
    },
};
