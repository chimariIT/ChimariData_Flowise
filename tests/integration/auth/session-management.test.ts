import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import authRouter from '../../../server/routes/auth';
import projectSessionRouter from '../../../server/routes/project-session';
import { db } from '../../../server/db';
import { projectSessions } from '../../../shared/schema';
import { eq } from 'drizzle-orm';

// Minimal express app that mounts the routers under test without waiting for the entire server bootstrap.
const testApp = express();
testApp.use(express.json({ limit: '10mb' }));
testApp.use(express.urlencoded({ extended: false, limit: '10mb' }));
testApp.use('/api/auth', authRouter);
testApp.use('/api/project-session', projectSessionRouter);

/**
 * Batch A – targeted integration tests for authentication + project session lifecycle.
 * Verifies:
 *  - journeyType validation and normalization
 *  - session reuse and expiry auto-extension logic
 *  - execution validation / tamper detection workflow
 */
describe('Project Session API Integration', () => {
  const testUser = {
    email: `session-test-${Date.now()}@example.com`,
    password: 'SessionPass123!',
    firstName: 'Session',
    lastName: 'Tester'
  };

  const authorization = () => `Bearer ${authToken}`;

  let authToken: string;
  let sessionId: string;
  let initialExpiresAt: string | null = null;
  const journeyQuery = { journeyType: 'ai_guided' };

  const executionResults = {
    totalAnalyses: 3,
    dataSize: '4.5MB',
    executionTime: '18s'
  };

  beforeAll(async () => {
    const registerResponse = await request(testApp)
      .post('/api/auth/register')
      .send(testUser);

    expect(registerResponse.status).toBe(200);
    expect(registerResponse.body?.success).toBe(true);

    const loginResponse = await request(testApp)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body?.token).toBeTruthy();
    authToken = loginResponse.body.token;
  });

  it('returns 400 when journeyType is missing', async () => {
    const response = await request(testApp)
      .get('/api/project-session/current')
      .set('Authorization', authorization());

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('journeyType');
  });

  it('creates and normalizes a new session', async () => {
    const response = await request(testApp)
      .get('/api/project-session/current')
      .query(journeyQuery)
      .set('Authorization', authorization());

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.session).toBeDefined();
    expect(response.body.session.journeyType).toBe('non-tech'); // ai_guided -> non-tech
    expect(response.body.session.currentStep).toBe('prepare');

    sessionId = response.body.session.id;
    initialExpiresAt = response.body.session.expiresAt ?? null;

    expect(sessionId).toMatch(/^ps_/);
  });

  it('reuses existing session on subsequent request', async () => {
    const response = await request(testApp)
      .get('/api/project-session/current')
      .query(journeyQuery)
      .set('Authorization', authorization());

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.session.id).toBe(sessionId);
    expect(response.body.session.currentStep).toBe('prepare');
  });

  it('auto-extends expiry when session is within grace period during step update', async () => {
    expect(sessionId).toBeTruthy();

    // Force the session to appear expired ~2 hours ago to trigger auto-renew logic.
    const expiredAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await db
      .update(projectSessions)
      .set({ expiresAt: expiredAt })
      .where(eq(projectSessions.id, sessionId!));

    const updateResponse = await request(testApp)
      .post(`/api/project-session/${sessionId}/update-step`)
      .set('Authorization', authorization())
      .send({
        step: 'execute',
        data: {
          results: executionResults,
          status: 'complete'
        }
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.success).toBe(true);
    expect(updateResponse.body.session.currentStep).toBe('execute');
    expect(updateResponse.body.session.dataHash).toBeDefined();
    expect(updateResponse.body.session.dataHash.length).toBe(64);

    const renewedExpiry = new Date(updateResponse.body.session.expiresAt);
    expect(renewedExpiry.getTime()).toBeGreaterThan(Date.now());
  });

  it('validates execution results and rejects tampered payloads', async () => {
    const validateResponse = await request(testApp)
      .post(`/api/project-session/${sessionId}/validate-execution`)
      .set('Authorization', authorization())
      .send({
        executionResults
      });

    expect(validateResponse.status).toBe(200);
    expect(validateResponse.body.success).toBe(true);
    expect(validateResponse.body.session.serverValidated).toBe(true);

    const tamperedResponse = await request(testApp)
      .post(`/api/project-session/${sessionId}/validate-execution`)
      .set('Authorization', authorization())
      .send({
        executionResults: {
          ...executionResults,
          totalAnalyses: executionResults.totalAnalyses + 5
        }
      });

    expect(tamperedResponse.status).toBe(400);
    expect(tamperedResponse.body.error).toContain('Data integrity');
    expect(tamperedResponse.body.tamperingDetected).toBe(true);
  });
});

