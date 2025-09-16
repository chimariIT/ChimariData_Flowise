import { PIIAnalyzer } from './pii-analyzer';

export interface PIIProcessingConfig {
  decision: 'include' | 'exclude' | 'anonymize';
  anonymizationConfig?: any;
  piiAnalysis: any;
  originalData: any[];
  originalSchema: any;
  overriddenColumns?: string[];
}

export interface PIIProcessingResult {
  finalData: any[];
  updatedSchema: any;
  recordCount: number;
  columnsRemoved: string[];
  columnsAnonymized: string[];
  lookupTable?: any;
  processingDetails: {
    decision: string;
    originalColumnCount: number;
    finalColumnCount: number;
    originalRecordCount: number;
    finalRecordCount: number;
    timestamp: Date;
  };
}

export class UnifiedPIIProcessor {
  /**
   * Process PII data based on user decision and configuration
   * Ensures consistent handling across trial and full feature workflows
   */
  static async processPIIData(config: PIIProcessingConfig): Promise<PIIProcessingResult> {
    const { decision, anonymizationConfig, piiAnalysis, originalData, originalSchema, overriddenColumns = [] } = config;
    
    let finalData = [...originalData];
    let updatedSchema = { ...originalSchema };
    let columnsRemoved: string[] = [];
    let columnsAnonymized: string[] = [];
    let lookupTable: any = null;
    
    const originalColumnCount = Object.keys(originalSchema).length;
    const originalRecordCount = originalData.length;
    
    // Filter out overridden columns from PII analysis
    const effectivePIIColumns = piiAnalysis.detectedPII.filter(col => !overriddenColumns.includes(col));
    
    console.log(`Processing PII data with decision: ${decision}`, {
      originalColumns: originalColumnCount,
      originalRecords: originalRecordCount,
      detectedPII: piiAnalysis.detectedPII,
      overriddenColumns: overriddenColumns,
      effectivePIIColumns: effectivePIIColumns
    });
    
    switch (decision) {
      case 'exclude':
        // Remove only effective PII columns (not overridden ones) from both data and schema
        finalData = originalData.map(row => {
          const cleanRow = { ...row };
          effectivePIIColumns.forEach(piiColumn => {
            delete cleanRow[piiColumn];
          });
          return cleanRow;
        });
        
        // Update schema to remove only effective PII columns
        const excludeSchema = { ...originalSchema };
        effectivePIIColumns.forEach(piiColumn => {
          delete excludeSchema[piiColumn];
          columnsRemoved.push(piiColumn);
        });
        updatedSchema = excludeSchema;
        
        console.log(`Excluded ${columnsRemoved.length} PII columns:`, columnsRemoved);
        break;
        
      case 'anonymize':
        // Parse advanced anonymization config if provided
        let anonConfig = null;
        if (anonymizationConfig) {
          try {
            anonConfig = typeof anonymizationConfig === 'string' 
              ? JSON.parse(anonymizationConfig) 
              : anonymizationConfig;
          } catch (e) {
            console.error('Failed to parse anonymization config:', e);
          }
        }
        
        // Apply advanced anonymization if config is provided
        if (anonConfig && anonConfig.fieldsToAnonymize) {
          // Filter out overridden columns from anonymization
          const fieldsToAnonymize = anonConfig.fieldsToAnonymize.filter(field => !overriddenColumns.includes(field));
          
          // Update config to only anonymize non-overridden fields
          const filteredConfig = {
            ...anonConfig,
            fieldsToAnonymize: fieldsToAnonymize
          };
          
          const anonymizationResult = await PIIAnalyzer.applyAdvancedAnonymization(
            originalData,
            filteredConfig
          );
          finalData = anonymizationResult.data;
          lookupTable = anonymizationResult.lookupTable;
          columnsAnonymized = fieldsToAnonymize;
          
          console.log(`Applied advanced anonymization to ${columnsAnonymized.length} columns:`, columnsAnonymized);
        } else {
          // Apply basic anonymization to effective PII columns (not overridden ones)
          finalData = originalData.map(row => {
            const anonymizedRow = { ...row };
            effectivePIIColumns.forEach(piiColumn => {
              if (anonymizedRow[piiColumn]) {
                const columnType = piiAnalysis.columnAnalysis[piiColumn]?.type;
                anonymizedRow[piiColumn] = this.generateBasicAnonymizedValue(
                  anonymizedRow[piiColumn], 
                  columnType
                );
              }
            });
            return anonymizedRow;
          });
          columnsAnonymized = [...effectivePIIColumns];
          
          console.log(`Applied basic anonymization to ${columnsAnonymized.length} columns:`, columnsAnonymized);
        }
        
        // Update schema to reflect anonymized sample values
        if (finalData.length > 0) {
          Object.keys(updatedSchema).forEach(columnName => {
            if (finalData[0][columnName] !== undefined) {
              updatedSchema[columnName] = {
                ...updatedSchema[columnName],
                sampleValues: finalData.slice(0, 3).map(row => row[columnName]).filter(val => val !== undefined)
              };
            }
          });
        }
        break;
        
      case 'include':
        // Show warning but proceed with original data
        console.log('Warning: User chose to include PII data in analysis');
        // No changes to data or schema
        break;
        
      default:
        throw new Error(`Invalid PII decision: ${decision}`);
    }
    
    const finalColumnCount = Object.keys(updatedSchema).length;
    const finalRecordCount = finalData.length;
    
    console.log(`PII processing complete:`, {
      decision,
      originalColumns: originalColumnCount,
      finalColumns: finalColumnCount,
      columnsRemoved: columnsRemoved.length,
      columnsAnonymized: columnsAnonymized.length,
      records: finalRecordCount
    });
    
    return {
      finalData,
      updatedSchema,
      recordCount: finalRecordCount,
      columnsRemoved,
      columnsAnonymized,
      lookupTable,
      processingDetails: {
        decision,
        originalColumnCount,
        finalColumnCount,
        originalRecordCount,
        finalRecordCount,
        timestamp: new Date()
      }
    };
  }
  
  /**
   * Generate basic anonymized value based on column type
   */
  private static generateBasicAnonymizedValue(originalValue: any, columnType: string): string {
    switch (columnType) {
      case 'email':
        return `user${Math.random().toString(36).substr(2, 6)}@example.com`;
      case 'phone':
        return `***-***-${Math.random().toString().substr(2, 4)}`;
      case 'ssn':
        return `XXX-XX-${Math.floor(Math.random() * 9000) + 1000}`;
      case 'name':
        return `Person${Math.random().toString(36).substr(2, 3)}`;
      case 'credit_card':
        return `****-****-****-${Math.floor(Math.random() * 9000) + 1000}`;
      case 'address':
        return `*** Street, City, State`;
      default:
        return '***ANONYMIZED***';
    }
  }
  
  /**
   * Validate PII processing configuration
   */
  static validateConfig(config: PIIProcessingConfig): boolean {
    if (!config.decision || !['include', 'exclude', 'anonymize'].includes(config.decision)) {
      throw new Error('Invalid PII decision. Must be: include, exclude, or anonymize');
    }
    
    if (!config.piiAnalysis || !config.piiAnalysis.detectedPII) {
      throw new Error('PII analysis data is required');
    }
    
    if (!config.originalData || !Array.isArray(config.originalData)) {
      throw new Error('Original data array is required');
    }
    
    if (!config.originalSchema || typeof config.originalSchema !== 'object') {
      throw new Error('Original schema object is required');
    }
    
    return true;
  }
  
  /**
   * Generate processing summary for logging and user feedback
   */
  static generateProcessingSummary(result: PIIProcessingResult): string {
    const { processingDetails, columnsRemoved, columnsAnonymized } = result;
    
    let summary = `PII Processing Summary:\n`;
    summary += `Decision: ${processingDetails.decision}\n`;
    summary += `Original: ${processingDetails.originalColumnCount} columns, ${processingDetails.originalRecordCount} records\n`;
    summary += `Final: ${processingDetails.finalColumnCount} columns, ${processingDetails.finalRecordCount} records\n`;
    
    if (columnsRemoved.length > 0) {
      summary += `Removed columns: ${columnsRemoved.join(', ')}\n`;
    }
    
    if (columnsAnonymized.length > 0) {
      summary += `Anonymized columns: ${columnsAnonymized.join(', ')}\n`;
    }
    
    return summary;
  }
}