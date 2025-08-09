import { z } from "zod";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Data project schema with advanced capabilities
export const dataProjectSchema = z.object({
  id: z.string(),
  userId: z.string(),
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
  data: z.array(z.record(z.any())).optional(), // Store actual data rows
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

// Database Tables
// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table with tiered subscription support
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique().notNull(),
  hashedPassword: varchar("hashed_password"), // For email/password auth
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  provider: varchar("provider").notNull().default("email"), // "email", "google", "github"
  providerId: varchar("provider_id"), // OAuth provider user ID
  
  // Email verification
  emailVerified: boolean("email_verified").default(false),
  emailVerificationToken: varchar("email_verification_token"),
  emailVerificationExpires: timestamp("email_verification_expires"),
  
  // Password reset
  passwordResetToken: varchar("password_reset_token"),
  passwordResetExpires: timestamp("password_reset_expires"),
  
  // Subscription and payment tiers
  subscriptionTier: varchar("subscription_tier").default("none"), // "none", "trial", "starter", "professional", "enterprise"
  subscriptionStatus: varchar("subscription_status").default("inactive"), // "active", "inactive", "cancelled", "past_due"
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  
  // Usage tracking for tier limits
  monthlyUploads: integer("monthly_uploads").default(0),
  monthlyDataVolume: integer("monthly_data_volume").default(0), // in MB
  monthlyAIInsights: integer("monthly_ai_insights").default(0),
  usageResetAt: timestamp("usage_reset_at").defaultNow(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Main projects table for persistent storage
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().notNull(),
  name: varchar("name").notNull(),
  fileName: varchar("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  fileType: varchar("file_type").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  description: text("description"),
  isTrial: boolean("is_trial").default(false),
  schema: jsonb("schema"), // JSON schema of the data
  recordCount: integer("record_count"),
  data: jsonb("data"), // Store actual data rows as JSON
  processed: boolean("processed").default(false),
  // PII Analysis
  piiAnalysis: jsonb("pii_analysis"),
  uniqueIdentifiers: jsonb("unique_identifiers"),
  dataSource: varchar("data_source").default("upload"),
  sourceMetadata: jsonb("source_metadata"),
  // Data transformation capabilities
  transformations: jsonb("transformations"),
  joinedFiles: jsonb("joined_files"),
  outlierAnalysis: jsonb("outlier_analysis"),
  missingDataAnalysis: jsonb("missing_data_analysis"),
  normalityTests: jsonb("normality_tests"),
  // Advanced analysis capabilities
  analysisResults: jsonb("analysis_results"),
  stepByStepAnalysis: jsonb("step_by_step_analysis"),
  // AI capabilities
  visualizations: jsonb("visualizations"),
  aiInsights: jsonb("ai_insights"),
  aiRole: varchar("ai_role"),
  aiActions: jsonb("ai_actions"),
  mcpResources: jsonb("mcp_resources"),
  purchasedFeatures: jsonb("purchased_features"),
  isPaid: boolean("is_paid").default(false),
  selectedFeatures: jsonb("selected_features"),
  paymentIntentId: varchar("payment_intent_id"),
  upgradedAt: timestamp("upgraded_at"),
  // Foreign key to users if needed
  userId: varchar("user_id"),
});

// Enterprise inquiries table
export const enterpriseInquiries = pgTable("enterprise_inquiries", {
  id: varchar("id").primaryKey().notNull(),
  companyName: varchar("company_name").notNull(),
  contactEmail: varchar("contact_email").notNull(),
  contactName: varchar("contact_name").notNull(),
  phone: varchar("phone"),
  message: text("message"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  status: varchar("status").default("pending"),
});

// Guided analysis orders table
export const guidedAnalysisOrders = pgTable("guided_analysis_orders", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id"),
  projectId: varchar("project_id"),
  analysisConfig: jsonb("analysis_config"),
  orderData: jsonb("order_data"),
  status: varchar("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Dynamic pricing workflows table
export const pricingWorkflows = pgTable("pricing_workflows", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").notNull(),
  userId: varchar("user_id").notNull(),
  currentStep: varchar("current_step").notNull().default("file_upload"),
  stepData: jsonb("step_data"),
  selectedFeatures: jsonb("selected_features"),
  featureConfigurations: jsonb("feature_configurations"),
  estimatedCost: integer("estimated_cost"), // in cents
  finalCost: integer("final_cost"), // in cents
  pricingBreakdown: jsonb("pricing_breakdown"),
  status: varchar("status").default("in_progress"), // in_progress, completed, cancelled, paid
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Feature requirements tracking table
export const featureRequirements = pgTable("feature_requirements", {
  id: varchar("id").primaryKey().notNull(),
  workflowId: varchar("workflow_id").notNull(),
  feature: varchar("feature").notNull(), // data_transformation, data_analysis, etc.
  requirements: jsonb("requirements"), // specific feature configuration
  estimatedCost: integer("estimated_cost"), // in cents
  complexity: varchar("complexity").default("medium"), // low, medium, high, very_high
  processingTime: integer("processing_time"), // estimated minutes
  status: varchar("status").default("pending"), // pending, configured, processing, completed
  results: jsonb("results"), // processing results
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Drizzle insert schemas
export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  uploadedAt: true,
  processed: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEnterpriseInquirySchema = createInsertSchema(enterpriseInquiries).omit({
  id: true,
  submittedAt: true,
});

export const insertGuidedAnalysisOrderSchema = createInsertSchema(guidedAnalysisOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPricingWorkflowSchema = createInsertSchema(pricingWorkflows).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFeatureRequirementSchema = createInsertSchema(featureRequirements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for database operations
export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof insertProjectSchema._type;
export type EnterpriseInquiry = typeof enterpriseInquiries.$inferSelect;
export type InsertEnterpriseInquiry = typeof insertEnterpriseInquirySchema._type;
export type GuidedAnalysisOrder = typeof guidedAnalysisOrders.$inferSelect;
export type InsertGuidedAnalysisOrder = typeof insertGuidedAnalysisOrderSchema._type;
export type PricingWorkflow = typeof pricingWorkflows.$inferSelect;
export type InsertPricingWorkflow = typeof insertPricingWorkflowSchema._type;
export type FeatureRequirement = typeof featureRequirements.$inferSelect;
export type InsertFeatureRequirement = typeof insertFeatureRequirementSchema._type;