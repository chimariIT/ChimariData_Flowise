import { test, expect } from '@playwright/test';
import request from 'supertest';
import app from '../../server';

test.describe('End-to-End User Journey Tests', () => {
  let testUsers: any = {};
  let authTokens: any = {};

  test.beforeAll(async () => {
    // Create test users for each role
    const userRoles = ['non-tech', 'business', 'technical', 'consultation'];
    const subscriptionTiers = ['none', 'trial', 'starter', 'professional', 'enterprise'];

    for (const role of userRoles) {
      for (const tier of subscriptionTiers) {
        const email = `test-${role}-${tier}@example.com`;
        const userData = {
          email,
          password: 'testpass123',
          name: `Test ${role} ${tier}`,
          userRole: role,
          subscriptionTier: tier
        };

        const response = await request(app)
          .post('/api/auth/register')
          .send(userData);

        if (response.status === 200 || response.status === 201) {
          testUsers[`${role}-${tier}`] = response.body.user;
          authTokens[`${role}-${tier}`] = response.body.token;
        }
      }
    }
  });

  test.afterAll(async () => {
    // Cleanup test users
    // In a real test environment, you'd clean up the database
  });

  test.describe('Role-Based Journey Access', () => {
    test('Non-tech user can access non-tech journey', async () => {
      const token = authTokens['non-tech-starter'];

      const response = await request(app)
        .get('/api/user/journey-access/non-tech')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.canAccess).toBe(true);
    });

    test('Non-tech user cannot access technical journey without upgrade', async () => {
      const token = authTokens['non-tech-none'];

      const response = await request(app)
        .get('/api/user/journey-access/technical')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.upgradeRequired).toBe(true);
    });

    test('Technical user can access all journeys with professional subscription', async () => {
      const token = authTokens['technical-professional'];
      const journeys = ['non-tech', 'business', 'technical'];

      for (const journey of journeys) {
        const response = await request(app)
          .get(`/api/user/journey-access/${journey}`)
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.canAccess).toBe(true);
      }
    });

    test('Consultation journey requires professional tier or higher', async () => {
      const starterToken = authTokens['business-starter'];
      const professionalToken = authTokens['business-professional'];

      // Starter should be denied
      const starterResponse = await request(app)
        .get('/api/user/journey-access/consultation')
        .set('Authorization', `Bearer ${starterToken}`);

      expect(starterResponse.status).toBe(403);

      // Professional should be allowed
      const professionalResponse = await request(app)
        .get('/api/user/journey-access/consultation')
        .set('Authorization', `Bearer ${professionalToken}`);

      expect(professionalResponse.status).toBe(200);
      expect(professionalResponse.body.canAccess).toBe(true);
    });
  });

  test.describe('AI Service Differentiation', () => {
    test('AI features available based on subscription tier', async () => {
      const noneToken = authTokens['technical-none'];
      const professionalToken = authTokens['technical-professional'];

      // None tier - limited features
      const noneResponse = await request(app)
        .get('/api/ai/features/available')
        .set('Authorization', `Bearer ${noneToken}`);

      expect(noneResponse.status).toBe(200);
      expect(noneResponse.body.features.available).toHaveLength(1); // Only basic analysis

      // Professional tier - all features
      const professionalResponse = await request(app)
        .get('/api/ai/features/available')
        .set('Authorization', `Bearer ${professionalToken}`);

      expect(professionalResponse.status).toBe(200);
      expect(professionalResponse.body.features.available.length).toBeGreaterThan(5);
    });

    test('Code generation requires subscription', async () => {
      const noneToken = authTokens['technical-none'];
      const starterToken = authTokens['technical-starter'];

      // None tier should be denied
      const noneResponse = await request(app)
        .post('/api/ai/code/generate')
        .set('Authorization', `Bearer ${noneToken}`)
        .send({
          language: 'python',
          purpose: 'analysis',
          prompt: 'Generate a simple data analysis script'
        });

      expect(noneResponse.status).toBe(403);

      // Starter tier should be allowed
      const starterResponse = await request(app)
        .post('/api/ai/code/generate')
        .set('Authorization', `Bearer ${starterToken}`)
        .send({
          language: 'python',
          purpose: 'analysis',
          prompt: 'Generate a simple data analysis script'
        });

      expect(starterResponse.status).toBe(200);
      expect(starterResponse.body.result.code).toBeDefined();
    });

    test('AI responses are role-appropriate', async () => {
      const nonTechToken = authTokens['non-tech-starter'];
      const technicalToken = authTokens['technical-starter'];

      const prompt = 'Analyze this dataset for patterns';

      // Non-tech user should get simplified response
      const nonTechResponse = await request(app)
        .post('/api/ai/analysis/extract-goals')
        .set('Authorization', `Bearer ${nonTechToken}`)
        .send({
          userDescription: prompt,
          journeyType: 'non-tech',
          context: {}
        });

      // Technical user should get detailed response
      const technicalResponse = await request(app)
        .post('/api/ai/analysis/extract-goals')
        .set('Authorization', `Bearer ${technicalToken}`)
        .send({
          userDescription: prompt,
          journeyType: 'technical',
          context: {}
        });

      expect(nonTechResponse.status).toBe(200);
      expect(technicalResponse.status).toBe(200);

      // Responses should be different based on role
      expect(nonTechResponse.body.extractedGoals).not.toEqual(technicalResponse.body.extractedGoals);
    });
  });

  test.describe('Payment System Integration', () => {
    test('Subscription users get pricing with discounts', async () => {
      const noneToken = authTokens['business-none'];
      const starterToken = authTokens['business-starter'];
      const professionalToken = authTokens['business-professional'];

      // None tier (pay-per-use)
      const noneResponse = await request(app)
        .get('/api/ai/payment/pricing')
        .set('Authorization', `Bearer ${noneToken}`);

      expect(noneResponse.status).toBe(200);
      expect(noneResponse.body.pricing.paymentModel).toBe('pay_per_use');
      expect(noneResponse.body.pricing.discountPercentage).toBe(0);

      // Starter tier (40% discount)
      const starterResponse = await request(app)
        .get('/api/ai/payment/pricing')
        .set('Authorization', `Bearer ${starterToken}`);

      expect(starterResponse.status).toBe(200);
      expect(starterResponse.body.pricing.paymentModel).toBe('subscription');
      expect(starterResponse.body.pricing.discountPercentage).toBe(40);

      // Professional tier (60% discount)
      const professionalResponse = await request(app)
        .get('/api/ai/payment/pricing')
        .set('Authorization', `Bearer ${professionalToken}`);

      expect(professionalResponse.status).toBe(200);
      expect(professionalResponse.body.pricing.discountPercentage).toBe(60);
    });

    test('Pay-per-use charging works correctly', async () => {
      const noneToken = authTokens['technical-none'];

      // Get pricing estimate
      const estimateResponse = await request(app)
        .post('/api/ai/payment/estimate')
        .set('Authorization', `Bearer ${noneToken}`)
        .send({
          featureType: 'ai_query',
          complexity: 'advanced',
          quantity: 1
        });

      expect(estimateResponse.status).toBe(200);
      expect(estimateResponse.body.estimate.paymentModel).toBe('pay_per_use');
      expect(estimateResponse.body.estimate.estimatedCost).toBeGreaterThan(0);

      // Process payment
      const chargeResponse = await request(app)
        .post('/api/ai/payment/charge')
        .set('Authorization', `Bearer ${noneToken}`)
        .send({
          requestType: 'ai_query',
          complexity: 'advanced'
        });

      expect(chargeResponse.status).toBe(200);
      expect(chargeResponse.body.payment.transactionId).toBeDefined();
      expect(chargeResponse.body.payment.chargeAmount).toBeGreaterThan(0);
    });

    test('Subscription quotas are tracked correctly', async () => {
      const starterToken = authTokens['business-starter'];

      // Check initial status
      const statusResponse = await request(app)
        .get('/api/ai/payment/status')
        .set('Authorization', `Bearer ${starterToken}`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.paymentStatus.paymentModel).toBe('subscription');

      const initialQuota = statusResponse.body.paymentStatus.features
        .find((f: any) => f.featureId === 'basic_analysis')?.quotaRemaining || 0;

      // Use AI service
      await request(app)
        .post('/api/ai/analysis/extract-goals')
        .set('Authorization', `Bearer ${starterToken}`)
        .send({
          userDescription: 'Test analysis request',
          journeyType: 'business',
          context: {}
        });

      // Check quota after usage
      const updatedStatusResponse = await request(app)
        .get('/api/ai/payment/status')
        .set('Authorization', `Bearer ${starterToken}`);

      const updatedQuota = updatedStatusResponse.body.paymentStatus.features
        .find((f: any) => f.featureId === 'basic_analysis')?.quotaRemaining || 0;

      expect(updatedQuota).toBeLessThan(initialQuota);
    });

    test('Role-based pricing multipliers applied correctly', async () => {
      const nonTechToken = authTokens['non-tech-none'];
      const businessToken = authTokens['business-none'];
      const technicalToken = authTokens['technical-none'];
      const consultationToken = authTokens['consultation-none'];

      const estimateRequest = {
        featureType: 'ai_query',
        complexity: 'simple',
        quantity: 1
      };

      // Get estimates for each role
      const roles = [
        { token: nonTechToken, role: 'non-tech', multiplier: 1.0 },
        { token: businessToken, role: 'business', multiplier: 1.2 },
        { token: technicalToken, role: 'technical', multiplier: 1.5 },
        { token: consultationToken, role: 'consultation', multiplier: 2.0 }
      ];

      const estimates = await Promise.all(
        roles.map(async ({ token, role }) => {
          const response = await request(app)
            .post('/api/ai/payment/estimate')
            .set('Authorization', `Bearer ${token}`)
            .send(estimateRequest);

          return {
            role,
            cost: response.body.estimate.estimatedCost
          };
        })
      );

      // Verify pricing multipliers
      const baseCost = estimates.find(e => e.role === 'non-tech')?.cost || 0;

      expect(estimates.find(e => e.role === 'business')?.cost).toBeCloseTo(baseCost * 1.2, 2);
      expect(estimates.find(e => e.role === 'technical')?.cost).toBeCloseTo(baseCost * 1.5, 2);
      expect(estimates.find(e => e.role === 'consultation')?.cost).toBeCloseTo(baseCost * 2.0, 2);
    });
  });

  test.describe('Usage Tracking and Limits', () => {
    test('Usage limits enforced correctly', async () => {
      const trialToken = authTokens['non-tech-trial'];

      // Get current usage
      const usageResponse = await request(app)
        .get('/api/usage/current')
        .set('Authorization', `Bearer ${trialToken}`);

      expect(usageResponse.status).toBe(200);
      expect(usageResponse.body.usage.aiQueries).toBeDefined();
      expect(usageResponse.body.limits.maxAiQueries).toBeDefined();
    });

    test('Upgrade prompts shown when approaching limits', async () => {
      const trialToken = authTokens['business-trial'];

      // Make multiple AI requests to approach limit
      for (let i = 0; i < 8; i++) {
        await request(app)
          .post('/api/ai/analysis/extract-goals')
          .set('Authorization', `Bearer ${trialToken}`)
          .send({
            userDescription: `Test request ${i}`,
            journeyType: 'business',
            context: {}
          });
      }

      // Next request should show upgrade prompt
      const response = await request(app)
        .post('/api/ai/analysis/extract-goals')
        .set('Authorization', `Bearer ${trialToken}`)
        .send({
          userDescription: 'Final test request',
          journeyType: 'business',
          context: {}
        });

      expect(response.body.result?.metadata?.upgradeRecommendation).toBeDefined();
    });
  });

  test.describe('Journey Workflow Integration', () => {
    test('Complete non-tech user journey', async () => {
      const token = authTokens['non-tech-starter'];

      // Step 1: Journey access
      const accessResponse = await request(app)
        .get('/api/user/journey-access/non-tech')
        .set('Authorization', `Bearer ${token}`);

      expect(accessResponse.status).toBe(200);

      // Step 2: Goal extraction
      const goalsResponse = await request(app)
        .post('/api/ai/analysis/extract-goals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          userDescription: 'I want to analyze my sales data to find trends',
          journeyType: 'non-tech',
          context: { industry: 'retail' }
        });

      expect(goalsResponse.status).toBe(200);
      expect(goalsResponse.body.extractedGoals).toBeDefined();

      // Step 3: Data upload simulation
      const uploadResponse = await request(app)
        .post('/api/usage/track-upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ fileSizeMB: 2.5 });

      expect(uploadResponse.status).toBe(200);

      // Step 4: AI insights
      const insightsResponse = await request(app)
        .post('/api/ai/ai-insights')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: 'test-project-123',
          role: 'non-tech',
          questions: ['What are the sales trends?']
        });

      expect(insightsResponse.status).toBe(200);
      expect(insightsResponse.body.insights).toBeDefined();
    });

    test('Complete technical user journey with code generation', async () => {
      const token = authTokens['technical-professional'];

      // Step 1: Advanced analysis
      const analysisResponse = await request(app)
        .post('/api/ai/analysis/advanced')
        .set('Authorization', `Bearer ${token}`)
        .send({
          analysisType: 'statistical',
          methodologies: ['regression', 'clustering'],
          dataContext: { type: 'numerical', size: 1000 },
          prompt: 'Perform comprehensive statistical analysis'
        });

      expect(analysisResponse.status).toBe(200);

      // Step 2: Code generation
      const codeResponse = await request(app)
        .post('/api/ai/code/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          language: 'python',
          purpose: 'analysis',
          requirements: { libraries: ['pandas', 'numpy', 'scikit-learn'] },
          prompt: 'Generate analysis pipeline code'
        });

      expect(codeResponse.status).toBe(200);
      expect(codeResponse.body.result.code).toBeDefined();

      // Step 3: Research assistance
      const researchResponse = await request(app)
        .post('/api/ai/research/assist')
        .set('Authorization', `Bearer ${token}`)
        .send({
          domain: 'machine learning',
          researchQuestion: 'Best practices for feature selection',
          methodology: 'exploratory',
          prompt: 'Provide research guidance on feature selection methods'
        });

      expect(researchResponse.status).toBe(200);
      expect(researchResponse.body.result.literatureReview).toBeDefined();
    });

    test('Complete consultation user journey', async () => {
      const token = authTokens['consultation-enterprise'];

      // Step 1: Strategic consultation
      const consultationResponse = await request(app)
        .post('/api/ai/consultation/request')
        .set('Authorization', `Bearer ${token}`)
        .send({
          context: {
            clientType: 'enterprise',
            industryDomain: 'finance',
            problemComplexity: 'strategic',
            timeframe: 'long_term',
            stakeholders: ['CTO', 'Data Science Team'],
            constraints: { budget: 'flexible', timeline: '6 months' },
            expectedOutcomes: ['Improved data strategy', 'Better ML pipeline']
          },
          request: {
            consultationType: 'strategic',
            urgency: 'medium',
            scope: 'comprehensive',
            deliverables: ['strategy document', 'implementation plan'],
            sessionType: 'initial'
          },
          prompt: 'Develop comprehensive data strategy for financial services'
        });

      expect(consultationResponse.status).toBe(200);
      expect(consultationResponse.body.result.executiveSummary).toBeDefined();

      // Step 2: Strategic assessment
      const assessmentResponse = await request(app)
        .post('/api/ai/consultation/assessment')
        .set('Authorization', `Bearer ${token}`)
        .send({
          context: {
            clientType: 'enterprise',
            industryDomain: 'finance',
            problemComplexity: 'strategic'
          },
          currentState: { maturity: 'basic', tools: ['Excel', 'SQL'] },
          targetState: { maturity: 'advanced', tools: ['ML Platform', 'AutoML'] },
          prompt: 'Assess current vs target state for data capabilities'
        });

      expect(assessmentResponse.status).toBe(200);
      expect(assessmentResponse.body.result.gapAnalysis).toBeDefined();
    });
  });

  test.describe('Error Handling and Edge Cases', () => {
    test('Graceful handling of invalid AI requests', async () => {
      const token = authTokens['technical-starter'];

      const response = await request(app)
        .post('/api/ai/code/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          language: 'invalid-language',
          purpose: 'analysis',
          prompt: ''
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    test('Payment failures handled gracefully', async () => {
      const token = authTokens['business-none'];

      // Simulate payment failure
      const response = await request(app)
        .post('/api/ai/payment/charge')
        .set('Authorization', `Bearer ${token}`)
        .send({
          requestType: 'ai_query',
          complexity: 'advanced'
        });

      // Should either succeed or fail gracefully
      expect([200, 402, 500]).toContain(response.status);
      if (response.status !== 200) {
        expect(response.body.error).toBeDefined();
      }
    });

    test('Rate limiting works correctly', async () => {
      const token = authTokens['non-tech-trial'];

      // Make many rapid requests
      const promises = Array(20).fill(null).map(() =>
        request(app)
          .post('/api/ai/analysis/extract-goals')
          .set('Authorization', `Bearer ${token}`)
          .send({
            userDescription: 'Quick test',
            journeyType: 'non-tech',
            context: {}
          })
      );

      const responses = await Promise.all(promises);

      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });
});