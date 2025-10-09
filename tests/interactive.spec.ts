import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Interactive Agent Workflow', () => {
  let projectId: string;
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    // Authenticate and get a token
    const authResponse = await request.post(`/api/auth/login-test`);
    expect(authResponse.ok()).toBeTruthy();
    const authBody = await authResponse.json();
    expect(authBody.success).toBe(true);
    expect(authBody.token).toBeDefined();
    authToken = authBody.token;

    // 1. Create a project first
    const createProjectResponse = await request.post(`/api/projects`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        },
        data: {
            name: 'E2E Interactive Test Project',
            description: 'A project for testing the interactive workflow'
        }
    });
    expect(createProjectResponse.ok()).toBeTruthy();
    const projectBody = await createProjectResponse.json();
    expect(projectBody.success).toBe(true);
    expect(projectBody.project.id).toBeDefined();
    projectId = projectBody.project.id;

    // 2. Upload a file to the project
    const filePath = path.join(__dirname, '..', 'housing_regression_data.csv');
    const file = fs.readFileSync(filePath);

    const uploadResponse = await request.post(`/api/projects/${projectId}/upload`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        },
        multipart: {
            file: {
                name: 'housing_regression_data.csv',
                mimeType: 'text/csv',
                buffer: file,
            },
        },
    });
    expect(uploadResponse.ok()).toBeTruthy();
    const uploadBody = await uploadResponse.json();
    
    // 3. Handle PII decision if required
    if (uploadBody.requiresPIIDecision) {
        const piiDecisionResponse = await request.post(`/api/auth/pii-decision`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            data: {
                tempFileId: uploadBody.tempFileId,
                decision: 'proceed',
                anonymizationConfig: {},
                name: 'E2E Interactive Test Project',
                description: 'A project for testing the interactive workflow'
            }
        });
        const piiBody = await piiDecisionResponse.json();
        console.log('PII Decision Response Body:', piiBody);
        expect(piiBody.success).toBe(true);
    }
  });

  test('should run the full interactive workflow', async ({ request }) => {
    // 1. Start the workflow
    const startResponse = await request.post(`/api/interactive/start`, {
      data: {
        projectId,
        userDescription: 'I want to understand the factors that affect house prices.',
        journeyType: 'guided',
      },
    });
    expect(startResponse.ok()).toBeTruthy();
    const startBody = await startResponse.json();
    expect(startBody.goals).toBeDefined();
    expect(startBody.analysisPaths.length).toBeGreaterThan(0);

    const selectedPath = startBody.analysisPaths[0];

    // 2. Confirm the path and get a cost estimate
    const confirmResponse = await request.post(`/api/interactive/confirm-path`, {
      data: {
        projectId,
        selectedPathName: selectedPath.name,
      },
    });
    expect(confirmResponse.ok()).toBeTruthy();
    const confirmBody = await confirmResponse.json();
    expect(confirmBody.costEstimate).toBeDefined();

    // 3. Execute the analysis
    const executeResponse = await request.post(`/api/interactive/execute-analysis`, {
      data: {
        projectId,
      },
    });
    expect(executeResponse.ok()).toBeTruthy();
    const executeBody = await executeResponse.json();
    expect(executeBody.results).toBeDefined();
    expect(executeBody.nextSteps).toBeDefined();

    // 4. Get a summary
    const summaryResponse = await request.post(`/api/interactive/summarize`, {
      data: {
        projectId,
      },
    });
    expect(summaryResponse.ok()).toBeTruthy();
    const summaryBody = await summaryResponse.json();
    expect(summaryBody.summary).toBeDefined();
  });
});
