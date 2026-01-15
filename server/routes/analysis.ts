// server/routes/analysis.ts
import { Router } from 'express';
import { ensureAuthenticated } from './auth';
import { storage } from '../services/storage';
import { SparkProcessor } from '../services/spark-processor';
import { DataTransformationService } from '../services';

const router = Router();

const sparkProcessor = new SparkProcessor();

/**
 * @summary Endpoint to apply data transformations to a project's dataset.
 * @description This can be orchestrated by an agent or triggered directly by a user.
 * It retrieves the dataset associated with the project and applies a series of transformations.
 * @route POST /api/analysis/:projectId/transform
 * @auth Required (`ensureAuthenticated` middleware).
 * @input
 * - `req.params.projectId`: The ID of the project to transform.
 * - `req.body.transformations`: An array of transformation objects.
 * - `req.user`: Attached by the authentication middleware.
 * @process
 * 1. Verifies user authentication and project ownership.
 * 2. Fetches the dataset linked to the project using `storage.getDatasetForProject`.
 * 3. If the dataset is large, it uses `SparkProcessor`; otherwise, it uses `DataTransformationService`.
 * 4. Applies the transformations to the data.
 * 5. Returns a preview of the transformed data.
 * @output
 * - Success: 200 { success: true, message: string, preview: any[], rowCount: number }
 * - Error: 400, 404, or 500 with an error message.
 * @dependencies `storage`, `SparkProcessor`, `DataTransformationService`.
 */
router.post('/:projectId/transform', ensureAuthenticated, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { transformations } = req.body;
        const userId = (req.user as any)?.id;

        if (!transformations || !Array.isArray(transformations)) {
            return res.status(400).json({ error: 'A "transformations" array is required.' });
        }

        const project = await storage.getProject(projectId);
        const owner = (project as any)?.ownerId ?? (project as any)?.userId;
        if (!project || owner !== userId) {
            return res.status(404).json({ error: 'Project not found or access denied.' });
        }

        const dataset = await storage.getDatasetForProject(projectId);
        const sourceRows = extractRowsForTransformation(dataset, project);

        if (sourceRows.length === 0) {
            return res.status(400).json({ error: 'Project has no data to transform.' });
        }

        const originalSchema = dataset?.schema ?? (project as any)?.schema;
        const baseWarnings: string[] = [];

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

        const sanitizedSteps = transformations.map((step) => {
            if (!step || typeof step !== 'object') {
                baseWarnings.push('Skipped invalid transformation step.');
                return null;
            }

            const normalizedType = typeof step.type === 'string' ? step.type : null;
            if (!normalizedType) {
                baseWarnings.push('Skipped transformation without a type.');
                return null;
            }

            const normalizedConfig = step.config && typeof step.config === 'object' ? { ...step.config } : {};
            return { type: normalizedType, config: normalizedConfig };
        }).filter(Boolean) as Array<{ type: string; config: Record<string, any> }>;

        const hasJoinStep = sanitizedSteps.some(step => step.type === 'join');
        const useSpark = sourceRows.length > 1000 && !hasJoinStep;

        let transformationResult;

        if (useSpark) {
            const sparkRows = await sparkProcessor.applyTransformations(sourceRows, sanitizedSteps);
            const rowsArray = Array.isArray(sparkRows) ? sparkRows : [];
            const warningsSet = new Set<string>(baseWarnings);

            if (!Array.isArray(sparkRows)) {
                warningsSet.add('Spark processor returned an unexpected result.');
            }

            let operations;
            const sampleRows = sourceRows.slice(0, Math.min(sourceRows.length, 1000));
            if (sampleRows.length > 0) {
                try {
                    const sampleResult = await DataTransformationService.applyTransformations(
                        sampleRows,
                        sanitizedSteps,
                        {
                            originalSchema,
                            warnings: baseWarnings,
                            joinResolver,
                        },
                    );

                    for (const warning of sampleResult.warnings) {
                        warningsSet.add(warning);
                    }
                    operations = sampleResult.summary.operations;
                } catch (sampleError) {
                    const message = sampleError instanceof Error ? sampleError.message : 'Failed to build transformation summary.';
                    warningsSet.add(`Summary limited: ${message}`);
                }
            }

            transformationResult = DataTransformationService.buildResponse(rowsArray, {
                originalRowCount: sourceRows.length,
                originalSchema,
                warnings: Array.from(warningsSet),
                operations,
            });
        } else {
            transformationResult = await DataTransformationService.applyTransformations(
                sourceRows,
                sanitizedSteps,
                {
                    originalSchema,
                    warnings: baseWarnings,
                    joinResolver,
                },
            );
        }

        res.json({
            success: true,
            message: 'Transformations applied successfully.',
            preview: transformationResult.preview,
            rowCount: transformationResult.rowCount,
            originalRowCount: transformationResult.originalRowCount,
            columns: transformationResult.columns,
            warnings: transformationResult.warnings,
            summary: transformationResult.summary,
        });

    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Suggest analysis scenarios based on a plain-English question, schema, goals, and data context.
 * Classifies whether the question matches known internal presets or appears to be a new type
 * that may require external knowledge/sources. Returns suggested analyses to run.
 */
router.post('/suggest-scenarios', ensureAuthenticated, async (req, res) => {
    try {
        const { question, schema, goals, previousQuestions, dataContext } = req.body || {};
        if (!question || typeof question !== 'string') {
            return res.status(400).json({ error: 'A plain-English "question" string is required.' });
        }

        const q = String(question).toLowerCase();

        // Extract context from goals and data
        const goalContext = goals && Array.isArray(goals) && goals.length > 0 ? goals.join(' ').toLowerCase() : '';
        const columnNames = dataContext?.columnNames || (schema ? Object.keys(schema) : []);
        const hasTimeSeries = dataContext?.hasTimeSeries ||
            columnNames.some((col: string) => /date|time|timestamp|year|month|day/.test(col.toLowerCase()));

        // Combine question with goal context for better matching
        const combinedContext = `${q} ${goalContext}`.toLowerCase();

        // Simple keyword signals - now using combinedContext for better matching
        const hasTime = /(over time|trend|weekly|monthly|quarter|year|time series|timeline)/.test(combinedContext);
        const hasEffect = /(impact|effect|increase|decrease|lift|change)/.test(combinedContext);
        const hasPrice = /(price|pricing|plan|tier|discount)/.test(combinedContext);
        const hasChurn = /(churn|cancel|attrition|turnover|leave|departure)/.test(combinedContext);
        const hasCampaign = /(campaign|marketing|ads?|promotion|promo)/.test(combinedContext);
        const hasSla = /(sla|breach|uptime|downtime|latency|ticket|ops|operations?)/.test(combinedContext);
        const hasPredict = /(predict|likely|probability|classify)/.test(combinedContext);
        const hasRel = /(relationship|correlat|associate|link)/.test(combinedContext);

        // Map to internal presets
        const internalMatches: Array<{ id: string; title: string; description: string; analyses: string[] }>= [];
        if (hasCampaign || (/sales|revenue|conversion/.test(combinedContext) && hasEffect)) {
            internalMatches.push({ id: 'campaign-effectiveness', title: 'Marketing campaign effectiveness', description: 'Determine if a recent campaign drove sales lift', analyses: ['descriptive','time-series','regression'] });
        }
        if ((hasPrice || /pricing/.test(combinedContext)) && (hasChurn || hasEffect)) {
            internalMatches.push({ id: 'pricing-churn', title: 'Pricing change effect on churn', description: 'Assess if pricing changes impacted customer churn', analyses: ['descriptive','correlation','classification','regression'] });
        }
        if ((/policy|remote work|policy change/.test(combinedContext)) && (hasChurn || /attrition|hr|employee|people/.test(combinedContext))) {
            internalMatches.push({ id: 'policy-attrition', title: 'Policy impact on employee attrition', description: 'Check if a policy change increased employee departures', analyses: ['descriptive','correlation','regression','time-series'] });
        }
        if (hasSla || /operations|operational/.test(combinedContext)) {
            internalMatches.push({ id: 'operations-sla', title: 'Operational changes and SLA breaches', description: 'See if schedule changes affected SLA breaches', analyses: ['descriptive','correlation','time-series'] });
        }
        if (hasPredict) {
            internalMatches.push({ id: 'predictive-risk', title: 'Predictive risk/classification', description: 'Predict outcomes and identify key drivers', analyses: ['classification','feature_importance','regression'] });
        }
        if (hasRel) {
            internalMatches.push({ id: 'correlation-study', title: 'Correlation and relationships', description: 'Understand relationships between variables', analyses: ['descriptive','correlation'] });
        }

        // If we found recognizable patterns, treat as internal
        if (internalMatches.length > 0) {
            return res.json({ source: 'internal', scenarios: internalMatches });
        }

        // Otherwise, classify as external/new type; provide context-aware defaults
        const defaults = (hasTime || hasTimeSeries)
            ? ['descriptive','time-series','regression']
            : ['descriptive','correlation','regression'];

        return res.json({
            source: 'external',
            scenarios: [{ id: 'general-question', title: 'General analysis', description: `Analyze your data${columnNames.length > 0 ? ` (${columnNames.length} columns)` : ''} to answer this question`, analyses: defaults }]
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

function extractRowsForTransformation(dataset: any, project: any): any[] {
    const datasetData = Array.isArray(dataset?.data) ? dataset.data : undefined;
    if (datasetData && datasetData.length > 0) {
        return datasetData;
    }

    const transformedData = Array.isArray(project?.transformedData) ? project.transformedData : undefined;
    if (transformedData && transformedData.length > 0) {
        return transformedData;
    }

    const datasetPreview = Array.isArray(dataset?.preview) ? dataset.preview : undefined;
    if (datasetPreview && datasetPreview.length > 0) {
        return datasetPreview;
    }

    const projectData = Array.isArray(project?.data) ? project.data : undefined;
    if (projectData && projectData.length > 0) {
        return projectData;
    }

    const datasetSample = Array.isArray(dataset?.sampleData) ? dataset.sampleData : undefined;
    if (datasetSample && datasetSample.length > 0) {
        return datasetSample;
    }

    const projectSample = Array.isArray(project?.sampleData) ? project.sampleData : undefined;
    if (projectSample && projectSample.length > 0) {
        return projectSample;
    }

    return [];
}

export default router;
