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

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").notNull(),
  token: varchar("token").notNull(),
  code: varchar("code", { length: 6 }).notNull(), // 6-digit verification code
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  emailIdx: index("password_reset_email_idx").on(table.email),
  tokenIdx: index("password_reset_token_idx").on(table.token),
}));

// Datasets table - files exist independently of projects
export const datasets = pgTable("datasets", {
  id: varchar("id").primaryKey().notNull(),
  ownerId: varchar("owner_id").notNull(), // Reference to users.id
  sourceType: varchar("source_type").notNull().default("upload"), // "upload", "google_drive", "web", "api"
  originalFileName: varchar("original_file_name").notNull(),
  mimeType: varchar("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  checksum: varchar("checksum"), // For duplicate detection
  storageUri: varchar("storage_uri").notNull(), // File storage location
  dataType: varchar("data_type").default("tabular"), // "tabular", "document", "timeseries"
  schema: jsonb("schema"), // JSON schema of the data
  recordCount: integer("record_count"),
  preview: jsonb("preview"), // Sample rows for preview
  piiAnalysis: jsonb("pii_analysis"),
  ingestionMetadata: jsonb("ingestion_metadata"), // Source-specific metadata
  status: varchar("status").default("ready"), // "processing", "ready", "error"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Many-to-many relationship between projects and datasets
export const projectDatasets = pgTable("project_datasets", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").notNull(),
  datasetId: varchar("dataset_id").notNull(),
  role: varchar("role").default("primary"), // "primary", "secondary", "joined"
  alias: varchar("alias"), // Custom name for this dataset in the project
  addedAt: timestamp("added_at").defaultNow(),
}, (table) => ({
  projectDatasetIdx: index("project_dataset_idx").on(table.projectId, table.datasetId),
}));

// Project artifacts - track entire workflow from ingestion to results
export const projectArtifacts = pgTable("project_artifacts", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").notNull(),
  type: varchar("type").notNull(), // "ingestion", "transformation", "analysis", "visualization", "report", "export"
  status: varchar("status").default("pending"), // "pending", "processing", "completed", "error"
  inputRefs: jsonb("input_refs"), // Array of datasetIds, artifactIds that were inputs
  params: jsonb("params"), // Configuration/parameters used
  metrics: jsonb("metrics"), // Performance metrics, processing time, etc.
  output: jsonb("output"), // Results data
  fileRefs: jsonb("file_refs"), // URIs to generated files (PDFs, charts, etc.)
  parentArtifactId: varchar("parent_artifact_id"), // Chain artifacts together
  createdBy: varchar("created_by"), // User who created this artifact
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  projectArtifactIdx: index("project_artifact_idx").on(table.projectId),
  parentArtifactIdx: index("parent_artifact_idx").on(table.parentArtifactId),
}));

// Updated projects table - now a lightweight container for analysis workflows
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().notNull(),
  ownerId: varchar("owner_id").notNull(), // Reference to users.id
  name: varchar("name").notNull(),
  description: text("description"),
  status: varchar("status").default("active"), // "active", "completed", "archived"
  journeyType: varchar("journey_type"), // "ai_guided", "template_based", "self_service", "consultation"
  lastArtifactId: varchar("last_artifact_id"), // Quick reference to latest artifact
  // Legacy fields for backward compatibility (will be deprecated)
  fileName: varchar("file_name"), // DEPRECATED
  fileSize: integer("file_size"), // DEPRECATED
  fileType: varchar("file_type"), // DEPRECATED
  uploadedAt: timestamp("uploaded_at").defaultNow(), // DEPRECATED
  isTrial: boolean("is_trial").default(false), // DEPRECATED
  schema: jsonb("schema"), // DEPRECATED
  recordCount: integer("record_count"), // DEPRECATED
  data: jsonb("data"), // DEPRECATED
  processed: boolean("processed").default(false), // DEPRECATED
  piiAnalysis: jsonb("pii_analysis"), // DEPRECATED
  uniqueIdentifiers: jsonb("unique_identifiers"), // DEPRECATED
  dataSource: varchar("data_source").default("upload"), // DEPRECATED
  sourceMetadata: jsonb("source_metadata"), // DEPRECATED
  transformations: jsonb("transformations"), // DEPRECATED
  joinedFiles: jsonb("joined_files"), // DEPRECATED
  outlierAnalysis: jsonb("outlier_analysis"), // DEPRECATED
  missingDataAnalysis: jsonb("missing_data_analysis"), // DEPRECATED
  normalityTests: jsonb("normality_tests"), // DEPRECATED
  analysisResults: jsonb("analysis_results"), // DEPRECATED
  stepByStepAnalysis: jsonb("step_by_step_analysis"), // DEPRECATED
  visualizations: jsonb("visualizations"), // DEPRECATED
  aiInsights: jsonb("ai_insights"), // DEPRECATED
  aiRole: varchar("ai_role"), // DEPRECATED
  aiActions: jsonb("ai_actions"), // DEPRECATED
  mcpResources: jsonb("mcp_resources"), // DEPRECATED
  purchasedFeatures: jsonb("purchased_features"), // DEPRECATED
  isPaid: boolean("is_paid").default(false), // DEPRECATED
  selectedFeatures: jsonb("selected_features"), // DEPRECATED
  paymentIntentId: varchar("payment_intent_id"), // DEPRECATED
  upgradedAt: timestamp("upgraded_at"), // DEPRECATED
  userId: varchar("user_id"), // DEPRECATED - use ownerId instead
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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

// New insert schemas for new tables
export const insertDatasetSchema = createInsertSchema(datasets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectDatasetSchema = createInsertSchema(projectDatasets).omit({
  id: true,
  addedAt: true,
});

export const insertProjectArtifactSchema = createInsertSchema(projectArtifacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Updated project insert schema
export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  // Omit deprecated fields from inserts
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

// Types for database operations
export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;
export type Dataset = typeof datasets.$inferSelect;
export type InsertDataset = typeof insertDatasetSchema._type;
export type ProjectDataset = typeof projectDatasets.$inferSelect;
export type InsertProjectDataset = typeof insertProjectDatasetSchema._type;
export type ProjectArtifact = typeof projectArtifacts.$inferSelect;
export type InsertProjectArtifact = typeof insertProjectArtifactSchema._type;
export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof insertProjectSchema._type;
export type EnterpriseInquiry = typeof enterpriseInquiries.$inferSelect;
export type InsertEnterpriseInquiry = typeof insertEnterpriseInquirySchema._type;
export type GuidedAnalysisOrder = typeof guidedAnalysisOrders.$inferSelect;
export type InsertGuidedAnalysisOrder = typeof insertGuidedAnalysisOrderSchema._type;