import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { PRICING_CONSTANTS } from '@shared/pricing-config';

export interface RuntimePricingConfig {
  basePlatformFee: number;
  dataProcessingPer1K: number;
  baseAnalysisCost: number;
  complexityMultipliers: Record<string, number>;
  analysisTypeFactors: Record<string, number>;
  questionsIncluded: number;
  questionsChargePerExtra: number;
  servicePricing: {
    payPerAnalysis: number;
    expertConsultation: number;
  };
}

const FALLBACK: RuntimePricingConfig = {
  basePlatformFee: PRICING_CONSTANTS.basePlatformFee,
  dataProcessingPer1K: PRICING_CONSTANTS.dataProcessingPer1K,
  baseAnalysisCost: PRICING_CONSTANTS.baseAnalysisCost,
  complexityMultipliers: { ...PRICING_CONSTANTS.complexityMultipliers },
  analysisTypeFactors: { ...PRICING_CONSTANTS.analysisTypeFactors },
  questionsIncluded: PRICING_CONSTANTS.questionsIncluded,
  questionsChargePerExtra: PRICING_CONSTANTS.questionsChargePerExtra,
  servicePricing: {
    payPerAnalysis: PRICING_CONSTANTS.servicePricingDefaults.payPerAnalysis,
    expertConsultation: PRICING_CONSTANTS.servicePricingDefaults.expertConsultation,
  },
};

/**
 * Fetch current pricing configuration from the server (DB-backed).
 * Falls back to compile-time PRICING_CONSTANTS via placeholderData for instant display.
 */
export function usePricingConfig() {
  return useQuery<RuntimePricingConfig>({
    queryKey: ['/api/pricing/runtime-config'],
    queryFn: async () => {
      const res = await apiClient.get('/api/pricing/runtime-config');
      return res as RuntimePricingConfig;
    },
    staleTime: 60_000,
    placeholderData: FALLBACK,
  });
}
