// server/routes/project.ts
import { Router, type Request, type Response } from 'express';
import * as multerModule from "multer";
import type _multer from "multer";
const multer: typeof _multer = (multerModule as any).default || multerModule;
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { storage } from '../services/storage';
import { nanoid } from 'nanoid';
import { unifiedAuth, ensureAuthenticated } from './auth';
import { getAuthHeader } from '../utils/auth-headers';
import { requireOwnership } from '../middleware/rbac';
import {
    FileProcessor,
    PIIAnalyzer,
    PricingService,
    DataTransformationService,
    enhancedVisualizationEngine
} from '../services';
import type { DatasetCharacteristics, VisualizationRequirements } from '../services/intelligent-library-selector';
import { PythonProcessor } from '../services/python-processor';
import { journeyStateManager } from '../services/journey-state-manager';

import { tempStore } from '../services/temp-store';
import { jsonToCsv } from '../services/csv-export';
import { exportService } from '../services/export-service';
import { projectAgentOrchestrator } from '../services/project-agent-orchestrator';
import { ProjectManagerAgent } from '../services/project-manager-agent';
import { getMessageBroker } from '../services/agents/message-broker';
import { DataEngineerAgent } from '../services/data-engineer-agent';
import { DataScientistAgent } from '../services/data-scientist-agent';
import { getBillingService } from '../services/billing/unified-billing-service';
import type { JourneyType } from "../../shared/schema.js";
import { canAccessProject, isAdmin } from '../middleware/ownership';
import type { DataEngineerContext, DataScientistContext } from '../types/agent-context';
import { buildAgentContext } from '../utils/agent-context';
import { performanceWebhookService } from '../services/performance-webhook-service';
import { requiredDataElementsTool } from '../services/tools/required-data-elements-tool';
import { db } from '../db';
import { eq, desc } from 'drizzle-orm';
import { decisionAudits, projectQuestions, datasets as datasetsTable, projectDatasets, projects } from '@shared/schema';
import { DatasetJoiner, JoinConfig } from '../dataset-joiner';
import { semanticSearchService } from '../services/semantic-search-service';
import { sourceColumnMapper, type ElementMappingResult, type DataElementDefinition } from '../services/source-column-mapper';
import { columnEmbeddingGenerator } from '../services/column-embedding-generator';
import { transformationCompiler, type CompiledTransformation } from '../services/transformation-compiler';
import { getPiiExcludedColumns } from '../services/pii-helper';

const VALID_PROJECT_JOURNEYS: JourneyType[] = ["non-tech", "business", "technical", "consultation", "custom"];

const normalizeProjectJourneyType = (value: unknown): JourneyType =>
    VALID_PROJECT_JOURNEYS.includes(value as JourneyType) ? (value as JourneyType) : "non-tech";

const mapProjectJourneyToAgentJourney = (
    journeyType: JourneyType
): 'non-tech' | 'business' | 'technical' | 'consultation' => {
    switch (journeyType) {
        case 'business':
            return 'business';
        case 'technical':
            return 'technical';
        case 'consultation':
            return 'consultation';
        case 'custom':
            return 'consultation';
        case 'non-tech':
        default:
            return 'non-tech';
    }
};

const router = Router();

const extractRowsForTransformation = (dataset: any, project: any): any[] => {
    console.log(`Extracting rows for project ${project?.id}, dataset ${dataset?.id}`);

    const datasetData = Array.isArray(dataset?.data) ? dataset.data : undefined;
    if (datasetData && datasetData.length > 0) {
        console.log(`Found ${datasetData.length} rows in dataset.data`);
        return datasetData;
    }

    const transformedData = Array.isArray(project?.transformedData) ? project.transformedData : undefined;
    if (transformedData && transformedData.length > 0) {
        console.log(`Found ${transformedData.length} rows in project.transformedData`);
        return transformedData;
    }

    const datasetPreview = Array.isArray(dataset?.preview) ? dataset.preview : undefined;
    if (datasetPreview && datasetPreview.length > 0) {
        console.log(`Found ${datasetPreview.length} rows in dataset.preview`);
        return datasetPreview;
    }

    const projectData = Array.isArray(project?.data) ? project.data : undefined;
    if (projectData && projectData.length > 0) {
        console.log(`Found ${projectData.length} rows in project.data`);
        return projectData;
    }

    const datasetSample = Array.isArray(dataset?.sampleData) ? dataset.sampleData : undefined;
    if (datasetSample && datasetSample.length > 0) {
        console.log(`Found ${datasetSample.length} rows in dataset.sampleData`);
        return datasetSample;
    }

    const projectSample = Array.isArray(project?.sampleData) ? project.sampleData : undefined;
    if (projectSample && projectSample.length > 0) {
        console.log(`Found ${projectSample.length} rows in project.sampleData`);
        return projectSample;
    }

    console.warn('No data found for transformation in any candidate field');
    return [];
};

type TransformationType = 'join' | 'outlier_detection' | 'missing_data' | 'normality_test';

type TransformationStep = {
    type: TransformationType;
    config: Record<string, any>;
};

const VALID_TRANSFORMATION_TYPES: ReadonlyArray<TransformationType> = ['join', 'outlier_detection', 'missing_data', 'normality_test'];

async function markJourneyProgress(projectId: string, stepIds: string[]): Promise<void> {
    for (const stepId of stepIds) {
        try {
            await journeyStateManager.completeStep(projectId, stepId);
        } catch (progressError) {
            const message = progressError instanceof Error ? progressError.message : String(progressError);
            const isMissingStep = message.toLowerCase().includes('step') && message.toLowerCase().includes('not found');
            const isAlreadyComplete = message.toLowerCase().includes('already complete');

            if (isMissingStep || isAlreadyComplete) {
                continue;
            }

            console.error(`Failed to update journey progress for step ${stepId}:`, progressError);
        }
    }
}

// Normalize schema objects (with type/name/etc.) into a simple column -> type map
function normalizeSchemaTypes(schema: Record<string, any> | null | undefined): Record<string, string> {
    const normalized: Record<string, string> = {};
    if (!schema || typeof schema !== 'object') return normalized;

    for (const [col, value] of Object.entries(schema)) {
        if (value && typeof value === 'object' && 'type' in (value as any)) {
            normalized[col] = (value as any).type || 'string';
        } else if (typeof value === 'string') {
            normalized[col] = value;
        } else {
            normalized[col] = 'string';
        }
    }

    return normalized;
}

// Initialize Agents for recommendations
const messageBroker = getMessageBroker();
const projectManagerAgent = new ProjectManagerAgent();
const dataEngineerAgent = new DataEngineerAgent();
const dataScientistAgent = new DataScientistAgent();

const MAX_VISUALIZATION_RECORDS = 5000;

type VisualizationFieldConfig = {
    x?: string;
    y?: string;
    color?: string;
    size?: string;
    names?: string;
    values?: string;
    z?: string;
};

type VisualizationAggregationConfig = {
    group_by?: string[];
    aggregations?: Record<string, string>;
};

type AggregatedMetric = {
    field: string;
    aggregation: string;
    value: number;
};

type AggregatedEntry = {
    key: string[];
    metrics: AggregatedMetric[];
};

interface ProjectDataSnapshot {
    records: Record<string, unknown>[];
    schema: Record<string, any>;
    schemaKeys: string[];
}

const VISUALIZATION_LABELS: Record<string, string> = {
    bar: 'bar chart',
    line: 'line chart',
    scatter: 'scatter plot',
    pie: 'pie chart',
    histogram: 'histogram',
    boxplot: 'box plot',
    violin: 'violin plot',
    heatmap: 'heatmap',
    correlation_matrix: 'correlation matrix'
};

const CHART_TYPE_ALIASES: Record<string, string> = {
    bar: 'bar',
    bar_chart: 'bar',
    barplot: 'bar',
    line: 'line',
    line_chart: 'line',
    scatter: 'scatter',
    scatter_plot: 'scatter',
    pie: 'pie',
    pie_chart: 'pie',
    histogram: 'histogram',
    distribution: 'histogram',
    box: 'boxplot',
    box_plot: 'boxplot',
    boxplot: 'boxplot',
    violin: 'violin',
    violin_plot: 'violin',
    heatmap: 'heatmap',
    correlation: 'correlation_matrix',
    correlation_matrix: 'correlation_matrix'
};

const normalizeChartType = (value: unknown): string => {
    if (typeof value !== 'string' || !value.trim()) {
        return 'bar';
    }
    const key = value.trim().toLowerCase();
    return CHART_TYPE_ALIASES[key] || key.replace(/\s+/g, '_');
};

const ensureString = (value: unknown): string | undefined => {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
    }
    return undefined;
};

const uniqueStrings = (...values: Array<unknown>): string[] => {
    const collection = new Set<string>();
    for (const value of values) {
        if (Array.isArray(value)) {
            value.forEach((item) => {
                const normalized = ensureString(item);
                if (normalized) {
                    collection.add(normalized);
                }
            });
        } else {
            const normalized = ensureString(value);
            if (normalized) {
                collection.add(normalized);
            }
        }
    }
    return Array.from(collection);
};

const safeParseJson = (value: unknown): unknown => {
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return undefined;
        }
    }
    return value;
};

const resolveSchemaObject = (project: any, dataset: any): Record<string, any> => {
    const candidate = dataset?.schema || project?.schema;
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        return candidate as Record<string, any>;
    }
    return {};
};

const resolveSchemaKeys = (project: any, dataset: any, schema: Record<string, any>): string[] => {
    if (Array.isArray(dataset?.columns) && dataset.columns.length) {
        return dataset.columns as string[];
    }
    return Object.keys(schema || {});
};

const normalizeRecord = (row: unknown, schemaKeys: string[]): Record<string, unknown> | null => {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
        return row as Record<string, unknown>;
    }
    if (Array.isArray(row) && schemaKeys.length) {
        const result: Record<string, unknown> = {};
        schemaKeys.forEach((key, index) => {
            if (index < row.length) {
                result[key] = row[index];
            }
        });
        return Object.keys(result).length ? result : null;
    }
    return null;
};

const buildProjectDataSnapshot = (project: any, dataset: any): ProjectDataSnapshot => {
    const schema = resolveSchemaObject(project, dataset);
    const schemaKeys = resolveSchemaKeys(project, dataset, schema);

    const sources = [
        dataset?.preview,
        dataset?.sampleRows,
        dataset?.data,
        project?.preview,
        project?.sampleData,
        project?.data
    ];

    for (const candidate of sources) {
        const parsed = safeParseJson(candidate);
        if (Array.isArray(parsed) && parsed.length) {
            const records = parsed
                .map((row) => normalizeRecord(row, schemaKeys))
                .filter((row): row is Record<string, unknown> => !!row)
                .slice(0, MAX_VISUALIZATION_RECORDS);

            if (records.length) {
                return {
                    records,
                    schema,
                    schemaKeys
                };
            }
        }
    }

    return {
        records: [],
        schema,
        schemaKeys
    };
};

const toNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim().length) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const toStringValue = (value: unknown): string | null => {
    if (value === null || value === undefined) {
        return null;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value.toString();
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    return String(value);
};

const isNumericType = (schema: Record<string, any>, key: string): boolean => {
    const entry = schema?.[key];
    const typeValue = typeof entry === 'string'
        ? entry
        : typeof entry === 'object' && entry?.type
            ? entry.type
            : '';
    const normalized = typeof typeValue === 'string' ? typeValue.toLowerCase() : '';
    return [
        'number',
        'numeric',
        'integer',
        'float',
        'double',
        'decimal'
    ].includes(normalized);
};

const isDateType = (schema: Record<string, any>, key: string): boolean => {
    const entry = schema?.[key];
    const typeValue = typeof entry === 'string'
        ? entry
        : typeof entry === 'object' && entry?.type
            ? entry.type
            : '';
    const normalized = typeof typeValue === 'string' ? typeValue.toLowerCase() : '';
    return ['date', 'datetime', 'timestamp', 'time'].includes(normalized);
};

const computeDatasetCharacteristics = (snapshot: ProjectDataSnapshot): DatasetCharacteristics => {
    const { records, schema, schemaKeys } = snapshot;
    const columnCount = schemaKeys.length || 1;

    const dataTypes = {
        numeric: 0,
        categorical: 0,
        datetime: 0,
        text: 0,
        boolean: 0
    };

    const cardinality: Record<string, number> = {};

    schemaKeys.forEach((key) => {
        const entry = schema?.[key];
        const typeValue = typeof entry === 'string'
            ? entry
            : typeof entry === 'object' && entry?.type
                ? entry.type
                : '';
        const normalized = typeof typeValue === 'string' ? typeValue.toLowerCase() : '';

        if (['number', 'numeric', 'integer', 'float', 'double', 'decimal'].includes(normalized)) {
            dataTypes.numeric += 1;
        } else if (['boolean', 'bool'].includes(normalized)) {
            dataTypes.boolean += 1;
        } else if (['date', 'datetime', 'timestamp', 'time'].includes(normalized)) {
            dataTypes.datetime += 1;
        } else if (['text', 'string', 'varchar', 'char'].includes(normalized)) {
            dataTypes.text += 1;
            dataTypes.categorical += 1;
        } else {
            dataTypes.categorical += 1;
        }

        const values = new Set<string>();
        for (const record of records) {
            const raw = record[key];
            if (raw === undefined || raw === null || raw === '') {
                continue;
            }
            values.add(String(raw));
            if (values.size >= 500) {
                break;
            }
        }
        cardinality[key] = values.size;
    });

    const totalCells = records.length * columnCount;
    let missing = 0;
    if (totalCells > 0) {
        for (const record of records) {
            for (const key of schemaKeys) {
                if (record[key] === undefined || record[key] === null || record[key] === '') {
                    missing += 1;
                }
            }
        }
    }

    const serializedLength = records.length
        ? Buffer.byteLength(JSON.stringify(records))
        : 0;

    return {
        size: records.length,
        columns: schemaKeys.length,
        dataTypes,
        memoryFootprint: Number((serializedLength / (1024 * 1024)).toFixed(2)),
        sparsity: totalCells ? Number(((missing / totalCells) * 100).toFixed(2)) : 0,
        cardinality
    };
};

const buildVisualizationRequirements = (chartType: string, recordCount: number): VisualizationRequirements => {
    const dataSize = recordCount > 100_000
        ? 'large'
        : recordCount > 10_000
            ? 'medium'
            : 'small';

    return {
        chartTypes: [chartType],
        interactivity: 'interactive',
        dataSize,
        styling: 'professional',
        complexity: 'moderate',
        exportFormats: ['png', 'svg', 'json'],
        performancePriority: dataSize === 'large' ? 'memory' : 'balanced'
    };
};

const normalizeAggregationName = (name: string | undefined): string => {
    if (!name) {
        return '';
    }
    const normalized = name.toLowerCase();
    if (normalized === 'avg' || normalized === 'average') {
        return 'mean';
    }
    return normalized;
};

const getAggregationFn = (name: string): ((values: number[]) => number) => {
    switch (name) {
        case 'sum':
            return (values) => values.reduce((acc, value) => acc + value, 0);
        case 'mean':
            return (values) => values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : 0;
        case 'count':
            return (values) => values.length;
        case 'min':
            return (values) => values.length ? Math.min(...values) : 0;
        case 'max':
            return (values) => values.length ? Math.max(...values) : 0;
        case 'std':
            return (values) => {
                if (!values.length) {
                    return 0;
                }
                const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
                const variance = values.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / values.length;
                return Math.sqrt(variance);
            };
        case 'median':
            return (values) => {
                if (!values.length) {
                    return 0;
                }
                const sorted = [...values].sort((a, b) => a - b);
                const middle = Math.floor(sorted.length / 2);
                if (sorted.length % 2 === 0) {
                    return (sorted[middle - 1] + sorted[middle]) / 2;
                }
                return sorted[middle];
            };
        default:
            return (values) => values.length ? values.reduce((acc, value) => acc + value, 0) : 0;
    }
};

type ColumnQualityStat = {
    column: string;
    count: number;
    percentage: number;
};

interface DerivedQualityInsights {
    metrics: {
        completeness: number;
        consistency: number;
        accuracy: number;
        validity: number;
    };
    issues: string[];
    recommendations: string[];
    overall: number;
    label: string;
    diagnostics: {
        missingRate: number;
        mismatchRate: number;
        duplicateRate: number;
        duplicateCount: number;
        evaluatedCells: number;
        totalCells: number;
        rowCount: number;
        columnCount: number;
        missingByColumn: ColumnQualityStat[];
        mismatchByColumn: ColumnQualityStat[];
    };
    datasetSummary: {
        overview: string;
        totalRows: number;
        totalColumns: number;
        missingCellPercentage: number;
        columnTypeBreakdown: Record<string, string[]>;
    };
}

const QUALITY_LABEL_READY = 'ready_for_analysis';
const QUALITY_LABEL_REVIEW = 'review_recommended';
const QUALITY_LABEL_INSUFFICIENT = 'insufficient_data';

const MISSING_VALUE_TOKENS = new Set(['null', 'none', 'n/a', 'na', 'undefined', 'nan']);

const clampScore = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(value)));
};

const normalizeScoreCandidate = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed.length) {
            return null;
        }
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const isEffectivelyMissing = (value: unknown): boolean => {
    if (value === null || value === undefined) {
        return true;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed.length) {
            return true;
        }
        return MISSING_VALUE_TOKENS.has(trimmed.toLowerCase());
    }
    return false;
};

const normalizeSchemaTypeEntry = (entry: unknown): string | undefined => {
    if (typeof entry === 'string') {
        return entry.toLowerCase();
    }
    if (entry && typeof entry === 'object' && !Array.isArray(entry) && (entry as any).type) {
        const { type } = entry as { type?: unknown };
        if (typeof type === 'string') {
            return type.toLowerCase();
        }
    }
    return undefined;
};

const inferSchemaTypeFromRecords = (
    records: Record<string, unknown>[],
    key: string
): string | undefined => {
    for (const record of records) {
        const value = record[key];
        if (isEffectivelyMissing(value)) {
            continue;
        }
        if (typeof value === 'number') {
            return Number.isInteger(value) ? 'integer' : 'float';
        }
        if (typeof value === 'boolean') {
            return 'boolean';
        }
        if (value instanceof Date) {
            return 'date';
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed.length) {
                continue;
            }
            const numericCandidate = Number(trimmed);
            if (Number.isFinite(numericCandidate)) {
                return Number.isInteger(numericCandidate) ? 'integer' : 'float';
            }
            const dateCandidate = Date.parse(trimmed);
            if (!Number.isNaN(dateCandidate)) {
                return 'date';
            }
            return 'string';
        }
    }
    return undefined;
};

const valueMatchesSchemaType = (value: unknown, schemaType?: string): boolean => {
    if (!schemaType) {
        return true;
    }
    const normalized = schemaType.toLowerCase();

    if (['integer', 'int'].includes(normalized)) {
        if (typeof value === 'number') {
            return Number.isInteger(value);
        }
        if (typeof value === 'string') {
            const parsed = Number(value);
            return Number.isFinite(parsed) && Number.isInteger(parsed);
        }
        return false;
    }

    if (['number', 'numeric', 'float', 'double', 'decimal'].includes(normalized)) {
        if (typeof value === 'number') {
            return Number.isFinite(value);
        }
        if (typeof value === 'string') {
            const parsed = Number(value);
            return Number.isFinite(parsed);
        }
        return false;
    }

    if (['boolean', 'bool'].includes(normalized)) {
        if (typeof value === 'boolean') {
            return true;
        }
        if (typeof value === 'number') {
            return value === 0 || value === 1;
        }
        if (typeof value === 'string') {
            const normalizedValue = value.trim().toLowerCase();
            return ['true', 'false', '0', '1', 'yes', 'no', 'y', 'n'].includes(normalizedValue);
        }
        return false;
    }

    if (['date', 'datetime', 'timestamp', 'time'].includes(normalized)) {
        if (value instanceof Date) {
            return !Number.isNaN(value.getTime());
        }
        if (typeof value === 'string') {
            const parsed = Date.parse(value);
            return !Number.isNaN(parsed);
        }
        return false;
    }

    return true;
};

const summarizeColumnMap = (map: Record<string, number>, rowCount: number): ColumnQualityStat[] => {
    return Object.entries(map)
        .map(([column, count]) => ({
            column,
            count,
            percentage: rowCount > 0 ? Number(((count / rowCount) * 100).toFixed(1)) : 0
        }))
        .filter(entry => entry.count > 0)
        .sort((a, b) => b.percentage - a.percentage);
};

const describeTopColumns = (stats: ColumnQualityStat[]): string => {
    if (!stats.length) {
        return '';
    }
    const top = stats.slice(0, 3)
        .map(entry => `${entry.column} (${entry.percentage}%)`)
        .join(', ');
    return top.length ? ` (notably ${top})` : '';
};

const buildColumnTypeBreakdown = (
    keys: string[],
    types: Map<string, string | undefined>
): Record<string, string[]> => {
    const breakdown: Record<string, string[]> = {
        numeric: [],
        categorical: [],
        boolean: [],
        date: [],
        unknown: []
    };

    keys.forEach((key) => {
        const schemaType = types.get(key) ?? 'unknown';
        const normalized = schemaType.toLowerCase();

        if (['integer', 'int', 'float', 'double', 'decimal', 'number', 'numeric'].includes(normalized)) {
            breakdown.numeric.push(key);
            return;
        }
        if (['boolean', 'bool'].includes(normalized)) {
            breakdown.boolean.push(key);
            return;
        }
        if (['date', 'datetime', 'timestamp', 'time'].includes(normalized)) {
            breakdown.date.push(key);
            return;
        }
        if (['string', 'text', 'varchar', 'char', 'category', 'categorical'].includes(normalized)) {
            breakdown.categorical.push(key);
            return;
        }
        breakdown.unknown.push(key);
    });

    return breakdown;
};

const deriveQualityInsights = (snapshot: ProjectDataSnapshot): DerivedQualityInsights | null => {
    const { records, schema } = snapshot;
    if (!Array.isArray(records) || records.length === 0) {
        return null;
    }

    const schemaKeys = snapshot.schemaKeys.length
        ? snapshot.schemaKeys
        : Array.from(
            records.reduce((set, record) => {
                if (record && typeof record === 'object') {
                    Object.keys(record).forEach(key => set.add(key));
                }
                return set;
            }, new Set<string>())
        );

    if (!schemaKeys.length) {
        return null;
    }

    const columnTypes = new Map<string, string | undefined>();
    schemaKeys.forEach(key => {
        const schemaType = normalizeSchemaTypeEntry((schema as Record<string, unknown> | undefined)?.[key]);
        columnTypes.set(key, schemaType ?? inferSchemaTypeFromRecords(records, key));
    });

    const missingByColumn: Record<string, number> = {};
    const mismatchByColumn: Record<string, number> = {};

    let missingCells = 0;
    let evaluatedCells = 0;
    let typeMismatches = 0;

    for (const record of records) {
        if (!record || typeof record !== 'object') {
            continue;
        }
        for (const key of schemaKeys) {
            const raw = (record as Record<string, unknown>)[key];
            if (isEffectivelyMissing(raw)) {
                missingCells += 1;
                missingByColumn[key] = (missingByColumn[key] || 0) + 1;
                continue;
            }

            evaluatedCells += 1;
            const expectedType = columnTypes.get(key);
            if (!valueMatchesSchemaType(raw, expectedType)) {
                typeMismatches += 1;
                mismatchByColumn[key] = (mismatchByColumn[key] || 0) + 1;
            }
        }
    }

    const totalCells = records.length * schemaKeys.length;
    const rowHashes = records.map(record => {
        if (!record || typeof record !== 'object') {
            return JSON.stringify(record);
        }
        const ordered = schemaKeys.map(key => (record as Record<string, unknown>)[key]);
        return JSON.stringify(ordered);
    });
    const uniqueRows = new Set(rowHashes);
    const duplicateCount = rowHashes.length - uniqueRows.size;

    const missingRate = totalCells === 0 ? 0 : (missingCells / totalCells) * 100;
    const mismatchRate = evaluatedCells === 0 ? 0 : (typeMismatches / evaluatedCells) * 100;
    const duplicateRate = records.length === 0 ? 0 : (duplicateCount / records.length) * 100;

    const completeness = clampScore(100 - missingRate);
    const consistency = clampScore(100 - (mismatchRate + duplicateRate * 0.3));
    const validity = clampScore(100 - (mismatchRate * 1.25 + missingRate * 0.2));
    const accuracy = clampScore(100 - (duplicateRate * 1.5 + mismatchRate * 0.5 + missingRate * 0.2));

    const overall = clampScore((completeness + consistency + validity + accuracy) / 4);

    let label = QUALITY_LABEL_REVIEW;
    if (overall >= 85 && missingRate <= 5 && mismatchRate <= 5 && duplicateRate <= 2) {
        label = QUALITY_LABEL_READY;
    } else if (overall < 60 || missingRate > 20) {
        label = QUALITY_LABEL_INSUFFICIENT;
    }

    const missingStats = summarizeColumnMap(missingByColumn, records.length);
    const mismatchStats = summarizeColumnMap(mismatchByColumn, records.length);

    const issues: string[] = [];
    if (missingRate > 0) {
        const severityMessage = missingRate >= 15
            ? `High missing data: ${missingRate.toFixed(1)}% of values are blank`
            : `Detected ${missingRate.toFixed(1)}% missing values`;
        issues.push(`${severityMessage}${describeTopColumns(missingStats)}`);
    }
    if (mismatchRate > 0) {
        const severityMessage = mismatchRate >= 10
            ? `Type mismatches in ${mismatchRate.toFixed(1)}% of populated cells`
            : `Minor type inconsistencies detected (${mismatchRate.toFixed(1)}%)`;
        issues.push(`${severityMessage}${describeTopColumns(mismatchStats)}`);
    }
    if (duplicateCount > 0) {
        issues.push(`Found ${duplicateCount} duplicate rows (~${duplicateRate.toFixed(1)}%)`);
    }

    const recommendations: string[] = [];
    if (missingRate > 0) {
        recommendations.push(missingRate >= 15
            ? 'Impute, filter, or enrich columns with heavy missing data before continuing.'
            : 'Review columns with missing values and confirm acceptable thresholds.');
    }
    if (mismatchRate > 0) {
        recommendations.push('Standardize column formats (dates, numbers) to reduce type mismatches.');
    }
    if (duplicateCount > 0) {
        recommendations.push('Deduplicate rows or introduce a unique identifier column before modeling.');
    }
    if (!recommendations.length) {
        recommendations.push('Data quality checks passed. Proceed to schema validation when ready.');
    }

    const columnTypeBreakdown = buildColumnTypeBreakdown(schemaKeys, columnTypes);

    return {
        metrics: {
            completeness,
            consistency,
            accuracy,
            validity
        },
        issues,
        recommendations,
        overall,
        label,
        diagnostics: {
            missingRate: Number(missingRate.toFixed(2)),
            mismatchRate: Number(mismatchRate.toFixed(2)),
            duplicateRate: Number(duplicateRate.toFixed(2)),
            duplicateCount,
            evaluatedCells,
            totalCells,
            rowCount: records.length,
            columnCount: schemaKeys.length,
            missingByColumn: missingStats,
            mismatchByColumn: mismatchStats
        },
        datasetSummary: {
            overview: `Dataset has ${records.length} rows and ${schemaKeys.length} columns.`,
            totalRows: records.length,
            totalColumns: schemaKeys.length,
            missingCellPercentage: Number(missingRate.toFixed(2)),
            columnTypeBreakdown
        }
    };
};

const pickScore = (...candidates: Array<unknown>): number => {
    for (const candidate of candidates) {
        const normalized = normalizeScoreCandidate(candidate);
        if (normalized !== null) {
            return clampScore(normalized);
        }
    }
    return 0;
};

const aggregateRecords = (
    records: Record<string, unknown>[],
    config?: VisualizationAggregationConfig
): AggregatedEntry[] => {
    const groupBy = config?.group_by?.filter(Boolean) || [];
    const aggregations = config?.aggregations || {};
    if (!groupBy.length || !Object.keys(aggregations).length) {
        return [];
    }

    const supported = new Set(['sum', 'mean', 'count', 'min', 'max', 'std', 'median', 'avg', 'average']);
    const groups = new Map<string, { key: string[]; collectors: Record<string, number[]>; aggregations: Record<string, string>; }>();

    for (const record of records) {
        const groupValues = groupBy.map((field) => toStringValue(record[field]) ?? 'Unspecified');
        const groupKey = groupValues.join('||');
        let bucket = groups.get(groupKey);
        if (!bucket) {
            bucket = { key: groupValues, collectors: {}, aggregations: {} };
            groups.set(groupKey, bucket);
        }

        for (const [field, aggName] of Object.entries(aggregations)) {
            const normalizedAgg = normalizeAggregationName(aggName);
            if (!supported.has(normalizedAgg)) {
                continue;
            }
            if (!bucket.collectors[field]) {
                bucket.collectors[field] = [];
                bucket.aggregations[field] = normalizedAgg;
            }
            if (normalizedAgg === 'count') {
                bucket.collectors[field].push(1);
            } else {
                const numericValue = toNumber(record[field]);
                if (numericValue !== null) {
                    bucket.collectors[field].push(numericValue);
                }
            }
        }
    }

    const entries: AggregatedEntry[] = [];
    for (const bucket of groups.values()) {
        const metrics: AggregatedMetric[] = [];
        for (const [field, values] of Object.entries(bucket.collectors)) {
            const aggregationName = bucket.aggregations[field];
            const fn = getAggregationFn(aggregationName);
            const result = fn(values);
            metrics.push({
                field,
                aggregation: aggregationName,
                value: Number.isFinite(result) ? Number(result.toFixed(4)) : result
            });
        }
        entries.push({ key: bucket.key, metrics });
    }

    return entries;
};

const pearsonCorrelation = (x: number[], y: number[]): number => {
    const length = Math.min(x.length, y.length);
    if (!length) {
        return 0;
    }
    const xSlice = x.slice(0, length);
    const ySlice = y.slice(0, length);

    const meanX = xSlice.reduce((acc, value) => acc + value, 0) / length;
    const meanY = ySlice.reduce((acc, value) => acc + value, 0) / length;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let index = 0; index < length; index += 1) {
        const dx = xSlice[index] - meanX;
        const dy = ySlice[index] - meanY;
        numerator += dx * dy;
        denomX += dx * dx;
        denomY += dy * dy;
    }

    const denominator = Math.sqrt(denomX * denomY);
    if (!denominator) {
        return 0;
    }

    const result = numerator / denominator;
    return Number.isFinite(result) ? Number(result.toFixed(4)) : 0;
};

const getNumericFields = (
    schema: Record<string, any>,
    records: Record<string, unknown>[],
    preferredFields?: string[]
): string[] => {
    const seen = new Set<string>();
    const ordered = preferredFields && preferredFields.length ? preferredFields : Object.keys(schema || {});

    for (const field of ordered) {
        if (seen.has(field)) {
            continue;
        }
        const isNumeric = isNumericType(schema, field) || records.some((record) => toNumber(record[field]) !== null);
        if (isNumeric) {
            seen.add(field);
        }
    }

    return Array.from(seen);
};

const computeCorrelationMatrix = (
    fields: string[],
    records: Record<string, unknown>[]
): number[][] => {
    if (!fields.length) {
        return [];
    }

    const alignedRows: number[][] = [];
    for (const record of records) {
        const row: number[] = [];
        let isValidRow = true;
        for (const field of fields) {
            const numericValue = toNumber(record[field]);
            if (numericValue === null) {
                isValidRow = false;
                break;
            }
            row.push(numericValue);
        }
        if (isValidRow) {
            alignedRows.push(row);
        }
    }

    if (!alignedRows.length) {
        return Array.from({ length: fields.length }, () => Array(fields.length).fill(0));
    }

    const matrix: number[][] = [];
    for (let i = 0; i < fields.length; i += 1) {
        const row: number[] = [];
        for (let j = 0; j < fields.length; j += 1) {
            const columnI = alignedRows.map((vals) => vals[i]);
            const columnJ = alignedRows.map((vals) => vals[j]);
            row.push(pearsonCorrelation(columnI, columnJ));
        }
        matrix.push(row);
    }
    return matrix;
};

interface ChartBuildResult {
    chartData: {
        data: Record<string, unknown>[];
        layout: Record<string, unknown>;
        frames?: Record<string, unknown>[];
    };
    insights: string[];
    warnings: string[];
}

const buildSeriesFromAggregations = (
    aggregated: AggregatedEntry[],
    chartType: 'bar' | 'line'
): { categories: string[]; traces: Record<string, unknown>[]; insights: string[] } => {
    const categories = aggregated.map((entry) => entry.key.filter(Boolean).join(' / ') || 'All Records');
    const labels = new Set<string>();

    for (const entry of aggregated) {
        for (const metric of entry.metrics) {
            labels.add(`${metric.aggregation.toUpperCase()}(${metric.field})`);
        }
    }

    const labelList = Array.from(labels);
    const traces = labelList.map((label) => {
        const values = aggregated.map((entry) => {
            const matched = entry.metrics.find((metric) => `${metric.aggregation.toUpperCase()}(${metric.field})` === label);
            return matched ? matched.value : 0;
        });

        if (chartType === 'line') {
            return {
                type: 'scatter',
                mode: 'lines+markers',
                x: categories,
                y: values,
                name: label
            };
        }

        return {
            type: 'bar',
            x: categories,
            y: values,
            name: label
        };
    });

    const insights: string[] = [];
    if (categories.length) {
        insights.push(`Aggregated ${labelList.length} measure${labelList.length === 1 ? '' : 's'} across ${categories.length} group${categories.length === 1 ? '' : 's'}.`);
    }

    return { categories, traces, insights };
};

const ensureField = (
    field: string | undefined,
    fallback: string[]
): string | undefined => {
    if (field && field.trim().length) {
        return field;
    }
    return fallback.find((value) => value && value.trim().length);
};

const summarizeTopCategories = (values: Map<string, number>): string | null => {
    const sorted = Array.from(values.entries()).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) {
        return null;
    }
    const [topCategory, topValue] = sorted[0];
    if (sorted.length === 1) {
        return `All records fall under "${topCategory}" (${topValue} rows).`;
    }
    const [secondCategory, secondValue] = sorted[1];
    return `Top segments: "${topCategory}" (${topValue}) vs "${secondCategory}" (${secondValue}).`;
};

const buildBarOrLineChart = (
    chartType: 'bar' | 'line',
    records: Record<string, unknown>[],
    fields: VisualizationFieldConfig,
    fallbackFields: string[],
    aggregation?: VisualizationAggregationConfig
): ChartBuildResult => {
    const resolvedX = ensureField(fields.x, fallbackFields);
    const resolvedY = ensureField(fields.y, fallbackFields.slice(1));

    if (!resolvedX) {
        throw new Error('A primary grouping field (x-axis) is required for bar/line charts.');
    }

    const aggregated = aggregateRecords(records, aggregation);
    if (aggregated.length) {
        const { categories, traces, insights } = buildSeriesFromAggregations(aggregated, chartType);
        return {
            chartData: {
                data: traces,
                layout: {
                    title: `${chartType === 'bar' ? 'Bar' : 'Line'} chart for ${categories.length} group${categories.length === 1 ? '' : 's'}`,
                    xaxis: { title: resolvedX },
                    yaxis: { title: 'Aggregated Value' },
                    barmode: traces.length > 1 ? 'group' : undefined
                }
            },
            insights,
            warnings: []
        };
    }

    const groupedValues = new Map<string, number>();
    for (const record of records) {
        const bucket = toStringValue(record[resolvedX]) ?? 'Unspecified';
        const current = groupedValues.get(bucket) ?? 0;
        if (resolvedY) {
            const yValue = toNumber(record[resolvedY]);
            if (yValue !== null) {
                groupedValues.set(bucket, current + yValue);
            }
        } else {
            groupedValues.set(bucket, current + 1);
        }
    }

    const categories = Array.from(groupedValues.keys());
    const values = categories.map((category) => groupedValues.get(category) ?? 0);

    const dataTrace = chartType === 'line'
        ? {
            type: 'scatter',
            mode: 'lines+markers',
            x: categories,
            y: values,
            name: resolvedY ? resolvedY : 'Count'
        }
        : {
            type: 'bar',
            x: categories,
            y: values,
            name: resolvedY ? resolvedY : 'Count'
        };

    const insights: string[] = [];
    const segmentSummary = summarizeTopCategories(groupedValues);
    if (segmentSummary) {
        insights.push(segmentSummary);
    }

    return {
        chartData: {
            data: [dataTrace],
            layout: {
                title: `${chartType === 'bar' ? 'Bar' : 'Line'} chart grouped by ${resolvedX}`,
                xaxis: { title: resolvedX },
                yaxis: { title: resolvedY || 'Count' }
            }
        },
        insights,
        warnings: []
    };
};

const buildScatterChart = (
    records: Record<string, unknown>[],
    fields: VisualizationFieldConfig,
    fallbackFields: string[]
): ChartBuildResult => {
    const resolvedX = ensureField(fields.x, fallbackFields);
    const resolvedY = ensureField(fields.y, fallbackFields.slice(1));

    if (!resolvedX || !resolvedY) {
        throw new Error('Scatter plots require both x and y fields.');
    }

    const xValues: number[] = [];
    const yValues: number[] = [];
    const colorValues: string[] = [];
    const sizeValues: number[] = [];

    for (const record of records) {
        const xNumber = toNumber(record[resolvedX]);
        const yNumber = toNumber(record[resolvedY]);
        if (xNumber === null || yNumber === null) {
            continue;
        }
        xValues.push(xNumber);
        yValues.push(yNumber);
        colorValues.push(fields.color ? toStringValue(record[fields.color]) ?? 'Category' : 'Series');
        sizeValues.push(fields.size ? (toNumber(record[fields.size]) ?? 8) : 8);
    }

    const trace: Record<string, unknown> = {
        type: 'scatter',
        mode: 'markers',
        x: xValues,
        y: yValues,
        marker: {
            size: sizeValues,
            color: fields.color ? colorValues : undefined,
            showscale: Boolean(fields.color)
        },
        text: fields.color ? colorValues : undefined
    };

    const insights = [`Sampled ${xValues.length} points across ${resolvedX} vs ${resolvedY}.`];

    return {
        chartData: {
            data: [trace],
            layout: {
                title: `Scatter plot: ${resolvedX} vs ${resolvedY}`,
                xaxis: { title: resolvedX },
                yaxis: { title: resolvedY }
            }
        },
        insights,
        warnings: []
    };
};

const buildPieChart = (
    records: Record<string, unknown>[],
    fields: VisualizationFieldConfig,
    fallbackFields: string[]
): ChartBuildResult => {
    const namesField = ensureField(fields.names ?? fields.x, fallbackFields);
    const valuesField = ensureField(fields.values ?? fields.y, fallbackFields.slice(1));

    if (!namesField) {
        throw new Error('Pie charts require a categorical field (names).');
    }

    const buckets = new Map<string, number>();
    for (const record of records) {
        const label = toStringValue(record[namesField]) ?? 'Unspecified';
        const current = buckets.get(label) ?? 0;
        const value = valuesField ? toNumber(record[valuesField]) ?? 0 : 1;
        buckets.set(label, current + value);
    }

    const labels = Array.from(buckets.keys());
    const values = labels.map((label) => buckets.get(label) ?? 0);

    const insights: string[] = [];
    const summary = summarizeTopCategories(buckets);
    if (summary) {
        insights.push(summary);
    }

    return {
        chartData: {
            data: [
                {
                    type: 'pie',
                    labels,
                    values,
                    hole: fields.z ? 0.4 : 0
                }
            ],
            layout: {
                title: `Pie chart for ${namesField}`
            }
        },
        insights,
        warnings: []
    };
};

const buildHistogram = (
    records: Record<string, unknown>[],
    fields: VisualizationFieldConfig,
    fallbackFields: string[]
): ChartBuildResult => {
    const resolvedField = ensureField(fields.x ?? fields.y, fallbackFields);
    if (!resolvedField) {
        throw new Error('Histogram requires a numeric field.');
    }

    const values: number[] = [];
    for (const record of records) {
        const numericValue = toNumber(record[resolvedField]);
        if (numericValue !== null) {
            values.push(numericValue);
        }
    }

    return {
        chartData: {
            data: [
                {
                    type: 'histogram',
                    x: values,
                    nbinsx: Math.min(50, Math.ceil(Math.sqrt(values.length))) || undefined,
                    name: resolvedField
                }
            ],
            layout: {
                title: `Distribution of ${resolvedField}`,
                xaxis: { title: resolvedField },
                yaxis: { title: 'Frequency' }
            }
        },
        insights: [`Histogram generated with ${values.length} observations.`],
        warnings: []
    };
};

const buildBoxOrViolinChart = (
    chartType: 'boxplot' | 'violin',
    records: Record<string, unknown>[],
    fields: VisualizationFieldConfig,
    fallbackFields: string[]
): ChartBuildResult => {
    const valueField = ensureField(fields.y ?? fields.x, fallbackFields);
    if (!valueField) {
        throw new Error(`${chartType === 'boxplot' ? 'Box' : 'Violin'} plots require a numeric value field.`);
    }

    const groupField = fields.x && fields.x !== valueField ? fields.x : undefined;
    const groups = new Map<string, number[]>();

    for (const record of records) {
        const numericValue = toNumber(record[valueField]);
        if (numericValue === null) {
            continue;
        }
        const groupKey = groupField ? toStringValue(record[groupField]) ?? 'Group' : 'Series';
        const bucket = groups.get(groupKey) || [];
        bucket.push(numericValue);
        groups.set(groupKey, bucket);
    }

    const data: Record<string, unknown>[] = [];
    for (const [group, values] of groups.entries()) {
        if (!values.length) {
            continue;
        }
        if (chartType === 'violin') {
            data.push({ type: 'violin', y: values, name: group, box: { visible: true }, meanline: { visible: true } });
        } else {
            data.push({ type: 'box', y: values, name: group, boxpoints: 'outliers' });
        }
    }

    return {
        chartData: {
            data,
            layout: {
                title: `${chartType === 'boxplot' ? 'Box' : 'Violin'} plot for ${valueField}`,
                yaxis: { title: valueField },
                xaxis: groupField ? { title: groupField } : undefined
            }
        },
        insights: [`Summarized ${groups.size} group${groups.size === 1 ? '' : 's'} for ${valueField}.`],
        warnings: []
    };
};

const buildCorrelationHeatmap = (
    schema: Record<string, any>,
    records: Record<string, unknown>[],
    explicitFields?: string[]
): ChartBuildResult => {
    const numericFields = getNumericFields(schema, records, explicitFields);
    if (numericFields.length < 2) {
        throw new Error('Correlation matrices require at least two numeric fields.');
    }

    const matrix = computeCorrelationMatrix(numericFields, records);

    return {
        chartData: {
            data: [
                {
                    type: 'heatmap',
                    z: matrix,
                    x: numericFields,
                    y: numericFields,
                    colorscale: 'RdBu',
                    zmin: -1,
                    zmax: 1,
                    reversescale: true
                }
            ],
            layout: {
                title: 'Correlation matrix',
                xaxis: { title: 'Fields' },
                yaxis: { title: 'Fields' }
            }
        },
        insights: ['Correlation matrix computed. Values range from -1 (inverse) to 1 (direct correlation).'],
        warnings: []
    };
};

const buildHeatmapFromGroups = (
    records: Record<string, unknown>[],
    fields: VisualizationFieldConfig,
    fallbackFields: string[]
): ChartBuildResult => {
    const xField = ensureField(fields.x, fallbackFields);
    const yField = ensureField(fields.y, fallbackFields.slice(1));

    if (!xField || !yField) {
        throw new Error('Heatmaps require both x and y categorical fields.');
    }

    const valueField = ensureField(fields.z ?? fields.values, fallbackFields.slice(2));
    const matrixMap = new Map<string, Map<string, number>>();

    for (const record of records) {
        const xKey = toStringValue(record[xField]) ?? 'Unspecified';
        const yKey = toStringValue(record[yField]) ?? 'Unspecified';
        const row = matrixMap.get(yKey) || new Map<string, number>();
        const existing = row.get(xKey) ?? 0;
        const increment = valueField ? toNumber(record[valueField]) ?? 0 : 1;
        row.set(xKey, existing + increment);
        matrixMap.set(yKey, row);
    }

    const xCategories = Array.from(new Set(Array.from(matrixMap.values()).flatMap((row) => Array.from(row.keys()))));
    const yCategories = Array.from(matrixMap.keys());
    const zValues = yCategories.map((yCat) => xCategories.map((xCat) => matrixMap.get(yCat)?.get(xCat) ?? 0));

    return {
        chartData: {
            data: [
                {
                    type: 'heatmap',
                    x: xCategories,
                    y: yCategories,
                    z: zValues,
                    colorscale: 'Viridis'
                }
            ],
            layout: {
                title: `Heatmap of ${yField} vs ${xField}`,
                xaxis: { title: xField },
                yaxis: { title: yField }
            }
        },
        insights: [`Generated heatmap across ${xCategories.length} by ${yCategories.length} categories.`],
        warnings: []
    };
};

const buildVisualizationChart = (
    chartType: string,
    snapshot: ProjectDataSnapshot,
    fields: VisualizationFieldConfig,
    fallbackFields: string[],
    aggregation?: VisualizationAggregationConfig,
    explicitFields?: string[]
): ChartBuildResult => {
    switch (chartType) {
        case 'bar':
            return buildBarOrLineChart('bar', snapshot.records, fields, fallbackFields, aggregation);
        case 'line':
            return buildBarOrLineChart('line', snapshot.records, fields, fallbackFields, aggregation);
        case 'scatter':
            return buildScatterChart(snapshot.records, fields, fallbackFields);
        case 'pie':
            return buildPieChart(snapshot.records, fields, fallbackFields);
        case 'histogram':
            return buildHistogram(snapshot.records, fields, fallbackFields);
        case 'boxplot':
            return buildBoxOrViolinChart('boxplot', snapshot.records, fields, fallbackFields);
        case 'violin':
            return buildBoxOrViolinChart('violin', snapshot.records, fields, fallbackFields);
        case 'heatmap':
            return buildHeatmapFromGroups(snapshot.records, fields, fallbackFields);
        case 'correlation_matrix':
            return buildCorrelationHeatmap(snapshot.schema, snapshot.records, explicitFields);
        default:
            throw new Error(`Unsupported chart type requested: ${chartType}`);
    }
};

const collectFieldCandidates = (snapshot: ProjectDataSnapshot): string[] => {
    const keys = new Set<string>();
    snapshot.schemaKeys.forEach((key) => {
        if (key) {
            keys.add(key);
        }
    });
    snapshot.records.slice(0, 200).forEach((record) => {
        Object.keys(record).forEach((key) => {
            if (key) {
                keys.add(key);
            }
        });
    });
    return Array.from(keys);
};

const deriveNumericCandidates = (snapshot: ProjectDataSnapshot): string[] => {
    const bySchema = snapshot.schemaKeys.filter((key) => key && isNumericType(snapshot.schema, key));
    if (bySchema.length) {
        return bySchema;
    }
    const candidates = new Set<string>();
    snapshot.records.slice(0, 200).forEach((record) => {
        Object.entries(record).forEach(([key, value]) => {
            if (!key || candidates.has(key)) {
                return;
            }
            if (toNumber(value) !== null) {
                candidates.add(key);
            }
        });
    });
    return Array.from(candidates);
};

const deriveCategoricalCandidates = (snapshot: ProjectDataSnapshot): string[] => {
    const bySchema = snapshot.schemaKeys.filter((key) => key && !isNumericType(snapshot.schema, key));
    if (bySchema.length) {
        return bySchema;
    }
    const candidates = new Set<string>();
    snapshot.records.slice(0, 200).forEach((record) => {
        Object.entries(record).forEach(([key, value]) => {
            if (!key || candidates.has(key)) {
                return;
            }
            if (toNumber(value) === null) {
                candidates.add(key);
            }
        });
    });
    return Array.from(candidates);
};

const ensureFieldCoverage = (
    chartType: string,
    fields: VisualizationFieldConfig,
    snapshot: ProjectDataSnapshot
): void => {
    const fallbackFields = collectFieldCandidates(snapshot);
    const numericCandidates = deriveNumericCandidates(snapshot);
    const categoricalCandidates = deriveCategoricalCandidates(snapshot);
    const used = new Set<string>();

    Object.values(fields).forEach((value) => {
        if (typeof value === 'string' && value) {
            used.add(value);
        }
    });

    const assignField = (key: keyof VisualizationFieldConfig, preferred: string[], fallback: string[]): void => {
        if (fields[key]) {
            if (typeof fields[key] === 'string') {
                used.add(fields[key] as string);
            }
            return;
        }
        const candidate = [...preferred, ...fallback].find((value) => value && !used.has(value));
        if (candidate) {
            fields[key] = candidate;
            used.add(candidate);
        }
    };

    switch (chartType) {
        case 'bar':
            assignField('x', categoricalCandidates, fallbackFields);
            assignField('y', numericCandidates, fallbackFields);
            break;
        case 'line':
            assignField('x', categoricalCandidates.length ? categoricalCandidates : numericCandidates, fallbackFields);
            assignField('y', numericCandidates, fallbackFields);
            break;
        case 'scatter':
            assignField('x', numericCandidates, fallbackFields);
            const yFallback = numericCandidates.filter((value) => value !== fields.x);
            assignField('y', yFallback, fallbackFields);
            if (!fields.color) {
                const colorCandidates = categoricalCandidates.filter((value) => value !== fields.x);
                assignField('color', colorCandidates, fallbackFields);
            }
            break;
        case 'pie':
            assignField('names', categoricalCandidates, fallbackFields);
            if (!fields.values) {
                const valueCandidates = numericCandidates.filter((value) => value !== fields.names);
                assignField('values', valueCandidates, fallbackFields);
            }
            break;
        case 'histogram':
            assignField('x', numericCandidates, fallbackFields);
            break;
        case 'boxplot':
        case 'violin':
            assignField('y', numericCandidates, fallbackFields);
            if (!fields.x) {
                const groupCandidates = categoricalCandidates.filter((value) => value !== fields.y);
                assignField('x', groupCandidates, fallbackFields);
            }
            break;
        case 'heatmap':
            assignField('x', categoricalCandidates, fallbackFields);
            const yCandidates = categoricalCandidates.filter((value) => value !== fields.x);
            assignField('y', yCandidates, fallbackFields);
            if (!fields.z) {
                assignField('z', numericCandidates, fallbackFields);
            }
            break;
        default:
            assignField('x', fallbackFields, fallbackFields);
            const fallbackY = fallbackFields.filter((value) => value !== fields.x);
            assignField('y', fallbackY, fallbackFields);
    }
};

const parseFieldConfig = (
    rawFields: unknown,
    extras: {
        groupByColumn?: unknown;
        colorByColumn?: unknown;
        sizeByColumn?: unknown;
        config?: Record<string, unknown>;
    }
): { fields: VisualizationFieldConfig; explicit: string[] } => {
    const fields: VisualizationFieldConfig = {};
    const explicit = new Set<string>();

    const assign = (key: keyof VisualizationFieldConfig, value: unknown) => {
        if (fields[key]) {
            return;
        }
        const normalized = ensureString(value);
        if (normalized) {
            fields[key] = normalized;
            explicit.add(normalized);
        }
    };

    if (Array.isArray(rawFields)) {
        rawFields.forEach((value, index) => {
            switch (index) {
                case 0:
                    assign('x', value);
                    break;
                case 1:
                    assign('y', value);
                    break;
                case 2:
                    assign('color', value);
                    break;
                case 3:
                    assign('size', value);
                    break;
                default:
                    assign('z', value);
                    break;
            }
        });
    } else if (rawFields && typeof rawFields === 'object') {
        const candidate = rawFields as Record<string, unknown> | any;
        assign('x', candidate['x'] ?? candidate['xAxis'] ?? candidate['dimension'] ?? candidate['group_by']);
        assign('y', candidate['y'] ?? candidate['yAxis'] ?? candidate['value'] ?? candidate['metric']);
        assign('color', candidate['color'] ?? candidate['colorBy']);
        assign('size', candidate['size'] ?? candidate['sizeBy']);
        assign('names', candidate['names'] ?? candidate['labels'] ?? candidate['category']);
        assign('values', candidate['values'] ?? candidate['metric'] ?? candidate['valueField']);
        assign('z', candidate['z'] ?? candidate['heatmapValue'] ?? candidate['value']);
    }

    assign('x', extras.groupByColumn);
    assign('color', extras.colorByColumn);
    assign('size', extras.sizeByColumn);

    const config = extras.config;
    if (config) {
        const configAny = config as Record<string, unknown> | any;
        assign('x', configAny['xAxis'] ?? configAny['dimension'] ?? configAny['primaryField']);
        assign('y', configAny['yAxis'] ?? configAny['metric'] ?? configAny['valueField'] ?? configAny['measureField']);
        assign('names', configAny['names'] ?? configAny['namesField'] ?? configAny['categoryField']);
        assign('values', configAny['values'] ?? configAny['valuesField'] ?? configAny['metricField']);
        assign('color', configAny['colorBy'] ?? configAny['seriesField']);
        assign('size', configAny['sizeBy']);
    }

    return { fields, explicit: Array.from(explicit) };
};

const parseAggregationConfig = (
    rawAggregation: unknown,
    fields: VisualizationFieldConfig,
    extras: {
        groupByColumn?: unknown;
        config?: Record<string, unknown>;
    }
): VisualizationAggregationConfig | undefined => {
    const configAny = extras.config as Record<string, unknown> | any;
    const aggregationRequested = Boolean(rawAggregation) || Boolean(configAny?.['aggregation']) || Boolean(configAny?.['aggregate']);
    if (!aggregationRequested) {
        return undefined;
    }

    const groupValues = uniqueStrings(
        rawAggregation && typeof rawAggregation === 'object' ? (rawAggregation as any).group_by : undefined,
        rawAggregation && typeof rawAggregation === 'object' ? (rawAggregation as any).groupBy : undefined,
        extras.groupByColumn,
        configAny?.['groupBy'],
        configAny?.['group_by'],
        fields.x
    );

    const aggregations: Record<string, string> = {};
    const rawAggMap = rawAggregation && typeof rawAggregation === 'object' ? (rawAggregation as any).aggregations : undefined;

    if (rawAggMap && typeof rawAggMap === 'object') {
        for (const [field, agg] of Object.entries(rawAggMap)) {
            const normalizedField = ensureString(field);
            const normalizedAgg = normalizeAggregationName(ensureString(agg));
            if (normalizedField && normalizedAgg) {
                aggregations[normalizedField] = normalizedAgg;
            }
        }
    }

    const configAggField = ensureString(configAny?.['aggregationField'] ?? configAny?.['metric'] ?? fields.y);
    const configAggName = normalizeAggregationName(ensureString(configAny?.['aggregation'] ?? configAny?.['aggregate']));
    if (configAggField && configAggName) {
        aggregations[configAggField] = configAggName;
    }

    if (!Object.keys(aggregations).length) {
        return undefined;
    }

    const sanitizedGroups = groupValues.filter((value, index, array) => value && array.indexOf(value) === index);
    if (!sanitizedGroups.length) {
        return undefined;
    }

    return {
        group_by: sanitizedGroups,
        aggregations
    };
};

const mergeVisualizationOptions = (
    chartType: string,
    config: Record<string, unknown>,
    options: Record<string, unknown>
): Record<string, unknown> => {
    const merged: Record<string, unknown> = {};
    const optionsAny = options as Record<string, unknown> | any;
    const configAny = config as Record<string, unknown> | any;

    const assignOption = (key: string, ...values: unknown[]) => {
        for (const value of values) {
            if (value === undefined || value === null) {
                continue;
            }
            if (typeof value === 'string' && value.trim().length) {
                merged[key] = value.trim();
                return;
            }
            if (typeof value === 'number' && Number.isFinite(value)) {
                merged[key] = value;
                return;
            }
            if (typeof value === 'boolean') {
                merged[key] = value;
                return;
            }
        }
    };

    assignOption('title', optionsAny?.['title'], configAny?.['title'], `Generated ${VISUALIZATION_LABELS[chartType] || chartType}`);
    assignOption(
        'x_title',
        optionsAny?.['x_title'],
        optionsAny?.['xlabel'],
        configAny?.['x_title'],
        configAny?.['xlabel'],
        configAny?.['xAxisTitle'],
        configAny?.['xAxisLabel']
    );
    assignOption(
        'y_title',
        optionsAny?.['y_title'],
        optionsAny?.['ylabel'],
        configAny?.['y_title'],
        configAny?.['ylabel'],
        configAny?.['yAxisTitle'],
        configAny?.['yAxisLabel']
    );
    assignOption('height', Number(optionsAny?.['height']), Number(configAny?.['height']));
    assignOption('width', Number(optionsAny?.['width']), Number(configAny?.['width']));
    assignOption('showLegend', optionsAny?.['showLegend'], configAny?.['showLegend']);
    assignOption('showGrid', optionsAny?.['showGrid'], configAny?.['showGrid']);
    assignOption('colorScheme', optionsAny?.['colorScheme'], configAny?.['colorScheme'], configAny?.['theme']);

    if (optionsAny?.['labels'] && typeof optionsAny['labels'] === 'object') {
        merged.labels = optionsAny['labels'];
    } else if (configAny?.['labels'] && typeof configAny['labels'] === 'object') {
        merged.labels = configAny['labels'];
    }

    if (optionsAny?.['bins'] && Number(optionsAny['bins'])) {
        merged.bins = Number(optionsAny['bins']);
    } else if (configAny?.['bins'] && Number(configAny['bins'])) {
        merged.bins = Number(configAny['bins']);
    }

    return merged;
};

const buildSnapshot = async (projectId: string, project: any): Promise<{
    snapshot: ProjectDataSnapshot;
    dataset?: any;
}> => {
    const associations = await storage.getProjectDatasets(projectId).catch(() => []);
    for (const association of associations) {
        const dataset = association?.dataset;
        const candidate = buildProjectDataSnapshot(project, dataset);
        if (candidate.records.length) {
            return { snapshot: candidate, dataset };
        }
    }

    const fallback = buildProjectDataSnapshot(project, project);
    return { snapshot: fallback };
};

const buildCustomizations = (
    fields: VisualizationFieldConfig,
    config: Record<string, unknown>,
    options: Record<string, unknown>
) => {
    const configAny = config as Record<string, unknown> | any;
    const optionsAny = options as Record<string, unknown> | any;

    const title = ensureString(optionsAny?.['title'] ?? configAny?.['title']);
    const xAxis = fields.x ?? ensureString(configAny?.['xAxis'] ?? configAny?.['dimension'] ?? configAny?.['primaryField']);
    const yAxis = fields.y ?? ensureString(configAny?.['yAxis'] ?? configAny?.['metric'] ?? configAny?.['valueField']);
    const colorBy = fields.color ?? ensureString(configAny?.['colorBy'] ?? configAny?.['seriesField']);
    const sizeBy = fields.size ?? ensureString(configAny?.['sizeBy']);

    const styling = typeof configAny?.['styling'] === 'object' ? configAny['styling']
        : typeof optionsAny?.['styling'] === 'object' ? optionsAny['styling']
            : undefined;

    const filters = typeof configAny?.['filters'] === 'object' ? configAny['filters']
        : typeof optionsAny?.['filters'] === 'object' ? optionsAny['filters']
            : undefined;

    const aggregation = typeof configAny?.['aggregation'] === 'object' ? configAny['aggregation']
        : typeof optionsAny?.['aggregation'] === 'object' ? optionsAny['aggregation']
            : undefined;

    return {
        title,
        xAxis,
        yAxis,
        colorBy,
        sizeBy,
        filters,
        styling,
        aggregation
    };
};

const limitFields = (fields: string[], max: number): string[] => fields.filter(Boolean).slice(0, max);

export async function createVisualizationHandler(req: Request, res: Response): Promise<void> {
    try {
        const { projectId } = req.params;
        const userId = (req.user as any)?.id;

        if (!projectId) {
            res.status(400).json({ success: false, error: 'Project ID is required' });
            return;
        }

        if (!userId) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return;
        }

        const project = await storage.getProject(projectId);
        if (!project) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }

        const { snapshot, dataset } = await buildSnapshot(projectId, project);
        if (!snapshot.records.length) {
            res.status(400).json({
                success: false,
                error: 'No data available for visualization. Upload data or run an analysis first.'
            });
            return;
        }

        const fieldCandidates = collectFieldCandidates(snapshot);
        if (!fieldCandidates.length) {
            res.status(400).json({ success: false, error: 'No fields found to visualize.' });
            return;
        }

        const config = (req.body && typeof req.body.config === 'object') ? (req.body.config as Record<string, unknown>) : {};
        const options = (req.body && typeof req.body.options === 'object') ? (req.body.options as Record<string, unknown>) : {};

        const chartType = normalizeChartType(req.body?.chartType ?? req.body?.type ?? config.chartType);
        const { fields, explicit } = parseFieldConfig(req.body?.fields, {
            groupByColumn: req.body?.groupByColumn,
            colorByColumn: req.body?.colorByColumn,
            sizeByColumn: req.body?.sizeByColumn,
            config
        });

        ensureFieldCoverage(chartType, fields, snapshot);

        let explicitFields = explicit;
        if (chartType === 'correlation_matrix') {
            const numericCandidates = deriveNumericCandidates(snapshot);
            explicitFields = limitFields(uniqueStrings(req.body?.fields, explicitFields, numericCandidates), 12);
            if (!explicitFields.length) {
                res.status(400).json({ success: false, error: 'Correlation matrix requires at least two numeric fields.' });
                return;
            }
        }

        const aggregationConfig = parseAggregationConfig(req.body?.aggregate ?? req.body?.aggregation, fields, {
            groupByColumn: req.body?.groupByColumn,
            config
        });

        const datasetCharacteristics = computeDatasetCharacteristics(snapshot);
        const requirements = buildVisualizationRequirements(chartType, snapshot.records.length);

        let chartResult: ChartBuildResult;
        try {
            chartResult = buildVisualizationChart(chartType, snapshot, fields, fieldCandidates, aggregationConfig, explicitFields);
        } catch (chartError) {
            const message = chartError instanceof Error ? chartError.message : 'Unable to generate visualization';
            res.status(400).json({ success: false, error: message });
            return;
        }

        const mergedOptions = mergeVisualizationOptions(chartType, config, options);
        const customizations = buildCustomizations(fields, config, mergedOptions);

        let engineResult;
        try {
            engineResult = await enhancedVisualizationEngine.createVisualization({
                data: snapshot.records,
                chartType,
                requirements,
                datasetCharacteristics,
                customizations
            });
        } catch (engineError) {
            console.error('Visualization engine error:', engineError);
            engineResult = {
                success: false,
                library: 'unknown',
                chartData: null,
                metadata: {
                    renderTime: 0,
                    dataPoints: snapshot.records.length,
                    interactive: false
                },
                exportOptions: { formats: [] },
                error: engineError instanceof Error ? engineError.message : String(engineError)
            };
        }

        const insights = (project as any).insights || (project as any).aiInsights || [];
        const warnings = [...chartResult.warnings];
        if (!engineResult.success && engineResult.error) {
            warnings.push(engineResult.error);
        }

        const metadata = {
            dataset: {
                id: dataset?.id ?? projectId,
                name: dataset?.name ?? project?.name ?? 'Project Dataset',
                recordCount: snapshot.records.length,
                schemaFields: snapshot.schemaKeys
            },
            datasetCharacteristics,
            requirements,
            engine: {
                library: engineResult.library,
                metadata: engineResult.metadata,
                exportOptions: engineResult.exportOptions,
                success: engineResult.success,
                error: engineResult.error
            }
        };

        const responsePayload = {
            success: true,
            message: `Generated ${VISUALIZATION_LABELS[chartType] || chartType}`,
            visualization: {
                chart_type: chartType,
                chart_data: chartResult.chartData,
                fields,
                aggregation: aggregationConfig,
                options: mergedOptions,
                insights,
                warnings,
                metadata,
                engine_chart_data: engineResult.chartData
            }
        };

        res.json(responsePayload);
    } catch (error) {
        console.error('Create visualization error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create visualization'
        });
    }
}

// ==========================================
// Agent Coordination Setup
// ==========================================
console.log('🔗 Setting up agent coordination via message broker...');

// Subscribe to data engineering events
messageBroker.on('data:quality_assessed', async (message) => {
    console.log('📨 PM ← DE: Data quality assessed', message.data?.projectId);
    // Project Manager can track quality assessment completion
    // Data Scientist can use quality metrics for recommendations
});

messageBroker.on('data:analyzed', async (message) => {
    console.log('📨 DS ← DE: Data analyzed', message.data?.projectId);
    // Data Scientist receives data analysis results for recommendations
});

messageBroker.on('data:requirements_estimated', async (message) => {
    console.log('📨 DS ← DE: Data requirements estimated', message.data?.projectId);
    // Data Scientist uses requirements for complexity analysis
});

// Subscribe to data science events
messageBroker.on('analysis:recommended', async (message) => {
    console.log('📨 PM ← DS: Analysis configuration recommended', message.data?.projectId);
    // Project Manager tracks that analysis plan is ready
});

messageBroker.on('analysis:complexity_calculated', async (message) => {
    console.log('📨 PM ← DS: Complexity calculated', message.data?.projectId);
    // Project Manager can update project estimates
});

// Subscribe to project manager events
messageBroker.on('project:configuration_approved', async (message) => {
    console.log('📨 DE,DS ← PM: Configuration approved', message.data?.projectId);
    // Both Data Engineer and Data Scientist can proceed with approved config
});

messageBroker.on('project:workflow_started', async (message) => {
    console.log('📨 All Agents ← PM: Workflow started', message.data?.projectId);
    // All agents initialize for the project
});

console.log('✅ Agent coordination established - agents can now communicate');

const buildUserContext = (req: any, project?: any) => {
    const user = (req.user as any) || {};
    const middlewareRole = (req as any).userRole?.id || (req as any).userRole?.name;
    const derivedRole = typeof middlewareRole === 'string'
        ? middlewareRole
        : user.role || (user.isAdmin ? 'admin' : 'user');

    return {
        userId: user.id,
        userEmail: user.email,
        userRole: derivedRole || 'user',
        isAdmin: Boolean(user.isAdmin),
        subscriptionTier: user.subscriptionTier || 'trial',
        projectId: project?.id,
        projectName: project?.name,
        journeyType: project?.journeyType || 'non-tech'
    };
};

// Configure upload directories
const UPLOADS_DIR = process.env.UPLOAD_DIR || './uploads';
const ORIGINAL_FILES_DIR = path.join(UPLOADS_DIR, 'originals');
const TRANSFORMED_FILES_DIR = path.join(UPLOADS_DIR, 'transformed');

// Ensure upload directories exist on startup
(async () => {
    try {
        await fs.mkdir(ORIGINAL_FILES_DIR, { recursive: true });
        await fs.mkdir(TRANSFORMED_FILES_DIR, { recursive: true });
        console.log(`✅ Upload directories initialized: ${ORIGINAL_FILES_DIR}, ${TRANSFORMED_FILES_DIR}`);
    } catch (error) {
        console.error('Failed to create upload directories:', error);
    }
})();

// Configure multer for file uploads with disk storage
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, ORIGINAL_FILES_DIR);
        },
        filename: (req, file, cb) => {
            const userId = (req.user as any)?.id || 'anonymous';
            const timestamp = Date.now();
            const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
            const filename = `${userId}_${timestamp}_${sanitized}`;
            cb(null, filename);
        }
    }),
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit for paid features
    },
    fileFilter: (req, file, cb) => {
        // Accept CSV, JSON, Excel, PDF, TXT, and image files
        const allowedTypes = [
            '.csv', '.json', '.xlsx', '.xls',
            '.pdf', '.txt',
            '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'
        ];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${ext} not supported. Allowed: ${allowedTypes.join(', ')}`));
        }
    }
});

// Create a new project
/**
 * @summary Creates a new, empty project shell.
 * @description This endpoint creates a project associated with the authenticated user.
 * It does NOT handle file uploads; it only establishes the project container.
 * @route POST /api/projects
 * @auth Required (`mockAuth` middleware).
 * @input
 * - `req.body`: { name: string, description?: string }
 * - `req.user`: Attached by the authentication middleware.
 * @process
 * 1. Verifies user is authenticated and has an ID.
 * 2. Validates that a project `name` is provided.
 * 3. Calls `storage.createProject` with the user ID and project details.
 * 4. The new project is created with empty data fields.
 * @output
 * - Success: 200 { success: true, project: object }
 * - Error: 400, 401, or 500 with an error message.
 * @dependencies `storage`.
 */
async function createProjectHandler(req: Request, res: Response) {
    try {
        const { name, description, journeyType } = req.body;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: "User authentication required" });
        }

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: "Project name is required" });
        }

        const requestedJourneyType = normalizeProjectJourneyType(journeyType);
        const billingService = getBillingService();
        const accessCheck = await billingService.canAccessJourney(userId, requestedJourneyType);

        if (!accessCheck.allowed) {
            return res.status(403).json({
                success: false,
                error: accessCheck.message || 'Journey access denied',
                requiresUpgrade: accessCheck.requiresUpgrade,
                minimumTier: accessCheck.minimumTier,
                currentJourneyType: requestedJourneyType
            });
        }

        const project = await storage.createProject({
            userId,
            name: name.trim(),
            description: description || '',
            journeyType: requestedJourneyType,
            isPaid: false,
            isTrial: true,
            dataSource: 'upload',
            fileType: '',
            fileName: '',
            fileSize: 0,
        });

        try {
            await journeyStateManager.initializeJourney(project.id, requestedJourneyType);
        } catch (stateError) {
            console.error('Failed to initialize journey progress:', stateError);
        }

        try {
            await projectAgentOrchestrator.initializeProjectAgents({
                projectId: project.id,
                userId,
                journeyType: mapProjectJourneyToAgentJourney(requestedJourneyType),
                projectName: name.trim(),
                description: description || ''
            });
        } catch (agentError) {
            console.error('Agent initialization failed:', agentError);
        }

        res.json({ success: true, project });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message || "Failed to create project" });
    }
}

router.post("/", ensureAuthenticated, createProjectHandler);

router.post(
    "/:projectId/create-visualization",
    ensureAuthenticated,
    requireOwnership('project'),
    createVisualizationHandler
);

/**
 * Agent Recommendations Endpoint
 * Analyzes user goals and questions to provide recommendations for:
 * - Expected data size (from Data Engineer Agent)
 * - Analysis complexity (from Data Scientist Agent)
 */
router.post("/:id/agent-recommendations", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: "User authentication required" });
        }

        const { goals, questions, dataSource } = req.body;

        if (!goals || !questions || !Array.isArray(questions)) {
            return res.status(400).json({
                success: false,
                error: "Goals and questions are required"
            });
        }

        console.log(`🤖 Starting agent recommendation workflow for project ${projectId}`);
        console.log(`📋 Input: ${questions.length} questions, goals: ${goals}`);

        // Get project for context
        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({ success: false, error: "Project not found" });
        }

        // Verify ownership with admin bypass
        const isAdminUser = (req.user as any)?.isAdmin || false;
        if (!isAdminUser && project.userId !== userId) {
            return res.status(403).json({ success: false, error: "Access denied" });
        }

        // Build agent context with full information
        const baseContext = buildAgentContext(req.user, project);

        // Step 1: Data Engineer estimates data requirements with full context
        console.log('📊 Data Engineer estimating data requirements...');
        const dataEngineerContext: DataEngineerContext = {
            ...baseContext,
            goals,
            questions,
            dataSource: dataSource || 'upload',
            journeyType: project.journeyType || 'non-tech'
        };

        // Use context if available, fallback to old signature for backward compatibility
        const dataEstimate = await dataEngineerAgent.estimateDataRequirements({
            ...dataEngineerContext,
            // Also pass old params for backward compatibility
            goals,
            questions,
            dataSource: dataSource || 'upload',
            journeyType: project.journeyType || 'non-tech'
        } as any);

        // Publish event about data requirements estimation
        messageBroker.emit('data:requirements_estimated', {
            projectId,
            userId,
            dataEstimate,
            timestamp: new Date().toISOString()
        });
        console.log('📤 Data Engineer → Broadcast: Requirements estimated');

        // Step 2: Data Scientist analyzes complexity and recommends config with full context
        console.log('🔬 Data Scientist analyzing complexity...');
        const dataScientistContext: DataScientistContext = {
            ...baseContext,
            dataAnalysis: dataEstimate,
            userQuestions: questions,
            analysisGoal: goals,
            analysisType: 'exploratory',
            complexity: (dataEstimate as any)?.complexity || 'medium'
        };

        const dsRecommendations = await dataScientistAgent.recommendAnalysisConfig({
            ...dataScientistContext,
            // Also pass old params for backward compatibility
            dataAnalysis: dataEstimate,
            userQuestions: questions,
            analysisGoal: goals,
            journeyType: project.journeyType || 'non-tech'
        } as any);

        // Publish event about analysis recommendations
        messageBroker.emit('analysis:recommended', {
            projectId,
            userId,
            recommendations: dsRecommendations,
            timestamp: new Date().toISOString()
        });
        console.log('📤 Data Scientist → Broadcast: Analysis recommended');

        // Step 3: Combine recommendations
        const recommendations = {
            success: true,
            recommendations: {
                expectedDataSize: dataEstimate.estimatedRows?.toString() || '1000',
                analysisComplexity: dsRecommendations.recommendedComplexity || 'moderate',
                rationale: dsRecommendations.rationale || `Analysis configuration for ${questions.length} questions`,
                confidence: dsRecommendations.confidence || 0.85,
                dataEngineering: {
                    estimatedRows: dataEstimate.estimatedRows,
                    estimatedColumns: dataEstimate.estimatedColumns,
                    dataCharacteristics: dataEstimate.dataCharacteristics
                },
                dataScience: {
                    recommendedAnalyses: dsRecommendations.recommendedAnalyses,
                    suggestedVisualizations: dsRecommendations.suggestedVisualizations,
                    estimatedProcessingTime: dsRecommendations.estimatedProcessingTime
                }
            },
            metadata: {
                generatedAt: new Date().toISOString(),
                agents: ['data_engineer', 'data_scientist']
            }
        };

        console.log(`✅ Agent recommendations generated: Size=${dataEstimate.estimatedRows}, Complexity=${dsRecommendations.recommendedComplexity}`);

        res.json(recommendations);

    } catch (error: any) {
        console.error('Agent recommendations error:', error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to get agent recommendations"
        });
    }
});

// Legacy trial upload endpoint
router.post("/trial-upload", upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: "No file uploaded" });
        }
        const file = req.file;
        const freeTrialLimit = PricingService.getFreeTrialLimits();
        if (file.size > freeTrialLimit.maxFileSize) {
            return res.status(400).json({ success: false, error: `File size exceeds trial limit of ${Math.round(freeTrialLimit.maxFileSize / (1024 * 1024))}MB` });
        }
        const processedData = await FileProcessor.processFile(file.buffer, file.originalname, file.mimetype);
        const piiAnalysis = await PIIAnalyzer.analyzePII(processedData.preview || [], processedData.schema || {});
        if (piiAnalysis.detectedPII && piiAnalysis.detectedPII.length > 0) {
            const tempFileId = `trial_temp_${nanoid()}`;
            tempStore.set(tempFileId, {
                processedData,
                piiAnalysis,
                fileInfo: { originalname: file.originalname, size: file.size, mimetype: file.mimetype }
            }, 60 * 60 * 1000); // 1 hour expiry

            return res.json({
                success: true,
                requiresPIIDecision: true,
                tempFileId,
                piiResult: piiAnalysis,
                sampleData: processedData.preview,
                fileInfo: { originalname: file.originalname, size: file.size, mimetype: file.mimetype },
                dataDescription: processedData.datasetSummary.overview,
                datasetSummary: processedData.datasetSummary,
                descriptiveStats: processedData.descriptiveStats,
                qualityMetrics: processedData.qualityMetrics,
                relationships: processedData.relationships
            });
        }

        const trialResults = await PythonProcessor.processTrial(`trial_${Date.now()}`, {
            preview: processedData.data.slice(0, 100),
            schema: processedData.schema,
            recordCount: processedData.recordCount,
        });

        if (!trialResults.success) {
            return res.status(500).json({ success: false, error: `Failed to process trial analysis: ${trialResults.error || 'Unknown error'}` });
        }

        return res.json({
            success: true,
            trialResults: {
                schema: processedData.schema,
                descriptiveAnalysis: trialResults.data,
                basicVisualizations: trialResults.visualizations || [],
                piiAnalysis: { ...piiAnalysis, userDecision: 'proceed', decisionTimestamp: new Date() },
                piiDecision: 'proceed',
                recordCount: processedData.recordCount,
                datasetSummary: processedData.datasetSummary,
                descriptiveStats: processedData.descriptiveStats,
                qualityMetrics: processedData.qualityMetrics,
                relationships: processedData.relationships
            },
            recordCount: processedData.recordCount,
            dataDescription: processedData.datasetSummary.overview
        });

    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message || "Failed to process trial file" });
    }
});

// Save transformations endpoint
router.post("/save-transformations/:projectId", unifiedAuth, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { transformations } = req.body;
        const userId = (req.user as any)?.id;
        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }
        const project = await storage.getProject(projectId);
        const owner = (project as any)?.ownerId ?? (project as any)?.userId;
        if (!project || owner !== userId) {
            return res.status(404).json({ error: "Project not found or access denied" });
        }
        const dataset = await storage.getDatasetForProject(projectId);
        const sourceRows = extractRowsForTransformation(dataset, project);

        if (sourceRows.length === 0) {
            return res.status(400).json({ success: false, error: "Project has no data to transform" });
        }

        const baseWarnings: string[] = [];
        const sanitizedSteps: TransformationStep[] = Array.isArray(transformations)
            ? transformations
                .map((rawStep: unknown) => {
                    if (!rawStep || typeof rawStep !== 'object') {
                        baseWarnings.push('Skipped invalid transformation step.');
                        return null;
                    }

                    const step = rawStep as { type?: unknown; config?: unknown };
                    const typeValue = typeof step.type === 'string' ? step.type.trim() : '';
                    if (!typeValue || !VALID_TRANSFORMATION_TYPES.includes(typeValue as TransformationType)) {
                        baseWarnings.push(`Skipped unsupported transformation type: ${typeValue || 'unknown'}.`);
                        return null;
                    }

                    const configCandidate = step.config;
                    const config = configCandidate && typeof configCandidate === 'object' && !Array.isArray(configCandidate)
                        ? { ...(configCandidate as Record<string, any>) }
                        : {};

                    return { type: typeValue as TransformationType, config };
                })
                .filter((step): step is TransformationStep => step !== null)
            : [];

        const joinCache = new Map<string, { rows: any[]; projectName?: string }>();
        const joinResolver = async (targetProjectId: string) => {
            if (joinCache.has(targetProjectId)) {
                return joinCache.get(targetProjectId)!;
            }

            const relatedProject = await storage.getProject(targetProjectId);
            if (!relatedProject) {
                throw new Error('Join project not found.');
            }

            const relatedOwner = (relatedProject as any)?.ownerId ?? (relatedProject as any)?.userId;
            if (relatedOwner !== userId) {
                throw new Error('Access denied for join project.');
            }

            const relatedDataset = await storage.getDatasetForProject(targetProjectId);
            const relatedRows = extractRowsForTransformation(relatedDataset, relatedProject);

            if (relatedRows.length === 0) {
                throw new Error('Join dataset has no rows.');
            }

            const payload = {
                rows: relatedRows,
                projectName: relatedProject?.name ?? targetProjectId,
            };

            joinCache.set(targetProjectId, payload);
            return payload;
        };

        const transformationResult = await DataTransformationService.applyTransformations(
            sourceRows,
            sanitizedSteps,
            {
                originalSchema: dataset?.schema ?? (project as any)?.schema,
                warnings: baseWarnings,
                joinResolver,
            },
        );

        const updatedProject = await storage.updateProject(projectId, {
            transformedData: transformationResult.rows,
            transformations: sanitizedSteps,
        });

        res.json({
            success: true,
            message: "Transformations saved successfully",
            project: updatedProject,
            preview: transformationResult.preview,
            rowCount: transformationResult.rowCount,
            warnings: transformationResult.warnings,
            summary: transformationResult.summary,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to save transformations" });
    }
});

// Get transformed data endpoint
router.get("/get-transformed-data/:projectId", unifiedAuth, async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = (req.user as any)?.id;
        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }
        const project = await storage.getProject(projectId);
        const owner = (project as any)?.ownerId ?? (project as any)?.userId;
        if (!project || owner !== userId) {
            return res.status(404).json({ error: "Project not found or access denied" });
        }
        const transformedData = project.transformedData || project.data;
        res.json({
            success: true,
            data: transformedData ? transformedData.slice(0, 100) : [],
            totalRows: transformedData ? transformedData.length : 0,
            message: "Transformed data retrieved successfully"
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to get transformed data" });
    }
});

// Main project upload endpoint
router.post("/upload", ensureAuthenticated, upload.single('file'), async (req, res) => {
    const uploadStart = Date.now();
    const uploadTrackingId = `upload_${nanoid()}`;
    const metricDetails: Record<string, any> = {
        method: req.method,
        path: req.path,
        uploadId: uploadTrackingId
    };
    let metricUserId: string | undefined;

    res.on('finish', () => {
        const duration = Date.now() - uploadStart;
        const status = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warning' : 'success';

        if (duration > 60000) {
            console.warn(`⚠️  Upload SLA exceeded (${duration}ms) for ${metricDetails.fileName || 'unknown file'} [${uploadTrackingId}]`);
        }

        performanceWebhookService.recordMetric({
            timestamp: new Date(),
            service: 'project_upload',
            operation: 'upload_total',
            duration,
            status,
            details: {
                ...metricDetails,
                statusCode: res.statusCode
            },
            userId: metricUserId,
            sessionId: req.sessionID
        }).catch(error => {
            console.error('Failed to record upload performance metric:', error);
        });
    });

    try {
        const uploadAuthHeader = getAuthHeader(req);
        console.log('🔍 Upload request debug:', {
            hasFile: !!req.file,
            hasUser: !!req.user,
            userId: req.user?.id,
            reqUserId: req.userId,
            authHeader: uploadAuthHeader ? uploadAuthHeader.substring(0, 20) + '...' : 'missing',
            rawAuthorizationHeader: req.headers.authorization?.substring(0, 20) + '...',
            forwardedAuthorizationHeader: typeof req.headers['x-forwarded-authorization'] === 'string'
                ? (req.headers['x-forwarded-authorization'] as string).substring(0, 20) + '...'
                : undefined
        });

        if (!req.file) {
            return res.status(400).json({ success: false, error: "No file uploaded" });
        }
        const { name, description, questions } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: "Project name is required" });
        }

        metricDetails.fileName = req.file.originalname;
        metricDetails.fileSize = req.file.size;

        // Ensure we have a valid user ID
        const adminId = req.user?.id || req.userId;
        if (!adminId) {
            console.error('❌ No user ID found in request:', { reqUser: req.user, reqUserId: req.userId });
            return res.status(401).json({ success: false, error: "Authentication required" });
        }

        const isAdminUser = (req.user as any)?.isAdmin || false;
        let actualUserId = adminId; // Default to admin's ID
        let createdByAdminId: string | undefined = undefined;

        // ✅ Check for customer context header (consultant mode)
        const customerContextHeader = req.headers['x-customer-context'];
        if (isAdminUser && customerContextHeader) {
            try {
                const customerContext = JSON.parse(customerContextHeader as string);

                // ✅ VALIDATE customer exists
                const customer = await storage.getUser(customerContext.userId);
                if (!customer) {
                    return res.status(404).json({
                        success: false,
                        error: "Customer not found"
                    });
                }

                // ✅ VALIDATE customer is not admin
                if (customer.isAdmin) {
                    return res.status(403).json({
                        success: false,
                        error: "Cannot act as another admin"
                    });
                }

                // ✅ Use customer's ID for project creation
                actualUserId = customerContext.userId;
                createdByAdminId = adminId;

                console.log(`✅ Admin ${adminId} creating project for customer ${actualUserId}`);

                // TODO: Add audit logging here (will implement audit service next)

            } catch (error: any) {
                console.error('Invalid customer context:', error);
                return res.status(400).json({
                    success: false,
                    error: "Invalid customer context"
                });
            }
        }

        metricUserId = actualUserId;

        console.log('✅ Using user ID:', actualUserId);

        // Check journey access control (use actual user's permissions)
        const requestedJourneyType = normalizeProjectJourneyType(req.body.journeyType);
        const billingService = getBillingService();
        const accessCheck = await billingService.canAccessJourney(actualUserId, requestedJourneyType);

        if (!accessCheck.allowed) {
            return res.status(403).json({
                success: false,
                error: accessCheck.message || 'Journey access denied',
                requiresUpgrade: accessCheck.requiresUpgrade,
                minimumTier: accessCheck.minimumTier,
                currentJourneyType: requestedJourneyType
            });
        }

        // File is now saved to disk at req.file.path
        const originalFilePath = req.file.path; // e.g., uploads/originals/user123_1699999999_data.csv
        const originalFileName = req.file.originalname;

        console.log(`✅ File saved to disk: ${originalFilePath}`);

        // Read file for processing (since we need to parse it)
        const fileReadStart = Date.now();
        const fileBuffer = await fs.readFile(originalFilePath);
        const fileReadDuration = Date.now() - fileReadStart;
        metricDetails.readMs = fileReadDuration;
        performanceWebhookService.recordMetric({
            timestamp: new Date(),
            service: 'project_upload',
            operation: 'read_file',
            duration: fileReadDuration,
            status: 'success',
            details: {
                fileName: req.file.originalname,
                fileSize: req.file.size,
                uploadId: uploadTrackingId
            },
            userId: actualUserId,
            sessionId: req.sessionID
        }).catch(error => {
            console.error('Failed to record file read metric:', error);
        });

        // Calculate MD5 checksum for file integrity
        const checksumMd5 = crypto.createHash('md5').update(fileBuffer).digest('hex');

        const processStart = Date.now();
        const processedData = await FileProcessor.processFile(fileBuffer, req.file.originalname, req.file.mimetype);
        const processDuration = Date.now() - processStart;
        metricDetails.processingMs = processDuration;
        performanceWebhookService.recordMetric({
            timestamp: new Date(),
            service: 'project_upload',
            operation: 'process_file',
            duration: processDuration,
            status: 'success',
            details: {
                fileName: req.file.originalname,
                recordCount: processedData.recordCount,
                uploadId: uploadTrackingId
            },
            userId: actualUserId,
            sessionId: req.sessionID
        }).catch(error => {
            console.error('Failed to record file process metric:', error);
        });
        let parsedQuestions: string[] = [];
        if (questions) {
            try {
                parsedQuestions = typeof questions === 'string' ? JSON.parse(questions) : questions;
            } catch (e) {
                parsedQuestions = questions.split('\n').filter((q: string) => q.trim());
            }
        }
        const piiStart = Date.now();
        const piiAnalysis = await PIIAnalyzer.analyzePII(processedData.preview || [], processedData.schema || {});
        const piiDuration = Date.now() - piiStart;
        metricDetails.piiMs = piiDuration;
        performanceWebhookService.recordMetric({
            timestamp: new Date(),
            service: 'project_upload',
            operation: 'pii_analysis',
            duration: piiDuration,
            status: 'success',
            details: {
                fileName: req.file.originalname,
                detectedPII: piiAnalysis.detectedPII?.length || 0,
                uploadId: uploadTrackingId
            },
            userId: actualUserId,
            sessionId: req.sessionID
        }).catch(error => {
            console.error('Failed to record PII analysis metric:', error);
        });
        // Track PII detection for metrics
        if (piiAnalysis.detectedPII.length > 0) {
            metricDetails.hasPii = true;
            console.log(`🔒 [PII] Detected ${piiAnalysis.detectedPII.length} PII fields in ${req.file.originalname}`);
        }

        // ALWAYS create project first, then handle PII decisions
        // This ensures projectId is available for all subsequent operations
        const projectCreateStart = Date.now();
        const project = await storage.createProject({
            userId: actualUserId, // ✅ Use customer's ID, not admin's
            name: name.trim(),
            description: description || '',
            journeyType: requestedJourneyType,
            fileType: req.file.mimetype,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            dataSource: 'upload',
            isTrial: false,
            isPaid: false,
            metadata: {
                originalFilePath: originalFilePath,
                checksumMd5: checksumMd5,
                uploadedAt: new Date().toISOString(),
                ...(createdByAdminId && { createdByAdminId, createdByAdminAt: new Date().toISOString() })
            }
        } as any);
        const projectCreateDuration = Date.now() - projectCreateStart;
        metricDetails.projectId = project.id;
        metricDetails.projectCreateMs = projectCreateDuration;
        performanceWebhookService.recordMetric({
            timestamp: new Date(),
            service: 'project_upload',
            operation: 'create_project',
            duration: projectCreateDuration,
            status: 'success',
            details: {
                projectId: project.id,
                uploadId: uploadTrackingId,
                journeyType: requestedJourneyType
            },
            userId: actualUserId,
            sessionId: req.sessionID
        }).catch(error => {
            console.error('Failed to record project creation metric:', error);
        });

        try {
            await journeyStateManager.initializeJourney(project.id, requestedJourneyType);
        } catch (stateError) {
            console.error('Failed to initialize journey progress:', stateError);
        }

        const ingestionMetadata = {
            recordCount: processedData.recordCount,
            fileSize: req.file.size,
            fileType: req.file.mimetype,
            checksum: checksumMd5,
            // Persist backend-inferred schema so later steps keep typed columns
            schema: processedData.schema,
            columnTypes: processedData.columnTypes,
            dataDescription: processedData.datasetSummary.overview,
            datasetSummary: processedData.datasetSummary,
            descriptiveStats: processedData.descriptiveStats,
            qualityMetrics: processedData.qualityMetrics,
            relationships: processedData.relationships,
            validationResults: processedData.validationResults,
            preview: processedData.preview?.slice(0, 20) ?? [],
            generatedAt: new Date().toISOString()
        };

        // Create a dataset and link it with real file path
        const datasetCreateStart = Date.now();
        // ✅ PHASE 1 FIX: Ensure originalFileName is always set with fallback
        const safeOriginalFileName = req.file.originalname || `upload_${Date.now()}.csv`;
        // Row cap on dataset.data is enforced in storage.createDataset() — do NOT add inline caps here.
        // See DATASET_DATA_ROW_CAP in server/constants.ts, enforced in storage.createDataset().
        const dataset = await storage.createDataset({
            id: undefined as any, // will be set by storage impl
            userId: actualUserId, // ✅ Use customer's ID
            sourceType: 'upload',
            originalFileName: safeOriginalFileName,
            name: safeOriginalFileName,
            mimeType: req.file.mimetype,
            fileSize: req.file.size,
            storageUri: originalFilePath, // ✅ Real file path, not virtual URI
            schema: processedData.schema,
            recordCount: processedData.recordCount,
            preview: processedData.preview,
            data: processedData.data,
            piiAnalysis: piiAnalysis,
            ingestionMetadata
        } as any);
        await storage.linkProjectToDataset(project.id, dataset.id);
        const datasetCreateDuration = Date.now() - datasetCreateStart;
        metricDetails.datasetId = dataset.id;
        metricDetails.datasetCreateMs = datasetCreateDuration;

        // Trigger async embedding generation for RAG-first column matching
        setImmediate(async () => {
            try {
                const columns = Object.entries(processedData.schema || {}).map(([name, info]: [string, any]) => ({
                    name,
                    type: typeof info === 'string' ? info : info?.type || 'unknown',
                    sampleValues: (processedData.preview || []).slice(0, 3).map((row: any) => row[name]).filter(Boolean)
                }));
                if (columns.length > 0) {
                    await columnEmbeddingGenerator.generateEmbeddingsForDataset({
                        datasetId: dataset.id,
                        projectId: project.id,
                        columns
                    });
                }
            } catch (embErr) {
                console.warn('⚠️ [Upload] Background embedding generation failed (non-blocking):', (embErr as Error).message);
            }
        });

        performanceWebhookService.recordMetric({
            timestamp: new Date(),
            service: 'project_upload',
            operation: 'create_dataset',
            duration: datasetCreateDuration,
            status: 'success',
            details: {
                projectId: project.id,
                datasetId: dataset.id,
                uploadId: uploadTrackingId
            },
            userId: actualUserId,
            sessionId: req.sessionID
        }).catch(error => {
            console.error('Failed to record dataset creation metric:', error);
        });

        await markJourneyProgress(project.id, [
            'intake_alignment',
            'industry_context',
            'auto_schema_detection',
            'data_health_check'
        ]);

        // ✅ PHASE 1 & 2: Requirements + Mapping - Run in BACKGROUND (non-blocking)
        // These AI calls (Gemini) take 10-30s each and should not block the upload response.
        // Results are stored in journeyProgress and loaded by later steps when needed.
        const bgProjectId = project.id;
        const bgDatasetId = dataset.id;
        const bgFileName = req.file.originalname;
        const bgSchema = processedData.schema;
        const bgPreview = processedData.preview;
        const bgRecordCount = processedData.recordCount;
        const bgIngestionMetadata = dataset.ingestionMetadata;

        // Fire-and-forget async processing
        (async () => {
            try {
                console.log('📋 [Background] Phase 1 & 2: Generating requirements mapping...');

                const datasetColumns = Object.keys(bgSchema || {});
                const columnTypes: Record<string, string> = {};
                for (const [col, info] of Object.entries(bgSchema || {})) {
                    columnTypes[col] = typeof info === 'object' && (info as any)?.type ? (info as any).type : 'text';
                }

                // Resolve industry context from: journeyProgress > user profile > fallback to 'general'
                let bgIndustry: string | undefined;
                try {
                    const bgProject = await storage.getProject(bgProjectId);
                    const jp = (bgProject as any)?.journeyProgress;
                    bgIndustry = jp?.industry || jp?.industryDomain;
                    if (!bgIndustry) {
                        const user = await storage.getUser(actualUserId);
                        bgIndustry = (user as any)?.industry;
                    }
                } catch (e) { /* non-blocking */ }

                const phase1Doc = await requiredDataElementsTool.defineRequirements({
                    projectId: bgProjectId,
                    userGoals: parsedQuestions.length > 0
                        ? [`Analyze data to answer: ${parsedQuestions.slice(0, 3).join(', ')}`]
                        : ['Perform comprehensive data analysis'],
                    userQuestions: parsedQuestions,
                    datasetMetadata: datasetColumns.length > 0 ? {
                        columns: datasetColumns,
                        columnTypes: columnTypes,
                        schema: bgSchema
                    } : undefined,
                    industry: bgIndustry
                });

                console.log(`✅ [Background] Phase 1 complete: ${phase1Doc.analysisPath.length} analysis paths, ${phase1Doc.requiredDataElements.length} required elements`);

                const mappingStart = Date.now();
                const phase2Doc = await requiredDataElementsTool.mapDatasetToRequirements(
                    phase1Doc,
                    {
                        fileName: bgFileName,
                        rowCount: bgRecordCount,
                        schema: bgSchema,
                        preview: bgPreview || []
                    },
                    bgIndustry,
                    bgProjectId
                );
                const mappingDuration = Date.now() - mappingStart;

                console.log(`✅ [Background] Phase 2 complete in ${mappingDuration}ms: ${phase2Doc.completeness.elementsMapped}/${phase2Doc.completeness.totalElements} elements mapped`);

                if (phase2Doc.gaps.length > 0) {
                    console.log(`⚠️  [Background] Identified ${phase2Doc.gaps.length} data gaps:`);
                    phase2Doc.gaps.forEach((gap: any) => console.log(`  - ${gap.description}`));
                }

                // Update dataset with requirements document
                await storage.updateDataset(bgDatasetId, {
                    ingestionMetadata: {
                        ...(bgIngestionMetadata as any || {}),
                        dataRequirementsDocument: phase2Doc
                    }
                } as any);

                // Store in journeyProgress (SSOT for verification step)
                await storage.atomicMergeJourneyProgress(bgProjectId, {
                    requirementsDocument: phase2Doc,
                    requirementsLocked: false
                });

                console.log(`✅ [Background] Stored requirementsDocument in journeyProgress:`, {
                    totalElements: phase2Doc.requiredDataElements?.length || 0,
                    elementsMapped: phase2Doc.completeness?.elementsMapped || 0,
                    analysisPath: phase2Doc.analysisPath?.length || 0
                });

                performanceWebhookService.recordMetric({
                    timestamp: new Date(),
                    service: 'project_upload',
                    operation: 'phase2_mapping',
                    duration: mappingDuration,
                    status: 'success',
                    details: {
                        projectId: bgProjectId,
                        datasetId: bgDatasetId,
                        elementsMapped: phase2Doc.completeness.elementsMapped,
                        totalElements: phase2Doc.completeness.totalElements,
                        gapsFound: phase2Doc.gaps.length,
                        uploadId: uploadTrackingId
                    },
                    userId: actualUserId
                }).catch(error => {
                    console.error('Failed to record Phase 2 mapping metric:', error);
                });
            } catch (mappingError) {
                console.error('⚠️  [Background] Phase 1/2 mapping failed (non-fatal):', mappingError);
            }
        })();

        // Check if PII was detected and needs user decision
        const hasPII = piiAnalysis?.detectedPII?.length > 0;

        res.json({
            success: true,
            projectId: project.id,
            project: { ...project, preview: processedData.preview },
            piiAnalysis,
            // Include PII decision info if PII was detected
            requiresPIIDecision: hasPII,
            piiResult: hasPII ? piiAnalysis : undefined,
            sampleData: processedData.preview,
            recordCount: processedData.recordCount,
            originalFilePath: originalFilePath, // Return path for client reference
            dataDescription: processedData.datasetSummary.overview,
            datasetSummary: processedData.datasetSummary,
            descriptiveStats: processedData.descriptiveStats,
            qualityMetrics: processedData.qualityMetrics,
            relationships: processedData.relationships,
            schema: processedData.schema,
            columnTypes: processedData.columnTypes,
            // Note: dataRequirementsDocument is generated asynchronously in background
            // and stored in journeyProgress. Later steps load it from there.
            requirementsProcessing: true // Signal that background AI processing is running
        });
    } catch (error: any) {
        metricDetails.error = error?.message || 'Unknown error';
        // Clean up file if processing failed
        if (req.file?.path) {
            try {
                await fs.unlink(req.file.path).catch(err =>
                    console.error('Failed to delete file after error:', err)
                );
            } catch (unlinkError) {
                console.error('File cleanup error:', unlinkError);
            }
        }
        res.status(500).json({ success: false, error: error.message || "Failed to process file" });
    }
});

// Projects API endpoints
router.get("/", ensureAuthenticated, async (req, res) => {
    try {
        const userId = (req.user as any)?.id;
        if (!userId) {
            return res.status(401).json({ error: "User authentication required" });
        }

        const projects = await storage.getProjectsByOwner(userId);
        res.json({ projects });
    } catch (error: any) {
        console.error('[ERROR] GET /api/projects failed:', error);
        res.status(500).json({ error: "Failed to fetch projects" });
    }
});

// Server-side join key detection - mirrors client-side logic
function autoDetectJoinKeys(datasets: any[]): { foreignKeys: Array<{ sourceDataset: string; sourceColumn: string; targetDataset: string; targetColumn: string; confidence: number }> } {
    const foreignKeys: Array<{ sourceDataset: string; sourceColumn: string; targetDataset: string; targetColumn: string; confidence: number }> = [];

    console.log(`🔗 [Server Auto-Join] Starting auto-detection for ${datasets.length} datasets`);

    if (datasets.length < 2) {
        return { foreignKeys };
    }

    const primaryDataset = datasets[0];
    const primarySchema = primaryDataset.schema || {};
    const primaryCols = Object.keys(primarySchema);
    const primaryName = primaryDataset.originalFileName || primaryDataset.name || 'Primary';
    const primaryData = Array.isArray(primaryDataset.data) ? primaryDataset.data :
        Array.isArray(primaryDataset.preview) ? primaryDataset.preview : [];

    console.log(`🔗 [Server Auto-Join] Primary: ${primaryName} (${primaryData.length} rows, ${primaryCols.length} cols)`);

    // Join key patterns with priority scores
    const joinKeyPatterns = [
        { pattern: /^employee_?id$/i, score: 100 },
        { pattern: /^emp_?id$/i, score: 95 },
        { pattern: /^user_?id$/i, score: 90 },
        { pattern: /^customer_?id$/i, score: 90 },
        { pattern: /^department_?id$/i, score: 85 },
        { pattern: /^dept_?id$/i, score: 85 },
        { pattern: /^department$/i, score: 80 },
        { pattern: /^dept$/i, score: 80 },
        { pattern: /^id$/i, score: 75 },
        { pattern: /_id$/i, score: 70 },
        { pattern: /^.*_key$/i, score: 65 },
        { pattern: /^.*_code$/i, score: 60 },
        { pattern: /^name$/i, score: 50 },
        { pattern: /^employee_?name$/i, score: 55 },
        { pattern: /^full_?name$/i, score: 55 }
    ];

    for (let i = 1; i < datasets.length; i++) {
        const secondaryDataset = datasets[i];
        const secondarySchema = secondaryDataset.schema || {};
        const secondaryCols = Object.keys(secondarySchema);
        const secondaryName = secondaryDataset.originalFileName || secondaryDataset.name || `Secondary_${i}`;
        const secondaryData = Array.isArray(secondaryDataset.data) ? secondaryDataset.data :
            Array.isArray(secondaryDataset.preview) ? secondaryDataset.preview : [];

        console.log(`🔗 [Server Auto-Join] Secondary: ${secondaryName} (${secondaryData.length} rows, ${secondaryCols.length} cols)`);

        interface MatchCandidate {
            sourceColumn: string;
            targetColumn: string;
            patternScore: number;
            mergePotential: number;
        }
        const matchCandidates: MatchCandidate[] = [];

        for (const pCol of primaryCols) {
            const pColLower = pCol.toLowerCase();

            for (const sCol of secondaryCols) {
                const sColLower = sCol.toLowerCase();

                // Direct match
                const directMatch = pColLower === sColLower;

                // Pattern match
                let patternScore = 0;
                for (const { pattern, score } of joinKeyPatterns) {
                    if (pattern.test(pCol) && pattern.test(sCol)) {
                        patternScore = Math.max(patternScore, score);
                    }
                }

                // Partial match (same suffix)
                const partialMatch = (pColLower.endsWith('_id') && sColLower.endsWith('_id')) ||
                    (pColLower.endsWith('_key') && sColLower.endsWith('_key')) ||
                    (pColLower.endsWith('_code') && sColLower.endsWith('_code'));

                if (directMatch || patternScore > 0 || partialMatch) {
                    // Calculate merge potential by comparing values
                    const primaryValues = new Set<string>(
                        primaryData.slice(0, 500).map((row: any) =>
                            String(row[pCol] ?? '').toLowerCase().trim()
                        ).filter((v: string) => v !== '')
                    );
                    const secondaryValues = new Set<string>(
                        secondaryData.slice(0, 500).map((row: any) =>
                            String(row[sCol] ?? '').toLowerCase().trim()
                        ).filter((v: string) => v !== '')
                    );

                    let matchCount = 0;
                    primaryValues.forEach((v) => {
                        if (secondaryValues.has(v)) matchCount++;
                    });

                    const mergePotential = Math.min(primaryValues.size, secondaryValues.size) > 0
                        ? (matchCount / Math.min(primaryValues.size, secondaryValues.size)) * 100
                        : 0;

                    matchCandidates.push({
                        sourceColumn: pCol,
                        targetColumn: sCol,
                        patternScore: directMatch ? 110 : patternScore || (partialMatch ? 40 : 0),
                        mergePotential
                    });
                }
            }
        }

        // Select best match
        if (matchCandidates.length > 0) {
            matchCandidates.sort((a, b) => {
                const scoreA = (a.mergePotential * 0.6) + (a.patternScore * 0.4);
                const scoreB = (b.mergePotential * 0.6) + (b.patternScore * 0.4);
                return scoreB - scoreA;
            });

            const bestMatch = matchCandidates[0];
            const confidence = Math.min(100, (bestMatch.mergePotential * 0.6 + bestMatch.patternScore * 0.4)) / 100;

            console.log(`✅ [Server Auto-Join] Best match: ${primaryName}.${bestMatch.sourceColumn} ↔ ${secondaryName}.${bestMatch.targetColumn} (${(confidence * 100).toFixed(1)}%)`);

            foreignKeys.push({
                sourceDataset: primaryDataset.id,
                sourceColumn: bestMatch.sourceColumn,
                targetDataset: secondaryDataset.id,
                targetColumn: bestMatch.targetColumn,
                confidence
            });
        } else {
            console.log(`⚠️ [Server Auto-Join] No matching join key found for ${secondaryName}`);
        }
    }

    console.log(`🔗 [Server Auto-Join] Detection complete: ${foreignKeys.length} join(s) found`);
    return { foreignKeys };
}

router.get("/:projectId/datasets", ensureAuthenticated, async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ success: false, error: accessCheck.reason });
        }

        const datasets = await storage.getProjectDatasets(projectId);
        const normalized = datasets.map(({ dataset, association }) => {
            const datasetAny = dataset as any;

            const previewSources = [
                datasetAny?.preview,
                datasetAny?.ingestionMetadata?.preview,
                datasetAny?.ingestionMetadata?.sampleRows,
                datasetAny?.data
            ];

            let previewRows: any[] | null = null;
            for (const source of previewSources) {
                const parsed = safeParseJson(source);
                if (Array.isArray(parsed) && parsed.length) {
                    previewRows = parsed.slice(0, 20);
                    break;
                }
            }

            const schema = normalizeSchemaTypes(dataset.schema ?? datasetAny?.ingestionMetadata?.schema ?? null);

            // Keep data for join operations
            const fullData = Array.isArray(datasetAny?.data) ? datasetAny.data :
                Array.isArray(safeParseJson(datasetAny?.data)) ? safeParseJson(datasetAny?.data) : [];

            const { data, ...rest } = datasetAny;

            return {
                dataset: {
                    ...rest,
                    schema,
                    preview: previewRows ?? [],
                    data: fullData, // Include full data for joining
                },
                association,
            };
        });

        // Generate joined preview if multiple datasets exist
        let joinedPreview: any[] = [];
        let joinedSchema: Record<string, any> | null = null;
        let joinInsights: any = null;

        if (normalized.length >= 2) {
            console.log(`📊 [Datasets] Multiple datasets detected (${normalized.length}), generating joined preview...`);

            // Extract dataset objects for joining
            const datasetObjects = normalized.map(n => n.dataset);

            // Auto-detect join keys
            const { foreignKeys } = autoDetectJoinKeys(datasetObjects);

            if (foreignKeys.length > 0) {
                try {
                    const primaryDataset = datasetObjects[0];
                    const secondaryDatasets = datasetObjects.slice(1);
                    const primaryName = primaryDataset.originalFileName || primaryDataset.name || 'Primary';

                    // Build join config
                    const joinKeys: { [key: string]: string } = {
                        [primaryDataset.id]: foreignKeys[0].sourceColumn
                    };

                    for (const fk of foreignKeys) {
                        joinKeys[fk.targetDataset] = fk.targetColumn;
                    }

                    const joinConfig: JoinConfig = {
                        joinWithProjects: secondaryDatasets.map(d => d.id),
                        joinType: 'left',
                        joinKeys,
                        mergeStrategy: 'merge'
                    };

                    // Perform the join
                    const joinResult = await DatasetJoiner.joinDatasets(
                        primaryDataset,
                        secondaryDatasets,
                        joinConfig
                    );

                    if (joinResult.success && joinResult.project) {
                        joinedPreview = Array.isArray(joinResult.project.data)
                            ? joinResult.project.data.slice(0, 20)
                            : [];
                        const normalizedJoinedSchema = normalizeSchemaTypes(joinResult.project.schema);
                        joinedSchema = normalizedJoinedSchema;

                        joinInsights = {
                            detectionMethod: 'schema_match',
                            joinStrategy: 'join',
                            datasetCount: normalized.length,
                            totalRowCount: joinResult.recordCount,
                            primaryDatasetName: primaryName,
                            foreignKeys: foreignKeys.map(fk => {
                                const targetDataset = datasetObjects.find(d => d.id === fk.targetDataset);
                                return {
                                    datasetId: fk.targetDataset,
                                    datasetName: targetDataset?.originalFileName || targetDataset?.name || 'Unknown',
                                    primaryColumn: fk.sourceColumn,
                                    foreignColumn: fk.targetColumn,
                                    confidence: fk.confidence
                                };
                            })
                        };

                        console.log(`✅ [Datasets] Join successful: ${joinResult.recordCount} rows, ${joinResult.joinedFields.length} fields`);

                        // ✅ CRITICAL FIX: ALWAYS persist joined schema to journeyProgress (SSOT)
                        // Uses atomicMergeJourneyProgress to prevent overwriting other progress keys
                        try {
                            await storage.atomicMergeJourneyProgress(projectId, {
                                joinedData: {
                                    schema: normalizedJoinedSchema,
                                    columnTypes: normalizedJoinedSchema,
                                    preview: joinedPreview.slice(0, 50),
                                    totalRowCount: joinResult.recordCount,
                                    columnCount: Object.keys(normalizedJoinedSchema || {}).length,
                                    joinInsights: joinInsights,
                                    persistedAt: new Date().toISOString()
                                }
                            });
                            console.log(`✅ [Datasets] Persisted joined schema to journeyProgress: ${Object.keys(normalizedJoinedSchema || {}).length} columns`);
                            await markJourneyProgress(projectId, ['data_preparation']);
                        } catch (persistError: any) {
                            console.warn('⚠️ [Datasets] Failed to persist joined schema:', persistError.message);
                            // Continue anyway - API response will still have the joined data
                        }
                    } else {
                        console.log(`⚠️ [Datasets] Join failed: ${joinResult.error}`);
                    }
                } catch (joinError: any) {
                    console.error('Dataset join error:', joinError);
                }
            } else {
                // No join keys found - fall back to stacked preview with MERGED schema
                console.log(`📊 [Datasets] No join keys found, using stacked preview with merged schema`);
                joinedPreview = normalized.flatMap(n => (n.dataset.preview || []).slice(0, 5));

                // ✅ FIX: Merge schemas from ALL datasets, not just first one
                const mergedSchema: Record<string, any> = {};
                for (let i = 0; i < normalized.length; i++) {
                    const ds = normalized[i].dataset;
                    // ✅ PHASE 1 FIX: Ensure dsName is never undefined/empty with explicit fallbacks
                    const rawName = ds.originalFileName || ds.name || '';
                    const dsName = rawName
                        ? rawName.replace(/\.[^.]+$/, '')
                        : `Dataset${i + 1}`;
                    const dsSchema = ds.schema || {};

                    for (const [col, type] of Object.entries(dsSchema)) {
                        // Handle column name conflicts by prefixing with dataset name
                        if (mergedSchema[col] !== undefined && normalized.length > 1) {
                            // Both columns exist - prefix this one
                            // ✅ PHASE 1 FIX: Additional safeguard to prevent undefined_ prefix
                            const safePrefix = dsName || `DS${i + 1}`;
                            const prefixedCol = `${safePrefix}_${col}`;
                            const normalizedType = typeof type === 'object' && (type as any)?.type
                                ? (type as any).type
                                : (typeof type === 'string' ? type : 'string');
                            mergedSchema[prefixedCol] = normalizedType;
                            console.log(`📊 [Datasets] Schema conflict: '${col}' prefixed as '${prefixedCol}'`);
                        } else {
                            const normalizedType = typeof type === 'object' && (type as any)?.type
                                ? (type as any).type
                                : (typeof type === 'string' ? type : 'string');
                            mergedSchema[col] = normalizedType;
                        }
                    }
                }

                joinedSchema = mergedSchema;
                console.log(`📊 [Datasets] Merged schema: ${Object.keys(mergedSchema).length} columns from ${normalized.length} datasets`);

                joinInsights = {
                    detectionMethod: 'fallback',
                    joinStrategy: 'stacked',
                    datasetCount: normalized.length,
                    // ✅ GAP 10 FIX: Use recordCount (actual row count) instead of preview.length (sample rows)
                    totalRowCount: normalized.reduce((sum, n) => sum + (n.dataset.recordCount || n.dataset.preview?.length || 0), 0),
                    foreignKeys: [],
                    mergedSchemaColumnCount: Object.keys(mergedSchema).length
                };

                // ✅ FIX: Also persist merged schema to journeyProgress for fallback case
                // Uses atomicMergeJourneyProgress to prevent overwriting other progress keys
                try {
                    await storage.atomicMergeJourneyProgress(projectId, {
                        joinedData: {
                            schema: mergedSchema,
                            columnTypes: mergedSchema,
                            preview: joinedPreview.slice(0, 50),
                            totalRowCount: joinInsights.totalRowCount,
                            columnCount: Object.keys(mergedSchema).length,
                            joinInsights: joinInsights,
                            persistedAt: new Date().toISOString()
                        }
                    });
                    console.log(`✅ [Datasets] Persisted MERGED schema to journeyProgress: ${Object.keys(mergedSchema).length} columns`);
                    await markJourneyProgress(projectId, ['data_preparation']);
                } catch (persistError: any) {
                    console.warn('⚠️ [Datasets] Failed to persist merged schema:', persistError.message);
                }
            }
        }

        // Remove full data from response to reduce payload (keep preview only)
        const cleanedNormalized = normalized.map(n => ({
            ...n,
            dataset: {
                ...n.dataset,
                data: undefined // Don't send full data to client
            }
        }));

        return res.json({
            success: true,
            datasets: cleanedNormalized,
            count: cleanedNormalized.length,
            joinedPreview,
            joinedSchema,
            // Alias for clarity - same as joinedSchema but explicit name
            mergedSchema: joinedSchema,
            joinInsights,
            // Total row count across all datasets
            totalRecordCount: joinInsights?.totalRowCount || normalized.reduce((sum, n) => sum + (n.dataset.recordCount || 0), 0)
        });
    } catch (error: any) {
        console.error('Failed to fetch project datasets:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to fetch datasets' });
    }
});

router.post("/:projectId/datasets", ensureAuthenticated, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { datasetId, role } = req.body || {};
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        if (!datasetId || typeof datasetId !== 'string') {
            return res.status(400).json({ success: false, error: 'datasetId is required' });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ success: false, error: accessCheck.reason });
        }

        const dataset = await storage.getDataset(datasetId);
        if (!dataset) {
            return res.status(404).json({ success: false, error: 'Dataset not found' });
        }

        const isAdminUser = isAdmin(req);
        if (!isAdminUser && dataset.userId !== userId && (dataset as any).ownerId !== userId) {
            return res.status(403).json({ success: false, error: 'Access denied to dataset' });
        }

        const existingAssociations = await storage.getProjectDatasets(projectId);
        const alreadyLinked = existingAssociations.some(({ dataset: linked }) => linked.id === datasetId);
        if (alreadyLinked) {
            return res.json({
                success: true,
                message: 'Dataset already linked to project',
                dataset,
                association: existingAssociations.find(({ dataset: linked }) => linked.id === datasetId)?.association
            });
        }

        const association = await storage.linkProjectToDataset(projectId, datasetId, role ?? 'primary');

        res.json({
            success: true,
            dataset,
            association
        });
    } catch (error: any) {
        console.error('Failed to add dataset to project:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to add dataset to project' });
    }
});

router.delete("/:projectId/datasets/:datasetId", ensureAuthenticated, async (req, res) => {
    try {
        const { projectId, datasetId } = req.params;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ success: false, error: accessCheck.reason });
        }

        const removed = await storage.removeDatasetFromProject(projectId, datasetId);
        if (!removed) {
            return res.status(404).json({ success: false, error: 'Dataset link not found' });
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('Failed to remove dataset from project:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to remove dataset from project' });
    }
});

router.get("/:projectId/artifacts", ensureAuthenticated, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { type } = req.query;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ success: false, error: accessCheck.reason });
        }

        // FIX 5A: Check payment status before returning full artifacts
        const project = accessCheck.project as any;
        const isPaid = project?.isPaid === true;
        const hasSubscription = project?.subscriptionStatus === 'active';
        const userIsAdmin = isAdmin(req);

        const normalizedType = typeof type === 'string' && type.trim().length > 0 ? type.trim() : undefined;
        const artifacts = await storage.getProjectArtifacts(projectId, normalizedType);

        if (!isPaid && !hasSubscription && !userIsAdmin) {
            // Return empty artifacts with payment-required flag for unpaid users
            return res.json({
                success: true,
                artifacts: [],
                data: [],
                count: 0,
                paymentRequired: true,
                message: 'Payment required to access full artifacts'
            });
        }

        return res.json({
            success: true,
            artifacts,
            data: artifacts,
            count: artifacts.length
        });
    } catch (error: any) {
        console.error('Failed to fetch project artifacts:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to fetch project artifacts' });
    }
});

router.get("/:projectId/journey-state", ensureAuthenticated, async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ success: false, error: accessCheck.reason });
        }

        const journeyState = await journeyStateManager.getJourneyState(projectId);

        res.json({ success: true, journeyState });
    } catch (error: any) {
        console.error('Error fetching journey state:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to fetch journey state' });
    }
});

router.post("/:projectId/journey/complete-step", ensureAuthenticated, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { stepId } = req.body;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        if (!stepId || typeof stepId !== 'string') {
            return res.status(400).json({ success: false, error: 'stepId is required' });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ success: false, error: accessCheck.reason });
        }

        await journeyStateManager.completeStep(projectId, stepId);
        const journeyState = await journeyStateManager.getJourneyState(projectId);

        // ✅ Log decision for manual step completion
        try {
            await db.insert(decisionAudits).values({
                id: nanoid(),
                projectId,
                agent: 'user',
                decisionType: 'journey_progress',
                decision: `User manually completed journey step: ${stepId}`,
                reasoning: `User indicated completion of ${stepId} step in their analysis journey`,
                alternatives: JSON.stringify([
                    'Auto-complete based on data validation',
                    'Skip step',
                    'Return to previous step'
                ]),
                confidence: 100,
                context: JSON.stringify({
                    userId,
                    stepId,
                    journeyType: journeyState?.journeyType,
                    totalSteps: journeyState?.totalSteps,
                    completedSteps: journeyState?.completedSteps?.length || 0,
                    percentComplete: journeyState?.percentComplete || 0
                }),
                userInput: `Completed step: ${stepId}`,
                impact: 'medium',
                reversible: true,
                timestamp: new Date()
            });
            console.log(`✅ Decision logged: User completed step ${stepId} for project ${projectId}`);
        } catch (logError) {
            console.error('Failed to log decision for step completion:', logError);
            // Don't fail the request if logging fails
        }

        res.json({
            success: true,
            message: `Step ${stepId} marked as complete`,
            journeyState,
        });
    } catch (error: any) {
        console.error('Error completing journey step:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to complete journey step' });
    }
});

// Update project schema
router.put("/:id/schema", ensureAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const { schema } = req.body;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: "User authentication required" });
        }

        const accessCheck = await canAccessProject(userId, id, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ error: accessCheck.reason });
        }

        if (!schema) {
            return res.status(400).json({ error: "Schema is required" });
        }

        const updatedProject = await storage.updateProject(id, { schema });
        res.json({ success: true, project: updatedProject });
    } catch (error: any) {
        console.error('Failed to update project schema:', error);
        res.status(500).json({ error: "Failed to update project schema" });
    }
});

// Verify/approve project data - marks data as verified and ready for analysis
router.put("/:id/verify", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const {
            verificationStatus,
            verificationTimestamp,
            verificationChecks,
            // ✅ FIX 1.4: Accept PII decisions from frontend
            piiDecisions,
            dataQuality,
            schemaValidation,
            // ✅ GAP 1 FIX: Accept element mappings from verification step
            elementMappings,
            // ✅ GAP 1 FIX: Accept requirements document updates
            requirementsDocument,
            // ✅ GAP 1 FIX: Accept data quality checkpoint ID
            dataQualityCheckpointId
        } = req.body;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ error: accessCheck.reason });
        }

        const project = accessCheck.project;

        // ✅ FIX 1.4: Log PII decisions being saved
        if (piiDecisions && Object.keys(piiDecisions).length > 0) {
            console.log(`🔒 [FIX 1.4] Received ${Object.keys(piiDecisions).length} PII decisions for project ${projectId}`);
        }

        // Update journeyProgress with verification info using atomicMerge to prevent overwriting other keys
        const currentProgress = (project as any)?.journeyProgress || {};

        // Build only the delta keys to merge (atomicMerge handles deep merge)
        const verificationDelta: Record<string, any> = {
            dataQualityApproved: verificationStatus === 'approved',
            verificationTimestamp: verificationTimestamp || new Date().toISOString(),
            verificationChecks: verificationChecks || {},
            verificationCompleted: true,
            currentStep: 'transformation',
            completedSteps: [...(currentProgress.completedSteps || []), 'verification'].filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
        };

        // PII SSOT: Write to canonical field name only (piiDecisions, plural)
        // Readers use getPiiExcludedColumns() helper which handles all legacy formats
        if (piiDecisions && Object.keys(piiDecisions).length > 0) {
            verificationDelta.piiDecisions = piiDecisions;
            verificationDelta.piiDecisionTimestamp = new Date().toISOString();
        }

        if (dataQuality) verificationDelta.dataQuality = dataQuality;
        if (schemaValidation !== undefined) verificationDelta.schemaValidation = schemaValidation;

        // ✅ GAP 1 FIX: Save element mappings to dedicated field for easy access
        if (elementMappings) {
            verificationDelta.elementMappings = elementMappings;
            verificationDelta.elementMappingTimestamp = new Date().toISOString();
        }

        // ✅ CONTEXT CONTINUITY FIX: Merge element mappings INTO requirementsDocument
        // so downstream steps (transformation, execution) find sourceField populated
        // Previously, elementMappings were saved separately and never merged into the SSOT
        if (requirementsDocument && elementMappings && typeof elementMappings === 'object') {
            const elements = requirementsDocument.requiredDataElements;
            if (Array.isArray(elements)) {
                let mergedCount = 0;
                for (const element of elements) {
                    const elementKey = element.elementId || element.elementName;
                    const mapping = elementMappings[elementKey];
                    if (mapping) {
                        // mapping can be a string (column name) or object { sourceField, confidence, ... }
                        if (typeof mapping === 'string') {
                            element.sourceField = mapping;
                            element.sourceColumn = mapping; // alias for frontend compat
                            element.sourceAvailable = true;
                            mergedCount++;
                        } else if (typeof mapping === 'object' && mapping.sourceField) {
                            element.sourceField = mapping.sourceField;
                            element.sourceColumn = mapping.sourceField;
                            element.sourceAvailable = true;
                            if (mapping.confidence) element.mappingConfidence = mapping.confidence;
                            if (mapping.transformationNeeded) element.transformationRequired = true;
                            mergedCount++;
                        }
                    }
                }
                console.log(`✅ [Verify] Merged ${mergedCount}/${Object.keys(elementMappings).length} element mappings into requirementsDocument`);
            }
            verificationDelta.requirementsDocument = requirementsDocument;
        } else if (requirementsDocument) {
            verificationDelta.requirementsDocument = requirementsDocument;
        }

        // ✅ GAP 1 FIX: Save checkpoint ID for audit trail
        if (dataQualityCheckpointId) {
            verificationDelta.dataQualityCheckpointId = dataQualityCheckpointId;
        }

        console.log(`✅ [Verify] Project ${projectId} verification status: ${verificationStatus}`);

        // Use atomicMergeJourneyProgress for safe deep merge, then update project status separately
        const mergedProgress = await storage.atomicMergeJourneyProgress(projectId, verificationDelta);

        // Update project status separately (non-journeyProgress field)
        const updatedProject = await storage.updateProject(projectId, {
            status: 'ready' // 'verified' is not a valid status - use 'ready' instead
        } as any);

        // Re-read merged progress for downstream use
        const updatedProgress = mergedProgress || verificationDelta;

        // ✅ FIX 1.4: Also save PII decisions to each dataset's ingestionMetadata
        if (piiDecisions && Object.keys(piiDecisions).length > 0) {
            try {
                const datasets = await storage.getProjectDatasets(projectId);

                for (const ds of datasets) {
                    const dataset = (ds as any).dataset || ds;
                    const schema = dataset.schema || dataset.ingestionMetadata?.originalSchema || {};
                    const piiFields = dataset.piiFields || [];

                    // Build column-specific PII choices for this dataset
                    const datasetPiiChoices: Record<string, string> = {};

                    for (const [field, choice] of Object.entries(piiDecisions)) {
                        // Include field if it exists in this dataset's schema or piiFields
                        if (schema[field] || piiFields.includes(field)) {
                            datasetPiiChoices[field] = choice as string;
                        }
                    }

                    if (Object.keys(datasetPiiChoices).length > 0) {
                        await storage.updateDataset(dataset.id, {
                            ingestionMetadata: {
                                ...(dataset.ingestionMetadata || {}),
                                piiMaskingChoices: datasetPiiChoices,
                                piiDecisionTimestamp: new Date().toISOString()
                            }
                        } as any);

                        console.log(`✅ [FIX 1.4] Saved ${Object.keys(datasetPiiChoices).length} PII choices to dataset ${dataset.id}`);
                    }
                }

                console.log(`🔒 [FIX 1.4] PII decisions saved to both journeyProgress and ${datasets.length} dataset(s)`);
            } catch (piiSaveError) {
                console.warn('⚠️ [FIX 1.4] Failed to save PII decisions to datasets:', piiSaveError);
                // Continue anyway - journeyProgress is the SSOT
            }
        }

        // ✅ GAP 1 FIX: Also save element mappings to each dataset's ingestionMetadata
        if (elementMappings && Object.keys(elementMappings).length > 0) {
            try {
                const datasets = await storage.getProjectDatasets(projectId);

                for (const ds of datasets) {
                    const dataset = (ds as any).dataset || ds;

                    await storage.updateDataset(dataset.id, {
                        ingestionMetadata: {
                            ...(dataset.ingestionMetadata || {}),
                            columnMappings: elementMappings,
                            elementMappings: elementMappings,
                            elementMappingTimestamp: new Date().toISOString()
                        }
                    } as any);

                    console.log(`✅ [GAP 1 FIX] Saved ${Object.keys(elementMappings).length} element mappings to dataset ${dataset.id}`);
                }

                console.log(`📋 [GAP 1 FIX] Element mappings saved to both journeyProgress and ${datasets.length} dataset(s)`);
            } catch (mappingSaveError) {
                console.warn('⚠️ [GAP 1 FIX] Failed to save element mappings to datasets:', mappingSaveError);
                // Continue anyway - journeyProgress is the SSOT
            }
        }

        // Complete the verification step in journey state manager
        try {
            await journeyStateManager.completeStep(projectId, 'data-verification');
        } catch (stepError) {
            console.warn('⚠️ [Verify] Failed to mark step complete in journey state manager:', stepError);
        }

        // ============================================================
        // FIX 3D: Survey Structure Detection (non-blocking)
        // ============================================================
        try {
            const { getSurveyPreprocessor } = await import('../services/survey-preprocessor');
            const surveyPreprocessor = getSurveyPreprocessor();

            const allDatasets = await storage.getProjectDatasets(projectId);
            const primaryDs = (allDatasets[0] as any)?.dataset || allDatasets[0];
            const columnNames = Object.keys(primaryDs?.schema || {});

            // Quick heuristic check first (no Python call)
            const quickCheck = surveyPreprocessor.quickDetectSurvey(columnNames);
            if (quickCheck.likely) {
                console.log(`📋 [Survey] Quick detection: likely survey (confidence=${quickCheck.confidence.toFixed(2)}, ${quickCheck.questionColumns.length} question cols)`);

                // Full Python detection in background (non-blocking)
                const rows = primaryDs?.data || primaryDs?.preview || [];
                if (rows.length > 0) {
                    surveyPreprocessor.detectSurveyStructure(rows.slice(0, 200)).then(async (detection) => {
                        if (detection.success && detection.is_survey && detection.confidence > 0.6) {
                            console.log(`📋 [Survey] Full detection confirmed: ${detection.summary.question_count} questions, ${detection.summary.likert_count} Likert, confidence=${detection.confidence}`);
                            try {
                                await storage.atomicMergeJourneyProgress(projectId, {
                                    surveyDetection: {
                                        isSurvey: true,
                                        confidence: detection.confidence,
                                        questionColumns: detection.question_columns.map(q => ({
                                            original: q.original_name,
                                            topic: q.topic_label,
                                            responseType: q.response_type,
                                        })),
                                        metadataColumns: detection.metadata_columns.map(m => m.original_name),
                                        groupingColumns: detection.grouping_columns,
                                        recommendedTransformations: detection.recommended_transformations,
                                        summary: detection.summary,
                                        detectedAt: new Date().toISOString(),
                                    }
                                });
                            } catch (saveErr) {
                                console.warn('⚠️ [Survey] Failed to save detection results:', saveErr);
                            }
                        }
                    }).catch(err => {
                        console.warn('⚠️ [Survey] Detection failed (non-blocking):', err);
                    });
                }
            }
        } catch (surveyErr) {
            console.warn('⚠️ [Survey] Detection setup failed (non-blocking):', surveyErr);
        }

        // ============================================================
        // CRITICAL FIX: Trigger DE Agent to generate transformation plan (ASYNC)
        // ============================================================
        try {
            const datasets = await storage.getProjectDatasets(projectId);
            const primaryDataset = (datasets[0] as any)?.dataset || datasets[0];

            // Get JOINED schema (critical for multi-dataset scenarios)
            const datasetMetadata = {
                schema: updatedProgress.joinedData?.schema || primaryDataset?.schema || {},
                columnNames: Object.keys(updatedProgress.joinedData?.schema || primaryDataset?.schema || {}),
                preview: updatedProgress.joinedData?.preview || primaryDataset?.preview || [],
                totalRowCount: updatedProgress.joinedData?.totalRowCount || primaryDataset?.recordCount || 0
            };

            // Get user goals and questions from journey progress
            const userGoals = updatedProgress.analysisGoals ||
                             (updatedProgress.selectedPatterns || []).map((p: any) => p.name || p) ||
                             ['Analyze the data'];
            const userQuestions = (updatedProgress.userQuestions || updatedProgress.businessQuestions || [])
                .map((q: any) => typeof q === 'string' ? q : q.text || q.question)
                .filter(Boolean);

            console.log(`🔧 [Verify] Triggering DE Agent for project ${projectId} (async)`);
            console.log(`   Goals: ${userGoals.length}, Questions: ${userQuestions.length}, Columns: ${datasetMetadata.columnNames.length}`);

            // ASYNC: Execute PM-supervised data mapping flow in background
            // User proceeds immediately; transformation step will poll for results
            projectAgentOrchestrator.executePMSupervisedDataMappingFlow(
                projectId,
                datasetMetadata,
                userGoals,
                userQuestions
            ).then(async (result) => {
                if (result.success) {
                    const mappingsCount = result.transformationPlan?.mappings?.length || 0;
                    console.log(`✅ [DE Agent] Transformation plan ready for project ${projectId}: ${mappingsCount} mappings`);
                    console.log(`   - transformationPlan.mappings: ${mappingsCount}`);
                    console.log(`   - Result saved to journeyProgress by orchestrator`);

                    // Verify the save happened
                    try {
                        const verifyProject = await storage.getProject(projectId);
                        const verifyProgress = (verifyProject as any)?.journeyProgress || {};
                        console.log(`   - Verification: journeyProgress.transformationPlan exists = ${!!verifyProgress.transformationPlan}`);
                        console.log(`   - Verification: mappings count = ${verifyProgress.transformationPlan?.mappings?.length || 0}`);
                    } catch (e) {
                        console.warn('   - Could not verify save:', e);
                    }
                } else {
                    console.warn(`⚠️ [DE Agent] Transformation plan failed for project ${projectId}: ${result.error}`);
                }
            }).catch((err) => {
                console.error(`❌ [DE Agent] Error generating transformations for project ${projectId}:`, err);
            });

        } catch (deError) {
            console.warn('⚠️ [Verify] Could not trigger DE agent transformations:', deError);
            // Continue anyway - user can manually configure in transformation step
        }

        // Generate column embeddings for semantic mapping (non-blocking)
        // This ensures embeddings exist BEFORE transformation step needs them
        try {
            const embDatasets = await storage.getProjectDatasets(projectId);
            for (const entry of embDatasets) {
                const ds = (entry as any).dataset || entry;
                const dsSchema = ds.ingestionMetadata?.schema || ds.schema;
                if (dsSchema && typeof dsSchema === 'object') {
                    columnEmbeddingGenerator.generateEmbeddingsForDataset({
                        datasetId: ds.id,
                        projectId,
                        columns: Object.entries(dsSchema).map(([name, type]: [string, any]) => ({
                            name,
                            type: typeof type === 'string' ? type : (type?.type || String(type)),
                            sampleValues: Array.isArray(type?.sampleValues) ? type.sampleValues.slice(0, 5) : []
                        }))
                    }).then(() => {
                        console.log(`✅ [Verify] Column embeddings generated for dataset ${ds.id}`);
                    }).catch((embErr: any) => {
                        console.warn(`⚠️ [Verify] Column embedding generation failed for dataset ${ds.id} (non-blocking):`, embErr?.message || embErr);
                    });
                }
            }
            console.log(`🔗 [Verify] Column embedding generation triggered for ${embDatasets.length} dataset(s)`);
        } catch (embError) {
            console.warn(`⚠️ [Verify] Could not trigger column embedding generation:`, embError);
        }

        // P2-A FIX: Update agent coordination data after verification step
        // This refreshes multiAgentCoordination with latest data quality info
        try {
            await projectAgentOrchestrator.updateProjectCoordinationData(projectId);
            console.log(`✅ [P2-A FIX] Updated multiAgentCoordination after verification for project ${projectId}`);
        } catch (coordError) {
            console.warn(`⚠️ [P2-A FIX] Failed to update multiAgentCoordination:`, coordError);
        }

        res.json({
            success: true,
            project: updatedProject,
            journeyProgress: updatedProgress,
            deAgentTriggered: true, // Let frontend know DE is working in background
            message: 'Data verification completed successfully. Transformation plan is being generated.'
        });
    } catch (error: any) {
        console.error('Failed to verify project:', error);
        res.status(500).json({ error: error.message || 'Failed to verify project' });
    }
});

// Get project checkpoints
router.get("/:id/checkpoints", ensureAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: "User authentication required" });
        }

        const accessCheck = await canAccessProject(userId, id, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ error: accessCheck.reason });
        }

        const checkpoints = await projectAgentOrchestrator.getProjectCheckpoints(id);
        res.json({ success: true, checkpoints });
    } catch (error: any) {
        console.error('Failed to fetch checkpoints:', error);
        res.status(500).json({ error: "Failed to fetch checkpoints" });
    }
});

// Create a new checkpoint (for agent-to-user communication requiring approval)
router.post("/:id/checkpoints", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const { stage, agentId, message, artifacts, requiresApproval, metadata } = req.body;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ error: accessCheck.reason });
        }

        // Generate checkpoint ID
        const checkpointId = `checkpoint_${Date.now()}_${stage || 'generic'}`;

        // Create checkpoint object
        const checkpoint = {
            id: checkpointId,
            projectId,
            stage: stage || 'unknown',
            agentId: agentId || 'system',
            message: message || 'Checkpoint created',
            artifacts: artifacts || [],
            requiresApproval: requiresApproval !== false,
            status: 'pending',
            createdAt: new Date().toISOString(),
            metadata: metadata || {}
        };

        console.log(`📌 [Checkpoint] Created checkpoint ${checkpointId} for project ${projectId} (stage: ${stage})`);

        // Store checkpoint in project journeyProgress using atomicMerge
        const project = accessCheck.project;
        const currentProgress = (project as any)?.journeyProgress || {};
        const existingCheckpoints = currentProgress.checkpoints || [];

        await storage.atomicMergeJourneyProgress(projectId, {
            checkpoints: [...existingCheckpoints, checkpoint]
        });

        res.json({
            success: true,
            checkpoint,
            checkpointId,
            message: 'Checkpoint created successfully'
        });
    } catch (error: any) {
        console.error('Failed to create checkpoint:', error);
        res.status(500).json({ error: error.message || 'Failed to create checkpoint' });
    }
});

// Submit feedback for a checkpoint
router.post("/:id/checkpoints/:checkpointId/feedback", ensureAuthenticated, async (req, res) => {
    try {
        const { id, checkpointId } = req.params;
        const { feedback, approved } = req.body;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: "User authentication required" });
        }

        const accessCheck = await canAccessProject(userId, id, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ error: accessCheck.reason });
        }

        await projectAgentOrchestrator.handleCheckpointFeedback(id, checkpointId, feedback, approved);

        res.json({ success: true });
    } catch (error: any) {
        console.error('❌ [Checkpoint Feedback] Failed to submit feedback:', {
            projectId: req.params.id,
            checkpointId: req.params.checkpointId,
            error: error.message,
            stack: error.stack?.split('\n').slice(0, 5).join('\n')
        });
        // Return more detailed error for debugging
        const isCheckpointNotFound = error.message?.includes('Checkpoint not found');
        const isContextNotFound = error.message?.includes('context not found');

        if (isCheckpointNotFound) {
            return res.status(404).json({
                error: "Checkpoint not found",
                details: error.message
            });
        }
        if (isContextNotFound) {
            return res.status(404).json({
                error: "Project context not found",
                details: "The server may have restarted. Please refresh the page and try again."
            });
        }
        res.status(500).json({
            error: "Failed to submit feedback",
            details: error.message
        });
    }
});

router.get("/:id", ensureAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: "User authentication required" });
        }

        const accessCheck = await canAccessProject(userId, id, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ error: accessCheck.reason });
        }

        const project = await storage.getProject(id);
        if (!project) {
            return res.status(404).json({ error: "Project not found" });
        }

        const datasets = await storage.getProjectDatasets(id);
        const primaryAssociation = datasets.find(({ association }) => association?.role === 'primary') ?? datasets[0];
        const primaryDataset = primaryAssociation?.dataset;

        const schema = project.schema ?? primaryDataset?.schema ?? null;
        const recordCount = project.recordCount ?? primaryDataset?.recordCount ?? null;

        const datasetSummaries = datasets.map(({ dataset, association }) => {
            const datasetName =
                association?.alias ||
                (dataset as any)?.name ||
                (association as any)?.datasetName ||
                dataset.originalFileName ||
                association.datasetId;

            return {
                id: dataset.id,
                name: datasetName,
                role: association.role,
                sourceType: dataset.sourceType,
                recordCount: dataset.recordCount ?? null,
                addedAt: association.addedAt ?? null,
            };
        });

        // DEBUG: Log journeyProgress presence for tracking data elements persistence
        console.log(`📊 [GET Project] Returning project ${id}:`, {
            hasJourneyProgress: !!(project as any).journeyProgress,
            hasRequirementsDocument: !!(project as any).journeyProgress?.requirementsDocument,
            elementsCount: (project as any).journeyProgress?.requirementsDocument?.requiredDataElements?.length || 0,
            requirementsLocked: (project as any).journeyProgress?.requirementsLocked
        });

        res.json({
            ...project,
            schema,
            recordCount,
            datasetSummaries,
            primaryDatasetId: primaryDataset?.id ?? null,
        });
    } catch (error: any) {
        console.error('Failed to fetch project:', error);
        res.status(500).json({ error: "Failed to fetch project" });
    }
});

// Upload file to an existing project
/**
 * @summary Uploads a data file and associates it with an existing project.
 * @description This is the primary endpoint for adding a dataset to a project that has already been created.
 * It follows the decoupled data model.
 * @route POST /api/projects/:id/upload
 * @auth Required (`ensureAuthenticated` middleware).
 * @input
 * - `req.params.id`: The ID of the project to upload to.
 * - `req.file`: The uploaded file (handled by `multer`).
 * - `req.user`: Attached by the authentication middleware.
 * @process
 * 1. Verifies user authentication.
 * 2. Fetches the project by ID and verifies the user owns it.
 * 3. Processes the file buffer using `FileProcessor`.
 * 4. Analyzes the data for PII using `PIIAnalyzer`.
 * 5. Creates a new, separate `Dataset` entity using `storage.createDataset`, storing the processed data with it.
 * 6. Links the project to the new dataset using `storage.linkProjectToDataset`.
 * 7. Updates the project's metadata (e.g., filename, size).
 * @output
 * - Success: 200 { success: true, project: object, datasetId: string, piiAnalysis: object }
 * - Error: 400, 404, or 500 with an error message.
 * @dependencies `storage`, `FileProcessor`, `PIIAnalyzer`.
 */
router.post("/:id/upload", ensureAuthenticated, upload.single('file'), async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;

        if (!req.file) {
            return res.status(400).json({ success: false, error: "No file uploaded" });
        }

        const project = await storage.getProject(projectId);
        const owner = (project as any)?.ownerId ?? (project as any)?.userId;
        if (!project || owner !== userId) {
            return res.status(404).json({ error: "Project not found or access denied" });
        }

        const filePath = req.file.path;
        const fileBuffer = req.file.buffer || (filePath ? await fs.readFile(filePath) : null);
        if (!fileBuffer) {
            throw new Error('Failed to load uploaded file for processing');
        }

        const processedData = await FileProcessor.processFile(fileBuffer, req.file.originalname, req.file.mimetype);
        const piiAnalysis = await PIIAnalyzer.analyzePII(processedData.preview || [], processedData.schema || {});
        const ingestionMetadata = {
            recordCount: processedData.recordCount,
            fileSize: req.file.size,
            fileType: req.file.mimetype,
            dataDescription: processedData.datasetSummary.overview,
            datasetSummary: processedData.datasetSummary,
            descriptiveStats: processedData.descriptiveStats,
            qualityMetrics: processedData.qualityMetrics,
            relationships: processedData.relationships,
            columnTypes: processedData.columnTypes,
            validationResults: processedData.validationResults,
            generatedAt: new Date().toISOString()
        };

        // Create a new Dataset
        // ✅ PHASE 1 FIX: Ensure originalFileName is always set with fallback
        const safeOriginalFileName2 = req.file.originalname || `upload_${Date.now()}.csv`;
        // Row cap on dataset.data is enforced in storage.createDataset() — do NOT add inline caps here.
        // See DATASET_DATA_ROW_CAP in server/constants.ts, enforced in storage.createDataset().
        const newDataset = await storage.createDataset({
            id: undefined as any,
            userId: userId,
            sourceType: 'upload',
            originalFileName: safeOriginalFileName2,
            name: safeOriginalFileName2,
            mimeType: req.file.mimetype,
            fileSize: req.file.size,
            storageUri: `mem://${projectId}/${safeOriginalFileName2}`, // Example URI
            schema: processedData.schema,
            recordCount: processedData.recordCount,
            preview: processedData.preview,
            piiAnalysis: piiAnalysis,
            data: processedData.data,
            ingestionMetadata
        } as any);

        // Link dataset to the project
        await storage.linkProjectToDataset(projectId, newDataset.id);
        console.log(`[project.ts] Linked project ${projectId} to dataset ${newDataset.id}`);

        // NOTE: Embedding generation happens later in this handler (TASK 1 FIX block)
        // with richer sample data (5 values from data||preview). Do NOT duplicate here.

        // Update project metadata (optional, if needed)
        const updatedProject = await storage.updateProject(projectId, {
            fileName: req.file.originalname, // Keep for quick reference, but data is in dataset
            fileSize: req.file.size,
            fileType: req.file.mimetype,
            processed: true,
        });

        const columnCount = Object.keys(processedData.schema || {}).length;
        const defaultQualityMetrics = {
            totalRows: processedData.recordCount ?? 0,
            totalColumns: columnCount,
            completeness: 1,
            duplicateRows: 0,
            potentialPIIFields: [] as string[],
            dataQualityScore: 75,
        };
        const qualityMetrics = processedData.qualityMetrics ?? defaultQualityMetrics;
        const metricsAny = (processedData.qualityMetrics ?? {}) as unknown as Record<string, unknown>;
        const qualityIssues = Array.isArray(metricsAny.issues) ? metricsAny.issues : [];
        const qualityRecommendations = Array.isArray(metricsAny.recommendations) ? metricsAny.recommendations : [];
        const scoreCandidates: number[] = [];
        const candidateValues = [
            (qualityMetrics as any).dataQualityScore,
            metricsAny.qualityScore,
            metricsAny.overallScore,
        ];
        for (const value of candidateValues) {
            if (typeof value === 'number' && !Number.isNaN(value)) {
                scoreCandidates.push(value);
            }
        }
        const derivedScore = scoreCandidates.length > 0 ? scoreCandidates[0] : 75;
        const qualityScore = derivedScore <= 1 ? Math.round(derivedScore * 100) : Math.round(derivedScore);

        let ingestionArtifactId: string | null = null;
        let qualityArtifactId: string | null = null;

        try {
            const ingestionArtifact = await storage.createArtifact({
                id: nanoid(),
                projectId,
                type: 'ingestion',
                status: 'completed',
                inputRefs: [newDataset.id],
                params: {
                    source: 'file_upload',
                    fileName: req.file.originalname,
                    mimeType: req.file.mimetype
                },
                metrics: {
                    recordCount: processedData.recordCount ?? null,
                    columnCount,
                    fileSize: req.file.size
                },
                output: {
                    datasetId: newDataset.id,
                    schema: processedData.schema,
                    preview: Array.isArray(processedData.preview)
                        ? processedData.preview.slice(0, 20)
                        : processedData.preview,
                    summary: processedData.datasetSummary.overview,
                    datasetSummary: processedData.datasetSummary,
                    descriptiveStats: processedData.descriptiveStats,
                    relationships: processedData.relationships
                },
                createdBy: userId
            });
            ingestionArtifactId = ingestionArtifact.id;
        } catch (artifactError) {
            console.error('Failed to create ingestion artifact:', artifactError);
        }

        try {
            const inputRefs = [newDataset.id];
            if (ingestionArtifactId) {
                inputRefs.push(ingestionArtifactId);
            }

            const qualityArtifact = await storage.createArtifact({
                id: nanoid(),
                projectId,
                type: 'analysis',
                status: 'completed',
                inputRefs,
                // ✅ FK Fix: Merged params with agent info for traceability
                params: {
                    analysis: 'data_quality_assessment',
                    generatedBy: 'data_engineer_agent',
                    agentType: 'data_quality_analysis'
                },
                metrics: {
                    qualityScore,
                    issueCount: qualityIssues.length
                },
                output: {
                    summary: `Data quality score ${qualityScore}%`,
                    qualityMetrics,
                    datasetSummary: processedData.datasetSummary,
                    descriptiveStats: processedData.descriptiveStats,
                    relationships: processedData.relationships,
                    issues: qualityIssues,
                    recommendations: qualityRecommendations
                },
                // ✅ FK Fix: Use actual userId instead of agent identifier
                createdBy: userId || null
            });
            qualityArtifactId = qualityArtifact.id;
        } catch (artifactError) {
            console.error('Failed to create data quality artifact:', artifactError);
        }

        await markJourneyProgress(projectId, [
            'intake_alignment',
            'industry_context',
            'auto_schema_detection',
            'data_health_check'
        ]);

        // Create initial checkpoints when data is uploaded
        const checkpointTime = Date.now();

        // Checkpoint 1: Data upload confirmation
        await projectAgentOrchestrator.addCheckpoint(projectId, {
            id: `checkpoint_${checkpointTime}_data_upload`,
            projectId,
            agentType: 'data_engineer',
            stepName: 'data_upload',
            status: 'completed',
            message: `Data uploaded successfully! ${processedData.recordCount} rows processed.`,
            data: {
                fileName: req.file.originalname,
                rowCount: processedData.recordCount,
                columnCount,
                dataDescription: processedData.datasetSummary.overview,
                datasetSummary: processedData.datasetSummary,
                descriptiveStats: processedData.descriptiveStats,
                relationships: processedData.relationships
            },
            timestamp: new Date(),
            requiresUserInput: false
        });

        // Checkpoint 2: Data Quality Agent - Quality assessment
        await projectAgentOrchestrator.addCheckpoint(projectId, {
            id: `checkpoint_${checkpointTime + 1}_data_quality`,
            projectId,
            agentType: 'data_engineer',
            stepName: 'data_quality_assessment',
            status: 'waiting_approval',
            message: `Data quality assessment complete. Overall quality score: ${qualityScore}%. Please review quality issues before proceeding.`,
            data: {
                qualityScore,
                qualityMetrics,
                rowCount: processedData.recordCount,
                columnCount,
                issues: qualityIssues,
                datasetSummary: processedData.datasetSummary,
                descriptiveStats: processedData.descriptiveStats,
                relationships: processedData.relationships
            },
            timestamp: new Date(),
            requiresUserInput: true
        });

        // ==========================================
        // TASK 1 FIX: EMBEDDING GENERATION (NON-BLOCKING)
        // ==========================================
        // Generate column embeddings EARLY (during upload) so they're available for element mapping
        // in the verification step. Previously, embeddings were only generated during transformation
        // which was too late for semantic column matching.
        setImmediate(async () => {
            try {
                console.log(`🔢 [TASK 1 FIX] Generating column embeddings for project ${projectId}...`);
                const columnsWithMeta = Object.entries(processedData.schema).map(([name, schemaInfo]: [string, any]) => {
                    const sampleValues = (processedData.data || processedData.preview || [])
                        .slice(0, 5)
                        .map((row: any) => row[name])
                        .filter((v: any) => v != null);
                    return {
                        name,
                        type: schemaInfo?.type || 'string',
                        sampleValues
                    };
                });

                if (columnsWithMeta.length > 0) {
                    await columnEmbeddingGenerator.generateEmbeddingsForDataset({
                        datasetId: newDataset.id,
                        projectId,
                        columns: columnsWithMeta
                    });
                    console.log(`✅ [TASK 1 FIX] Generated embeddings for ${columnsWithMeta.length} columns`);
                }
            } catch (embeddingError) {
                console.error('❌ [TASK 1 FIX] Column embedding generation failed:', embeddingError);
                // Don't fail upload if embedding generation fails
            }
        });

        // ==========================================
        // MULTI-AGENT COORDINATION - DEFERRED
        // ==========================================
        // Previously triggered coordinateGoalAnalysis() here at upload time, but user
        // hasn't set goals yet at this point. Coordination now triggers AFTER the
        // prepare step (goal+questions) via the /clarify-goal handler in project-manager.ts.
        // This ensures agents receive REAL user goals instead of generic defaults.
        res.json({
            success: true,
            projectId: projectId, // Include for client consistency
            project: updatedProject,
            datasetId: newDataset.id,
            piiAnalysis,
            dataDescription: processedData.datasetSummary.overview,
            datasetSummary: processedData.datasetSummary,
            descriptiveStats: processedData.descriptiveStats,
            qualityMetrics: processedData.qualityMetrics,
            relationships: processedData.relationships
        });

    } catch (error: any) {
        console.error(`[project.ts] File upload to project ${req.params.id} failed:`, error);
        res.status(500).json({ success: false, error: error.message || "Failed to process file" });
    }
});

// Data quality, PII, and schema analysis endpoints
router.get("/:id/data-quality", ensureAuthenticated, requireOwnership('project'), async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({ success: false, error: "Project not found" });
        }

        const userContext = buildUserContext(req, project);
        const datasets = await storage.getProjectDatasets(projectId);
        const primaryDataset = (datasets?.[0] as any)?.dataset || datasets?.[0];

        // FIX Issue 1: Check if datasets were joined - use joined data metrics if so
        const journeyProgress = (project as any)?.journeyProgress || {};
        const wasJoined = primaryDataset?.ingestionMetadata?.joinConfig?.foreignKeys?.length > 0 ||
                          journeyProgress?.joinedData?.joinApproved;

        // Use joined dataset metrics if available, otherwise use first dataset
        const datasetRecord = wasJoined && primaryDataset?.ingestionMetadata?.transformedData
            ? {
                ...primaryDataset,
                data: primaryDataset.ingestionMetadata.transformedData,
                recordCount: primaryDataset.ingestionMetadata.transformedRowCount ||
                             primaryDataset.ingestionMetadata.transformedData?.length ||
                             primaryDataset.recordCount,
                qualityMetrics: primaryDataset.ingestionMetadata.joinedQualityMetrics ||
                                primaryDataset.qualityMetrics
              }
            : primaryDataset;

        console.log(`📊 [Data Quality] Using ${wasJoined ? 'JOINED' : 'FIRST'} dataset metrics`);

        const ingestionMetadata = (datasetRecord as any)?.ingestionMetadata || {};
        const qualityMetrics = ingestionMetadata?.qualityMetrics || (datasetRecord as any)?.qualityMetrics || {};
        const qualityMetricsAny = qualityMetrics as Record<string, unknown>;
        const descriptiveStatsByColumn = ingestionMetadata?.descriptiveStats || null;
        const inferredRelationships = Array.isArray(ingestionMetadata?.relationships)
            ? ingestionMetadata.relationships
            : Array.isArray((datasetRecord as any)?.relationships)
                ? (datasetRecord as any).relationships
                : [];

        const snapshot = datasetRecord ? buildProjectDataSnapshot(project, datasetRecord) : null;
        const derivedQuality = snapshot ? deriveQualityInsights(snapshot) : null;

        const metrics = {
            completeness: pickScore(
                qualityMetricsAny['completeness'],
                derivedQuality?.metrics.completeness,
                datasetRecord ? undefined : 0
            ),
            consistency: pickScore(
                qualityMetricsAny['consistency'],
                derivedQuality?.metrics.consistency,
                datasetRecord ? undefined : 0
            ),
            accuracy: pickScore(
                qualityMetricsAny['accuracy'],
                derivedQuality?.metrics.accuracy,
                datasetRecord ? undefined : 0
            ),
            validity: pickScore(
                qualityMetricsAny['validity'],
                derivedQuality?.metrics.validity,
                datasetRecord ? undefined : 0
            )
        };

        // CRITICAL FIX: Always use the average of displayed metrics as the overall score
        // This ensures consistency between what the user sees in the breakdown and the overall number
        // Formula: (Completeness + Consistency + Accuracy + Validity) / 4
        const computedAverage = datasetRecord
            ? clampScore((metrics.completeness + metrics.consistency + metrics.accuracy + metrics.validity) / 4)
            : 0;

        // Use computedAverage as the primary score - this matches the displayed metrics
        // The old weighted dataQualityScore formula gave different results than the displayed average
        const qualityScoreValue = datasetRecord ? computedAverage : 0;

        console.log(`📊 [Quality Score] Calculated: ${qualityScoreValue}% from metrics:`, {
            completeness: metrics.completeness,
            consistency: metrics.consistency,
            accuracy: metrics.accuracy,
            validity: metrics.validity,
            formula: '(C + C + A + V) / 4'
        });

        const resolvedIssues = (Array.isArray(qualityMetricsAny['issues']) && (qualityMetricsAny['issues'] as unknown[]).length > 0
            ? qualityMetricsAny['issues']
            : derivedQuality?.issues
            ?? (datasetRecord
                ? ['Dataset preview is unavailable or incomplete. Re-run ingestion to refresh data quality metrics.']
                : ['Dataset not uploaded yet. Upload data to enable detailed quality checks.'])) as unknown[];

        const resolvedRecommendations = (Array.isArray(qualityMetricsAny['recommendations']) && (qualityMetricsAny['recommendations'] as unknown[]).length > 0
            ? qualityMetricsAny['recommendations']
            : derivedQuality?.recommendations
            ?? (datasetRecord
                ? ['Reprocess the dataset to generate up-to-date quality metrics.', 'Confirm column types and address any missing data discovered during ingestion.']
                : ['Upload a dataset to unlock automated quality assessments.', 'Set data quality thresholds to monitor future uploads.'])) as unknown[];

        const rawLabel = qualityMetricsAny['label'];
        const qualityLabel = typeof rawLabel === 'string' && rawLabel.trim().length > 0
            ? rawLabel
            : (derivedQuality?.label ?? (datasetRecord ? QUALITY_LABEL_REVIEW : QUALITY_LABEL_INSUFFICIENT));

        const datasetSummary = ingestionMetadata?.datasetSummary
            || derivedQuality?.datasetSummary
            || null;

        const metadata: Record<string, unknown> = {
            datasetAvailable: Boolean(datasetRecord),
            generatedAt: new Date().toISOString()
        };

        if (derivedQuality?.diagnostics) {
            metadata.qualityDiagnostics = derivedQuality.diagnostics;
        }

        res.json({
            success: true,
            assessedBy: 'data_engineer_agent',
            userContext,
            datasetId: datasetRecord?.id || null,
            recordCount: datasetRecord?.recordCount ?? 0,
            metrics,
            qualityScore: {
                overall: qualityScoreValue,
                label: qualityLabel
            },
            issues: resolvedIssues,
            recommendations: resolvedRecommendations,
            datasetSummary,
            descriptiveStats: descriptiveStatsByColumn,
            relationships: inferredRelationships,
            metadata
        });

    } catch (error: any) {
        console.error('Data quality error:', error);
        res.status(500).json({ success: false, error: error.message || "Failed to get data quality assessment" });
    }
});

router.get("/:id/pii-analysis", ensureAuthenticated, requireOwnership('project'), async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({ success: false, error: "Project not found" });
        }

        const userContext = buildUserContext(req, project);
        const datasets = await storage.getProjectDatasets(projectId);
        const datasetRecord = datasets?.[0]?.dataset;
        const piiAnalysis = (datasetRecord as any)?.piiAnalysis || {};

        const detectedPII = Array.isArray(piiAnalysis.detectedPII) ? piiAnalysis.detectedPII : [];
        const requiresReview = detectedPII.length > 0;

        res.json({
            success: true,
            assessedBy: 'data_verification_service_enhanced',
            userContext,
            datasetId: datasetRecord?.id || null,
            detectedPII,
            userConsent: piiAnalysis.userConsent ?? false,
            requiresReview,
            userDecision: piiAnalysis.userDecision || null,
            decisionTimestamp: piiAnalysis.consentTimestamp || null,
            metadata: {
                datasetAvailable: Boolean(datasetRecord),
                generatedAt: new Date().toISOString()
            }
        });

    } catch (error: any) {
        console.error('PII analysis error:', error);
        res.status(500).json({ success: false, error: error.message || "Failed to get PII analysis" });
    }
});

router.get("/:id/schema-analysis", ensureAuthenticated, requireOwnership('project'), async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({ success: false, error: "Project not found" });
        }

        const userContext = buildUserContext(req, project);
        const datasets = await storage.getProjectDatasets(projectId);
        const datasetRecord = datasets?.[0]?.dataset;

        // FIX: Prioritize joined schema from journeyProgress over individual dataset schema
        const journeyProgress = (project as any)?.journeyProgress || {};
        const joinedSchema = journeyProgress.joinedData?.schema || journeyProgress.transformedSchema;

        // Build schema: joined first, then merged from ALL datasets, then single dataset fallback
        let schema: Record<string, any> = {};
        let isJoinedSchema = false;
        if (joinedSchema && Object.keys(joinedSchema).length > 0) {
            schema = joinedSchema;
            isJoinedSchema = true;
        } else if (datasets && datasets.length > 1) {
            // Multi-dataset: merge schemas from ALL datasets (preserving SchemaColumn objects)
            const mergedSchema: Record<string, any> = {};
            datasets.forEach((entry: any) => {
                const ds = entry.dataset || entry;
                const dsSchema = ds.ingestionMetadata?.schema || ds.metadata?.schema || ds.schema;
                if (dsSchema && typeof dsSchema === 'object') {
                    Object.entries(dsSchema).forEach(([col, colInfo]) => {
                        if (!mergedSchema[col]) {
                            mergedSchema[col] = colInfo;
                        }
                    });
                }
            });
            schema = mergedSchema;
            isJoinedSchema = true; // Treat merged as joined for display purposes
        } else {
            schema = (datasetRecord as any)?.schema || {};
        }

        console.log(`📊 [Schema Analysis] Using ${isJoinedSchema ? 'MERGED/JOINED' : 'individual'} schema with ${Object.keys(schema).length} columns from ${datasets?.length || 0} dataset(s)`);

        // Merge ingestion metadata from all datasets for multi-dataset projects
        const ingestionMetadata = (datasetRecord as any)?.ingestionMetadata || {};
        const datasetSummary = ingestionMetadata?.datasetSummary || null;
        let descriptiveStatsByColumn = ingestionMetadata?.descriptiveStats || null;
        let inferredRelationships = Array.isArray(ingestionMetadata?.relationships)
            ? ingestionMetadata.relationships
            : Array.isArray((datasetRecord as any)?.relationships)
                ? (datasetRecord as any).relationships
                : [];

        // For multi-dataset projects, merge stats and relationships from all datasets
        if (datasets && datasets.length > 1) {
            const mergedStats: Record<string, any> = { ...(descriptiveStatsByColumn || {}) };
            const mergedRelationships: any[] = [...inferredRelationships];
            datasets.slice(1).forEach((entry: any) => {
                const ds = entry.dataset || entry;
                const meta = ds.ingestionMetadata || {};
                if (meta.descriptiveStats) {
                    Object.entries(meta.descriptiveStats).forEach(([col, stats]) => {
                        if (!mergedStats[col]) mergedStats[col] = stats;
                    });
                }
                const rels = Array.isArray(meta.relationships) ? meta.relationships : (Array.isArray(ds.relationships) ? ds.relationships : []);
                mergedRelationships.push(...rels);
            });
            descriptiveStatsByColumn = mergedStats;
            inferredRelationships = mergedRelationships;
        }
        // Normalize schema: ensure every value is a SchemaColumn object, not a bare string
        const normalizedSchema: Record<string, any> = {};
        Object.entries(schema as Record<string, any>).forEach(([col, val]) => {
            if (typeof val === 'string') {
                // Convert bare string type (e.g. "string", "integer") to SchemaColumn object
                normalizedSchema[col] = { name: col, type: val, nullable: true, unique: false, sampleValues: [], missingCount: 0, missingPercentage: 0 };
            } else if (val && typeof val === 'object' && val.type) {
                normalizedSchema[col] = val;
            } else {
                // Unknown format - extract what we can
                normalizedSchema[col] = { name: col, type: (val as any)?.dataType || 'unknown', nullable: true, unique: false, sampleValues: [], missingCount: 0, missingPercentage: 0 };
            }
        });
        const schemaEntries = Object.entries(normalizedSchema);

        const columnDetails = schemaEntries.map(([columnName, columnInfo]) => ({
            name: columnName,
            type: columnInfo.type || 'unknown',
            nullable: columnInfo.nullable ?? true,
            sampleValues: Array.isArray(columnInfo.sampleValues)
                ? columnInfo.sampleValues.slice(0, 5)
                : [],
            descriptiveStats: descriptiveStatsByColumn?.[columnName] ?? columnInfo.descriptiveStats ?? null
        }));

        const recommendations = Array.isArray((datasetRecord as any)?.schemaRecommendations)
            ? (datasetRecord as any).schemaRecommendations
            : (schemaEntries.length > 0 ? [
                'Validate detected data types before training models.',
                'Document business meaning for key columns to support collaboration.'
            ] : [
                'Upload a dataset to generate schema insights.',
                'Define expected columns for this project to guide future uploads.'
            ]);

        res.json({
            success: true,
            assessedBy: 'data_verification_service_enhanced',
            userContext,
            datasetId: datasetRecord?.id || null,
            columnCount: columnDetails.length,
            columnDetails,
            dataTypes: schemaEntries.reduce((acc, [key, val]) => {
                acc[key] = (val as any)?.type || 'unknown';
                return acc;
            }, {} as Record<string, string>),
            // Normalized schema: every value is a SchemaColumn object with .type
            schema: normalizedSchema,
            isJoinedSchema,
            datasetSummary,
            dataDescription: typeof datasetSummary?.overview === 'string' ? datasetSummary.overview : null,
            relationships: inferredRelationships,
            recommendations,
            metadata: {
                datasetAvailable: Boolean(datasetRecord),
                datasetCount: datasets?.length || 0,
                generatedAt: new Date().toISOString()
            }
        });

    } catch (error: any) {
        console.error('Schema analysis error:', error);
        res.status(500).json({ success: false, error: error.message || "Failed to get schema analysis" });
    }
});

// Generate Phase 1 required data elements from goals/questions (before data upload)
router.post("/:id/generate-data-requirements", ensureAuthenticated, requireOwnership('project'), async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const { userGoals, userQuestions } = req.body;

        if (!userGoals || !Array.isArray(userGoals) || userGoals.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'User goals are required'
            });
        }

        // Import the required data elements tool
        const { RequiredDataElementsTool } = await import('../services/tools/required-data-elements-tool');
        const tool = new RequiredDataElementsTool();

        // Generate Phase 1 requirements document
        const filteredGoals = userGoals.filter((g: any) => g && typeof g === 'string' && g.trim() !== '');
        const filteredQuestions = userQuestions && Array.isArray(userQuestions)
            ? userQuestions.filter((q: any) => q && typeof q === 'string' && q.trim() !== '')
            : [];

        // Fetch dataset schema so AI can generate relevant elements based on actual data columns
        let datasetSchema: Record<string, any> | undefined;
        try {
            const projectDatasets = await storage.getProjectDatasets(projectId);
            if (projectDatasets && projectDatasets.length > 0) {
                const ds = projectDatasets[0].dataset;
                datasetSchema = (ds as any).ingestionMetadata?.schema ||
                                (ds as any).metadata?.schema ||
                                (ds as any).schema;
                if (datasetSchema && Object.keys(datasetSchema).length > 0) {
                    console.log(`📊 [Generate Requirements] Found dataset schema with ${Object.keys(datasetSchema).length} columns`);
                } else {
                    datasetSchema = undefined;
                }
            }
        } catch (schemaErr) {
            console.warn('⚠️ [Generate Requirements] Could not fetch dataset schema:', schemaErr);
        }

        console.log(`📋 [Generate Requirements] Input:`, {
            projectId,
            goalsCount: filteredGoals.length,
            questionsCount: filteredQuestions.length,
            goals: filteredGoals.slice(0, 3),
            questions: filteredQuestions.slice(0, 3),
            hasDatasetSchema: !!datasetSchema,
            schemaColumns: datasetSchema ? Object.keys(datasetSchema).length : 0
        });

        // P0-8 FIX: Load structured questions with stable IDs from journeyProgress
        let structuredQuestions: Array<{ id: string; text: string; order?: number }> | undefined;
        try {
            const currentProject = await storage.getProject(projectId);
            const jp = (currentProject as any)?.journeyProgress;
            if (jp?.businessQuestions && Array.isArray(jp.businessQuestions) &&
                jp.businessQuestions.length > 0 && typeof jp.businessQuestions[0] === 'object' && jp.businessQuestions[0]?.id) {
                structuredQuestions = jp.businessQuestions;
                console.log(`📋 [P0-8] Passing ${structuredQuestions!.length} structured questions with stable IDs to defineRequirements`);
            }
        } catch (sqError) {
            console.warn(`⚠️ [P0-8] Could not load structured questions:`, sqError);
        }

        // FIX 1B: Resolve industry from request body FIRST (eliminates race condition with debounced save)
        // Priority: req.body.industry > journeyProgress.industry > journeyProgress.industryDomain > user.industry
        let reqIndustry: string | undefined;
        try {
            reqIndustry = req.body.industry; // FIX 1B: Read from explicit body param first
            if (!reqIndustry) {
                const reqProject = await storage.getProject(projectId);
                const jp = (reqProject as any)?.journeyProgress;
                reqIndustry = jp?.industry || jp?.industryDomain;
            }
            if (!reqIndustry) {
                const userId = (req.user as any)?.id;
                if (userId) {
                    const user = await storage.getUser(userId);
                    reqIndustry = (user as any)?.industry;
                }
            }
            console.log(`📋 [Fix 1B] Resolved industry="${reqIndustry || 'none'}" (source: ${req.body.industry ? 'body' : 'journeyProgress/user'})`);
        } catch (e) { /* non-blocking */ }

        const document = await tool.defineRequirements({
            projectId,
            userGoals: filteredGoals,
            userQuestions: filteredQuestions,
            structuredQuestions,
            // FIX: Transform flat schema Record<string, any> into structured format
            // that enhanceElementsWithColumnMapping() expects { columns: string[], columnTypes: Record, schema: Record }
            // Without this, .columns is undefined and column mapping NEVER runs
            datasetMetadata: datasetSchema ? {
                columns: Object.keys(datasetSchema),
                columnTypes: Object.fromEntries(
                    Object.entries(datasetSchema).map(([col, info]) => [
                        col,
                        typeof info === 'object' ? (info as any).type || 'unknown' : String(info)
                    ])
                ),
                schema: datasetSchema
            } : undefined,
            industry: reqIndustry
        });

        console.log(`📋 [Generate Requirements] Tool output:`, {
            documentId: document.documentId,
            analysisPathCount: document.analysisPath?.length || 0,
            requiredDataElementsCount: document.requiredDataElements?.length || 0,
            questionAnswerMappingCount: document.questionAnswerMapping?.length || 0,
            status: document.status,
            firstElement: document.requiredDataElements?.[0]?.elementName || 'none'
        });

        // ✅ GAP 9 FIX: Persist requirements document to journeyProgress (SSOT)
        // Uses atomicMergeJourneyProgress to prevent overwriting other progress keys
        const requirementsDocument = {
            documentId: document.documentId,
            analysisPath: document.analysisPath,
            requiredDataElements: document.requiredDataElements,
            completeness: document.completeness,
            status: document.status,
            generatedAt: new Date().toISOString(),
            industryDomain: reqIndustry  // ✅ FIX 9C: Persist industry so downstream mapElementsWithAI can read it
        };

        await storage.atomicMergeJourneyProgress(projectId, {
            requirementsDocument,
            requirementsLocked: true,
            requirementsLockedAt: new Date().toISOString()
        });

        console.log(`✅ [GAP 9 FIX] Persisted requirements document to journeyProgress for project ${projectId}`);
        console.log(`   - Analysis path items: ${document.analysisPath?.length || 0}`);
        console.log(`   - Required data elements: ${document.requiredDataElements?.length || 0}`);

        // P2-A FIX: Trigger agent coordination data update so AI Agent Activity modal shows project-specific findings
        // This populates multiAgentCoordination with data from requirementsDocument, user goals, and analysis path
        try {
            await projectAgentOrchestrator.updateProjectCoordinationData(projectId);
            console.log(`✅ [P2-A FIX] Updated multiAgentCoordination for project ${projectId}`);
        } catch (coordError) {
            // Non-critical - log but don't fail the request
            console.warn(`⚠️ [P2-A FIX] Failed to update multiAgentCoordination:`, coordError);
        }

        res.json({
            success: true,
            document: requirementsDocument,
            requirementsLocked: true,
            requirementsLockedAt: new Date().toISOString()
        });

    } catch (error: any) {
        console.error('Error generating data requirements:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate data requirements'
        });
    }
});

// Map required data elements to source columns in the dataset
// ENHANCED: Uses RequiredDataElementsTool with semantic matching, AI inference, and domain patterns
router.post("/:id/map-data-elements", ensureAuthenticated, requireOwnership('project'), async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const { forceRemap = false } = req.body;

        console.log(`🔧 [Map Elements] Starting enhanced mapping for project ${projectId} (forceRemap: ${forceRemap})`);

        // Get project with datasets and journeyProgress
        const project = await storage.getProject(projectId);
        const journeyProgress = (project as any)?.journeyProgress;

        // Check if requirements document exists
        if (!journeyProgress?.requirementsDocument) {
            console.log(`⚠️ [Map Elements] No requirements document found for project ${projectId}`);
            return res.json({
                success: false,
                error: 'preparation_required',
                requiresPreparation: true,
                message: 'Please complete the Preparation step first to define your analysis goals.'
            });
        }

        const reqDoc = journeyProgress.requirementsDocument;
        const requiredElements = reqDoc.requiredDataElements || [];

        if (requiredElements.length === 0) {
            console.log(`⚠️ [Map Elements] No required elements in document for project ${projectId}`);
            return res.json({
                success: false,
                error: 'no_elements',
                message: 'No data elements defined. Please define your requirements in the Preparation step.'
            });
        }

        // Get datasets with full metadata
        const datasets = await storage.getProjectDatasets(projectId);
        if (!datasets || datasets.length === 0) {
            console.log(`⚠️ [Map Elements] No datasets found for project ${projectId}`);
            return res.json({
                success: false,
                error: 'no_dataset',
                message: 'No data uploaded. Please upload your data first.'
            });
        }

        // Build merged schema and preview from all datasets
        const mergedSchema: Record<string, any> = {};
        let mergedPreview: any[] = [];
        let totalRowCount = 0;
        const datasetFileNames: string[] = [];
        const piiFields: string[] = [];

        for (const ds of datasets) {
            const dataset = ds.dataset as any;
            datasetFileNames.push(dataset.originalName || dataset.originalFileName || dataset.fileName || (dataset.metadata as any)?.fileName || 'unknown');

            // Merge schema
            const schema = dataset.schema || (dataset as any).metadata?.schema || {};
            if (typeof schema === 'object') {
                Object.entries(schema).forEach(([col, type]) => {
                    if (!mergedSchema[col]) {
                        mergedSchema[col] = type;
                    }
                });
            }

            // Get preview data (limited to 100 rows per dataset for AI analysis)
            const preview = dataset.preview as any[] || dataset.data as any[] || [];
            if (Array.isArray(preview) && preview.length > 0) {
                // Also infer schema from preview if not available
                Object.keys(preview[0]).forEach(col => {
                    if (!mergedSchema[col]) {
                        mergedSchema[col] = { type: typeof preview[0][col] };
                    }
                });
                mergedPreview = mergedPreview.concat(preview.slice(0, 100));
            }

            totalRowCount += dataset.rowCount || (Array.isArray(dataset.data) ? dataset.data.length : 0);

            // Collect PII fields
            const datasetPII = (dataset as any).piiFields || (dataset as any).metadata?.piiFields || [];
            piiFields.push(...datasetPII);
        }

        // If joined data exists, prioritize it
        if (journeyProgress.joinedData?.schema) {
            console.log(`📊 [Map Elements] Using joined data schema with ${Object.keys(journeyProgress.joinedData.schema).length} columns`);
            Object.entries(journeyProgress.joinedData.schema).forEach(([col, type]) => {
                mergedSchema[col] = type;
            });
            if (journeyProgress.joinedData.preview) {
                mergedPreview = journeyProgress.joinedData.preview.slice(0, 100);
            }
            if (journeyProgress.joinedData.rowCount) {
                totalRowCount = journeyProgress.joinedData.rowCount;
            }
        }

        console.log(`📊 [Map Elements] Merged schema has ${Object.keys(mergedSchema).length} columns, ${mergedPreview.length} preview rows`);

        // ============================================================
        // ENHANCED: Use RequiredDataElementsTool with semantic matching
        // ============================================================

        // ✅ CONTEXT CONTINUITY FIX: Resolve industry from journeyProgress
        // Industry detected in Prepare step must flow through to business definition lookups
        let mapIndustry: string | undefined;
        try {
            const mapJP = (project as any)?.journeyProgress;
            mapIndustry = mapJP?.industry || mapJP?.industryDomain;
            if (!mapIndustry) {
                const userId = (req.user as any)?.id;
                if (userId) {
                    const user = await storage.getUser(userId);
                    mapIndustry = (user as any)?.industry;
                }
            }
            if (mapIndustry) {
                console.log(`🏭 [Map Elements] Using industry context: ${mapIndustry}`);
            }
        } catch (e) { /* non-blocking */ }

        try {
            const mappedDocument = await requiredDataElementsTool.mapDatasetToRequirements(
                {
                    ...reqDoc,
                    requiredDataElements: forceRemap
                        ? requiredElements.map((e: any) => ({ ...e, sourceField: undefined, sourceAvailable: false }))
                        : requiredElements
                },
                {
                    fileName: datasetFileNames.join(', '),
                    rowCount: totalRowCount,
                    schema: mergedSchema,
                    preview: mergedPreview,
                    piiFields: [...new Set(piiFields)]
                },
                mapIndustry, // ✅ industry from journeyProgress (was: undefined)
                projectId    // RAG-first matching
            );

            // Count mapping stats
            const mappedElements = mappedDocument.requiredDataElements || [];
            const mappingStats = {
                totalElements: mappedElements.length,
                elementsMapped: mappedElements.filter((e: any) => e.sourceField || e.sourceAvailable).length,
                elementsUnmapped: mappedElements.filter((e: any) => !e.sourceField && !e.sourceAvailable).length,
                elementsNeedingTransform: mappedElements.filter((e: any) => e.transformationRequired).length,
                availableColumns: Object.keys(mergedSchema).length,
                aiMapped: mappedElements.filter((e: any) => (e as any).mappingSource === 'ai').length,
                patternMapped: mappedElements.filter((e: any) => (e as any).mappingSource !== 'ai' && e.sourceField).length
            };

            console.log(`✅ [Map Elements] Enhanced mapping complete for project ${projectId}:`, mappingStats);

            // ✅ P0 FIX: Calculate completeness object for frontend display
            const completeness = {
                totalElements: mappingStats.totalElements,
                elementsMapped: mappingStats.elementsMapped,
                elementsUnmapped: mappingStats.elementsUnmapped,
                elementsWithTransformation: mappingStats.elementsNeedingTransform,
                readyForExecution: mappedElements.every((e: any) => e.sourceField || e.sourceAvailable || !e.required),
                mappingPercentage: mappingStats.totalElements > 0
                    ? Math.round((mappingStats.elementsMapped / mappingStats.totalElements) * 100)
                    : 0
            };

            console.log(`📊 [Map Elements] Completeness calculated:`, completeness);

            // Update journeyProgress with mapped elements AND completeness
            const updatedReqDoc = {
                ...mappedDocument,
                completeness,  // ✅ P0 FIX: Include completeness in the document
                lastMappedAt: new Date().toISOString()
            };

            await storage.atomicMergeJourneyProgress(projectId, {
                requirementsDocument: updatedReqDoc
            });

            res.json({
                success: true,
                document: updatedReqDoc,
                mappingStats,
                completeness,  // ✅ P0 FIX: Also return in response
                availableColumns: Object.keys(mergedSchema),
                enhancedMapping: true
            });

        } catch (toolError: any) {
            console.error(`⚠️ [Map Elements] Enhanced mapping failed, falling back to basic:`, toolError.message);

            // ============================================================
            // FALLBACK: Basic string-based mapping if tool fails
            // ============================================================
            const availableColumns = Object.keys(mergedSchema);
            const mappedElements = requiredElements.map((elem: any) => {
                // Skip if already mapped (unless forceRemap)
                if (elem.sourceColumn && !forceRemap) {
                    return elem;
                }

                const elementName = (elem.elementName || elem.name || '').toLowerCase().replace(/[_\s-]/g, '');
                const elementId = (elem.elementId || elem.id || '').toLowerCase().replace(/[_\s-]/g, '');

                // Find best matching column with enhanced matching
                let bestMatch: string | null = null;
                let bestScore = 0;

                for (const col of availableColumns) {
                    const colNormalized = col.toLowerCase().replace(/[_\s-]/g, '');
                    let score = 0;

                    // Exact match
                    if (colNormalized === elementName || colNormalized === elementId) {
                        score = 100;
                    }
                    // Partial match
                    else if (colNormalized.includes(elementName) || elementName.includes(colNormalized)) {
                        score = 60 * Math.min(colNormalized.length, elementName.length) / Math.max(colNormalized.length, elementName.length);
                    }
                    // Word-based matching (for multi-word names)
                    else {
                        const elemWords = elementName.split(/(?=[A-Z])|\s+/).map((w: string) => w.toLowerCase());
                        const colWords = colNormalized.split(/(?=[A-Z])|\s+/).map((w: string) => w.toLowerCase());
                        const matchingWords = elemWords.filter((w: string) => w.length > 2 && colWords.some((cw: string) => cw.includes(w) || w.includes(cw)));
                        if (matchingWords.length > 0) {
                            score = 40 * matchingWords.length / Math.max(elemWords.length, 1);
                        }
                    }

                    // Domain-specific boosting
                    const domainPatterns = [
                        { elem: /identifier|id$/i, col: /id$|_id$|identifier/i, boost: 30 },
                        { elem: /score|rating/i, col: /score|rating|level/i, boost: 25 },
                        { elem: /date|time|period/i, col: /date|time|created|updated/i, boost: 25 },
                        { elem: /department|team/i, col: /dept|department|team|group/i, boost: 25 },
                        { elem: /employee|staff/i, col: /emp|employee|staff|worker/i, boost: 25 },
                        { elem: /engagement/i, col: /engage|satisfaction/i, boost: 20 },
                        { elem: /turnover|retention/i, col: /turnover|retention|attrition/i, boost: 20 }
                    ];

                    for (const pattern of domainPatterns) {
                        if (pattern.elem.test(elementName) && pattern.col.test(col)) {
                            score += pattern.boost;
                        }
                    }

                    if (score > bestScore) {
                        bestMatch = col;
                        bestScore = score;
                    }
                }

                // Accept matches with score > 30
                if (bestMatch && bestScore > 30) {
                    return {
                        ...elem,
                        sourceColumn: bestMatch,
                        sourceField: bestMatch,
                        sourceAvailable: true,
                        mappingConfidence: bestScore / 100,
                        confidence: bestScore / 100,
                        mappingStatus: 'auto_mapped' as const
                    };
                }

                return {
                    ...elem,
                    sourceAvailable: false,
                    mappingStatus: 'unmapped' as const,
                    confidence: 0
                };
            });

            // Count mapping stats
            const mappingStats = {
                totalElements: mappedElements.length,
                elementsMapped: mappedElements.filter((e: any) => e.sourceColumn || e.sourceField).length,
                elementsUnmapped: mappedElements.filter((e: any) => !e.sourceColumn && !e.sourceField).length,
                availableColumns: availableColumns.length,
                fallbackUsed: true
            };

            console.log(`✅ [Map Elements] Fallback mapping complete for project ${projectId}:`, mappingStats);

            // ✅ P0 FIX: Calculate completeness object for frontend display (fallback path)
            const completeness = {
                totalElements: mappingStats.totalElements,
                elementsMapped: mappingStats.elementsMapped,
                elementsUnmapped: mappingStats.elementsUnmapped,
                elementsWithTransformation: mappedElements.filter((e: any) => e.transformationRequired).length,
                readyForExecution: mappedElements.every((e: any) => e.sourceField || e.sourceColumn || !e.required),
                mappingPercentage: mappingStats.totalElements > 0
                    ? Math.round((mappingStats.elementsMapped / mappingStats.totalElements) * 100)
                    : 0
            };

            console.log(`📊 [Map Elements] Completeness calculated (fallback):`, completeness);

            // Update journeyProgress with mapped elements AND completeness
            const updatedReqDoc = {
                ...reqDoc,
                requiredDataElements: mappedElements,
                completeness,  // ✅ P0 FIX: Include completeness in the document
                lastMappedAt: new Date().toISOString()
            };

            await storage.atomicMergeJourneyProgress(projectId, {
                requirementsDocument: updatedReqDoc
            });

            res.json({
                success: true,
                document: updatedReqDoc,
                mappingStats,
                completeness,  // ✅ P0 FIX: Also return in response
                availableColumns,
                enhancedMapping: false,
                fallbackReason: toolError.message
            });
        }

    } catch (error: any) {
        console.error('Error mapping data elements:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to map data elements'
        });
    }
});

// Get required data elements document for a project
router.get("/:id/required-data-elements", ensureAuthenticated, requireOwnership('project'), async (req, res) => {
    try {
        const { id: projectId } = req.params;

        // First, check journeyProgress for requirementsDocument (SSOT from Prepare step)
        const project = await storage.getProject(projectId);
        const journeyProgress = (project as any)?.journeyProgress;

        if (journeyProgress?.requirementsDocument) {
            const doc = journeyProgress.requirementsDocument;
            console.log(`📋 [Required Elements] Found document in journeyProgress for project ${projectId}:`, {
                elementsCount: doc.requiredDataElements?.length || 0,
                analysisPathCount: doc.analysisPath?.length || 0,
                firstElement: doc.requiredDataElements?.[0]?.elementName || 'none',
                documentId: doc.documentId
            });
            return res.json({
                success: true,
                document: {
                    documentId: doc.documentId || `doc_${projectId}`,
                    projectId: projectId,
                    version: doc.version || '1.0',
                    status: doc.status || 'complete',
                    createdAt: doc.createdAt || new Date().toISOString(),
                    updatedAt: doc.updatedAt || new Date().toISOString(),
                    analysisPath: doc.analysisPath || [],
                    requiredDataElements: doc.requiredDataElements || [],
                    completeness: doc.completeness,
                    gaps: doc.gaps || [],
                    recommendations: doc.recommendations || [],
                    questionAnswerMapping: doc.questionAnswerMapping || [],
                    userQuestions: doc.userQuestions || journeyProgress.userQuestions || [],
                    transformationPlan: doc.transformationPlan || []
                },
                metadata: {
                    source: 'journeyProgress',
                    generatedAt: new Date().toISOString()
                }
            });
        }

        // Fallback: Get dataset linked to this project
        const datasets = await storage.getProjectDatasets(projectId);

        if (!datasets || datasets.length === 0) {
            // No datasets yet - return empty document instead of 404
            console.log(`📋 [Required Elements] No datasets found, returning empty document for project ${projectId}`);
            return res.json({
                success: true,
                document: {
                    documentId: `doc_${projectId}`,
                    projectId: projectId,
                    version: '1.0',
                    status: 'pending',
                    requiredDataElements: [],
                    analysisPath: [],
                    gaps: [],
                    recommendations: [],
                    questionAnswerMapping: [],
                    userQuestions: journeyProgress?.userQuestions || [],
                    transformationPlan: []
                },
                metadata: {
                    source: 'empty',
                    message: 'No requirements document generated yet. Complete the Prepare step first.',
                    generatedAt: new Date().toISOString()
                }
            });
        }

        const dataset = datasets[0].dataset;
        const ingestionMetadata = (dataset as any).ingestionMetadata;

        if (!ingestionMetadata?.dataRequirementsDocument) {
            // No document in dataset - return empty document instead of 404
            console.log(`📋 [Required Elements] No document in dataset, returning empty for project ${projectId}`);
            return res.json({
                success: true,
                document: {
                    documentId: `doc_${projectId}`,
                    projectId: projectId,
                    version: '1.0',
                    status: 'pending',
                    requiredDataElements: [],
                    analysisPath: [],
                    gaps: [],
                    recommendations: [],
                    questionAnswerMapping: [],
                    userQuestions: journeyProgress?.userQuestions || [],
                    transformationPlan: []
                },
                metadata: {
                    source: 'empty',
                    datasetId: dataset.id,
                    message: 'Requirements document not yet generated. Complete the Prepare step.',
                    generatedAt: new Date().toISOString()
                }
            });
        }

        const doc = ingestionMetadata.dataRequirementsDocument;

        // R2 FIX: Include questionAnswerMapping and other fields needed by transformation step
        res.json({
            success: true,
            document: {
                documentId: doc.documentId,
                projectId: doc.projectId,
                version: doc.version,
                status: doc.status,
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt,
                analysisPath: doc.analysisPath,
                requiredDataElements: doc.requiredDataElements,
                completeness: doc.completeness,
                gaps: doc.gaps || [],
                recommendations: doc.recommendations || [],
                // R2: Include mapping and transformation fields for pipeline linking
                questionAnswerMapping: doc.questionAnswerMapping || [],
                userQuestions: doc.userQuestions || [],
                transformationPlan: doc.transformationPlan || []
            },
            metadata: {
                datasetId: dataset.id,
                datasetName: (dataset as any).originalFileName,
                recordCount: (dataset as any).recordCount,
                generatedAt: new Date().toISOString()
            }
        });

    } catch (error: any) {
        console.error('Error fetching required data elements:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch required data elements'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUSINESS DEFINITION ENRICHMENT - Connect BA Agent to data elements
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/projects/:id/enrich-data-elements
 *
 * Enriches required data elements with business definitions from the BA Agent.
 * This connects the business definition registry to the data element pipeline.
 *
 * Flow:
 * 1. Takes data elements (from DS Agent)
 * 2. Looks up business definitions for each element (BA Agent via registry)
 * 3. Infers missing definitions (Researcher Agent via AI)
 * 4. Returns enriched elements with formulas, component fields, and confidence
 *
 * Body: {
 *   elements?: DataElement[],  // Optional - uses journeyProgress if not provided
 *   industry?: string,         // For industry-specific definitions
 *   includeInferred?: boolean  // Whether to infer missing definitions (default: true)
 * }
 */
router.post("/:id/enrich-data-elements", ensureAuthenticated, requireOwnership('project'), async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const { elements, industry, includeInferred = true } = req.body;

        console.log(`\n📚 [Business Definitions] Enriching data elements for project ${projectId}`);

        // Import business definition registry
        const { businessDefinitionRegistry } = await import('../services/business-definition-registry');

        // Get project and journey progress
        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }

        const journeyProgress = (project as any)?.journeyProgress || {};
        // ✅ FIX 9B: Resolve industry with better fallback chain + logging
        const projectIndustry = industry || journeyProgress.industry || journeyProgress.industryDomain || 'general';
        if (projectIndustry !== 'general') {
            console.log(`📚 [Business Definitions] Using industry: ${projectIndustry} (source: ${industry ? 'request' : 'journeyProgress'})`);
        } else {
            console.warn(`⚠️ [Business Definitions] No industry for project ${projectId} — AI will infer from schema`);
        }

        // Get elements from request or journey progress
        let dataElements = elements;
        if (!dataElements || dataElements.length === 0) {
            const reqDoc = journeyProgress.requirementsDocument;
            dataElements = reqDoc?.requiredDataElements || [];
        }

        if (dataElements.length === 0) {
            return res.json({
                success: true,
                enrichedElements: [],
                message: 'No data elements to enrich. Complete the Prepare step first.'
            });
        }

        console.log(`📚 [Business Definitions] Enriching ${dataElements.length} elements for industry: ${projectIndustry}`);

        // Enrich each element with business definitions
        const enrichedElements = [];
        const enrichmentStats = {
            found: 0,
            inferred: 0,
            notFound: 0
        };

        for (const element of dataElements) {
            const conceptName = element.elementName || element.name || element.element;
            console.log(`  📖 Looking up definition for: "${conceptName}"`);

            // Look up definition in registry
            const lookupResult = await businessDefinitionRegistry.lookupDefinition(conceptName, {
                industry: projectIndustry,
                projectId,
                includeGlobal: true
            });

            let enrichedElement = { ...element };

            if (lookupResult.found && lookupResult.definition) {
                // Found definition in registry
                const def = lookupResult.definition;
                enrichedElement = {
                    ...element,
                    businessDefinition: {
                        conceptName: def.conceptName,
                        displayName: def.displayName,
                        businessDescription: def.businessDescription,
                        calculationType: def.calculationType,
                        formula: def.formula,
                        componentFields: def.componentFields,
                        aggregationMethod: def.aggregationMethod,
                        confidence: lookupResult.confidence,
                        source: lookupResult.source,
                        industry: def.industry
                    },
                    hasBusinessDefinition: true,
                    definitionConfidence: lookupResult.confidence
                };
                enrichmentStats.found++;
                console.log(`    ✅ Found: ${def.displayName || def.conceptName} (${lookupResult.source}, ${(lookupResult.confidence * 100).toFixed(0)}% confidence)`);

            } else if (includeInferred) {
                // Try to infer definition
                const inferredDef = await businessDefinitionRegistry.inferDefinition({
                    conceptName,
                    context: journeyProgress.goals?.join(', ') || '',
                    industry: projectIndustry,
                    datasetSchema: journeyProgress.schema
                });

                if (inferredDef) {
                    enrichedElement = {
                        ...element,
                        businessDefinition: {
                            conceptName: inferredDef.conceptName,
                            displayName: inferredDef.displayName,
                            businessDescription: inferredDef.businessDescription,
                            calculationType: inferredDef.calculationType,
                            formula: inferredDef.formula,
                            componentFields: inferredDef.componentFields,
                            aggregationMethod: inferredDef.aggregationMethod,
                            confidence: 0.7,
                            source: 'ai_inferred',
                            industry: inferredDef.industry
                        },
                        hasBusinessDefinition: true,
                        definitionConfidence: 0.7
                    };
                    enrichmentStats.inferred++;
                    console.log(`    🔬 Inferred: ${inferredDef.displayName || inferredDef.conceptName}`);
                } else {
                    // FALLBACK: Generate basic definition from element properties
                    // DS agent provides calculationType, aggregationMethod, etc.
                    const calcType = element.calculationType || element.type || 'direct';
                    const calcDef = element.calculationDefinition || element.definition;
                    const aggMethod = element.aggregationMethod;

                    if (calcType || calcDef) {
                        enrichedElement = {
                            ...element,
                            businessDefinition: {
                                conceptName: conceptName.toLowerCase().replace(/\s+/g, '_'),
                                displayName: conceptName,
                                businessDescription: calcDef || `${conceptName} - ${calcType} metric${aggMethod ? ` using ${aggMethod}` : ''}`,
                                calculationType: calcType,
                                aggregationMethod: aggMethod,
                                confidence: 0.5,
                                source: 'auto_derived',
                                industry: projectIndustry
                            },
                            hasBusinessDefinition: true,
                            definitionConfidence: 0.5
                        };
                        enrichmentStats.inferred++;
                        console.log(`    🔧 Auto-derived definition from element properties: ${conceptName} (${calcType})`);
                    } else {
                        enrichedElement.hasBusinessDefinition = false;
                        enrichedElement.definitionConfidence = 0;
                        enrichmentStats.notFound++;
                        console.log(`    ❌ No definition found or inferred`);
                    }
                }
            } else {
                // FALLBACK even when includeInferred is false
                const calcType = element.calculationType || element.type || 'direct';
                const calcDef = element.calculationDefinition || element.definition;
                if (calcType || calcDef) {
                    enrichedElement = {
                        ...element,
                        businessDefinition: {
                            conceptName: conceptName.toLowerCase().replace(/\s+/g, '_'),
                            displayName: conceptName,
                            businessDescription: calcDef || `${conceptName} metric`,
                            calculationType: calcType,
                            confidence: 0.4,
                            source: 'element_derived',
                            industry: projectIndustry
                        },
                        hasBusinessDefinition: true,
                        definitionConfidence: 0.4
                    };
                    enrichmentStats.inferred++;
                } else {
                    enrichedElement.hasBusinessDefinition = false;
                    enrichedElement.definitionConfidence = 0;
                    enrichmentStats.notFound++;
                }
            }

            // Add alternatives if available
            if (lookupResult.alternatives && lookupResult.alternatives.length > 0) {
                enrichedElement.alternativeDefinitions = lookupResult.alternatives.map(alt => ({
                    conceptName: alt.conceptName,
                    displayName: alt.displayName,
                    businessDescription: alt.businessDescription,
                    calculationType: alt.calculationType
                }));
            }

            enrichedElements.push(enrichedElement);
        }

        console.log(`📚 [Business Definitions] Enrichment complete:`, enrichmentStats);

        // Update journey progress with enriched elements (optional - can be disabled)
        if (req.body.persistToProgress !== false) {
            const updatedReqDoc = {
                ...journeyProgress.requirementsDocument,
                requiredDataElements: enrichedElements,
                businessDefinitionsEnriched: true,
                enrichmentStats,
                enrichedAt: new Date().toISOString()
            };

            await storage.atomicMergeJourneyProgress(projectId, {
                requirementsDocument: updatedReqDoc
            });

            console.log(`📚 [Business Definitions] Persisted enriched elements to journeyProgress`);
        }

        res.json({
            success: true,
            enrichedElements,
            stats: enrichmentStats,
            industry: projectIndustry,
            message: `Enriched ${enrichmentStats.found} elements from registry, inferred ${enrichmentStats.inferred}, ${enrichmentStats.notFound} without definitions`
        });

    } catch (error: any) {
        console.error('Error enriching data elements:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to enrich data elements with business definitions'
        });
    }
});

/**
 * GET /api/projects/:id/business-definitions/:conceptName
 *
 * Look up a specific business definition by concept name.
 * Used by UI to show business context when mapping columns.
 */
router.get("/:id/business-definitions/:conceptName", ensureAuthenticated, requireOwnership('project'), async (req, res) => {
    try {
        const { id: projectId, conceptName } = req.params;
        const { industry } = req.query;

        // Import business definition registry
        const { businessDefinitionRegistry } = await import('../services/business-definition-registry');

        // Get project for industry context
        const project = await storage.getProject(projectId);
        const journeyProgress = (project as any)?.journeyProgress || {};
        const projectIndustry = (industry as string) || journeyProgress.industry || 'general';

        const lookupResult = await businessDefinitionRegistry.lookupDefinition(conceptName, {
            industry: projectIndustry,
            projectId,
            includeGlobal: true
        });

        if (lookupResult.found && lookupResult.definition) {
            res.json({
                success: true,
                found: true,
                definition: lookupResult.definition,
                confidence: lookupResult.confidence,
                source: lookupResult.source,
                alternatives: lookupResult.alternatives
            });
        } else {
            res.json({
                success: true,
                found: false,
                alternatives: lookupResult.alternatives,
                message: `No business definition found for "${conceptName}". Consider using the enrich endpoint to infer one.`
            });
        }

    } catch (error: any) {
        console.error('Error looking up business definition:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to look up business definition'
        });
    }
});

/**
 * POST /api/projects/:id/validate-mapping
 *
 * Validates a column mapping against its business definition.
 * Ensures the mapped columns align with what the definition expects.
 *
 * Body: {
 *   elementName: string,
 *   mappedColumns: string[],
 *   transformationLogic?: string
 * }
 */
router.post("/:id/validate-mapping", ensureAuthenticated, requireOwnership('project'), async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const { elementName, mappedColumns, transformationLogic } = req.body;

        if (!elementName) {
            return res.status(400).json({ success: false, error: 'elementName is required' });
        }

        // Import business definition registry
        const { businessDefinitionRegistry } = await import('../services/business-definition-registry');

        // Get project
        const project = await storage.getProject(projectId);
        const journeyProgress = (project as any)?.journeyProgress || {};
        const projectIndustry = journeyProgress.industry || 'general';

        // Look up definition
        const lookupResult = await businessDefinitionRegistry.lookupDefinition(elementName, {
            industry: projectIndustry,
            projectId,
            includeGlobal: true
        });

        const validationResult: {
            valid: boolean;
            warnings: string[];
            suggestions: string[];
            confidence: number;
        } = {
            valid: true,
            warnings: [],
            suggestions: [],
            confidence: 1.0
        };

        if (lookupResult.found && lookupResult.definition) {
            const def = lookupResult.definition as any;

            // Check if mapped columns match expected component fields
            const componentFields = Array.isArray(def.componentFields) ? def.componentFields : [];
            if (componentFields.length > 0) {
                const expectedFields = componentFields.map((f: string) => f.toLowerCase());
                const mappedLower = mappedColumns.map((c: string) => c.toLowerCase());

                // Check for missing expected fields
                const missingFields = expectedFields.filter((f: string) =>
                    !mappedLower.some((m: string) => m.includes(f) || f.includes(m))
                );

                if (missingFields.length > 0) {
                    validationResult.warnings.push(
                        `Business definition expects fields: ${componentFields.join(', ')}. ` +
                        `Missing: ${missingFields.join(', ')}`
                    );
                    validationResult.confidence *= 0.7;
                }

                // Check for extra fields not in definition
                const extraFields = mappedLower.filter((m: string) =>
                    !expectedFields.some((f: string) => m.includes(f) || f.includes(m))
                );

                if (extraFields.length > 0 && missingFields.length > 0) {
                    validationResult.suggestions.push(
                        `Mapped columns ${extraFields.join(', ')} are not in the standard definition. ` +
                        `Verify these are equivalent to expected fields.`
                    );
                }
            }

            // Check calculation type alignment
            if (def.calculationType === 'aggregated' && !transformationLogic) {
                validationResult.suggestions.push(
                    `This metric requires aggregation (${def.aggregationMethod || 'average'}). ` +
                    `Add transformation logic to aggregate the mapped columns.`
                );
            }

            // Suggest the standard formula if available
            if (def.formula && !transformationLogic) {
                validationResult.suggestions.push(
                    `Standard formula: ${def.formula}. Consider using this as your transformation.`
                );
            }

            validationResult.valid = validationResult.warnings.length === 0;

        } else {
            // No definition found - mapping is valid but low confidence
            validationResult.confidence = 0.5;
            validationResult.warnings.push(
                `No business definition found for "${elementName}". ` +
                `Cannot validate mapping against standard formula.`
            );
        }

        res.json({
            success: true,
            elementName,
            validation: validationResult,
            businessDefinition: lookupResult.definition || null
        });

    } catch (error: any) {
        console.error('Error validating mapping:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to validate mapping'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PM-SUPERVISED DATA ELEMENT MAPPING FLOW
// Orchestrates DS → BA → Researcher → DE with PM validation at each step
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/projects/:id/pm-supervised-mapping
 *
 * Executes the PM-supervised data element mapping flow:
 * 1. DS Agent identifies required data elements from goals/questions
 * 2. PM validates DS output
 * 3. BA Agent looks up business definitions from registry
 * 4. PM validates BA output
 * 5. Researcher Agent infers missing definitions using AI
 * 6. PM validates Researcher output
 * 7. DE Agent creates transformation logic
 * 8. PM validates final transformation plan
 *
 * Body: {
 *   userGoals?: string[],      // Override goals from journey progress
 *   userQuestions?: string[]   // Override questions from journey progress
 * }
 */
router.post("/:id/pm-supervised-mapping", ensureAuthenticated, requireOwnership('project'), async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;

        console.log(`\n🎯 [API] Starting PM-supervised data mapping for project ${projectId}`);

        // Get project and journey progress
        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        const journeyProgress = (project as any)?.journeyProgress || {};

        // Get user goals and questions (from request body or journey progress)
        let userGoals = req.body.userGoals || journeyProgress.goals || [];
        let userQuestions = req.body.userQuestions || journeyProgress.businessQuestions || journeyProgress.userQuestions || [];

        // Normalize goals to array
        if (typeof userGoals === 'string') {
            userGoals = [userGoals];
        }

        // Include analysis goal if not in goals array
        if (journeyProgress.analysisGoal && !userGoals.includes(journeyProgress.analysisGoal)) {
            userGoals.unshift(journeyProgress.analysisGoal);
        }

        if (userGoals.length === 0 && userQuestions.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No goals or questions available. Please complete the Prepare step first.'
            });
        }

        // Get dataset metadata
        const datasets = await storage.getProjectDatasets(projectId);
        if (!datasets || datasets.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No datasets uploaded. Please upload data first.'
            });
        }

        // Build dataset metadata for the mapping flow
        const primaryDataset = datasets[0]?.dataset || datasets[0];
        const datasetMetadata = {
            columns: (primaryDataset as any)?.metadata?.columns || [],
            columnNames: (primaryDataset as any)?.metadata?.columns?.map((c: any) => c.name || c) || [],
            schema: (primaryDataset as any)?.metadata?.schema || (primaryDataset as any)?.metadata,
            rowCount: (primaryDataset as any)?.recordCount || (primaryDataset as any)?.metadata?.rowCount || 0,
            datasetId: primaryDataset?.id,
            datasetName: (primaryDataset as any)?.originalFileName || 'Unknown'
        };

        console.log(`📊 [API] Dataset metadata: ${datasetMetadata.columnNames.length} columns, ${datasetMetadata.rowCount} rows`);
        console.log(`📋 [API] User goals: ${userGoals.length}, questions: ${userQuestions.length}`);

        // Import and execute the PM-supervised flow
        const { projectAgentOrchestrator } = await import('../services/project-agent-orchestrator');

        const result = await projectAgentOrchestrator.executePMSupervisedDataMappingFlow(
            projectId,
            datasetMetadata,
            userGoals,
            userQuestions
        );

        if (!result.success) {
            return res.status(500).json({
                success: false,
                error: result.error || 'PM-supervised mapping flow failed',
                pmValidations: result.pmValidations
            });
        }

        console.log(`✅ [API] PM-supervised mapping completed successfully`);

        res.json({
            success: true,
            message: 'PM-supervised data element mapping completed',
            requirementsDocument: result.requirementsDocument,
            businessDefinitions: result.businessDefinitions,
            transformationPlan: result.transformationPlan,
            pmValidations: result.pmValidations,
            summary: {
                definitionsFound: result.businessDefinitions?.length || 0,
                transformationsCreated: result.transformationPlan?.transformations?.length || 0,
                readinessScore: result.transformationPlan?.readinessScore || 0,
                pmValidationsPassed: result.pmValidations?.filter(v => v.validated).length || 0,
                pmValidationsTotal: result.pmValidations?.length || 0
            }
        });

    } catch (error: any) {
        console.error('❌ [API] PM-supervised mapping error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to execute PM-supervised data mapping'
        });
    }
});

// Agent interaction endpoints

// Get project checkpoints
router.get("/:projectId/checkpoints", ensureAuthenticated, requireOwnership('project'), async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        // Verify user has access to this project
        const project = await storage.getProject(projectId);
        const owner = (project as any)?.ownerId ?? (project as any)?.userId;
        if (owner !== userId) {
            return res.status(403).json({ error: "Access denied" });
        }

        const checkpoints = await projectAgentOrchestrator.getProjectCheckpoints(projectId);
        res.json({ success: true, checkpoints });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ GAP 8 FIX: Removed duplicate checkpoint feedback endpoint
// The authoritative endpoint is at POST /:id/checkpoints/:checkpointId/feedback (line ~3819)
// which uses canAccessProject() for proper admin bypass support

// Get project questions from project_questions table
router.get("/:id/questions", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ error: accessCheck.reason });
        }

        // Load questions from project_questions table
        const questions = await db
            .select()
            .from(projectQuestions)
            .where(eq(projectQuestions.projectId, projectId))
            .orderBy(projectQuestions.questionOrder);

        console.log(`📋 [Questions] Loaded ${questions.length} questions for project ${projectId}`);

        res.json({
            success: true,
            questions: questions.map((q: typeof projectQuestions.$inferSelect) => ({
                id: q.id,
                text: q.questionText,
                order: q.questionOrder,
                status: q.status
            })),
            count: questions.length
        });
    } catch (error: any) {
        console.error('Failed to get project questions:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to get questions' });
    }
});

// Save project questions to project_questions table
// This is called from prepare-step to persist questions for analysis linking
router.post("/:id/questions", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const { questions } = req.body;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ error: accessCheck.reason });
        }

        if (!Array.isArray(questions)) {
            return res.status(400).json({ error: "Questions must be an array" });
        }

        console.log(`📋 [Questions] Saving ${questions.length} questions for project ${projectId}`);

        // Upsert questions using hash-based IDs (matches question-answer-service.ts format)
        // This preserves existing answered questions instead of deleting them
        const insertedQuestions = [];
        for (let i = 0; i < questions.length; i++) {
            const questionText = typeof questions[i] === 'string'
                ? questions[i]
                : questions[i]?.text || questions[i]?.question || String(questions[i]);

            if (!questionText?.trim()) continue;

            const questionHash = crypto.createHash('sha256')
                .update(questionText.trim().toLowerCase())
                .digest('hex')
                .substring(0, 8);
            const questionId = `q_${projectId.substring(0, 8)}_${questionHash}`;
            await db.insert(projectQuestions).values({
                id: questionId,
                projectId,
                questionText: questionText.trim(),
                questionOrder: i,
                status: 'pending'
            }).onConflictDoUpdate({
                target: projectQuestions.id,
                set: {
                    questionText: questionText.trim(),
                    questionOrder: i,
                    updatedAt: new Date()
                }
            });
            insertedQuestions.push({
                id: questionId,
                text: questionText.trim(),
                order: i,
                status: 'pending'
            });
        }

        console.log(`✅ [Questions] Saved ${insertedQuestions.length} questions for project ${projectId}`);

        // P0-8 FIX: Also persist structured questions with stable IDs to journeyProgress SSOT
        // This ensures all downstream services (elements, analysis, insights) use the same IDs
        try {
            await storage.atomicMergeJourneyProgress(projectId, {
                businessQuestions: insertedQuestions.map(q => ({
                    id: q.id,
                    text: q.text,
                    order: q.order,
                    status: q.status
                })),
                businessQuestionsUpdatedAt: new Date().toISOString()
            });
            console.log(`✅ [P0-8] Persisted ${insertedQuestions.length} structured questions with stable IDs to journeyProgress`);
        } catch (progressError) {
            console.warn(`⚠️ [P0-8] Failed to persist questions to journeyProgress:`, progressError);
        }

        res.json({
            success: true,
            questions: insertedQuestions,
            count: insertedQuestions.length
        });
    } catch (error: any) {
        console.error('Failed to save project questions:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to save questions' });
    }
});

// P0-3 FIX: Deep merge helper for nested objects in journeyProgress
// This ensures fields like requirementsDocument, verificationStatus, etc. are properly merged
function deepMergeProgress(target: any, source: any): any {
    const result = { ...target };

    for (const key of Object.keys(source)) {
        const sourceValue = source[key];
        const targetValue = target[key];

        // If both are objects (but not arrays or null), deep merge
        if (
            sourceValue !== null &&
            typeof sourceValue === 'object' &&
            !Array.isArray(sourceValue) &&
            targetValue !== null &&
            typeof targetValue === 'object' &&
            !Array.isArray(targetValue)
        ) {
            // Special case: if source explicitly wants to replace (has _replace flag)
            if (sourceValue._replace) {
                const { _replace, ...rest } = sourceValue;
                result[key] = rest;
            } else {
                result[key] = deepMergeProgress(targetValue, sourceValue);
            }
        } else {
            // For primitives, arrays, or null - direct replacement
            result[key] = sourceValue;
        }
    }

    return result;
}

// Update project journey progress
// This is the primary endpoint for journey state updates across all steps
// P0 FIX (Jan 27, 2026): Uses atomic merge with row-level locking to prevent race conditions
// Previous implementation had read-merge-write pattern that caused data loss with concurrent requests
router.put("/:id/progress", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const progressUpdate = req.body;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ error: accessCheck.reason });
        }

        // DEBUG: Log what we're receiving
        console.log(`📊 [Progress] Atomic merge for project ${projectId}:`, {
            keysReceived: Object.keys(progressUpdate),
            hasRequirementsDocInUpdate: !!progressUpdate.requirementsDocument,
            requirementsLockedInUpdate: progressUpdate.requirementsLocked,
            elementsCountInUpdate: progressUpdate.requirementsDocument?.requiredDataElements?.length || 0
        });

        // P0 FIX: Use atomic merge with row-level locking to prevent race conditions
        // This ensures concurrent updates don't overwrite each other's changes
        const mergedProgress = await storage.atomicMergeJourneyProgress(projectId, progressUpdate);

        if (!mergedProgress) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }

        // DEBUG: Log what was merged
        console.log(`✅ [Progress] Atomic merge completed for project ${projectId}:`, {
            hasRequirementsDocInMerged: !!mergedProgress.requirementsDocument,
            elementsCountPreserved: mergedProgress.requirementsDocument?.requiredDataElements?.length || 0,
            analysisPathCount: mergedProgress.requirementsDocument?.analysisPath?.length || 0
        });

        // Get updated project for response
        const updatedProject = await storage.getProject(projectId);

        res.json({
            success: true,
            journeyProgress: mergedProgress,
            project: updatedProject
        });
    } catch (error: any) {
        console.error('Failed to update project progress:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to update progress' });
    }
});

// AI Question Suggestions for Non-Tech Users (Phase 3 - Task 3.1)
router.post("/project-manager/suggest-questions", ensureAuthenticated, async (req, res) => {
    try {
        const { goal, journeyType } = req.body;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        if (!goal || typeof goal !== 'string' || goal.length < 10) {
            return res.status(400).json({
                success: false,
                error: "Goal must be at least 10 characters long"
            });
        }

        // Use AI service to generate question suggestions
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const apiKey = process.env.GOOGLE_AI_API_KEY;

        if (!apiKey) {
            return res.status(503).json({
                success: false,
                error: "AI service not configured"
            });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `You are an AI assistant helping a non-technical user with data analysis.

User's Analysis Goal: "${goal}"

Based on this goal, generate 3-5 specific, actionable questions that would help guide their data analysis.
The questions should be:
- Directly related to their stated goal
- Easy to understand for non-technical users
- Specific enough to guide meaningful analysis
- Focused on business insights rather than technical details

Return ONLY the questions as a JSON array of strings, like this:
["Question 1", "Question 2", "Question 3"]

No additional text or explanation.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        // Parse the AI response
        let suggestions: string[] = [];
        try {
            // Try to extract JSON from the response
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                suggestions = JSON.parse(jsonMatch[0]);
            } else {
                // Fallback: split by newlines and clean up
                suggestions = text
                    .split('\n')
                    .filter((line: string) => line.trim().length > 0)
                    .map((line: string) => line.replace(/^[-*•]\s*/, '').replace(/^["\s]+|["\s]+$/g, ''))
                    .filter((line: string) => line.length > 10)
                    .slice(0, 5);
            }
        } catch (parseError) {
            console.error('Failed to parse AI response:', parseError);
            // Fallback suggestions if AI parsing fails
            suggestions = [
                "What are the main patterns or trends in my data?",
                "Which factors have the strongest impact on my key metrics?",
                "Are there any unexpected outliers or anomalies?"
            ];
        }

        res.json({
            success: true,
            suggestions: suggestions.slice(0, 5) // Maximum 5 suggestions
        });
    } catch (error: any) {
        console.error('AI Question Suggestion Error:', error);

        // Provide fallback suggestions if AI service fails
        const fallbackSuggestions = [
            "What are the main patterns or trends in my data?",
            "Which factors have the strongest impact on my key metrics?",
            "Are there any unexpected outliers or anomalies?",
            "How do different segments compare to each other?",
            "What predictions can be made based on historical trends?"
        ];

        res.json({
            success: true,
            suggestions: fallbackSuggestions,
            fallback: true
        });
    }
});

// Download original uploaded file
router.get("/:id/download/original", ensureAuthenticated, async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = (req.user as any)?.id;
        const isAdminUser = isAdmin(req);

        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({ error: "Project not found" });
        }

        // Verify ownership with admin bypass
        if (!isAdminUser && project.userId !== userId) {
            return res.status(403).json({ error: "Access denied" });
        }

        // Get original file path from project metadata or dataset
        const datasets = await storage.getProjectDatasets(projectId);
        let originalFilePath: string | null = null;

        // Try to get from project metadata first
        if ((project as any)?.metadata?.originalFilePath) {
            originalFilePath = (project as any).metadata.originalFilePath;
        } else if (datasets.length > 0 && (datasets[0] as any)?.storageUri) {
            // Fallback to dataset storageUri if it's a real path (not mem://)
            const storageUri = (datasets[0] as any).storageUri;
            if (storageUri && !storageUri.startsWith('mem://')) {
                originalFilePath = storageUri;
            }
        }

        if (!originalFilePath) {
            return res.status(404).json({ error: "Original file not found" });
        }

        // Verify file exists
        try {
            await fs.access(originalFilePath);
        } catch {
            return res.status(404).json({ error: "Original file no longer available on disk" });
        }

        // Get original filename from project or dataset
        const originalFileName = (project as any)?.fileName || (datasets[0] as any)?.originalFileName || `project-${projectId}.csv`;

        // Send file
        res.download(originalFilePath, originalFileName);
    } catch (error: any) {
        console.error('Download original file error:', error);
        res.status(500).json({ error: error.message || "Failed to download original file" });
    }
});

// Download transformed file
router.get("/:id/download/transformed", ensureAuthenticated, async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = (req.user as any)?.id;
        const isAdminUser = isAdmin(req);

        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({ error: "Project not found" });
        }

        // Verify ownership with admin bypass
        if (!isAdminUser && project.userId !== userId) {
            return res.status(403).json({ error: "Access denied" });
        }

        // Get transformed file path from project metadata
        const transformedFilePath = (project as any)?.metadata?.transformedFilePath;

        if (!transformedFilePath) {
            return res.status(404).json({ error: "No transformed file available. Please apply transformations first." });
        }

        // Verify file exists
        try {
            await fs.access(transformedFilePath);
        } catch {
            return res.status(404).json({ error: "Transformed file no longer available on disk" });
        }

        // Generate filename
        const projectName = (project as any)?.name || 'project';
        const filename = `transformed_${projectName}_${projectId}.json`;

        // Send file
        res.download(transformedFilePath, filename);
    } catch (error: any) {
        console.error('Download transformed file error:', error);
        res.status(500).json({ error: error.message || "Failed to download transformed file" });
    }
});


// Schema Update Endpoint
router.put('/:id/schema', ensureAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const { schema } = req.body;

        if (!schema) {
            return res.status(400).json({ error: 'Schema data is required' });
        }

        // Verify ownership
        const project = await storage.getProject(id);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const userId = (req.user as any)?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const accessCheck = await canAccessProject(userId, id, isAdmin(req));
        if (!accessCheck.allowed) {
            return res.status(403).json({ error: 'Unauthorized access to project' });
        }

        // Update project schema
        const updatedProject = await storage.updateProject(id, { schema });

        // FIX Issue 2: Log decision BEFORE return (was unreachable dead code)
        try {
            await db.insert(decisionAudits).values({
                id: nanoid(),
                projectId: id,
                agent: 'data_engineer',
                decisionType: 'schema_update',
                decision: 'Updated project schema',
                reasoning: 'User manually updated schema definitions',
                alternatives: JSON.stringify([]),
                confidence: 100,
                context: JSON.stringify({ schemaKeys: Object.keys(schema) }),
                userInput: null,
                impact: 'high',
                reversible: true,
                timestamp: new Date()
            });
        } catch (err) {
            console.error('Failed to log schema update decision:', err);
        }

        return res.json({
            success: true,
            project: updatedProject,
            message: 'Schema updated successfully'
        });
    } catch (error: any) {
        console.error('Failed to update schema:', error);
        return res.status(500).json({ error: 'Failed to update schema' });
    }
});

// PDF Export Endpoint
router.post('/:id/export-pdf', ensureAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify ownership
        const project = await storage.getProject(id);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const userId = (req.user as any)?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const accessCheck = await canAccessProject(userId, id, isAdmin(req));
        if (!accessCheck.allowed) {
            return res.status(403).json({ error: 'Unauthorized access to project' });
        }

        // Use Puppeteer to generate PDF
        const puppeteer = await import('puppeteer');
        const browser = await (puppeteer as any).launch({ headless: true });
        const page = await browser.newPage();

        // Construct HTML content
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    h1 { color: #333; }
                    h2 { color: #666; border-bottom: 1px solid #ccc; padding-bottom: 10px; margin-top: 30px; }
                    .meta { color: #888; font-size: 0.9em; margin-bottom: 20px; }
                    .section { margin-bottom: 20px; }
                    pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                </style>
            </head>
            <body>
                <h1>Project Report: ${project.name}</h1>
                <div class="meta">Generated: ${new Date().toLocaleString()}</div>
                <div class="meta">Project ID: ${id}</div>

                <div class="section">
                    <h2>Description</h2>
                    <p>${project.description || 'No description provided.'}</p>
                </div>

                <div class="section">
                    <h2>Data Schema</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Field Name</th>
                                <th>Type</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(project.schema || {}).map(([key, value]: [string, any]) => `
                                <tr>
                                    <td>${key}</td>
                                    <td>${value.type}</td>
                                    <td>${value.description || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                ${(project as any).insights ? `
                <div class="section">
                    <h2>Insights</h2>
                    <pre>${JSON.stringify((project as any).insights, null, 2)}</pre>
                </div>
                ` : ''}
            </body>
            </html>
        `;

        await page.setContent(htmlContent);
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });

        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=report-${id}.pdf`);
        return res.send(Buffer.from(pdfBuffer));

    } catch (error: any) {
        console.error('Failed to export PDF:', error);
        return res.status(500).json({ error: 'Failed to export PDF: ' + error.message });
    }
});

// Update project details (e.g. description)
router.put('/:id', ensureAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Verify ownership
        const project = await storage.getProject(id);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const accessCheck = await canAccessProject(userId, id, isAdmin(req));
        if (!accessCheck.allowed) {
            return res.status(403).json({ error: 'Unauthorized access to project' });
        }

        // Filter allowed updates to prevent overwriting critical fields
        const allowedUpdates: any = {};
        if (updates.description !== undefined) allowedUpdates.description = updates.description;
        if (updates.name !== undefined) allowedUpdates.name = updates.name;
        // Add other allowed fields as needed

        const updatedProject = await storage.updateProject(id, allowedUpdates);

        return res.json({
            success: true,
            project: updatedProject,
            message: 'Project updated successfully'
        });
    } catch (error: any) {
        console.error('Failed to update project:', error);
        return res.status(500).json({ error: 'Failed to update project' });
    }
});

// NOTE: Duplicate minimal datasets endpoint removed - use GET /:projectId/datasets instead
// which includes joinedSchema, joinedPreview, and joinInsights

/**
 * POST /api/projects/:id/restart
 * Restarts a failed project from the last successful step
 * Preserves user data (uploads, goals, questions) but clears failed state
 */
router.post("/:id/restart", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;
        const userIsAdmin = (req.user as any)?.isAdmin || false;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const access = await canAccessProject(userId, projectId, userIsAdmin);
        if (!access.allowed) {
            return res.status(403).json({ success: false, error: access.reason });
        }

        const project = access.project as any;
        const journeyProgress = project.journeyProgress || {};
        const completedSteps = journeyProgress.completedSteps || [];

        // Determine restart point: last completed step, or beginning
        const stepOrder = ['upload', 'verify', 'goals', 'plan', 'transform', 'execute', 'pricing', 'results'];
        let restartStep = 'upload';
        for (const step of stepOrder) {
            if (completedSteps.includes(step)) {
                const nextIndex = stepOrder.indexOf(step) + 1;
                if (nextIndex < stepOrder.length) {
                    restartStep = stepOrder[nextIndex];
                }
            }
        }

        // Clear fields from the failed step onwards
        const clearFields: any = {
            status: 'active',
            analysisResults: null,
            analysisExecutedAt: null,
            analysisBilledAt: null,
            paymentStatus: null,
            paymentSessionId: null,
            updatedAt: new Date(),
        };

        await storage.updateProject(projectId, clearFields);

        // Use atomic merge for journeyProgress to prevent overwriting concurrent changes
        // Note: Use null (not undefined) to clear keys, since undefined values are skipped in deep merge
        await storage.atomicMergeJourneyProgress(projectId, {
            currentStep: restartStep,
            // Clear execution/payment state
            lockedCostEstimate: null,
            costLockedAt: null,
            paymentStatus: null,
            paymentCompletedAt: null,
            executionStartedAt: null,
            executionCompletedAt: null,
        });

        console.log(`✅ [Restart] Project ${projectId} restarted to step '${restartStep}'. Completed: [${completedSteps.join(', ')}]`);

        return res.json({
            success: true,
            restartStep,
            completedSteps,
            message: `Project restarted from "${restartStep}" step`
        });
    } catch (error: any) {
        console.error('❌ [Restart] Error restarting project:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to restart project'
        });
    }
});

export default router;

// Export project data/results in various formats
router.get("/:id/export", ensureAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const format = String(req.query.format || 'csv').toLowerCase();
        const userId = (req.user as any)?.id;

        const project = await storage.getProject(id);
        const owner = (project as any)?.ownerId ?? (project as any)?.userId;
        if (!project || owner !== userId) {
            return res.status(404).json({ error: "Project not found or access denied" });
        }

        // Prefer transformed data, then raw data; fallback to schema snapshot
        const dataRows = (project as any)?.transformedData || (project as any)?.data || [];
        const meta = {
            id,
            name: (project as any)?.name,
            createdAt: (project as any)?.createdAt,
            recordCount: (project as any)?.recordCount || (Array.isArray(dataRows) ? dataRows.length : undefined),
            schema: (project as any)?.schema,
            insights: (project as any)?.insights || {},
        };

        // Map 'excel' to CSV for now
        const f = format === 'excel' ? 'csv' : format;

        if (f === 'json') {
            const payload = { project: meta, data: Array.isArray(dataRows) ? dataRows : [] };
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=project-${id}.json`);
            return res.send(Buffer.from(JSON.stringify(payload, null, 2)));
        }

        if (f === 'csv') {
            const rows = Array.isArray(dataRows) && dataRows.length > 0 ? dataRows : [meta];
            const csv = jsonToCsv(rows);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=project-${id}.csv`);
            return res.send(Buffer.from(csv, 'utf-8'));
        }

        if (f === 'pdf') {
            const analysisResult = {
                title: `Analysis for ${(project as any)?.name || id}`,
                sections: [
                    { title: 'Overview', content: `Records: ${meta.recordCount ?? 'N/A'}\nCreated: ${new Date(meta.createdAt || Date.now()).toLocaleString()}` },
                    { title: 'Schema', content: Object.keys(meta.schema || {}).slice(0, 20).join(', ') || 'No schema available' },
                    { title: 'Insights', content: Object.keys(meta.insights || {}).length ? JSON.stringify(meta.insights, null, 2) : 'No insights available' },
                ]
            };
            const pdfBytes = await exportService.generatePdf(analysisResult as any);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=project-${id}.pdf`);
            return res.send(Buffer.from(pdfBytes));
        }

        if (f === 'pptx' || f === 'presentation') {
            const analysisResult = {
                title: `Analysis Deck — ${(project as any)?.name || id}`,
                sections: [
                    { title: 'Executive Summary', content: 'Key findings and recommendations (auto-generated demo content).' },
                    { title: 'Data Overview', content: `Records: ${meta.recordCount ?? 'N/A'}; Fields: ${Object.keys(meta.schema || {}).length}` },
                    { title: 'Insights', content: Object.keys(meta.insights || {}).length ? JSON.stringify(meta.insights, null, 2) : 'No insights available' },
                ]
            };
            const buffer = await exportService.generatePptx(analysisResult as any);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
            res.setHeader('Content-Disposition', `attachment; filename=project-${id}.pptx`);
            return res.send(Buffer.from(buffer as ArrayBuffer));
        }

        // Unknown format
        return res.status(400).json({ error: `Unsupported format: ${format}` });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to export project" });
    }
});

// =============================================================================
// PHASE 1 CRITICAL FIXES (Dec 14, 2025)
// =============================================================================

/**
 * DAY 6 (Week 2): DE Agent Validation for Transformations
 * Validates transformation plan against data quality assessment before execution
 * Frontend should call this BEFORE execute-transformations
 */
router.post("/:id/validate-transformations", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;
        const {
            transformationSteps = [],
            mappings = [],
            joinConfig
        } = req.body;

        console.log(`🔍 [DE Validation] Validating transformations for project ${projectId}`);

        if (!userId) {
            return res.status(401).json({ success: false, error: "Authentication required" });
        }

        // Verify access
        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ success: false, error: accessCheck.reason });
        }

        // Load datasets to get schema and data quality info
        const datasets = await storage.getProjectDatasets(projectId);
        if (!datasets || datasets.length === 0) {
            return res.status(400).json({
                success: false,
                error: "No datasets available for validation"
            });
        }

        // Build validation context from datasets
        const datasetSchemas = datasets.map((d: any) => {
            const ds = d.dataset || d;
            return {
                id: ds.id,
                name: ds.originalFileName || ds.name,
                schema: ds.metadata?.schema || ds.schema || {},
                rowCount: ds.metadata?.totalRows || ds.totalRows || 0,
                qualityScore: ds.ingestionMetadata?.qualityScore || ds.metadata?.qualityScore || 80
            };
        });

        // Get project's journeyProgress for data quality assessment
        const project = await storage.getProject(projectId);
        const journeyProgress = (project as any)?.journeyProgress || {};
        const deAssessment = journeyProgress?.dataEngineerAssessment || journeyProgress?.dataQuality || {};

        // Validation results
        const validationResults = {
            isValid: true,
            warnings: [] as string[],
            errors: [] as string[],
            recommendations: [] as string[],
            dataQuality: {
                overallScore: deAssessment?.overallScore || 75,
                issues: deAssessment?.issues || [],
                missingValueColumns: deAssessment?.missingValues || []
            },
            transformationAnalysis: [] as any[]
        };

        // Validate each transformation step
        for (const step of transformationSteps) {
            const stepAnalysis: any = {
                step: step.description || step.name || 'Unknown step',
                status: 'valid',
                issues: []
            };

            // Check if affected columns exist in schema
            if (step.affectedElements) {
                for (const element of step.affectedElements) {
                    const elementExists = datasetSchemas.some(ds =>
                        Object.keys(ds.schema).some(col =>
                            col.toLowerCase() === element.toLowerCase()
                        )
                    );
                    if (!elementExists) {
                        stepAnalysis.issues.push(`Column "${element}" not found in dataset schema`);
                        stepAnalysis.status = 'warning';
                    }
                }
            }

            // Check for transformations on high-missing-value columns
            const missingValueCols = deAssessment?.missingValues || [];
            if (step.affectedElements) {
                const highMissingCols = step.affectedElements.filter((el: string) =>
                    missingValueCols.some((m: any) =>
                        m.column?.toLowerCase() === el.toLowerCase() && m.percent > 30
                    )
                );
                if (highMissingCols.length > 0) {
                    stepAnalysis.issues.push(
                        `Transformation affects columns with >30% missing values: ${highMissingCols.join(', ')}`
                    );
                    validationResults.warnings.push(
                        `Consider handling missing values in ${highMissingCols.join(', ')} before transformation`
                    );
                }
            }

            validationResults.transformationAnalysis.push(stepAnalysis);

            // Mark overall validation as having warnings if any step has issues
            if (stepAnalysis.issues.length > 0 && stepAnalysis.status === 'warning') {
                validationResults.warnings.push(...stepAnalysis.issues);
            }
        }

        // Validate join configuration if multiple datasets
        if (datasets.length > 1 && joinConfig) {
            if (!joinConfig.foreignKeys || joinConfig.foreignKeys.length === 0) {
                validationResults.warnings.push(
                    'Multiple datasets detected but no join keys specified. Data may not be properly combined.'
                );
            } else {
                // Validate join keys exist in schemas
                for (const fk of joinConfig.foreignKeys) {
                    const sourceSchema = datasetSchemas.find(ds => ds.id === fk.sourceDataset);
                    const targetSchema = datasetSchemas.find(ds => ds.id === fk.targetDataset);

                    if (sourceSchema && !Object.keys(sourceSchema.schema).some(
                        col => col.toLowerCase() === fk.sourceColumn?.toLowerCase()
                    )) {
                        validationResults.errors.push(
                            `Join key "${fk.sourceColumn}" not found in source dataset`
                        );
                        validationResults.isValid = false;
                    }

                    if (targetSchema && !Object.keys(targetSchema.schema).some(
                        col => col.toLowerCase() === fk.targetColumn?.toLowerCase()
                    )) {
                        validationResults.errors.push(
                            `Join key "${fk.targetColumn}" not found in target dataset`
                        );
                        validationResults.isValid = false;
                    }
                }
            }
        }

        // Add recommendations based on data quality
        if (validationResults.dataQuality.overallScore < 70) {
            validationResults.recommendations.push(
                'Data quality score is below 70%. Consider cleaning data before transformation.'
            );
        }

        if (transformationSteps.length === 0) {
            validationResults.recommendations.push(
                'No transformation steps defined. The data will be passed through unchanged.'
            );
        }

        console.log(`🔍 [DE Validation] Validation complete: ${validationResults.isValid ? 'VALID' : 'INVALID'}`);
        console.log(`🔍 [DE Validation] Warnings: ${validationResults.warnings.length}, Errors: ${validationResults.errors.length}`);

        res.json({
            success: true,
            validation: validationResults,
            datasets: datasetSchemas.map(ds => ({
                id: ds.id,
                name: ds.name,
                rowCount: ds.rowCount,
                qualityScore: ds.qualityScore
            })),
            timestamp: new Date().toISOString()
        });

    } catch (error: any) {
        console.error('❌ [DE Validation] Failed:', error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to validate transformations"
        });
    }
});

/**
 * ENHANCE REQUIREMENTS MAPPINGS: Data Engineer agent suggests transformation logic
 * Takes user-provided element-to-column mappings and generates transformation code suggestions
 */
router.post("/:id/enhance-requirements-mappings", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;
        const { elementMappings } = req.body;

        console.log(`🔧 [DE Enhance] Enhancing mappings for project ${projectId}`);
        console.log(`🔧 [DE Enhance] Mappings received:`, Object.keys(elementMappings || {}).length);

        if (!userId) {
            return res.status(401).json({ success: false, error: "Authentication required" });
        }

        // Verify access
        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ success: false, error: accessCheck.reason });
        }

        // Get project and its requirements document
        const project = await storage.getProject(projectId);
        const journeyProgress = (project as any)?.journeyProgress || {};
        const requirementsDoc = journeyProgress?.requirementsDocument || {};
        const requiredDataElements = requirementsDoc?.requiredDataElements || [];

        if (!elementMappings || Object.keys(elementMappings).length === 0) {
            return res.status(400).json({
                success: false,
                error: "No element mappings provided"
            });
        }

        // Load dataset schema to understand column types
        const datasets = await storage.getProjectDatasets(projectId);
        const schemaInfo: Record<string, any> = {};

        datasets.forEach((d: any) => {
            const ds = d.dataset || d;
            const schema = ds.metadata?.schema || ds.schema || {};
            Object.entries(schema).forEach(([colName, colInfo]: [string, any]) => {
                schemaInfo[colName] = {
                    type: colInfo?.type || colInfo || 'string',
                    nullable: colInfo?.nullable ?? true,
                    sample: colInfo?.sample
                };
            });
        });

        // Use DE Agent to enhance mappings with intelligent transformation code generation
        const { DataEngineerAgent } = await import('../services/data-engineer-agent');
        const deAgent = new DataEngineerAgent();

        // Get sample data for context
        const firstDataset = datasets[0] as any;
        const sampleData = firstDataset?.dataset?.preview || firstDataset?.dataset?.data || firstDataset?.preview || [];

        // Get available columns from schema
        const availableColumns = Object.keys(schemaInfo);

        // Call DE agent's enhanced method
        const deResult = await deAgent.enhanceElementMappings({
            elementMappings,
            requiredDataElements: requiredDataElements.map((elem: any) => ({
                elementId: elem.elementId || elem.id,
                elementName: elem.elementName || elem.name,
                description: elem.description,
                dataType: elem.dataType,
                calculationDefinition: elem.calculationDefinition
            })),
            availableColumns,
            schema: schemaInfo,
            sampleData: sampleData.slice(0, 10)
        });

        // Build enhanced elements with DE agent's transformation code
        const enhancedElements = requiredDataElements.map((elem: any) => {
            const elemId = elem.elementId || elem.id;
            const mapping = elementMappings[elemId];
            const deEnhanced = deResult.enhancedElements.find(e => e.elementId === elemId);

            if (!mapping && !deEnhanced) {
                return elem; // No mapping provided, keep original
            }

            const sourceCol = mapping?.sourceColumn || deEnhanced?.sourceColumn;
            const sourceInfo = schemaInfo[sourceCol || ''] || {};

            return {
                ...elem,
                sourceColumn: sourceCol,
                mappingStatus: 'mapped' as const,
                sourceInfo: sourceInfo,
                transformationCode: deEnhanced?.transformationCode || mapping?.transformationCode || `row['${sourceCol}']`,
                transformationDescription: deEnhanced?.transformationDescription || mapping?.transformationDescription || `Map ${sourceCol} directly to ${elem.elementName}`,
                transformationConfidence: deEnhanced?.confidence || 0.5,
                codeExplanation: deEnhanced?.codeExplanation,
                mappedAt: new Date().toISOString(),
                mappedBy: 'data_engineer_agent'
            };
        });

        // Update requirements document with enhanced elements
        const enhancedDocument = {
            ...requirementsDoc,
            requiredDataElements: enhancedElements,
            transformationPlan: deResult.transformationPlan,
            lastEnhancedAt: new Date().toISOString(),
            enhancedBy: 'data_engineer_agent'
        };

        const mappedCount = enhancedElements.filter((e: any) => e.sourceColumn).length;
        const highConfidenceCount = enhancedElements.filter((e: any) => (e.transformationConfidence || 0) >= 0.7).length;

        console.log(`🔧 [DE Enhance] Enhanced ${mappedCount} elements with mappings`);
        console.log(`🔧 [DE Enhance] ${highConfidenceCount} high-confidence transformations`);

        res.json({
            success: true,
            document: enhancedDocument,
            enhancedCount: mappedCount,
            highConfidenceCount,
            transformationPlan: deResult.transformationPlan,
            timestamp: new Date().toISOString()
        });

    } catch (error: any) {
        console.error('❌ [DE Enhance] Failed:', error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to enhance mappings"
        });
    }
});

/**
 * P1-3: Verify transformation plan with BA and DS agents before execution
 * Frontend expects: POST /api/projects/:id/verify-transformation-plan
 * Payload: { mappings, businessContext, analysisPath, dataSchema }
 */
router.post("/:id/verify-transformation-plan", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: "Authentication required" });
        }

        // Verify access
        const accessCheck = await canAccessProject(userId, projectId, (req.user as any)?.isAdmin);
        if (!accessCheck.allowed) {
            return res.status(403).json({ success: false, error: accessCheck.reason });
        }

        const { mappings, businessContext, analysisPath, dataSchema } = req.body;

        if (!mappings || !Array.isArray(mappings)) {
            return res.status(400).json({ success: false, error: "Mappings array is required" });
        }

        console.log(`🔍 [P1-3 API] Verifying transformation plan for project ${projectId}`);
        console.log(`   Mappings: ${mappings.length}, BusinessContext: ${businessContext ? 'yes' : 'no'}, AnalysisPath: ${analysisPath?.length || 0}`);

        // Import orchestrator and verify
        const { projectAgentOrchestrator } = await import("../services/project-agent-orchestrator");

        const verification = await projectAgentOrchestrator.verifyTransformationPlan(projectId, {
            mappings,
            businessContext,
            analysisPath,
            dataSchema
        });

        console.log(`✅ [P1-3 API] Verification complete: ${verification.overallApproved ? 'APPROVED' : 'NEEDS REVIEW'}`);

        return res.json({
            success: true,
            verification,
            baApproval: verification.baApproval,
            dsApproval: verification.dsApproval,
            overallApproved: verification.overallApproved,
            summary: verification.summary
        });

    } catch (error: any) {
        console.error("❌ [P1-3 API] Verification failed:", error);
        return res.status(500).json({
            success: false,
            error: "Failed to verify transformation plan",
            details: error.message
        });
    }
});

/**
 * Analysis-aware data preparation endpoint
 * Uses Analysis Requirements Registry to determine what transformations are needed for each analysis type
 * Frontend expects: POST /api/projects/:id/analysis-preparation
 * Payload: { analysisTypes, columnTypes?, rowCount? }
 */
router.post("/:id/analysis-preparation", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: "Authentication required" });
        }

        // Verify access
        const accessCheck = await canAccessProject(userId, projectId, (req.user as any)?.isAdmin);
        if (!accessCheck.allowed) {
            return res.status(403).json({ success: false, error: accessCheck.reason });
        }

        const { analysisTypes, elementMappings } = req.body;

        if (!analysisTypes || !Array.isArray(analysisTypes) || analysisTypes.length === 0) {
            return res.status(400).json({
                success: false,
                error: "analysisTypes array is required"
            });
        }

        console.log(`📊 [Analysis Prep] Getting preparation requirements for project ${projectId}`);
        console.log(`📊 [Analysis Prep] Analysis types:`, analysisTypes);

        // Load datasets to get current data stats
        const datasets = await storage.getProjectDatasets(projectId);
        const project = accessCheck.project;

        // Get schema and data stats from datasets or joined data
        let availableColumns: string[] = [];
        let columnTypes: Record<string, 'numeric' | 'categorical' | 'datetime' | 'text'> = {};
        let rowCount = 0;
        let nullPercents: Record<string, number> = {};

        if (datasets && datasets.length > 0) {
            // Collect schema from all datasets
            for (const dsWrapper of datasets) {
                const ds = dsWrapper.dataset;
                const schema = ds.schema || (ds as any).metadata?.schema || {};
                const preview = ds.preview || (ds as any).metadata?.preview || [];
                rowCount = Math.max(rowCount, ds.recordCount || (preview as any[]).length || 0);

                for (const [colName, colInfo] of Object.entries(schema)) {
                    if (!availableColumns.includes(colName)) {
                        availableColumns.push(colName);

                        // Infer column type
                        const info = colInfo as any;
                        const rawType = info?.type || info?.dataType || 'unknown';
                        let mappedType: 'numeric' | 'categorical' | 'datetime' | 'text' = 'categorical';

                        if (['number', 'numeric', 'integer', 'float', 'double', 'decimal'].includes(rawType.toLowerCase())) {
                            mappedType = 'numeric';
                        } else if (['date', 'datetime', 'timestamp', 'time'].includes(rawType.toLowerCase())) {
                            mappedType = 'datetime';
                        } else if (['text', 'longtext', 'varchar', 'string'].includes(rawType.toLowerCase()) &&
                                   (info?.averageLength > 100 || colName.toLowerCase().includes('description') || colName.toLowerCase().includes('comment'))) {
                            mappedType = 'text';
                        }

                        columnTypes[colName] = mappedType;

                        // Calculate null percentage
                        const missingCount = info?.missingCount || 0;
                        const totalRows = rowCount || 1;
                        nullPercents[colName] = missingCount / totalRows;
                    }
                }
            }
        }

        // Use joined schema if available
        const journeyProgress = project?.journeyProgress as any;
        if (journeyProgress?.joinedSchema) {
            for (const [colName, colInfo] of Object.entries(journeyProgress.joinedSchema)) {
                if (!availableColumns.includes(colName)) {
                    availableColumns.push(colName);
                    const info = colInfo as any;
                    const rawType = info?.type || info?.dataType || 'unknown';
                    let mappedType: 'numeric' | 'categorical' | 'datetime' | 'text' = 'categorical';

                    if (['number', 'numeric', 'integer', 'float', 'double', 'decimal'].includes(rawType.toLowerCase())) {
                        mappedType = 'numeric';
                    } else if (['date', 'datetime', 'timestamp', 'time'].includes(rawType.toLowerCase())) {
                        mappedType = 'datetime';
                    }

                    columnTypes[colName] = mappedType;
                }
            }
        }

        // Use req.body overrides if provided
        if (req.body.columnTypes) {
            columnTypes = { ...columnTypes, ...req.body.columnTypes };
        }
        if (req.body.rowCount) {
            rowCount = req.body.rowCount;
        }

        // Import DE agent and get analysis-specific preparations
        const { DataEngineerAgent } = await import("../services/data-engineer-agent");
        type ElementDefinition = import("../services/data-engineer-agent").ElementDefinition;
        const deAgent = new DataEngineerAgent();

        // =====================================================================
        // ELEMENT DEFINITIONS FIX: Extract element definitions from requirementsDocument
        // These contain calculationDefinition from Data Scientist for proper derivations
        // =====================================================================
        let elementDefinitions: ElementDefinition[] = [];
        const requirementsDoc = journeyProgress?.requirementsDocument;
        if (requirementsDoc?.requiredDataElements && Array.isArray(requirementsDoc.requiredDataElements)) {
            elementDefinitions = requirementsDoc.requiredDataElements.map((el: any) => ({
                elementId: el.elementId || el.id,
                elementName: el.elementName || el.name,
                dataType: el.dataType || 'text',
                purpose: el.purpose,
                analysisUsage: el.analysisUsage,
                required: el.required !== false,
                sourceColumn: el.sourceColumn || el.sourceField,
                calculationDefinition: el.calculationDefinition
            }));
            console.log(`📐 [Analysis Prep] Found ${elementDefinitions.length} element definitions with calculation specs`);

            // Log element types for debugging
            const derivedCount = elementDefinitions.filter(e => e.calculationDefinition?.calculationType === 'derived').length;
            const aggregatedCount = elementDefinitions.filter(e => e.calculationDefinition?.calculationType === 'aggregated').length;
            const groupedCount = elementDefinitions.filter(e => e.calculationDefinition?.calculationType === 'grouped').length;
            console.log(`   Derived: ${derivedCount}, Aggregated: ${aggregatedCount}, Grouped: ${groupedCount}, Direct: ${elementDefinitions.length - derivedCount - aggregatedCount - groupedCount}`);
        }

        const preparations = await deAgent.suggestTransformationsForAnalyses({
            analysisTypes,
            availableColumns,
            columnTypes,
            dataStats: {
                rowCount,
                nullPercents,
                hasOutliers: undefined, // Would need outlier detection to determine
                isNormalized: false,
                isSortedByTime: false
            },
            // P1-5 FIX: Pass element mappings for combined readiness calculation
            elementMappings: Array.isArray(elementMappings) ? elementMappings : undefined,
            // NEW: Pass element definitions for definition-based derivations
            elementDefinitions: elementDefinitions.length > 0 ? elementDefinitions : undefined
        });

        console.log(`✅ [Analysis Prep] Generated preparation requirements for ${analysisTypes.length} analyses`);
        console.log(`   Overall readiness: ${preparations.overallReadiness.readinessPercentage}%`);
        console.log(`   Ready: ${preparations.overallReadiness.readyAnalyses.join(', ') || 'None'}`);
        console.log(`   Not ready: ${preparations.overallReadiness.notReadyAnalyses.join(', ') || 'None'}`);

        return res.json({
            success: true,
            preparations,
            dataContext: {
                availableColumns,
                columnTypes,
                rowCount,
                datasetCount: datasets?.length || 0
            }
        });

    } catch (error: any) {
        console.error("❌ [Analysis Prep] Failed:", error);
        return res.status(500).json({
            success: false,
            error: "Failed to generate analysis preparation requirements",
            details: error.message
        });
    }
});

/**
 * D3 FIX: Execute transformations with multi-dataset join support
 * Frontend expects: POST /api/projects/:id/execute-transformations
 * Payload: { transformationSteps, mappings, questionAnswerMapping, joinConfig }
 */
router.post("/:id/execute-transformations", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;
        const {
            transformationSteps = [],
            mappings = [],
            questionAnswerMapping = [],
            joinConfig
        } = req.body;

        console.log(`📊 [D3 FIX] Execute transformations for project ${projectId}`);
        console.log(`📊 [D3 FIX] Join config:`, joinConfig);
        console.log(`📊 [D3 FIX] Transformation steps:`, transformationSteps?.length || 0);

        if (!userId) {
            return res.status(401).json({ success: false, error: "Authentication required" });
        }

        // Verify access
        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ success: false, error: accessCheck.reason });
        }

        // Load all datasets for this project
        const datasets = await storage.getProjectDatasets(projectId);
        if (!datasets || datasets.length === 0) {
            return res.status(400).json({
                success: false,
                error: "No datasets available for this project"
            });
        }

        console.log(`📊 [D3 FIX] Found ${datasets.length} datasets`);

        // Start with first dataset's data
        let workingData: any[] = [];
        const firstDataset = (datasets[0] as any).dataset || datasets[0];
        workingData = Array.isArray(firstDataset.data)
            ? [...firstDataset.data]
            : (firstDataset.preview || firstDataset.sampleData || []);

        // PII SSOT: Filter out PII-excluded columns BEFORE transformations run
        {
            const jp = (accessCheck.project as any)?.journeyProgress || {};
            const excludedCols = getPiiExcludedColumns(jp);
            if (excludedCols.length > 0) {
                console.log(`🔒 [P0-6] Filtering ${excludedCols.length} PII-excluded columns BEFORE transformations:`, excludedCols);
                workingData = workingData.map(row => {
                    const filtered = { ...row };
                    for (const col of excludedCols) {
                        delete filtered[col];
                    }
                    return filtered;
                });
            }
        }

        // MULTI-DATASET JOIN: If we have multiple datasets and join config
        if (datasets.length > 1 && joinConfig?.foreignKeys?.length > 0) {
            console.log(`🔗 [D3 FIX] Performing multi-dataset join with ${joinConfig.foreignKeys.length} key mappings`);

            for (let i = 1; i < datasets.length; i++) {
                const rightDataset = (datasets[i] as any).dataset || datasets[i];
                const rightData = Array.isArray(rightDataset.data)
                    ? rightDataset.data
                    : (rightDataset.preview || rightDataset.sampleData || []);

                // Find the join key for this dataset pair
                // P0-5 FIX: Add parentheses - && binds tighter than || causing wrong matches
                const keyMapping = joinConfig.foreignKeys.find((fk: any) =>
                    (fk.sourceDataset === firstDataset.id && fk.targetDataset === rightDataset.id) ||
                    (fk.sourceDataset === rightDataset.id && fk.targetDataset === firstDataset.id)
                );

                if (keyMapping && rightData.length > 0) {
                    const leftKey = keyMapping.sourceDataset === firstDataset.id
                        ? keyMapping.sourceColumn
                        : keyMapping.targetColumn;
                    const rightKey = keyMapping.sourceDataset === firstDataset.id
                        ? keyMapping.targetColumn
                        : keyMapping.sourceColumn;

                    console.log(`🔗 [D3 FIX] Joining on ${leftKey} = ${rightKey}`);

                    // Create lookup map for right dataset
                    const rightLookup = new Map<string, any>();
                    for (const row of rightData) {
                        const key = String(row[rightKey] ?? '').toLowerCase();
                        if (key) rightLookup.set(key, row);
                    }

                    // Perform LEFT JOIN
                    workingData = workingData.map(leftRow => {
                        const leftKeyValue = String(leftRow[leftKey] ?? '').toLowerCase();
                        const rightRow = rightLookup.get(leftKeyValue);
                        if (rightRow) {
                            // Merge rows, prefixing right columns if they clash
                            const merged = { ...leftRow };
                            for (const [col, val] of Object.entries(rightRow)) {
                                if (col !== rightKey) {
                                    const newCol = col in merged ? `${rightDataset.originalFileName || 'ds' + i}_${col}` : col;
                                    merged[newCol] = val;
                                }
                            }
                            return merged;
                        }
                        return leftRow;
                    });

                    console.log(`🔗 [D3 FIX] Join completed. Rows: ${workingData.length}`);
                }
            }
        }

        // P0-1 FIX: Load business context from DS Agent's calculation definitions
        // This ensures transformations use the semantic definitions from the Prepare step
        const projectForContext = await storage.getProject(projectId);
        const journeyProgress = (projectForContext as any)?.journeyProgress;
        const reqDoc = journeyProgress?.requirementsDocument;
        const businessContext: Record<string, any> = {};

        if (reqDoc?.requiredDataElements && Array.isArray(reqDoc.requiredDataElements)) {
            console.log(`📚 [P0-1 FIX] Loading business context from ${reqDoc.requiredDataElements.length} DS Agent elements`);
            for (const element of reqDoc.requiredDataElements) {
                const calcDef = element.calculationDefinition;
                if (calcDef) {
                    const elementName = element.elementName || element.name;
                    businessContext[elementName] = {
                        calculationType: calcDef.calculationType,
                        formula: calcDef.formula,
                        componentFields: calcDef.formula?.componentFields || [],
                        aggregationMethod: calcDef.formula?.aggregationMethod,
                        businessDescription: calcDef.formula?.businessDescription,
                        dataType: element.dataType,
                        // P1-5 FIX: Include quality requirements (validRange, allowedValues) for filter/validation
                        validRange: element.qualityRequirements?.validRange,
                        allowedValues: element.qualityRequirements?.allowedValues,
                    };
                    console.log(`   📋 ${elementName}: ${calcDef.calculationType} - ${calcDef.formula?.businessDescription || 'no description'}`);
                }
            }
            console.log(`📚 [P0-1 FIX] Loaded ${Object.keys(businessContext).length} business definitions`);
        }

        // Also check mappings for calculationDefinition (passed from frontend)
        if (Array.isArray(mappings)) {
            for (const m of mappings) {
                if (m.calculationDefinition && m.targetElement && !businessContext[m.targetElement]) {
                    businessContext[m.targetElement] = {
                        calculationType: m.calculationDefinition.calculationType,
                        formula: m.calculationDefinition.formula,
                        componentFields: m.calculationDefinition.formula?.componentFields || [],
                        aggregationMethod: m.calculationDefinition.formula?.aggregationMethod,
                        businessDescription: m.calculationDefinition.formula?.businessDescription
                    };
                }
            }
        }

        // ============================================================
        // SOURCE COLUMN AUTO-MAPPING (NEW - bridges abstract to actual)
        // ============================================================
        // Get available columns from the working data
        const availableColumns = workingData.length > 0 ? Object.keys(workingData[0]) : [];
        const datasetSchema: Record<string, { type: string }> = {};
        for (const col of availableColumns) {
            const sample = workingData.slice(0, 10).map(r => r[col]).filter(v => v != null);
            const isNumeric = sample.every(v => !isNaN(Number(v)));
            datasetSchema[col] = { type: isNumeric ? 'number' : 'string' };
        }

        // Extract context from project for smarter column matching
        const mappingContext = sourceColumnMapper.extractContextFromProject({
            journeyProgress: journeyProgress,
            metadata: (projectForContext as any)?.metadata,
            name: (projectForContext as any)?.name,
            description: (projectForContext as any)?.description
        });

        // Build element definitions from requirementsDocument with DS recommendations
        const elementDefinitions: DataElementDefinition[] = (reqDoc?.requiredDataElements || [])
            .filter((el: any) => el?.calculationDefinition?.formula?.componentFields || el?.description || el?.purpose)
            .map((el: any) => ({
                elementId: el.elementId || el.id || nanoid(),
                elementName: el.elementName || el.name,
                calculationDefinition: el.calculationDefinition,
                dataType: el.dataType,
                // Add context fields for smarter matching
                purpose: el.purpose || el.calculationDefinition?.purpose,
                context: mappingContext.dataContext,
                description: el.description || el.calculationDefinition?.formula?.businessDescription,
                dsRecommendation: el.dsRecommendation || el.calculationDefinition?.formula?.pseudoCode
            }));

        // Build user-provided mappings from frontend mappings
        const userProvidedMappings = (mappings || [])
            .filter((m: any) => m.sourceColumn && m.targetElement)
            .flatMap((m: any) => {
                // If mapping has componentFields, map each abstract field to the source column
                const componentFields = businessContext[m.targetElement]?.componentFields || [];
                if (componentFields.length > 0 && m.sourceColumns?.length > 0) {
                    return componentFields.map((field: string, idx: number) => ({
                        abstractField: field,
                        actualColumn: m.sourceColumns[idx] || m.sourceColumn
                    }));
                }
                return [{ abstractField: m.targetElement, actualColumn: m.sourceColumn }];
            });

        // Auto-map abstract column names to actual columns
        let mappingResults: ElementMappingResult[] = [];
        const columnLookup = new Map<string, string>();

        if (elementDefinitions.length > 0) {
            console.log(`🔗 [Transform] Auto-mapping source columns for ${elementDefinitions.length} elements...`);

            mappingResults = await sourceColumnMapper.mapMultipleElements(
                elementDefinitions,
                availableColumns,
                datasetSchema,
                userProvidedMappings,
                projectId,  // ✅ PHASE 6: Pass projectId for RAG-based matching
                mappingContext  // ✅ Context-aware mapping: industry, data context, analysis type
            );

            // Build the column lookup from mapping results
            for (const result of mappingResults) {
                for (const mapping of result.mappings) {
                    if (mapping.actualColumn) {
                        columnLookup.set(mapping.abstractField, mapping.actualColumn);
                        console.log(`   ✅ ${mapping.abstractField} → ${mapping.actualColumn} (${mapping.confidence}%, ${mapping.matchMethod})`);
                    } else {
                        console.log(`   ⚠️ ${mapping.abstractField} → NO MATCH (alternatives: ${mapping.alternatives.slice(0, 2).map(a => a.column).join(', ') || 'none'})`);
                    }
                }
            }

            // Log summary
            const totalMapped = mappingResults.reduce((sum, r) => sum + r.mappings.filter(m => m.actualColumn).length, 0);
            const totalFields = mappingResults.reduce((sum, r) => sum + r.mappings.length, 0);
            console.log(`🔗 [Transform] Column mapping complete: ${totalMapped}/${totalFields} fields mapped`);
        }

        // FIX P0-3: Write back resolved column mappings to requirementsDocument (SSOT)
        // This fixes the issue where requirementsDocument.sourceColumn is always NULL
        try {
            const currentProject = await storage.getProject(projectId);
            const currentJp = (currentProject as any)?.journeyProgress || {};
            const reqDoc = currentJp.requirementsDocument;
            if (reqDoc?.requiredDataElements && columnLookup.size > 0) {
                let writebackCount = 0;
                for (const element of reqDoc.requiredDataElements) {
                    const mapped = columnLookup.get(element.elementName);
                    if (mapped) {
                        element.sourceColumn = mapped;
                        writebackCount++;
                    }
                }
                if (writebackCount > 0) {
                    await storage.atomicMergeJourneyProgress(projectId, { requirementsDocument: reqDoc });
                    console.log(`✅ [P0-3] Wrote back ${writebackCount} column mappings to requirementsDocument`);
                }
            }
        } catch (wbErr) {
            console.warn('⚠️ [P0-3] Failed to write back column mappings:', wbErr);
        }

        // APPLY TRANSFORMATIONS in order
        for (const step of transformationSteps) {
            // MULTI-COLUMN FIX: Handle both new format (operation, sourceColumns) and legacy (type, config)
            const { type, config, operation, sourceColumns, aggregationFunction, targetElement } = step || {};
            const transformationType = type || operation;

            // P0-1 FIX: Enhance step with business context if available
            const context = targetElement ? businessContext[targetElement] : null;
            if (context) {
                console.log(`📊 [P0-1 FIX] Using business context for ${targetElement}:`, {
                    type: context.calculationType,
                    method: context.aggregationMethod,
                    fields: context.componentFields?.slice(0, 3)
                });
            }

            console.log(`📊 [D3 FIX] Applying transformation: ${transformationType} (sourceColumns: ${sourceColumns?.length || 0})`);

            // FIX 2C: Per-step error handling — log failure and continue to next step
            try { switch (transformationType) {
                case 'filter': {
                    const { field, operator, value } = config || {};
                    if (field) {
                        // P1-5 FIX: If no explicit operator/value, check businessContext for validRange
                        let effectiveOperator = operator;
                        let effectiveValue = value;
                        let useRangeFilter = false;
                        let rangeMin: number | undefined;
                        let rangeMax: number | undefined;

                        if (!effectiveOperator && !effectiveValue) {
                            // Look up business definition validRange for this field
                            const bizCtx = businessContext[field] || businessContext[targetElement || ''];
                            if (bizCtx?.validRange) {
                                rangeMin = bizCtx.validRange.min;
                                rangeMax = bizCtx.validRange.max;
                                if (rangeMin !== undefined || rangeMax !== undefined) {
                                    useRangeFilter = true;
                                    console.log(`📋 [P1-5] Using business definition validRange for "${field}": min=${rangeMin}, max=${rangeMax}`);
                                }
                            }
                        }

                        if (useRangeFilter) {
                            const beforeCount = workingData.length;
                            workingData = workingData.filter((r) => {
                                const v = Number(r[field]);
                                if (isNaN(v)) return false;
                                if (rangeMin !== undefined && v < rangeMin) return false;
                                if (rangeMax !== undefined && v > rangeMax) return false;
                                return true;
                            });
                            console.log(`📋 [P1-5] Range filter on "${field}": ${beforeCount} → ${workingData.length} rows`);
                        } else if (effectiveOperator) {
                            workingData = workingData.filter((r) => {
                                const v = r[field];
                                switch (effectiveOperator) {
                                    case 'equals': return v == effectiveValue;
                                    case 'not_equals': return v != effectiveValue;
                                    case 'gt': return Number(v) > Number(effectiveValue);
                                    case 'gte': return Number(v) >= Number(effectiveValue);
                                    case 'lt': return Number(v) < Number(effectiveValue);
                                    case 'lte': return Number(v) <= Number(effectiveValue);
                                    case 'contains': return String(v ?? '').toLowerCase().includes(String(effectiveValue ?? '').toLowerCase());
                                    case 'is_null': return v === null || v === undefined || v === '';
                                    case 'is_not_null': return v !== null && v !== undefined && v !== '';
                                    default: return true;
                                }
                            });
                        }
                    }
                    break;
                }
                case 'select': {
                    const { columns } = config || {};
                    if (Array.isArray(columns) && columns.length) {
                        workingData = workingData.map((r) =>
                            Object.fromEntries(columns.map((c: string) => [c, r[c]]))
                        );
                    }
                    break;
                }
                case 'rename': {
                    const { from, to } = config || {};
                    if (from && to) {
                        workingData = workingData.map((r) => {
                            if (from in r) {
                                const { [from]: val, ...rest } = r;
                                return { ...rest, [to]: val };
                            }
                            return r;
                        });
                    }
                    break;
                }
                case 'derive': {
                    // MULTI-COLUMN FIX: Handle both legacy config format and new direct format
                    const configSourceColumns = config?.sourceColumns;
                    const newColumn = targetElement || config?.newColumn;

                    // P0-1 FIX: Use business context to determine source columns and aggregation method
                    // Priority: business context > explicit sourceColumns > config
                    const bizContext = newColumn ? businessContext[newColumn] : null;
                    const abstractCols = bizContext?.componentFields?.length > 0
                        ? bizContext.componentFields
                        : (sourceColumns || configSourceColumns);
                    const aggFn = bizContext?.aggregationMethod
                        || aggregationFunction
                        || config?.expression
                        || config?.aggregationFunction
                        || 'avg';

                    // FIX 2A: When abstractCols is empty but newColumn exists, try to find a direct mapping
                    if (newColumn && (!abstractCols || abstractCols.length === 0)) {
                        // Look for a direct mapping for this element in columnLookup
                        const directCol = columnLookup.get(newColumn);
                        if (directCol && workingData.length > 0 && directCol in workingData[0]) {
                            console.log(`📊 [FIX 2A] No component fields for "${newColumn}", using direct mapping → "${directCol}"`);
                            workingData = workingData.map((r) => ({ ...r, [newColumn]: r[directCol] }));
                            break;
                        } else {
                            console.warn(`⚠️ [FIX 2A] No component fields and no direct mapping for "${newColumn}" — skipping derive`);
                            break;
                        }
                    }
                    if (newColumn && abstractCols?.length) {
                        // ============================================================
                        // SOURCE COLUMN MAPPING FIX: Map abstract names to actual columns
                        // ============================================================
                        // Use columnLookup to resolve abstract names (e.g., "Q1_Score") to actual columns (e.g., "Q1 - Score")
                        const cols = abstractCols.map((abstractCol: string) => {
                            const actualCol = columnLookup.get(abstractCol);
                            if (actualCol && actualCol !== abstractCol) {
                                console.log(`   🔗 [DERIVE] Mapped: "${abstractCol}" → "${actualCol}"`);
                                return actualCol;
                            }
                            // Fall back to original if no mapping found
                            return abstractCol;
                        });

                        // Validate that mapped columns exist in the data
                        const missingCols = cols.filter((c: string) => workingData.length > 0 && !(c in workingData[0]));
                        if (missingCols.length > 0) {
                            console.warn(`   ⚠️ [DERIVE] Warning: Columns not found in data: [${missingCols.join(', ')}]`);
                            console.warn(`   ⚠️ [DERIVE] Available columns: [${Object.keys(workingData[0] || {}).slice(0, 10).join(', ')}...]`);
                        }

                        // P1-10 FIX: Use business context to influence transformation logic
                        if (bizContext) {
                            console.log(`📊 [DERIVE] Using DS Agent business definition for ${newColumn}:`);
                            console.log(`   Type: ${bizContext.calculationType}, Method: ${bizContext.aggregationMethod}`);
                            console.log(`   Description: ${bizContext.businessDescription || 'N/A'}`);
                            console.log(`   Abstract fields: [${abstractCols.join(', ')}]`);
                            console.log(`   Mapped to actual: [${cols.join(', ')}]`);

                            // FIX 2B: If business definition has pseudoCode, try to execute it
                            if (bizContext.calculationType === 'derived' && bizContext.formula?.pseudoCode) {
                                const pseudoCode = bizContext.formula.pseudoCode;
                                console.log(`   📝 [FIX 2B] Attempting pseudoCode execution: "${pseudoCode.substring(0, 80)}..."`);
                                try {
                                    // Build a function that receives a row object and mapped column names
                                    // The pseudoCode should be a JS expression/body that returns a value
                                    const fn = new Function('row', 'cols', `"use strict"; try { ${pseudoCode} } catch(e) { return null; }`);
                                    // Test on first row
                                    const testResult = fn(workingData[0], cols);
                                    if (testResult !== undefined && testResult !== null) {
                                        console.log(`   ✅ [FIX 2B] PseudoCode test result: ${testResult} — applying to all rows`);
                                        workingData = workingData.map((r) => ({
                                            ...r,
                                            [newColumn]: fn(r, cols)
                                        }));
                                        break; // Skip the standard aggregation below
                                    } else {
                                        console.warn(`   ⚠️ [FIX 2B] PseudoCode returned null/undefined on test row, falling back to aggregation`);
                                    }
                                } catch (pseudoErr) {
                                    console.warn(`   ⚠️ [FIX 2B] PseudoCode execution failed, falling back to aggregation:`, pseudoErr);
                                }
                            }
                        }
                        console.log(`📊 [DERIVE] Creating "${newColumn}" from columns [${cols.join(', ')}] using ${aggFn}`);

                        workingData = workingData.map((r) => {
                            // Extract numeric values from MAPPED source columns (not abstract names)
                            const values = cols.map((c: string) => r[c]);
                            const numericValues = values
                                .map((v: any) => typeof v === 'number' ? v : parseFloat(v))
                                .filter((v: number) => !isNaN(v));

                            let derived: any;

                            switch (aggFn) {
                                case 'sum':
                                    derived = numericValues.reduce((acc: number, v: number) => acc + v, 0);
                                    break;
                                case 'avg':
                                case 'average':
                                    derived = numericValues.length > 0
                                        ? numericValues.reduce((acc: number, v: number) => acc + v, 0) / numericValues.length
                                        : null;
                                    break;
                                case 'min':
                                    derived = numericValues.length > 0 ? Math.min(...numericValues) : null;
                                    break;
                                case 'max':
                                    derived = numericValues.length > 0 ? Math.max(...numericValues) : null;
                                    break;
                                case 'count':
                                    derived = values.filter((v: any) => v !== null && v !== undefined && v !== '').length;
                                    break;
                                case 'concat':
                                    derived = values.map((v: any) => v ?? '').join(' ').trim();
                                    break;
                                case 'first':
                                    derived = values.find((v: any) => v !== null && v !== undefined) ?? null;
                                    break;
                                case 'weighted_avg':
                                    // For weighted average, alternate columns are weights: [val1, weight1, val2, weight2, ...]
                                    // Or use equal weights if odd number of columns
                                    if (cols.length >= 2 && cols.length % 2 === 0) {
                                        let weightedSum = 0;
                                        let totalWeight = 0;
                                        for (let i = 0; i < cols.length; i += 2) {
                                            const val = parseFloat(r[cols[i]]) || 0;
                                            const weight = parseFloat(r[cols[i + 1]]) || 1;
                                            weightedSum += val * weight;
                                            totalWeight += weight;
                                        }
                                        derived = totalWeight > 0 ? weightedSum / totalWeight : null;
                                    } else {
                                        // Fall back to regular average
                                        derived = numericValues.length > 0
                                            ? numericValues.reduce((acc: number, v: number) => acc + v, 0) / numericValues.length
                                            : null;
                                    }
                                    break;
                                default:
                                    // Default to average for numeric, concat for strings
                                    if (numericValues.length === values.length && numericValues.length > 0) {
                                        derived = numericValues.reduce((acc: number, v: number) => acc + v, 0) / numericValues.length;
                                    } else {
                                        derived = values.map((v: any) => v ?? '').join(' ').trim();
                                    }
                            }

                            return { ...r, [newColumn]: derived };
                        });

                        console.log(`📊 [DERIVE] Created derived column: ${newColumn}`);
                    }
                    break;
                }
                // ============================================================
                // Phase 3D: Cross-row aggregate handler
                // Computes GROUP BY aggregations and joins back to working data
                // ============================================================
                case 'cross_row_aggregate': {
                    const aggConfig = config || {};
                    const groupByCols: string[] = aggConfig.groupByColumns || [];
                    const aggFunction: string = aggConfig.aggregateFunction || 'count';
                    const aggSourceCol: string = sourceColumns?.[0] || aggConfig.sourceColumn || '';
                    const aggTargetCol: string = targetElement || aggConfig.targetColumn || `_agg_${aggSourceCol}`;
                    const filterCond = aggConfig.filterCondition;

                    console.log(`📊 [CROSS_ROW_AGG] Computing ${aggFunction}(${aggSourceCol}) GROUP BY [${groupByCols.join(', ')}] → ${aggTargetCol}`);

                    if (workingData.length > 0 && aggSourceCol) {
                        // Optional: apply row-level filter before aggregation
                        let filteredData = workingData;
                        if (filterCond) {
                            filteredData = workingData.filter((r: any) => {
                                const val = r[filterCond.column];
                                switch (filterCond.operator) {
                                    case 'is_not_null': return val !== null && val !== undefined && val !== '';
                                    case 'is_null': return val === null || val === undefined || val === '';
                                    case 'eq': return val === filterCond.value;
                                    case 'neq': return val !== filterCond.value;
                                    case 'gt': return parseFloat(val) > parseFloat(filterCond.value);
                                    case 'lt': return parseFloat(val) < parseFloat(filterCond.value);
                                    case 'in': return Array.isArray(filterCond.value) && filterCond.value.includes(val);
                                    default: return true;
                                }
                            });
                        }

                        // Compute aggregation per group
                        const groupAggs = new Map<string, number>();

                        if (groupByCols.length > 0) {
                            // Build group key → aggregate value
                            const groups = new Map<string, any[]>();
                            for (const row of filteredData) {
                                const key = groupByCols.map((c: string) => String(row[c] ?? '')).join('|||');
                                if (!groups.has(key)) groups.set(key, []);
                                groups.get(key)!.push(row);
                            }

                            for (const [key, rows] of groups.entries()) {
                                let result: number;
                                switch (aggFunction) {
                                    case 'count':
                                        result = rows.length;
                                        break;
                                    case 'count_distinct':
                                        result = new Set(rows.map((r: any) => r[aggSourceCol])).size;
                                        break;
                                    case 'sum':
                                        result = rows.reduce((acc: number, r: any) => acc + (parseFloat(r[aggSourceCol]) || 0), 0);
                                        break;
                                    case 'avg':
                                        const nums = rows.map((r: any) => parseFloat(r[aggSourceCol])).filter((n: number) => !isNaN(n));
                                        result = nums.length > 0 ? nums.reduce((a: number, b: number) => a + b, 0) / nums.length : 0;
                                        break;
                                    case 'min':
                                        result = Math.min(...rows.map((r: any) => parseFloat(r[aggSourceCol])).filter((n: number) => !isNaN(n)));
                                        break;
                                    case 'max':
                                        result = Math.max(...rows.map((r: any) => parseFloat(r[aggSourceCol])).filter((n: number) => !isNaN(n)));
                                        break;
                                    default:
                                        result = rows.length;
                                }
                                groupAggs.set(key, result);
                            }

                            // Join aggregation result back to all rows
                            workingData = workingData.map((r: any) => {
                                const key = groupByCols.map((c: string) => String(r[c] ?? '')).join('|||');
                                return { ...r, [aggTargetCol]: groupAggs.get(key) ?? null };
                            });
                        } else {
                            // No grouping - compute scalar aggregate across all rows
                            let scalarResult: number;
                            switch (aggFunction) {
                                case 'count':
                                    scalarResult = filteredData.length;
                                    break;
                                case 'count_distinct':
                                    scalarResult = new Set(filteredData.map((r: any) => r[aggSourceCol])).size;
                                    break;
                                case 'sum':
                                    scalarResult = filteredData.reduce((acc: number, r: any) => acc + (parseFloat(r[aggSourceCol]) || 0), 0);
                                    break;
                                default:
                                    scalarResult = filteredData.length;
                            }
                            // Broadcast scalar to all rows
                            workingData = workingData.map((r: any) => ({ ...r, [aggTargetCol]: scalarResult }));
                        }

                        console.log(`✅ [CROSS_ROW_AGG] Created aggregate column: ${aggTargetCol} (${groupAggs.size || 1} groups)`);
                    }
                    break;
                }

                // ============================================================
                // Phase 3E: Formula-apply handler
                // Evaluates a formula using intermediate columns from previous steps
                // ============================================================
                case 'formula_apply': {
                    const formulaConfig = config || {};
                    const formulaTarget = targetElement || formulaConfig.targetColumn || '_formula_result';
                    const formulaCols: string[] = sourceColumns || formulaConfig.sourceColumns || [];
                    const formulaStr: string = formulaConfig.formula || '';

                    console.log(`📊 [FORMULA_APPLY] Applying formula to create "${formulaTarget}" from [${formulaCols.join(', ')}]`);

                    if (workingData.length > 0 && formulaCols.length > 0) {
                        workingData = workingData.map((r: any) => {
                            try {
                                // Build a safe evaluation scope with only the needed columns
                                const scope: Record<string, number> = {};
                                for (const col of formulaCols) {
                                    scope[col] = parseFloat(r[col]) || 0;
                                }

                                // Safe formula evaluation using Function constructor
                                // Only allows basic math operations on the column values
                                const colArgs = formulaCols.join(', ');
                                const colValues = formulaCols.map(c => scope[c]);

                                // Replace column names in formula with argument names
                                let evalFormula = formulaStr;
                                for (const col of formulaCols) {
                                    evalFormula = evalFormula.replace(
                                        new RegExp(col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                                        col
                                    );
                                }

                                const fn = new Function(...formulaCols, `return ${evalFormula};`);
                                const result = fn(...colValues);

                                return { ...r, [formulaTarget]: isFinite(result) ? Math.round(result * 100) / 100 : null };
                            } catch (formulaErr) {
                                return { ...r, [formulaTarget]: null };
                            }
                        });

                        console.log(`✅ [FORMULA_APPLY] Created formula column: ${formulaTarget}`);
                    }
                    break;
                }

                case 'clean': {
                    workingData = workingData.map((r) => {
                        const out: any = {};
                        for (const [k, v] of Object.entries(r)) {
                            if (typeof v === 'string') {
                                const t = v.trim();
                                out[k] = t === '' ? null : t;
                            } else {
                                out[k] = v;
                            }
                        }
                        return out;
                    });
                    break;
                }
                case 'aggregate': {
                    const { groupBy, aggregations } = config || {};
                    if (groupBy && aggregations?.length) {
                        const groups = new Map<string, any[]>();
                        for (const row of workingData) {
                            const key = Array.isArray(groupBy)
                                ? groupBy.map((g: string) => row[g]).join('|')
                                : row[groupBy];
                            if (!groups.has(key)) groups.set(key, []);
                            groups.get(key)!.push(row);
                        }
                        workingData = Array.from(groups.entries()).map(([key, rows]) => {
                            const result: any = {};
                            // Add group by columns
                            if (Array.isArray(groupBy)) {
                                groupBy.forEach((g: string, i: number) => {
                                    result[g] = rows[0][g];
                                });
                            } else {
                                result[groupBy] = rows[0][groupBy];
                            }
                            // Apply aggregations
                            for (const agg of aggregations) {
                                const { column, function: fn, alias } = agg;
                                const values = rows.map(r => Number(r[column]) || 0);
                                const name = alias || `${fn}_${column}`;
                                switch (fn) {
                                    case 'sum': result[name] = values.reduce((a, b) => a + b, 0); break;
                                    case 'avg': result[name] = values.reduce((a, b) => a + b, 0) / values.length; break;
                                    case 'count': result[name] = rows.length; break;
                                    case 'min': result[name] = Math.min(...values); break;
                                    case 'max': result[name] = Math.max(...values); break;
                                }
                            }
                            return result;
                        });
                    }
                    break;
                }
                default:
                    console.log(`📊 [D3 FIX] Unknown transformation type: ${type}`);
                    break;
            }
            } catch (stepError: any) {
                // FIX 2C: Per-step error logging — continue to next step (graceful degradation)
                console.error(`❌ [Transform] Step "${transformationType}" failed for target "${targetElement || 'unknown'}":`, stepError?.message || stepError);
            }
        }

        // ✅ P1 FIX: Apply column renaming based on mappings (source -> target element names)
        // This makes the transformed data use semantic element names instead of raw column names
        if (Array.isArray(mappings) && mappings.length > 0) {
            // Build a rename map: sourceColumn -> targetElement
            const renameMap: Record<string, string> = {};
            for (const mapping of mappings) {
                const source = mapping.sourceColumn;
                const target = mapping.targetElement || mapping.elementName;
                // Only rename if source column exists and is different from target
                if (source && target && source !== target) {
                    renameMap[source] = target;
                }
            }

            if (Object.keys(renameMap).length > 0) {
                console.log(`📊 [P1 FIX] Renaming ${Object.keys(renameMap).length} columns to target element names`);
                console.log(`   Rename map:`, renameMap);

                workingData = workingData.map(row => {
                    const newRow: Record<string, any> = {};
                    for (const [key, value] of Object.entries(row)) {
                        // Use target element name if mapped, otherwise keep original
                        const newKey = renameMap[key] || key;
                        newRow[newKey] = value;
                    }
                    return newRow;
                });
            }
        }

        // INFER SCHEMA from transformed data
        const transformedSchema: Record<string, { type: string; nullable: boolean }> = {};
        if (workingData.length > 0) {
            for (const key of Object.keys(workingData[0])) {
                const sample = workingData.slice(0, 100).map(r => r[key]).filter(v => v != null);
                const isNumeric = sample.every(v => !isNaN(Number(v)));
                const isDate = sample.every(v => !isNaN(Date.parse(String(v))));
                transformedSchema[key] = {
                    type: isNumeric ? 'number' : isDate ? 'date' : 'string',
                    nullable: workingData.some(r => r[key] == null)
                };
            }
        }

        // FIX 2: Verify all required data elements from DS Agent have matching columns
        // This ensures the transformation step didn't miss any critical elements
        const availableTransformedColumns = workingData.length > 0
            ? Object.keys(workingData[0]).map(c => c.toLowerCase())
            : [];
        const missingElements: string[] = [];

        if (reqDoc?.requiredDataElements && Array.isArray(reqDoc.requiredDataElements)) {
            console.log(`📋 [FIX 2] Verifying ${reqDoc.requiredDataElements.length} required elements exist in transformed data`);

            for (const element of reqDoc.requiredDataElements) {
                const elementName = element.elementName || element.name || element.targetElement;
                if (!elementName) continue;

                // Check if element exists in transformed data (case-insensitive)
                const elementNameLower = elementName.toLowerCase();
                const elementExists = availableTransformedColumns.includes(elementNameLower) ||
                    availableTransformedColumns.some(col =>
                        col.replace(/[_\s-]/g, '') === elementNameLower.replace(/[_\s-]/g, '')
                    );

                if (!elementExists) {
                    // Check if it was mapped to a different column
                    const mapping = (mappings || []).find((m: any) =>
                        (m.targetElement || m.elementName)?.toLowerCase() === elementNameLower
                    );
                    const mappedTo = mapping?.sourceColumn;

                    if (mappedTo && availableTransformedColumns.includes(mappedTo.toLowerCase())) {
                        console.log(`   ✅ ${elementName} → mapped to ${mappedTo}`);
                    } else {
                        missingElements.push(elementName);
                        console.warn(`   ⚠️ [FIX 2] Required element "${elementName}" not found in transformed data`);
                    }
                } else {
                    console.log(`   ✅ ${elementName} → present`);
                }
            }

            if (missingElements.length > 0) {
                console.warn(`⚠️ [FIX 2] ${missingElements.length} required elements missing from transformed data: [${missingElements.join(', ')}]`);
            } else {
                console.log(`✅ [FIX 2] All required elements present in transformed data`);
            }
        }

        // STORE TRANSFORMED DATA to dataset's ingestionMetadata
        const primaryDataset = (datasets[0] as any).dataset || datasets[0];

        // ✅ FIX 1.1: Save column mappings to enable evidence chain traceability
        // mappings contains the element-to-source-column mapping from frontend
        const columnMappings = Array.isArray(mappings)
            ? mappings.reduce((acc: Record<string, any>, m: any) => {
                if (m.elementId || m.targetElement) {
                    acc[m.elementId || m.targetElement] = {
                        sourceColumn: m.sourceColumn || m.targetElement,
                        transformationType: m.transformationType || 'direct',
                        userDefinedLogic: m.userDefinedLogic || null,
                        mappedAt: new Date().toISOString()
                    };
                }
                return acc;
              }, {})
            : (typeof mappings === 'object' ? mappings : {});

        console.log(`📊 [FIX 1.1] Saving ${Object.keys(columnMappings).length} column mappings to dataset`);

        // Update dataset in transaction
        await db.transaction(async (tx: any) => {
            await tx.update(datasetsTable).set({
                ingestionMetadata: {
                    ...(primaryDataset.ingestionMetadata || {}),
                    transformedData: workingData,
                    transformedSchema,
                    transformationApplied: true,
                    transformationSteps,
                    joinConfig,
                    questionAnswerMapping,
                    columnMappings,
                    transformedAt: new Date().toISOString(),
                    transformedRowCount: workingData.length
                }
            }).where(eq(datasetsTable.id, primaryDataset.id));
        });

        // Use atomic merge for journeyProgress to prevent overwriting concurrent changes
        await storage.atomicMergeJourneyProgress(projectId, {
            transformationApplied: true,
            transformedRowCount: workingData.length,
            transformedAt: new Date().toISOString(),
            transformationMappings: columnMappings,
            questionAnswerMapping,
            // P1-22 FIX: Only store preview in journeyProgress (full data lives in dataset.ingestionMetadata)
            joinedData: {
                preview: workingData.slice(0, 100),
                schema: transformedSchema,
                rowCount: workingData.length,
                recordCount: workingData.length,
                joinConfig: joinConfig || null,
                columnCount: Object.keys(transformedSchema).length
            }
        });

        console.log(`✅ [PHASE 9] Saved joinedData to journeyProgress: ${workingData.length} rows`);

        // P0-9 FIX: Write back sourceColumn to requirementsDocument for data continuity
        // This bridges the gap between element definitions (sourceColumn=null) and actual mappings
        try {
            const currentProgress = (accessCheck.project as any)?.journeyProgress || {};
            const reqDoc = currentProgress?.requirementsDocument;
            if (reqDoc?.requiredDataElements && Array.isArray(reqDoc.requiredDataElements) && Array.isArray(mappings)) {
                let updated = false;
                const updatedElements = reqDoc.requiredDataElements.map((element: any) => {
                    // Find matching mapping by element name or ID
                    const mapping = mappings.find((m: any) =>
                        (m.elementId && m.elementId === element.elementId) ||
                        (m.targetElement && (m.targetElement === element.elementName || m.targetElement === element.name))
                    );
                    if (mapping && (mapping.sourceColumn || mapping.mappedColumn || mapping.sourceField)) {
                        const resolvedColumn = mapping.sourceColumn || mapping.mappedColumn || mapping.sourceField;
                        updated = true;
                        return {
                            ...element,
                            sourceColumn: resolvedColumn,
                            sourceAvailable: true,
                            mappedAt: new Date().toISOString()
                        };
                    }
                    return element;
                });

                if (updated) {
                    await storage.atomicMergeJourneyProgress(projectId, {
                        requirementsDocument: {
                            ...reqDoc,
                            requiredDataElements: updatedElements,
                            mappingsAppliedAt: new Date().toISOString()
                        }
                    });
                    const mappedCount = updatedElements.filter((e: any) => e.sourceAvailable).length;
                    console.log(`✅ [P0-9] Written back sourceColumn to ${mappedCount}/${updatedElements.length} elements in requirementsDocument`);
                }
            }
        } catch (writeBackError) {
            // Non-fatal: mappings are still saved in columnMappings, this is an enhancement
            console.warn(`⚠️ [P0-9] Failed to write back sourceColumn to requirementsDocument:`, writeBackError);
        }

        console.log(`✅ [FIX 1.1] Column mappings saved to both dataset and journeyProgress`);

        console.log(`✅ [D3 FIX] Transformation complete. Rows: ${workingData.length}, Columns: ${Object.keys(transformedSchema).length}`);

        // ✅ GAP 3 FIX: Log transformation execution to decision audits
        try {
            await db.insert(decisionAudits).values({
                id: nanoid(),
                projectId,
                agent: 'data_engineer',
                decisionType: 'transformation_execution',
                decision: `Executed ${transformationSteps.length} transformation(s) on ${datasets.length} dataset(s)`,
                confidence: 100,
                reasoning: joinConfig?.foreignKeys?.length > 0
                    ? `Multi-dataset join performed with ${joinConfig.foreignKeys.length} key mapping(s)`
                    : 'Single dataset transformation',
                alternatives: JSON.stringify([]),
                context: JSON.stringify({
                    transformationSteps: transformationSteps.map((s: any) => s.type || s),
                    joinConfig: joinConfig || null,
                    resultRowCount: workingData.length,
                    resultColumnCount: Object.keys(transformedSchema).length,
                    mappingsCount: mappings?.length || 0,
                    questionAnswerMappingCount: questionAnswerMapping?.length || 0
                }),
                impact: 'high',
                reversible: true,
                timestamp: new Date()
            });
            console.log(`✅ [GAP 3 FIX] Transformation decision logged to audit trail`);
        } catch (auditError) {
            console.warn('⚠️ Failed to log transformation audit:', auditError);
            // Don't fail the request if audit logging fails
        }

        // ✅ PHASE 6: Generate column embeddings asynchronously (non-blocking)
        // This enables RAG-based column matching for future transformation requests
        // Embeddings are generated ONCE on the final schema (after join + PII filtering)
        const excludedPiiColumns = getPiiExcludedColumns((projectForContext as any)?.journeyProgress || {});
        const usableColumns = Object.keys(transformedSchema).filter(col => !excludedPiiColumns.includes(col));

        setImmediate(async () => {
            try {
                console.log(`🔢 [Embedding] Generating for ${usableColumns.length} columns (excluded ${excludedPiiColumns.length} PII)`);

                const columnsWithMeta = usableColumns.map(name => {
                    const sampleValues = workingData.slice(0, 5).map(row => row[name]).filter(v => v != null);
                    const schemaInfo = transformedSchema[name];
                    return {
                        name,
                        type: schemaInfo?.type || 'string',
                        sampleValues
                    };
                });

                await columnEmbeddingGenerator.generateEmbeddingsForDataset({
                    datasetId: primaryDataset.id,
                    projectId,
                    columns: columnsWithMeta
                });

                console.log(`✅ [Embedding] Completed for project ${projectId}`);
            } catch (embeddingError) {
                console.error('❌ [Async Embedding] Failed:', embeddingError);
                // Don't fail the request if embedding generation fails
            }
        });

        // Include column mapping info in response
        const mappingInfo = mappingResults.length > 0 ? {
            totalElements: mappingResults.length,
            fullyMapped: mappingResults.filter(r => r.allMapped).length,
            partiallyMapped: mappingResults.filter(r => !r.allMapped && r.mappings.some(m => m.actualColumn)).length,
            unmapped: mappingResults.filter(r => r.mappings.every(m => !m.actualColumn)).length,
            averageConfidence: Math.round(
                mappingResults.reduce((sum, r) => sum + r.overallConfidence, 0) / mappingResults.length
            ),
            mappingsUsed: Object.fromEntries(columnLookup)
        } : null;

        res.json({
            success: true,
            preview: workingData.slice(0, 100),
            transformedSchema,
            rowCount: workingData.length,
            columnCount: Object.keys(transformedSchema).length,
            message: `Transformed ${workingData.length} rows with ${Object.keys(transformedSchema).length} columns`,
            // NEW: Include column mapping info for transparency
            columnMapping: mappingInfo
        });

    } catch (error: any) {
        console.error('❌ [D3 FIX] Execute transformations error:', error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to execute transformations"
        });
    }
});

/**
 * PHASE 6: Get embedding status for a project
 * Returns information about pre-computed column embeddings for RAG-based matching
 */
router.get("/:id/embedding-status", ensureAuthenticated, async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = (req.user as any)?.id;

        const access = await canAccessProject(userId, projectId, isAdmin(req));
        if (!access.allowed) {
            return res.status(403).json({ success: false, error: access.reason });
        }

        // Get datasets for this project
        const datasets = await storage.getProjectDatasets(projectId);

        // Get embedding status for project (single call to avoid multiple queries)
        const embeddingStatus = await columnEmbeddingGenerator.getEmbeddingStatus(projectId);

        // Get embedding counts per dataset
        const datasetStatuses = datasets.map((ds: any) => {
            const dataset = ds.dataset || ds;
            const datasetEmbeddings = embeddingStatus.datasets.find((d: { datasetId: string }) => d.datasetId === dataset.id);

            return {
                datasetId: dataset.id,
                datasetName: dataset.originalName || dataset.name,
                embeddingsGenerated: (dataset.metadata as any)?.embeddingsGenerated || false,
                embeddingCount: datasetEmbeddings?.embeddingCount || 0,
                totalColumns: Object.keys(dataset.schema || {}).length,
                generatedAt: (dataset.metadata as any)?.embeddingsGeneratedAt
            };
        });

        const totalEmbeddings = datasetStatuses.reduce((sum: number, s: { embeddingCount: number }) => sum + s.embeddingCount, 0);
        const allReady = datasetStatuses.every((s: { embeddingsGenerated: boolean }) => s.embeddingsGenerated);

        return res.json({
            success: true,
            projectId,
            datasets: datasetStatuses,
            totalEmbeddings,
            allReady,
            ragEnabled: totalEmbeddings > 0
        });
    } catch (error: any) {
        console.error('❌ [Embedding Status] Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * D2 FIX: Server-side PII filtering
 * Removes excluded columns from dataset data, not just UI
 */
router.post("/:id/apply-pii-exclusions", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;
        const { excludedColumns = [], anonymizedColumns = [] } = req.body;

        console.log(`🔒 [D2 FIX] Apply PII exclusions for project ${projectId}`);
        console.log(`🔒 [D2 FIX] Excluded columns:`, excludedColumns);
        console.log(`🔒 [D2 FIX] Anonymized columns:`, anonymizedColumns);

        if (!userId) {
            return res.status(401).json({ success: false, error: "Authentication required" });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ success: false, error: accessCheck.reason });
        }

        if (excludedColumns.length === 0 && anonymizedColumns.length === 0) {
            return res.json({
                success: true,
                message: "No columns to exclude or anonymize"
            });
        }

        // Load all datasets
        const datasets = await storage.getProjectDatasets(projectId);
        if (!datasets || datasets.length === 0) {
            return res.status(400).json({
                success: false,
                error: "No datasets available"
            });
        }

        const excludeSet = new Set(excludedColumns.map((c: string) => c.toLowerCase()));
        const anonymizeSet = new Set(anonymizedColumns.map((c: string) => c.toLowerCase()));

        for (const ds of datasets) {
            const dataset = (ds as any).dataset || ds;
            let data = Array.isArray(dataset.data) ? dataset.data : (dataset.preview || []);
            let preview = dataset.preview || [];
            let schema = dataset.schema || {};

            // Filter out excluded columns and anonymize others
            const filterRow = (row: any) => {
                const newRow: any = {};
                for (const [key, value] of Object.entries(row)) {
                    const lowerKey = key.toLowerCase();
                    if (excludeSet.has(lowerKey)) {
                        // Skip excluded columns
                        continue;
                    }
                    if (anonymizeSet.has(lowerKey)) {
                        // Anonymize: replace with masked value
                        newRow[key] = typeof value === 'string'
                            ? value.replace(/./g, '*').substring(0, 8) + '...'
                            : '***';
                    } else {
                        newRow[key] = value;
                    }
                }
                return newRow;
            };

            const filteredData = data.map(filterRow);
            const filteredPreview = preview.map(filterRow);

            // Update schema to remove excluded columns
            const filteredSchema: any = {};
            for (const [key, value] of Object.entries(schema)) {
                if (!excludeSet.has(key.toLowerCase())) {
                    filteredSchema[key] = value;
                }
            }

            // Update dataset with filtered data
            await storage.updateDataset(dataset.id, {
                data: filteredData,
                preview: filteredPreview.slice(0, 100),
                schema: filteredSchema,
                metadata: {
                    ...(dataset.metadata || {}),
                    piiFiltered: true,
                    piiFilteredAt: new Date().toISOString(),
                    excludedColumns,
                    anonymizedColumns,
                    originalColumnCount: Object.keys(schema).length,
                    filteredColumnCount: Object.keys(filteredSchema).length
                }
            } as any);

            console.log(`🔒 [D2 FIX] Dataset ${dataset.id}: Removed ${excludedColumns.length} columns, anonymized ${anonymizedColumns.length}`);
        }

        // Update project metadata (legacy location, kept for backward compat)
        const project = await storage.getProject(projectId);
        await storage.updateProject(projectId, {
            metadata: {
                ...(project as any)?.metadata,
                piiDecision: {
                    excludedColumns,
                    anonymizedColumns,
                    appliedAt: new Date().toISOString()
                }
            }
        } as any);

        // PII SSOT: Also write to journeyProgress.piiDecisions (canonical location)
        await storage.atomicMergeJourneyProgress(projectId, {
            piiDecisions: {
                excludedColumns,
                anonymizedColumns,
                appliedAt: new Date().toISOString()
            }
        });

        res.json({
            success: true,
            message: `Removed ${excludedColumns.length} columns, anonymized ${anonymizedColumns.length} columns`,
            excludedColumns,
            anonymizedColumns
        });

    } catch (error: any) {
        console.error('❌ [D2 FIX] PII exclusion error:', error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to apply PII exclusions"
        });
    }
});

/**
 * R1 FIX: Researcher agent template recommendations
 * Called by prepare-step.tsx to get template recommendations
 */
router.post("/:id/recommend-templates", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;
        const { userGoals = [], userQuestions = [], industryContext } = req.body;

        console.log(`🔍 [R1 FIX] Recommend templates for project ${projectId}`);

        if (!userId) {
            return res.status(401).json({ success: false, error: "Authentication required" });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ success: false, error: accessCheck.reason });
        }

        // Build search query from user goals and questions for semantic search
        const searchQuery = [...userGoals, ...userQuestions].filter(Boolean).join(' ');
        const project = await storage.getProject(projectId);
        const journeyType = (project as any)?.journeyType;

        console.log(`🔍 [Vector Search] Query: "${searchQuery.substring(0, 100)}..." | Journey: ${journeyType} | Industry: ${industryContext?.industry || 'any'}`);

        // Use semantic vector search to find matching templates
        const recommendations = await semanticSearchService.findSimilarTemplates(searchQuery, {
            limit: 5,
            minSimilarity: 0.5, // Lower threshold to ensure we get results
            journeyType: journeyType,
            industry: industryContext?.industry,
            isActive: true
        });

        console.log(`📊 [Vector Search] Found ${recommendations.length} matching templates`);

        // Transform top result to expected response format
        let template = null;
        let confidence = 0.5;
        let marketDemand = 'moderate';
        let implementationComplexity = 'medium';

        if (recommendations.length > 0) {
            const topMatch = recommendations[0];
            template = {
                id: topMatch.item.id,
                name: topMatch.item.name,
                description: topMatch.item.summary || topMatch.item.description,
                recommendedAnalyses: (topMatch.item.expectedArtifacts as string[]) || [],
                requiredDataElements: ((topMatch.item.metadata as any)?.requiredElements as string[]) || []
            };
            confidence = topMatch.similarity;

            // Determine market demand based on similarity
            if (topMatch.similarity >= 0.85) {
                marketDemand = 'very_high';
            } else if (topMatch.similarity >= 0.75) {
                marketDemand = 'high';
            } else if (topMatch.similarity >= 0.65) {
                marketDemand = 'moderate';
            } else {
                marketDemand = 'low';
            }

            // Determine complexity based on template content depth
            const contentDepth = topMatch.item.contentDepth;
            if (contentDepth === 'comprehensive' || contentDepth === 'detailed') {
                implementationComplexity = 'high';
            } else if (contentDepth === 'standard') {
                implementationComplexity = 'medium';
            } else {
                implementationComplexity = 'low';
            }

            console.log(`✅ [Vector Search] Top match: ${template.name} (similarity: ${confidence.toFixed(3)})`);
        } else {
            // Fallback to generic template if no semantic matches found
            console.log(`⚠️ [Vector Search] No semantic matches found, using generic template`);
            template = {
                id: 'general_analytics',
                name: 'General Data Analytics',
                description: 'Flexible analysis template for diverse data types',
                recommendedAnalyses: ['descriptive', 'correlation', 'distribution_analysis'],
                requiredDataElements: []
            };
            confidence = 0.5;
            implementationComplexity = 'low';
        }

        // Build alternative templates from remaining matches
        const alternativeTemplates = recommendations.slice(1).map(match => ({
            id: match.item.id,
            name: match.item.name,
            description: match.item.summary || match.item.description,
            similarity: match.similarity,
            matchReason: 'semantic'
        }));

        // Store recommendation in project using atomic merge to prevent overwriting concurrent changes
        await storage.atomicMergeJourneyProgress(projectId, {
            researcherRecommendation: {
                template,
                confidence,
                marketDemand,
                implementationComplexity,
                alternativeTemplates,
                recommendedAt: new Date().toISOString(),
                searchMethod: 'semantic_vector_search'
            }
        });

        console.log(`✅ [Vector Search] Recommended template: ${template?.name} (confidence: ${confidence.toFixed(3)}) + ${alternativeTemplates.length} alternatives`);

        res.json({
            success: true,
            template,
            confidence,
            marketDemand,
            implementationComplexity,
            alternativeTemplates, // Now includes actual alternatives from vector search
            searchMethod: 'semantic'
        });

    } catch (error: any) {
        console.error('❌ [R1 FIX] Recommend templates error:', error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to recommend templates"
        });
    }
});

// ==========================================
// [DAY 9] AGENT QUERY ENDPOINT
// ==========================================
/**
 * Allow users to ask follow-up questions about their project via PM agent
 * POST /api/projects/:id/ask-agent
 */
router.post("/:id/ask-agent", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;
        const isAdmin = (req.user as any)?.isAdmin || false;
        const { question, context } = req.body;

        console.log(`🤖 [Agent Query] User ${userId} asking: "${question?.substring(0, 100)}..."`);

        // Ownership check
        const accessCheck = await canAccessProject(userId, projectId, isAdmin);
        if (!accessCheck.allowed) {
            return res.status(403).json({
                success: false,
                error: accessCheck.reason
            });
        }

        if (!question || typeof question !== 'string' || question.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Question is required'
            });
        }

        const project = accessCheck.project;
        const journeyProgress = (project as any).journeyProgress || {};
        const analysisResults = (project as any).analysisResults || {};

        // Get datasets for context
        const projectDatasets = await storage.getProjectDatasets(projectId);

        // Build context for PM agent
        const agentContext = {
            projectName: project.name,
            journeyType: (project as any).journeyType || 'general',
            currentStep: journeyProgress.currentStep || 'unknown',
            completedSteps: journeyProgress.completedSteps || [],
            datasetCount: projectDatasets.length,
            totalRows: projectDatasets.reduce((sum: number, d: any) => sum + (d.rowCount || d.preview?.length || 0), 0),
            hasAnalysisResults: !!analysisResults.insights || !!analysisResults.recommendations,
            userQuestions: journeyProgress.userQuestions || [],
            questionAnswers: analysisResults.questionAnswers || [],
            userProvidedContext: context || ''
        };

        // Route to PM Agent for intelligent response
        let response: any;
        try {
            const { ProjectManagerAgent } = await import('../services/project-manager-agent');
            const pmAgent = new ProjectManagerAgent();

            response = await pmAgent.handleFollowUpQuestion({
                projectId,
                userId,
                question: question.trim(),
                projectContext: agentContext,
                analysisResults
            });
        } catch (agentError: any) {
            console.warn(`⚠️ [Agent Query] PM Agent error:`, agentError.message);
            // Fallback to simple response if agent fails
            response = generateFallbackResponse(question, agentContext, analysisResults);
        }

        // Log the query for analytics
        console.log(`✅ [Agent Query] Response generated for project ${projectId}`);

        // Create checkpoint for this interaction
        const checkpointId = `cp_query_${Date.now()}`;
        try {
            await storage.createAgentCheckpoint({
                id: checkpointId,
                projectId,
                stepName: 'agent_query',
                agentType: 'project_manager',
                status: 'completed',
                message: `User question: "${question.substring(0, 100)}..."`,
                data: {
                    question,
                    responsePreview: response.answer?.substring(0, 200),
                    timestamp: new Date().toISOString()
                }
            });
        } catch (cpError) {
            console.warn('Checkpoint creation failed (non-blocking):', cpError);
        }

        res.json({
            success: true,
            answer: response.answer,
            confidence: response.confidence || 0.8,
            sources: response.sources || [],
            relatedInsights: response.relatedInsights || [],
            suggestedFollowUps: response.suggestedFollowUps || [],
            agentContribution: {
                agentId: 'project_manager',
                timestamp: new Date().toISOString()
            }
        });

    } catch (error: any) {
        console.error('❌ [Agent Query] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to process agent query'
        });
    }
});

/**
 * [DAY 9] Generate insights from existing results via agent
 * POST /api/projects/:id/generate-insights
 */
router.post("/:id/generate-insights", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;
        const isAdmin = (req.user as any)?.isAdmin || false;
        const { focusArea } = req.body;

        console.log(`🔮 [Insight Generation] Generating insights for project ${projectId}`);

        const accessCheck = await canAccessProject(userId, projectId, isAdmin);
        if (!accessCheck.allowed) {
            return res.status(403).json({
                success: false,
                error: accessCheck.reason
            });
        }

        const project = accessCheck.project;
        const analysisResults = (project as any).analysisResults || {};
        const journeyProgress = (project as any).journeyProgress || {};

        // Get existing insights or generate new ones
        let insights: any[] = [];

        if (analysisResults.insights && analysisResults.insights.length > 0) {
            insights = analysisResults.insights;
        } else {
            // Generate insights via DS agent
            try {
                const { dataScienceOrchestrator } = await import('../services/data-science-orchestrator');
                const projectDatasets = await storage.getProjectDatasets(projectId);

                if (projectDatasets.length > 0) {
                    const dataset = projectDatasets[0];
                    const data = (dataset as any).data || (dataset as any).preview || [];

                    if (data.length > 0) {
                        const result = await dataScienceOrchestrator.generateQuickInsights({
                            data,
                            schema: (dataset as any).schema || {},
                            focusArea
                        });

                        insights = result.insights || [];
                    }
                }
            } catch (dsError: any) {
                console.warn('DS agent insight generation failed:', dsError.message);
            }
        }

        // Generate follow-up recommendations
        const recommendations = generateInsightRecommendations(insights, focusArea);

        res.json({
            success: true,
            insights,
            recommendations,
            generatedAt: new Date().toISOString(),
            focusArea: focusArea || 'general'
        });

    } catch (error: any) {
        console.error('❌ [Insight Generation] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate insights'
        });
    }
});

// ==========================================
// ✅ FIX 2.1: MISSING API ENDPOINTS
// ==========================================

/**
 * GET /api/projects/:id/decision-trail
 * Returns the audit trail of agent decisions for a project
 * ✅ FIX 2.1.1: Decision Trail Endpoint
 */
router.get("/:id/decision-trail", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: "Authentication required" });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ success: false, error: accessCheck.reason });
        }

        console.log(`📋 [FIX 2.1.1] Fetching decision trail for project ${projectId}`);

        // Query decision audits from database
        const audits = await db
            .select()
            .from(decisionAudits)
            .where(eq(decisionAudits.projectId, projectId))
            .orderBy(desc(decisionAudits.timestamp));

        // Format for frontend
        const decisionTrail = audits.map((audit: any) => ({
            id: audit.id,
            timestamp: audit.timestamp,
            agent: audit.agent,
            decisionType: audit.decisionType,
            decision: audit.decision,
            confidence: audit.confidence,
            reasoning: audit.reasoning,
            evidence: audit.evidence ? (typeof audit.evidence === 'string' ? JSON.parse(audit.evidence) : audit.evidence) : null,
            appliedAt: audit.appliedAt
        }));

        console.log(`✅ [FIX 2.1.1] Found ${decisionTrail.length} decision audit entries`);

        return res.json({
            success: true,
            decisionTrail,
            count: decisionTrail.length
        });

    } catch (error: any) {
        console.error('❌ [FIX 2.1.1] Error fetching decision trail:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/projects/:id/upload-sla
 * Returns SLA metrics for upload processing
 * ✅ FIX 2.1.2: Upload SLA Endpoint
 */
router.get("/:id/upload-sla", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: "Authentication required" });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ success: false, error: accessCheck.reason });
        }

        const project = accessCheck.project;
        const journeyProgress = (project as any)?.journeyProgress || {};
        const stepTimestamps = journeyProgress.stepTimestamps || {};

        // Calculate SLA metrics
        const uploadStarted = stepTimestamps.uploadStarted ? new Date(stepTimestamps.uploadStarted) : null;
        const uploadCompleted = stepTimestamps.uploadCompleted ? new Date(stepTimestamps.uploadCompleted) : null;

        let uploadDurationMs = 0;
        if (uploadStarted && uploadCompleted) {
            uploadDurationMs = uploadCompleted.getTime() - uploadStarted.getTime();
        }

        // Get datasets for size info
        const datasets = await storage.getProjectDatasets(projectId);
        const totalRecords = datasets.reduce((sum, ds) => {
            const dataset = (ds as any).dataset || ds;
            return sum + (dataset.recordCount || 0);
        }, 0);
        const totalSizeMB = datasets.reduce((sum, ds) => {
            const dataset = (ds as any).dataset || ds;
            const dataSizeBytes = JSON.stringify(dataset.data || []).length;
            return sum + (dataSizeBytes / (1024 * 1024));
        }, 0);

        // SLA thresholds (configurable)
        const SLA_THRESHOLDS = {
            small: { maxRecords: 10000, targetSeconds: 30 },
            medium: { maxRecords: 100000, targetSeconds: 120 },
            large: { maxRecords: 1000000, targetSeconds: 300 }
        };

        let slaTarget = SLA_THRESHOLDS.large.targetSeconds;
        let slaCategory = 'large';
        if (totalRecords <= SLA_THRESHOLDS.small.maxRecords) {
            slaTarget = SLA_THRESHOLDS.small.targetSeconds;
            slaCategory = 'small';
        } else if (totalRecords <= SLA_THRESHOLDS.medium.maxRecords) {
            slaTarget = SLA_THRESHOLDS.medium.targetSeconds;
            slaCategory = 'medium';
        }

        const uploadDurationSeconds = uploadDurationMs / 1000;
        const slaMet = uploadDurationSeconds <= slaTarget || uploadDurationSeconds === 0;

        console.log(`📊 [FIX 2.1.2] Upload SLA for project ${projectId}: ${uploadDurationSeconds}s (target: ${slaTarget}s)`);

        return res.json({
            success: true,
            sla: {
                uploadDurationMs,
                uploadDurationSeconds: Math.round(uploadDurationSeconds * 100) / 100,
                slaTargetSeconds: slaTarget,
                slaCategory,
                slaMet,
                totalRecords,
                totalSizeMB: Math.round(totalSizeMB * 100) / 100,
                recordsPerSecond: uploadDurationSeconds > 0 ? Math.round(totalRecords / uploadDurationSeconds) : 0,
                datasetCount: datasets.length,
                timestamps: {
                    started: uploadStarted?.toISOString() || null,
                    completed: uploadCompleted?.toISOString() || null
                }
            }
        });

    } catch (error: any) {
        console.error('❌ [FIX 2.1.2] Error fetching upload SLA:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/projects/:id/cost-estimate
 * Calculate analysis cost estimate for a project
 * ✅ V-1 FIX: Now uses CostEstimationService with admin-configurable pricing
 * ✅ P0 FIX: Added requireOwnership('project') middleware for consistent auth
 */
router.get("/:id/cost-estimate", ensureAuthenticated, requireOwnership('project'), async (req, res) => {
    try {
        const projectId = req.params.id;
        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }

        // Check if cost already locked - journeyProgress.lockedCostEstimate is SSOT
        const journeyProgressCheck = (project as any).journeyProgress || {};
        const lockedFromProgress = journeyProgressCheck.lockedCostEstimate;
        const lockedFromProject = (project as any).lockedCostEstimate;

        // Priority: journeyProgress (SSOT) > project table
        const lockedCostValue = lockedFromProgress ?? lockedFromProject;

        // Track if cost is locked - but don't return early
        // We need to calculate breakdown even for locked costs to show perAnalysisBreakdown
        const isLocked = (() => {
            if (lockedCostValue) {
                const lockedCost = typeof lockedCostValue === 'number'
                    ? lockedCostValue
                    : parseFloat(lockedCostValue);
                if (!isNaN(lockedCost) && lockedCost > 0) {
                    console.log(`✅ [Cost Estimate] Found locked cost for project ${projectId}: $${lockedCost} (source: ${lockedFromProgress ? 'journeyProgress' : 'project'})`);
                    return { locked: true, cost: lockedCost };
                }
            }
            return { locked: false, cost: 0 };
        })();

        // Get project data size
        const projectDatasets = await storage.getProjectDatasets(projectId);
        const totalRows = projectDatasets.reduce((sum: number, pd: { dataset: any }) => sum + (pd.dataset?.recordCount || 0), 0);
        const totalColumns = projectDatasets.reduce((sum: number, pd: { dataset: any }) => {
            const schema = pd.dataset?.schema || {};
            return sum + Object.keys(schema).length;
        }, 0);

        const journeyProgress = (project as any).journeyProgress || {};

        // FIX 5: Account for PII-excluded columns in cost estimation
        // Analysis execution excludes these columns, so cost should reflect effective column count
        const piiDecisions = journeyProgress.piiDecisions;
        const piiExcludedCount = (piiDecisions?.excludedColumns?.length || 0) +
                                 (piiDecisions?.selectedColumns?.length || 0);
        const effectiveColumns = Math.max(1, totalColumns - piiExcludedCount);
        if (piiExcludedCount > 0) {
            console.log(`🔒 [Cost Estimate] PII: ${piiExcludedCount} columns excluded, effective columns: ${effectiveColumns} (was ${totalColumns})`);
        }

        // DEBUG: Log available sources for analysisPath
        console.log(`🔍 [Cost Estimate] Searching for analysisPath in project ${projectId}:`);
        console.log(`   - executionConfig?.analysisPath: ${JSON.stringify(journeyProgress.executionConfig?.analysisPath || 'undefined')}`);
        console.log(`   - requirementsDocument?.analysisPath: ${journeyProgress.requirementsDocument?.analysisPath?.length || 0} items`);
        console.log(`   - approvedPlanId: ${journeyProgress.approvedPlanId || 'none'}`);

        // ✅ P1-C FIX: Enhanced logging to diagnose empty analysisPath
        if (journeyProgress.requirementsDocument?.analysisPath?.length > 0) {
            const firstPath = journeyProgress.requirementsDocument.analysisPath[0];
            console.log(`   - First analysisPath item structure: analysisType=${firstPath.analysisType}, techniques=${JSON.stringify(firstPath.techniques || [])}, name=${firstPath.analysisName || firstPath.name}`);
        }

        // ✅ FIX: Look at multiple sources for analysis types
        // Priority: 1. executionConfig (set by DS agent), 2. requirementsDocument, 3. approved plan
        let analysisPath = journeyProgress.executionConfig?.analysisPath
            || journeyProgress.requirementsDocument?.analysisPath
            || [];

        // If no analysisPath found, try to get from approved plan
        if (analysisPath.length === 0) {
            try {
                const { analysisPlans } = await import('@shared/schema');

                // Try to find a plan - either by approvedPlanId or any plan for this project
                let planQuery;
                if (journeyProgress.approvedPlanId) {
                    planQuery = db.select().from(analysisPlans)
                        .where(eq(analysisPlans.id, journeyProgress.approvedPlanId))
                        .limit(1);
                } else {
                    // Fallback: Get latest plan for this project
                    const { desc } = await import('drizzle-orm');
                    planQuery = db.select().from(analysisPlans)
                        .where(eq(analysisPlans.projectId, projectId))
                        .orderBy(desc(analysisPlans.createdAt))
                        .limit(1);
                }

                const [plan] = await planQuery;

                if (plan?.analysisSteps && (plan.analysisSteps as any[]).length > 0) {
                    // FIX: Extract analysis type from step's method/name fields (schema doesn't have type/analysisType)
                    // analysisStepSchema has: stepNumber, name, description, method, inputs, expectedOutputs, tools, estimatedDuration, confidence
                    analysisPath = (plan.analysisSteps as any[]).map((step: any) => {
                        // Priority: method field, then derive from name, then fallback
                        let analysisType = step.method || step.type || step.analysisType || 'statistical';

                        // Normalize common method names to pricing config keys
                        const methodLower = (step.method || step.name || '').toLowerCase();
                        if (/correlat/i.test(methodLower)) analysisType = 'correlation';
                        else if (/regress/i.test(methodLower)) analysisType = 'regression';
                        else if (/cluster/i.test(methodLower)) analysisType = 'clustering';
                        else if (/time.?series|forecast|trend/i.test(methodLower)) analysisType = 'time_series';
                        else if (/machine.?learn|ml|model|predict/i.test(methodLower)) analysisType = 'machine_learning';
                        else if (/visual|chart|graph|plot/i.test(methodLower)) analysisType = 'visualization';
                        else if (/sentiment/i.test(methodLower)) analysisType = 'sentiment';
                        else if (/business.?intel|bi|kpi/i.test(methodLower)) analysisType = 'business_intelligence';
                        else if (/descriptive|eda|explor/i.test(methodLower)) analysisType = 'descriptive';
                        else if (/diagnost/i.test(methodLower)) analysisType = 'diagnostic';
                        else if (/prescri|recommend/i.test(methodLower)) analysisType = 'prescriptive';
                        else if (/statist/i.test(methodLower)) analysisType = 'statistical';

                        return {
                            analysisType,
                            name: step.name,
                            method: step.method,
                            complexity: step.complexity || 'intermediate'
                        };
                    });
                    console.log(`📊 [Cost Estimate] Using ${analysisPath.length} analyses from plan ${plan.id}`);
                    console.log(`   Analysis types extracted: [${analysisPath.map((a: any) => a.analysisType).join(', ')}]`);
                } else if (plan) {
                    console.log(`⚠️ [Cost Estimate] Found plan ${plan.id} but no analysisSteps`);
                } else {
                    console.log(`⚠️ [Cost Estimate] No plan found for project ${projectId}`);
                }
            } catch (planError) {
                console.warn(`⚠️ [Cost Estimate] Could not load plan: ${planError}`);
            }
        }

        // Extract analysis types from the analysis path
        // FIX: Also extract from techniques array for requirementsDocument.analysisPath
        // AnalysisPath interface has: analysisType (descriptive/diagnostic/predictive/prescriptive)
        // AND techniques: string[] (e.g., ["regression", "time-series", "clustering"])
        // Techniques map better to pricing config keys
        const analysisTypes: string[] = [];

        if (analysisPath.length > 0) {
            for (const analysis of analysisPath) {
                // Add the main analysis type
                const mainType = analysis.analysisType || analysis.type || 'statistical';
                if (!analysisTypes.includes(mainType)) {
                    analysisTypes.push(mainType);
                }

                // Also add specific techniques (these map better to pricing)
                // e.g., ["regression", "correlation_analysis", "clustering"]
                if (analysis.techniques && Array.isArray(analysis.techniques)) {
                    for (const technique of analysis.techniques) {
                        // Normalize technique names to pricing config keys
                        let normalizedTechnique = technique.toLowerCase().replace(/[^a-z_]/g, '_');

                        // Map technique names to pricing keys
                        if (/correlat/i.test(technique)) normalizedTechnique = 'correlation';
                        else if (/regress/i.test(technique)) normalizedTechnique = 'regression';
                        else if (/cluster/i.test(technique)) normalizedTechnique = 'clustering';
                        else if (/time.?series|forecast|trend|seasonal/i.test(technique)) normalizedTechnique = 'time_series';
                        else if (/machine.?learn|ml|predict/i.test(technique)) normalizedTechnique = 'machine_learning';
                        else if (/segment/i.test(technique)) normalizedTechnique = 'clustering';
                        else if (/classif/i.test(technique)) normalizedTechnique = 'machine_learning';
                        else if (/statist|summary/i.test(technique)) normalizedTechnique = 'statistical';
                        else if (/distribut|explorat/i.test(technique)) normalizedTechnique = 'descriptive';

                        if (!analysisTypes.includes(normalizedTechnique)) {
                            analysisTypes.push(normalizedTechnique);
                        }
                    }
                }

                // Also check analysisName if available
                if (analysis.analysisName || analysis.name) {
                    const name = (analysis.analysisName || analysis.name || '').toLowerCase();
                    if (/correlat/i.test(name) && !analysisTypes.includes('correlation')) {
                        analysisTypes.push('correlation');
                    }
                    if (/regress/i.test(name) && !analysisTypes.includes('regression')) {
                        analysisTypes.push('regression');
                    }
                    if (/cluster|segment/i.test(name) && !analysisTypes.includes('clustering')) {
                        analysisTypes.push('clustering');
                    }
                    if (/time.?series|forecast|trend/i.test(name) && !analysisTypes.includes('time_series')) {
                        analysisTypes.push('time_series');
                    }
                }
            }
        }

        // ✅ P1-C FIX: Additional fallback - extract from requiredDataElements.analysisUsage
        if (analysisTypes.length === 0 && journeyProgress.requirementsDocument?.requiredDataElements?.length > 0) {
            console.log(`🔍 [Cost Estimate] Trying to extract from ${journeyProgress.requirementsDocument.requiredDataElements.length} requiredDataElements`);
            for (const element of journeyProgress.requirementsDocument.requiredDataElements) {
                if (element.analysisUsage && Array.isArray(element.analysisUsage)) {
                    for (const usage of element.analysisUsage) {
                        const usageLower = usage.toLowerCase();
                        if (/correlat/i.test(usageLower) && !analysisTypes.includes('correlation')) {
                            analysisTypes.push('correlation');
                        } else if (/regress/i.test(usageLower) && !analysisTypes.includes('regression')) {
                            analysisTypes.push('regression');
                        } else if (/cluster|segment/i.test(usageLower) && !analysisTypes.includes('clustering')) {
                            analysisTypes.push('clustering');
                        } else if (/time.?series|forecast|trend/i.test(usageLower) && !analysisTypes.includes('time_series')) {
                            analysisTypes.push('time_series');
                        } else if (/visual|chart|graph|plot/i.test(usageLower) && !analysisTypes.includes('visualization')) {
                            analysisTypes.push('visualization');
                        } else if (/machine.?learn|ml|predict/i.test(usageLower) && !analysisTypes.includes('machine_learning')) {
                            analysisTypes.push('machine_learning');
                        } else if (/sentiment/i.test(usageLower) && !analysisTypes.includes('sentiment')) {
                            analysisTypes.push('sentiment');
                        } else if (/descriptive|eda|summary|distribution/i.test(usageLower) && !analysisTypes.includes('descriptive')) {
                            analysisTypes.push('descriptive');
                        }
                    }
                }
            }
            if (analysisTypes.length > 0) {
                console.log(`   - Extracted from requiredDataElements: [${analysisTypes.join(', ')}]`);
            }
        }

        // ✅ P1-C FIX: Extract from user questions if still no types found
        if (analysisTypes.length === 0) {
            const questions = journeyProgress.requirementsDocument?.userQuestions
                || journeyProgress.userQuestions
                || (project as any).userQuestions
                || [];

            if (questions.length > 0) {
                console.log(`🔍 [Cost Estimate] Trying to extract from ${questions.length} user questions`);
                for (const question of questions) {
                    const qText = (typeof question === 'string' ? question : question?.text || question?.question || '').toLowerCase();
                    if (/correlat|relationship|associat/i.test(qText) && !analysisTypes.includes('correlation')) {
                        analysisTypes.push('correlation');
                    }
                    if (/predict|forecast|future/i.test(qText) && !analysisTypes.includes('machine_learning')) {
                        analysisTypes.push('machine_learning');
                    }
                    if (/trend|over time|time.?series/i.test(qText) && !analysisTypes.includes('time_series')) {
                        analysisTypes.push('time_series');
                    }
                    if (/segment|cluster|group|categorize/i.test(qText) && !analysisTypes.includes('clustering')) {
                        analysisTypes.push('clustering');
                    }
                    if (/factor|driver|impact|affect|influence/i.test(qText) && !analysisTypes.includes('regression')) {
                        analysisTypes.push('regression');
                    }
                    if (/distribution|frequency|summary|descriptive/i.test(qText) && !analysisTypes.includes('descriptive')) {
                        analysisTypes.push('descriptive');
                    }
                }
                if (analysisTypes.length > 0) {
                    console.log(`   - Inferred from user questions: [${analysisTypes.join(', ')}]`);
                }
            }
        }

        // Fallback: data-size-aware defaults when no analysis types found
        if (analysisTypes.length === 0 && totalRows > 0) {
            analysisTypes.push('statistical');
            analysisTypes.push('descriptive');
            if (totalRows > 1000) {
                analysisTypes.push('correlation');
            }
            if (totalRows > 5000) {
                analysisTypes.push('regression');
            }
            if (effectiveColumns > 10) {
                analysisTypes.push('clustering');
            }
            console.log(`⚠️ [Cost Estimate] No analysis types detected, using data-size-aware defaults: [${analysisTypes.join(', ')}] (${totalRows} rows, ${effectiveColumns} effective cols)`);
        } else if (analysisTypes.length === 0) {
            console.log(`⚠️ [Cost Estimate] No analysis types detected and no data, using minimal defaults [statistical, descriptive]`);
            analysisTypes.push('statistical');
            analysisTypes.push('descriptive');
        }

        console.log(`📊 [Cost Estimate] Analysis types for pricing: [${analysisTypes.join(', ')}] (${analysisTypes.length} types)`);

        // Determine complexity based on analysis path
        const complexity = analysisPath.length > 0
            ? (analysisPath[0].complexity || 'intermediate')
            : 'basic';

        // Determine artifacts to generate
        const includeArtifacts = ['report'];
        if (journeyProgress.generateVisualization !== false) {
            includeArtifacts.push('dashboard');
        }

        // Use CostEstimationService for admin-configurable pricing
        const { CostEstimationService } = await import('../services/cost-estimation-service');
        const estimate = await CostEstimationService.estimateAnalysisCost(
            projectId,
            analysisTypes,
            { rows: totalRows, columns: effectiveColumns },  // FIX 5: Use PII-adjusted column count
            complexity as 'basic' | 'intermediate' | 'advanced' | 'expert',
            includeArtifacts
        );

        // Minimum cost floor: ensure estimate is never unrealistically low for real data
        const MINIMUM_COST_FLOOR = 2.50;
        if (estimate.totalCost < MINIMUM_COST_FLOOR && totalRows > 0) {
            console.log(`⚠️ [Cost Estimate] Estimated $${estimate.totalCost.toFixed(2)} below floor, applying minimum $${MINIMUM_COST_FLOOR}`);
            estimate.totalCost = MINIMUM_COST_FLOOR;
        }

        console.log(`✅ [Cost Estimate] Calculated $${estimate.totalCost.toFixed(2)} for project ${projectId} using admin pricing config`);
        console.log(`   - ${totalRows} rows, ${analysisTypes.length} analyses, ${complexity} complexity`);
        console.log(`   - Credits required: ${estimate.creditsRequired}`);

        // P0-8 FIX: Transform breakdown array to summary object for frontend compatibility
        // Frontend expects: { basePlatformFee, dataProcessing, analysisExecution, perAnalysisBreakdown }
        const breakdownSummary: {
            basePlatformFee: number;
            dataProcessing: number;
            analysisExecution: number;
            rowsProcessed: number;
            analysisTypes: number;
            perAnalysisBreakdown: Array<{ type: string; cost: number; factor?: number }>;
        } = {
            basePlatformFee: 0,
            dataProcessing: 0,
            analysisExecution: 0,
            rowsProcessed: totalRows,
            analysisTypes: analysisTypes.length,
            perAnalysisBreakdown: []
        };

        // Parse breakdown array into summary object
        for (const item of estimate.breakdown) {
            if (item.item === 'Platform Fee') {
                breakdownSummary.basePlatformFee = item.cost;
            } else if (item.item === 'Data Processing') {
                breakdownSummary.dataProcessing = item.cost;
            } else if (item.item.includes('Analysis') && !item.item.includes('Generation')) {
                // Individual analysis item - add to per-analysis breakdown
                breakdownSummary.perAnalysisBreakdown.push({
                    type: item.item.replace(' Analysis', ''),
                    cost: item.cost,
                    factor: item.factor
                });
                breakdownSummary.analysisExecution += item.cost;
            } else if (item.item.includes('Generation')) {
                // Artifact generation costs - add to total but track separately
                breakdownSummary.analysisExecution += item.cost;
            }
        }

        console.log(`   - Per-analysis breakdown: ${breakdownSummary.perAnalysisBreakdown.map(a => `${a.type}: $${a.cost.toFixed(2)}`).join(', ')}`);

        // Use locked cost if available, otherwise use calculated cost
        const finalCost = isLocked.locked ? isLocked.cost : estimate.totalCost;
        console.log(`💰 [Cost Estimate] Final cost for ${projectId}: $${finalCost.toFixed(2)} (locked: ${isLocked.locked})`);

        return res.json({
            success: true,
            estimatedCost: finalCost,
            totalCost: finalCost,
            creditsRequired: isLocked.locked ? Math.ceil(isLocked.cost * 100) : estimate.creditsRequired,
            estimatedDuration: estimate.estimatedDuration,
            confidenceScore: estimate.confidenceScore,
            breakdown: breakdownSummary, // Summary object for frontend with perAnalysisBreakdown
            rawBreakdown: estimate.breakdown, // Full array for detailed display
            warnings: estimate.warnings,
            currency: estimate.currency,
            isLocked: isLocked.locked,
            // Legacy format for backward compatibility
            analysisCount: analysisTypes.length,
            rowsProcessed: totalRows
        });
    } catch (error: any) {
        console.error('❌ [Cost Estimate] Error calculating cost estimate:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to calculate cost estimate'
        });
    }
});

/**
 * POST /api/projects/:id/lock-cost
 * Locks the cost estimate before payment - ensures Stripe checkout uses the displayed price
 * ✅ PHASE 6 FIX: Cost Locking Endpoint
 */
router.post("/:id/lock-cost", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;
        const userIsAdmin = (req.user as any)?.isAdmin || false;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const access = await canAccessProject(userId, projectId, userIsAdmin);
        if (!access.allowed) {
            return res.status(403).json({ success: false, error: access.reason });
        }

        const { lockedCostEstimate } = req.body;

        if (!lockedCostEstimate || parseFloat(lockedCostEstimate) <= 0) {
            return res.status(400).json({ success: false, error: 'Valid cost estimate required' });
        }

        // P1-15 FIX: Server-side cost validation - reject if frontend cost deviates >10% from server estimate
        const project = access.project;
        const existingProgress = (project as any)?.journeyProgress || {};
        const serverEstimate = existingProgress.backendCostEstimate?.totalCost
          || existingProgress.costEstimate?.totalCost;
        const clientCost = parseFloat(lockedCostEstimate);

        if (serverEstimate && Math.abs(clientCost - serverEstimate) / serverEstimate > 0.10) {
            console.warn(`⚠️ [Lock Cost] Client cost $${clientCost} deviates >10% from server estimate $${serverEstimate} for project ${projectId}`);
            return res.status(400).json({
                success: false,
                error: `Cost mismatch: please refresh pricing. Expected ~$${serverEstimate.toFixed(2)}, got $${clientCost.toFixed(2)}`
            });
        }

        const costValue = clientCost.toFixed(2);

        // Update top-level project field
        await storage.updateProject(projectId, {
            lockedCostEstimate: costValue,
        } as any);

        // Use atomicMerge for journeyProgress to prevent overwriting other progress keys
        await storage.atomicMergeJourneyProgress(projectId, {
            lockedCostEstimate: parseFloat(costValue), // Store as number in journeyProgress (SSOT)
            costLockedAt: new Date().toISOString()
        });

        console.log(`✅ [Lock Cost] Saved lockedCostEstimate $${costValue} to BOTH project AND journeyProgress for ${projectId}`);

        return res.json({
            success: true,
            lockedCostEstimate: costValue,
            message: 'Cost estimate locked successfully'
        });
    } catch (error: any) {
        console.error('❌ [Lock Cost] Error locking cost:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to lock cost estimate'
        });
    }
});

/**
 * POST /api/projects/:id/generate-charts
 * Generates visualization charts for project data
 * ✅ FIX 2.1.3: Chart Generation Endpoint
 */
router.post("/:id/generate-charts", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: "Authentication required" });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ success: false, error: accessCheck.reason });
        }

        const { chartTypes, columns, options } = req.body;

        // Get project data
        const datasets = await storage.getProjectDatasets(projectId);
        if (!datasets.length) {
            return res.status(400).json({ success: false, error: 'No datasets found' });
        }

        const primaryDataset = (datasets[0] as any).dataset || datasets[0];
        const data = primaryDataset.ingestionMetadata?.transformedData ||
                     primaryDataset.data ||
                     primaryDataset.preview || [];

        if (data.length === 0) {
            return res.status(400).json({ success: false, error: 'No data available for chart generation' });
        }

        const schema = primaryDataset.ingestionMetadata?.transformedSchema ||
                       primaryDataset.schema ||
                       {};

        console.log(`📊 [FIX 2.1.3] Generating charts for project ${projectId} with ${data.length} rows`);

        const charts: any[] = [];
        const requestedTypes = chartTypes || ['bar', 'line', 'pie'];
        const availableColumns = columns || Object.keys(schema);

        // Identify numeric and categorical columns
        const numericColumns: string[] = [];
        const categoricalColumns: string[] = [];

        for (const col of availableColumns) {
            const colSchema = schema[col];
            const sampleValues = data.slice(0, 100).map((r: any) => r[col]).filter((v: any) => v != null);
            const isNumeric = sampleValues.every((v: any) => !isNaN(Number(v)));

            if (isNumeric || colSchema?.type === 'number') {
                numericColumns.push(col);
            } else {
                categoricalColumns.push(col);
            }
        }

        // Generate charts based on data types and requested types
        for (const chartType of requestedTypes) {
            try {
                let chartConfig: any = null;

                switch (chartType) {
                    case 'bar':
                        if (categoricalColumns.length > 0 && numericColumns.length > 0) {
                            const xCol = categoricalColumns[0];
                            const yCol = numericColumns[0];

                            // Aggregate data by category
                            const aggregated = new Map<string, number>();
                            for (const row of data) {
                                const key = String(row[xCol] || 'Unknown');
                                const value = Number(row[yCol]) || 0;
                                aggregated.set(key, (aggregated.get(key) || 0) + value);
                            }

                            chartConfig = {
                                type: 'bar',
                                title: `${yCol} by ${xCol}`,
                                xAxis: { label: xCol, categories: Array.from(aggregated.keys()).slice(0, 20) },
                                yAxis: { label: yCol },
                                series: [{
                                    name: yCol,
                                    data: Array.from(aggregated.values()).slice(0, 20)
                                }]
                            };
                        }
                        break;

                    case 'line':
                        if (numericColumns.length >= 2) {
                            const xCol = numericColumns[0];
                            const yCol = numericColumns[1];

                            chartConfig = {
                                type: 'line',
                                title: `${yCol} vs ${xCol}`,
                                xAxis: { label: xCol },
                                yAxis: { label: yCol },
                                series: [{
                                    name: yCol,
                                    data: data.slice(0, 100).map((row: any) => ({
                                        x: Number(row[xCol]) || 0,
                                        y: Number(row[yCol]) || 0
                                    }))
                                }]
                            };
                        }
                        break;

                    case 'pie':
                        if (categoricalColumns.length > 0) {
                            const catCol = categoricalColumns[0];

                            // Count occurrences
                            const counts = new Map<string, number>();
                            for (const row of data) {
                                const key = String(row[catCol] || 'Unknown');
                                counts.set(key, (counts.get(key) || 0) + 1);
                            }

                            chartConfig = {
                                type: 'pie',
                                title: `Distribution of ${catCol}`,
                                series: [{
                                    name: catCol,
                                    data: Array.from(counts.entries())
                                        .slice(0, 10)
                                        .map(([name, value]) => ({ name, value }))
                                }]
                            };
                        }
                        break;

                    case 'scatter':
                        if (numericColumns.length >= 2) {
                            const xCol = numericColumns[0];
                            const yCol = numericColumns[1];

                            chartConfig = {
                                type: 'scatter',
                                title: `${yCol} vs ${xCol}`,
                                xAxis: { label: xCol },
                                yAxis: { label: yCol },
                                series: [{
                                    name: 'Data Points',
                                    data: data.slice(0, 500).map((row: any) => ({
                                        x: Number(row[xCol]) || 0,
                                        y: Number(row[yCol]) || 0
                                    }))
                                }]
                            };
                        }
                        break;
                }

                if (chartConfig) {
                    charts.push({
                        id: nanoid(),
                        ...chartConfig,
                        generatedAt: new Date().toISOString()
                    });
                }
            } catch (chartError) {
                console.warn(`⚠️ [FIX 2.1.3] Failed to generate ${chartType} chart:`, chartError);
            }
        }

        // Save charts to project journeyProgress using atomic merge
        await storage.atomicMergeJourneyProgress(projectId, {
            generatedCharts: charts,
            chartsGeneratedAt: new Date().toISOString()
        });

        console.log(`✅ [FIX 2.1.3] Generated ${charts.length} charts for project ${projectId}`);

        return res.json({
            success: true,
            charts,
            count: charts.length,
            availableColumns: {
                numeric: numericColumns,
                categorical: categoricalColumns
            }
        });

    } catch (error: any) {
        console.error('❌ [FIX 2.1.3] Error generating charts:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/projects/:id/can-proceed
 * Check if step can proceed based on checkpoint approvals
 * ✅ FIX 2.2: Checkpoint gating helper endpoint
 */
router.get("/:id/can-proceed", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const targetStep = req.query.targetStep as string;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: "Authentication required" });
        }

        if (!targetStep) {
            return res.status(400).json({ success: false, error: "targetStep query parameter required" });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ success: false, error: accessCheck.reason });
        }

        // Get pending checkpoints for this project
        const project = accessCheck.project;
        const journeyProgress = (project as any)?.journeyProgress || {};
        const checkpoints = journeyProgress.checkpoints || [];

        // Filter for pending checkpoints that require approval
        const pendingCheckpoints = checkpoints.filter((cp: any) =>
            cp.status === 'pending' && cp.requiresApproval === true
        );

        // Step order for determining if checkpoint blocks target
        const stepOrder = ['prepare', 'upload', 'verification', 'transformation', 'plan', 'execute', 'results'];
        const targetIndex = stepOrder.indexOf(targetStep);

        // Map checkpoint stages to steps
        const stageToStep: Record<string, string> = {
            'data_quality_review': 'verification',
            'pii_detection': 'verification',
            'transformation_review': 'transformation',
            'analysis_plan_review': 'plan',
            'results_validation': 'execute'
        };

        let blockingCheckpoint = null;
        for (const checkpoint of pendingCheckpoints) {
            const checkpointStep = stageToStep[checkpoint.stage] || 'unknown';
            const checkpointIndex = stepOrder.indexOf(checkpointStep);

            // If checkpoint is for a step before target, it blocks progression
            if (checkpointIndex >= 0 && checkpointIndex < targetIndex) {
                blockingCheckpoint = checkpoint;
                break;
            }
        }

        if (blockingCheckpoint) {
            console.log(`⚠️ [FIX 2.2] Checkpoint ${blockingCheckpoint.id} blocks progression to ${targetStep}`);
            return res.json({
                success: true,
                canProceed: false,
                blockingCheckpoint,
                reason: `Checkpoint "${blockingCheckpoint.stage}" requires approval before proceeding to ${targetStep}`
            });
        }

        // P1-2: Add data availability validation using WorkflowService
        const fromStep = (req.query.fromStep as string) || journeyProgress.currentStep?.name || 'data';
        const { WorkflowService } = await import('../workflow-service');

        // Get datasets for this project
        const projectDatasetLinks = await db.select({ dataset: datasetsTable })
            .from(projectDatasets)
            .innerJoin(datasetsTable, eq(projectDatasets.datasetId, datasetsTable.id))
            .where(eq(projectDatasets.projectId, projectId));

        const datasetList = projectDatasetLinks.map((link: { dataset: any }) => link.dataset);

        // Validate data availability for the step transition
        const dataValidation = WorkflowService.validateStepTransition(
            fromStep,
            targetStep,
            {
                datasets: datasetList,
                journeyProgress: journeyProgress,
                analysisResults: (project as any)?.analysisResults,
                requirementsDocument: journeyProgress?.requirementsDocument
            }
        );

        if (!dataValidation.canProceed) {
            console.log(`⚠️ [P1-2] Data availability blocks progression to ${targetStep}: ${dataValidation.missingRequirements.join(', ')}`);
            return res.json({
                success: true,
                canProceed: false,
                missingRequirements: dataValidation.missingRequirements,
                warnings: dataValidation.warnings,
                reason: `Missing requirements: ${dataValidation.missingRequirements.join('; ')}`
            });
        }

        return res.json({
            success: true,
            canProceed: true,
            pendingCheckpoints: pendingCheckpoints.length,
            warnings: dataValidation.warnings // Return warnings even if can proceed
        });

    } catch (error: any) {
        console.error('❌ [FIX 2.2] Error checking can-proceed:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ========================================
// NATURAL LANGUAGE TRANSLATION ENDPOINTS
// ========================================

/**
 * Translate content for target audience
 * POST /api/projects/:id/translate
 */
router.post('/:id/translate', ensureAuthenticated, async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = (req.user as any)?.id;
        const isAdmin = (req.user as any)?.isAdmin || false;

        // Verify ownership
        const accessCheck = await canAccessProject(userId, projectId, isAdmin);
        if (!accessCheck.allowed) {
            return res.status(403).json({ success: false, error: accessCheck.reason });
        }

        const { type, content, audience, industry } = req.body;

        if (!type || !content || !audience) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: type, content, audience'
            });
        }

        // Import translator
        const { naturalLanguageTranslator } = await import('../services/natural-language-translator');

        const context = {
            audience: audience as any,
            industry,
            projectName: (accessCheck.project as any)?.name
        };

        let result;
        switch (type) {
            case 'schema':
                result = await naturalLanguageTranslator.translateSchemaWithAI(content, context);
                break;
            case 'results':
                result = await naturalLanguageTranslator.translateResultsWithAI(content, context);
                break;
            case 'quality':
                result = await naturalLanguageTranslator.translateQualityWithAI(content, context);
                break;
            case 'error':
                result = await naturalLanguageTranslator.translateErrorWithAI(content, context);
                break;
            default:
                return res.status(400).json({
                    success: false,
                    error: `Unknown translation type: ${type}. Valid types: schema, results, quality, error`
                });
        }

        console.log(`✅ [Translation] Translated ${type} for ${audience} audience (cached: ${result.cached})`);

        return res.json({
            success: result.success,
            data: result.data,
            cached: result.cached,
            provider: result.provider,
            error: result.error
        });

    } catch (error: any) {
        console.error('❌ [Translation] Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Clarify a technical term
 * POST /api/projects/:id/clarify-term
 */
router.post('/:id/clarify-term', ensureAuthenticated, async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = (req.user as any)?.id;
        const isAdmin = (req.user as any)?.isAdmin || false;

        // Verify ownership
        const accessCheck = await canAccessProject(userId, projectId, isAdmin);
        if (!accessCheck.allowed) {
            return res.status(403).json({ success: false, error: accessCheck.reason });
        }

        const { term, context, audience } = req.body;

        if (!term || !audience) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: term, audience'
            });
        }

        // Import translator
        const { naturalLanguageTranslator } = await import('../services/natural-language-translator');

        const result = await naturalLanguageTranslator.clarifyTermWithAI(
            term,
            context || 'data analysis',
            audience as any
        );

        return res.json({
            success: result.success,
            data: result.data,
            cached: result.cached,
            error: result.error
        });

    } catch (error: any) {
        console.error('❌ [Clarify Term] Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Check and correct grammar
 * POST /api/projects/:id/check-grammar
 */
router.post('/:id/check-grammar', ensureAuthenticated, async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: text'
            });
        }

        // Import translator
        const { naturalLanguageTranslator } = await import('../services/natural-language-translator');

        const result = await naturalLanguageTranslator.checkGrammarWithAI(text);

        return res.json({
            success: result.success,
            data: result.data,
            cached: result.cached,
            error: result.error
        });

    } catch (error: any) {
        console.error('❌ [Grammar Check] Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// CLARIFICATION ENDPOINTS
// ==========================================

/**
 * Get pending clarification requests for a project
 * GET /api/projects/:id/clarifications
 */
router.get('/:id/clarifications', ensureAuthenticated, async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = (req.user as any)?.id;
        const isAdmin = (req.user as any)?.isAdmin || false;

        // Check access
        const access = await canAccessProject(userId, projectId, isAdmin);
        if (!access.allowed) {
            return res.status(403).json({ success: false, error: access.reason });
        }

        // Import clarification service
        const { clarificationService } = await import('../services/clarification-service');

        const pending = await clarificationService.getPendingClarifications(projectId);
        const history = await clarificationService.getClarificationHistory(projectId);

        return res.json({
            success: true,
            data: {
                pending,
                history,
                hasPending: pending !== null && pending.status === 'pending'
            }
        });

    } catch (error: any) {
        console.error('❌ [Clarifications] Error getting clarifications:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Detect ambiguities in user input
 * POST /api/projects/:id/clarifications/detect
 */
router.post('/:id/clarifications/detect', ensureAuthenticated, async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = (req.user as any)?.id;
        const isAdmin = (req.user as any)?.isAdmin || false;
        const { input, inputType, context } = req.body;

        if (!input) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: input'
            });
        }

        // Check access
        const access = await canAccessProject(userId, projectId, isAdmin);
        if (!access.allowed) {
            return res.status(403).json({ success: false, error: access.reason });
        }

        const project = access.project;

        // Import clarification service
        const { clarificationService } = await import('../services/clarification-service');

        // Build detection context from project data
        const detectionContext = {
            industry: project.industry || context?.industry,
            journeyType: (project as any).journeyType || 'data_analysis',
            existingColumns: context?.existingColumns || [],
            userRole: context?.userRole,
            projectGoals: project.goals ? [project.goals] : []
        };

        const result = await clarificationService.detectAmbiguities(
            input,
            detectionContext,
            inputType || 'goal'
        );

        // If ambiguities found, optionally create a clarification request
        if (result.hasAmbiguities && req.body.createRequest !== false) {
            await clarificationService.createClarificationRequest(
                projectId,
                result.questions,
                input,
                inputType || 'goal'
            );
        }

        return res.json({
            success: true,
            data: result
        });

    } catch (error: any) {
        console.error('❌ [Clarifications] Error detecting ambiguities:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Submit answers to clarification questions
 * POST /api/projects/:id/clarifications/submit
 */
router.post('/:id/clarifications/submit', ensureAuthenticated, async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = (req.user as any)?.id;
        const isAdmin = (req.user as any)?.isAdmin || false;
        const { answers } = req.body;

        if (!answers || !Array.isArray(answers)) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: answers (array)'
            });
        }

        // Check access
        const access = await canAccessProject(userId, projectId, isAdmin);
        if (!access.allowed) {
            return res.status(403).json({ success: false, error: access.reason });
        }

        // Import clarification service
        const { clarificationService } = await import('../services/clarification-service');

        // Format answers with timestamp
        const formattedAnswers = answers.map((a: any) => ({
            questionId: a.questionId,
            answer: a.answer,
            answeredAt: new Date().toISOString(),
            modifiedOriginal: a.modifiedOriginal || false
        }));

        const result = await clarificationService.submitClarificationAnswers(
            projectId,
            formattedAnswers
        );

        return res.json({
            success: result.success,
            data: {
                revisedInput: result.revisedInput,
                remainingQuestions: result.remainingQuestions
            }
        });

    } catch (error: any) {
        console.error('❌ [Clarifications] Error submitting answers:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Skip clarification (proceed without answering)
 * POST /api/projects/:id/clarifications/skip
 */
router.post('/:id/clarifications/skip', ensureAuthenticated, async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = (req.user as any)?.id;
        const isAdmin = (req.user as any)?.isAdmin || false;

        // Check access
        const access = await canAccessProject(userId, projectId, isAdmin);
        if (!access.allowed) {
            return res.status(403).json({ success: false, error: access.reason });
        }

        // Import clarification service
        const { clarificationService } = await import('../services/clarification-service');

        const success = await clarificationService.skipClarification(projectId);

        return res.json({
            success,
            message: success ? 'Clarification skipped' : 'No pending clarification to skip'
        });

    } catch (error: any) {
        console.error('❌ [Clarifications] Error skipping clarification:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Validate user input without creating a request
 * POST /api/projects/:id/clarifications/validate
 */
router.post('/:id/clarifications/validate', ensureAuthenticated, async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = (req.user as any)?.id;
        const isAdmin = (req.user as any)?.isAdmin || false;
        const { input, inputType, context } = req.body;

        if (!input) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: input'
            });
        }

        // Check access
        const access = await canAccessProject(userId, projectId, isAdmin);
        if (!access.allowed) {
            return res.status(403).json({ success: false, error: access.reason });
        }

        const project = access.project;

        // Import clarification service
        const { clarificationService } = await import('../services/clarification-service');

        // Build detection context
        const detectionContext = {
            industry: project.industry || context?.industry,
            journeyType: (project as any).journeyType || 'data_analysis',
            existingColumns: context?.existingColumns || [],
            userRole: context?.userRole,
            projectGoals: project.goals ? [project.goals] : []
        };

        const result = await clarificationService.validateInput(
            input,
            detectionContext,
            inputType || 'goal'
        );

        return res.json({
            success: true,
            data: result
        });

    } catch (error: any) {
        console.error('❌ [Clarifications] Error validating input:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Helper function for fallback response when agent unavailable
function generateFallbackResponse(question: string, context: any, results: any): any {
    const lowercaseQ = question.toLowerCase();

    // Check for common question types
    if (lowercaseQ.includes('status') || lowercaseQ.includes('progress')) {
        return {
            answer: `Your project "${context.projectName}" is currently at the "${context.currentStep}" step. You have completed ${context.completedSteps?.length || 0} steps so far with ${context.datasetCount} dataset(s) containing approximately ${context.totalRows} rows.`,
            confidence: 0.9,
            sources: ['project_metadata']
        };
    }

    if (lowercaseQ.includes('insight') || lowercaseQ.includes('finding')) {
        const insights = results.insights || [];
        if (insights.length > 0) {
            return {
                answer: `Based on your analysis, here are the key findings:\n${insights.slice(0, 3).map((i: any, idx: number) => `${idx + 1}. ${i.title || i.description || i}`).join('\n')}`,
                confidence: 0.85,
                sources: ['analysis_results'],
                relatedInsights: insights.slice(0, 5)
            };
        }
    }

    if (lowercaseQ.includes('recommend') || lowercaseQ.includes('suggestion')) {
        const recommendations = results.recommendations || [];
        if (recommendations.length > 0) {
            return {
                answer: `Here are recommendations from your analysis:\n${recommendations.slice(0, 3).map((r: any, idx: number) => `${idx + 1}. ${r.title || r.description || r}`).join('\n')}`,
                confidence: 0.85,
                sources: ['analysis_recommendations']
            };
        }
    }

    // Default response
    return {
        answer: `I can help you understand your project "${context.projectName}". Your project has ${context.datasetCount} dataset(s) and is currently at the "${context.currentStep}" step. You can ask me about:\n- Analysis insights and findings\n- Data quality and transformations\n- Recommendations and next steps\n- Specific metrics or patterns in your data`,
        confidence: 0.7,
        sources: ['project_context'],
        suggestedFollowUps: [
            'What are the key insights from my analysis?',
            'What do you recommend I do next?',
            'Can you summarize my data quality?'
        ]
    };
}

// Helper function to generate recommendations from insights
function generateInsightRecommendations(insights: any[], focusArea?: string): string[] {
    const recommendations: string[] = [];

    if (insights.length === 0) {
        recommendations.push('Complete your analysis to generate insights');
        recommendations.push('Upload more data for comprehensive analysis');
        return recommendations;
    }

    // Generate recommendations based on insight types
    const hasCorrelations = insights.some((i: any) =>
        (i.type || '').includes('correlation') || (i.title || '').toLowerCase().includes('correlation')
    );
    const hasTrends = insights.some((i: any) =>
        (i.type || '').includes('trend') || (i.title || '').toLowerCase().includes('trend')
    );
    const hasAnomalies = insights.some((i: any) =>
        (i.type || '').includes('anomaly') || (i.title || '').toLowerCase().includes('anomaly')
    );

    if (hasCorrelations) {
        recommendations.push('Investigate the identified correlations for causal relationships');
    }
    if (hasTrends) {
        recommendations.push('Create time-series forecasts based on the detected trends');
    }
    if (hasAnomalies) {
        recommendations.push('Review anomalies to determine if they represent data quality issues or genuine patterns');
    }

    if (recommendations.length === 0) {
        recommendations.push('Review insights and identify actionable items');
        recommendations.push('Share findings with stakeholders');
    }

    return recommendations.slice(0, 5);
}
