import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Analysis API Endpoints', () => {
    let projectId: string;
    let authToken: string;

    // Setup: Authenticate and create a project with data before running tests
    test.beforeAll(async ({ request }) => {
        // 1. Authenticate and get a token
        const authResponse = await request.post(`/api/auth/login-test`);
        expect(authResponse.ok()).toBeTruthy();
        const authBody = await authResponse.json();
        authToken = authBody.token;

        // 2. Create a project
        const createProjectResponse = await request.post(`/api/projects`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            data: {
                name: 'E2E Analysis Test Project',
                description: 'A project for testing analysis endpoints'
            }
        });
        expect(createProjectResponse.ok()).toBeTruthy();
        const projectBody = await createProjectResponse.json();
        projectId = projectBody.project.id;
        console.log(`[Test Setup] Created project with ID: ${projectId}`);

        // 3. Upload a file
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
        console.log('[Test Setup] Upload Response Body:', uploadBody);

        // 4. Handle PII decision if required
        if (uploadBody.requiresPIIDecision) {
            const piiDecisionResponse = await request.post(`/api/auth/pii-decision`, {
                headers: { 'Authorization': `Bearer ${authToken}` },
                data: {
                    tempFileId: uploadBody.tempFileId,
                    decision: 'proceed',
                    anonymizationConfig: {},
                    name: 'E2E Analysis Test Project',
                    description: 'A project for testing analysis endpoints'
                }
            });
            expect(piiDecisionResponse.ok()).toBeTruthy();
        }
    });

    test('should apply data transformations successfully', async ({ request }) => {
        const response = await request.post(`/api/analysis/transform`, {
            headers: { 'Authorization': `Bearer ${authToken}` },
            data: {
                projectId: projectId,
                transformations: [{
                    type: 'filter',
                    column: 'price',
                    operator: '>',
                    value: 100000
                }]
            }
        });
        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.message).toBe('Data transformed successfully');
    });

    test('should run a regression analysis successfully', async ({ request }) => {
        const response = await request.post(`/api/analysis/regression`, {
            headers: { 'Authorization': `Bearer ${authToken}` },
            data: {
                projectId: projectId,
                dependentVariable: 'price',
                independentVariables: ['area', 'bedrooms', 'bathrooms']
            }
        });
        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.results).toBeDefined();
    });
});
