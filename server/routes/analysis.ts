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
        if (!dataset || !dataset.data) {
            return res.status(400).json({ error: 'Project has no data to transform.' });
        }

        const dataRows = (dataset.data as any[]) || [];

        // Use Spark for large datasets
        const transformedData = dataRows.length > 1000 
            ? await sparkProcessor.applyTransformations(dataRows, transformations)
            : await DataTransformationService.applyTransformations(dataRows, transformations);

        // Here, we could either save the transformed data back to the project
        // or return it directly. For now, let's return a preview.
        const preview = transformedData.slice(0, 100);

        res.json({
            success: true,
            message: 'Transformations applied successfully.',
            preview,
            rowCount: transformedData.length
        });

    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Suggest analysis scenarios based on a plain-English question and optional schema context.
 * Classifies whether the question matches known internal presets or appears to be a new type
 * that may require external knowledge/sources. Returns suggested analyses to run.
 */
router.post('/suggest-scenarios', ensureAuthenticated, async (req, res) => {
    try {
        const { question, schema } = req.body || {};
        if (!question || typeof question !== 'string') {
            return res.status(400).json({ error: 'A plain-English "question" string is required.' });
        }

        const q = String(question).toLowerCase();

        // Simple keyword signals
        const hasTime = /(over time|trend|weekly|monthly|quarter|year|time series|timeline)/.test(q);
        const hasEffect = /(impact|effect|increase|decrease|lift|change)/.test(q);
        const hasPrice = /(price|pricing|plan|tier|discount)/.test(q);
        const hasChurn = /(churn|cancel|attrition|turnover|leave|departure)/.test(q);
        const hasCampaign = /(campaign|marketing|ads?|promotion|promo)/.test(q);
        const hasSla = /(sla|breach|uptime|downtime|latency|ticket|ops|operations?)/.test(q);
        const hasPredict = /(predict|likely|probability|classify)/.test(q);
        const hasRel = /(relationship|correlat|associate|link)/.test(q);

        // Map to internal presets
        const internalMatches: Array<{ id: string; title: string; description: string; analyses: string[] }>= [];
        if (hasCampaign || (/sales|revenue|conversion/.test(q) && hasEffect)) {
            internalMatches.push({ id: 'campaign-effectiveness', title: 'Marketing campaign effectiveness', description: 'Determine if a recent campaign drove sales lift', analyses: ['descriptive','time-series','regression'] });
        }
        if ((hasPrice || /pricing/.test(q)) && (hasChurn || hasEffect)) {
            internalMatches.push({ id: 'pricing-churn', title: 'Pricing change effect on churn', description: 'Assess if pricing changes impacted customer churn', analyses: ['descriptive','correlation','classification','regression'] });
        }
        if ((/policy|remote work|policy change/.test(q)) && (hasChurn || /attrition|hr|employee|people/.test(q))) {
            internalMatches.push({ id: 'policy-attrition', title: 'Policy impact on employee attrition', description: 'Check if a policy change increased employee departures', analyses: ['descriptive','correlation','regression','time-series'] });
        }
        if (hasSla || /operations|operational/.test(q)) {
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

        // Otherwise, classify as external/new type; provide safe defaults
        const defaults = hasTime ? ['descriptive','time-series','regression'] : ['descriptive','correlation','regression'];
        return res.json({
            source: 'external',
            scenarios: [{ id: 'general-question', title: 'General analysis', description: 'We will analyze your data to answer this new type of question', analyses: defaults }]
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
