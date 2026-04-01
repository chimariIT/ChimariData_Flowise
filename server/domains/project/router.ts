/**
 * Project Domain Router
 *
 * Main router assembly for project domain
 */

import { Router } from 'express';
import projectCRUDRouter from './handlers/project-crud';
import transformationRouter from './handlers/transformation-handler';
import joinRouter from './handlers/join-handler';
import checkpointRouter from './handlers/checkpoint-handler';
import visualizationsRouter from './handlers/visualizations-handler';
import journeyRouter from './handlers/journey-handler';
import dataElementsRouter from './handlers/data-elements-handler';
import dataQualityRouter from './handlers/data-quality-handler';
import piiRouter from './handlers/pii-handler';
import downloadRouter from './handlers/download-handler';
import schemaRouter from './handlers/schema-handler';
import projectLifecycleRouter from './handlers/project-lifecycle-handler';
import agentRecommendationsRouter from './handlers/agent-recommendations-handler';

const router = Router();

// Register all handlers
router.use('/', projectCRUDRouter);
router.use(transformationRouter);
router.use(joinRouter);
router.use('/:id/checkpoints', checkpointRouter);
router.use('/:id/visualizations', visualizationsRouter);
router.use('/:id/journey', journeyRouter);
router.use('/:id/data-elements', dataElementsRouter);
router.use('/:id/quality', dataQualityRouter);
router.use('/:id/pii', piiRouter);
router.use('/:id/download', downloadRouter);
router.use('/:id/schema', schemaRouter);
router.use('/:id/lifecycle', projectLifecycleRouter);
router.use('/:id/agents', agentRecommendationsRouter);

export default router;
