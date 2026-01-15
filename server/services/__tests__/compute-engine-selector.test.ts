import { describe, it, expect } from 'vitest';
import { ComputeEngineSelector } from '../compute-engine-selector';

describe('ComputeEngineSelector', () => {
    describe('selectEngine', () => {
        it('should select local for small datasets (< 50k records)', () => {
            const result = ComputeEngineSelector.selectEngine({
                recordCount: 1000,
                analysisType: 'statistical_analysis',
                complexity: 'basic',
                availableResources: {
                    localMemoryMB: 4096,
                    sparkAvailable: true,
                    polarsAvailable: true
                }
            });

            expect(result.engine).toBe('local');
            expect(result.confidence).toBeGreaterThan(0.8);
            expect(result.reason).toContain('local processing');
        });

        it('should select Polars for medium datasets (50k - 1M records)', () => {
            const result = ComputeEngineSelector.selectEngine({
                recordCount: 100000,
                analysisType: 'statistical_analysis',
                complexity: 'basic',
                availableResources: {
                    localMemoryMB: 4096,
                    sparkAvailable: true,
                    polarsAvailable: true
                }
            });

            expect(result.engine).toBe('polars');
            expect(result.confidence).toBeGreaterThan(0.8);
            expect(result.reason).toContain('Polars');
        });

        it('should select Spark for large datasets (> 1M records)', () => {
            const result = ComputeEngineSelector.selectEngine({
                recordCount: 2000000,
                analysisType: 'statistical_analysis',
                complexity: 'basic',
                availableResources: {
                    localMemoryMB: 4096,
                    sparkAvailable: true,
                    polarsAvailable: true
                }
            });

            expect(result.engine).toBe('spark');
            expect(result.confidence).toBeGreaterThan(0.9);
            expect(result.reason).toContain('exceeds local processing capacity');
        });

        it('should select Spark for complex analysis on moderate data', () => {
            const result = ComputeEngineSelector.selectEngine({
                recordCount: 75000,
                analysisType: 'machine_learning',
                complexity: 'advanced',
                availableResources: {
                    localMemoryMB: 4096,
                    sparkAvailable: true,
                    polarsAvailable: true
                }
            });

            expect(result.engine).toBe('spark');
            expect(result.reason).toContain('Complex analysis');
        });

        it('should select Spark for large data volume (> 500MB)', () => {
            const result = ComputeEngineSelector.selectEngine({
                recordCount: 100000,
                analysisType: 'statistical_analysis',
                dataVolumeMB: 600,
                availableResources: {
                    localMemoryMB: 4096,
                    sparkAvailable: true,
                    polarsAvailable: true
                }
            });

            expect(result.engine).toBe('spark');
            expect(result.reason).toContain('volume');
        });

        it('should select Polars for moderate data volume (> 50MB)', () => {
            const result = ComputeEngineSelector.selectEngine({
                recordCount: 10000,
                analysisType: 'statistical_analysis',
                dataVolumeMB: 75,
                availableResources: {
                    localMemoryMB: 4096,
                    sparkAvailable: true,
                    polarsAvailable: true
                }
            });

            expect(result.engine).toBe('polars');
            expect(result.reason).toContain('volume');
        });

        it('should fallback to local when Spark is not available', () => {
            const result = ComputeEngineSelector.selectEngine({
                recordCount: 2000000,
                analysisType: 'statistical_analysis',
                availableResources: {
                    localMemoryMB: 4096,
                    sparkAvailable: false,
                    polarsAvailable: true
                }
            });

            // Should select Polars as next best option
            expect(result.engine).toBe('polars');
        });

        it('should fallback to local when Polars is not available', () => {
            const result = ComputeEngineSelector.selectEngine({
                recordCount: 75000,
                analysisType: 'statistical_analysis',
                availableResources: {
                    localMemoryMB: 4096,
                    sparkAvailable: false,
                    polarsAvailable: false
                }
            });

            expect(result.engine).toBe('local');
        });
    });

    describe('getEngineConfig', () => {
        it('should return Spark config for large datasets', () => {
            const config = ComputeEngineSelector.getEngineConfig('spark', {
                recordCount: 2000000,
                analysisType: 'statistical_analysis'
            });

            expect(config.executorMemory).toBe('4g');
            expect(config.driverMemory).toBe('2g');
            expect(config.partitions).toBeGreaterThan(1);
        });

        it('should return Spark config for moderate datasets', () => {
            const config = ComputeEngineSelector.getEngineConfig('spark', {
                recordCount: 500000,
                analysisType: 'statistical_analysis'
            });

            expect(config.executorMemory).toBe('2g');
            expect(config.driverMemory).toBe('1g');
        });

        it('should return Polars config with streaming for large data', () => {
            const config = ComputeEngineSelector.getEngineConfig('polars', {
                recordCount: 500000,
                analysisType: 'statistical_analysis',
                dataVolumeMB: 250
            });

            expect(config.streaming).toBe(true);
            expect(config.memoryLimit).toBeDefined();
        });

        it('should return Polars config without streaming for smaller data', () => {
            const config = ComputeEngineSelector.getEngineConfig('polars', {
                recordCount: 100000,
                analysisType: 'statistical_analysis',
                dataVolumeMB: 100
            });

            expect(config.streaming).toBe(false);
        });

        it('should return local config', () => {
            const config = ComputeEngineSelector.getEngineConfig('local', {
                recordCount: 10000,
                analysisType: 'statistical_analysis'
            });

            expect(config.maxOldSpaceSize).toBe(4096);
        });
    });
});
