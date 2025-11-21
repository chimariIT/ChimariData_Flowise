import { describe, expect, test, vi } from 'vitest';
import { ProjectManagerAgent } from '../../../server/services/project-manager-agent';
import type { DataAssessment } from '../../../shared/schema';

describe('ProjectManagerAgent business context resilience', () => {
    test('synthesizePlan falls back to profile-derived business context when business agent fails', async () => {
        const agent = new ProjectManagerAgent();

        const context = {
            project: {
                id: 'proj_test',
                name: 'Checkout Optimization',
                description: 'Improve checkout conversion performance',
                ownerId: 'user_1',
                journeyType: 'business',
                status: 'active',
                archivedAt: null,
                metadata: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                defaultJourney: null,
                blueprint: null,
                journeyTypeConfidence: null,
                derivedInsights: null,
                tags: null,
                industry: 'E-commerce',
                teamId: null
            } as any,
            datasets: [
                {
                    datasetId: 'ds_primary',
                    role: 'primary',
                    schema: { checkout_stage: 'string', conversions: 'number' },
                    recordCount: 5000,
                    sampleRows: [
                        { checkout_stage: 'Cart', conversions: 1000 },
                        { checkout_stage: 'Payment', conversions: 650 }
                    ]
                }
            ],
            businessProfile: {
                industry: 'E-commerce',
                analysisGoal: 'Increase conversion rate',
                businessQuestions: ['How do we reduce checkout abandonment?'],
                templates: ['Conversion Funnel Review']
            }
        };

        const primaryDataset = context.datasets[0];
        const dataAssessment = (agent as any).buildFallbackDataAssessment({
            id: primaryDataset.datasetId,
            name: primaryDataset.datasetId,
            recordCount: primaryDataset.recordCount,
            schema: primaryDataset.schema,
            previewRows: primaryDataset.sampleRows,
            dataType: 'tabular'
        }) as DataAssessment;

        const businessAgent = (agent as any).businessAgent as any;

        vi.spyOn(businessAgent as any, 'getIndustryTemplate').mockResolvedValue(undefined);
        vi.spyOn(businessAgent as any, 'getApplicableRegulations').mockResolvedValue([]);

        const businessContext = await businessAgent.provideBusinessContext({
            journeyType: 'business',
            industry: context.businessProfile.industry,
            goals: [context.businessProfile.analysisGoal],
            analysisTypes: ['descriptive_analysis'],
            dataAssessment
        });

        expect(businessContext).toBeTruthy();
        expect(businessContext.relevantKPIs.length).toBeGreaterThan(0);
        expect(
            businessContext.industryBenchmarks.some((benchmark: string) =>
                benchmark.toLowerCase().includes('benchmark')
            )
        ).toBe(true);
        expect(businessContext.recommendations.some((rec: string) => rec.toLowerCase().includes('insights'))).toBe(true);
        expect(businessContext.complianceRequirements.length).toBeGreaterThan(0);
    });
});
