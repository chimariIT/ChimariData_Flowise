import { z } from "zod";
import { nanoid } from "nanoid";
import { AnalysisPlanStatusEnum } from "./canonical-types";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  decimal,
  serial,
  doublePrecision,
  check,
  foreignKey,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

// pgvector helper (1536 dimensions)
const vector = customType<{ data: number[] }>({
  dataType: () => "vector(1536)",
  fromDriver: (value) => {
    if (typeof value === "string") {
      try {
        // pgvector returns vectors in format [1,2,3,...]
        return JSON.parse(value) as number[];
      } catch {
        return value as unknown as number[];
      }
    }
    return value as unknown as number[];
  },
  toDriver: (value) => {
    // pgvector expects vectors in format [1,2,3,...]
    if (Array.isArray(value)) {
      return `[${value.join(',')}]`;
    }
    return value;
  },
});

// User role and permission types
export const UserRoleEnum = z.enum(["non-tech", "business", "technical", "consultation", "custom"]);
export type UserRole = z.infer<typeof UserRoleEnum>;

export const TechnicalLevelEnum = z.enum(["beginner", "intermediate", "advanced", "expert"]);
export type TechnicalLevel = z.infer<typeof TechnicalLevelEnum>;

export const JourneyTypeEnum = z.enum(["non-tech", "business", "technical", "consultation", "custom"]);
export type JourneyType = z.infer<typeof JourneyTypeEnum>;

// User role configuration schema
export const userRoleConfigSchema = z.object({
  role: UserRoleEnum,
  technicalLevel: TechnicalLevelEnum,
  industry: z.string().optional(),
  preferredJourney: z.string().optional(),
  journeyCompletions: z.record(z.any()).optional(),
});

export type UserRoleConfig = z.infer<typeof userRoleConfigSchema>;

// User permissions schema
export const userPermissionsSchema = z.object({
  id: z.string(),
  userId: z.string(),
  canAccessNonTechJourney: z.boolean().default(true),
  canAccessBusinessJourney: z.boolean().default(false),
  canAccessTechnicalJourney: z.boolean().default(false),
  canRequestConsultation: z.boolean().default(true),
  canAccessAdvancedAnalytics: z.boolean().default(false),
  canUseCustomAiKeys: z.boolean().default(false),
  canGenerateCode: z.boolean().default(false),
  canAccessRawData: z.boolean().default(false),
  canExportResults: z.boolean().default(true),
  maxConcurrentProjects: z.number().default(1),
  maxDatasetSizeMB: z.number().default(5),
  maxAiQueriesPerMonth: z.number().default(10),
  maxVisualizationsPerProject: z.number().default(3),
  maxComputeMinutesPerMonth: z.number().default(60),
  allowedAiProviders: z.array(z.string()).default(["gemini"]),
  canUseAdvancedModels: z.boolean().default(false),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type UserPermissions = z.infer<typeof userPermissionsSchema>;

export type TechnicalQueryType = z.infer<typeof TechnicalQuery>;

// Data project schema with advanced capabilities
export const dataProjectSchema = z.object({
  id: z.string(),
  userId: z.string(),
  journeyType: JourneyTypeEnum.default("non-tech"),
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
    userDecision: z.string().optional(), // Added field
  }).optional(),
  uniqueIdentifiers: z.array(z.string()).optional(),
  dataSource: z.enum(["upload", "google_drive", "api"]).default("upload"),
  sourceMetadata: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  // Data transformation capabilities
  transformations: z.array(z.object({
    type: z.enum(["join", "outlier_detection", "missing_data", "normality_test"]),
    config: z.any(),
    result: z.any().optional(),
  })).optional(),
  joinedFiles: z.array(z.string()).optional(),
  outlierAnalysis: z.union([
    z.object({
      method: z.string(),
      threshold: z.number(),
      outliers: z.array(z.any()).optional(),
    }),
    z.object({
      method: z.string(),
      threshold: z.number(),
      columns: z.array(z.any()).optional(),
      outliers: z.array(z.any()).optional(),
      profile: z.any().optional(),
      executionId: z.string().optional(),
      generatedAt: z.union([z.string(), z.date()]).optional(),
    })
  ]).optional(),
  missingDataAnalysis: z.union([
    z.object({
      patterns: z.record(z.any()),
      recommendations: z.array(z.string()),
    }),
    z.object({
      summary: z.any(),
      profile: z.any().optional(),
      recommendations: z.array(z.string()).optional(),
      patterns: z.record(z.any()).optional(),
      executionId: z.string().optional(),
      generatedAt: z.union([z.string(), z.date()]).optional(),
    })
  ]).optional(),
  normalityTests: z.union([
    z.record(z.object({
      test: z.string(),
      statistic: z.number(),
      pValue: z.number(),
      isNormal: z.boolean(),
    })),
    z.object({
      generatedAt: z.union([z.string(), z.date()]).optional(),
      columns: z.array(z.object({
        column: z.string(),
        inspected: z.number(),
        mean: z.number().nullable(),
        stdDev: z.number().nullable(),
        skewness: z.number().nullable(),
        kurtosis: z.number().nullable(),
        excessKurtosis: z.number().nullable(),
        normalityScore: z.number().nullable(),
        interpretation: z.string(),
        isApproximatelyNormal: z.boolean(),
      })).optional(),
      descriptiveStatistics: z.any().optional(),
      executionId: z.string().optional(),
    })
  ]).optional(),
  // Advanced analysis capabilities
  analysisResults: z.any().optional(),
  stepByStepAnalysis: z.object({
    question: z.string(),
    targetVariable: z.string(),
    multivariateVariables: z.array(z.string()),
    analysisType: z.enum(["anova", "ancova", "manova", "mancova", "regression", "machine_learning"]),
    results: z.any().optional(),
    analysisPath: z.string().optional(), // Added field
  }).optional(),
  interactiveSession: z.any().optional(), // For agentic workflow state
  costEstimation: z.any().optional(), // For pricing and checkout
  totalCostIncurred: z.union([z.number(), z.string()]).optional(),
  costBreakdown: z.any().optional(),
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
  multiAgentCoordination: z.object({
    coordinationId: z.string().optional(),
    projectId: z.string().optional(),
    expertOpinions: z.array(z.object({
      agentId: z.string(),
      agentName: z.string().optional(),
      opinion: z.record(z.any()).optional(),
      confidence: z.number().optional(),
      timestamp: z.string().optional(),
    })).optional(),
    synthesis: z.object({
      overallAssessment: z.enum(["proceed", "proceed_with_caution", "revise_approach", "not_feasible"]).optional(),
      confidence: z.number().optional(),
      keyFindings: z.array(z.string()).optional(),
      actionableRecommendations: z.array(z.string()).optional(),
      estimatedTimeline: z.string().optional(),
      estimatedCost: z.string().optional(),
      expertConsensus: z.object({
        dataQuality: z.string().optional(),
        technicalFeasibility: z.string().optional(),
        businessValue: z.string().optional(),
      }).optional(),
    }).optional(),
    timestamp: z.union([z.string(), z.date()]).optional(),
    totalResponseTime: z.number().optional(),
  }).optional(),
  purchasedFeatures: z.array(z.enum(["transformation", "analysis", "visualization", "ai_insights"])).optional(),
  isPaid: z.boolean().default(false),
  selectedFeatures: z.array(z.string()).optional(),
  paymentIntentId: z.string().optional(),
  upgradedAt: z.date().optional(),
  transformedData: z.array(z.record(z.any())).optional(), // Added field
  file_path: z.string().optional(), // Added field
  // Database lifecycle fields (from projects pgTable)
  status: z.string().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  lastModified: z.date().optional(),
  // Journey lifecycle fields
  lastArtifactId: z.string().optional(),
  consultationProposalId: z.string().optional(),
  approvedPlanId: z.string().optional(),
  analysisExecutedAt: z.date().optional(),
  analysisBilledAt: z.date().optional(),
  lockedCostEstimate: z.number().optional(),
  // Journey state tracking
  stepCompletionStatus: z.any().optional(),
  lastAccessedStep: z.string().optional(),
  journeyStartedAt: z.date().optional(),
  journeyCompletedAt: z.date().optional(),
  journeyProgress: z.any().optional(),
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

// Trial request
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
  subscriptionTier: varchar("subscription_tier").notNull().default("none").$type<"none" | "trial" | "starter" | "professional" | "enterprise">(), // Admin-configured tiers tied to Stripe
  subscriptionStatus: varchar("subscription_status").default("inactive").$type<"active" | "inactive" | "cancelled" | "past_due" | "expired">(), // Stripe subscription status
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  credits: decimal("credits").default("0"),
  isPaid: boolean("is_paid").default(false), // Added field

  // Usage tracking for tier limits
  monthlyUploads: integer("monthly_uploads").default(0),
  monthlyDataVolume: integer("monthly_data_volume").default(0), // in MB
  monthlyAIInsights: integer("monthly_ai_insights").default(0),
  // Keep extended usage metrics for analytics/billing
  monthlyAnalysisComponents: integer("monthly_analysis_components").default(0),
  monthlyVisualizations: integer("monthly_visualizations").default(0),
  // Storage and processing metrics (kept for backward compatibility and reporting)
  currentStorageGb: decimal("current_storage_gb"),
  monthlyDataProcessedGb: decimal("monthly_data_processed_gb"),
  usageResetAt: timestamp("usage_reset_at").defaultNow(),
  subscriptionBalances: jsonb("subscription_balances").notNull().default(sql`'{}'::jsonb`).$type<Record<string, any>>(),

  // User role and journey preferences
  userRole: varchar("user_role").notNull().default("non-tech"), // "non-tech", "business", "technical", "consultation"
  technicalLevel: varchar("technical_level").default("beginner"), // "beginner", "intermediate", "advanced", "expert"
  industry: varchar("industry"), // User's industry/domain
  preferredJourney: varchar("preferred_journey"), // Last selected journey type
  journeyCompletions: jsonb("journey_completions"), // Track completed journeys
  onboardingCompleted: boolean("onboarding_completed").default(false),

  // Trial credits
  trialCredits: integer("trial_credits").default(100),
  trialCreditsUsed: integer("trial_credits_used").default(0),
  trialCreditsRefreshedAt: timestamp("trial_credits_refreshed_at"),
  trialCreditsExpireAt: timestamp("trial_credits_expire_at"),

  // Legacy columns that exist in database
  isAdmin: boolean("is_admin").default(false),
  role: varchar("role"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // CHECK constraints to enforce admin-configured subscription tiers
  subscriptionTierCheck: check("subscription_tier_check",
    sql`${table.subscriptionTier} IN ('none', 'trial', 'starter', 'professional', 'enterprise')`
  ),
  subscriptionStatusCheck: check("subscription_status_check",
    sql`${table.subscriptionStatus} IN ('active', 'inactive', 'cancelled', 'past_due', 'expired', 'incomplete', 'trialing', 'incomplete_expired')`
  ),
  userRoleCheck: check("user_role_check",
    sql`${table.userRole} IN ('non-tech', 'business', 'technical', 'consultation', 'custom')`
  ),
  technicalLevelCheck: check("technical_level_check",
    sql`${table.technicalLevel} IN ('beginner', 'intermediate', 'advanced', 'expert')`
  ),
  preferredJourneyCheck: check("preferred_journey_check",
    sql`${table.preferredJourney} IS NULL OR ${table.preferredJourney} IN ('non-tech', 'business', 'technical', 'consultation', 'custom')`
  ),
  // Ensure non-negative usage values
  monthlyUploadsCheck: check("monthly_uploads_check",
    sql`${table.monthlyUploads} >= 0`
  ),
  monthlyDataVolumeCheck: check("monthly_data_volume_check",
    sql`${table.monthlyDataVolume} >= 0`
  ),
  monthlyAIInsightsCheck: check("monthly_ai_insights_check",
    sql`${table.monthlyAIInsights} >= 0`
  ),
  // Indexes for performance
  userRoleStatusIdx: index("user_role_status_idx").on(table.userRole, table.subscriptionStatus),
  subscriptionTierStatusIdx: index("subscription_tier_status_idx").on(table.subscriptionTier, table.subscriptionStatus),
}));

export const adminProjectActions = pgTable("admin_project_actions", {
  id: varchar("id").primaryKey().notNull(),
  adminId: varchar("admin_id").notNull(),
  projectId: varchar("project_id"),
  userId: varchar("user_id"),
  action: varchar("action").notNull(),
  entityType: varchar("entity_type").notNull(),
  entityId: varchar("entity_id"),
  changes: jsonb("changes"),
  reason: text("reason"),
  ipAddress: varchar("ip_address"),
  userAgent: varchar("user_agent"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AdminProjectAction = typeof adminProjectActions.$inferSelect;
export type InsertAdminProjectAction = typeof adminProjectActions.$inferInsert;

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

// User permissions table - define role-based access controls
export const userPermissions = pgTable("user_permissions", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(), // Reference to users.id

  // Journey access permissions
  canAccessNonTechJourney: boolean("can_access_non_tech_journey").default(true),
  canAccessBusinessJourney: boolean("can_access_business_journey").default(false),
  canAccessTechnicalJourney: boolean("can_access_technical_journey").default(false),
  canRequestConsultation: boolean("can_request_consultation").default(true),

  // Feature permissions
  canAccessAdvancedAnalytics: boolean("can_access_advanced_analytics").default(false),
  canUseCustomAiKeys: boolean("can_use_custom_ai_keys").default(false),
  canGenerateCode: boolean("can_generate_code").default(false),
  canAccessRawData: boolean("can_access_raw_data").default(false),
  canExportResults: boolean("can_export_results").default(true),

  // Resource limits
  maxConcurrentProjects: integer("max_concurrent_projects").default(1),
  maxDatasetSizeMB: integer("max_dataset_size_mb").default(5), // 5MB for free tier
  maxAiQueriesPerMonth: integer("max_ai_queries_per_month").default(10),
  maxVisualizationsPerProject: integer("max_visualizations_per_project").default(3),
  maxComputeMinutesPerMonth: integer("max_compute_minutes_per_month").default(60),

  // AI service permissions
  allowedAiProviders: jsonb("allowed_ai_providers").default(['gemini']), // JSON array of provider names
  canUseAdvancedModels: boolean("can_use_advanced_models").default(false),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userPermissionIdx: index("user_permission_idx").on(table.userId),
}));

// Datasets table - files exist independently of projects
export const datasets = pgTable("datasets", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(), // Reference to users.id
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
  data: jsonb("data"), // To hold data for in-memory provider
  // New columns for streaming and web scraping capabilities
  mode: varchar("mode").default("static"), // "static", "stream", "refreshable"
  retentionDays: integer("retention_days"), // Data retention period in days (nullable)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Foreign key constraints
  userIdFk: foreignKey({
    columns: [table.userId],
    foreignColumns: [users.id],
    name: "datasets_user_id_fk"
  }).onDelete("cascade"),
  // Indexes for performance
  userIdIdx: index("datasets_user_id_idx").on(table.userId),
  statusIdx: index("datasets_status_idx").on(table.status),
  createdAtIdx: index("datasets_created_at_idx").on(table.createdAt),
  checksumIdx: index("datasets_checksum_idx").on(table.checksum), // For duplicate detection
}));

// Many-to-many relationship between projects and datasets
export const projectDatasets = pgTable("project_datasets", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").notNull(),
  datasetId: varchar("dataset_id").notNull(),
  role: varchar("role").default("primary"), // "primary", "secondary", "joined"
  alias: varchar("alias"), // Custom name for this dataset in the project
  addedAt: timestamp("added_at").defaultNow(),
}, (table) => ({
  // Foreign key constraints with cascade
  projectIdFk: foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "project_datasets_project_id_fk"
  }).onDelete("cascade"),
  datasetIdFk: foreignKey({
    columns: [table.datasetId],
    foreignColumns: [datasets.id],
    name: "project_datasets_dataset_id_fk"
  }).onDelete("cascade"),
  // Indexes
  projectDatasetIdx: index("project_dataset_idx").on(table.projectId, table.datasetId),
  datasetProjectIdx: index("dataset_project_idx").on(table.datasetId, table.projectId),
}));

export const projectStates = pgTable("project_states", {
  projectId: varchar("project_id").primaryKey().notNull(),
  state: jsonb("state").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  projectStateProjectFk: foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "project_states_project_id_fk"
  }).onDelete("cascade"),
  projectStatesUpdatedAtIdx: index("project_states_updated_at_idx").on(table.updatedAt),
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
  // Foreign key constraints with cascade
  projectIdFk: foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "project_artifacts_project_id_fk"
  }).onDelete("cascade"),
  createdByFk: foreignKey({
    columns: [table.createdBy],
    foreignColumns: [users.id],
    name: "project_artifacts_created_by_fk"
  }).onDelete("set null"),
  // Indexes for performance
  projectArtifactIdx: index("project_artifact_idx").on(table.projectId),
  parentArtifactIdx: index("parent_artifact_idx").on(table.parentArtifactId),
  typeStatusIdx: index("project_artifacts_type_status_idx").on(table.type, table.status),
  createdAtIdx: index("project_artifacts_created_at_idx").on(table.createdAt),
}));

// Analysis plans generated during the plan step workflow
export const analysisPlans = pgTable("analysis_plans", {
  id: varchar("id").primaryKey().$defaultFn(() => nanoid()),
  projectId: varchar("project_id").notNull(),
  createdBy: varchar("created_by", { length: 50 }).notNull().default("pm_agent"),
  version: integer("version").notNull().default(1),

  // Plan content
  executiveSummary: text("executive_summary").notNull(),
  dataAssessment: jsonb("data_assessment").notNull().$type<DataAssessment>(),
  analysisSteps: jsonb("analysis_steps").notNull().$type<AnalysisStep[]>(),
  visualizations: jsonb("visualizations").default(sql`'[]'::jsonb`).$type<VisualizationSpec[]>(),
  businessContext: jsonb("business_context").$type<BusinessContext | null>(),
  mlModels: jsonb("ml_models").default(sql`'[]'::jsonb`).$type<MLModelSpec[]>(),

  // Estimates and metadata
  estimatedCost: jsonb("estimated_cost").notNull().$type<CostBreakdown>(),
  estimatedDuration: varchar("estimated_duration", { length: 50 }).notNull(),
  complexity: varchar("complexity", { length: 20 }).notNull(),
  risks: jsonb("risks").default(sql`'[]'::jsonb`).$type<string[]>(),
  recommendations: jsonb("recommendations").default(sql`'[]'::jsonb`).$type<string[]>(),
  agentContributions: jsonb("agent_contributions").notNull().$type<Record<string, AgentContribution>>(),

  // Approval workflow
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by"),
  rejectionReason: text("rejection_reason"),
  modificationsRequested: text("modifications_requested"),

  // Execution tracking
  executedAt: timestamp("executed_at"),
  executionCompletedAt: timestamp("execution_completed_at"),
  actualCost: jsonb("actual_cost").$type<CostBreakdown | null>(),
  actualDuration: varchar("actual_duration", { length: 50 }),

  // Audit metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdFk: foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "analysis_plans_project_id_fk"
  }).onDelete("cascade"),
  approvedByFk: foreignKey({
    columns: [table.approvedBy],
    foreignColumns: [users.id],
    name: "analysis_plans_approved_by_fk"
  }).onDelete("set null"),
  planStatusCheck: check("analysis_plans_status_check",
    sql`${table.status} IN ('pending', 'ready', 'approved', 'rejected', 'modified', 'executing', 'completed', 'cancelled')`
  ),
  planComplexityCheck: check("analysis_plans_complexity_check",
    sql`${table.complexity} IN ('low', 'medium', 'high', 'very_high')`
  ),
  projectVersionIdx: index("analysis_plans_project_version_idx").on(table.projectId, table.version),
  statusIdx: index("analysis_plans_status_idx").on(table.status),
  projectStatusIdx: index("analysis_plans_project_status_idx").on(table.projectId, table.status),
  createdAtIdx: index("analysis_plans_created_at_idx").on(table.createdAt),
}));

// Updated projects table - now a lightweight container for analysis workflows
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(), // Reference to users.id (consistent with analysis service)
  name: varchar("name").notNull(),
  description: text("description"),
  status: varchar("status").notNull().default("draft"), // "draft", "uploading", "processing", "pii_review", "ready", "analyzing", "checkpoint", "generating", "completed", "error", "cancelled", plan_*
  journeyType: varchar("journey_type").notNull(), // "non-tech", "business", "technical", "consultation", "custom"
  lastArtifactId: varchar("last_artifact_id"), // Quick reference to latest artifact
  analysisResults: jsonb("analysis_results"), // Store analysis results from analysis-execution service
  multiAgentCoordination: jsonb("multi_agent_coordination"), // Store multi-agent coordination results
  consultationProposalId: varchar("consultation_proposal_id"), // Legacy column that exists in database

  // Journey lifecycle billing fields
  approvedPlanId: varchar("approved_plan_id"),
  analysisExecutedAt: timestamp("analysis_executed_at"),
  analysisBilledAt: timestamp("analysis_billed_at"),
  totalCostIncurred: decimal("total_cost_incurred", { precision: 10, scale: 2 }).default("0"),
  lockedCostEstimate: decimal("locked_cost_estimate", { precision: 10, scale: 2 }),
  costBreakdown: jsonb("cost_breakdown"),

  // Journey state tracking - for resumable multi-step workflows
  stepCompletionStatus: jsonb("step_completion_status").default('{}'), // { "prepare": true, "data": true, "execute": false, ... }
  lastAccessedStep: varchar("last_accessed_step"), // "prepare", "project-setup", "data", "data-verification", "execute", "pricing", "results"
  journeyStartedAt: timestamp("journey_started_at"), // When user first started the journey
  journeyCompletedAt: timestamp("journey_completed_at"), // When user completed all steps
  journeyProgress: jsonb("journey_progress").default('{}'),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // CHECK constraints for projects table
  projectStatusCheck: check("project_status_check",
    sql`${table.status} IN ('draft', 'uploading', 'processing', 'pii_review', 'ready', 'analyzing', 'checkpoint', 'generating', 'plan_creation', 'plan_review', 'plan_approved', 'completed', 'error', 'cancelled')`
  ),
  projectJourneyTypeCheck: check("project_journey_type_check",
    sql`${table.journeyType} IN ('non-tech', 'business', 'technical', 'consultation', 'custom')`
  ),
  // Foreign key constraints
  userIdFk: foreignKey({
    columns: [table.userId],
    foreignColumns: [users.id],
    name: "projects_user_id_fk"
  }).onDelete("cascade"),
  // Indexes
  userIdIdx: index("projects_user_id_idx").on(table.userId),
  analysisResultsIdx: index("projects_analysis_results_idx").on(table.analysisResults),
  consultationProposalIdx: index("projects_consultation_proposal_idx").on(table.consultationProposalId),
  projectOwnerStatusIdx: index("project_owner_status_idx").on(table.userId, table.status),
}));

// Project sessions - server-side state management for multi-step workflows
// Prevents client-side tampering and enables cross-device resume
export const projectSessions = pgTable("project_sessions", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(), // User who owns this session
  projectId: varchar("project_id"), // Optional: linked project after creation
  journeyType: varchar("journey_type").notNull(), // "non-tech", "business", "technical", "consultation"

  // Session state data (server-authoritative)
  currentStep: varchar("current_step").default("prepare"), // "prepare", "data", "execute", "pricing", "results"

  // Step-specific data (replaces localStorage)
  prepareData: jsonb("prepare_data"), // Analysis goals, business questions, selected templates
  dataUploadData: jsonb("data_upload_data"), // File metadata, schema info
  executeData: jsonb("execute_data"), // Selected analyses, execution status, results
  pricingData: jsonb("pricing_data"), // Pricing calculations, payment intent
  resultsData: jsonb("results_data"), // Final artifacts, download links
  workflowState: jsonb("workflow_state"), // Resilient workflow manager state with clarifications

  // Integrity and security
  dataHash: varchar("data_hash"), // SHA-256 hash of critical data to detect tampering
  serverValidated: boolean("server_validated").default(false), // Server has validated execution results

  // Session metadata
  ipAddress: varchar("ip_address"), // Track session origin
  userAgent: varchar("user_agent"), // Browser fingerprint
  lastActivity: timestamp("last_activity").defaultNow(), // For session expiry
  expiresAt: timestamp("expires_at"), // Auto-expire old sessions

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("project_sessions_user_id_idx").on(table.userId),
  projectIdIdx: index("project_sessions_project_id_idx").on(table.projectId),
  journeyTypeIdx: index("project_sessions_journey_type_idx").on(table.journeyType),
  expiresAtIdx: index("project_sessions_expires_at_idx").on(table.expiresAt),
}));

// Project questions table - stores user questions for analysis
export const projectQuestions = pgTable("project_questions", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").notNull(),
  questionText: text("question_text").notNull(),
  questionOrder: integer("question_order").default(0),
  status: varchar("status").default("pending"), // pending, answered, skipped
  answer: text("answer"),
  evidence: jsonb("evidence"), // Supporting data for the answer
  confidenceScore: doublePrecision("confidence_score"),
  answeredAt: timestamp("answered_at"),
  // Semantic Search - for finding similar questions across projects
  // Vector embedding (1536 dimensions) for cross-project learning
  embedding: vector("embedding").$type<number[] | null>(), // semantic embedding vector (pgvector)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  projectIdIdx: index("project_questions_project_id_idx").on(table.projectId),
  statusIdx: index("project_questions_status_idx").on(table.status),
}));

// Data Scientist Analysis Results - stores structured analysis outputs
export const dsAnalysisResults = pgTable("ds_analysis_results", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").notNull(),
  executionId: varchar("execution_id"),
  analysisType: varchar("analysis_type").notNull(), // correlation, regression, clustering, etc.
  resultData: jsonb("result_data"), // The actual analysis results
  statistics: jsonb("statistics"), // Statistical measures
  visualizationConfig: jsonb("visualization_config"), // Chart configuration
  confidenceScore: doublePrecision("confidence_score"),
  status: varchar("status").default("completed"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  projectIdIdx: index("ds_analysis_results_project_id_idx").on(table.projectId),
  executionIdIdx: index("ds_analysis_results_execution_id_idx").on(table.executionId),
  analysisTypeIdx: index("ds_analysis_results_type_idx").on(table.analysisType),
}));

// Insights - AI-generated business insights from analysis
export const insights = pgTable("insights", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").notNull(),
  executionId: varchar("execution_id"),
  questionId: varchar("question_id"), // Link to projectQuestions
  insightType: varchar("insight_type").notNull(), // key_finding, recommendation, warning, opportunity
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  evidence: jsonb("evidence"), // Supporting data
  confidence: doublePrecision("confidence"),
  priority: integer("priority").default(0), // For ranking insights
  tags: jsonb("tags").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  projectIdIdx: index("insights_project_id_idx").on(table.projectId),
  executionIdIdx: index("insights_execution_id_idx").on(table.executionId),
  typeIdx: index("insights_type_idx").on(table.insightType),
}));

// Data Engineer PII Detections - tracks PII columns and anonymization
export const dePiiDetections = pgTable("de_pii_detections", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").notNull(),
  datasetId: varchar("dataset_id"),
  columnName: varchar("column_name").notNull(),
  piiType: varchar("pii_type").notNull(), // email, phone, ssn, name, address, etc.
  confidence: doublePrecision("confidence"),
  sampleValues: jsonb("sample_values").$type<string[]>(),
  action: varchar("action").default("pending"), // pending, exclude, anonymize, keep
  anonymizationMethod: varchar("anonymization_method"), // hash, mask, redact, generalize
  userDecision: varchar("user_decision"), // User's choice
  decisionTimestamp: timestamp("decision_timestamp"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  projectIdIdx: index("de_pii_detections_project_id_idx").on(table.projectId),
  columnNameIdx: index("de_pii_detections_column_name_idx").on(table.columnName),
  actionIdx: index("de_pii_detections_action_idx").on(table.action),
}));

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

// Consultation requests - for expert consultation journey workflow
export const consultationRequests = pgTable("consultation_requests", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(), // Customer who requested consultation

  // Request details
  name: varchar("name").notNull(),
  email: varchar("email").notNull(),
  company: varchar("company"),
  challenge: text("challenge").notNull(), // Description of data challenge
  analysisGoals: text("analysis_goals"), // What they want to achieve
  businessQuestions: text("business_questions"), // Specific questions to answer

  // Consultation configuration
  consultationType: varchar("consultation_type").default("standard"), // standard, strategic, technical, implementation
  expertLevel: varchar("expert_level").default("senior"), // senior, director, principal
  duration: integer("duration").default(1), // Hours

  // Quote and approval workflow
  status: varchar("status").notNull().default("pending_quote"), // pending_quote, awaiting_approval, approved, rejected, ready_for_admin, in_progress, completed, cancelled
  quoteAmount: integer("quote_amount"), // Amount in cents
  quoteDetails: jsonb("quote_details"), // Detailed pricing breakdown
  quotedBy: varchar("quoted_by"), // Admin who created quote
  quotedAt: timestamp("quoted_at"),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),

  // Payment tracking
  paymentIntentId: varchar("payment_intent_id"),
  paymentStatus: varchar("payment_status").default("pending"), // pending, paid, failed
  paidAt: timestamp("paid_at"),

  // Project creation after approval
  projectId: varchar("project_id"), // Created after user approves and uploads data
  dataUploadedAt: timestamp("data_uploaded_at"),

  // Admin assignment
  assignedAdminId: varchar("assigned_admin_id"), // Admin handling the consultation
  assignedAt: timestamp("assigned_at"),

  // Consultation session
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at"),
  sessionNotes: text("session_notes"),
  deliverables: jsonb("deliverables"), // Links to reports, dashboards, etc.

  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("consultation_requests_user_id_idx").on(table.userId),
  statusIdx: index("consultation_requests_status_idx").on(table.status),
  assignedAdminIdx: index("consultation_requests_assigned_admin_idx").on(table.assignedAdminId),
  projectIdIdx: index("consultation_requests_project_id_idx").on(table.projectId),
}));

// Consultation pricing configuration table (admin-managed)
export const consultationPricing = pgTable("consultation_pricing", {
  id: varchar("id").primaryKey().notNull(),
  consultationType: varchar("consultation_type").notNull().unique(), // "standard", "premium", "enterprise", etc.
  displayName: varchar("display_name").notNull(), // User-friendly name
  description: text("description"), // Description of this consultation type
  basePrice: integer("base_price").notNull(), // Price in cents
  expertLevel: varchar("expert_level").default("senior"), // "junior", "senior", "principal"
  durationHours: integer("duration_hours").default(1), // Duration in hours
  features: jsonb("features"), // Array of feature strings
  isActive: boolean("is_active").default(true), // Can be temporarily disabled
  sortOrder: integer("sort_order").default(0), // Display order
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by"), // Admin user ID who created this
  updatedBy: varchar("updated_by"), // Admin user ID who last updated this
}, (table) => ({
  consultationTypeIdx: index("consultation_pricing_type_idx").on(table.consultationType),
  activeIdx: index("consultation_pricing_active_idx").on(table.isActive),
}));

// Service pricing configuration table (admin-managed one-time services)
export const servicePricing = pgTable("service_pricing", {
  id: varchar("id").primaryKey().notNull(),
  serviceType: varchar("service_type").notNull().unique(), // "pay-per-analysis", "expert-consultation"
  displayName: varchar("display_name").notNull(),
  description: text("description"),
  basePrice: integer("base_price").notNull(), // Price in cents
  pricingModel: varchar("pricing_model").notNull().default("fixed"), // "fixed", "calculated"
  pricingConfig: jsonb("pricing_config").default('{}'), // Dynamic pricing configuration
  isActive: boolean("is_active").default(true),
  stripeProductId: varchar("stripe_product_id"),
  stripePriceId: varchar("stripe_price_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  serviceTypeIdx: index("service_pricing_type_idx").on(table.serviceType),
  activeIdx: index("service_pricing_active_idx").on(table.isActive),
}));

// Subscription tier pricing configuration table (admin-managed)
export const subscriptionTierPricing = pgTable("subscription_tier_pricing", {
  id: varchar("id").primaryKey().notNull(), // 'trial', 'starter', 'professional', 'enterprise'
  name: varchar("name").notNull(),
  displayName: varchar("display_name").notNull(),
  description: text("description"),
  monthlyPriceUsd: integer("monthly_price_usd").notNull(), // Price in cents
  yearlyPriceUsd: integer("yearly_price_usd").notNull(), // Price in cents
  stripeProductId: varchar("stripe_product_id"),
  stripeMonthlyPriceId: varchar("stripe_monthly_price_id"),
  stripeYearlyPriceId: varchar("stripe_yearly_price_id"),
  limits: jsonb("limits").notNull().default('{}'), // Feature limits
  features: jsonb("features").notNull().default('{}'), // Feature flags
  journeyPricing: jsonb("journey_pricing").default('{}'), // Journey type multipliers
  overagePricing: jsonb("overage_pricing").default('{}'), // Overage charges
  discounts: jsonb("discounts").default('{}'), // Discount configuration
  compliance: jsonb("compliance").default('{}'), // Compliance features
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  activeIdx: index("subscription_tier_pricing_active_idx").on(table.isActive),
}));

// Billing campaigns table (admin-managed promotional campaigns)
export const billingCampaigns = pgTable("billing_campaigns", {
  id: varchar("id").primaryKey().notNull(),
  name: varchar("name").notNull(),
  type: varchar("type").notNull(), // 'percentage_discount', 'fixed_discount', 'trial_extension', 'quota_boost'
  value: integer("value").notNull(), // Percentage or fixed amount (in cents for fixed)
  targetTiers: jsonb("target_tiers").default('[]'), // Array of tier IDs to apply to
  targetRoles: jsonb("target_roles").default('[]'), // Array of role names to apply to
  validFrom: timestamp("valid_from").notNull(),
  validTo: timestamp("valid_to").notNull(),
  maxUses: integer("max_uses"), // null = unlimited
  currentUses: integer("current_uses").default(0).notNull(),
  couponCode: varchar("coupon_code"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  activeIdx: index("billing_campaigns_active_idx").on(table.isActive),
  validDatesIdx: index("billing_campaigns_valid_dates_idx").on(table.validFrom, table.validTo),
  couponCodeIdx: index("billing_campaigns_coupon_code_idx").on(table.couponCode),
  campaignTypeCheck: check("billing_campaigns_type_check",
    sql`${table.type} IN ('percentage_discount', 'fixed_discount', 'trial_extension', 'quota_boost')`
  ),
}));

// Guided analysis orders table
export const guidedAnalysisOrders = pgTable("guided_analysis_orders", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id"),
  projectId: varchar("project_id"),
  configuration: jsonb("configuration"),
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

// Agent checkpoints for project workflow tracking
export const agentCheckpoints = pgTable("agent_checkpoints", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").notNull(), // FK to projects
  agentType: varchar("agent_type").notNull(), // project_manager, technical_ai, business
  stepName: varchar("step_name").notNull(), // Workflow step identifier
  status: varchar("status").notNull().default("pending"), // pending, in_progress, waiting_approval, approved, completed, rejected
  message: text("message").notNull(), // Agent message to user
  data: jsonb("data"), // Additional structured data
  userFeedback: text("user_feedback"), // User's feedback/response
  requiresUserInput: boolean("requires_user_input").notNull().default(false),
  timestamp: timestamp("timestamp").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  projectIdIdx: index("agent_checkpoints_project_id_idx").on(table.projectId),
  statusIdx: index("agent_checkpoints_status_idx").on(table.status),
  agentTypeIdx: index("agent_checkpoints_agent_type_idx").on(table.agentType),
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

// Audience profiles for artifact customization - designed to support executive vs analyst vs SME differentiation
export const audienceProfiles = pgTable("audience_profiles", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(), // FK to users - which user this profile belongs to
  name: varchar("name").notNull(), // e.g., "Executive Leadership", "Technical Team", "Business Analysts"
  description: text("description"),
  journeyType: varchar("journey_type").notNull(), // non-tech, business, technical, consultation

  // Core fields for artifact decision-making
  role: varchar("role").notNull(), // executive, analyst, manager, specialist, sme, consultant
  industry: varchar("industry"), // healthcare, finance, retail, etc.
  seniority: varchar("seniority").notNull(), // junior, senior, director, vp, c_suite
  analyticalMaturity: varchar("analytical_maturity").notNull(), // basic, intermediate, advanced, expert

  // Artifact preferences - what types of deliverables this audience prefers
  preferredArtifacts: jsonb("preferred_artifacts").notNull().default('[]'), // ['executive_summary', 'dashboard', 'detailed_report', 'data_export', 'presentation_deck', 'action_plan']

  // Communication preferences
  communicationStyle: varchar("communication_style").notNull().default('formal'), // formal, casual, technical, simplified
  detailLevel: varchar("detail_level").notNull().default('medium'), // high, medium, low
  technicalProficiency: varchar("technical_proficiency").notNull().default('intermediate'), // beginner, intermediate, advanced, expert

  // Visualization and reporting preferences
  visualizationPreferences: jsonb("visualization_preferences").default('{}'), // Chart types, complexity, interactivity preferences
  reportingFrequency: varchar("reporting_frequency").default('on-demand'), // daily, weekly, monthly, quarterly, on-demand

  // Business context for better artifact targeting
  businessContext: text("business_context"), // Specific responsibilities, decision-making authority, team size
  decisionMakingAuthority: varchar("decision_authority"), // individual, team_lead, department_head, executive
  primaryUseCases: jsonb("primary_use_cases").default('[]'), // ['strategic_planning', 'operational_monitoring', 'compliance_reporting', 'performance_analysis']

  // Settings
  isDefault: boolean("is_default").default(false), // Whether this is the default profile for the user
  isActive: boolean("is_active").default(true), // Whether this profile is currently active

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("audience_profiles_user_id_idx").on(table.userId),
  roleIdx: index("audience_profiles_role_idx").on(table.role),
  seniorityIdx: index("audience_profiles_seniority_idx").on(table.seniority),
  maturityIdx: index("audience_profiles_maturity_idx").on(table.analyticalMaturity),
  journeyTypeIdx: index("audience_profiles_journey_type_idx").on(table.journeyType),
  isDefaultIdx: index("audience_profiles_is_default_idx").on(table.userId, table.isDefault),
  isActiveIdx: index("audience_profiles_is_active_idx").on(table.isActive),
}));

// Conversation states for agent communication
export const conversationStates = pgTable("conversation_states", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id"), // FK to projects (optional, might not be linked to project yet)
  userId: varchar("user_id").notNull(), // FK to users
  sessionId: varchar("session_id"), // Session identifier used by existing code
  journeyId: varchar("journey_id"), // Journey identifier used by existing code
  currentPhase: varchar("current_phase").notNull(), // goal_discovery, analysis, refinement, delivery
  goalCandidates: jsonb("goal_candidates").notNull(), // Array of GoalCandidate objects
  conversationHistory: jsonb("conversation_history").notNull(), // Array of ConversationMessage objects
  contextAccumulation: jsonb("context_accumulation"), // Context data accumulated during conversation
  nextActions: jsonb("next_actions"), // Suggested next actions
  lastInteraction: timestamp("last_interaction").defaultNow().notNull(),
  status: varchar("status").notNull().default("active"), // active, paused, completed, abandoned
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("conversation_states_project_id_idx").on(table.projectId),
  userIdIdx: index("conversation_states_user_id_idx").on(table.userId),
  sessionIdIdx: index("conversation_states_session_id_idx").on(table.sessionId),
  journeyIdIdx: index("conversation_states_journey_id_idx").on(table.journeyId),
  phaseIdx: index("conversation_states_phase_idx").on(table.currentPhase),
  statusIdx: index("conversation_states_status_idx").on(table.status),
}));

// Default artifact templates for different audience types - helps agents decide what to generate
export const artifactTemplates = pgTable("artifact_templates", {
  id: varchar("id").primaryKey().notNull(),
  name: varchar("name").notNull(), // Template name for lookups
  title: varchar("title").notNull(),
  summary: text("summary").notNull(),
  description: text("description"), // Detailed description
  journeyType: varchar("journey_type").notNull(), // non-tech, business, technical, consultation
  industry: varchar("industry").notNull().default("general"),
  persona: varchar("persona"),
  primaryAgent: varchar("primary_agent"),
  defaultConfidence: decimal("default_confidence", { precision: 5, scale: 2 }).default("0.8"),
  expectedArtifacts: jsonb("expected_artifacts").default(sql`'[]'::jsonb`).notNull(),
  communicationStyle: varchar("communication_style").default("professional"),
  steps: jsonb("steps").default(sql`'[]'::jsonb`).notNull(),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  isSystem: boolean("is_system").default(false),
  isActive: boolean("is_active").default(true), // Template active status
  createdBy: varchar("created_by"),
  embedding: vector("embedding").$type<number[] | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),

  // Audience targeting (added for personalization)
  targetRole: varchar("target_role").default("executive").notNull(), // executive, analyst, manager, specialist, sme
  targetSeniority: varchar("target_seniority").default("senior").notNull(), // junior, senior, director, vp, c_suite
  targetMaturity: varchar("target_maturity").default("intermediate").notNull(), // basic, intermediate, advanced, expert

  // Artifact configuration
  artifactTypes: jsonb("artifact_types").default(sql`'[]'::jsonb`).notNull(), // Types of artifacts this template generates
  visualizationTypes: jsonb("visualization_types").default(sql`'[]'::jsonb`), // Preferred visualization types
  narrativeStyle: varchar("narrative_style").default("executive").notNull(), // executive, technical, conversational
  contentDepth: varchar("content_depth").default("standard").notNull(), // summary, standard, comprehensive
  interactivityLevel: varchar("interactivity_level").default('medium'), // low, medium, high

  // Template metadata
  useCases: jsonb("use_cases").default(sql`'[]'::jsonb`), // Common use cases
  deliveryFormat: jsonb("delivery_format").default(sql`'[]'::jsonb`), // pdf, dashboard, presentation, etc.
  priority: integer("priority").default(100), // Display/selection priority
  usageCount: integer("usage_count").default(0), // Track template usage
});

// Data artifacts for audience-specific data views and exports
export const dataArtifacts = pgTable("data_artifacts", {
  id: varchar("id").primaryKey().notNull(),
  name: varchar("name").notNull(), // "Executive KPI Summary", "Analyst Dataset", "SME Technical Data"
  description: text("description"),

  // Audience targeting
  targetRole: varchar("target_role").notNull(), // executive, analyst, manager, specialist, sme
  targetSeniority: varchar("target_seniority").notNull(), // junior, senior, director, vp, c_suite
  targetMaturity: varchar("target_maturity").notNull(), // basic, intermediate, advanced, expert

  // Data characteristics
  dataType: varchar("data_type").notNull(), // aggregated, detailed, raw, filtered, transformed
  aggregationLevel: varchar("aggregation_level").notNull(), // summary, monthly, daily, transaction, individual
  granularity: varchar("granularity").notNull(), // high_level, medium, detailed, comprehensive

  // Data content configuration
  includedColumns: jsonb("included_columns").notNull().default('[]'), // Which columns/fields to include
  excludedColumns: jsonb("excluded_columns").default('[]'), // Which columns/fields to exclude (PII, technical details, etc.)
  calculatedFields: jsonb("calculated_fields").default('[]'), // Computed metrics like growth rates, percentages, etc.

  // Data filtering and segmentation
  defaultFilters: jsonb("default_filters").default('{}'), // Default data filters (date ranges, categories, etc.)
  segmentationRules: jsonb("segmentation_rules").default('[]'), // How to segment data (by region, department, etc.)

  // Export and format preferences  
  exportFormats: jsonb("export_formats").notNull().default('["csv"]'), // csv, excel, json, pdf, dashboard
  visualizationHints: jsonb("visualization_hints").default('{}'), // Suggested chart types for this data

  // Data privacy and security
  piiHandling: varchar("pii_handling").default('exclude'), // exclude, anonymize, aggregate, include
  sensitivityLevel: varchar("sensitivity_level").default('public'), // public, internal, confidential, restricted
  accessControls: jsonb("access_controls").default('{}'), // Role-based access rules

  // Business context
  useCases: jsonb("use_cases").default('[]'), // ['performance_monitoring', 'strategic_planning', 'operational_analysis']
  businessMetrics: jsonb("business_metrics").default('[]'), // Which KPIs/metrics this data supports
  refreshFrequency: varchar("refresh_frequency").default('on-demand'), // real-time, hourly, daily, weekly, monthly

  // Template settings
  priority: integer("priority").default(100), // Higher number = higher priority
  isActive: boolean("is_active").default(true),
  usageCount: integer("usage_count").default(0),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  roleIdx: index("data_artifacts_role_idx").on(table.targetRole),
  seniorityIdx: index("data_artifacts_seniority_idx").on(table.targetSeniority),
  maturityIdx: index("data_artifacts_maturity_idx").on(table.targetMaturity),
  dataTypeIdx: index("data_artifacts_data_type_idx").on(table.dataType),
  aggregationIdx: index("data_artifacts_aggregation_idx").on(table.aggregationLevel),
  sensitivityIdx: index("data_artifacts_sensitivity_idx").on(table.sensitivityLevel),
  priorityIdx: index("data_artifacts_priority_idx").on(table.priority),
  isActiveIdx: index("data_artifacts_is_active_idx").on(table.isActive),
}));

// Service workflows table for workflow management
export const serviceWorkflows = pgTable("service_workflows", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").notNull(),
  currentStep: varchar("current_step").notNull(),
  stepData: jsonb("step_data").default('{}'),
  status: varchar("status").default('pending'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("service_workflows_project_idx").on(table.projectId),
  statusIdx: index("service_workflows_status_idx").on(table.status),
}));

// Data uploads table for file upload tracking
export const dataUploads = pgTable("data_uploads", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").notNull(),
  fileName: varchar("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  status: varchar("status").default('pending'),
  uploadPath: varchar("upload_path"),
  malwareScanResult: jsonb("malware_scan_result").default('{}'),
  processingStatus: varchar("processing_status").default('pending'),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("data_uploads_project_idx").on(table.projectId),
  statusIdx: index("data_uploads_status_idx").on(table.status),
  processingStatusIdx: index("data_uploads_processing_status_idx").on(table.processingStatus),
}));

// Decision audit trail for workflow transparency
export const decisionAudits = pgTable("decision_audits", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").notNull(), // FK to projects
  agent: varchar("agent").notNull(), // project_manager, data_scientist, business_agent, system
  decisionType: varchar("decision_type").notNull(), // analysis_approach, data_processing, visualization_choice, etc.
  decision: text("decision").notNull(), // The actual decision made
  reasoning: text("reasoning").notNull(), // Why this decision was made
  alternatives: jsonb("alternatives").notNull().default('[]'), // Other options considered
  confidence: integer("confidence").notNull(), // Confidence level 0-100
  context: jsonb("context").default('{}'), // Additional context data
  userInput: text("user_input"), // User input that influenced the decision
  impact: varchar("impact").notNull(), // low, medium, high
  reversible: boolean("reversible").default(true), // Whether this decision can be undone
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("decision_audits_project_id_idx").on(table.projectId),
  agentIdx: index("decision_audits_agent_idx").on(table.agent),
  decisionTypeIdx: index("decision_audits_decision_type_idx").on(table.decisionType),
  timestampIdx: index("decision_audits_timestamp_idx").on(table.timestamp),
}));

// Generated artifacts from the adaptive content engine
export const generatedArtifacts = pgTable("generated_artifacts", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").notNull(), // FK to projects
  templateId: varchar("template_id"), // FK to artifactTemplates (optional)
  audienceProfileId: varchar("audience_profile_id"), // FK to audienceProfiles (optional)
  type: varchar("type").notNull(), // executive_summary, dashboard, detailed_report, etc.
  title: varchar("title").notNull(),
  format: varchar("format").notNull(), // pdf, html, json, dashboard, etc.
  content: jsonb("content").notNull(), // The actual generated content
  components: jsonb("components").default('[]'), // Array of artifact components
  metadata: jsonb("metadata").default('{}'), // Generation metadata, complexity, etc.
  status: varchar("status").default('generated'), // generated, published, archived
  workflowId: varchar("workflow_id"), // Optional workflow identifier
  stepsCompleted: integer("steps_completed"), // Number of workflow steps completed
  totalDecisions: integer("total_decisions"), // Number of decisions made
  totalArtifacts: integer("total_artifacts"), // Total artifacts generated
  completionTime: timestamp("completion_time"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("generated_artifacts_project_id_idx").on(table.projectId),
  templateIdIdx: index("generated_artifacts_template_id_idx").on(table.templateId),
  audienceIdIdx: index("generated_artifacts_audience_id_idx").on(table.audienceProfileId),
  typeIdx: index("generated_artifacts_type_idx").on(table.type),
  statusIdx: index("generated_artifacts_status_idx").on(table.status),
  workflowIdIdx: index("generated_artifacts_workflow_id_idx").on(table.workflowId),
}));

// Analysis patterns discovered by research agents and curated via admin review
export const analysisPatterns = pgTable("analysis_patterns", {
  id: varchar("id").primaryKey().notNull(),
  name: varchar("name").notNull(),
  description: text("description"),
  industry: varchar("industry").default("general").notNull(),
  goal: varchar("goal").notNull(),
  questionSummary: text("question_summary"),
  dataSchemaSignature: varchar("data_schema_signature"),
  dataSchema: jsonb("data_schema").default("{}"),
  toolSequence: jsonb("tool_sequence").default("[]").notNull(),
  requiredSignals: jsonb("required_signals").default("[]"),
  fallbackNarratives: jsonb("fallback_narratives").default("[]"),
  applicableJourneys: jsonb("applicable_journeys").default("[]"),
  confidence: integer("confidence").default(0),
  status: varchar("status").default("pending_review"),
  version: integer("version").default(1),
  requestedBy: varchar("requested_by"),
  discoveredAt: timestamp("discovered_at"),
  approvedAt: timestamp("approved_at"),
  embedding: vector("embedding").$type<number[] | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  industryIdx: index("analysis_patterns_industry_idx").on(table.industry),
  goalIdx: index("analysis_patterns_goal_idx").on(table.goal),
  statusIdx: index("analysis_patterns_status_idx").on(table.status),
  schemaSignatureIdx: index("analysis_patterns_schema_signature_idx").on(table.dataSchemaSignature),
}));

// Source citations associated with analysis patterns
export const analysisPatternSources = pgTable("analysis_pattern_sources", {
  id: varchar("id").primaryKey().notNull(),
  patternId: varchar("pattern_id").notNull(),
  sourceType: varchar("source_type").default("web").notNull(),
  sourceUrl: text("source_url"),
  title: varchar("title"),
  synopsis: text("synopsis"),
  confidence: integer("confidence").default(0),
  metadata: jsonb("metadata").default("{}"),
  retrievedAt: timestamp("retrieved_at").defaultNow().notNull(),
}, (table) => ({
  patternIdx: index("analysis_pattern_sources_pattern_idx").on(table.patternId),
  sourceTypeIdx: index("analysis_pattern_sources_source_type_idx").on(table.sourceType),
  patternFk: foreignKey({
    columns: [table.patternId],
    foreignColumns: [analysisPatterns.id],
    name: "analysis_pattern_sources_pattern_id_fk",
  }).onDelete("cascade"),
}));

// Mapping between curated templates and discovered analysis patterns
export const templatePatterns = pgTable("template_patterns", {
  id: varchar("id").primaryKey().notNull(),
  templateId: varchar("template_id").notNull(),
  patternId: varchar("pattern_id").notNull(),
  relevanceScore: integer("relevance_score").default(0),
  metadata: jsonb("metadata").default("{}"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  templateIdx: index("template_patterns_template_idx").on(table.templateId),
  patternIdx: index("template_patterns_pattern_idx").on(table.patternId),
  templatePatternUnique: uniqueIndex("template_patterns_template_pattern_unique").on(table.templateId, table.patternId),
  templateFk: foreignKey({
    columns: [table.templateId],
    foreignColumns: [artifactTemplates.id],
    name: "template_patterns_template_id_fk",
  }).onDelete("cascade"),
  patternFk: foreignKey({
    columns: [table.patternId],
    foreignColumns: [analysisPatterns.id],
    name: "template_patterns_pattern_id_fk",
  }).onDelete("cascade"),
}));

// Analysis subscriptions for recurring analysis
export const analysisSubscriptions = pgTable("analysis_subscriptions", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(), // FK to users
  projectId: varchar("project_id").notNull(), // FK to projects
  name: varchar("name").notNull(),
  description: text("description"),
  mode: jsonb("mode").notNull(), // {type, schedule, triggers} for recurring analysis
  audienceProfiles: jsonb("audience_profiles").notNull().default('[]'), // Array of audience profile IDs
  dataConnections: jsonb("data_connections").notNull().default('[]'), // Data source connections
  analysisConfig: jsonb("analysis_config").default('{}'), // Analysis configuration
  status: varchar("status").default('active'), // active, paused, stopped, error
  lastExecution: timestamp("last_execution"),
  nextExecution: timestamp("next_execution"),
  executionCount: integer("execution_count").default(0),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }).default('0.00'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("analysis_subscriptions_user_id_idx").on(table.userId),
  projectIdIdx: index("analysis_subscriptions_project_id_idx").on(table.projectId),
  statusIdx: index("analysis_subscriptions_status_idx").on(table.status),
  nextExecutionIdx: index("analysis_subscriptions_next_execution_idx").on(table.nextExecution),
}));

// Template feedback for continuous improvement
export const templateFeedback = pgTable("template_feedback", {
  id: varchar("id").primaryKey().notNull(),
  templateId: varchar("template_id").notNull(), // FK to artifactTemplates
  userId: varchar("user_id").notNull(), // FK to users
  rating: integer("rating").notNull(), // Overall rating 1-5
  missingMetrics: jsonb("missing_metrics").default('[]'), // Metrics the user felt were missing
  irrelevantSections: jsonb("irrelevant_sections").default('[]'), // Sections they found irrelevant
  industryAccuracy: integer("industry_accuracy").notNull(), // How accurate for their industry 1-5
  additionalComments: text("additional_comments").default(''),
  processed: boolean("processed").default(false), // Whether feedback has been processed
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  templateIdIdx: index("template_feedback_template_id_idx").on(table.templateId),
  userIdIdx: index("template_feedback_user_id_idx").on(table.userId),
  processedIdx: index("template_feedback_processed_idx").on(table.processed),
  ratingIdx: index("template_feedback_rating_idx").on(table.rating),
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

export const insertAudienceProfileSchema = createInsertSchema(audienceProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertConversationStateSchema = createInsertSchema(conversationStates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertArtifactTemplateSchema = createInsertSchema(artifactTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
});

export const insertDataArtifactSchema = createInsertSchema(dataArtifacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
});

export const insertDecisionAuditSchema = createInsertSchema(decisionAudits).omit({
  id: true,
  timestamp: true,
});

export const insertGeneratedArtifactSchema = createInsertSchema(generatedArtifacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnalysisPatternSchema = createInsertSchema(analysisPatterns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
  discoveredAt: true,
});

export const insertAnalysisPatternSourceSchema = createInsertSchema(analysisPatternSources).omit({
  id: true,
  retrievedAt: true,
});

export const insertTemplatePatternSchema = createInsertSchema(templatePatterns).omit({
  id: true,
  createdAt: true,
});

export const insertAnalysisSubscriptionSchema = createInsertSchema(analysisSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTemplateFeedbackSchema = createInsertSchema(templateFeedback).omit({
  id: true,
  createdAt: true,
});

export const insertServiceWorkflowSchema = createInsertSchema(serviceWorkflows).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDataUploadSchema = createInsertSchema(dataUploads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Updated project insert schema
export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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

export const insertAgentCheckpointSchema = createInsertSchema(agentCheckpoints).omit({
  id: true,
  createdAt: true,
  timestamp: true,
});

export const insertDatasetVersionSchema = createInsertSchema(datasetVersions).omit({
  id: true,
  createdAt: true,
});

export const insertAnalysisPlanSchemaDb = createInsertSchema(analysisPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// In-memory storage class (Singleton Pattern)
// (Note) In-memory storage lives in server/storage.ts. Any accidental duplicates here were removed to avoid type conflicts.


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
      errorRate: z.number(),
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

// New table types
export type AudienceProfile = typeof audienceProfiles.$inferSelect;
export type InsertAudienceProfile = z.infer<typeof insertAudienceProfileSchema>;
export type ConversationState = typeof conversationStates.$inferSelect;
export type InsertConversationState = z.infer<typeof insertConversationStateSchema>;
export type ArtifactTemplate = typeof artifactTemplates.$inferSelect;
export type InsertArtifactTemplate = z.infer<typeof insertArtifactTemplateSchema>;
export type DataArtifact = typeof dataArtifacts.$inferSelect;
export type InsertDataArtifact = z.infer<typeof insertDataArtifactSchema>;
export type DecisionAudit = typeof decisionAudits.$inferSelect;
export type InsertDecisionAudit = z.infer<typeof insertDecisionAuditSchema>;
export type GeneratedArtifact = typeof generatedArtifacts.$inferSelect;
export type InsertGeneratedArtifact = z.infer<typeof insertGeneratedArtifactSchema>;
export type AnalysisPattern = typeof analysisPatterns.$inferSelect;
export type InsertAnalysisPattern = z.infer<typeof insertAnalysisPatternSchema>;
export type AnalysisPatternSource = typeof analysisPatternSources.$inferSelect;
export type InsertAnalysisPatternSource = z.infer<typeof insertAnalysisPatternSourceSchema>;
export type TemplatePattern = typeof templatePatterns.$inferSelect;
export type InsertTemplatePattern = z.infer<typeof insertTemplatePatternSchema>;
export type AnalysisSubscription = typeof analysisSubscriptions.$inferSelect;
export type InsertAnalysisSubscription = z.infer<typeof insertAnalysisSubscriptionSchema>;
export type TemplateFeedback = typeof templateFeedback.$inferSelect;
export type InsertTemplateFeedback = z.infer<typeof insertTemplateFeedbackSchema>;
export type ServiceWorkflow = typeof serviceWorkflows.$inferSelect;
export type InsertServiceWorkflow = z.infer<typeof insertServiceWorkflowSchema>;
export type DataUpload = typeof dataUploads.$inferSelect;
export type InsertDataUpload = z.infer<typeof insertDataUploadSchema>;
export type AnalysisPlanRow = typeof analysisPlans.$inferSelect;
export type InsertAnalysisPlanRow = typeof analysisPlans.$inferInsert;

// Analysis plan content schemas shared across services
export const analysisStepSchema = z.object({
  stepNumber: z.number().int().positive(),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  method: z.string().min(1).max(100),
  inputs: z.array(z.string()).default([]),
  expectedOutputs: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  estimatedDuration: z.string().max(50),
  confidence: z.number().min(0).max(100),
});
export type AnalysisStep = z.infer<typeof analysisStepSchema>;

export const dataAssessmentSchema = z.object({
  qualityScore: z.number().min(0).max(100),
  completenessScore: z.number().min(0).max(100),
  recordCount: z.number().int().nonnegative(),
  columnCount: z.number().int().positive(),
  missingData: z.array(z.string()).default([]),
  recommendedTransformations: z.array(z.string()).default([]),
  infrastructureNeeds: z.object({
    useSpark: z.boolean(),
    estimatedMemoryGB: z.number().positive(),
    parallelizable: z.boolean(),
  }),
  estimatedProcessingTime: z.string().max(50),
});
export type DataAssessment = z.infer<typeof dataAssessmentSchema>;

export const mlModelSpecSchema = z.object({
  modelType: z.string().max(50),
  algorithm: z.string().max(100),
  targetVariable: z.string().max(100),
  features: z.array(z.string()),
  expectedAccuracy: z.string().max(50),
  trainingTime: z.string().max(50),
  interpretability: z.string().max(100).optional(),
});
export type MLModelSpec = z.infer<typeof mlModelSpecSchema>;

export const visualizationSpecSchema = z.object({
  type: z.string().max(50),
  title: z.string().max(200),
  description: z.string().max(500),
  dataFields: z.array(z.string()).optional(),
  relatedQuestions: z.array(z.string()).optional(),
  analysisStep: z.string().max(200).optional(),
});
export type VisualizationSpec = z.infer<typeof visualizationSpecSchema>;

export const businessContextSchema = z.object({
  industryBenchmarks: z.array(z.string()).default([]),
  relevantKPIs: z.array(z.string()).default([]),
  complianceRequirements: z.array(z.string()).default([]),
  reportingStandards: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
});
export type BusinessContext = z.infer<typeof businessContextSchema>;

export const costBreakdownSchema = z.object({
  total: z.number().nonnegative(),
  breakdown: z.record(z.number().nonnegative()),
});
export type CostBreakdown = z.infer<typeof costBreakdownSchema>;

export const agentContributionSchema = z.object({
  completedAt: z.string().datetime(),
  contribution: z.string().max(500),
  duration: z.number().nonnegative().optional(),
  status: z.enum(["success", "partial", "failed"]),
  error: z.string().optional(),
});
export type AgentContribution = z.infer<typeof agentContributionSchema>;

export const analysisPlanSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  createdBy: z.string().default("pm_agent"),
  version: z.number().int().positive().default(1),
  executiveSummary: z.string().min(50).max(2000),
  dataAssessment: dataAssessmentSchema,
  analysisSteps: z.array(analysisStepSchema).min(1),
  visualizations: z.array(visualizationSpecSchema).default([]),
  businessContext: businessContextSchema.optional(),
  mlModels: z.array(mlModelSpecSchema).default([]),
  estimatedCost: costBreakdownSchema,
  estimatedDuration: z.string().max(50),
  complexity: z.enum(["low", "medium", "high", "very_high"]),
  risks: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  agentContributions: z.record(agentContributionSchema),
  status: AnalysisPlanStatusEnum,
  approvedAt: z.date().optional(),
  approvedBy: z.string().optional(),
  rejectionReason: z.string().optional(),
  modificationsRequested: z.string().optional(),
  executedAt: z.date().optional(),
  executionCompletedAt: z.date().optional(),
  actualCost: costBreakdownSchema.optional(),
  actualDuration: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const insertAnalysisPlanSchema = analysisPlanSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
  executedAt: true,
  executionCompletedAt: true,
});

export type AnalysisPlan = z.infer<typeof analysisPlanSchema>;
export type InsertAnalysisPlan = z.infer<typeof insertAnalysisPlanSchema>;

// Knowledge graph tables powering the business-agent knowledge base
export const knowledgeNodes = pgTable("knowledge_nodes", {
  id: varchar("id").primaryKey().$defaultFn(() => nanoid()),
  type: varchar("type", { length: 50 }).notNull(),
  label: varchar("label", { length: 200 }).notNull(),
  summary: text("summary"),
  attributes: jsonb("attributes").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  typeLabelIdx: index("knowledge_nodes_type_label_idx").on(table.type, table.label),
  typeLabelUnique: uniqueIndex("knowledge_nodes_type_label_unique").on(table.type, table.label),
}));

export const knowledgeEdges = pgTable("knowledge_edges", {
  id: varchar("id").primaryKey().$defaultFn(() => nanoid()),
  sourceId: varchar("source_id").notNull(),
  targetId: varchar("target_id").notNull(),
  relationship: varchar("relationship", { length: 100 }).notNull(),
  weight: doublePrecision("weight").default(1),
  attributes: jsonb("attributes").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  sourceTargetIdx: index("knowledge_edges_source_target_idx").on(table.sourceId, table.targetId),
  relationshipIdx: index("knowledge_edges_relationship_idx").on(table.relationship),
  sourceFk: foreignKey({
    columns: [table.sourceId],
    foreignColumns: [knowledgeNodes.id],
    name: "knowledge_edges_source_id_fk",
  }).onDelete("cascade"),
  targetFk: foreignKey({
    columns: [table.targetId],
    foreignColumns: [knowledgeNodes.id],
    name: "knowledge_edges_target_id_fk",
  }).onDelete("cascade"),
}));

export type KnowledgeNode = typeof knowledgeNodes.$inferSelect;
export type InsertKnowledgeNode = typeof knowledgeNodes.$inferInsert;
export type KnowledgeEdge = typeof knowledgeEdges.$inferSelect;
export type InsertKnowledgeEdge = typeof knowledgeEdges.$inferInsert;

// ============================================
// Business Definition Registry
// Stores business metric definitions for data element mapping
// Used by BA Agent to translate requirements to transformations
// ============================================

/**
 * Business Definitions Registry
 * Stores how business concepts (e.g., "engagement_score") map to data operations
 * Enables BA/Researcher agents to lookup and apply business logic
 */
export const businessDefinitions = pgTable("business_definitions", {
  id: varchar("id").primaryKey().$defaultFn(() => nanoid()),

  // Ownership (can be global or project-specific)
  projectId: varchar("project_id").references(() => projects.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),

  // Definition identity
  conceptName: varchar("concept_name", { length: 200 }).notNull(), // e.g., "engagement_score", "churn_rate"
  displayName: varchar("display_name", { length: 200 }), // Human-friendly name
  industry: varchar("industry", { length: 100 }).default("general"), // HR, Finance, Sales, etc.
  domain: varchar("domain", { length: 100 }), // Specific sub-domain (e.g., "employee_engagement")

  // Business definition (what it means)
  businessDescription: text("business_description").notNull(), // "Average of Q1-Q5 survey scores"
  businessContext: text("business_context"), // When/why this metric is used

  // Calculation specification (how to compute it)
  calculationType: varchar("calculation_type", { length: 50 }).notNull(), // 'direct', 'derived', 'aggregated', 'composite'
  formula: text("formula"), // Mathematical formula: "(Q1 + Q2 + Q3 + Q4 + Q5) / 5"
  pseudoCode: text("pseudo_code"), // Step-by-step calculation logic
  componentFields: jsonb("component_fields").default("[]"), // ["Q1_score", "Q2_score", ...]
  aggregationMethod: varchar("aggregation_method", { length: 50 }), // 'average', 'sum', 'count', 'weighted_average'

  // Data type expectations
  expectedDataType: varchar("expected_data_type", { length: 50 }).default("numeric"), // numeric, categorical, boolean
  valueRange: jsonb("value_range"), // { min: 0, max: 100 } or { values: ["High", "Medium", "Low"] }
  unit: varchar("unit", { length: 50 }), // "percent", "dollars", "count", etc.

  // Matching patterns (for automatic field detection)
  matchPatterns: jsonb("match_patterns").default("[]"), // ["engagement", "eng_score", "satisfaction"]
  synonyms: jsonb("synonyms").default("[]"), // Alternative names for the concept

  // Component field descriptors - rich semantic descriptors for abstract formula terms
  // Maps abstract component names (e.g., "employees_left") to concrete column detection patterns
  componentFieldDescriptors: jsonb("component_field_descriptors"), // Array<ComponentFieldDescriptor>

  // Source tracking
  sourceType: varchar("source_type", { length: 50 }).default("manual"), // 'manual', 'ai_inferred', 'external_research', 'template'
  sourceReference: text("source_reference"), // URL or citation for external definitions
  sourceAgentId: varchar("source_agent_id", { length: 50 }), // Which agent created this

  // Quality metrics
  confidence: doublePrecision("confidence").default(0.8), // 0-1 confidence in definition
  usageCount: integer("usage_count").default(0), // How many times used
  successRate: doublePrecision("success_rate"), // Rate of successful mappings
  lastUsedAt: timestamp("last_used_at"),

  // Status
  status: varchar("status", { length: 50 }).default("active"), // 'active', 'deprecated', 'pending_review'

  // Semantic Search
  // Vector embedding for semantic similarity search (stored as JSONB array, uses pgvector if available)
  // 1536 dimensions to match OpenAI text-embedding-ada-002 / Gemini padded embeddings
  embedding: vector("embedding").$type<number[] | null>(), // semantic embedding vector (pgvector)

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  conceptNameIdx: index("bd_concept_name_idx").on(table.conceptName),
  industryIdx: index("bd_industry_idx").on(table.industry),
  domainIdx: index("bd_domain_idx").on(table.domain),
  projectIdIdx: index("bd_project_id_idx").on(table.projectId),
  calculationTypeIdx: index("bd_calculation_type_idx").on(table.calculationType),
  statusIdx: index("bd_status_idx").on(table.status),
  // Composite index for lookups
  industryConceptIdx: index("bd_industry_concept_idx").on(table.industry, table.conceptName),
}));

export type BusinessDefinition = typeof businessDefinitions.$inferSelect;
export type InsertBusinessDefinition = typeof businessDefinitions.$inferInsert;

/**
 * Component Field Descriptor - rich semantic descriptor for an abstract formula component.
 * Bridges abstract terms like "employees_left" to actual dataset column patterns.
 *
 * Used by matchComponentFields() and mapElementsWithAI() to resolve
 * formula components to concrete columns in the user's dataset.
 */
export interface ComponentFieldDescriptor {
  abstractName: string;              // "employees_left" - the name used in the formula
  semanticMeaning: string;           // "Count of employees who separated during the period"
  derivationLogic: string;           // "COUNT rows WHERE termination_date IS NOT NULL AND within period"
  columnMatchPatterns: string[];     // ["termination", "separation", "exit", "term_date", "end_date", "status"]
  columnMatchType:                   // How the column value maps to the abstract concept
    | 'direct_value'                 // Column value IS the value (e.g., salary → salary)
    | 'date_presence_indicator'      // Non-null date = event occurred (e.g., Termination Date → separated)
    | 'count_distinct'               // Count of distinct values (e.g., Employee_ID → headcount)
    | 'status_filter'                // Filter by status value (e.g., Status = "Terminated")
    | 'date_range_filter'            // Filter rows by date range (e.g., Hire Date within period)
    | 'aggregation';                 // Pre-aggregated value
  dataTypeExpected: 'date' | 'identifier' | 'numeric' | 'categorical' | 'text' | 'boolean';
  isIntermediate: boolean;           // True if this needs further derivation (not a direct column)
  statusValues?: string[];           // For status_filter: which values indicate the condition
  nullMeaning?: string;              // What a NULL value means (e.g., "employee is still active")
  presenceMeaning?: string;          // What a non-NULL value means (e.g., "employee has separated")
}

// ============================================
// Cost Tracking Tables (3-Table Architecture)
// ============================================

/**
 * Project Cost Tracking
 * Aggregated cost tracking per project with category breakdowns
 */
export const projectCostTracking = pgTable("project_cost_tracking", {
  id: varchar("id").primaryKey().$defaultFn(() => nanoid()),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Cost breakdown by category (in cents)
  dataProcessingCost: integer("data_processing_cost").default(0).notNull(),
  aiQueryCost: integer("ai_query_cost").default(0).notNull(),
  analysisExecutionCost: integer("analysis_execution_cost").default(0).notNull(),
  visualizationCost: integer("visualization_cost").default(0).notNull(),
  exportCost: integer("export_cost").default(0).notNull(),
  collaborationCost: integer("collaboration_cost").default(0).notNull(),
  totalCost: integer("total_cost").default(0).notNull(),

  // Journey context
  journeyType: varchar("journey_type"),
  subscriptionTier: varchar("subscription_tier"),

  // Billing cycle tracking
  billingCycle: varchar("billing_cycle").default("monthly"),
  periodStart: timestamp("period_start").defaultNow().notNull(),
  periodEnd: timestamp("period_end"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("pct_project_id_idx").on(table.projectId),
  userIdIdx: index("pct_user_id_idx").on(table.userId),
  billingCycleIdx: index("pct_billing_cycle_idx").on(table.billingCycle),
}));

/**
 * Cost Line Items
 * Detailed transaction log for every cost-incurring action
 * Stores pricing snapshots for historical accuracy
 */
export const costLineItems = pgTable("cost_line_items", {
  id: varchar("id").primaryKey().$defaultFn(() => nanoid()),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Cost details
  category: varchar("category").notNull(),
  description: text("description").notNull(),
  unitCost: integer("unit_cost").notNull(), // Cost per unit in cents
  quantity: integer("quantity").default(1).notNull(),
  totalCost: integer("total_cost").notNull(), // unitCost * quantity (in cents)

  // Pricing context (for audit trail)
  pricingTierId: varchar("pricing_tier_id"),
  pricingRuleId: varchar("pricing_rule_id"),
  pricingSnapshot: jsonb("pricing_snapshot"), // Full pricing config at time of transaction

  // Metadata for attribution
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),

  // Timestamps
  incurredAt: timestamp("incurred_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("cli_project_id_idx").on(table.projectId),
  userIdIdx: index("cli_user_id_idx").on(table.userId),
  categoryIdx: index("cli_category_idx").on(table.category),
  incurredAtIdx: index("cli_incurred_at_idx").on(table.incurredAt),
}));

/**
 * User Monthly Billing
 * Aggregated monthly billing summaries per user
 * Used for invoice generation and billing reconciliation
 */
export const userMonthlyBilling = pgTable("user_monthly_billing", {
  id: varchar("id").primaryKey().$defaultFn(() => nanoid()),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Billing period
  billingMonth: varchar("billing_month").notNull(), // Format: YYYY-MM
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),

  // Cost breakdown (in cents)
  subscriptionCost: integer("subscription_cost").default(0).notNull(),
  usageCost: integer("usage_cost").default(0).notNull(),
  overageCost: integer("overage_cost").default(0).notNull(),
  totalCost: integer("total_cost").notNull(),

  // Category breakdown (JSONB for flexibility)
  categoryBreakdown: jsonb("category_breakdown").default(sql`'{}'::jsonb`),

  // Billing status
  status: varchar("status").default("pending").notNull(),
  invoiceId: varchar("invoice_id"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("umb_user_id_idx").on(table.userId),
  billingMonthIdx: index("umb_billing_month_idx").on(table.billingMonth),
  statusIdx: index("umb_status_idx").on(table.status),
  uniqueUserMonth: uniqueIndex("umb_user_month_unique").on(table.userId, table.billingMonth),
}));

// Zod Schemas for Cost Tracking Tables
export const projectCostTrackingSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  userId: z.string(),
  dataProcessingCost: z.number().int().nonnegative(),
  aiQueryCost: z.number().int().nonnegative(),
  analysisExecutionCost: z.number().int().nonnegative(),
  visualizationCost: z.number().int().nonnegative(),
  exportCost: z.number().int().nonnegative(),
  collaborationCost: z.number().int().nonnegative(),
  totalCost: z.number().int().nonnegative(),
  journeyType: z.string().optional(),
  subscriptionTier: z.string().optional(),
  billingCycle: z.string(),
  periodStart: z.date(),
  periodEnd: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const costLineItemSchema = z.object({
  id: z.string(),
  projectId: z.string().optional(),
  userId: z.string(),
  category: z.string(),
  description: z.string(),
  unitCost: z.number().int(),
  quantity: z.number().int().positive(),
  totalCost: z.number().int(),
  pricingTierId: z.string().optional(),
  pricingRuleId: z.string().optional(),
  pricingSnapshot: z.any().optional(),
  metadata: z.record(z.any()),
  incurredAt: z.date(),
});

export const userMonthlyBillingSchema = z.object({
  id: z.string(),
  userId: z.string(),
  billingMonth: z.string(),
  periodStart: z.date(),
  periodEnd: z.date(),
  subscriptionCost: z.number().int().nonnegative(),
  usageCost: z.number().int().nonnegative(),
  overageCost: z.number().int().nonnegative(),
  totalCost: z.number().int(),
  categoryBreakdown: z.record(z.number().int().nonnegative()),
  status: z.enum(["pending", "invoiced", "paid", "overdue", "cancelled"]),
  invoiceId: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ProjectCostTracking = z.infer<typeof projectCostTrackingSchema>;
export type CostLineItem = z.infer<typeof costLineItemSchema>;
export type UserMonthlyBilling = z.infer<typeof userMonthlyBillingSchema>;

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

// Agent execution tracking for normalized multi-agent logs
export const agentExecutions = pgTable(
  "agent_executions",
  {
    id: varchar("id", { length: 50 }).primaryKey(),
    projectId: varchar("project_id", { length: 50 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    agentType: varchar("agent_type", { length: 30 })
      .$type<'project_manager' | 'data_engineer' | 'data_scientist' | 'business_agent' | 'template_research' | 'customer_support'>()
      .notNull(),
    status: varchar("status", { length: 20 })
      .$type<'pending' | 'running' | 'success' | 'partial' | 'failed' | 'cancelled'>()
      .default("pending")
      .notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    executionTimeMs: integer("execution_time_ms"),
    tokensUsed: integer("tokens_used"),
    modelUsed: varchar("model_used", { length: 100 }),
    errorMessage: text("error_message"),
    errorCode: varchar("error_code", { length: 50 }),
    dependsOnIds: varchar("depends_on_ids", { length: 50 }).array(),
    workflowId: varchar("workflow_id", { length: 50 }),
  },
  (table) => ({
    projectIdx: index("idx_executions_project").on(table.projectId),
    projectAgentIdx: index("idx_executions_project_agent").on(table.projectId, table.agentType),
    workflowIdx: index("idx_executions_workflow").on(table.workflowId),
  })
);

export type AgentExecution = typeof agentExecutions.$inferSelect;
export type InsertAgentExecution = typeof agentExecutions.$inferInsert;

// ML/LLM Usage Log Table
export const mlUsageLog = pgTable(
  "ml_llm_usage_log",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull().references(() => users.id),
    projectId: varchar("project_id").references(() => projects.id),
    toolName: text("tool_name").notNull(),
    modelType: text("model_type"), // 'traditional_ml' | 'llm'
    libraryUsed: text("library_used"),
    datasetSize: integer("dataset_size"),
    executionTimeMs: integer("execution_time_ms"),
    billingUnits: doublePrecision("billing_units").notNull(),
    success: boolean("success").notNull(),
    error: text("error"),
    metadata: jsonb("metadata"),
    timestamp: timestamp("timestamp").notNull().defaultNow()
  },
  (table) => ({
    userIdIdx: index("ml_llm_usage_log_user_id_idx").on(table.userId),
    projectIdIdx: index("ml_llm_usage_log_project_id_idx").on(table.projectId),
    timestampIdx: index("ml_llm_usage_log_timestamp_idx").on(table.timestamp),
    toolNameIdx: index("ml_llm_usage_log_tool_name_idx").on(table.toolName),
    userTimestampIdx: index("ml_llm_usage_log_user_timestamp_idx").on(table.userId, table.timestamp),
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

export const insertMLUsageLogSchema = createInsertSchema(mlUsageLog).omit({
  id: true,
  timestamp: true,
});

// Pricing Request/Response Schemas
export const pricingEstimateRequestSchema = z.object({
  journeyType: z.enum(['non-tech', 'business', 'technical']),
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
  journeyType: z.enum(['non-tech', 'business', 'technical']),
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
  journeyType: z.enum(['non-tech', 'business', 'technical']),
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

// Authentication validation schemas
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/\d/, "Password must contain at least one number"),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const verifyResetCodeSchema = z.object({
  email: z.string().email("Invalid email address"),
  code: z.string().length(6, "Code must be 6 digits"),
});

export const resetPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
  code: z.string().length(6, "Code must be 6 digits"),
  newPassword: z.string().min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/\d/, "Password must contain at least one number"),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

// Auth response schemas
export const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  emailVerified: z.boolean(),
});

// Express request user interface (what gets attached to req.user after auth)
export type ExpressUser = z.infer<typeof authUserSchema>;

export const loginResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  user: authUserSchema,
  token: z.string(),
});

export const registerResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  user: authUserSchema,
  token: z.string(),
});

const technicalQueryContextSchema = z.object({
  data: z.any().optional(),
  schema: z.any().optional(),
  requirements: z.array(z.string()).optional(),
  code: z.string().optional(),
  error: z.string().optional(),
  userId: z.string().optional(),
  projectId: z.string().optional(),
}).passthrough();

const technicalQueryParametersSchema = z.object({
  model: z.string().optional(),
  technicalLevel: z.string().optional(),
  temperature: z.number().optional(),
  targetVariable: z.string().optional(),
  variables: z.array(z.string()).optional(),
  features: z.array(z.string()).optional(),
  covariates: z.array(z.string()).optional(),
  performancePriority: z.string().optional(),
  realTime: z.boolean().optional(),
  interactive: z.boolean().optional(),
  chartType: z.string().optional(),
  title: z.string().optional(),
  xAxis: z.string().optional(),
  yAxis: z.string().optional(),
  exportFormats: z.array(z.string()).optional(),
  targetColumn: z.string().optional(),
  mlParams: z.record(z.any()).optional(),
  useAutoML: z.boolean().optional(),
  enableExplainability: z.boolean().optional(),
  dataSize: z.union([z.number(), z.string()]).optional(),
  styling: z.string().optional(),
}).catchall(z.any());

export const TechnicalQuery = z.object({
  type: z.string(),
  prompt: z.string(),
  context: technicalQueryContextSchema.optional(),
  parameters: technicalQueryParametersSchema.optional(),
  metadata: z.object({
    language: z.string().optional(),
    framework: z.string().optional(),
    domain: z.string().optional(),
  }).optional(),
});

// ============================================================================
// Phase 2: Enterprise Security Tables
// ============================================================================

// Row-Level Security Policies
export const rlsPolicies = pgTable("rls_policies", {
  id: varchar("id").primaryKey().notNull(),
  tableName: varchar("table_name").notNull(),
  operation: varchar("operation").notNull(), // SELECT, INSERT, UPDATE, DELETE
  userRole: varchar("user_role").notNull(),
  condition: text("condition").notNull(), // SQL WHERE clause template
  enabled: boolean("enabled").default(true),
  priority: integer("priority").default(100),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tableNameIdx: index("rls_policies_table_name_idx").on(table.tableName),
  userRoleIdx: index("rls_policies_user_role_idx").on(table.userRole),
  enabledIdx: index("rls_policies_enabled_idx").on(table.enabled),
}));

// Audit Logs
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  userId: varchar("user_id").notNull(),
  userEmail: varchar("user_email").notNull(),
  userRole: varchar("user_role").notNull(),
  action: varchar("action").notNull(), // READ, WRITE, UPDATE, DELETE, LOGIN, etc.
  resource: varchar("resource").notNull(), // project, dataset, user, etc.
  resourceId: varchar("resource_id").notNull(),
  details: jsonb("details").default('{}'),
  severity: varchar("severity").notNull(), // INFO, WARNING, ERROR, CRITICAL
  category: varchar("category").notNull(), // DATA_ACCESS, AUTH, ADMIN, COMPLIANCE, SECURITY
  success: boolean("success").default(true),
  errorMessage: text("error_message"),
}, (table) => ({
  userIdIdx: index("audit_logs_user_id_idx").on(table.userId),
  timestampIdx: index("audit_logs_timestamp_idx").on(table.timestamp),
  actionIdx: index("audit_logs_action_idx").on(table.action),
  categoryIdx: index("audit_logs_category_idx").on(table.category),
  severityIdx: index("audit_logs_severity_idx").on(table.severity),
}));

// Data Masking Rules
export const maskingRules = pgTable("masking_rules", {
  id: varchar("id").primaryKey().notNull(),
  columnPattern: varchar("column_pattern").notNull(), // Regex or column name
  dataType: varchar("data_type").notNull(), // SSN, EMAIL, PHONE, CREDIT_CARD, etc.
  strategy: varchar("strategy").notNull(), // redaction, hashing, tokenization, partial, etc.
  config: jsonb("config").default('{}'),
  applyToRoles: jsonb("apply_to_roles").default('[]'), // Array of role names
  enabled: boolean("enabled").default(true),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  dataTypeIdx: index("masking_rules_data_type_idx").on(table.dataType),
  enabledIdx: index("masking_rules_enabled_idx").on(table.enabled),
}));

// ============================================================================
// Phase 2.2: GDPR/CCPA Compliance Tables
// ============================================================================

// Privacy Requests
export const privacyRequests = pgTable("privacy_requests", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),
  requestType: varchar("request_type").notNull(), // ACCESS, ERASURE, RECTIFICATION, PORTABILITY
  status: varchar("status").notNull(), // PENDING, APPROVED, REJECTED, COMPLETED
  details: jsonb("details").default('{}'),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
  processedBy: varchar("processed_by"),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  userIdIdx: index("privacy_requests_user_id_idx").on(table.userId),
  statusIdx: index("privacy_requests_status_idx").on(table.status),
  submittedAtIdx: index("privacy_requests_submitted_at_idx").on(table.submittedAt),
}));

// User Consents
export const userConsents = pgTable("user_consents", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),
  consentType: varchar("consent_type").notNull(), // MARKETING, ANALYTICS, DATA_PROCESSING, THIRD_PARTY_SHARING
  granted: boolean("granted").notNull(),
  grantedAt: timestamp("granted_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
  ipAddress: varchar("ip_address"),
}, (table) => ({
  userIdIdx: index("user_consents_user_id_idx").on(table.userId),
  consentTypeIdx: index("user_consents_consent_type_idx").on(table.consentType),
}));

// Data Processing Records
export const dataProcessingRecords = pgTable("data_processing_records", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),
  processingType: varchar("processing_type").notNull(),
  purpose: text("purpose").notNull(),
  legalBasis: varchar("legal_basis").notNull(),
  dataCategories: jsonb("data_categories").default('[]'),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("data_processing_records_user_id_idx").on(table.userId),
  timestampIdx: index("data_processing_records_timestamp_idx").on(table.timestamp),
}));

// ============================================================================
// Phase 2.3: Data Lineage & Metadata Management Tables
// ============================================================================

// Data Lineage
export const dataLineage = pgTable("data_lineage", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").notNull(),
  nodeType: varchar("node_type").notNull(), // SOURCE, TRANSFORMATION, OUTPUT
  nodeName: varchar("node_name").notNull(),
  nodeDetails: jsonb("node_details").default('{}'),
  parentNodes: jsonb("parent_nodes").default('[]'), // Array of parent node IDs
  metadata: jsonb("metadata").default('{}'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("data_lineage_project_id_idx").on(table.projectId),
  nodeTypeIdx: index("data_lineage_node_type_idx").on(table.nodeType),
}));

// Metadata Entries
export const metadataEntries = pgTable("metadata_entries", {
  id: varchar("id").primaryKey().notNull(),
  entityType: varchar("entity_type").notNull(), // DATASET, COLUMN, PROJECT, ANALYSIS
  entityId: varchar("entity_id").notNull(),
  name: varchar("name").notNull(),
  description: text("description"),
  owner: varchar("owner"),
  tags: jsonb("tags").default('[]'),
  customFields: jsonb("custom_fields").default('{}'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  entityTypeIdIdx: index("metadata_entries_entity_type_id_idx").on(table.entityType, table.entityId),
  nameIdx: index("metadata_entries_name_idx").on(table.name),
}));

// Data Tags
export const dataTags = pgTable("data_tags", {
  id: varchar("id").primaryKey().notNull(),
  name: varchar("name").notNull().unique(),
  category: varchar("category"),
  color: varchar("color"),
  description: text("description"),
});

// Business Glossary
export const businessGlossary = pgTable("business_glossary", {
  id: varchar("id").primaryKey().notNull(),
  term: varchar("term").notNull().unique(),
  definition: text("definition").notNull(),
  category: varchar("category"),
  relatedTerms: jsonb("related_terms").default('[]'),
  owner: varchar("owner"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  termIdx: index("business_glossary_term_idx").on(table.term),
}));

// Semantic Links - Traceability from questions → data elements → transformations → analysis results
export const semanticLinks = pgTable("semantic_links", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").notNull(),
  linkType: varchar("link_type").notNull(), // e.g., 'question_to_element', 'element_to_transformation', 'transformation_to_analysis'
  sourceId: varchar("source_id").notNull(),
  sourceType: varchar("source_type"),       // e.g., 'question', 'data_element', 'transformation'
  targetId: varchar("target_id").notNull(),
  targetType: varchar("target_type"),       // e.g., 'data_element', 'transformation', 'analysis_result'
  confidence: doublePrecision("confidence"),
  metadata: jsonb("metadata"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("semantic_links_project_id_idx").on(table.projectId),
  sourceIdx: index("semantic_links_source_idx").on(table.sourceId),
  targetIdx: index("semantic_links_target_idx").on(table.targetId),
  linkTypeIdx: index("semantic_links_link_type_idx").on(table.linkType),
}));

export const insertSemanticLinkSchema = createInsertSchema(semanticLinks).omit({
  createdAt: true,
});

// Column Embeddings - Pre-computed vector embeddings for dataset columns (RAG-based column matching)
export const columnEmbeddings = pgTable("column_embeddings", {
  id: serial("id").primaryKey(),
  datasetId: varchar("dataset_id").notNull(),
  projectId: varchar("project_id").notNull(),
  columnName: varchar("column_name").notNull(),
  normalizedName: varchar("normalized_name"),
  embedding: text("embedding").notNull(),       // JSON-serialized float array
  embeddingModel: varchar("embedding_model"),
  embeddingProvider: varchar("embedding_provider"),     // 'openai' | 'together' | 'gemini'
  embeddingDimensions: integer("embedding_dimensions"), // 768, 1024, or 1536
  columnType: varchar("column_type"),
  sampleValues: jsonb("sample_values"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  datasetIdIdx: index("column_embeddings_dataset_id_idx").on(table.datasetId),
  projectIdIdx: index("column_embeddings_project_id_idx").on(table.projectId),
}));

export const insertColumnEmbeddingsSchema = createInsertSchema(columnEmbeddings).omit({
  id: true,
  createdAt: true,
});

// Admin-configurable analysis pricing
export const analysisPricingConfig = pgTable("analysis_pricing_config", {
  id: varchar("id").primaryKey().notNull(),
  config: jsonb("config").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: varchar("updated_by"),
});
