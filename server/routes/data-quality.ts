import { Router } from 'express';
import { db } from '../db';
import { datasets, projects, projectDatasets, agentCheckpoints } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { PythonProcessor } from '../services/python-processor';
import { ensureAuthenticated } from './auth';
import { canAccessProject } from '../middleware/ownership';
import { nanoid } from 'nanoid';
import * as path from 'path';

const router = Router();

/**
 * [DAY 7] DE Agent Quality Validation
 * Routes quality validation through DE agent before user can approve
 */
router.post('/data-quality/:projectId/validate-via-agent', ensureAuthenticated, async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = (req.user as any)?.id;
        const isAdmin = (req.user as any)?.isAdmin || false;

        // Ownership check
        const access = await canAccessProject(userId, projectId, isAdmin);
        if (!access.allowed) {
            return res.status(403).json({ success: false, error: access.reason });
        }

        const project = access.project;
        console.log(`🔍 [DE Agent Quality] Validating quality for project ${projectId}`);

        // Get datasets for this project through projectDatasets join table
        const projectDatasetsJoin = await db.select({ dataset: datasets })
            .from(projectDatasets)
            .innerJoin(datasets, eq(projectDatasets.datasetId, datasets.id))
            .where(eq(projectDatasets.projectId, projectId));
        const datasetsForProject = projectDatasetsJoin.map((r: any) => r.dataset);
        if (datasetsForProject.length === 0) {
            return res.status(400).json({ success: false, error: 'No datasets found for project' });
        }

        // Run quality analysis through Python processor (DE agent tool)
        const qualityResults: any[] = [];
        const warnings: string[] = [];
        const recommendations: string[] = [];
        let overallScore = 0;

        for (const dataset of datasetsForProject) {
            try {
                const result = await PythonProcessor.processData({
                    projectId: dataset.id,
                    operation: 'data_quality_analysis',
                    data: { dataset: { data: [], schema: {} } },
                    config: { data_path: dataset.filePath, analysis_type: 'quality' }
                });

                if (result.success && result.data) {
                    const data = result.data;
                    const completeness = calculateCompleteness(data);
                    const consistency = calculateConsistency(data);
                    const accuracy = calculateAccuracy(data);
                    const score = Math.round((completeness + consistency + accuracy) / 3);

                    qualityResults.push({
                        datasetId: dataset.id,
                        datasetName: dataset.name,
                        scores: { completeness, consistency, accuracy, overall: score },
                        metrics: {
                            totalRows: data.total_rows || 0,
                            totalColumns: data.total_columns || 0,
                            missingValues: data.missing_values || 0,
                            duplicateRows: data.duplicate_rows || 0
                        }
                    });
                    overallScore += score;

                    // Generate warnings based on quality
                    if (completeness < 80) {
                        warnings.push(`${dataset.name}: High missing value rate (${100 - completeness}%)`);
                    }
                    if (consistency < 80) {
                        warnings.push(`${dataset.name}: Data type inconsistencies detected`);
                    }
                    if (data.duplicate_rows > 0) {
                        warnings.push(`${dataset.name}: ${data.duplicate_rows} duplicate rows found`);
                    }
                }
            } catch (err: any) {
                console.warn(`Quality analysis failed for dataset ${dataset.id}:`, err.message);
                qualityResults.push({
                    datasetId: dataset.id,
                    datasetName: dataset.name,
                    scores: { completeness: 0, consistency: 0, accuracy: 0, overall: 0 },
                    error: err.message
                });
            }
        }

        // Calculate overall project quality score
        overallScore = qualityResults.length > 0
            ? Math.round(overallScore / qualityResults.length)
            : 0;

        // Generate DE agent recommendations
        if (overallScore < 70) {
            recommendations.push('Data quality is below acceptable threshold. Consider applying auto-fix for common issues.');
        }
        if (warnings.length > 3) {
            recommendations.push('Multiple quality issues detected. Review each dataset individually before proceeding.');
        }
        if (warnings.length === 0 && overallScore >= 80) {
            recommendations.push('Data quality meets standards. Recommended to proceed with transformation.');
        }

        // Create checkpoint for quality validation
        const checkpointId = nanoid();
        await db.insert(agentCheckpoints).values({
            id: checkpointId,
            projectId,
            stepName: 'quality_validation',
            agentType: 'data_engineer',
            status: overallScore >= 60 ? 'pending' : 'requires_attention',
            message: `DE Agent Quality Assessment: Score ${overallScore}% across ${datasetsForProject.length} dataset(s)`,
            data: {
                qualityResults,
                warnings,
                recommendations,
                overallScore,
                timestamp: new Date().toISOString()
            }
        });

        console.log(`✅ [DE Agent Quality] Validation complete. Score: ${overallScore}%, Warnings: ${warnings.length}`);

        res.json({
            success: true,
            validation: {
                isValid: overallScore >= 60,
                overallScore,
                qualityResults,
                warnings,
                recommendations,
                checkpointId
            }
        });
    } catch (error: any) {
        console.error('[DE Agent Quality] Validation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * [DAY 7] DE Agent Schema Validation
 * Routes schema validation through DE agent before user can approve
 */
router.post('/data-quality/:projectId/validate-schema-via-agent', ensureAuthenticated, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { proposedSchema, datasetId } = req.body;
        const userId = (req.user as any)?.id;
        const isAdmin = (req.user as any)?.isAdmin || false;

        // Ownership check
        const access = await canAccessProject(userId, projectId, isAdmin);
        if (!access.allowed) {
            return res.status(403).json({ success: false, error: access.reason });
        }

        console.log(`🔍 [DE Agent Schema] Validating schema for project ${projectId}`);

        // Get project to check for joined/transformed schema
        const project = access.project as any;
        const journeyProgress = project.journeyProgress || {};

        // Get datasets through projectDatasets join table
        const projectDatasetsJoin = await db.select({ dataset: datasets })
            .from(projectDatasets)
            .innerJoin(datasets, eq(projectDatasets.datasetId, datasets.id))
            .where(eq(projectDatasets.projectId, projectId));
        let datasetsForSchema = projectDatasetsJoin.map((r: any) => r.dataset);
        if (datasetId) {
            datasetsForSchema = datasetsForSchema.filter((d: any) => d.id === datasetId);
        }

        if (datasetsForSchema.length === 0) {
            return res.status(400).json({ success: false, error: 'No datasets found' });
        }

        const warnings: string[] = [];
        const errors: string[] = [];
        const recommendations: string[] = [];
        const schemaIssues: any[] = [];

        // FIX: Build a COMBINED schema from ALL datasets AND joined/transformed schema
        // This prevents "column doesn't exist" errors when validating joined columns
        const combinedSchema: Record<string, any> = {};
        const combinedPreviewColumns = new Set<string>();

        // PRIORITY 1: Include joined/transformed schema columns (these have prefixed names)
        const joinedSchema = journeyProgress.joinedData?.schema ||
                             journeyProgress.transformedSchema ||
                             journeyProgress.dataTransformation?.transformedSchema;

        if (joinedSchema) {
            console.log(`📊 [DE Agent Schema] Found joined schema with ${Object.keys(joinedSchema).length} columns`);
            for (const [col, type] of Object.entries(joinedSchema)) {
                combinedSchema[col] = type;
                combinedPreviewColumns.add(col);
            }
        }

        // PRIORITY 2: Include columns from dataset ingestionMetadata.transformedSchema
        for (const dataset of datasetsForSchema) {
            const ds = dataset as any;
            const transformedSchema = ds.ingestionMetadata?.transformedSchema || ds.metadata?.transformedSchema;
            if (transformedSchema) {
                for (const [col, type] of Object.entries(transformedSchema)) {
                    if (!combinedSchema[col]) {
                        combinedSchema[col] = type;
                        combinedPreviewColumns.add(col);
                    }
                }
            }
        }

        // PRIORITY 3: Original dataset schemas
        for (const dataset of datasetsForSchema) {
            const ds = dataset as any;
            const dsSchema = ds.schema || {};
            const dsPreview = ds.preview || [];

            // Merge schema columns
            for (const [col, type] of Object.entries(dsSchema)) {
                if (!combinedSchema[col]) {
                    combinedSchema[col] = type;
                }
            }

            // Track columns that appear in preview data
            for (const row of dsPreview) {
                for (const col of Object.keys(row || {})) {
                    combinedPreviewColumns.add(col);
                }
            }
        }

        console.log(`📊 [DE Agent Schema] Combined schema has ${Object.keys(combinedSchema).length} columns (joined: ${Object.keys(joinedSchema || {}).length}, datasets: ${datasetsForSchema.length})`);

        // Validate proposedSchema against COMBINED schema (not individual datasets)
        if (proposedSchema) {
            for (const [column, proposedType] of Object.entries(proposedSchema)) {
                const currentType = combinedSchema[column];

                // Check if column exists in ANY dataset
                if (!currentType && !combinedPreviewColumns.has(column)) {
                    errors.push(`Column '${column}' does not exist in any dataset`);
                }

                // Validate type conversion is possible
                if (currentType && proposedType !== currentType) {
                    // Use the first dataset's preview for validation (simplified)
                    const firstPreview = (datasetsForSchema[0] as any)?.preview || [];
                    const conversionValid = validateTypeConversion(currentType as string, proposedType as string, firstPreview, column);
                    if (!conversionValid) {
                        warnings.push(`Type conversion from ${currentType} to ${proposedType} may lose data for column '${column}'`);
                    }
                }
            }
        }

        // Per-dataset checks for schema consistency issues
        for (const dataset of datasetsForSchema) {
            const currentSchema = (dataset as any).schema || {};
            const metadata = (dataset.metadata as any) || {};
            const preview = (dataset as any).preview || [];

            // Check for schema consistency issues
            const detectedTypes = inferSchemaFromPreview(preview);
            for (const [column, detectedType] of Object.entries(detectedTypes)) {
                const declaredType = currentSchema[column];
                if (declaredType && declaredType !== detectedType) {
                    schemaIssues.push({
                        datasetId: dataset.id,
                        column,
                        declaredType,
                        detectedType,
                        severity: 'warning'
                    });
                }
            }

            // Check for recommended date/datetime columns
            for (const column of Object.keys(currentSchema)) {
                if (column.toLowerCase().includes('date') || column.toLowerCase().includes('time')) {
                    if (currentSchema[column] !== 'datetime' && currentSchema[column] !== 'date') {
                        recommendations.push(`Column '${column}' appears to be a date field. Consider using datetime type.`);
                    }
                }
            }
        }

        // Create checkpoint for schema validation
        const checkpointId = nanoid();
        const isValid = errors.length === 0;

        await db.insert(agentCheckpoints).values({
            id: checkpointId,
            projectId,
            stepName: 'schema_validation',
            agentType: 'data_engineer',
            status: isValid ? 'pending' : 'requires_attention',
            message: `DE Agent Schema Assessment: ${isValid ? 'Valid' : `${errors.length} error(s) found`}`,
            data: {
                errors,
                warnings,
                recommendations,
                schemaIssues,
                timestamp: new Date().toISOString()
            }
        });

        console.log(`✅ [DE Agent Schema] Validation complete. Valid: ${isValid}, Warnings: ${warnings.length}`);

        res.json({
            success: true,
            validation: {
                isValid,
                errors,
                warnings,
                recommendations,
                schemaIssues,
                checkpointId
            }
        });
    } catch (error: any) {
        console.error('[DE Agent Schema] Validation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * [DAY 7] Approve quality checkpoint
 */
router.post('/data-quality/:projectId/approve-quality', ensureAuthenticated, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { checkpointId, feedback } = req.body;
        const userId = (req.user as any)?.id;
        const isAdmin = (req.user as any)?.isAdmin || false;

        const access = await canAccessProject(userId, projectId, isAdmin);
        if (!access.allowed) {
            return res.status(403).json({ success: false, error: access.reason });
        }

        // Update checkpoint status
        if (checkpointId) {
            const existingCheckpoint = await db.select().from(agentCheckpoints).where(eq(agentCheckpoints.id, checkpointId));
            const existingData = (existingCheckpoint[0]?.data as any) || {};
            await db.update(agentCheckpoints)
                .set({
                    status: 'approved',
                    userFeedback: feedback,
                    data: {
                        ...existingData,
                        approvedBy: userId,
                        approvedAt: new Date().toISOString()
                    }
                })
                .where(eq(agentCheckpoints.id, checkpointId));
        }

        // Update project journeyProgress
        const project = access.project;
        const currentProgress = (project as any).journeyProgress || {};

        await db.update(projects)
            .set({
                journeyProgress: JSON.stringify({
                    ...currentProgress,
                    dataQualityApproved: true,
                    dataQualityApprovedAt: new Date().toISOString(),
                    dataQualityApprovedBy: userId
                })
            })
            .where(eq(projects.id, projectId));

        console.log(`✅ [Quality Approval] Project ${projectId} quality approved by user ${userId}`);

        res.json({ success: true, message: 'Data quality approved' });
    } catch (error: any) {
        console.error('[Quality Approval] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * [DAY 7] Approve schema checkpoint
 */
router.post('/data-quality/:projectId/approve-schema', ensureAuthenticated, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { checkpointId, confirmedSchema, feedback } = req.body;
        const userId = (req.user as any)?.id;
        const isAdmin = (req.user as any)?.isAdmin || false;

        const access = await canAccessProject(userId, projectId, isAdmin);
        if (!access.allowed) {
            return res.status(403).json({ success: false, error: access.reason });
        }

        // Update checkpoint status
        if (checkpointId) {
            const existingCheckpoint = await db.select().from(agentCheckpoints).where(eq(agentCheckpoints.id, checkpointId));
            const existingData = (existingCheckpoint[0]?.data as any) || {};
            await db.update(agentCheckpoints)
                .set({
                    status: 'approved',
                    userFeedback: feedback,
                    data: {
                        ...existingData,
                        confirmedSchema,
                        approvedBy: userId,
                        approvedAt: new Date().toISOString()
                    }
                })
                .where(eq(agentCheckpoints.id, checkpointId));
        }

        // Update project journeyProgress
        const project = access.project;
        const currentProgress = (project as any).journeyProgress || {};

        await db.update(projects)
            .set({
                journeyProgress: JSON.stringify({
                    ...currentProgress,
                    schemaValidated: true,
                    schemaValidatedAt: new Date().toISOString(),
                    schemaValidatedBy: userId,
                    confirmedSchema
                })
            })
            .where(eq(projects.id, projectId));

        console.log(`✅ [Schema Approval] Project ${projectId} schema approved by user ${userId}`);

        res.json({ success: true, message: 'Schema validation approved' });
    } catch (error: any) {
        console.error('[Schema Approval] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Helper function to validate type conversion
function validateTypeConversion(fromType: string, toType: string, preview: any[], column: string): boolean {
    if (toType === 'string') return true; // Anything can be string

    const sampleValues = preview.slice(0, 100).map(row => row[column]).filter(v => v != null);

    if (toType === 'number' || toType === 'integer' || toType === 'float') {
        return sampleValues.every(v => !isNaN(Number(v)));
    }

    if (toType === 'datetime' || toType === 'date') {
        return sampleValues.every(v => !isNaN(Date.parse(String(v))));
    }

    if (toType === 'boolean') {
        const boolValues = ['true', 'false', '1', '0', 'yes', 'no'];
        return sampleValues.every(v => boolValues.includes(String(v).toLowerCase()));
    }

    return true;
}

// Helper function to infer schema from preview data
function inferSchemaFromPreview(preview: any[]): Record<string, string> {
    if (!preview || preview.length === 0) return {};

    const schema: Record<string, string> = {};
    const columns = Object.keys(preview[0] || {});

    for (const column of columns) {
        const values = preview.slice(0, 100).map(row => row[column]).filter(v => v != null);
        if (values.length === 0) {
            schema[column] = 'string';
            continue;
        }

        // Check if all values are numbers
        if (values.every(v => !isNaN(Number(v)))) {
            schema[column] = values.every(v => Number.isInteger(Number(v))) ? 'integer' : 'float';
        }
        // Check if values look like dates
        else if (values.every(v => !isNaN(Date.parse(String(v))))) {
            schema[column] = 'datetime';
        }
        // Check for booleans
        else if (values.every(v => ['true', 'false', '1', '0', 'yes', 'no'].includes(String(v).toLowerCase()))) {
            schema[column] = 'boolean';
        }
        else {
            schema[column] = 'string';
        }
    }

    return schema;
}

router.post('/data-quality/analyze', async (req, res) => {
    try {
        const { datasetId } = req.body;

        if (!datasetId) {
            return res.status(400).json({ error: 'datasetId is required' });
        }

        const [dataset] = await db.select().from(datasets).where(eq(datasets.id, datasetId));

        if (!dataset) {
            return res.status(404).json({ error: 'Dataset not found' });
        }

        const result = await PythonProcessor.processData({
            projectId: datasetId,
            operation: 'data_quality_analysis',
            data: { dataset: { data: [], schema: {} } },
            config: { data_path: dataset.filePath, analysis_type: 'quality' }
        });

        if (!result.success) {
            return res.status(500).json({ error: result.error || 'Quality analysis failed' });
        }

        const qualityData = result.data || {};
        const completeness = calculateCompleteness(qualityData);
        const consistency = calculateConsistency(qualityData);
        const accuracy = calculateAccuracy(qualityData);
        const issues = generateQualityIssues(qualityData);

        const response = {
            scores: {
                overall: Math.round((completeness + consistency + accuracy) / 3),
                completeness,
                consistency,
                accuracy
            },
            qualityIssues: issues,
            detailedMetrics: {
                totalRows: qualityData.total_rows || 0,
                totalColumns: qualityData.total_columns || 0,
                missingValues: qualityData.missing_values || 0,
                duplicateRows: qualityData.duplicate_rows || 0,
                numericalColumns: qualityData.numerical_columns || 0,
                categoricalColumns: qualityData.categorical_columns || 0
            },
            timestamp: new Date().toISOString()
        };

        res.json(response);
    } catch (error: any) {
        console.error('Data quality analysis error:', error);
        res.status(500).json({ error: error.message || 'Quality analysis failed' });
    }
});

router.post('/data-quality/auto-fix', async (req, res) => {
    try {
        const { datasetId, issueIds } = req.body;

        if (!datasetId || !Array.isArray(issueIds)) {
            return res.status(400).json({ error: 'datasetId and issueIds array are required' });
        }

        const [dataset] = await db.select().from(datasets).where(eq(datasets.id, datasetId));

        if (!dataset) {
            return res.status(404).json({ error: 'Dataset not found' });
        }

        const result = await PythonProcessor.processData({
            projectId: datasetId,
            operation: 'data_quality_fix',
            data: { dataset: { data: [], schema: {} } },
            config: {
                data_path: dataset.filePath,
                operations: issueIds.map((id: string) => getFixOperation(id))
            }
        });

        if (!result.success) {
            return res.status(500).json({ error: result.error || 'Auto-fix failed' });
        }

        res.json({
            success: true,
            fixedIssues: issueIds.length,
            message: `Successfully fixed ${issueIds.length} data quality issues`
        });
    } catch (error: any) {
        console.error('Auto-fix error:', error);
        res.status(500).json({ error: error.message || 'Auto-fix failed' });
    }
});

function calculateCompleteness(data: any): number {
    const totalCells = (data.total_rows || 0) * (data.total_columns || 0);
    if (totalCells === 0) return 100;
    const missingCells = data.missing_values || 0;
    return Math.round(((totalCells - missingCells) / totalCells) * 100);
}

function calculateConsistency(data: any): number {
    let score = 100;
    if (data.type_inconsistencies) score -= Math.min(data.type_inconsistencies * 5, 30);
    if (data.format_inconsistencies) score -= Math.min(data.format_inconsistencies * 3, 20);
    return Math.max(score, 0);
}

function calculateAccuracy(data: any): number {
    let score = 100;
    if (data.outliers) {
        const outlierPercent = (data.outliers / data.total_rows) * 100;
        score -= Math.min(outlierPercent * 2, 30);
    }
    if (data.invalid_values) {
        const invalidPercent = (data.invalid_values / (data.total_rows * data.total_columns)) * 100;
        score -= Math.min(invalidPercent * 5, 40);
    }
    return Math.max(Math.round(score), 0);
}

function generateQualityIssues(data: any): any[] {
    const issues = [];

    if (data.missing_values > 0) {
        const missingPercent = (data.missing_values / (data.total_rows * data.total_columns)) * 100;
        issues.push({
            id: 'missing_values',
            severity: missingPercent > 10 ? 'high' : missingPercent > 5 ? 'medium' : 'low',
            description: `${data.missing_values.toLocaleString()} missing values found (${missingPercent.toFixed(1)}%)`,
            suggestion: 'Consider imputing with mean/median for numerical columns or mode for categorical columns',
            autoFixable: true
        });
    }

    if (data.duplicate_rows > 0) {
        issues.push({
            id: 'duplicate_rows',
            severity: data.duplicate_rows > 100 ? 'high' : 'medium',
            description: `${data.duplicate_rows.toLocaleString()} duplicate rows detected`,
            suggestion: 'Remove duplicate rows to improve data quality',
            autoFixable: true
        });
    }

    if (data.outliers > 0) {
        issues.push({
            id: 'outliers',
            severity: 'medium',
            description: `${data.outliers} potential outliers detected`,
            suggestion: 'Review outliers - they may be errors or valid extreme values',
            autoFixable: false
        });
    }

    if (data.type_inconsistencies > 0) {
        issues.push({
            id: 'type_inconsistencies',
            severity: 'high',
            description: `${data.type_inconsistencies} columns have inconsistent data types`,
            suggestion: 'Standardize data types for consistent processing',
            autoFixable: true
        });
    }

    return issues;
}

function getFixOperation(issueId: string): string {
    const operations: Record<string, string> = {
        missing_values: 'impute_missing',
        duplicate_rows: 'remove_duplicates',
        type_inconsistencies: 'standardize_types'
    };
    return operations[issueId] || 'unknown';
}

export default router;
