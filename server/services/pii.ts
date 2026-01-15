export class PIIAnalyzer {
    static async analyzePII(data: any[], schema: Record<string, any>): Promise<any> {
        if (!data || data.length === 0) {
            return {
                detectedPII: [],
                columnAnalysis: {},
                recommendations: [],
                riskLevel: 'low'
            };
        }

        const detectedPII: any[] = [];
        const columnAnalysis: Record<string, any> = {};
        
        // PII detection patterns
        const piiPatterns = {
            email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
            phone: /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/,
            ssn: /^\d{3}-?\d{2}-?\d{4}$/,
            creditCard: /^\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}$/,
            ipAddress: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/,
            dateOfBirth: /^\d{4}[-\/]\d{2}[-\/]\d{2}$/
        };

        const piiKeywords = ['name', 'email', 'phone', 'address', 'ssn', 'social_security',
                            'credit_card', 'dob', 'birth', 'salary', 'income', 'password',
                            'secret', 'token', 'api_key', 'private', 'confidential', 'id',
                            'identifier', 'personal', 'address', 'zip', 'postal'];

        // Analyze each column
        const sampleSize = Math.min(100, data.length);
        const sampleData = data.slice(0, sampleSize);
        
        for (const [columnName, columnType] of Object.entries(schema)) {
            const columnNameLower = columnName.toLowerCase();
            let detectedTypes: string[] = [];
            let matchCount = 0;
            let totalChecked = 0;

            // Check column name for PII keywords
            const nameMatches = piiKeywords.filter(keyword => 
                columnNameLower.includes(keyword)
            );

            // Check sample data values for patterns
            for (const row of sampleData) {
                const value = row[columnName];
                if (value == null || value === '') continue;
                
                const valueStr = String(value).trim();
                totalChecked++;
                
                // Check patterns
                for (const [piiType, pattern] of Object.entries(piiPatterns)) {
                    if (pattern.test(valueStr)) {
                        if (!detectedTypes.includes(piiType)) {
                            detectedTypes.push(piiType);
                        }
                        matchCount++;
                        break; // Only count once per value
                    }
                }
            }

            // If column name suggests PII or patterns matched, flag it
            if (nameMatches.length > 0 || detectedTypes.length > 0) {
                const matchRate = totalChecked > 0 ? (matchCount / totalChecked) : 0;
                const confidence = nameMatches.length > 0 && matchRate > 0.1 ? 'high' : 
                                 matchRate > 0.3 ? 'high' : 
                                 matchRate > 0.1 ? 'medium' : 'low';

                if (confidence !== 'low' || nameMatches.length > 0) {
                    detectedPII.push({
                        column: columnName,
                        types: detectedTypes.length > 0 ? detectedTypes : 
                               nameMatches.length > 0 ? ['potential_' + nameMatches[0]] : ['potential'],
                        confidence: confidence,
                        matchRate: matchRate,
                        sampleMatches: matchCount,
                        totalChecked: totalChecked
                    });

                    columnAnalysis[columnName] = {
                        detectedTypes: detectedTypes,
                        nameKeywords: nameMatches,
                        confidence: confidence,
                        matchRate: matchRate
                    };
                }
            }
        }

        // Determine overall risk level
        const highRiskCount = detectedPII.filter(p => p.confidence === 'high').length;
        const riskLevel = highRiskCount > 0 ? 'high' : 
                        detectedPII.length > 3 ? 'medium' : 
                        detectedPII.length > 0 ? 'low' : 'none';

        const recommendations: string[] = [];
        if (detectedPII.length > 0) {
            recommendations.push('Review detected PII columns and decide whether to exclude or anonymize them');
            if (highRiskCount > 0) {
                recommendations.push('High-risk PII detected - consider excluding sensitive columns before analysis');
            }
            recommendations.push('Ensure compliance with data protection regulations (GDPR, CCPA, etc.)');
        }

        return {
            detectedPII: detectedPII,
            columnAnalysis: columnAnalysis,
            recommendations: recommendations,
            riskLevel: riskLevel,
            summary: {
                totalColumns: Object.keys(schema).length,
                piiColumnsDetected: detectedPII.length,
                highRiskColumns: highRiskCount
            }
        };
    }
}
