import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5000' });

test.describe('Project API Fixes Verification', () => {
    let token: string;
    let projectId: string;

    test.beforeAll(async ({ request }) => {
        // Use login-test endpoint to get a token without needing browser context
        console.log('Getting test auth token...');
        const loginResponse = await request.post('/api/auth/login-test');
        expect(loginResponse.ok()).toBeTruthy();

        const loginData = await loginResponse.json();
        token = loginData.token;
        console.log('Login successful, token obtained');

        // Create a test project
        console.log('Creating test project...');
        const projectResponse = await request.post('/api/projects', {
            headers: { 'Authorization': `Bearer ${token}` },
            data: {
                name: 'API Test Project',
                description: 'Test project for API verification',
                journeyType: 'ai_guided'
            }
        });

        expect(projectResponse.ok()).toBeTruthy();
        const projectData = await projectResponse.json();
        projectId = projectData.project.id;
        console.log('Project created:', projectId);
    });

    test('should update project schema via PUT /api/projects/:id/schema', async ({ request }) => {
        const newSchema = {
            testField: { type: 'string', description: 'Updated via test' }
        };

        console.log(`Updating schema for project ${projectId}`);
        const response = await request.put(`/api/projects/${projectId}/schema`, {
            headers: { 'Authorization': `Bearer ${token}` },
            data: { schema: newSchema }
        });

        console.log('PUT schema status:', response.status());
        const body = await response.json();
        console.log('PUT schema body:', JSON.stringify(body, null, 2));

        expect(response.status()).toBe(200);
        expect(body.success).toBe(true);
        expect(body.project.schema).toMatchObject(newSchema);
    });

    test('should fetch checkpoints via GET /api/projects/:id/checkpoints', async ({ request }) => {
        console.log(`Fetching checkpoints for project ${projectId}`);
        const response = await request.get(`/api/projects/${projectId}/checkpoints`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('GET checkpoints status:', response.status());
        const body = await response.json();
        console.log('GET checkpoints body:', JSON.stringify(body, null, 2));

        expect(response.status()).toBe(200);
        expect(body.success).toBe(true);
        expect(Array.isArray(body.checkpoints)).toBe(true);
    });

    test('should submit feedback via POST /api/projects/:id/checkpoints/:checkpointId/feedback', async ({ request }) => {
        // First, create a checkpoint manually
        console.log('Creating a test checkpoint...');

        // Get checkpoints first to see if any exist
        const checkpointsResponse = await request.get(`/api/projects/${projectId}/checkpoints`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const checkpointsBody = await checkpointsResponse.json();
        let checkpointId: string;

        if (checkpointsBody.checkpoints && checkpointsBody.checkpoints.length > 0) {
            checkpointId = checkpointsBody.checkpoints[0].id;
            console.log(`Using existing checkpoint ${checkpointId}`);
        } else {
            // If no checkpoints exist, we'll test with a dummy ID to verify the route exists
            // The route should return an error but not 404
            checkpointId = 'test-checkpoint-id';
            console.log('No checkpoints found, testing with dummy ID');
        }

        console.log(`Submitting feedback for checkpoint ${checkpointId}`);
        const feedbackResponse = await request.post(`/api/projects/${projectId}/checkpoints/${checkpointId}/feedback`, {
            headers: { 'Authorization': `Bearer ${token}` },
            data: {
                feedback: 'Test feedback',
                approved: true
            }
        });

        console.log('POST feedback status:', feedbackResponse.status());
        const feedbackBody = await feedbackResponse.json();
        console.log('POST feedback body:', JSON.stringify(feedbackBody, null, 2));

        // The route should exist (not 404), even if it returns an error for invalid checkpoint
        expect(feedbackResponse.status()).not.toBe(404);

        // If we had a real checkpoint, verify it worked
        if (checkpointsBody.checkpoints && checkpointsBody.checkpoints.length > 0) {
            expect(feedbackResponse.status()).toBe(200);
            expect(feedbackBody.success).toBe(true);
        }
    });
});
