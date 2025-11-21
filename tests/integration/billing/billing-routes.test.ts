import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const billingServiceStub = vi.hoisted(() => ({
  getUserUsageSummary: vi.fn(),
  getUserCapacitySummary: vi.fn(),
  calculateBillingWithCapacity: vi.fn(),
  calculateJourneyRequirements: vi.fn(),
  updateUserUsage: vi.fn(),
  getMLUsageSummary: vi.fn(),
  calculateMLCostEstimate: vi.fn(),
  calculateLLMCostEstimate: vi.fn()
}));

vi.mock('../../../server/services/billing/unified-billing-service', () => ({
  getBillingService: () => billingServiceStub
}));

import authRouter from '../../../server/routes/auth';
import billingRouter from '../../../server/routes/billing';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));
app.use('/api/auth', authRouter);
app.use('/api/billing', billingRouter);

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Billing API Routes', () => {
  const testUser = {
    email: `billing-user-${Date.now()}@example.com`,
    password: 'BillingUser123!',
    firstName: 'Bill',
    lastName: 'User'
  };

  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    const register = await request(app).post('/api/auth/register').send(testUser);
    expect(register.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({
      email: testUser.email,
      password: testUser.password
    });
    expect(login.status).toBe(200);

    authToken = login.body.token;
    userId = login.body.user.id;
  });

  beforeEach(() => {
    vi.clearAllMocks();

    billingServiceStub.getUserUsageSummary.mockResolvedValue({
      dataUsage: { totalUploadSizeMB: 123 },
      computeUsage: { toolExecutions: 7, aiQueries: 4 }
    });

    billingServiceStub.getUserCapacitySummary.mockResolvedValue({
      dataUsage: { totalUploadSizeMB: 200 },
      dataQuota: { maxDataUploadsMB: 1000 },
      computeUsage: { toolExecutions: 20 },
      computeQuota: { maxToolExecutions: 120 },
      summary: { tier: 'starter' },
      success: true
    });

    billingServiceStub.calculateBillingWithCapacity.mockResolvedValue({
      success: true,
      billing: {
        finalCost: 42,
        baseCost: 30,
        subscriptionCredits: 5,
        capacityUsed: { dataMB: 100 },
        capacityRemaining: { dataMB: 900 },
        utilizationPercentage: 0.1,
        breakdown: [
          { item: 'Base Cost', cost: 30, capacityUsed: 80, capacityRemaining: 920 },
          { item: 'Add-ons', cost: 12, capacityUsed: 20, capacityRemaining: 900 }
        ]
      }
    });

    billingServiceStub.calculateJourneyRequirements.mockResolvedValue({
      dataUsageMB: 250,
      computeUnits: 12
    });

    billingServiceStub.updateUserUsage.mockResolvedValue({
      success: true
    });

    billingServiceStub.getMLUsageSummary.mockResolvedValue({
      totalModels: 2,
      autoMLRuns: 5
    });

    billingServiceStub.calculateMLCostEstimate.mockResolvedValue({
      success: true,
      totalCost: 19.5,
      currency: 'USD'
    });

    billingServiceStub.calculateLLMCostEstimate.mockResolvedValue({
      success: true,
      totalCost: 45,
      currency: 'USD'
    });
  });

  it('returns usage summary for the authenticated user', async () => {
    const response = await request(app)
      .get('/api/billing/usage-summary')
      .set(authHeader(authToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.dataUsage.totalUploadSizeMB).toBe(123);
    expect(billingServiceStub.getUserUsageSummary).toHaveBeenCalledWith(userId);
  });

  it('returns quota data with derived remaining capacity', async () => {
    const response = await request(app)
      .get('/api/billing/quota-check/data')
      .set(authHeader(authToken));

    expect(response.status).toBe(200);
    expect(response.body.quotaRemaining).toBe(800);
    expect(billingServiceStub.getUserCapacitySummary).toHaveBeenCalledWith(userId);
  });

  it('calculates billing with capacity tracking', async () => {
    const payload = {
      journeyType: 'business',
      datasetSizeMB: 250,
      additionalFeatures: ['priority_support']
    };

    const response = await request(app)
      .post('/api/billing/calculate')
      .set(authHeader(authToken))
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.billing.finalCost).toBe(42);
    expect(billingServiceStub.calculateBillingWithCapacity).toHaveBeenCalledWith(userId, payload);
  });

  it('rejects invalid billing calculation payloads', async () => {
    const response = await request(app)
      .post('/api/billing/calculate')
      .set(authHeader(authToken))
      .send({ journeyType: 'business' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('returns formatted journey breakdown data', async () => {
    const response = await request(app)
      .post('/api/billing/journey-breakdown')
      .set(authHeader(authToken))
      .send({
        journeyType: 'business',
        datasetSizeMB: 500
      });

    expect(response.status).toBe(200);
    expect(response.body.breakdown.breakdown).toHaveLength(2);
    expect(response.body.breakdown.totalCost).toBe(42);
  });

  it('updates user usage after journey execution', async () => {
    const payload = {
      journeyType: 'business',
      datasetSizeMB: 300
    };

    const response = await request(app)
      .post('/api/billing/update-usage')
      .set(authHeader(authToken))
      .send(payload);

    expect(response.status).toBe(200);
    expect(billingServiceStub.calculateJourneyRequirements).toHaveBeenCalledWith('business', 300);
    expect(billingServiceStub.updateUserUsage).toHaveBeenCalledWith(userId, { dataUsageMB: 250, computeUnits: 12 });
  });

  it('returns ML usage summaries', async () => {
    const response = await request(app)
      .get('/api/billing/ml-usage-summary')
      .set(authHeader(authToken));

    expect(response.status).toBe(200);
    expect(response.body.usage.totalModels).toBe(2);
    expect(billingServiceStub.getMLUsageSummary).toHaveBeenCalledWith(userId);
  });

  it('estimates ML cost when required fields are provided', async () => {
    const response = await request(app)
      .post('/api/billing/ml-cost-estimate')
      .set(authHeader(authToken))
      .send({
        toolName: 'comprehensive_ml_pipeline',
        datasetSize: 20000,
        useAutoML: true
      });

    expect(response.status).toBe(200);
    expect(billingServiceStub.calculateMLCostEstimate).toHaveBeenCalledWith({
      userId,
      toolName: 'comprehensive_ml_pipeline',
      datasetSize: 20000,
      useAutoML: true,
      enableExplainability: undefined,
      trials: undefined
    });
  });

  it('validates ML cost estimate payloads', async () => {
    const response = await request(app)
      .post('/api/billing/ml-cost-estimate')
      .set(authHeader(authToken))
      .send({ toolName: 'comprehensive_ml_pipeline' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('estimates LLM cost when required fields are present', async () => {
    const response = await request(app)
      .post('/api/billing/llm-cost-estimate')
      .set(authHeader(authToken))
      .send({
        toolName: 'llm_fine_tuning',
        datasetSize: 5000,
        method: 'lora'
      });

    expect(response.status).toBe(200);
    expect(billingServiceStub.calculateLLMCostEstimate).toHaveBeenCalledWith({
      userId,
      toolName: 'llm_fine_tuning',
      datasetSize: 5000,
      method: 'lora',
      numEpochs: undefined
    });
  });

  it('exposes ML pricing examples without authentication', async () => {
    const response = await request(app).get('/api/billing/ml-pricing-examples');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.pricing_examples).toBeDefined();
    expect(response.body.pricing_examples.professional).toBeDefined();
  });
});

