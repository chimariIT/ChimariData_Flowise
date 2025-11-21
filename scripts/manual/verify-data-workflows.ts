process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.DATABASE_URL = '';
process.env.REDIS_ENABLED = 'false';
process.env.REDIS_URL = '';
process.env.SENDGRID_API_KEY = 'SG.fake-key';
process.env.SPARK_MASTER_URL = '';

import request from 'supertest';

const appModule = await import('../../server/index.js') as typeof import('../../server/index.js');
const storageModule = await import('../../server/services/storage.js') as typeof import('../../server/services/storage.js');
const projectManagerModule = await import('../../server/services/project-manager-agent.js') as typeof import('../../server/services/project-manager-agent.js');
const pipelineBuilderModule = await import('../../server/services/data-pipeline-builder.js') as typeof import('../../server/services/data-pipeline-builder.js');

const app = appModule.default;
const { storage } = storageModule;
const { ProjectManagerAgent } = projectManagerModule;
const { dataPipelineBuilder } = pipelineBuilderModule;

function logSection(title: string): void {
  console.log(`\n===== ${title} =====`);
}

function printObject(label: string, value: unknown): void {
  console.log(`${label}:`);
  console.log(JSON.stringify(value, null, 2));
}

async function seedProjectWithData() {
  const user = await storage.createUser({
    email: 'verification-user@chimaridata.local',
    firstName: 'Verification',
    lastName: 'User',
    userRole: 'technical',
    subscriptionTier: 'professional',
    isAdmin: true,
  });

  const project = await storage.createProject({
    userId: user.id,
    name: 'Verification Project',
    description: 'Synthetic dataset for MCP data route verification',
    journeyType: 'self_service',
    isPaid: true,
    isTrial: false,
    dataSource: 'upload',
    fileType: 'application/json',
    fileName: 'verification.json',
    fileSize: 0,
  });

  const sampleRows = [
    { response_id: 1, Campus: 'North', Grade: '5', Satisfaction: 4.5, SentimentScore: 0.35, Attendance: 94, Comments: 'Great staff engagement.' },
    { response_id: 2, Campus: 'North', Grade: '5', Satisfaction: 4.1, SentimentScore: 0.22, Attendance: 91, Comments: 'Communication is solid.' },
    { response_id: 3, Campus: 'Central', Grade: '6', Satisfaction: 2.1, SentimentScore: -0.48, Attendance: 72, Comments: 'Needs more support.' },
    { response_id: 4, Campus: 'West', Grade: '6', Satisfaction: 3.2, SentimentScore: -0.05, Attendance: 83, Comments: 'Average experience.' },
    { response_id: 5, Campus: 'North', Grade: '5', Satisfaction: 4.7, SentimentScore: 0.41, Attendance: 96, Comments: 'Excellent overall!' },
    { response_id: 6, Campus: 'Central', Grade: '6', Satisfaction: 1.8, SentimentScore: -0.62, Attendance: 68, Comments: 'Serious issues raised.' },
    { response_id: 7, Campus: 'East', Grade: '4', Satisfaction: 4.2, SentimentScore: 0.18, Attendance: 89, Comments: 'Good but room to grow.' },
    { response_id: 8, Campus: 'East', Grade: '4', Satisfaction: 4.4, SentimentScore: 0.27, Attendance: 92, Comments: 'Teachers are supportive.' },
    { response_id: 9, Campus: 'West', Grade: '6', Satisfaction: 3.6, SentimentScore: 0.05, Attendance: 85, Comments: 'Getting better.' },
    { response_id: 10, Campus: 'Central', Grade: '6', Satisfaction: 2.4, SentimentScore: -0.38, Attendance: 75, Comments: 'Needs improvements.' }
  ];

  await storage.updateProject(project.id, {
    data: sampleRows,
    recordCount: sampleRows.length,
  });

  return { user, project, sampleRows };
}

async function exerciseDataEndpoints(projectId: string) {
  logSection('/api/data/outlier-detection');
  const outlierResponse = await request(app)
    .post('/api/data/outlier-detection')
    .send({
      projectId,
      config: { method: 'iqr', threshold: 1.5, columns: ['Satisfaction', 'Attendance'] },
    });
  printObject('Response', outlierResponse.body);

  const withOutliers = await storage.getProject(projectId);
  printObject('Stored project.outlierAnalysis', withOutliers?.outlierAnalysis);

  logSection('/api/data/missing-data-analysis');
  const missingResponse = await request(app)
    .post('/api/data/missing-data-analysis')
    .send({ projectId });
  printObject('Response', missingResponse.body);

  const withMissing = await storage.getProject(projectId);
  printObject('Stored project.missingDataAnalysis', withMissing?.missingDataAnalysis);

  logSection('/api/data/normality-test');
  const normalityResponse = await request(app)
    .post('/api/data/normality-test')
    .send({ projectId, config: { columns: ['Satisfaction', 'SentimentScore', 'Attendance'] } });
  printObject('Response', normalityResponse.body);

  const withNormality = await storage.getProject(projectId);
  printObject('Stored project.normalityTests', withNormality?.normalityTests);
}

async function seedDataset(userId: string, payload: {
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  storageUri: string;
  data: any[];
  schema: any;
  recordCount: number;
  mode?: string;
}) {
  const dataset = await storage.createDataset({
    userId,
    originalFileName: payload.originalFileName,
    mimeType: payload.mimeType,
    fileSize: payload.fileSize,
    storageUri: payload.storageUri,
    data: payload.data,
    schema: payload.schema,
    recordCount: payload.recordCount,
    sourceType: 'upload',
    dataType: 'tabular',
    mode: payload.mode ?? 'static',
  } as any);

  return dataset;
}

async function buildPipelines(agent: InstanceType<typeof ProjectManagerAgent>, projectId: string, userId: string) {
  const sptoDataset = await seedDataset(userId, {
    originalFileName: 'spto-survey.csv',
    mimeType: 'text/csv',
    fileSize: 24576,
    storageUri: 'memory://datasets/spto-survey.csv',
    data: [],
    schema: {
      primaryKey: 'response_id',
      columns: [
        { name: 'response_id', type: 'number', required: true },
        { name: 'Campus', type: 'string' },
        { name: 'Grade', type: 'string' },
        { name: 'Satisfaction', type: 'number' },
        { name: 'SentimentScore', type: 'number' },
        { name: 'Attendance', type: 'number' }
      ],
    },
    recordCount: 1200,
  });

  const hrDataset = await seedDataset(userId, {
    originalFileName: 'hr-attrition.csv',
    mimeType: 'text/csv',
    fileSize: 16384,
    storageUri: 'memory://datasets/hr-attrition.csv',
    data: [],
    schema: {
      primaryKey: 'employee_id',
      columns: [
        { name: 'employee_id', type: 'string', required: true },
        { name: 'department', type: 'string' },
        { name: 'job_role', type: 'string' },
        { name: 'tenure_months', type: 'number' },
        { name: 'engagement_score', type: 'number' },
        { name: 'attrition', type: 'number' }
      ]
    },
    recordCount: 540,
  });

  const marketingDataset = await seedDataset(userId, {
    originalFileName: 'marketing-performance.csv',
    mimeType: 'text/csv',
    fileSize: 32768,
    storageUri: 'memory://datasets/marketing-performance.csv',
    data: [],
    schema: {
      primaryKey: 'event_id',
      columns: [
        { name: 'event_id', type: 'string', required: true },
        { name: 'campaign_name', type: 'string' },
        { name: 'channel', type: 'string' },
        { name: 'source', type: 'string' },
        { name: 'spend', type: 'number' },
        { name: 'revenue', type: 'number' },
        { name: 'conversions', type: 'number' },
        { name: 'week', type: 'string' }
      ]
    },
    recordCount: 780,
  });

  const results = [] as Array<{ domain: string; pipelineId: string }>; 

  for (const [domain, dataset] of [
    ['spto', sptoDataset],
    ['hr', hrDataset],
    ['marketing', marketingDataset],
  ] as const) {
    logSection(`ProjectManagerAgent.buildDomainPipeline (${domain})`);
    const outcome = await agent.buildDomainPipeline({
      projectId,
      userId,
      datasetId: dataset.id,
      datasetName: `${domain.toUpperCase()} Dataset`,
      domain,
      schedule: domain === 'spto' ? 'weekly' : 'daily',
    });

    results.push({ domain, pipelineId: outcome.pipeline.pipelineId });
    printObject('Pipeline result', outcome);

    const storedPipeline = await dataPipelineBuilder.getPipeline(outcome.pipeline.pipelineId);
    printObject('Retrieved pipeline definition', storedPipeline);
  }

  const projectAfter = await storage.getProject(projectId);
  printObject('Project.transformations', projectAfter?.transformations);

  return results;
}

async function main() {
  const { user, project } = await seedProjectWithData();
  await exerciseDataEndpoints(project.id);

  const projectManager = new ProjectManagerAgent();
  await projectManager.initialize();

  await buildPipelines(projectManager, project.id, user.id);

  logSection('Verification Complete');
}

main().catch((error) => {
  console.error('Verification script failed:', error);
  process.exitCode = 1;
});
