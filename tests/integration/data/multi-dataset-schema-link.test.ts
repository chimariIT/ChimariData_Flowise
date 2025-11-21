import express from 'express';
import request from 'supertest';
import authRouter from '../../../server/routes/auth';
import projectRouter from '../../../server/routes/project';
import dataVerificationRouter from '../../../server/routes/data-verification';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));
app.use('/api/auth', authRouter);
app.use('/api/projects', dataVerificationRouter, projectRouter);

const customerSatisfactionCsv = `id,student,score,room
1,Alice,4.6,3
2,Bob,4.2,11
3,Carla,4.9,7
`;

const participationCsv = `room,event,participants
3,Garden Day,24
7,Reading Drive,16
11,Climate Lab,32
`;

describe('Data upload workflow - multi dataset associations', () => {
  const user = {
    email: `multi-dataset-${Date.now()}@example.com`,
    password: 'MultiDatasetPass123!',
    firstName: 'Multi',
    lastName: 'Dataset',
  };

  let authToken: string;
  let projectId: string;

  beforeAll(async () => {
    // Register + login user
    const registerResponse = await request(app).post('/api/auth/register').send(user);
    expect(registerResponse.status).toBe(200);

    const loginResponse = await request(app).post('/api/auth/login').send({
      email: user.email,
      password: user.password,
    });
    expect(loginResponse.status).toBe(200);
    authToken = loginResponse.body.token;
    expect(authToken).toBeDefined();
  });

  it('uploads primary dataset and creates project shell', async () => {
    const response = await request(app)
      .post('/api/projects/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .field('name', 'SPTO Parent Feedback')
      .field('description', 'Primary parent survey responses')
      .field('questions', JSON.stringify(['How satisfied are parents?', 'What rooms need help?']))
      .attach('file', Buffer.from(customerSatisfactionCsv, 'utf8'), 'parent-satisfaction.csv');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.projectId).toBeTruthy();
    expect(response.body.project?.preview?.length).toBeGreaterThan(0);
    expect(response.body.relationships).toBeDefined();
    projectId = response.body.projectId;
  });

  it('adds a second dataset to the same project and exposes both via project datasets API', async () => {
    expect(projectId).toBeTruthy();

    const secondaryUpload = await request(app)
      .post(`/api/projects/${projectId}/upload`)
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', Buffer.from(participationCsv, 'utf8'), 'event-participation.csv');

    expect(secondaryUpload.status).toBe(200);
    expect(secondaryUpload.body.success).toBe(true);
    expect(secondaryUpload.body.datasetId).toBeDefined();
    expect(secondaryUpload.body.project?.id).toBe(projectId);

    const datasetsResponse = await request(app)
      .get(`/api/projects/${projectId}/datasets`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(datasetsResponse.status).toBe(200);
    expect(datasetsResponse.body.success).toBe(true);
    expect(datasetsResponse.body.count).toBe(2);

    const datasetNames = datasetsResponse.body.datasets.map(
      (entry: any) => entry.dataset.originalFileName || entry.dataset.name,
    );
    expect(datasetNames).toEqual(
      expect.arrayContaining(['parent-satisfaction.csv', 'event-participation.csv']),
    );

    const datasetIds = datasetsResponse.body.datasets.map((entry: any) => entry.dataset.id);

    for (const entry of datasetsResponse.body.datasets) {
      expect(entry.dataset.schema).toBeDefined();
      expect(Object.keys(entry.dataset.schema).length).toBeGreaterThan(0);
      expect(Array.isArray(entry.dataset.preview)).toBe(true);
    }

    const projectResponse = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(projectResponse.status).toBe(200);
    expect(Array.isArray(projectResponse.body.datasetSummaries)).toBe(true);
    expect(projectResponse.body.datasetSummaries.length).toBeGreaterThanOrEqual(1);
  });

  it('surfaces aggregated schema + quality info for multi-dataset projects', async () => {
    const qualityResponse = await request(app)
      .get(`/api/projects/${projectId}/data-quality`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(qualityResponse.status).toBe(200);
    expect(qualityResponse.body.success).toBe(true);
    expect(qualityResponse.body.datasetId).toBeTruthy();
    expect(qualityResponse.body.metrics).toBeDefined();

    const schemaResponse = await request(app)
      .get(`/api/projects/${projectId}/schema-analysis`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(schemaResponse.status).toBe(200);
    expect(schemaResponse.body.success).toBe(true);
    expect(schemaResponse.body.columnDetails?.length).toBeGreaterThan(0);
    expect(schemaResponse.body.metadata?.datasetAvailable).toBe(true);
  });
});

