import { describe, it, expect } from 'vitest';
import { SmartDefaultsService, DatasetSchema } from '../smart-defaults';

describe('SmartDefaultsService', () => {
    const mockSchema: DatasetSchema = {
        columns: [
            { name: 'date', type: 'date', uniqueCount: 100 },
            { name: 'value', type: 'number', uniqueCount: 100 },
            { name: 'category', type: 'string', uniqueCount: 5 }
        ],
        rowCount: 100
    };

    describe('recommendAnalysisTypes', () => {
        it('should recommend time series for date+number columns', () => {
            const recommendations = SmartDefaultsService.recommendAnalysisTypes(mockSchema);
            const timeSeries = recommendations.find(r => r.type === 'time_series');
            expect(timeSeries).toBeDefined();
            expect(timeSeries?.confidence).toBeGreaterThan(0.8);
        });

        it('should recommend distribution for numeric columns', () => {
            const recommendations = SmartDefaultsService.recommendAnalysisTypes(mockSchema);
            const distribution = recommendations.find(r => r.type === 'distribution');
            expect(distribution).toBeDefined();
        });

        it('should recommend categorical for low cardinality strings', () => {
            const recommendations = SmartDefaultsService.recommendAnalysisTypes(mockSchema);
            const categorical = recommendations.find(r => r.type === 'categorical');
            expect(categorical).toBeDefined();
        });
    });

    describe('getSmartDefaults', () => {
        it('should return parameters for time series', () => {
            const defaults = SmartDefaultsService.getSmartDefaults(mockSchema, 'time_series');
            expect(defaults.dateField).toBe('date');
            expect(defaults.valueField).toBe('value');
        });

        it('should return parameters for distribution', () => {
            const defaults = SmartDefaultsService.getSmartDefaults(mockSchema, 'distribution');
            expect(defaults.field).toBe('value');
        });

        it('should return parameters for categorical', () => {
             const defaults = SmartDefaultsService.getSmartDefaults(mockSchema, 'categorical');
             expect(defaults.field).toBe('category');
        });
    });
});
