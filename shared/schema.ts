import { z } from "zod";

// Data project schema with advanced capabilities
export const dataProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  fileName: z.string(),
  fileSize: z.number(),
  fileType: z.string(),
  uploadedAt: z.date(),
  description: z.string().optional(),
  isTrial: z.boolean().default(false),
  schema: z.record(z.object({
    type: z.string(),
    nullable: z.boolean().optional(),
    sampleValues: z.array(z.string()).optional(),
    description: z.string().optional(),
    isPII: z.boolean().optional(),
    isUniqueIdentifier: z.boolean().optional(),
  })).optional(),
  recordCount: z.number().optional(),
  processed: z.boolean().default(false),
  // Advanced upload capabilities
  piiAnalysis: z.object({
    detectedPII: z.array(z.string()).optional(),
    userConsent: z.boolean().optional(),
    consentTimestamp: z.date().optional(),
  }).optional(),
  uniqueIdentifiers: z.array(z.string()).optional(),
  dataSource: z.enum(["upload", "google_drive", "api"]).default("upload"),
  sourceMetadata: z.record(z.any()).optional(),
  // Data transformation capabilities
  transformations: z.array(z.object({
    type: z.enum(["join", "outlier_detection", "missing_data", "normality_test"]),
    config: z.any(),
    result: z.any().optional(),
  })).optional(),
  joinedFiles: z.array(z.string()).optional(),
  outlierAnalysis: z.object({
    method: z.string(),
    threshold: z.number(),
    outliers: z.array(z.any()).optional(),
  }).optional(),
  missingDataAnalysis: z.object({
    patterns: z.record(z.any()),
    recommendations: z.array(z.string()),
  }).optional(),
  normalityTests: z.record(z.object({
    test: z.string(),
    statistic: z.number(),
    pValue: z.number(),
    isNormal: z.boolean(),
  })).optional(),
  // Advanced analysis capabilities
  analysisResults: z.any().optional(),
  stepByStepAnalysis: z.object({
    question: z.string(),
    targetVariable: z.string(),
    multivariateVariables: z.array(z.string()),
    analysisType: z.enum(["anova", "ancova", "manova", "mancova", "regression", "machine_learning"]),
    results: z.any().optional(),
  }).optional(),
  // AI capabilities
  visualizations: z.array(z.any()).optional(),
  aiInsights: z.any().optional(),
  aiRole: z.string().optional(),
  aiActions: z.array(z.string()).optional(),
  mcpResources: z.array(z.object({
    type: z.string(),
    name: z.string(),
    config: z.any(),
  })).optional(),
  purchasedFeatures: z.array(z.enum(["transformation", "analysis", "visualization", "ai_insights"])).optional(),
  isPaid: z.boolean().default(false),
  selectedFeatures: z.array(z.string()).optional(),
  paymentIntentId: z.string().optional(),
  upgradedAt: z.date().optional(),
});

export type DataProject = z.infer<typeof dataProjectSchema>;

// Insert schema (omit auto-generated fields)
export const insertDataProjectSchema = dataProjectSchema.omit({
  id: true,
  uploadedAt: true,
  processed: true,
});

export type InsertDataProject = z.infer<typeof insertDataProjectSchema>;

// Pricing tiers
export const pricingTierSchema = z.object({
  transformation: z.number().default(15),
  analysis: z.number().default(25),
  visualization: z.number().default(20),
  ai_insights: z.number().default(35),
  // Progressive discounts
  twoFeatures: z.number().default(0.15), // 15% off
  threeFeatures: z.number().default(0.25), // 25% off
  allFeatures: z.number().default(0.35), // 35% off
});

export type PricingTier = z.infer<typeof pricingTierSchema>;

// Free trial request
export const freeTrialRequestSchema = z.object({
  file: z.any(), // File upload
  description: z.string().optional(),
});

export type FreeTrialRequest = z.infer<typeof freeTrialRequestSchema>;

// Progressive feature request
export const featureRequestSchema = z.object({
  projectId: z.string(),
  features: z.array(z.enum(["transformation", "analysis", "visualization", "ai_insights"])),
  paymentIntentId: z.string().optional(),
});

export type FeatureRequest = z.infer<typeof featureRequestSchema>;

// File upload response
export const fileUploadResponseSchema = z.object({
  success: z.boolean(),
  projectId: z.string().optional(),
  project: dataProjectSchema.optional(),
  error: z.string().optional(),
  isTrial: z.boolean().optional(),
  trialResults: z.object({
    schema: z.any(),
    descriptiveAnalysis: z.any(),
    basicVisualizations: z.array(z.any()),
  }).optional(),
});

export type FileUploadResponse = z.infer<typeof fileUploadResponseSchema>;

// AI Configuration
export const aiConfigSchema = z.object({
  provider: z.enum(["chimaridata", "openai", "anthropic", "gemini"]).default("chimaridata"),
  customApiKey: z.string().optional(),
  fallbackEnabled: z.boolean().default(true),
});

export type AIConfig = z.infer<typeof aiConfigSchema>;