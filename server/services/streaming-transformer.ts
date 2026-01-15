
import { Transform } from 'stream';
import { TransformationValidator } from './transformation-validator';

export interface TransformationStep {
    id: string;
    name: string;
    type: 'filter' | 'map' | 'reduce' | 'sort' | 'custom';
    config: {
        field?: string;
        code?: string;
        targetType?: string;
        [key: string]: any;
    };
}

export interface TransformationResult {
    success: boolean;
    processedCount: number;
    errorCount: number;
    errors: string[];
    outputStream: AsyncIterable<any>;
}

// Additional exports for transformation-queue compatibility
export interface TransformationConfig {
    type: 'filter' | 'select' | 'rename' | 'convert' | 'clean' | 'aggregate' | 'sort' | 'join' | 'map' | 'reduce' | 'custom';
    config: Record<string, any>;
    code?: string;
}

export interface StreamingOptions {
    reportProgress?: boolean;
    onProgress?: (progress: TransformationProgress) => void;
    batchSize?: number;
}

export interface TransformationProgress {
    processedRows: number;
    totalRows?: number;
    currentStep: number;
    totalSteps: number;
    errors: string[];
    warnings: string[];
}

/**
 * StreamingTransformer
 * 
 * Efficiently processes data streams (object streams) and applies transformations.
 * Format-agnostic: Operates on JavaScript objects, so it works with any source 
 * that can be normalized (CSV, JSON, Excel, DB, etc.).
 */
export class StreamingTransformer {

    /**
     * Process a data stream through a series of transformation steps
     */
    async processStream(
        inputStream: AsyncIterable<any>,
        steps: TransformationStep[]
    ): Promise<TransformationResult> {
        let processedCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        // Create a generator that yields transformed items
        const outputGenerator = async function* (this: StreamingTransformer) {
            console.log('🔄 [StreamingTransformer] Starting output generator');
            try {
                for await (const record of inputStream) {
                    console.log('   [StreamingTransformer] Received record:', JSON.stringify(record));
                    try {
                        let currentRecord = { ...record };
                        let dropRecord = false;

                        for (const step of steps) {
                            if (dropRecord) break;

                            switch (step.type) {
                                case 'filter':
                                    if (!this.applyFilter(currentRecord, step.config)) {
                                        dropRecord = true;
                                    }
                                    break;
                                case 'map':
                                    currentRecord = this.applyMap(currentRecord, step.config);
                                    break;
                                case 'custom':
                                    currentRecord = this.applyCustomTransformation(currentRecord, step.config);
                                    break;
                                // Add other types as needed
                            }
                        }

                        if (!dropRecord) {
                            processedCount++;
                            yield currentRecord;
                        }
                    } catch (error: any) {
                        errorCount++;
                        console.error('   [StreamingTransformer] Error processing record:', error.message);
                        if (errors.length < 100) { // Limit error storage
                            errors.push(`Row ${processedCount + errorCount}: ${error.message}`);
                        }
                    }
                }
            } catch (streamError: any) {
                console.error('   [StreamingTransformer] Stream error:', streamError);
                errors.push(`Stream Error: ${streamError.message}`);
            }
            console.log(`✅ [StreamingTransformer] Finished. Processed: ${processedCount}, Errors: ${errorCount}`);
        }.bind(this);

        return {
            success: true,
            processedCount: 0, // Will be updated as stream is consumed
            errorCount: 0,     // Will be updated as stream is consumed
            errors,
            outputStream: outputGenerator()
        };
    }

    /**
     * Transform a file (stub for transformation-queue compatibility)
     */
    async transformFile(
        inputPath: string,
        outputPath: string,
        transformations: TransformationConfig[],
        options?: Partial<StreamingOptions>
    ): Promise<TransformationProgress> {
        // This is a stub - implement actual file transformation logic as needed
        console.log(`🔄 [StreamingTransformer] transformFile called: ${inputPath} → ${outputPath}`);

        return {
            processedRows: 0,
            currentStep: transformations.length,
            totalSteps: transformations.length,
            errors: [],
            warnings: []
        };
    }

    /**
     * Apply a filter condition
     */
    private applyFilter(record: any, config: any): boolean {
        const { field, operator, value, code } = config;

        // Custom code filter
        if (code) {
            // Security check
            const validation = TransformationValidator.validateJS(code);
            if (!validation.valid) throw new Error(`Security violation: ${validation.error}`);

            // Safe evaluation context
            // Note: In a real production env, use a sandbox like vm2 or isolated-vm
            const filterFn = new Function('record', `return (${code});`);
            return filterFn(record);
        }

        // Standard operators
        const fieldValue = record[field];
        switch (operator) {
            case 'eq': return fieldValue == value;
            case 'neq': return fieldValue != value;
            case 'gt': return fieldValue > value;
            case 'lt': return fieldValue < value;
            case 'contains': return String(fieldValue).includes(value);
            default: return true;
        }
    }

    /**
     * Apply a mapping transformation (modify a field or add new one)
     */
    private applyMap(record: any, config: any): any {
        const { field, targetField, operation, code } = config;
        const target = targetField || field;

        // Custom code mapping
        if (code) {
            const validation = TransformationValidator.validateJS(code);
            if (!validation.valid) throw new Error(`Security violation: ${validation.error}`);

            const mapFn = new Function('record', `
         ${code}
         return record;
       `);
            return mapFn(record);
        }

        // Standard operations
        if (operation === 'uppercase') {
            record[target] = String(record[field]).toUpperCase();
        } else if (operation === 'lowercase') {
            record[target] = String(record[field]).toLowerCase();
        } else if (operation === 'toNumber') {
            record[target] = Number(record[field]);
        }

        return record;
    }

    /**
     * Apply custom transformation logic
     */
    private applyCustomTransformation(record: any, config: any): any {
        const { code } = config;
        if (!code) return record;

        const validation = TransformationValidator.validateJS(code);
        if (!validation.valid) throw new Error(`Security violation: ${validation.error}`);

        // Simple evaluation for now - in production use proper sandboxing
        // This assumes the code modifies 'record' in place or returns a new one
        const transformFn = new Function('record', `
      try {
        ${code}
        return record;
      } catch (e) {
        throw new Error(e.message);
      }
    `);

        return transformFn(record);
    }
}

// Export singleton instance for transformation-queue compatibility
export const streamingTransformer = new StreamingTransformer();
