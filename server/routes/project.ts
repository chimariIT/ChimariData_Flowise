// server/routes/project.ts
import { Router, type Request, type Response } from 'express';
import multer from "multer";
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
import { BusinessAgent } from '../services/business-agent';
import { getBillingService } from '../services/billing/unified-billing-service';
import type { JourneyType } from "../../shared/schema.js";
import { canAccessProject, isAdmin } from '../middleware/ownership';
import type { DataEngineerContext, DataScientistContext } from '../types/agent-context';
import { buildAgentContext } from '../utils/agent-context';
import { performanceWebhookService } from '../services/performance-webhook-service';
import { requiredDataElementsTool } from '../services/tools/required-data-elements-tool';
import { db } from '../db';
import { decisionAudits, projects, projectQuestions, projectDatasets } from '@shared/schema';
import { normalizeJourneyType } from '@shared/canonical-types';
import { QuestionAnswerService } from '../services/question-answer-service';
import { parseJourneyProgress, fillJourneyProgressFields } from '../utils/journey-progress';
import { eq, and, sql } from 'drizzle-orm';
import { DatasetJoiner, type JoinConfig as DatasetJoinConfig } from '../dataset-joiner';
import { executeTool } from '../services/mcp-tool-registry';

const normalizeProjectJourneyType = (value: unknown): JourneyType =>
    normalizeJourneyType(value as string | JourneyType | null);

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

const getPendingApprovalCheckpoints = async (projectId: string) => {
    const checkpoints = await projectAgentOrchestrator.getProjectCheckpoints(projectId);
    return checkpoints.filter((checkpoint) =>
        checkpoint.requiresUserInput && checkpoint.status === 'waiting_approval'
    );
};

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

const JOIN_KEY_PATTERNS: RegExp[] = [
    /^employee_?id$/i,
    /^emp_?id$/i,
    /^user_?id$/i,
    /^customer_?id$/i,
    /^department_?id$/i,
    /^dept_?id$/i,
    /^team_?id$/i,
    /^project_?id$/i,
    /^id$/i,
    /_id$/i,
    /^.*_key$/i,
    /^.*_code$/i
];

const MAX_MULTI_DATASET_SAMPLE_ROWS = 200;
const MAX_MULTI_DATASET_PREVIEW_ROWS = 50;

type ProjectDatasetEntry = { dataset: any; association: any };

type AutoJoinForeignKey = {
    datasetId: string;
    datasetName: string;
    targetColumn: string;
    primaryColumn: string;
    confidence: number;
    detectionSource: string;
};

type AutoJoinDetectionMethod = 'metadata' | 'data_engineer_agent' | 'schema_match' | 'fallback_concat';

type AutoJoinPlan = {
    strategy: 'join' | 'concat';
    joinType: 'inner' | 'left' | 'right' | 'outer';
    detectionMethod: AutoJoinDetectionMethod;
    primaryDatasetId: string;
    primaryColumn: string;
    foreignKeys: AutoJoinForeignKey[];
};

type MultiDatasetPreviewPayload = {
    previewRows: any[];
    fullData?: any[]; // P1-1 FIX: Full joined dataset for analysis execution
    totalRowCount?: number; // P1-1 FIX: Total row count of full joined dataset
    schema: Record<string, any>;
    joinInsights: {
        detectionMethod: AutoJoinDetectionMethod;
        joinStrategy: 'join' | 'concat';
        joinType: 'inner' | 'left' | 'right' | 'outer';
        primaryDatasetId: string;
        primaryDatasetName: string;
        primaryColumn: string;
        foreignKeys: AutoJoinForeignKey[];
        datasetCount: number;
        previewRowCount: number;
        warnings: string[];
    };
    autoJoinConfig: {
        enabled: boolean;
        strategy: 'join' | 'concat';
        type: 'inner' | 'left' | 'right' | 'outer';
        primaryDatasetId: string;
        primaryDatasetName: string;
        primaryColumn: string;
        foreignKeys: AutoJoinForeignKey[];
        detectionMethod: AutoJoinDetectionMethod;
        datasetCount: number;
        generatedAt: string;
    };
    generatedAt?: string; // Optional timestamp for generation
};

const stripFileExtension = (value: string | undefined): string => {
    if (!value) {
        return '';
    }
    return value.replace(/\.[^/.]+$/, '');
};

const normalizeDatasetLabel = (dataset: any): string => {
    return (
        dataset?.ingestionMetadata?.name ||
        dataset?.originalFileName ||
        dataset?.name ||
        dataset?.id ||
        'dataset'
    );
};

const normalizeLabelForComparison = (value: string): string =>
    stripFileExtension(value).toLowerCase().replace(/[^a-z0-9]+/g, '_');

// Normalize column names for comparison (remove underscores, lowercase)
const normalizeColumnName = (column: string): string => {
    return column.toLowerCase().replace(/_/g, '');
};

// Find matching column with case-insensitive and underscore-tolerant matching
const findMatchingColumn = (schema: Record<string, any>, targetColumn: string): string | null => {
    const schemaColumns = Object.keys(schema);
    const normalizedTarget = normalizeColumnName(targetColumn);

    // First try exact match
    if (schemaColumns.includes(targetColumn)) {
        return targetColumn;
    }

    // Then try normalized match
    const match = schemaColumns.find(col => normalizeColumnName(col) === normalizedTarget);
    return match || null;
};

const datasetHasColumn = (dataset: any, column: string | undefined): boolean => {
    if (!dataset || !column) {
        return false;
    }
    const schema = dataset.schema || {};
    // Check for exact match or normalized match
    return findMatchingColumn(schema, column) !== null;
};

const detectPreferredPrimaryColumn = (dataset: any): string => {
    const schema = dataset?.schema || {};
    const columns = Object.keys(schema);
    if (!columns.length) {
        return 'id';
    }
    const preferred = columns.find((column) => JOIN_KEY_PATTERNS.some((pattern) => pattern.test(column)));
    return preferred || columns[0];
};

const extractDatasetRows = (dataset: any, maxRows = MAX_MULTI_DATASET_SAMPLE_ROWS): any[] => {
    if (!dataset) {
        return [];
    }
    const sources = [
        dataset.preview,
        dataset.ingestionMetadata?.preview,
        dataset.ingestionMetadata?.sampleRows,
        dataset.sampleRows,
        dataset.data
    ];

    for (const source of sources) {
        const parsed = safeParseJson(source);
        if (Array.isArray(parsed) && parsed.length) {
            const normalizedRows = parsed
                .filter((row) => row && typeof row === 'object')
                .map((row) => ({ ...row }));
            if (normalizedRows.length) {
                return normalizedRows.slice(0, maxRows);
            }
        }
    }
    return [];
};

const regenerateDatasetPreview = async (dataset: any): Promise<any[]> => {
    if (!dataset?.storageUri || !dataset?.id) {
        return [];
    }

    try {
        const buffer = await fs.readFile(dataset.storageUri);
        const fileName = dataset.originalFileName || dataset.name || path.basename(dataset.storageUri);
        const mimeType =
            dataset.mimeType ||
            (fileName.endsWith('.json')
                ? 'application/json'
                : fileName.endsWith('.xlsx') || fileName.endsWith('.xls')
                    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    : 'text/csv');

        const processed = await FileProcessor.processFile(buffer, fileName, mimeType);
        const previewRows = Array.isArray(processed.preview)
            ? processed.preview.slice(0, MAX_MULTI_DATASET_SAMPLE_ROWS)
            : [];

        if (previewRows.length) {
            const updatedMetadata = {
                ...(dataset.ingestionMetadata || {}),
                preview: previewRows,
                regeneratedPreviewAt: new Date().toISOString(),
                regenerationSource: 'multi_dataset_preview_auto'
            };

            try {
                await storage.updateDataset(dataset.id, {
                    preview: previewRows,
                    schema: dataset.schema || processed.schema,
                    recordCount: dataset.recordCount ?? processed.recordCount,
                    ingestionMetadata: updatedMetadata
                } as any);
            } catch (persistError) {
                console.error(`Failed to persist regenerated preview for dataset ${dataset.id}:`, persistError);
            }

            dataset.preview = previewRows;
            dataset.schema = dataset.schema || processed.schema;
            dataset.recordCount = dataset.recordCount ?? processed.recordCount;
            dataset.ingestionMetadata = updatedMetadata;
        }

        return previewRows;
    } catch (error) {
        console.error(`Failed to regenerate preview for dataset ${dataset?.id}:`, error);
        return [];
    }
};

const ensureDatasetRowsForPreview = async (dataset: any): Promise<any[]> => {
    const rows = extractDatasetRows(dataset);
    if (rows.length) {
        return rows;
    }
    return regenerateDatasetPreview(dataset);
};

const choosePrimaryDatasetEntry = (entries: ProjectDatasetEntry[]): ProjectDatasetEntry => {
    if (!entries.length) {
        throw new Error('No dataset entries available');
    }
    const primaryByRole = entries.find((entry) => entry.association?.role === 'primary');
    if (primaryByRole) {
        return primaryByRole;
    }
    return entries.reduce((acc, entry) => {
        const candidateCount = entry.dataset?.recordCount ?? 0;
        const accCount = acc.dataset?.recordCount ?? 0;
        return candidateCount > accCount ? entry : acc;
    }, entries[0]);
};

const readStoredJoinPlan = (project: any, entries: ProjectDatasetEntry[]): AutoJoinPlan | null => {
    const stored = project?.metadata?.autoDetectedJoinConfig;
    if (!stored) {
        return null;
    }

    const primaryEntry = choosePrimaryDatasetEntry(entries);
    const candidateForeignKeys = Array.isArray(stored.foreignKeys) ? stored.foreignKeys : [];
    const datasetIds = new Set(entries.map((entry) => entry.dataset?.id));
    const foreignKeys: AutoJoinForeignKey[] = candidateForeignKeys
        .filter((fk: any) => fk?.datasetId && datasetIds.has(fk.datasetId))
        .map((fk: any) => ({
            datasetId: fk.datasetId,
            datasetName:
                fk.datasetName ||
                normalizeDatasetLabel(entries.find((entry) => entry.dataset?.id === fk.datasetId)?.dataset),
            targetColumn: fk.targetColumn || fk.joinKey || fk.primaryColumn,
            primaryColumn: fk.primaryColumn || fk.targetColumn || detectPreferredPrimaryColumn(primaryEntry.dataset),
            confidence: typeof fk.confidence === 'number' ? fk.confidence : 0.85,
            detectionSource: fk.detectionSource || 'metadata'
        }));

    if (!foreignKeys.length && stored.strategy !== 'concat') {
        return null;
    }

    return {
        strategy: stored.strategy || (foreignKeys.length ? 'join' : 'concat'),
        joinType: stored.type || 'left',
        detectionMethod: 'metadata',
        primaryDatasetId: stored.primaryDatasetId || primaryEntry.dataset.id,
        primaryColumn: stored.primaryColumn || detectPreferredPrimaryColumn(primaryEntry.dataset),
        foreignKeys
    };
};

const detectAgentJoinPlan = (entries: ProjectDatasetEntry[], dataEngineer: DataEngineerAgent): AutoJoinPlan => {
    const primaryEntry = choosePrimaryDatasetEntry(entries);
    const plan: AutoJoinPlan = {
        strategy: 'join',
        joinType: 'left',
        detectionMethod: 'data_engineer_agent',
        primaryDatasetId: primaryEntry.dataset.id,
        primaryColumn: detectPreferredPrimaryColumn(primaryEntry.dataset),
        foreignKeys: []
    };

    const schemaPayload = entries
        .map((entry) => ({
            fileName: normalizeDatasetLabel(entry.dataset),
            schema: Object.entries(entry.dataset?.schema || {}).map(([name, info]: [string, any]) => ({
                name,
                type: typeof info === 'string' ? info : info?.type || 'text'
            }))
        }))
        .filter((item) => item.schema.length);

    if (schemaPayload.length < 2) {
        return plan;
    }

    const relationships = dataEngineer.detectCrossFileRelationshipsPublic(schemaPayload);
    if (!relationships.length) {
        return plan;
    }
    const normalizedPrimaryName = normalizeLabelForComparison(normalizeDatasetLabel(primaryEntry.dataset));

    entries.forEach((entry) => {
        if (entry.dataset.id === primaryEntry.dataset.id) {
            return;
        }
        const datasetLabel = normalizeDatasetLabel(entry.dataset);
        const normalizedDatasetName = normalizeLabelForComparison(datasetLabel);

        const relationship = relationships.find((candidate) => {
            const file1 = normalizeLabelForComparison(candidate.file1);
            const file2 = normalizeLabelForComparison(candidate.file2);
            return (
                (file1 === normalizedDatasetName && file2 === normalizedPrimaryName) ||
                (file2 === normalizedDatasetName && file1 === normalizedPrimaryName)
            );
        });

        if (!relationship) {
            return;
        }

        const joinKey = relationship.joinKey;
        if (!datasetHasColumn(entry.dataset, joinKey) || !datasetHasColumn(primaryEntry.dataset, joinKey)) {
            return;
        }

        // FIX: Update plan.primaryColumn to match the detected join key
        // This ensures the primary dataset's join key aligns with secondary datasets
        if (plan.foreignKeys.length === 0) {
            plan.primaryColumn = joinKey;
            console.log(`🔗 [Agent Join] Updated primary column to "${joinKey}" based on DE agent detection`);
        }

        plan.foreignKeys.push({
            datasetId: entry.dataset.id,
            datasetName: datasetLabel,
            targetColumn: joinKey,
            primaryColumn: joinKey,
            confidence: relationship.confidence ?? 0.85,
            detectionSource: 'data_engineer_agent'
        });
    });

    return plan;
};

const detectSchemaJoinPlan = (entries: ProjectDatasetEntry[]): AutoJoinPlan => {
    const primaryEntry = choosePrimaryDatasetEntry(entries);
    const primaryColumns = Object.keys(primaryEntry.dataset?.schema || {});
    const plan: AutoJoinPlan = {
        strategy: 'join',
        joinType: 'left',
        detectionMethod: 'schema_match',
        primaryDatasetId: primaryEntry.dataset.id,
        primaryColumn: detectPreferredPrimaryColumn(primaryEntry.dataset),
        foreignKeys: []
    };

    if (!primaryColumns.length) {
        return plan;
    }

    entries.forEach((entry) => {
        if (entry.dataset.id === primaryEntry.dataset.id) {
            return;
        }

        const datasetColumns = Object.keys(entry.dataset?.schema || {});
        if (!datasetColumns.length) {
            return;
        }

        let selectedColumn: string | null = null;
        let matchedPrimaryColumn: string | null = null;
        let confidence = 0.6;

        // Create normalized map of primary columns for case-insensitive matching
        const normalizedPrimaryColumns = new Map<string, string>();
        primaryColumns.forEach(col => normalizedPrimaryColumns.set(normalizeColumnName(col), col));

        // First pass: look for matching columns (case-insensitive, underscore-tolerant)
        for (const column of datasetColumns) {
            const normalizedCol = normalizeColumnName(column);
            if (normalizedPrimaryColumns.has(normalizedCol)) {
                selectedColumn = column;
                matchedPrimaryColumn = normalizedPrimaryColumns.get(normalizedCol) || column;
                confidence = JOIN_KEY_PATTERNS.some((pattern) => pattern.test(column)) ? 0.85 : 0.7;
                console.log(`🔗 [Schema Join] Found matching columns: "${column}" ↔ "${matchedPrimaryColumn}" (confidence: ${confidence})`);
                break;
            }
        }

        // Second pass: look for join key pattern columns
        if (!selectedColumn) {
            const fallbackColumn = datasetColumns.find((column) => JOIN_KEY_PATTERNS.some((pattern) => pattern.test(column)));
            if (fallbackColumn) {
                // Check if primary has a matching column (case-insensitive)
                const normalizedFallback = normalizeColumnName(fallbackColumn);
                if (normalizedPrimaryColumns.has(normalizedFallback)) {
                    selectedColumn = fallbackColumn;
                    matchedPrimaryColumn = normalizedPrimaryColumns.get(normalizedFallback) || fallbackColumn;
                    confidence = 0.65;
                    console.log(`🔗 [Schema Join] Found fallback match: "${fallbackColumn}" ↔ "${matchedPrimaryColumn}" (confidence: ${confidence})`);
                }
            }
        }

        if (selectedColumn && matchedPrimaryColumn) {
            // FIX: Update plan.primaryColumn to match the first detected join key
            // This ensures the primary dataset's join key aligns with secondary datasets
            if (plan.foreignKeys.length === 0) {
                plan.primaryColumn = matchedPrimaryColumn;
                console.log(`🔗 [Schema Join] Updated primary column to "${matchedPrimaryColumn}" based on schema match`);
            }

            plan.foreignKeys.push({
                datasetId: entry.dataset.id,
                datasetName: normalizeDatasetLabel(entry.dataset),
                targetColumn: selectedColumn,
                primaryColumn: matchedPrimaryColumn,
                confidence,
                detectionSource: 'schema_match'
            });
        }
    });

    return plan;
};

const buildFallbackConcatPlan = (entries: ProjectDatasetEntry[]): AutoJoinPlan => {
    const primaryEntry = choosePrimaryDatasetEntry(entries);
    return {
        strategy: 'concat',
        joinType: 'left',
        detectionMethod: 'fallback_concat',
        primaryDatasetId: primaryEntry.dataset.id,
        primaryColumn: detectPreferredPrimaryColumn(primaryEntry.dataset),
        foreignKeys: []
    };
};

const deriveAutoJoinPlan = (project: any, entries: ProjectDatasetEntry[], dataEngineer: DataEngineerAgent): AutoJoinPlan => {
    const stored = readStoredJoinPlan(project, entries);
    if (stored) {
        return stored;
    }

    const agentPlan = detectAgentJoinPlan(entries, dataEngineer);
    if (agentPlan.foreignKeys.length) {
        return agentPlan;
    }

    const schemaPlan = detectSchemaJoinPlan(entries);
    if (schemaPlan.foreignKeys.length) {
        return schemaPlan;
    }

    return buildFallbackConcatPlan(entries);
};

const buildJoinSignature = (config: any): string => {
    if (!config) {
        return '';
    }
    const normalizedForeignKeys = Array.isArray(config.foreignKeys)
        ? config.foreignKeys
            .map((fk: any) => ({
                datasetId: fk.datasetId,
                targetColumn: fk.targetColumn || fk.joinKey,
                primaryColumn: fk.primaryColumn
            }))
            .sort((a: { datasetId: string }, b: { datasetId: string }) => a.datasetId.localeCompare(b.datasetId))
        : [];

    return JSON.stringify({
        strategy: config.strategy,
        type: config.type,
        primaryDatasetId: config.primaryDatasetId,
        primaryColumn: config.primaryColumn,
        foreignKeys: normalizedForeignKeys
    });
};

const buildMultiDatasetPreview = async (
    project: any,
    datasetEntries: ProjectDatasetEntry[],
    dataEngineer: DataEngineerAgent
): Promise<MultiDatasetPreviewPayload | null> => {
    if (!datasetEntries || datasetEntries.length < 2) {
        return null;
    }

    const autoJoinPlan = deriveAutoJoinPlan(project, datasetEntries, dataEngineer);
    const primaryEntry = datasetEntries.find((entry) => entry.dataset.id === autoJoinPlan.primaryDatasetId) ||
        choosePrimaryDatasetEntry(datasetEntries);
    if (!primaryEntry?.dataset) {
        return null;
    }

    if (!datasetHasColumn(primaryEntry.dataset, autoJoinPlan.primaryColumn)) {
        autoJoinPlan.primaryColumn = detectPreferredPrimaryColumn(primaryEntry.dataset);
    }

    // P1-1 FIX: Get FULL dataset data for join, not just preview
    // We need full data for analysis execution, not just UI preview
    const getFullDatasetData = (dataset: any): any[] => {
        // Priority: data > ingestionMetadata.data > ingestionMetadata.transformedData > preview
        if (Array.isArray(dataset.data) && dataset.data.length > 0) {
            return dataset.data;
        }
        const parsed = safeParseJson(dataset.data);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
        }
        if (Array.isArray(dataset.ingestionMetadata?.data) && dataset.ingestionMetadata.data.length > 0) {
            return dataset.ingestionMetadata.data;
        }
        if (Array.isArray(dataset.ingestionMetadata?.transformedData) && dataset.ingestionMetadata.transformedData.length > 0) {
            return dataset.ingestionMetadata.transformedData;
        }
        // Fallback to preview if full data not available
        return extractDatasetRows(dataset, 10000); // Large limit for fallback
    };

    const baseRows = getFullDatasetData(primaryEntry.dataset);
    const basePreviewRows = baseRows.slice(0, MAX_MULTI_DATASET_PREVIEW_ROWS); // For UI preview
    
    if (!baseRows.length) {
        console.warn(`⚠️  [JOIN PREVIEW] Primary dataset ${primaryEntry.dataset?.id} has no data.`);
        return null;
    }

    console.log(`📊 [P1-1 FIX] Primary dataset: ${baseRows.length} total rows (${basePreviewRows.length} for preview)`);

    const companionEntries = datasetEntries.filter((entry) => entry.dataset.id !== primaryEntry.dataset.id);
    if (!companionEntries.length) {
        return null;
    }

    const joinTargets = (
        await Promise.all(
            companionEntries.map(async (entry) => {
                const fullRows = getFullDatasetData(entry.dataset);
                return {
                    entry,
                    rows: fullRows,
                    previewRows: fullRows.slice(0, MAX_MULTI_DATASET_PREVIEW_ROWS)
                };
            })
        )
    ).filter((target) => target.rows.length);

    if (!joinTargets.length) {
        console.warn(`⚠️  [JOIN PREVIEW] No companion datasets with preview rows available for project ${project?.id}.`);
        return null;
    }

    let mergeStrategy: DatasetJoinConfig['mergeStrategy'] = autoJoinPlan.strategy === 'join' ? 'merge' : 'concat';
    if (mergeStrategy === 'merge' && autoJoinPlan.foreignKeys.length < joinTargets.length) {
        mergeStrategy = 'concat';
        autoJoinPlan.detectionMethod = 'fallback_concat';
        autoJoinPlan.foreignKeys = [];
    }

    if (mergeStrategy === 'merge') {
        const missingJoinData = joinTargets.some((target) => {
            const fk = autoJoinPlan.foreignKeys.find((foreignKey) => foreignKey.datasetId === target.entry.dataset.id);
            return !fk || !datasetHasColumn(target.entry.dataset, fk.targetColumn);
        });
        if (missingJoinData) {
            mergeStrategy = 'concat';
            autoJoinPlan.detectionMethod = 'fallback_concat';
            autoJoinPlan.foreignKeys = [];
        }
    }

    // P1-2 FIX: Filter PII columns BEFORE joining datasets
    // Get PII decisions from journeyProgress (SSOT) and project metadata (legacy)
    const excludedColumns = new Set<string>();
    
    // Check journeyProgress.piiDecision first (SSOT)
    const journeyProgress = parseJourneyProgress((project as any)?.journeyProgress) as any;
    if (journeyProgress?.piiDecision?.excludedColumns) {
        for (const col of journeyProgress.piiDecision.excludedColumns) {
            excludedColumns.add(String(col).toLowerCase());
        }
    }
    if (journeyProgress?.piiDecision?.anonymizedColumns && journeyProgress.piiDecision.anonymizedColumns.length > 0) {
        // Anonymized columns are treated as excluded (they'll be redacted, not included)
        for (const col of journeyProgress.piiDecision.anonymizedColumns) {
            excludedColumns.add(String(col).toLowerCase());
        }
    }
    
    // Also check legacy project.metadata locations for backward compatibility
    const legacyExcluded = (project as any)?.metadata?.excludedColumns || [];
    for (const col of legacyExcluded) {
        excludedColumns.add(String(col).toLowerCase());
    }
    
    const piiDecisions = (project as any)?.metadata?.piiDecisions;
    if (piiDecisions?.excludedColumns) {
        for (const col of piiDecisions.excludedColumns) {
            excludedColumns.add(String(col).toLowerCase());
        }
    }

    // Helper to filter PII columns from rows
    const filterPIIFromRows = (rows: any[]): any[] => {
        if (excludedColumns.size === 0) return rows;
        return rows.map(row => {
            const filtered: any = {};
            for (const [key, value] of Object.entries(row)) {
                if (!excludedColumns.has(key.toLowerCase())) {
                    filtered[key] = value;
                }
            }
            return filtered;
        });
    };

    // Helper to filter PII columns from schema
    const filterPIIFromSchema = (schema: any): any => {
        if (excludedColumns.size === 0) return schema;
        if (Array.isArray(schema)) {
            return schema.filter((col: any) => {
                const colName = col.name || col.column || col;
                return !excludedColumns.has(String(colName).toLowerCase());
            });
        }
        return Object.fromEntries(
            Object.entries(schema).filter(([col]) => !excludedColumns.has(col.toLowerCase()))
        );
    };

    if (excludedColumns.size > 0) {
        console.log(`🔒 [P1-2 FIX] Filtering ${excludedColumns.size} PII columns BEFORE join:`, Array.from(excludedColumns));
    }

    // P1-1 FIX: Join using FULL data, not preview
    const baseProjectForJoiner = {
        id: primaryEntry.dataset.id,
        name: normalizeDatasetLabel(primaryEntry.dataset),
        schema: filterPIIFromSchema(primaryEntry.dataset.schema || {}),
        data: filterPIIFromRows(baseRows), // Full data for join
        recordCount: baseRows.length
    };

    const joinProjects = joinTargets.map((target) => ({
        id: target.entry.dataset.id,
        name: normalizeDatasetLabel(target.entry.dataset),
        schema: filterPIIFromSchema(target.entry.dataset.schema || {}),
        data: filterPIIFromRows(target.rows), // Full data for join
        recordCount: target.rows.length
    }));

    const joinConfig: DatasetJoinConfig = {
        joinWithProjects: joinProjects.map((projectEntry) => projectEntry.id),
        joinType: autoJoinPlan.joinType,
        mergeStrategy,
        joinKeys: {
            [baseProjectForJoiner.id]: autoJoinPlan.primaryColumn
        }
    };

    if (mergeStrategy === 'merge') {
        for (const projectEntry of joinProjects) {
            const fk = autoJoinPlan.foreignKeys.find((foreignKey) => foreignKey.datasetId === projectEntry.id);
            if (!fk) {
                mergeStrategy = 'concat';
                joinConfig.mergeStrategy = 'concat';
                autoJoinPlan.detectionMethod = 'fallback_concat';
                autoJoinPlan.foreignKeys = [];
                break;
            }
            joinConfig.joinKeys[projectEntry.id] = fk.targetColumn;
        }
    }

    if (joinConfig.mergeStrategy === 'concat') {
        joinConfig.joinKeys = {
            [baseProjectForJoiner.id]: autoJoinPlan.primaryColumn
        };
    }

    const joinResult = await DatasetJoiner.joinDatasets(baseProjectForJoiner, joinProjects, joinConfig);
    if (!joinResult.success) {
        return null;
    }

    // P1-1 FIX: Store FULL joined data, not just preview
    const fullJoinedData = Array.isArray(joinResult.project?.data) ? joinResult.project.data : [];
    const joinedRows = fullJoinedData.slice(0, MAX_MULTI_DATASET_PREVIEW_ROWS); // Preview for UI
    if (!joinedRows.length) {
        return null;
    }

    const joinedSchema = joinResult.project?.schema || {};
    console.log(`📊 [P1-1 FIX] Full joined data: ${fullJoinedData.length} total rows, Preview: ${joinedRows.length} rows for UI`);

    const warnings: string[] = [];
    if (joinConfig.mergeStrategy === 'concat') {
        warnings.push('No shared join keys detected. Displaying stacked preview until Data Engineer finalizes joins.');
    }
    if (joinProjects.length < companionEntries.length) {
        warnings.push('Some datasets lacked sample rows and were skipped in this preview.');
    }

    const primaryDatasetName = normalizeDatasetLabel(primaryEntry.dataset);

    const joinInsights = {
        detectionMethod: autoJoinPlan.detectionMethod,
        joinStrategy: joinConfig.mergeStrategy === 'merge' ? 'join' as const : 'concat' as const,
        joinType: joinConfig.joinType,
        primaryDatasetId: primaryEntry.dataset.id,
        primaryDatasetName,
        primaryColumn: autoJoinPlan.primaryColumn,
        foreignKeys: joinConfig.mergeStrategy === 'merge' ? autoJoinPlan.foreignKeys : [],
        datasetCount: datasetEntries.length,
        previewRowCount: joinedRows.length,
        warnings
    };

    const autoJoinConfig = {
        enabled: true,
        strategy: joinInsights.joinStrategy,
        type: joinInsights.joinType,
        primaryDatasetId: joinInsights.primaryDatasetId,
        primaryDatasetName,
        primaryColumn: joinInsights.primaryColumn,
        foreignKeys: joinInsights.foreignKeys,
        detectionMethod: joinInsights.detectionMethod,
        datasetCount: joinInsights.datasetCount,
        generatedAt: new Date().toISOString()
    };

    return {
        previewRows: joinedRows,
        fullData: fullJoinedData, // Store ALL rows for analysis execution
        // FIX: Ensure totalRowCount is accurate (not just preview length)
        totalRowCount: fullJoinedData.length,
        schema: joinedSchema,
        joinInsights,
        autoJoinConfig,
        // GAP FIX: Explicitly mark as ready for persistence to journeyProgress
        generatedAt: new Date().toISOString()
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
    // [FIX] Normalize: if value is clearly a decimal (0 < value < 1), convert to 0-100
    // Changed from <= 1 to < 1 to avoid converting 1.0 to 100 (which is wrong)
    // Values like 0.93 become 93, but 1 stays as 1, 93 stays as 93
    let normalized = value;
    if (value > 0 && value < 1) {
        normalized = value * 100;
    }
    return Math.max(0, Math.min(100, Math.round(normalized)));
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
        journeyType: normalizeJourneyType(project?.journeyType as string | JourneyType | null)
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
        // Accept CSV, JSON, Excel files
        const allowedTypes = ['.csv', '.json', '.xlsx', '.xls'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${ext} not supported. Allowed: ${allowedTypes.join(', ')}`));
        }
    }
});

router.get("/:projectId/journey/pending-approvals", ensureAuthenticated, async (req, res) => {
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

        const pendingCheckpoints = await getPendingApprovalCheckpoints(projectId);
        res.json({
            success: true,
            pendingCheckpoints,
        });
    } catch (error: any) {
        console.error('Error fetching pending approvals:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to load pending approvals' });
    }
});

router.post(":projectId/journey/resume", ensureAuthenticated, async (req, res) => {
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

        const pendingCheckpoints = await getPendingApprovalCheckpoints(projectId);
        if (pendingCheckpoints.length > 0) {
            const journeyState = await journeyStateManager.getJourneyState(projectId);
            return res.status(409).json({
                success: false,
                error: 'Pending approvals required before resuming the journey',
                pendingCheckpoints,
                journeyState,
            });
        }

        await projectAgentOrchestrator.autoExecuteNextStep(projectId);
        const journeyState = await journeyStateManager.getJourneyState(projectId);

        res.json({
            success: true,
            message: 'Journey resume triggered',
            journeyState
        });
    } catch (error: any) {
        console.error('Error resuming journey:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to resume journey' });
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
            journeyType: normalizeJourneyType(project.journeyType as string | JourneyType | null)
        };

        // Use context if available, fallback to old signature for backward compatibility
        const dataEstimate = await dataEngineerAgent.estimateDataRequirements({
            ...dataEngineerContext,
            // Also pass old params for backward compatibility
            goals,
            questions,
            dataSource: dataSource || 'upload',
            journeyType: normalizeJourneyType(project.journeyType as string | JourneyType | null)
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
            journeyType: normalizeJourneyType(project.journeyType as string | JourneyType | null)
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
            const tempFileId = `trial_temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

        // Use apply_transformations tool via tool registry
        const toolResult = await executeTool(
            'apply_transformations',
            'data_engineer',
            {
                projectId,
                transformationSteps: sanitizedSteps,
                sourceRows,
                originalSchema: dataset?.schema ?? (project as any)?.schema,
                // Note: joinResolver cannot be passed through tool (functions not serializable)
                // Handler will need to resolve joins internally if needed
            },
            { userId, projectId }
        );

        if (toolResult.status === 'error') {
            throw new Error(toolResult.error || 'Transformation execution failed');
        }

        const transformationResult = toolResult.result;

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
    const uploadTrackingId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
        // [FIX] Create project FIRST, before PII check return
        // This ensures projectId is always available for the frontend
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
            dataDescription: processedData.datasetSummary.overview,
            datasetSummary: processedData.datasetSummary,
            descriptiveStats: processedData.descriptiveStats,
            qualityMetrics: processedData.qualityMetrics,
            relationships: processedData.relationships,
            preview: processedData.preview?.slice(0, 20) ?? [],
            generatedAt: new Date().toISOString()
        };

        // Create a dataset and link it with real file path
        const datasetCreateStart = Date.now();
        const dataset = await storage.createDataset({
            id: undefined as any, // will be set by storage impl
            userId: actualUserId, // ✅ Use customer's ID
            sourceType: 'upload',
            originalFileName: req.file.originalname,
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
        // [PHASE 2 FIX] Log link creation for debugging dataset-project connection issues
        console.log(`📎 [Upload] Linked project ${project.id} to dataset ${dataset.id} (fileName: ${req.file.originalname})`);
        const datasetCreateDuration = Date.now() - datasetCreateStart;
        metricDetails.datasetId = dataset.id;
        metricDetails.datasetCreateMs = datasetCreateDuration;
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

        // [FIX] If PII detected, return early with projectId
        // Project and dataset are already created, so user can continue after PII decision
        if (piiAnalysis.detectedPII.length > 0) {
            metricDetails.hasPii = true;
            console.log(`🔒 [Upload] PII detected in project ${project.id}, returning for user decision`);
            return res.json({
                success: true,
                requiresPIIDecision: true,
                projectId: project.id, // [FIX] Now includes projectId!
                datasetId: dataset.id,
                piiResult: piiAnalysis,
                name: name.trim(),
                questions: parsedQuestions,
                schema: processedData.schema,
                recordCount: processedData.recordCount,
                sampleData: processedData.preview,
                dataDescription: processedData.datasetSummary.overview,
                datasetSummary: processedData.datasetSummary,
                descriptiveStats: processedData.descriptiveStats,
                qualityMetrics: processedData.qualityMetrics,
                relationships: processedData.relationships,
                message: 'PII detected - user consent required'
            });
        }

        // ✅ PHASE 2: Map dataset to requirements (if Phase 1 document exists)
        let dataRequirementsDocument = undefined;
        try {
            // Check if Phase 1 document exists in project metadata
            const phase1DocId = (project.metadata as any)?.dataRequirementsDocId;

            // For now, create Phase 1 on-the-fly if not exists
            // TODO: In production, Phase 1 should be created during goal analysis and stored
            console.log('📋 Phase 2: Generating/updating data requirements mapping...');

            // Create Phase 1 if it doesn't exist (fallback for projects created without goal analysis)
            // FIX: Pass datasetMetadata to generate column-based requirements instead of generic ones
            const datasetColumns = Object.keys(processedData.schema || {});
            const columnTypes: Record<string, string> = {};
            for (const [col, info] of Object.entries(processedData.schema || {})) {
                columnTypes[col] = typeof info === 'object' && (info as any)?.type ? (info as any).type : 'text';
            }

            // Generate Phase 1 requirements via tool registry
            const phase1ToolResult = await executeTool(
                'required_data_elements_tool',
                'data_scientist',
                {
                    operation: 'defineRequirements',
                    projectId: project.id,
                    userGoals: parsedQuestions.length > 0
                        ? [`Analyze data to answer: ${parsedQuestions.slice(0, 3).join(', ')}`]
                        : ['Perform comprehensive data analysis'],
                    userQuestions: parsedQuestions,
                    // FIX: Include dataset metadata for column-based requirements
                    datasetMetadata: datasetColumns.length > 0 ? {
                        columns: datasetColumns,
                        columnTypes: columnTypes,
                        schema: processedData.schema
                    } : undefined
                },
                { userId: actualUserId, projectId: project.id }
            );

            if (phase1ToolResult.status === 'error') {
                console.warn('⚠️ Failed to generate Phase 1 requirements via tool:', phase1ToolResult.error);
                throw new Error(phase1ToolResult.error || 'Failed to generate data requirements');
            }

            const phase1Doc = phase1ToolResult.result;

            console.log(`✅ Phase 1 complete: ${phase1Doc.analysisPath.length} analysis paths, ${phase1Doc.requiredDataElements.length} required elements`);

            // Phase 2: Map dataset fields to required data elements via tool registry
            const mappingStart = Date.now();
            const phase2ToolResult = await executeTool(
                'required_data_elements_tool',
                'data_engineer',
                {
                    operation: 'mapDatasetToRequirements',
                    document: phase1Doc,
                    dataset: {
                        fileName: req.file.originalname,
                        rowCount: processedData.recordCount,
                        schema: processedData.schema,
                        preview: processedData.preview || []
                    }
                },
                { userId: actualUserId, projectId: project.id }
            );

            if (phase2ToolResult.status === 'error') {
                console.warn('⚠️ Failed to map dataset to requirements via tool:', phase2ToolResult.error);
                // Fall back to Phase 1 document if Phase 2 fails
                var phase2Doc = phase1Doc;
            } else {
                var phase2Doc = phase2ToolResult.result;
            }
            const mappingDuration = Date.now() - mappingStart;

            console.log(`✅ Phase 2 complete in ${mappingDuration}ms: ${phase2Doc.completeness.elementsMapped}/${phase2Doc.completeness.totalElements} elements mapped`);

            if (phase2Doc.gaps.length > 0) {
                console.log(`⚠️  Identified ${phase2Doc.gaps.length} data gaps:`);
                phase2Doc.gaps.forEach((gap: any) => console.log(`  - ${gap.description}`));
            }

            // Store document reference in dataset metadata
            dataRequirementsDocument = phase2Doc;

            // Update dataset with requirements document
            await storage.updateDataset(dataset.id, {
                ingestionMetadata: {
                    ...(dataset.ingestionMetadata as any || {}),
                    dataRequirementsDocument: phase2Doc
                }
            } as any);

            performanceWebhookService.recordMetric({
                timestamp: new Date(),
                service: 'project_upload',
                operation: 'phase2_mapping',
                duration: mappingDuration,
                status: 'success',
                details: {
                    projectId: project.id,
                    datasetId: dataset.id,
                    elementsMapped: phase2Doc.completeness.elementsMapped,
                    totalElements: phase2Doc.completeness.totalElements,
                    gapsFound: phase2Doc.gaps.length,
                    uploadId: uploadTrackingId
                },
                userId: actualUserId,
                sessionId: req.sessionID
            }).catch(error => {
                console.error('Failed to record Phase 2 mapping metric:', error);
            });
        } catch (mappingError) {
            console.error('⚠️  Phase 2 mapping failed (non-fatal):', mappingError);
            // Continue without data requirements mapping
        }

        // FIX 7.3: Add user-visible checkpoint for data upload completion
        // Note: stepName uses snake_case to distinguish from user journey steps (data, verify, transform, execute)
        try {
            await projectAgentOrchestrator.addCheckpoint(project.id, {
                id: `checkpoint_de_upload_${Date.now()}`,
                projectId: project.id,
                agentType: 'data_engineer',
                stepName: 'de_data_processed',
                status: 'completed',
                message: `Your data is ready for analysis (${processedData.recordCount.toLocaleString()} records)`,
                data: {
                    fileName: req.file.originalname,
                    fileSize: req.file.size,
                    rowCount: processedData.recordCount,
                    columnCount: Object.keys(processedData.schema || {}).length,
                    qualityScore: (processedData.qualityMetrics as any)?.overallScore ||
                        (processedData.qualityMetrics as any)?.dataQualityScore ||
                        (processedData.qualityMetrics as any)?.qualityScore
                },
                userFeedback: undefined,
                requiresUserInput: false,
                userVisible: true,
                timestamp: new Date()
            });
        } catch (checkpointError) {
            console.error('Failed to create upload checkpoint (non-fatal):', checkpointError);
        }

        res.json({
            success: true,
            projectId: project.id,
            project: { ...project, preview: processedData.preview },
            piiAnalysis,
            originalFilePath: originalFilePath, // Return path for client reference
            dataDescription: processedData.datasetSummary.overview,
            datasetSummary: processedData.datasetSummary,
            descriptiveStats: processedData.descriptiveStats,
            qualityMetrics: processedData.qualityMetrics,
            relationships: processedData.relationships,
            // ✅ NEW: Include data requirements document in response
            ...(dataRequirementsDocument && { dataRequirementsDocument })
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

        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Project not found' });
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

            const schema = dataset.schema ?? datasetAny?.ingestionMetadata?.schema ?? null;

            const { data, ...rest } = datasetAny;

            return {
                dataset: {
                    ...rest,
                    schema,
                    preview: previewRows ?? [],
                },
                association,
            };
        });

        const multiDatasetPreview = await buildMultiDatasetPreview(project, datasets, dataEngineerAgent);

        // FIX: Persist joined dataset in journeyProgress for ALL subsequent steps to use
        // This ensures verification, transformation, schema-analysis, required-data-elements all use the joined data
        if ((multiDatasetPreview?.previewRows?.length ?? 0) > 0 && multiDatasetPreview?.schema) {
            const existingMetadata = (project as any)?.metadata || {};
            const existingProgress = parseJourneyProgress((project as any)?.journeyProgress) as any;

            const existingSignature = buildJoinSignature(existingMetadata.autoDetectedJoinConfig);
            const nextSignature = buildJoinSignature(multiDatasetPreview.autoJoinConfig);

            const shouldUpdateJoinData = existingSignature !== nextSignature ||
                !(existingProgress?.joinedData?.preview?.length ?? 0);

            if (shouldUpdateJoinData) {
                // P1-1 FIX: Persist FULL joined dataset, not just preview
                const fullRowCount = multiDatasetPreview.totalRowCount || multiDatasetPreview.fullData?.length || multiDatasetPreview.previewRows.length;
                const fullData = multiDatasetPreview.fullData || multiDatasetPreview.previewRows; // Fallback to preview if fullData missing
                
                console.log(`📊 [P1-1 FIX] Persisting FULL joined dataset: ${fullRowCount} total rows (${multiDatasetPreview.previewRows.length} preview), ${Object.keys(multiDatasetPreview.schema).length} columns`);
                console.log(`📊 [P1-1 FIX] Full data length: ${fullData.length} rows (will be used by Execute step)`);

                await storage.updateProject(projectId, {
                    metadata: {
                        ...existingMetadata,
                        autoDetectedJoinConfig: multiDatasetPreview.autoJoinConfig
                    },
                    journeyProgress: {
                        ...existingProgress,
                        joinedData: {
                            preview: multiDatasetPreview.previewRows, // 50 rows for UI preview
                            fullData: fullData, // FULL dataset for analysis execution
                            fullRowCount: fullData.length, // Total row count
                            totalRowCount: fullRowCount, // Alias for backward compatibility
                            schema: multiDatasetPreview.schema, // Store derived schema
                            joinInsights: multiDatasetPreview.joinInsights,
                            joinConfig: multiDatasetPreview.autoJoinConfig, // Store join config
                            datasetCount: datasets.length,
                            persistedAt: new Date().toISOString(),
                            generatedAt: new Date().toISOString()
                        }
                    }
                } as any);
                
                console.log(`✅ [P1-1 FIX] Successfully persisted full joined dataset to journeyProgress`);
            }
        } else if (multiDatasetPreview?.autoJoinConfig) {
            // Still persist autoJoinConfig even if no preview generated
            const existingMetadata = (project as any)?.metadata || {};
            const existingSignature = buildJoinSignature(existingMetadata.autoDetectedJoinConfig);
            const nextSignature = buildJoinSignature(multiDatasetPreview.autoJoinConfig);

            if (existingSignature !== nextSignature) {
                await storage.updateProject(projectId, {
                    metadata: {
                        ...existingMetadata,
                        autoDetectedJoinConfig: multiDatasetPreview.autoJoinConfig
                    }
                } as any);
            }
        }

        return res.json({
            success: true,
            datasets: normalized,
            count: normalized.length,
            joinedPreview: multiDatasetPreview?.previewRows ?? null,
            joinedSchema: multiDatasetPreview?.schema ?? null,
            joinInsights: multiDatasetPreview?.joinInsights ?? null
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

router.post("/:projectId/questions", ensureAuthenticated, async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = (req.user as any)?.id;
        const rawQuestions: unknown[] = Array.isArray(req.body?.questions) ? req.body.questions : [];

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const normalizedQuestions: string[] = rawQuestions
            .map((question: unknown) => (typeof question === 'string' ? question.trim() : ''))
            .filter((question: string) => question.length > 0);

        if (!normalizedQuestions.length) {
            return res.status(400).json({ success: false, error: 'questions must be a non-empty array of strings' });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ success: false, error: accessCheck.reason });
        }

        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }

        const savedQuestions = await QuestionAnswerService.saveProjectQuestions(projectId, normalizedQuestions);

        const [projectRow] = await db
            .select({ journeyProgress: projects.journeyProgress })
            .from(projects)
            .where(eq(projects.id, projectId))
            .limit(1);

        let journeyProgressState = parseJourneyProgress(projectRow?.journeyProgress ?? (project as any)?.journeyProgress);
        let journeyProgressUpdated = false;

        try {
            const { changed, value } = fillJourneyProgressFields(
                journeyProgressState,
                { businessQuestions: normalizedQuestions },
                { flag: 'questionsNormalized', timestamp: new Date().toISOString() }
            );

            if (changed) {
                journeyProgressState = value;
                journeyProgressUpdated = true;
                await db
                    .update(projects)
                    .set({
                        journeyProgress: value,
                        updatedAt: new Date()
                    })
                    .where(eq(projects.id, projectId));
            }
        } catch (progressError) {
            console.warn('Failed to sync business questions into journeyProgress:', progressError);
        }

        await markJourneyProgress(projectId, ['intake_alignment']);

        return res.json({
            success: true,
            count: savedQuestions.length,
            questions: savedQuestions,
            journeyProgress: journeyProgressState,
            journeyProgressUpdated
        });
    } catch (error: any) {
        console.error('Failed to save project questions:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to save project questions' });
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

        const normalizedType = typeof type === 'string' && type.trim().length > 0 ? type.trim() : undefined;
        const artifacts = await storage.getProjectArtifacts(projectId, normalizedType);

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

// Get project checkpoints
// FIX #35: Filter by userVisible unless admin or explicitly requesting all
router.get("/:id/checkpoints", ensureAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = (req.user as any)?.id;
        const showAll = req.query.showAll === 'true';  // FIX #35: Allow admin to see all
        const userIsAdmin = isAdmin(req);

        if (!userId) {
            return res.status(401).json({ error: "User authentication required" });
        }

        const accessCheck = await canAccessProject(userId, id, userIsAdmin);
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ error: accessCheck.reason });
        }

        const allCheckpoints = await projectAgentOrchestrator.getProjectCheckpoints(id);

        // FIX #35: Filter checkpoints for regular users (show only userVisible=true)
        // Admins can see all checkpoints if showAll=true
        const checkpoints = (userIsAdmin && showAll)
            ? allCheckpoints
            : allCheckpoints.filter(cp => cp.userVisible === true);

        res.json({ success: true, checkpoints });
    } catch (error: any) {
        console.error('Failed to fetch checkpoints:', error);
        res.status(500).json({ error: "Failed to fetch checkpoints" });
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
        console.error('Failed to submit feedback:', error);
        res.status(500).json({ error: "Failed to submit feedback" });
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
            generatedAt: new Date().toISOString()
        };

        // Create a new Dataset
        const newDataset = await storage.createDataset({
            id: undefined as any,
            userId: userId,
            sourceType: 'upload',
            originalFileName: req.file.originalname,
            mimeType: req.file.mimetype,
            fileSize: req.file.size,
            storageUri: `mem://${projectId}/${req.file.originalname}`, // Example URI
            schema: processedData.schema,
            recordCount: processedData.recordCount,
            preview: processedData.preview,
            piiAnalysis: piiAnalysis,
            data: processedData.data, // Storing data with the dataset
            ingestionMetadata
        } as any);

        // Link dataset to the project
        await storage.linkProjectToDataset(projectId, newDataset.id);
        console.log(`[project.ts] Linked project ${projectId} to dataset ${newDataset.id}`);

        // [FIX] Verify the link was created successfully
        const verifyLink = await db
            .select()
            .from(projectDatasets)
            .where(and(
                eq(projectDatasets.projectId, projectId),
                eq(projectDatasets.datasetId, newDataset.id)
            ));

        if (verifyLink.length === 0) {
            console.error(`[CRITICAL] Dataset link verification failed: project=${projectId}, dataset=${newDataset.id}`);
            // Retry linking directly to ensure it works
            await db.insert(projectDatasets).values({
                id: nanoid(),
                projectId,
                datasetId: newDataset.id,
                role: 'primary'
            });
            console.log(`[RETRY] Re-linked dataset ${newDataset.id} to project ${projectId}`);
        }

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
                params: {
                    analysis: 'data_quality_assessment'
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
                createdBy: 'data_engineer_agent'
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
        // MULTI-AGENT COORDINATION (NON-BLOCKING)
        // ==========================================
        // Trigger multi-agent goal analysis in the background after successful file upload
        // This creates a checkpoint for user review without blocking the upload response
        setImmediate(async () => {
            try {
                console.log(`[project.ts] Starting multi-agent coordination for project ${projectId}`);

                // Extract user goals from project or use default exploratory goals
                const userGoals = (updatedProject as any).goals || [
                    'Understand my data',
                    'Discover patterns and insights',
                    'Identify key trends'
                ];

                // Determine industry from project metadata or default to 'general'
                const industry = (updatedProject as any).industry || 'general';

                // Coordinate goal analysis across all three agents (Data Engineer, Data Scientist, Business Agent)
                const coordinationResult = await projectManagerAgent.coordinateGoalAnalysis(
                    projectId,
                    {
                        data: processedData.data,
                        schema: processedData.schema,
                        qualityMetrics: processedData.qualityMetrics,
                        descriptiveStats: processedData.descriptiveStats,
                        datasetSummary: processedData.datasetSummary,
                        dataDescription: processedData.datasetSummary.overview,
                        relationships: processedData.relationships,
                        rowCount: processedData.recordCount,
                        type: 'tabular'
                    },
                    userGoals,
                    industry
                );

                console.log(`[project.ts] Multi-agent coordination complete in ${coordinationResult.totalResponseTime}ms`);
                console.log(`[project.ts] Overall assessment: ${coordinationResult.synthesis.overallAssessment}`);
                console.log(`[project.ts] Confidence: ${coordinationResult.synthesis.confidence}`);

                // Store coordination result in project metadata for later retrieval
                await storage.updateProject(projectId, {
                    multiAgentCoordination: coordinationResult
                } as any);

                // Notify project orchestrator to create a checkpoint
                // This will be picked up by the UI through the existing checkpoint polling mechanism
                await projectAgentOrchestrator.addCheckpoint(projectId, {
                    id: coordinationResult.coordinationId,
                    projectId,
                    agentType: 'project_manager' as const,
                    stepName: 'multi_agent_goal_analysis',
                    status: 'waiting_approval' as const,
                    message: 'Our team of experts has analyzed your data. Please review their recommendations:',
                    data: {
                        type: 'multi_agent_coordination',
                        coordinationResult,
                        expertOpinions: coordinationResult.expertOpinions,
                        synthesis: coordinationResult.synthesis,
                        overallAssessment: coordinationResult.synthesis.overallAssessment,
                        confidence: coordinationResult.synthesis.confidence,
                        keyFindings: coordinationResult.synthesis.keyFindings,
                        actionableRecommendations: coordinationResult.synthesis.actionableRecommendations
                    },
                    timestamp: new Date(),
                    requiresUserInput: true
                });

                console.log(`[project.ts] Multi-agent checkpoint created for project ${projectId}`);

                try {
                    const analysisInputRefs = [newDataset.id];
                    if (ingestionArtifactId) analysisInputRefs.push(ingestionArtifactId);
                    if (qualityArtifactId) analysisInputRefs.push(qualityArtifactId);

                    await storage.createArtifact({
                        id: nanoid(),
                        projectId,
                        type: 'analysis',
                        status: 'completed',
                        inputRefs: analysisInputRefs,
                        params: {
                            analysis: 'multi_agent_goal_analysis'
                        },
                        metrics: {
                            confidence: coordinationResult.synthesis.confidence,
                            totalResponseTime: coordinationResult.totalResponseTime
                        },
                        output: {
                            overallAssessment: coordinationResult.synthesis.overallAssessment,
                            keyFindings: coordinationResult.synthesis.keyFindings,
                            actionableRecommendations: coordinationResult.synthesis.actionableRecommendations,
                            expertConsensus: coordinationResult.synthesis.expertConsensus
                        },
                        createdBy: 'pm_agent'
                    });
                } catch (artifactError) {
                    console.error('Failed to create multi-agent coordination artifact:', artifactError);
                }

            } catch (coordinationError) {
                console.error(`[project.ts] Multi-agent coordination failed (non-blocking):`, coordinationError);
                // Don't block upload success, coordination is an enhancement
                // User can still proceed with analysis using traditional flow
            }
        });
        res.json({
            success: true,
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
        const datasetRecord = datasets?.[0]?.dataset;
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

        const computedAverage = datasetRecord
            ? clampScore((metrics.completeness + metrics.consistency + metrics.accuracy + metrics.validity) / 4)
            : 0;

        // FIX: Use computed average from individual metrics when they're all available
        // This ensures the displayed overall score matches the formula shown in UI
        const allMetricsValid = metrics.completeness > 0 && metrics.consistency > 0 &&
            metrics.accuracy > 0 && metrics.validity > 0;

        const qualityScoreValue = allMetricsValid
            ? computedAverage  // Prefer computed average when all metrics are available
            : pickScore(
                qualityMetricsAny['overall'],
                qualityMetricsAny['overallScore'],
                qualityMetricsAny['dataQualityScore'],
                qualityMetricsAny['qualityScore'],
                derivedQuality?.overall,
                datasetRecord ? computedAverage : 0
            );

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
        const userId = (req.user as any)?.id;
        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({ success: false, error: "Project not found" });
        }

        const userContext = buildUserContext(req, project);

        // U2A2A2U PATTERN: Call the same MCP tool that agents use
        // This is the FALLBACK path - agents are preferred, but API calls the same tool
        console.log(`🔒 [PII Analysis] Calling scan_pii_columns tool (fallback path) for project ${projectId}`);
        const toolResult = await executeTool('scan_pii_columns', 'api_fallback', {
            projectId,
            sensitivityLevel: 'moderate',
            includePatternMatching: true,
            includeMLDetection: false
        }, {
            userId,
            projectId
        });

        if (toolResult.status === 'error') {
            console.error('🔒 [PII Analysis] Tool execution failed:', toolResult.error);
            // Fallback to legacy behavior if tool fails
            const datasets = await storage.getProjectDatasets(projectId);
            const datasetRecord = datasets?.[0]?.dataset;
            const piiAnalysis = (datasetRecord as any)?.piiAnalysis || {};
            const rawDetectedPII = Array.isArray(piiAnalysis.detectedPII) ? piiAnalysis.detectedPII : [];

            return res.json({
                success: true,
                assessedBy: 'legacy_fallback',
                userContext,
                detectedPII: rawDetectedPII.map((col: string) => ({
                    column: col,
                    field: col,
                    type: 'personal_identifier',
                    types: ['personal_identifier'],
                    confidence: 0.5,
                    isPII: true
                })),
                requiresReview: rawDetectedPII.length > 0,
                metadata: { generatedAt: new Date().toISOString(), toolFailed: true }
            });
        }

        // Transform tool result to API response format
        const piiResult = toolResult.result;
        const detectedPII = piiResult.detectedPII.map((p: any) => ({
            column: p.column,
            field: p.column,
            type: p.type,
            types: [p.type],
            confidence: p.confidence,
            isPII: true,
            recommendation: p.recommendation,
            datasetId: p.datasetId
        }));

        res.json({
            success: true,
            assessedBy: 'scan_pii_columns_tool', // Indicates tool was used
            userContext,
            detectedPII,
            requiresReview: piiResult.highConfidenceCount > 0,
            recommendations: piiResult.recommendations,
            metadata: {
                totalColumnsScanned: piiResult.totalColumnsScanned,
                piiColumnsFound: piiResult.piiColumnsFound,
                highConfidenceCount: piiResult.highConfidenceCount,
                scanTimestamp: piiResult.scanTimestamp,
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

        // FIX: PRIORITIZE persisted joined dataset from journeyProgress
        const journeyProgress = parseJourneyProgress((project as any)?.journeyProgress);
        const persistedJoinedData = (journeyProgress as any)?.joinedData as {
            schema?: Record<string, any>;
            preview?: any[];
            joinInsights?: {
                primaryDatasetName?: string;
                foreignKeys?: Array<{ datasetName?: string; foreignColumn?: string; primaryColumn?: string }>;
            };
        } | undefined;

        let mergedSchema: Record<string, any> = {};
        let mergedDescriptiveStats: Record<string, any> = {};
        let allRelationships: any[] = [];
        let datasetSummary: any = null;
        const datasetNames: string[] = [];
        let usedJoinedData = false;

        // PRIORITY 1: Use persisted joined schema if available (from upload step)
        if (persistedJoinedData?.schema && Object.keys(persistedJoinedData.schema).length > 0) {
            mergedSchema = persistedJoinedData.schema;
            usedJoinedData = true;
            console.log(`📊 [Schema Analysis] Using PERSISTED joined schema: ${Object.keys(mergedSchema).length} columns`);

            // Extract dataset names from joinInsights if available
            if (persistedJoinedData.joinInsights?.primaryDatasetName) {
                datasetNames.push(persistedJoinedData.joinInsights.primaryDatasetName);
            }
            if (persistedJoinedData.joinInsights?.foreignKeys) {
                persistedJoinedData.joinInsights.foreignKeys.forEach((fk: any) => {
                    if (fk.datasetName && !datasetNames.includes(fk.datasetName)) {
                        datasetNames.push(fk.datasetName);
                    }
                });
            }
        } else {
            // PRIORITY 2: Merge schemas from ALL datasets manually
            for (let i = 0; i < (datasets?.length || 0); i++) {
                const datasetEntry = datasets![i];
                const datasetRecord = datasetEntry?.dataset;
                if (!datasetRecord) continue;

                const schema = (datasetRecord as any)?.schema || {};
                const ingestionMetadata = (datasetRecord as any)?.ingestionMetadata || {};
                const fileName = (datasetRecord as any)?.originalFileName || `Dataset_${i + 1}`;
                datasetNames.push(fileName);

                // First dataset's summary becomes the main summary
                if (i === 0) {
                    datasetSummary = ingestionMetadata?.datasetSummary || null;
                }

                // [FIX] Add dataset prefix to columns to differentiate sources
                // Always add ALL columns, prefix with dataset name when multiple datasets
                const cleanFileName = fileName.replace(/\.[^.]+$/, '');
                for (const [columnName, columnInfo] of Object.entries(schema)) {
                    // If column already exists in mergedSchema, always prefix to avoid overwrite
                    let finalColumnName = columnName;
                    if (datasets!.length > 1) {
                        // For multi-dataset, prefix columns from 2nd+ dataset, OR if conflict exists
                        if (i > 0 || mergedSchema[columnName] !== undefined) {
                            finalColumnName = `${cleanFileName}: ${columnName}`;
                        }
                    }
                    mergedSchema[finalColumnName] = columnInfo;
                }

                // Merge descriptive stats - use same prefixing logic as schema
                const descriptiveStats = ingestionMetadata?.descriptiveStats || {};
                for (const [columnName, stats] of Object.entries(descriptiveStats)) {
                    let finalColumnName = columnName;
                    if (datasets!.length > 1) {
                        if (i > 0 || mergedDescriptiveStats[columnName] !== undefined) {
                            finalColumnName = `${cleanFileName}: ${columnName}`;
                        }
                    }
                    mergedDescriptiveStats[finalColumnName] = stats;
                }

                // Collect relationships
                const relationships = Array.isArray(ingestionMetadata?.relationships)
                    ? ingestionMetadata.relationships
                    : Array.isArray((datasetRecord as any)?.relationships)
                        ? (datasetRecord as any).relationships
                        : [];
                allRelationships = [...allRelationships, ...relationships];
            }
        }

        // Add join insights relationships if we used joined data
        if (usedJoinedData && persistedJoinedData?.joinInsights?.foreignKeys) {
            const joinRelationships = persistedJoinedData.joinInsights.foreignKeys.map((fk: any) => ({
                sourceColumn: fk.foreignColumn,
                targetColumn: fk.primaryColumn,
                type: 'join_key',
                datasetName: fk.datasetName
            }));
            allRelationships = [...allRelationships, ...joinRelationships];
        }

        const schemaEntries = Object.entries(mergedSchema);

        const columnDetails = schemaEntries.map(([columnName, columnInfo]) => ({
            name: columnName,
            type: columnInfo?.type || 'unknown',
            nullable: columnInfo?.nullable ?? true,
            sampleValues: Array.isArray(columnInfo?.sampleValues)
                ? columnInfo.sampleValues.slice(0, 5)
                : [],
            descriptiveStats: mergedDescriptiveStats?.[columnName] ?? columnInfo?.descriptiveStats ?? null
        }));

        const recommendations = schemaEntries.length > 0 ? [
            datasets && datasets.length > 1
                ? `Schema merged from ${datasets.length} datasets: ${datasetNames.join(', ')}.`
                : 'Validate detected data types before training models.',
            'Document business meaning for key columns to support collaboration.'
        ] : [
            'Upload a dataset to generate schema insights.',
            'Define expected columns for this project to guide future uploads.'
        ];

        res.json({
            success: true,
            assessedBy: 'data_verification_service_enhanced',
            userContext,
            datasetId: datasets?.[0]?.dataset?.id || null,
            columnCount: columnDetails.length,
            columnDetails,
            dataTypes: schemaEntries.reduce((acc, [key, val]) => {
                acc[key] = (val as any)?.type || 'unknown';
                return acc;
            }, {} as Record<string, string>),
            datasetSummary,
            dataDescription: typeof datasetSummary?.overview === 'string' ? datasetSummary.overview : null,
            relationships: allRelationships,
            recommendations,
            metadata: {
                datasetAvailable: (datasets?.length || 0) > 0,
                datasetCount: datasets?.length || 0,
                datasetNames,
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
        const userId = (req.user as any)?.id;
        const { userGoals, userQuestions } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User authentication required'
            });
        }

        if (!userGoals || !Array.isArray(userGoals) || userGoals.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'User goals are required'
            });
        }

            // Generate Phase 1 requirements document via tool registry
            const toolResult = await executeTool(
                'required_data_elements_tool',
                'data_scientist',
                {
                    operation: 'defineRequirements',
                    projectId,
                    userGoals: userGoals.filter((g: any) => g && typeof g === 'string' && g.trim() !== ''),
                    userQuestions: userQuestions && Array.isArray(userQuestions)
                        ? userQuestions.filter((q: any) => q && typeof q === 'string' && q.trim() !== '')
                        : []
                },
                { userId, projectId }
            );

            if (toolResult.status === 'error') {
                throw new Error(toolResult.error || 'Failed to generate data requirements');
            }

            const document = toolResult.result;

        // P1-4 FIX: Store and LOCK the generated document in journeyProgress
        // CRITICAL: Use atomic JSONB update to prevent race conditions with frontend updateProgress calls
        try {
            const project = await storage.getProject(projectId);
            if (project) {
                // CRITICAL FIX: parseJourneyProgress expects journeyProgress JSONB, not the entire project object
                const journeyProgress = parseJourneyProgress((project as any)?.journeyProgress || project?.journeyProgress || {});
                const requirementsDoc = {
                    ...document,
                    generatedAt: new Date().toISOString(),
                    version: (journeyProgress as any).requirementsDocument?.version ? (journeyProgress as any).requirementsDocument.version + 1 : 1
                };
                
                // Use atomic JSONB merge to preserve existing journeyProgress fields while setting lock
                // This prevents race conditions if frontend calls updateProgress simultaneously
                await db.execute(
                    sql`UPDATE projects
                        SET journey_progress = COALESCE(journey_progress, '{}'::jsonb)
                            || jsonb_build_object(
                                'requirementsDocument', ${JSON.stringify(requirementsDoc)}::jsonb,
                                'requirementsLocked', to_jsonb(true),
                                'requirementsLockedAt', to_jsonb(${new Date().toISOString()})
                            ),
                            updated_at = NOW()
                        WHERE id = ${projectId}`
                );
                
                console.log(`💾🔒 [P1-4 FIX] Stored and LOCKED requirements document in journeyProgress for project ${projectId} (atomic JSONB merge)`);
            }
        } catch (persistError) {
            console.error(`❌ [generate-data-requirements] Failed to persist requirements:`, persistError);
            // Non-fatal - continue with response, but log as error since this is critical
        }

        res.json({
            success: true,
            document: {
                documentId: document.documentId,
                analysisPath: document.analysisPath,
                requiredDataElements: document.requiredDataElements,
                completeness: document.completeness,
                status: document.status
            }
        });

    } catch (error: any) {
        console.error('Error generating data requirements:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate data requirements'
        });
    }
});

// Get required data elements document for a project
router.get("/:id/required-data-elements", ensureAuthenticated, requireOwnership('project'), async (req, res) => {
    // [FIX] Add timeout handling to prevent infinite loading
    const TIMEOUT_MS = 30000; // 30 seconds
    let responded = false;
    const timeoutId = setTimeout(() => {
        if (!responded) {
            responded = true;
            console.error(`[Required Elements] Request timed out after ${TIMEOUT_MS}ms for project ${req.params.id}`);
            res.status(504).json({
                success: false,
                error: 'Request timed out while generating data requirements',
                timeout: true,
                message: 'Analysis recommendation generation is taking longer than expected. Please try again.',
                // Provide fallback structure so frontend can continue
                defaultElements: {
                    requiredDataElements: [],
                    analysisPath: [],
                    completeness: { readyForExecution: false, totalElements: 0 }
                }
            });
        }
    }, TIMEOUT_MS);

    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;

        if (!userId) {
            clearTimeout(timeoutId);
            if (responded) return;
            responded = true;
            return res.status(401).json({
                success: false,
                error: 'User authentication required'
            });
        }

        // FIX: First check journeyProgress.requirementsDocument (set by generate-data-requirements)
        const project = await storage.getProject(projectId);
        // CRITICAL FIX: parseJourneyProgress expects journeyProgress JSONB, not the entire project object
        const journeyProgress = parseJourneyProgress((project as any)?.journeyProgress || project?.journeyProgress || {});
        const storedRequirements = (journeyProgress as any).requirementsDocument;
        const isLocked = (journeyProgress as any).requirementsLocked === true;

        // DEBUG LOGGING: Track decision flow
        console.log(`🔍 [DEBUG] GET /required-data-elements for project ${projectId}:`, {
            hasStoredRequirements: !!storedRequirements,
            isLocked,
            requirementsCount: storedRequirements?.requiredDataElements?.length || 0,
            analysesCount: storedRequirements?.analysisPath?.length || 0,
            source: 'journeyProgress.requirementsDocument'
        });

        // FIX 3: If storedRequirements exists, ALWAYS return it (even if lock check is unclear)
        // Don't fall through to regeneration - this ensures SSOT consistency
        if (storedRequirements) {
            clearTimeout(timeoutId);
            if (responded) return;
            responded = true;
            
            if (isLocked) {
                console.log(`📄🔒 [SSOT] Requirements LOCKED for project ${projectId} - returning stored document, NO regeneration allowed`);
                return res.json({
                    success: true,
                    document: storedRequirements,
                    ...storedRequirements,
                    fromCache: true,
                    locked: true,
                    lockedAt: (journeyProgress as any).requirementsLockedAt || null,
                    message: 'Using stored requirements from Preparation step - locked to ensure consistency',
                    metadata: {
                        projectId,
                        generatedAt: storedRequirements.generatedAt || new Date().toISOString(),
                        source: 'journeyProgress.requirementsDocument'
                    }
                });
            }
            
            // Not locked but exists - check if user wants to regenerate
            const generateNew = req.query.generateNew === 'true';
            if (!generateNew) {
                console.log(`📄 [SSOT] Using stored requirements from journeyProgress for project ${projectId} (not locked, returning cached)`);
                return res.json({
                    success: true,
                    document: storedRequirements,
                    ...storedRequirements,
                    fromCache: true,
                    locked: false,
                    message: 'Using stored requirements from Preparation step - use ?generateNew=true to regenerate',
                    metadata: {
                        projectId,
                        generatedAt: storedRequirements.generatedAt || new Date().toISOString(),
                        source: 'journeyProgress.requirementsDocument'
                    }
                });
            }
            
            // User explicitly wants to regenerate - continue to generation logic below
            console.log(`🔄 [Required Elements] User requested regeneration (generateNew=true) for project ${projectId}`);
        }

        // Fallback: Check dataset ingestionMetadata (legacy location)
        const datasets = await storage.getProjectDatasets(projectId);

        if (!datasets || datasets.length === 0) {
            clearTimeout(timeoutId);
            if (responded) return;
            responded = true;
            // [PHASE 3 FIX] Return 200 with graceful fallback instead of 404
            // This allows frontend to handle the state without showing destructive errors
            console.log(`⚠️ [Required Elements] No datasets found for project ${projectId}, returning graceful fallback`);
            return res.json({
                success: false,
                document: null,
                error: 'no_dataset',
                message: 'Upload data first to generate required data elements',
                // Provide minimal default structure for frontend to work with
                defaultElements: {
                    requiredDataElements: [],
                    analysisPath: [],
                    completeness: {
                        readyForExecution: false,
                        totalElements: 0,
                        elementsMapped: 0,
                        elementsMissing: 0,
                        gaps: []
                    },
                    gaps: [{
                        severity: 'high',
                        type: 'data_missing',
                        description: 'No dataset has been uploaded yet. Please upload your data first.'
                    }]
                }
            });
        }

        const dataset = datasets[0].dataset;
        const ingestionMetadata = (dataset as any).ingestionMetadata;

        // [DATA CONTINUITY FIX] Use joined schema from journeyProgress if available
        // This ensures requirements are generated against ALL columns from ALL datasets
        const storedJoinedData = (journeyProgress as any)?.joinedData;
        const joinedSchema = storedJoinedData?.schema || null;

        // Build merged schema from all datasets if no joined schema available
        let effectiveSchema: Record<string, any>;
        let totalRowCount = 0;

        if (joinedSchema && Object.keys(joinedSchema).length > 0) {
            // Use persisted joined schema
            effectiveSchema = joinedSchema;
            // CRITICAL FIX: Use actual totalRowCount, not preview length
            totalRowCount = storedJoinedData?.totalRowCount || 
                          storedJoinedData?.fullRowCount || 
                          storedJoinedData?.fullData?.length || 
                          storedJoinedData?.preview?.length || 
                          0;
            console.log(`📊 [Required Elements] Using JOINED schema with ${Object.keys(effectiveSchema).length} columns, ${totalRowCount} total rows`);
        } else if (datasets.length > 1) {
            // Merge schemas from all datasets
            effectiveSchema = {};
            for (let i = 0; i < datasets.length; i++) {
                const ds = datasets[i].dataset;
                const dsName = (ds as any).originalFileName?.replace(/\.[^.]+$/, '').substring(0, 15) || `Dataset${i + 1}`;
                const dsSchema = (ds as any).schema || {};
                totalRowCount += (ds as any).recordCount || 0;

                for (const [col, type] of Object.entries(dsSchema)) {
                    // Use dataset name prefix if column name conflicts
                    const finalCol = effectiveSchema[col] !== undefined ? `${dsName}_${col}` : col;
                    effectiveSchema[finalCol] = type;
                }
            }
            console.log(`📊 [Required Elements] Merged schema from ${datasets.length} datasets: ${Object.keys(effectiveSchema).length} columns`);
        } else {
            // Single dataset - use its schema directly
            effectiveSchema = (dataset as any).schema || {};
            totalRowCount = (dataset as any).recordCount || 0;
        }

        // P1-4 FIX: Only generate if not locked and not found
        // FIX 2: BEFORE regeneration, check if requirements are locked
        // If locked but document missing, return error instead of regenerating
        if (isLocked && !storedRequirements) {
            // Locked but missing - this is an error, don't regenerate
            clearTimeout(timeoutId);
            if (responded) return;
            responded = true;
            console.error(`❌ [SSOT] Requirements locked but document missing for project ${projectId} - cannot regenerate`, {
                isLocked: true,
                hasStoredRequirements: false,
                action: 'BLOCKED_REGENERATION'
            });
            return res.status(500).json({
                success: false,
                error: 'Requirements are locked but document is missing. Please contact support.',
                locked: true,
                projectId
            });
        }

        // Check legacy location first, but prefer journeyProgress (checked above)
        let doc = ingestionMetadata?.dataRequirementsDocument;

        // Only regenerate if NOT locked and document doesn't exist
        if (!doc && !storedRequirements && !isLocked) {
            console.log(`🔄 [Required Elements] No stored document found (not locked), generating for project ${projectId}`, {
                hasLegacyDoc: !!doc,
                hasStoredRequirements: !!storedRequirements,
                isLocked: false,
                action: 'ALLOWING_REGENERATION'
            });

            // Get project goals and questions from journeyProgress
            const userGoals: string[] = [];
            const userQuestions: string[] = [];

            // Try to get goals from journeyProgress
            if ((journeyProgress as any)?.goals?.length > 0) {
                userGoals.push(...(journeyProgress as any).goals);
            }
            if ((journeyProgress as any)?.questions?.length > 0) {
                userQuestions.push(...(journeyProgress as any).questions);
            }

            // If no explicit goals, generate from effective (possibly joined) schema
            if (userGoals.length === 0) {
                const columns = Object.keys(effectiveSchema);
                userGoals.push(`Analyze the available dataset with ${columns.length} columns to identify patterns and insights`);
            }

            // Build dataset metadata for requirement generation using effective schema
            const datasetMetadata = {
                schema: effectiveSchema,
                rowCount: totalRowCount,
                fileName: datasets.length > 1
                    ? `${datasets.length} datasets (joined)`
                    : ((dataset as any).originalFileName || 'Unknown'),
                columns: Object.keys(effectiveSchema),
                columnTypes: Object.entries(effectiveSchema).reduce((acc: any, [col, type]: [string, any]) => {
                    acc[col] = type?.type || type || 'text';
                    return acc;
                }, {})
            };

            // Generate requirements using the tool via tool registry
            const toolResult = await executeTool(
                'required_data_elements_tool',
                'data_scientist',
                {
                    operation: 'defineRequirements',
                    projectId,
                    userGoals,
                    userQuestions,
                    datasetMetadata
                },
                { userId, projectId }
            );

            if (toolResult.status === 'error') {
                throw new Error(toolResult.error || 'Failed to generate data requirements');
            }

            doc = toolResult.result;

            // Store for future use AND LOCK to prevent regeneration
            // CRITICAL: Use atomic JSONB update to prevent race conditions with frontend updateProgress calls
            // This ensures users see consistent recommendations throughout their journey
            const requirementsDoc = {
                ...doc,
                generatedAt: doc.generatedAt || new Date().toISOString(),
                version: doc.version || 1
            };
            
            await db.execute(
                sql`UPDATE projects
                    SET journey_progress = COALESCE(journey_progress, '{}'::jsonb)
                        || jsonb_build_object(
                            'requirementsDocument', ${JSON.stringify(requirementsDoc)}::jsonb,
                            'requirementsLocked', to_jsonb(true),
                            'requirementsLockedAt', to_jsonb(${new Date().toISOString()})
                        ),
                        updated_at = NOW()
                    WHERE id = ${projectId}`
            );

            console.log(`✅🔒 [Required Elements] Auto-generated, stored, and LOCKED requirements with ${doc.requiredDataElements?.length || 0} elements, ${doc.analysisPath?.length || 0} analyses (atomic JSONB merge)`);
        }

        // R2 FIX: Include questionAnswerMapping and other fields needed by transformation step
        // Refresh project to get updated journeyProgress with lock status
        const updatedProject = await storage.getProject(projectId);
        // CRITICAL FIX: parseJourneyProgress expects journeyProgress JSONB, not the entire project object
        const updatedProgress = parseJourneyProgress((updatedProject as any)?.journeyProgress || updatedProject?.journeyProgress || {});
        const isLockedAfterUpdate = (updatedProgress as any).requirementsLocked === true;

        clearTimeout(timeoutId);
        if (responded) return;
        responded = true;
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
                datasetName: datasets.length > 1
                    ? `${datasets.length} datasets (joined)`
                    : ((dataset as any).originalFileName || 'Unknown'),
                recordCount: totalRowCount,
                columnCount: Object.keys(effectiveSchema).length,
                datasetCount: datasets.length,
                usedJoinedSchema: joinedSchema && Object.keys(joinedSchema).length > 0,
                generatedAt: new Date().toISOString()
            },
            // CONSISTENCY: Tell frontend if requirements are locked
            locked: isLockedAfterUpdate,
            lockedAt: (updatedProgress as any).requirementsLockedAt || null,
            message: isLockedAfterUpdate
                ? 'Requirements are locked - these recommendations will remain consistent throughout your journey'
                : 'Requirements generated - will be locked after first use'
        });

    } catch (error: any) {
        clearTimeout(timeoutId);
        if (responded) return;
        responded = true;
        console.error('Error fetching required data elements:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch required data elements'
        });
    }
});

// CONSISTENCY: Explicit endpoint to unlock and regenerate requirements
// Use this when user explicitly wants to change their goals/questions and get new recommendations
router.post("/:id/unlock-requirements", ensureAuthenticated, requireOwnership('project'), async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const { regenerate = false, newGoals, newQuestions } = req.body;

        const project = await storage.getProject(projectId);
        // CRITICAL FIX: parseJourneyProgress expects journeyProgress JSONB, not the entire project object
        const journeyProgress = parseJourneyProgress((project as any)?.journeyProgress || project?.journeyProgress || {});

        // Unlock requirements
        const updatedProgress: any = {
            ...journeyProgress,
            requirementsLocked: false,
            requirementsUnlockedAt: new Date().toISOString(),
            requirementsUnlockReason: 'User requested unlock to modify goals/questions'
        };

        // If regenerate is requested, clear the existing document
        if (regenerate) {
            delete updatedProgress.requirementsDocument;
            console.log(`🔓 [Requirements] Unlocked and cleared requirements for project ${projectId}`);

            // Update goals/questions if provided
            if (newGoals) {
                updatedProgress.goals = Array.isArray(newGoals) ? newGoals : [newGoals];
            }
            if (newQuestions) {
                updatedProgress.businessQuestions = Array.isArray(newQuestions) ? newQuestions.join('\n') : newQuestions;
            }
        } else {
            console.log(`🔓 [Requirements] Unlocked requirements for project ${projectId} (keeping existing document)`);
        }

        await storage.updateProject(projectId, {
            journeyProgress: updatedProgress
        } as any);

        res.json({
            success: true,
            message: regenerate
                ? 'Requirements unlocked and cleared - new recommendations will be generated on next load'
                : 'Requirements unlocked - you can now modify goals/questions',
            locked: false
        });

    } catch (error: any) {
        console.error('Error unlocking requirements:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to unlock requirements'
        });
    }
});

// Agent interaction endpoints

// Get project checkpoints
// FIX #35: Filter by userVisible for regular users
router.get("/:projectId/checkpoints", ensureAuthenticated, requireOwnership('project'), async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = (req.user as any)?.id;
        const showAll = req.query.showAll === 'true';  // FIX #35: Allow admin to see all
        const userIsAdmin = isAdmin(req);

        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        // Verify user has access to this project
        const project = await storage.getProject(projectId);
        const owner = (project as any)?.ownerId ?? (project as any)?.userId;
        if (owner !== userId && !userIsAdmin) {
            return res.status(403).json({ error: "Access denied" });
        }

        const allCheckpoints = await projectAgentOrchestrator.getProjectCheckpoints(projectId);

        // FIX #35: Filter checkpoints for regular users (show only userVisible=true)
        const checkpoints = (userIsAdmin && showAll)
            ? allCheckpoints
            : allCheckpoints.filter(cp => cp.userVisible === true);

        res.json({ success: true, checkpoints });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Handle checkpoint feedback
router.post("/:projectId/checkpoints/:checkpointId/feedback", ensureAuthenticated, async (req, res) => {
    try {
        const { projectId, checkpointId } = req.params;
        const { feedback, approved } = req.body;
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

        await projectAgentOrchestrator.handleCheckpointFeedback(
            projectId,
            checkpointId,
            feedback || '',
            approved === true
        );

        res.json({ success: true, message: "Feedback processed successfully" });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

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
            questions: questions.map((q: { id: string; questionText: string; questionOrder: number | null; status: string | null }) => ({
                id: q.id,
                text: q.questionText,
                questionText: q.questionText,  // For frontend compatibility
                question: q.questionText,       // Alternative field name
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

// PUT /api/projects/:id/verify - Verify data and mark step as complete
router.put("/:id/verify", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;
        const { verificationStatus, verificationTimestamp, verificationChecks } = req.body;

        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
        if (!accessCheck.allowed) {
            const status = accessCheck.reason === 'Project not found' ? 404 : 403;
            return res.status(status).json({ error: accessCheck.reason });
        }

        console.log(`✅ [Verify] Processing verification for project ${projectId}`);
        console.log(`   Status: ${verificationStatus}, Timestamp: ${verificationTimestamp}`);

        // Get current project
        const project = accessCheck.project;
        // CRITICAL FIX: parseJourneyProgress expects journeyProgress JSONB, not the entire project object
        const currentJourneyProgress = parseJourneyProgress((project as any)?.journeyProgress || project?.journeyProgress || {});

        // Update journeyProgress with verification data
        // FIX: Ensure completedSteps is an array before spreading (may be {} if empty)
        const existingSteps = Array.isArray(currentJourneyProgress.completedSteps)
            ? currentJourneyProgress.completedSteps
            : [];
        const updatedJourneyProgress = {
            ...currentJourneyProgress,
            verificationStatus,
            verificationTimestamp,
            verificationChecks,
            currentPhase: 'transform',
            completedSteps: [...existingSteps, 'verify'].filter((v, i, a) => a.indexOf(v) === i)
        };

        // Update project with verification state
        await storage.updateProject(projectId, {
            journeyProgress: updatedJourneyProgress
        } as any);

        // Mark verification step as complete using journey state manager
        await journeyStateManager.completeStep(projectId, 'verify');

        console.log(`✅ [Verify] Data verified for project ${projectId}`);

        res.json({
            success: true,
            message: "Data verified successfully",
            verificationStatus,
            nextPhase: 'transform'
        });
    } catch (error: any) {
        console.error('Failed to verify project data:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to verify data' });
    }
});

// POST /api/projects/:id/create-mapping-document - Verification step creates mappingDocument artifact
// IMMUTABLE ARTIFACTS: Creates NEW mappingDocument, does NOT modify requirementsDocument
router.post("/:id/create-mapping-document", ensureAuthenticated, requireOwnership('project'), async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;
        const { elementMappings } = req.body; // { elementId: { sourceColumn, transformationDescription } }

        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        console.log(`🔧 [Verification Step] Creating mapping document for project ${projectId}`);

        // Get project and requirements document (READ-ONLY - never modify)
        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({ error: "Project not found" });
        }

        // CRITICAL FIX: parseJourneyProgress expects journeyProgress JSONB, not the entire project object
        const journeyProgress = parseJourneyProgress((project as any)?.journeyProgress || project?.journeyProgress || {});
        const requirementsDoc = (journeyProgress as any).requirementsDocument;

        if (!requirementsDoc) {
            return res.status(400).json({ 
                error: "Requirements document not found. Please complete the Preparation step first." 
            });
        }

        // Get dataset schema for transformation suggestions
        const datasets = await storage.getProjectDatasets(projectId);
        if (!datasets || datasets.length === 0) {
            return res.status(400).json({ error: "No datasets found. Please upload data first." });
        }

        // Use joined schema if available, otherwise use first dataset schema
        const joinedSchema = (journeyProgress as any)?.joinedData?.schema;
        const datasetSchema = joinedSchema || (datasets[0].dataset as any).schema || {};
        const availableColumns = Object.keys(datasetSchema);

        // Get user goals and questions for context (from requirementsDocument)
        const userGoals = requirementsDoc.userGoals || [];
        const userQuestions = requirementsDoc.userQuestions || [];

        // Import Data Engineer agent for transformation suggestions
        const { DataEngineerAgent } = await import('../services/data-engineer-agent');
        const dataEngineerAgent = new DataEngineerAgent();

        // Create element mappings array from requirementsDocument elements
        const elementMappingsArray = await Promise.all(
            (requirementsDoc.requiredDataElements || []).map(async (element: any) => {
                const mapping = elementMappings?.[element.id || element.elementId];
                
                if (!mapping || !mapping.sourceColumn) {
                    // Element not mapped yet
                    return {
                        elementId: element.id || element.elementId,
                        elementName: element.name || element.elementName,
                        sourceColumn: '', // Will be empty if not mapped
                        sourceDataType: undefined,
                        targetDataType: element.dataType,
                        transformationRequired: false,
                        mappingConfidence: 0,
                        relatedAnalyses: element.relatedAnalyses || [],
                        relatedGoals: element.relatedGoals || [],
                        relatedQuestions: element.relatedQuestions || [],
                    };
                }

                const sourceColumn = mapping.sourceColumn || mapping.mappedColumn;
                // Get source type from schema - handle both object types and primitive types
                const sourceTypeValue = datasetSchema[sourceColumn];
                const sourceType = (typeof sourceTypeValue === 'object' && sourceTypeValue && 'type' in sourceTypeValue)
                    ? (sourceTypeValue as any).type
                    : (typeof sourceTypeValue !== 'undefined')
                    ? typeof sourceTypeValue
                    : 'unknown';
                const targetType = element.dataType || 'unknown';
                const needsTransformation = sourceType !== targetType || mapping.transformationDescription;

                // Build base mapping
                const elementMapping: any = {
                    elementId: element.id || element.elementId,
                    elementName: element.name || element.elementName,
                    sourceColumn: sourceColumn,
                    sourceDataType: sourceType,
                    targetDataType: targetType,
                    transformationRequired: needsTransformation,
                    mappingConfidence: mapping.confidence || 0.8,
                    // Preserve linkage from requirementsDocument
                    relatedAnalyses: element.relatedAnalyses || [],
                    relatedGoals: element.relatedGoals || [],
                    relatedQuestions: element.relatedQuestions || [],
                };

                // Add transformation logic if needed
                if (needsTransformation) {
                    try {
                        const missingColumns = [element.name || element.elementName];
                        const transformationOptions = await dataEngineerAgent.suggestTransformations(
                            missingColumns,
                            availableColumns,
                            userGoals
                        );

                        const relevantTransformation = Array.isArray(transformationOptions.transformations)
                            ? transformationOptions.transformations.find((t: any) => 
                                t.targetColumn?.toLowerCase() === element.name?.toLowerCase() ||
                                t.sourceColumns?.includes(sourceColumn)
                              )
                            : null;

                        elementMapping.transformationLogic = {
                            description: mapping.transformationDescription || 
                                        relevantTransformation?.description ||
                                        `Transform "${sourceColumn}" (${sourceType}) to match "${element.name}" (${targetType}) requirements`,
                            operation: relevantTransformation?.method || 'custom',
                            code: mapping.transformationCode,
                            dependencies: relevantTransformation?.sourceColumns || [sourceColumn]
                        };
                    } catch (transformError) {
                        console.warn(`⚠️ Failed to generate transformation logic for element ${element.id}:`, transformError);
                        // Continue without transformation logic
                        elementMapping.transformationLogic = {
                            description: mapping.transformationDescription || `Transform "${sourceColumn}" to match "${element.name}" requirements`,
                            operation: 'custom',
                            dependencies: [sourceColumn]
                        };
                    }
                }

                return elementMapping;
            })
        );

        // Create NEW mappingDocument artifact (does NOT modify requirementsDocument)
        const mappingDocument = {
            requirementsDocument: requirementsDoc, // Full snapshot for convenience
            elementMappings: elementMappingsArray,
            generatedAt: new Date().toISOString(),
            generatedBy: 'data_engineer_agent',
            status: 'completed' as const
        };

        // Update journeyProgress with NEW mappingDocument (requirementsDocument remains unchanged)
        const updatedJourneyProgress = {
            ...journeyProgress,
            mappingDocument: mappingDocument
            // requirementsDocument is NOT modified - it remains immutable
        };

        // Use atomic JSONB update to prevent race conditions
        await db.execute(
            sql`UPDATE projects
                SET journey_progress = COALESCE(journey_progress, '{}'::jsonb)
                    || jsonb_build_object('mappingDocument', ${JSON.stringify(mappingDocument)}::jsonb),
                    updated_at = NOW()
                WHERE id = ${projectId}`
        );

        const mappedCount = elementMappingsArray.filter((m: any) => m.sourceColumn).length;
        console.log(`✅ [Verification Step] Created mapping document with ${mappedCount}/${elementMappingsArray.length} elements mapped`);

        res.json({
            success: true,
            mappingDocument: mappingDocument,
            message: `Created mapping document with ${mappedCount} element mappings`
        });

    } catch (error: any) {
        console.error('Failed to create mapping document:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to create mapping document' 
        });
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
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const apiKey = process.env.GOOGLE_AI_API_KEY;

        if (!apiKey) {
            return res.status(503).json({
                success: false,
                error: "AI service not configured"
            });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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

        return res.json({
            success: true,
            project: updatedProject,
            message: 'Schema updated successfully'
        });

        // Log decision (fire and forget)
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

        return;
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

// Get project datasets
router.get('/:id/datasets', ensureAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const accessCheck = await canAccessProject(userId, id, isAdmin(req));
        if (!accessCheck.allowed) {
            return res.status(403).json({ error: 'Unauthorized access to project' });
        }

        const datasets = await storage.getProjectDatasets(id);
        const datasetList = datasets || [];

        // [DATA CONTINUITY FIX] Load stored joined data from journeyProgress
        const project = await storage.getProject(id);
        // CRITICAL FIX: parseJourneyProgress expects journeyProgress JSONB, not the entire project object
        const journeyProgress = parseJourneyProgress((project as any)?.journeyProgress || project?.journeyProgress || {});
        const projectMetadata = (project as any)?.metadata || {};

        // Get stored joined data (persisted by first datasets endpoint)
        const storedJoinedData = (journeyProgress as any)?.joinedData as {
            schema?: Record<string, any>;
            preview?: any[];
            joinInsights?: any;
        } | undefined;
        const autoDetectedJoinConfig = projectMetadata?.autoDetectedJoinConfig;

        // [PHASE 4 & 5 FIX] Build merged schema and total counts for multi-dataset scenarios
        let mergedSchema: Record<string, any> = {};
        let totalRecordCount = 0;

        if (datasetList.length > 0) {
            for (let dsIdx = 0; dsIdx < datasetList.length; dsIdx++) {
                const dsEntry = datasetList[dsIdx];
                const ds = (dsEntry?.dataset || dsEntry) as any;
                const schema = ds?.schema || {};
                const recordCount = ds?.recordCount || (ds?.data as any[])?.length || 0;

                totalRecordCount += recordCount;

                // Merge schema with prefix for conflicts
                const rawName = ds?.originalFileName || ds?.name || `Dataset${dsIdx + 1}`;
                const cleanName = rawName.replace(/\.[^.]+$/, '').substring(0, 15);

                Object.entries(schema).forEach(([col, type]) => {
                    let finalCol = col;
                    if (mergedSchema[col] !== undefined && datasetList.length > 1) {
                        finalCol = `${cleanName}_${col}`;
                    }
                    mergedSchema[finalCol] = type;
                });
            }
        }

        // [DATA CONTINUITY FIX] Return stored joined data for downstream steps
        // Priority: Use stored joinedData from journeyProgress if available
        const joinedPreview = storedJoinedData?.preview || null;
        const joinedSchema = storedJoinedData?.schema || (datasetList.length > 1 ? mergedSchema : null);
        const joinInsights = storedJoinedData?.joinInsights || null;

        console.log(`📊 [Datasets Endpoint] Returning ${datasetList.length} datasets, joinedPreview: ${joinedPreview?.length || 0} rows, joinedSchema: ${joinedSchema ? Object.keys(joinedSchema).length : 0} columns`);

        return res.json({
            success: true,
            datasets: datasetList,
            count: datasetList.length,
            // [DATA CONTINUITY FIX] Include stored joined data for all downstream steps
            joinedPreview,
            joinedSchema,
            joinInsights,
            autoDetectedJoinConfig,
            // [PHASE 4 & 5 FIX] Include merged schema and total counts
            mergedSchema: datasetList.length > 1 ? mergedSchema : undefined,
            totalRecordCount,
            recordCountNote: datasetList.length > 1
                ? `${totalRecordCount} total rows across ${datasetList.length} datasets`
                : undefined
        });
    } catch (error: any) {
        console.error('Failed to fetch project datasets:', error);
        return res.status(500).json({ error: 'Failed to fetch project datasets' });
    }
});

// ============================================
// PATCH /api/projects/:id/progress - DEC-004: Atomic Journey Progress Updates
// Deep merges provided fields into existing journeyProgress JSONB
// Prevents race conditions between user UI and agent updates
// See: docs/DESIGN_DECISIONS.md, docs/COMPREHENSIVE_JOURNEY_FIX_PLAN.md
// ============================================
router.patch('/:id/progress', ensureAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const progressUpdate = req.body;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Verify ownership
        const accessCheck = await canAccessProject(userId, id, isAdmin(req));
        if (!accessCheck.allowed) {
            return res.status(403).json({ success: false, error: 'Unauthorized access to project' });
        }

        const project = accessCheck.project;
        if (!project) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }

        // Parse existing journeyProgress
        // CRITICAL FIX: parseJourneyProgress expects journeyProgress JSONB, not the entire project object
        const existingProgress = parseJourneyProgress((project as any)?.journeyProgress || project?.journeyProgress || {});

        // IMMUTABLE ARTIFACTS: Exclude artifact fields from updates - they can only be created via dedicated endpoints
        // These fields are immutable once created and should never be modified via generic PATCH
        const IMMUTABLE_ARTIFACT_FIELDS = [
            'requirementsDocument',
            'requirementsLocked',
            'requirementsLockedAt',
            'mappingDocument',
            'transformationDocument'
        ];

        // Remove artifact fields from progressUpdate (they should only be created via dedicated endpoints)
        const sanitizedUpdate: any = { ...progressUpdate };
        let removedFields: string[] = [];
        IMMUTABLE_ARTIFACT_FIELDS.forEach(field => {
            if (field in sanitizedUpdate) {
                delete sanitizedUpdate[field];
                removedFields.push(field);
            }
        });

        if (removedFields.length > 0) {
            console.warn(`⚠️ [PATCH /progress] Removed immutable artifact fields from update for project ${id}: ${removedFields.join(', ')}. Use dedicated endpoints to create/modify artifacts.`);
        }

        // Deep merge the sanitized update into existing progress
        const mergedProgress = deepMergeJourneyProgress(existingProgress, sanitizedUpdate);

        // PROTECTION: Preserve all immutable artifacts from existing progress (even if not in update)
        // This ensures artifacts are never accidentally cleared by PATCH operations
        if ((existingProgress as any).requirementsDocument) {
            (mergedProgress as any).requirementsDocument = (existingProgress as any).requirementsDocument;
        }
        if ((existingProgress as any).mappingDocument) {
            (mergedProgress as any).mappingDocument = (existingProgress as any).mappingDocument;
        }
        if ((existingProgress as any).transformationDocument) {
            (mergedProgress as any).transformationDocument = (existingProgress as any).transformationDocument;
        }
        
        // Also preserve lock status if it exists
        if ((existingProgress as any).requirementsLocked === true) {
            (mergedProgress as any).requirementsLocked = true;
            if ((existingProgress as any).requirementsLockedAt) {
                (mergedProgress as any).requirementsLockedAt = (existingProgress as any).requirementsLockedAt;
            }
        }

        // Update timestamp for the current step if provided
        if (progressUpdate.currentStep) {
            mergedProgress.stepTimestamps = {
                ...mergedProgress.stepTimestamps,
                [progressUpdate.currentStep]: new Date().toISOString()
            };
        }

        // Use raw SQL for atomic JSONB update to prevent race conditions
        await db.execute(
            sql`UPDATE projects
                SET journey_progress = ${JSON.stringify(mergedProgress)}::jsonb,
                    updated_at = NOW()
                WHERE id = ${id}`
        );

        // Fetch updated project
        const updatedProject = await storage.getProject(id);

        console.log(`✅ [DEC-004] Journey progress updated for project ${id}`);

        return res.json({
            success: true,
            journeyProgress: mergedProgress,
            project: updatedProject,
            message: 'Journey progress updated successfully'
        });
    } catch (error: any) {
        console.error('❌ [DEC-004] Failed to update journey progress:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update journey progress',
            details: error.message
        });
    }
});

// Helper function for deep merging journeyProgress (DEC-004)
function deepMergeJourneyProgress(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
        if (source[key] === null || source[key] === undefined) {
            continue; // Skip null/undefined values
        }

        if (Array.isArray(source[key])) {
            // Arrays are replaced, not merged (intentional for lists like completedSteps, questions)
            result[key] = [...source[key]];
        } else if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
            // Objects are deep merged
            result[key] = deepMergeJourneyProgress(result[key] || {}, source[key]);
        } else {
            // Primitives are replaced
            result[key] = source[key];
        }
    }

    return result;
}

// Translate results for different audiences
router.post('/:id/translate-results', ensureAuthenticated, async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = (req.user as any)?.id;
        const isAdminUser = (req.user as any)?.isAdmin || false;
        const { audienceType } = req.body;

        // Check project access
        const access = await canAccessProject(userId, projectId, isAdminUser);
        if (!access.allowed) {
            return res.status(403).json({
                success: false,
                error: access.reason || 'Access denied'
            });
        }

        // Load project and analysis results
        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        // Get analysis results
        const analysisResults = (project as any).analysisResults;
        if (!analysisResults) {
            return res.status(404).json({
                success: false,
                error: 'Analysis results not found. Please complete the execution step first.'
            });
        }

        // Check if translation already exists in results
        const existingTranslations = analysisResults.audienceTranslations || {};
        if (existingTranslations[audienceType]) {
            return res.json({
                success: true,
                translation: existingTranslations[audienceType],
                fromCache: true
            });
        }

        // Get audience from journeyProgress if not provided
        const journeyProgress = parseJourneyProgress((project as any).journeyProgress);
        const audience = (journeyProgress as any)?.audience;
        const targetAudience = audienceType || (audience?.primary as string) || 'general';
        const decisionContext = audience?.decisionContext as string | undefined;

        // Use Business Agent to translate results
        const businessAgent = new BusinessAgent();
        const translatedResults = await businessAgent.translateResults({
            results: analysisResults,
            audience: targetAudience,
            decisionContext
        });

        // Store translation in project's analysisResults for future use
        // This is read-only display, so we don't need to persist it back
        // (it will be stored when analysis completes)

        res.json({
            success: true,
            translation: {
                insights: translatedResults.insights || [],
                recommendations: translatedResults.recommendations || [],
                executiveSummary: translatedResults.executiveSummary,
                translatedFor: targetAudience,
                translatedAt: translatedResults.translatedAt || new Date().toISOString()
            }
        });

    } catch (error: any) {
        console.error('❌ Error translating results:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to translate results'
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
        // FIX: Production Readiness - Also check journeyProgress for transformed data
        const journeyProgress = (project as any)?.journeyProgress;
        const dataRows = journeyProgress?.transformationStepData?.transformedData ||
            (project as any)?.transformedData ||
            (project as any)?.data ||
            [];

        // FIX: Production Readiness - Return error when no data is available for export
        if (!Array.isArray(dataRows) || dataRows.length === 0) {
            const hasSchema = Object.keys((project as any)?.schema || {}).length > 0;
            const hasInsights = Object.keys((project as any)?.insights || journeyProgress?.analysisResults || {}).length > 0;

            if (!hasSchema && !hasInsights) {
                return res.status(400).json({
                    error: 'No data available for export',
                    message: 'This project does not have any data, schema, or analysis results to export. Please complete the data upload and analysis steps first.'
                });
            }
            // If we have schema or insights but no data rows, we can still generate metadata export
            console.log(`[Export] Project ${id} has no data rows but has ${hasSchema ? 'schema' : ''}${hasSchema && hasInsights ? ' and ' : ''}${hasInsights ? 'insights' : ''} - proceeding with metadata export`);
        }

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
            joinConfig: initialJoinConfig
        } = req.body;

        // Use let so we can modify joinConfig if needed based on persisted insights
        let joinConfig = initialJoinConfig;

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

        // CORRECTED FIX: Use persisted joinInsights for JOIN CONFIG but use FULL datasets for data
        // The preview is only 50 rows for UI display - transformation needs FULL data
        const project = await storage.getProject(projectId);
        const journeyProgress = parseJourneyProgress((project as any)?.journeyProgress);
        const persistedJoinedData = (journeyProgress as any)?.joinedData;

        let workingData: any[] = [];

        // Define firstDataset for data access
        const firstDataset = (datasets[0] as any).dataset || datasets[0];

        // ALWAYS start with FULL first dataset data (not the 50-row preview!)
        workingData = Array.isArray(firstDataset.data)
            ? [...firstDataset.data]
            : (firstDataset.preview || firstDataset.sampleData || []);
        console.log(`📊 [D3 FIX] Starting with FULL first dataset: ${workingData.length} rows`);

        // Use persisted joinInsights to build join config if available (from upload step)
        // This preserves the join strategy detected earlier, but we'll re-join using full data
        if (persistedJoinedData?.joinInsights && datasets.length > 1) {
            const insights = persistedJoinedData.joinInsights;
            console.log(`📊 [D3 FIX] Using persisted join insights:`, {
                joinStrategy: insights.joinStrategy,
                primaryColumn: insights.primaryColumn,
                foreignKeysCount: insights.foreignKeys?.length || 0
            });

            // Build joinConfig from persisted insights if no explicit joinConfig provided
            if (!joinConfig?.foreignKeys?.length && insights.foreignKeys?.length > 0) {
                joinConfig = {
                    foreignKeys: insights.foreignKeys,
                    type: insights.joinType || 'left'
                };
                console.log(`📊 [D3 FIX] Built joinConfig from persisted insights: ${joinConfig.foreignKeys.length} foreign keys`);
            }
        }

        // MULTI-DATASET JOIN: Perform join on FULL datasets when we have multiple datasets with join config
        if (datasets.length > 1 && joinConfig?.foreignKeys?.length > 0) {
            console.log(`🔗 [ENHANCED JOIN] Performing multi-dataset join with ${joinConfig.foreignKeys.length} key mappings`);
            console.log(`🔗 [ENHANCED JOIN] Join type: ${joinConfig.type || 'left'}`);

            // Load PII exclusion settings from project (already loaded above)
            const excludedColumns = new Set<string>(
                ((project as any)?.metadata?.excludedColumns || []).map((c: string) => c.toLowerCase())
            );
            const anonymizedColumns = new Set<string>(
                ((project as any)?.metadata?.anonymizedColumns || []).map((c: string) => c.toLowerCase())
            );

            if (excludedColumns.size > 0) {
                console.log(`🔒 [ENHANCED JOIN] Will exclude PII columns:`, Array.from(excludedColumns));
            }

            for (let i = 1; i < datasets.length; i++) {
                const rightDataset = (datasets[i] as any).dataset || datasets[i];
                const rightData = Array.isArray(rightDataset.data)
                    ? rightDataset.data
                    : (rightDataset.preview || rightDataset.sampleData || []);

                // DEBUG: Log dataset IDs for matching
                console.log(`🔗 [ENHANCED JOIN] Dataset ${i} matching:`, {
                    firstDatasetId: firstDataset.id,
                    rightDatasetId: rightDataset.id,
                    foreignKeysCount: joinConfig.foreignKeys?.length || 0
                });

                // Find the join key for this dataset pair - enhanced matching
                let keyMapping = joinConfig.foreignKeys.find((fk: any) =>
                    (fk.sourceDataset === firstDataset.id && fk.targetDataset === rightDataset.id) ||
                    (fk.sourceDataset === rightDataset.id && fk.targetDataset === firstDataset.id)
                );

                // FALLBACK: If no direct ID match, try matching by position (first → second dataset)
                if (!keyMapping && joinConfig.foreignKeys.length > 0) {
                    console.log(`🔗 [ENHANCED JOIN] No direct ID match, trying positional mapping (index ${i - 1})`);
                    keyMapping = joinConfig.foreignKeys[i - 1]; // Use positional index
                    console.log(`🔗 [ENHANCED JOIN] Using positional keyMapping:`, keyMapping);
                }

                if (keyMapping && rightData.length > 0) {
                    // Determine left/right keys - handle both orderings
                    let leftKey = keyMapping.sourceColumn;
                    let rightKey = keyMapping.targetColumn;

                    // Check if the sourceDataset matches firstDataset; if not, swap
                    if (keyMapping.sourceDataset && keyMapping.sourceDataset !== firstDataset.id) {
                        leftKey = keyMapping.targetColumn;
                        rightKey = keyMapping.sourceColumn;
                    }

                    console.log(`🔗 [ENHANCED JOIN] Joining on "${leftKey}" = "${rightKey}"`);
                    console.log(`🔗 [ENHANCED JOIN] Left dataset rows: ${workingData.length}, Right dataset rows: ${rightData.length}`);

                    // Get actual column names from data (case may differ)
                    const leftColNames = workingData.length > 0 ? Object.keys(workingData[0]) : [];
                    const rightColNames = rightData.length > 0 ? Object.keys(rightData[0]) : [];
                    console.log(`🔗 [ENHANCED JOIN] Left columns: ${leftColNames.join(', ')}`);
                    console.log(`🔗 [ENHANCED JOIN] Right columns: ${rightColNames.join(', ')}`);

                    // Find actual column names (case-insensitive match)
                    const actualLeftKey = leftColNames.find(c => c.toLowerCase() === leftKey.toLowerCase()) || leftKey;
                    const actualRightKey = rightColNames.find(c => c.toLowerCase() === rightKey.toLowerCase()) || rightKey;
                    console.log(`🔗 [ENHANCED JOIN] Actual column names: left="${actualLeftKey}", right="${actualRightKey}"`);

                    // ENHANCED: Create lookup map that handles multiple rows per key (group by key)
                    const rightLookup = new Map<string, any[]>();
                    let rightKeyCount = 0;
                    for (const row of rightData) {
                        const keyVal = String(row[actualRightKey] ?? '').toLowerCase().trim();
                        if (keyVal) {
                            if (!rightLookup.has(keyVal)) {
                                rightLookup.set(keyVal, []);
                                rightKeyCount++;
                            }
                            rightLookup.get(keyVal)!.push(row);
                        }
                    }
                    console.log(`🔗 [ENHANCED JOIN] Right lookup: ${rightKeyCount} unique keys from ${rightData.length} rows`);

                    // Track join statistics
                    let matchedRows = 0;
                    let unmatchedRows = 0;

                    // Perform JOIN based on type
                    const joinType = joinConfig.type || 'left';
                    const newWorkingData: any[] = [];

                    // FIX: Pre-calculate right column mapping to ensure consistent schema for ALL rows (matched or not)
                    // This prevents "polymorphic" arrays where some rows have right columns and others don't.
                    const finalRightKeys = new Map<string, string>(); // RightCol -> FinalColName
                    const rightKeyLower = actualRightKey.toLowerCase();
                    const prefix = rightDataset.originalFileName?.replace(/\.[^.]+$/i, '') || `ds${i}`;

                    // Use first matched row (or first row if no match) to determine left structure for collision check
                    // Note: This is an approximation. Ideally we check all left cols.
                    const sampleLeftRow = workingData[0] || {};
                    const leftColSet = new Set(Object.keys(sampleLeftRow));

                    for (const col of rightColNames) {
                        if (col.toLowerCase() === rightKeyLower) continue; // Skip join key
                        if (excludedColumns.has(col.toLowerCase())) continue; // Skip PII

                        // Check collision against left columns
                        if (leftColSet.has(col)) {
                            finalRightKeys.set(col, `${prefix}_${col}`);
                        } else {
                            finalRightKeys.set(col, col);
                        }
                    }

                    console.log(`🔗 [ENHANCED JOIN] Right column mapping prepared: ${finalRightKeys.size} columns`);

                    // DEBUG: Log sample keys to help diagnose matching issues
                    const debugLeftKeys = workingData.slice(0, 5).map(r => String(r[actualLeftKey] ?? '').toLowerCase().trim());
                    const debugRightKeys = Array.from(rightLookup.keys()).slice(0, 5);
                    console.log(`🔗 [ENHANCED JOIN] Sample Left Keys:`, debugLeftKeys);
                    console.log(`🔗 [ENHANCED JOIN] Sample Right Keys:`, debugRightKeys);

                    for (const leftRow of workingData) {
                        const leftKeyValue = String(leftRow[actualLeftKey] ?? '').toLowerCase().trim();
                        const rightRows = rightLookup.get(leftKeyValue);

                        // Base object has left columns
                        const baseRow: any = {};
                        for (const [col, val] of Object.entries(leftRow)) {
                            const colLower = col.toLowerCase();
                            if (excludedColumns.has(colLower)) continue;
                            if (anonymizedColumns.has(colLower)) {
                                baseRow[col] = '********';
                            } else {
                                baseRow[col] = val;
                            }
                        }

                        if (rightRows && rightRows.length > 0) {
                            matchedRows++;
                            const rightRow = rightRows[0]; // Take first match
                            const merged = { ...baseRow };

                            // Add right columns using pre-calculated map
                            for (const [rightCol, finalKey] of finalRightKeys.entries()) {
                                const val = rightRow[rightCol];
                                const colLower = rightCol.toLowerCase();
                                const finalVal = anonymizedColumns.has(colLower) ? '********' : val;
                                merged[finalKey] = finalVal;
                            }
                            newWorkingData.push(merged);
                        } else {
                            unmatchedRows++;
                            // LEFT JOIN: Keep unmatched left rows BUT backfill right columns with null
                            if (joinType === 'left' || joinType === 'outer') {
                                const filtered = { ...baseRow };
                                // FIX: Backfill missing right columns to maintain consistent schema
                                for (const finalKey of finalRightKeys.values()) {
                                    filtered[finalKey] = null;
                                }
                                newWorkingData.push(filtered);
                            }
                            // INNER JOIN: Skip unmatched rows
                        }
                    }

                    workingData = newWorkingData;

                    console.log(`✅ [ENHANCED JOIN] Join completed:`, {
                        resultRows: workingData.length,
                        matchedRows,
                        unmatchedRows,
                        matchRate: `${((matchedRows / (matchedRows + unmatchedRows)) * 100).toFixed(1)}%`
                    });
                } else {
                    console.log(`⚠️ [ENHANCED JOIN] No valid key mapping found for dataset ${i}`);
                }
            }

            console.log(`🔗 [ENHANCED JOIN] All joins complete. Final row count: ${workingData.length}`);
        }

        // APPLY TRANSFORMATIONS in order
        for (const step of transformationSteps) {
            const { type, config } = step || {};
            console.log(`📊 [D3 FIX] Applying transformation: ${type}`);

            switch (type) {
                case 'filter': {
                    const { field, operator, value } = config || {};
                    if (field) {
                        workingData = workingData.filter((r) => {
                            const v = r[field];
                            switch (operator) {
                                case 'equals': return v == value;
                                case 'not_equals': return v != value;
                                case 'gt': return Number(v) > Number(value);
                                case 'gte': return Number(v) >= Number(value);
                                case 'lt': return Number(v) < Number(value);
                                case 'lte': return Number(v) <= Number(value);
                                case 'contains': return String(v ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
                                case 'is_null': return v === null || v === undefined || v === '';
                                case 'is_not_null': return v !== null && v !== undefined && v !== '';
                                default: return true;
                            }
                        });
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
                    const { newColumn, expression, sourceColumns } = config || {};
                    if (newColumn && sourceColumns?.length) {
                        workingData = workingData.map((r) => {
                            // Simple derivation: concatenate or calculate
                            let derived = '';
                            if (expression === 'concat') {
                                derived = sourceColumns.map((c: string) => r[c] ?? '').join(' ');
                            } else if (expression === 'sum') {
                                derived = sourceColumns.reduce((acc: number, c: string) => acc + (Number(r[c]) || 0), 0);
                            }
                            return { ...r, [newColumn]: derived };
                        });
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

        // Define primaryDataset before using it
        const primaryDataset = (datasets[0] as any).dataset || datasets[0];

        // IMMUTABLE ARTIFACTS: Create transformationDocument artifact (does NOT modify mappingDocument)
        // Get mappingDocument from journeyProgress (READ-ONLY - never modify)
        const mappingDoc = (journeyProgress as any).mappingDocument;
        if (!mappingDoc) {
            console.warn(`⚠️ [Transformation] mappingDocument not found - transformation will proceed but artifact won't reference it`);
        }

        // Extract selectionCriteria from request (if provided) or use empty array
        const selectionCriteria = mappings?.filter((m: any) => m.criteria || m.selectionCriteria)
            .map((m: any) => ({
                analysisId: m.analysisId || m.targetElement || '',
                criteria: m.criteria || m.selectionCriteria || '',
                filters: m.filters
            })) || [];

        // Build transformation steps array with element linkage
        const transformationStepsArray = transformationSteps.map((step: any, idx: number) => {
            // Find corresponding element from mappingDocument if available
            const elementMapping = mappingDoc?.elementMappings?.find((m: any) => 
                m.sourceColumn === step.sourceColumn || m.elementId === step.elementId
            );

            return {
                elementId: elementMapping?.elementId || step.elementId || `element-${idx}`,
                targetElement: step.targetElement || step.targetColumn || elementMapping?.elementName || '',
                sourceColumn: step.sourceColumn || elementMapping?.sourceColumn || '',
                transformationLogic: step.transformationLogic || step.description || elementMapping?.transformationLogic?.description || '',
                operation: step.operation || step.type || elementMapping?.transformationLogic?.operation || 'custom',
                dependencies: step.dependencies || elementMapping?.transformationLogic?.dependencies || [step.sourceColumn].filter(Boolean)
            };
        });

        // Create NEW transformationDocument artifact
        const transformationDocument = {
            mappingDocument: mappingDoc, // Full snapshot for convenience (if available)
            transformationSteps: transformationStepsArray,
            transformedDatasetId: primaryDataset?.id,
            transformedSchema: transformedSchema,
            transformedRowCount: workingData.length,
            selectionCriteria: selectionCriteria,
            generatedAt: new Date().toISOString(),
            generatedBy: 'data_engineer_agent',
            status: 'applied' as const
        };

        // STORE TRANSFORMED DATA to dataset's ingestionMetadata (for analysis service compatibility)
        await storage.updateDataset(primaryDataset.id, {
            ingestionMetadata: {
                ...(primaryDataset.ingestionMetadata || {}),
                transformedData: workingData,
                transformedSchema,
                transformationApplied: true,
                transformationSteps,
                joinConfig,
                questionAnswerMapping,
                transformedAt: new Date().toISOString(),
                transformedRowCount: workingData.length
            }
        } as any);

        // Update journeyProgress with NEW transformationDocument (mappingDocument remains unchanged)
        // Also store transformedData at project level for analysis service compatibility
        await db.execute(
            sql`UPDATE projects
                SET journey_progress = COALESCE(journey_progress, '{}'::jsonb)
                    || jsonb_build_object('transformationDocument', ${JSON.stringify(transformationDocument)}::jsonb),
                    transformed_data = ${JSON.stringify(workingData)}::jsonb,
                    updated_at = NOW()
                WHERE id = ${projectId}`
        );

        // Also update project.transformedData and project.transformations for legacy compatibility
        // (Some services still read from these fields)
        await storage.updateProject(projectId, {
            transformedData: workingData,
            transformations: transformationSteps,
        } as any);

        console.log(`✅ [D3 FIX] Transformation complete. Rows: ${workingData.length}, Columns: ${Object.keys(transformedSchema).length}`);

        // FIX: Add user-visible checkpoint for transformation completion
        try {
            await projectAgentOrchestrator.addCheckpoint(projectId, {
                id: `checkpoint_de_transform_${Date.now()}`,
                projectId: projectId,
                agentType: 'data_engineer',
                stepName: 'de_transformation_complete',
                status: 'completed',
                message: `Data transformation complete: ${workingData.length.toLocaleString()} rows with ${Object.keys(transformedSchema).length} columns${datasets.length > 1 ? ' (joined from ' + datasets.length + ' datasets)' : ''}`,
                data: {
                    rowCount: workingData.length,
                    columnCount: Object.keys(transformedSchema).length,
                    datasetsJoined: datasets.length,
                    transformationSteps: transformationSteps.length
                },
                userFeedback: undefined,
                requiresUserInput: false,
                userVisible: true,
                timestamp: new Date()
            });
        } catch (checkpointErr) {
            console.warn('⚠️ Failed to add transformation checkpoint:', checkpointErr);
        }

        res.json({
            success: true,
            preview: workingData.slice(0, 100),
            transformedSchema,
            rowCount: workingData.length,
            columnCount: Object.keys(transformedSchema).length,
            message: `Transformed ${workingData.length} rows with ${Object.keys(transformedSchema).length} columns`
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
 * D2 FIX: Server-side PII filtering
 * U2A2A2U PATTERN: Calls the same apply_pii_exclusions MCP tool that agents use
 * This is the FALLBACK path - agents are preferred, but API calls the same tool
 */
router.post("/:id/apply-pii-exclusions", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;
        const { excludedColumns = [], anonymizedColumns = [], maskingStrategy = 'remove' } = req.body;

        console.log(`🔒 [PII Exclusion] Calling apply_pii_exclusions tool (fallback path) for project ${projectId}`);
        console.log(`🔒 [PII Exclusion] Excluded columns:`, excludedColumns);
        console.log(`🔒 [PII Exclusion] Anonymized columns:`, anonymizedColumns);

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

        // Determine masking strategy based on input
        // excludedColumns -> 'remove', anonymizedColumns -> 'redact'
        const allColumnsToProcess = [...excludedColumns];
        const effectiveMaskingStrategy = anonymizedColumns.length > 0 ? 'redact' : maskingStrategy;

        // If we have both excluded and anonymized, we need to process them separately
        // For simplicity, combine them with the appropriate strategy
        if (anonymizedColumns.length > 0 && excludedColumns.length > 0) {
            // Process excluded columns with 'remove' strategy first
            // First call: Remove excluded columns
            const removeResult = await executeTool('apply_pii_exclusions', 'data_engineer', {
                projectId,
                excludedColumns: excludedColumns,
                maskingStrategy: 'remove',
                persistDecision: true,
                userConfirmed: true // API call implies user has confirmed via UI
            }, {
                userId,
                projectId
            });

            if (removeResult.status === 'error') {
                throw new Error(removeResult.error || 'Failed to remove PII columns');
            }

            // Second call: Redact anonymized columns
            const redactResult = await executeTool('apply_pii_exclusions', 'data_engineer', {
                projectId,
                excludedColumns: anonymizedColumns,
                maskingStrategy: 'redact',
                persistDecision: true,
                userConfirmed: true
            }, {
                userId,
                projectId
            });

            if (redactResult.status === 'error') {
                throw new Error(redactResult.error || 'Failed to anonymize PII columns');
            }

            return res.json({
                success: true,
                message: `Removed ${excludedColumns.length} columns, anonymized ${anonymizedColumns.length} columns`,
                excludedColumns,
                anonymizedColumns,
                appliedBy: 'apply_pii_exclusions_tool',
                removeResult: removeResult.result,
                redactResult: redactResult.result
            });
        }

        // Single operation: either remove or redact
        const columnsToProcess = excludedColumns.length > 0 ? excludedColumns : anonymizedColumns;
        const strategy = excludedColumns.length > 0 ? 'remove' : 'redact';

        const toolResult = await executeTool('apply_pii_exclusions', 'data_engineer', {
            projectId,
            excludedColumns: columnsToProcess,
            maskingStrategy: strategy,
            persistDecision: true,
            userConfirmed: true // API call implies user has confirmed via UI
        }, {
            userId,
            projectId
        });

        if (toolResult.status === 'error') {
            console.error('🔒 [PII Exclusion] Tool execution failed:', toolResult.error);
            throw new Error(toolResult.error || 'Failed to apply PII exclusions');
        }

        const exclusionResult = toolResult.result;

        // FIX: Add user-visible checkpoint for PII handling
        try {
            await projectAgentOrchestrator.addCheckpoint(projectId, {
                id: `checkpoint_de_pii_${Date.now()}`,
                projectId: projectId,
                agentType: 'data_engineer',
                stepName: 'de_pii_applied',
                status: 'completed',
                message: `Privacy protection applied: ${columnsToProcess.length} column(s) ${strategy === 'remove' ? 'removed' : 'anonymized'}`,
                data: {
                    strategy,
                    columnsProcessed: columnsToProcess,
                    processedCount: columnsToProcess.length
                },
                userFeedback: undefined,
                requiresUserInput: false,
                userVisible: true,
                timestamp: new Date()
            });
        } catch (checkpointErr) {
            console.warn('⚠️ Failed to add PII checkpoint:', checkpointErr);
        }

        res.json({
            success: true,
            message: `${strategy === 'remove' ? 'Removed' : 'Anonymized'} ${columnsToProcess.length} columns`,
            excludedColumns: strategy === 'remove' ? columnsToProcess : [],
            anonymizedColumns: strategy === 'redact' ? columnsToProcess : [],
            appliedBy: 'apply_pii_exclusions_tool', // Indicates tool was used
            processedDatasets: exclusionResult.processedDatasets,
            appliedAt: exclusionResult.appliedAt
        });

    } catch (error: any) {
        console.error('❌ [PII Exclusion] Error:', error);
        console.error('❌ [PII Exclusion] Stack:', error.stack);
        console.error('❌ [PII Exclusion] Request body:', req.body);
        console.error('❌ [PII Exclusion] Project ID:', req.params.id);
        
        // More specific error handling
        let statusCode = 500;
        let errorMessage = error.message || "Failed to apply PII exclusions";
        
        if (error.message?.includes('No datasets found')) {
            statusCode = 404;
            errorMessage = "No datasets found for this project. Please upload data first.";
        } else if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
            statusCode = 404;
            errorMessage = "Project or dataset not found";
        } else if (error.message?.includes('Access denied') || error.message?.includes('Permission')) {
            statusCode = 403;
            errorMessage = "Access denied";
        }
        
        res.status(statusCode).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
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

        // Analyze goals and questions to determine best template
        const goalText = userGoals.join(' ').toLowerCase();
        const questionText = userQuestions.join(' ').toLowerCase();
        const combinedText = `${goalText} ${questionText}`;

        // Template matching logic
        let template = null;
        let confidence = 0.7;
        let marketDemand = 'moderate';
        let implementationComplexity = 'medium';

        // Pattern matching for common analysis types
        if (combinedText.includes('employee') || combinedText.includes('engagement') || combinedText.includes('satisfaction') || combinedText.includes('hr')) {
            template = {
                id: 'hr_analytics',
                name: 'HR & Employee Analytics',
                description: 'Analyze employee engagement, satisfaction, and workforce metrics',
                recommendedAnalyses: ['descriptive', 'correlation', 'segmentation', 'trend_analysis'],
                requiredDataElements: ['employee_id', 'department', 'satisfaction_score', 'tenure', 'performance_rating']
            };
            confidence = 0.85;
            marketDemand = 'high';
        } else if (combinedText.includes('sales') || combinedText.includes('revenue') || combinedText.includes('customer')) {
            template = {
                id: 'sales_analytics',
                name: 'Sales & Revenue Analytics',
                description: 'Analyze sales performance, customer behavior, and revenue trends',
                recommendedAnalyses: ['descriptive', 'time_series', 'predictive', 'segmentation'],
                requiredDataElements: ['customer_id', 'transaction_date', 'amount', 'product', 'region']
            };
            confidence = 0.82;
            marketDemand = 'very_high';
        } else if (combinedText.includes('marketing') || combinedText.includes('campaign') || combinedText.includes('conversion')) {
            template = {
                id: 'marketing_analytics',
                name: 'Marketing Campaign Analytics',
                description: 'Analyze marketing effectiveness, campaign ROI, and conversion rates',
                recommendedAnalyses: ['descriptive', 'attribution', 'ab_testing', 'funnel_analysis'],
                requiredDataElements: ['campaign_id', 'channel', 'spend', 'impressions', 'conversions']
            };
            confidence = 0.80;
            marketDemand = 'high';
        } else if (combinedText.includes('financial') || combinedText.includes('budget') || combinedText.includes('cost')) {
            template = {
                id: 'financial_analytics',
                name: 'Financial Analysis',
                description: 'Analyze financial metrics, budgets, and cost optimization',
                recommendedAnalyses: ['descriptive', 'variance_analysis', 'forecasting', 'trend_analysis'],
                requiredDataElements: ['account', 'period', 'budget', 'actual', 'variance']
            };
            confidence = 0.78;
            marketDemand = 'moderate';
        } else {
            // Generic template
            template = {
                id: 'general_analytics',
                name: 'General Data Analytics',
                description: 'Flexible analysis template for diverse data types',
                recommendedAnalyses: ['descriptive', 'correlation', 'distribution_analysis'],
                requiredDataElements: []
            };
            confidence = 0.65;
            implementationComplexity = 'low';
        }

        // Store recommendation in project
        // CRITICAL FIX: Parse journeyProgress before spreading to preserve joinedData and other fields
        const project = await storage.getProject(projectId);
        const existingProgress = parseJourneyProgress((project as any)?.journeyProgress);
        await storage.updateProject(projectId, {
            journeyProgress: {
                ...existingProgress,
                researcherRecommendation: {
                    template,
                    confidence,
                    marketDemand,
                    implementationComplexity,
                    recommendedAt: new Date().toISOString()
                }
            }
        } as any);

        console.log(`✅ [R1 FIX] Recommended template: ${template?.name} (confidence: ${confidence})`);

        res.json({
            success: true,
            template,
            confidence,
            marketDemand,
            implementationComplexity,
            alternativeTemplates: [] // Could expand this later
        });

    } catch (error: any) {
        console.error('❌ [R1 FIX] Recommend templates error:', error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to recommend templates"
        });
    }
});
