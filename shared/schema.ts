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
  // New columns for streaming and web scraping capabilities
  mode: varchar("mode").default("static"), // "static", "stream", "refreshable"
  retentionDays: integer("retention_days"), // Data retention period in days (nullable)
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

// Streaming and Web Scraping Tables

// Configuration for real-time data streams
export const streamingSources = pgTable("streaming_sources", {
  id: varchar("id").primaryKey().notNull(),
  datasetId: varchar("dataset_id").notNull(), // FK to datasets
  protocol: varchar("protocol").notNull(), // "websocket", "sse", "poll"
  endpoint: varchar("endpoint").notNull(),
  headers: jsonb("headers"), // HTTP headers
  params: jsonb("params"), // Query parameters or connection config
  parseSpec: jsonb("parse_spec"), // How to parse incoming data
  batchSize: integer("batch_size").default(1000),
  flushMs: integer("flush_ms").default(5000), // Flush interval in milliseconds
  maxBuffer: integer("max_buffer").default(100000), // Maximum buffer size
  dedupeKeyPath: varchar("dedupe_key_path"), // JSONPath for deduplication key
  timestampPath: varchar("timestamp_path"), // JSONPath for timestamp extraction
  status: varchar("status").default("inactive"), // "active", "inactive", "error"
  lastCheckpoint: varchar("last_checkpoint"), // Last processed position
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  datasetIdIdx: index("streaming_sources_dataset_id_idx").on(table.datasetId),
  statusIdx: index("streaming_sources_status_idx").on(table.status),
}));

// Micro-batches of streaming data
export const streamChunks = pgTable("stream_chunks", {
  id: varchar("id").primaryKey().notNull(),
  datasetId: varchar("dataset_id").notNull(), // FK to datasets
  seq: integer("seq").notNull(), // Sequence number for ordering
  fromTs: timestamp("from_ts").notNull(), // Start timestamp for this chunk
  toTs: timestamp("to_ts").notNull(), // End timestamp for this chunk
  recordCount: integer("record_count").notNull(),
  storageUri: varchar("storage_uri").notNull(), // Location of chunk data
  checksum: varchar("checksum"), // Data integrity verification
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  datasetIdIdx: index("stream_chunks_dataset_id_idx").on(table.datasetId),
  seqIdx: index("stream_chunks_seq_idx").on(table.datasetId, table.seq),
  timestampIdx: index("stream_chunks_timestamp_idx").on(table.fromTs, table.toTs),
}));

// Position tracking for streams
export const streamCheckpoints = pgTable("stream_checkpoints", {
  id: varchar("id").primaryKey().notNull(),
  sourceId: varchar("source_id").notNull(), // FK to streaming_sources
  cursor: text("cursor").notNull(), // Stream position cursor
  ts: timestamp("ts").defaultNow(), // Checkpoint timestamp
}, (table) => ({
  sourceIdIdx: index("stream_checkpoints_source_id_idx").on(table.sourceId),
}));

// Web scraping job configurations
export const scrapingJobs = pgTable("scraping_jobs", {
  id: varchar("id").primaryKey().notNull(),
  datasetId: varchar("dataset_id").notNull(), // FK to datasets
  strategy: varchar("strategy").notNull(), // "http", "puppeteer"
  targetUrl: varchar("target_url").notNull(),
  schedule: varchar("schedule"), // Cron expression for scheduling
  extractionSpec: jsonb("extraction_spec"), // Selectors and extraction rules
  paginationSpec: jsonb("pagination_spec"), // Pagination handling
  loginSpec: jsonb("login_spec"), // Authentication configuration
  rateLimitRPM: integer("rate_limit_rpm").default(60), // Requests per minute
  concurrency: integer("concurrency").default(1), // Concurrent requests
  respectRobots: boolean("respect_robots").default(true), // Honor robots.txt
  status: varchar("status").default("inactive"), // "active", "inactive", "running", "error"
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  datasetIdIdx: index("scraping_jobs_dataset_id_idx").on(table.datasetId),
  statusIdx: index("scraping_jobs_status_idx").on(table.status),
  nextRunIdx: index("scraping_jobs_next_run_idx").on(table.nextRunAt),
}));

// Individual scraping execution records
export const scrapingRuns = pgTable("scraping_runs", {
  id: varchar("id").primaryKey().notNull(),
  jobId: varchar("job_id").notNull(), // FK to scraping_jobs
  startedAt: timestamp("started_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
  status: varchar("status").default("running"), // "running", "completed", "failed"
  recordCount: integer("record_count"),
  artifactId: varchar("artifact_id"), // FK to project_artifacts if applicable
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  jobIdIdx: index("scraping_runs_job_id_idx").on(table.jobId),
  statusIdx: index("scraping_runs_status_idx").on(table.status),
}));

// Snapshot versioning for datasets
export const datasetVersions = pgTable("dataset_versions", {
  id: varchar("id").primaryKey().notNull(),
  datasetId: varchar("dataset_id").notNull(), // FK to datasets
  version: integer("version").notNull(), // Version number (incremental)
  recordCount: integer("record_count").notNull(),
  schema: jsonb("schema"), // Schema snapshot at this version
  snapshotUri: varchar("snapshot_uri").notNull(), // Location of versioned data
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  datasetIdIdx: index("dataset_versions_dataset_id_idx").on(table.datasetId),
  versionIdx: index("dataset_versions_version_idx").on(table.datasetId, table.version),
}));

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

// Insert schemas for streaming and web scraping tables
export const insertStreamingSourceSchema = createInsertSchema(streamingSources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStreamChunkSchema = createInsertSchema(streamChunks).omit({
  id: true,
  createdAt: true,
});

export const insertStreamCheckpointSchema = createInsertSchema(streamCheckpoints).omit({
  id: true,
});

export const insertScrapingJobSchema = createInsertSchema(scrapingJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertScrapingRunSchema = createInsertSchema(scrapingRuns).omit({
  id: true,
  createdAt: true,
});

export const insertDatasetVersionSchema = createInsertSchema(datasetVersions).omit({
  id: true,
  createdAt: true,
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
// Types for streaming and web scraping tables
export type StreamingSource = typeof streamingSources.$inferSelect;
export type InsertStreamingSource = typeof insertStreamingSourceSchema._type;
export type StreamChunk = typeof streamChunks.$inferSelect;
export type InsertStreamChunk = typeof insertStreamChunkSchema._type;
export type StreamCheckpoint = typeof streamCheckpoints.$inferSelect;
export type InsertStreamCheckpoint = typeof insertStreamCheckpointSchema._type;
export type ScrapingJob = typeof scrapingJobs.$inferSelect;
export type InsertScrapingJob = typeof insertScrapingJobSchema._type;
export type ScrapingRun = typeof scrapingRuns.$inferSelect;
export type InsertScrapingRun = typeof insertScrapingRunSchema._type;
export type DatasetVersion = typeof datasetVersions.$inferSelect;
export type InsertDatasetVersion = typeof insertDatasetVersionSchema._type;

// =====================================================================
// Comprehensive Zod Validation Schemas for Streaming and Scraping APIs
// =====================================================================

// Streaming Sources Validation Schemas
export const createStreamingSourceSchema = z.object({
  datasetId: z.string().min(1, "Dataset ID is required"),
  protocol: z.enum(['websocket', 'sse', 'poll'], {
    errorMap: () => ({ message: "Protocol must be one of: websocket, sse, poll" })
  }),
  endpoint: z.string().url("Must be a valid URL"),
  headers: z.record(z.string()).optional(),
  params: z.record(z.any()).optional(),
  parseSpec: z.object({
    format: z.enum(['json', 'text', 'csv']).default('json'),
    timestampPath: z.string().optional(),
    dedupeKeyPath: z.string().optional(),
    delimiter: z.string().optional(), // For CSV parsing
    hasHeader: z.boolean().default(true),
    jsonPath: z.string().optional(), // JSONPath for nested data extraction
  }),
  batchSize: z.number().min(1).max(10000).default(1000),
  flushMs: z.number().min(1000).max(300000).default(5000),
  maxBuffer: z.number().min(100).max(100000).default(100000),
  pollInterval: z.number().min(1000).max(3600000).optional(), // For polling protocol
  retryConfig: z.object({
    maxRetries: z.number().min(0).max(10).default(3),
    backoffMs: z.number().min(100).max(30000).default(1000),
    exponentialBackoff: z.boolean().default(true),
  }).optional(),
});

export const updateStreamingSourceSchema = createStreamingSourceSchema.partial().omit({
  datasetId: true, // Cannot change dataset association
});

export const streamingSourceStatusQuerySchema = z.object({
  datasetId: z.string().optional(),
  status: z.enum(['active', 'inactive', 'error']).optional(),
  protocol: z.enum(['websocket', 'sse', 'poll']).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

// Scraping Jobs Validation Schemas
export const createScrapingJobSchema = z.object({
  datasetId: z.string().min(1, "Dataset ID is required"),
  strategy: z.enum(['http', 'puppeteer'], {
    errorMap: () => ({ message: "Strategy must be either 'http' or 'puppeteer'" })
  }),
  targetUrl: z.string().url("Must be a valid URL"),
  schedule: z.string().optional(), // Cron expression - validate with cron parser in route
  extractionSpec: z.object({
    // CSS selectors for data extraction
    selectors: z.record(z.string()).optional(),
    // JSONPath for API responses
    jsonPath: z.string().optional(),
    // Table extraction
    tableSelector: z.string().optional(),
    tableHeaders: z.array(z.string()).optional(),
    // Text content extraction
    textSelector: z.string().optional(),
    textProcessor: z.enum(['raw', 'markdown', 'plain']).default('raw'),
    // Pagination handling
    followPagination: z.object({
      nextSelector: z.string(),
      maxPages: z.number().min(1).max(100),
      waitMs: z.number().min(100).max(10000).default(1000),
    }).optional(),
    // Data transformation
    transformRules: z.array(z.object({
      field: z.string(),
      type: z.enum(['date', 'number', 'boolean', 'string']),
      format: z.string().optional(),
    })).optional(),
  }),
  // Rate limiting and politeness
  rateLimitRPM: z.number().min(1).max(300).default(60),
  respectRobots: z.boolean().default(true),
  maxConcurrency: z.number().min(1).max(10).default(1),
  requestTimeout: z.number().min(1000).max(60000).default(30000),
  // Authentication (optional)
  loginSpec: z.object({
    usernameSelector: z.string(),
    passwordSelector: z.string(),
    submitSelector: z.string(),
    credentials: z.object({
      username: z.string(),
      password: z.string(),
    }),
    loginUrl: z.string().url().optional(),
    successIndicator: z.string().optional(), // CSS selector to verify login success
  }).optional(),
  // Retry configuration
  retryConfig: z.object({
    maxRetries: z.number().min(0).max(5).default(3),
    backoffMs: z.number().min(100).max(10000).default(1000),
    retryOnStatusCodes: z.array(z.number()).default([429, 500, 502, 503, 504]),
  }).optional(),
  // Browser configuration (for Puppeteer strategy)
  browserConfig: z.object({
    headless: z.boolean().default(true),
    viewport: z.object({
      width: z.number().default(1280),
      height: z.number().default(720),
    }).optional(),
    userAgent: z.string().optional(),
    blockResources: z.array(z.enum(['images', 'stylesheets', 'fonts', 'scripts'])).optional(),
  }).optional(),
});

export const updateScrapingJobSchema = createScrapingJobSchema.partial().omit({
  datasetId: true, // Cannot change dataset association
});

export const scrapingJobStatusQuerySchema = z.object({
  datasetId: z.string().optional(),
  status: z.enum(['active', 'inactive', 'running', 'error']).optional(),
  strategy: z.enum(['http', 'puppeteer']).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export const scrapingRunsQuerySchema = z.object({
  jobId: z.string(),
  status: z.enum(['running', 'completed', 'failed']).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

// Live Sources Monitoring Schemas
export const liveSourcesOverviewSchema = z.object({
  period: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
  includeInactive: z.boolean().default(false),
});

export const liveSourcesMetricsSchema = z.object({
  sourceIds: z.array(z.string()).optional(),
  timeRange: z.object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  }).optional(),
  granularity: z.enum(['minute', 'hour', 'day']).default('hour'),
});

export const liveSourcesActivitySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  types: z.array(z.enum(['started', 'stopped', 'error', 'data_received', 'run_completed'])).optional(),
  sourceIds: z.array(z.string()).optional(),
  since: z.coerce.date().optional(),
});

// Project Integration Schemas
export const projectLiveSourcesQuerySchema = z.object({
  projectId: z.string(),
  includeInactive: z.boolean().default(false),
  sourceType: z.enum(['streaming', 'scraping', 'all']).default('all'),
});

export const addLiveSourceToProjectSchema = z.object({
  projectId: z.string(),
  sourceType: z.enum(['streaming', 'scraping']),
  config: z.union([createStreamingSourceSchema, createScrapingJobSchema]),
});

// Response Schemas
export const streamingSourceResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    id: z.string(),
    datasetId: z.string(),
    protocol: z.string(),
    endpoint: z.string(),
    status: z.string(),
    lastCheckpoint: z.string().optional(),
    lastError: z.string().optional(),
    metrics: z.object({
      recordsReceived: z.number(),
      lastActivity: z.date().optional(),
      avgRecordsPerMinute: z.number(),
      errorCount: z.number(),
    }).optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  }).optional(),
  error: z.string().optional(),
});

export const scrapingJobResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    id: z.string(),
    datasetId: z.string(),
    strategy: z.string(),
    targetUrl: z.string(),
    status: z.string(),
    schedule: z.string().optional(),
    lastRunAt: z.date().optional(),
    nextRunAt: z.date().optional(),
    lastError: z.string().optional(),
    metrics: z.object({
      totalRuns: z.number(),
      recordsExtracted: z.number(),
      avgRunDuration: z.number(),
      successRate: z.number(),
    }).optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  }).optional(),
  error: z.string().optional(),
});

export const liveSourcesOverviewResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    streaming: z.object({
      total: z.number(),
      active: z.number(),
      inactive: z.number(),
      error: z.number(),
    }),
    scraping: z.object({
      total: z.number(),
      active: z.number(),
      inactive: z.number(),
      running: z.number(),
      error: z.number(),
    }),
    recentActivity: z.array(z.object({
      id: z.string(),
      type: z.string(),
      sourceType: z.enum(['streaming', 'scraping']),
      sourceId: z.string(),
      message: z.string(),
      timestamp: z.date(),
      metadata: z.record(z.any()).optional(),
    })),
    metrics: z.object({
      totalDataReceived: z.number(),
      activeSources: z.number(),
      errorRate: z.number(),
    }),
  }).optional(),
  error: z.string().optional(),
});

// Control Action Schemas
export const sourceControlActionSchema = z.object({
  action: z.enum(['start', 'stop', 'restart', 'pause', 'resume']),
  force: z.boolean().default(false),
  config: z.record(z.any()).optional(), // Override config for this action
});

export const runOnceRequestSchema = z.object({
  jobId: z.string(),
  overrideConfig: z.record(z.any()).optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

// Bulk Operations Schemas
export const bulkSourceActionSchema = z.object({
  sourceIds: z.array(z.string()).min(1, "At least one source ID required"),
  action: z.enum(['start', 'stop', 'delete']),
  force: z.boolean().default(false),
});

// Error Response Schema
export const apiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  details: z.record(z.any()).optional(),
  code: z.string().optional(),
  timestamp: z.date().optional(),
});

// Success Response Schema (Generic)
export const apiSuccessResponseSchema = z.object({
  success: z.literal(true),
  data: z.any().optional(),
  message: z.string().optional(),
  timestamp: z.date().optional(),
});

// Infer types for all new schemas
export type CreateStreamingSourceRequest = z.infer<typeof createStreamingSourceSchema>;
export type UpdateStreamingSourceRequest = z.infer<typeof updateStreamingSourceSchema>;
export type StreamingSourceStatusQuery = z.infer<typeof streamingSourceStatusQuerySchema>;
export type CreateScrapingJobRequest = z.infer<typeof createScrapingJobSchema>;
export type UpdateScrapingJobRequest = z.infer<typeof updateScrapingJobSchema>;
export type ScrapingJobStatusQuery = z.infer<typeof scrapingJobStatusQuerySchema>;
export type ScrapingRunsQuery = z.infer<typeof scrapingRunsQuerySchema>;
export type LiveSourcesOverviewQuery = z.infer<typeof liveSourcesOverviewSchema>;
export type LiveSourcesMetricsQuery = z.infer<typeof liveSourcesMetricsSchema>;
export type LiveSourcesActivityQuery = z.infer<typeof liveSourcesActivitySchema>;
export type ProjectLiveSourcesQuery = z.infer<typeof projectLiveSourcesQuerySchema>;
export type AddLiveSourceToProjectRequest = z.infer<typeof addLiveSourceToProjectSchema>;
export type StreamingSourceResponse = z.infer<typeof streamingSourceResponseSchema>;
export type ScrapingJobResponse = z.infer<typeof scrapingJobResponseSchema>;
export type LiveSourcesOverviewResponse = z.infer<typeof liveSourcesOverviewResponseSchema>;
export type SourceControlActionRequest = z.infer<typeof sourceControlActionSchema>;
export type RunOnceRequest = z.infer<typeof runOnceRequestSchema>;
export type BulkSourceActionRequest = z.infer<typeof bulkSourceActionSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
export type ApiSuccessResponse = z.infer<typeof apiSuccessResponseSchema>;

// Journey Tracking Schemas - Added for step-by-step user journey management
export const journeySchema = z.object({
  id: z.string(),
  userId: z.string(),
  projectId: z.string().optional(),
  journeyType: z.enum(['non-tech', 'business', 'technical']),
  currentStep: z.enum(['prepare', 'data', 'execute']),
  title: z.string().optional(),
  description: z.string().optional(),
  goals: z.array(z.string()).optional(),
  questions: z.array(z.string()).optional(),
  suggestedPlan: z.object({
    datasets: z.array(z.string()).optional(),
    templates: z.array(z.string()).optional(),
    analysisSteps: z.array(z.string()).optional(),
    estimatedDuration: z.string().optional(),
  }).optional(),
  selectedDatasets: z.array(z.string()).optional(),
  costEstimateId: z.string().optional(), // Reference to separate CostEstimate table
  eligibilityCheckId: z.string().optional(), // Reference to separate EligibilityCheck table
  artifacts: z.array(z.object({
    id: z.string(),
    type: z.enum(['report', 'visualization', 'dataset', 'model']),
    name: z.string(),
    path: z.string(),
    createdAt: z.date(),
  })).optional(),
  completedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const journeyStepProgressSchema = z.object({
  id: z.string(),
  journeyId: z.string(),
  step: z.enum(['prepare', 'data', 'execute']),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  progress: z.number().min(0).max(100).default(0),
  stepData: z.any().optional(), // Store step-specific data
  errors: z.array(z.string()).optional(),
  costIncurred: z.number().default(0),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const costEstimateSchema = z.object({
  id: z.string(),
  journeyId: z.string().optional(),
  userId: z.string(),
  estimateType: z.enum(['preparation', 'data_processing', 'analysis', 'full_journey']),
  items: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    total: z.number(),
  })),
  subtotal: z.number(),
  discounts: z.number().default(0),
  taxes: z.number().default(0),
  total: z.number(),
  currency: z.string().default('USD'),
  signature: z.string(), // Cryptographic signature to prevent tampering
  validUntil: z.date(),
  approved: z.boolean().default(false),
  approvedAt: z.date().optional(),
  createdAt: z.date(),
});

export const eligibilitySchema = z.object({
  id: z.string(),
  userId: z.string(),
  feature: z.string(),
  allowed: z.boolean(),
  reason: z.string().optional(),
  requiredTier: z.string().optional(),
  currentUsage: z.object({
    monthly: z.number().optional(),
    total: z.number().optional(),
  }).optional(),
  limits: z.object({
    monthly: z.number().optional(),
    total: z.number().optional(),
  }).optional(),
  nextResetAt: z.date().optional(),
  checkResult: z.enum(['allowed', 'limit_exceeded', 'tier_required', 'payment_required']),
  createdAt: z.date(),
});

// Database Table Definitions for Journey Tracking
export const journeys = pgTable(
  "journeys",
  {
    id: varchar("id").primaryKey(),
    userId: varchar("user_id").notNull(),
    projectId: varchar("project_id"),
    journeyType: varchar("journey_type").notNull(),
    currentStep: varchar("current_step").notNull(),
    title: text("title"),
    description: text("description"),
    goals: jsonb("goals").$type<string[]>(),
    questions: jsonb("questions").$type<string[]>(),
    suggestedPlan: jsonb("suggested_plan"),
    selectedDatasets: jsonb("selected_datasets").$type<string[]>(),
    costEstimateId: varchar("cost_estimate_id"),
    eligibilityCheckId: varchar("eligibility_check_id"),
    artifacts: jsonb("artifacts"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("journeys_user_id_idx").on(table.userId),
    projectIdIdx: index("journeys_project_id_idx").on(table.projectId),
    journeyTypeIdx: index("journeys_journey_type_idx").on(table.journeyType),
  })
);

export const journeyStepProgress = pgTable(
  "journey_step_progress",
  {
    id: varchar("id").primaryKey(),
    journeyId: varchar("journey_id").notNull(),
    step: varchar("step").notNull(),
    status: varchar("status").notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    progress: integer("progress").default(0),
    stepData: jsonb("step_data"),
    errors: jsonb("errors").$type<string[]>(),
    costIncurred: integer("cost_incurred").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    journeyIdIdx: index("journey_step_progress_journey_id_idx").on(table.journeyId),
    stepIdx: index("journey_step_progress_step_idx").on(table.step),
  })
);

export const costEstimates = pgTable(
  "cost_estimates",
  {
    id: varchar("id").primaryKey(),
    journeyId: varchar("journey_id"),
    userId: varchar("user_id").notNull(),
    estimateType: varchar("estimate_type").notNull(),
    items: jsonb("items").notNull(),
    subtotal: integer("subtotal").notNull(),
    discounts: integer("discounts").default(0),
    taxes: integer("taxes").default(0),
    total: integer("total").notNull(),
    currency: varchar("currency").default("USD"),
    signature: text("signature").notNull(),
    validUntil: timestamp("valid_until").notNull(),
    approved: boolean("approved").default(false),
    approvedAt: timestamp("approved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("cost_estimates_user_id_idx").on(table.userId),
    journeyIdIdx: index("cost_estimates_journey_id_idx").on(table.journeyId),
    validUntilIdx: index("cost_estimates_valid_until_idx").on(table.validUntil),
  })
);

export const eligibilityChecks = pgTable(
  "eligibility_checks",
  {
    id: varchar("id").primaryKey(),
    userId: varchar("user_id").notNull(),
    feature: varchar("feature").notNull(),
    allowed: boolean("allowed").notNull(),
    reason: text("reason"),
    requiredTier: varchar("required_tier"),
    currentUsage: jsonb("current_usage"),
    limits: jsonb("limits"),
    nextResetAt: timestamp("next_reset_at"),
    checkResult: varchar("check_result").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("eligibility_checks_user_id_idx").on(table.userId),
    featureIdx: index("eligibility_checks_feature_idx").on(table.feature),
    userFeatureIdx: index("eligibility_checks_user_feature_idx").on(table.userId, table.feature),
  })
);

// Insert Schemas for Journey Tracking
export const insertJourneySchema = createInsertSchema(journeys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertJourneyStepProgressSchema = createInsertSchema(journeyStepProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCostEstimateSchema = createInsertSchema(costEstimates).omit({
  id: true,
  createdAt: true,
});

export const insertEligibilityCheckSchema = createInsertSchema(eligibilityChecks).omit({
  id: true,
  createdAt: true,
});

// Pricing Request/Response Schemas
export const pricingEstimateRequestSchema = z.object({
  journeyType: z.enum(['guided', 'business', 'technical']),
  features: z.array(z.enum(['preparation', 'data_processing', 'analysis', 'visualization', 'ai_insights'])),
  dataSizeMB: z.number().min(0).max(1000), // Max 1GB for initial implementation
  complexityLevel: z.enum(['basic', 'intermediate', 'advanced']).default('basic'),
  expectedQuestions: z.number().min(1).max(20).default(5),
  journeyId: z.string().optional(),
});

export const pricingEstimateResponseSchema = z.object({
  success: z.boolean(),
  estimateId: z.string(),
  items: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    total: z.number(),
  })),
  subtotal: z.number(),
  discounts: z.number(),
  total: z.number(),
  currency: z.string(),
  signature: z.string(),
  validUntil: z.date(),
  expiresInMs: z.number(),
  error: z.string().optional(),
});

export const pricingVerifyRequestSchema = z.object({
  estimateId: z.string(),
  signature: z.string(),
});

export const pricingConfirmRequestSchema = z.object({
  estimateId: z.string(),
  signature: z.string(),
  journeyId: z.string(),
});

export const eligibilityCheckRequestSchema = z.object({
  features: z.array(z.enum(['preparation', 'data_processing', 'analysis', 'visualization', 'ai_insights'])),
  dataSizeMB: z.number().min(0),
  journeyType: z.enum(['guided', 'business', 'technical']),
});

export const eligibilityCheckResponseSchema = z.object({
  success: z.boolean(),
  eligible: z.boolean(),
  checkId: z.string(),
  blockedFeatures: z.array(z.object({
    feature: z.string(),
    reason: z.string(),
    requiredTier: z.string().optional(),
    upgradeRequired: z.boolean(),
  })),
  currentTier: z.string(),
  usage: z.object({
    monthlyUploads: z.number(),
    monthlyDataVolume: z.number(),
    monthlyAIInsights: z.number(),
  }),
  limits: z.object({
    monthlyUploads: z.number(),
    monthlyDataVolume: z.number(),
    monthlyAIInsights: z.number(),
  }),
  nextResetAt: z.date().optional(),
  upgradeRecommendation: z.string().optional(),
  error: z.string().optional(),
});

// Goal Extraction Request/Response Schemas
export const goalExtractionRequestSchema = z.object({
  userDescription: z.string().min(10, 'Please provide a detailed description of at least 10 characters'),
  journeyType: z.enum(['guided', 'business', 'technical']),
  context: z.object({
    industry: z.string().optional(),
    businessRole: z.string().optional(),
    technicalLevel: z.enum(['basic', 'intermediate', 'advanced']).optional(),
    dataTypes: z.array(z.string()).optional(),
    previousAnalysisExperience: z.boolean().optional(),
  }).optional(),
  journeyId: z.string().optional(),
});

export const goalExtractionResponseSchema = z.object({
  success: z.boolean(),
  extractionId: z.string(),
  extractedGoals: z.array(z.object({
    goal: z.string(),
    description: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
    category: z.enum(['business_insight', 'prediction', 'optimization', 'exploration', 'validation']),
  })),
  businessQuestions: z.array(z.object({
    question: z.string(),
    type: z.enum(['descriptive', 'diagnostic', 'predictive', 'prescriptive']),
    complexity: z.enum(['basic', 'intermediate', 'advanced']),
    dataRequirements: z.array(z.string()),
  })),
  suggestedAnalysisPaths: z.array(z.object({
    name: z.string(),
    type: z.enum(['statistical', 'machine_learning', 'visualization', 'business_intelligence', 'time_series']),
    description: z.string(),
    complexity: z.enum(['basic', 'intermediate', 'advanced']),
    estimatedDuration: z.string(),
    expectedOutcomes: z.array(z.string()),
    requiredFeatures: z.array(z.enum(['preparation', 'data_processing', 'analysis', 'visualization', 'ai_insights'])),
    confidence: z.number().min(0).max(100),
  })),
  dataRequirements: z.object({
    estimatedColumns: z.number().optional(),
    estimatedRows: z.number().optional(),
    requiredDataTypes: z.array(z.string()),
    qualityRequirements: z.array(z.string()),
  }),
  recommendedFeatures: z.array(z.enum(['preparation', 'data_processing', 'analysis', 'visualization', 'ai_insights'])),
  aiProvider: z.string(),
  processingTimeMs: z.number(),
  error: z.string().optional(),
});

// Type Exports for Journey Tracking
export type Journey = z.infer<typeof journeySchema>;
export type JourneyStepProgress = z.infer<typeof journeyStepProgressSchema>;
export type CostEstimate = z.infer<typeof costEstimateSchema>;
export type EligibilityCheck = z.infer<typeof eligibilitySchema>;

// Type Exports for Pricing Requests/Responses
export type PricingEstimateRequest = z.infer<typeof pricingEstimateRequestSchema>;
export type PricingEstimateResponse = z.infer<typeof pricingEstimateResponseSchema>;
export type PricingVerifyRequest = z.infer<typeof pricingVerifyRequestSchema>;
export type PricingConfirmRequest = z.infer<typeof pricingConfirmRequestSchema>;
export type EligibilityCheckRequest = z.infer<typeof eligibilityCheckRequestSchema>;
export type EligibilityCheckResponse = z.infer<typeof eligibilityCheckResponseSchema>;
export type GoalExtractionRequest = z.infer<typeof goalExtractionRequestSchema>;
export type GoalExtractionResponse = z.infer<typeof goalExtractionResponseSchema>;

export type InsertJourney = z.infer<typeof insertJourneySchema>;
export type InsertJourneyStepProgress = z.infer<typeof insertJourneyStepProgressSchema>;
export type InsertCostEstimate = z.infer<typeof insertCostEstimateSchema>;
export type InsertEligibilityCheck = z.infer<typeof insertEligibilityCheckSchema>;

export type SelectJourney = typeof journeys.$inferSelect;
export type SelectJourneyStepProgress = typeof journeyStepProgress.$inferSelect;
export type SelectCostEstimate = typeof costEstimates.$inferSelect;
export type SelectEligibilityCheck = typeof eligibilityChecks.$inferSelect;

// Real-time Event Schemas
export const realtimeEventSchema = z.object({
  type: z.enum(['status_change', 'metrics_update', 'error', 'progress', 'job_complete', 'connection_test', 'data_received', 'buffer_status']),
  sourceType: z.enum(['streaming', 'scraping']),
  sourceId: z.string(),
  userId: z.string(),
  projectId: z.string().optional(),
  timestamp: z.date(),
  data: z.any(),
});

export const clientConnectionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  subscriptions: z.array(z.string()),
  lastActivity: z.date(),
  metadata: z.object({
    userAgent: z.string().optional(),
    ipAddress: z.string().optional(),
  }),
});

export const broadcastOptionsSchema = z.object({
  userId: z.string().optional(),
  projectId: z.string().optional(),
  sourceId: z.string().optional(),
  sourceType: z.enum(['streaming', 'scraping']).optional(),
  excludeClient: z.string().optional(),
});

// Streaming Events Data Schemas
export const streamingConnectionEstablishedSchema = z.object({
  endpoint: z.string(),
  protocol: z.string(),
  timestamp: z.date(),
});

export const streamingConnectionLostSchema = z.object({
  endpoint: z.string(),
  error: z.string(),
  timestamp: z.date(),
});

export const streamingDataReceivedSchema = z.object({
  recordCount: z.number(),
  batchSize: z.number(),
  timestamp: z.date(),
});

export const streamingBufferStatusSchema = z.object({
  currentSize: z.number(),
  maxSize: z.number(),
  flushPending: z.boolean(),
});

export const streamingErrorOccurredSchema = z.object({
  error: z.string(),
  severity: z.enum(['warning', 'error']),
  timestamp: z.date(),
});

export const streamingMetricsUpdateSchema = z.object({
  recordsPerSecond: z.number(),
  totalRecords: z.number(),
  avgProcessingTime: z.number(),
  errorRate: z.number(),
});

// Scraping Events Data Schemas
export const scrapingJobStartedSchema = z.object({
  jobId: z.string(),
  strategy: z.string(),
  targetUrl: z.string(),
  timestamp: z.date(),
});

export const scrapingJobCompletedSchema = z.object({
  jobId: z.string(),
  success: z.boolean(),
  recordsExtracted: z.number(),
  duration: z.number(),
});

export const scrapingPageScrapedSchema = z.object({
  jobId: z.string(),
  url: z.string(),
  recordsFound: z.number(),
  pageNumber: z.number(),
});

export const scrapingExtractionProgressSchema = z.object({
  jobId: z.string(),
  pagesCompleted: z.number(),
  totalPages: z.number(),
  estimatedRemaining: z.number(),
});

export const scrapingRateLimitHitSchema = z.object({
  jobId: z.string(),
  domain: z.string(),
  nextAllowedTime: z.date(),
});

export const scrapingErrorOccurredSchema = z.object({
  jobId: z.string(),
  url: z.string(),
  error: z.string(),
  willRetry: z.boolean(),
});

// Real-time Server Stats Schema
export const realtimeServerStatsSchema = z.object({
  totalConnections: z.number(),
  connectionsPerUser: z.record(z.number()),
  totalUsers: z.number(),
  serverUptime: z.number(),
});

// WebSocket Message Schemas
export const websocketSubscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  channels: z.array(z.string()),
});

export const websocketUnsubscribeMessageSchema = z.object({
  type: z.literal('unsubscribe'),
  channels: z.array(z.string()),
});

export const websocketPingMessageSchema = z.object({
  type: z.literal('ping'),
});

export const websocketMessageSchema = z.union([
  websocketSubscribeMessageSchema,
  websocketUnsubscribeMessageSchema,
  websocketPingMessageSchema,
]);

// Infer types for real-time schemas
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export type ClientConnection = z.infer<typeof clientConnectionSchema>;
export type BroadcastOptions = z.infer<typeof broadcastOptionsSchema>;
export type StreamingConnectionEstablished = z.infer<typeof streamingConnectionEstablishedSchema>;
export type StreamingConnectionLost = z.infer<typeof streamingConnectionLostSchema>;
export type StreamingDataReceived = z.infer<typeof streamingDataReceivedSchema>;
export type StreamingBufferStatus = z.infer<typeof streamingBufferStatusSchema>;
export type StreamingErrorOccurred = z.infer<typeof streamingErrorOccurredSchema>;
export type StreamingMetricsUpdate = z.infer<typeof streamingMetricsUpdateSchema>;
export type ScrapingJobStarted = z.infer<typeof scrapingJobStartedSchema>;
export type ScrapingJobCompleted = z.infer<typeof scrapingJobCompletedSchema>;
export type ScrapingPageScraped = z.infer<typeof scrapingPageScrapedSchema>;
export type ScrapingExtractionProgress = z.infer<typeof scrapingExtractionProgressSchema>;
export type ScrapingRateLimitHit = z.infer<typeof scrapingRateLimitHitSchema>;
export type ScrapingErrorOccurred = z.infer<typeof scrapingErrorOccurredSchema>;
export type RealtimeServerStats = z.infer<typeof realtimeServerStatsSchema>;
export type WebSocketMessage = z.infer<typeof websocketMessageSchema>;
