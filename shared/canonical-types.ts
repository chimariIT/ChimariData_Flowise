/**
 * Canonical Type Definitions
 *
 * SINGLE SOURCE OF TRUTH for all enums and type definitions across the platform.
 * These types enforce consistency between frontend, backend, and database.
 *
 * DO NOT create duplicate enums elsewhere - import from this file.
 */

import { z } from "zod";

// ==========================================
// USER ROLES
// ==========================================

/**
 * User Role Types
 * Maps to subscription tiers and determines UI/feature access
 */
export const UserRoleEnum = z.enum([
  "non-tech",     // Non-technical users - AI-guided journey
  "business",     // Business users - Template-based journey
  "technical",    // Technical users - Self-service journey
  "consultation", // Expert consultation users
  "custom"        // Bespoke hybrid users with tailored workflows
]);

export type UserRole = z.infer<typeof UserRoleEnum>;

/**
 * Technical proficiency levels
 * Used for personalization and complexity adaptation
 */
export const TechnicalLevelEnum = z.enum([
  "beginner",      // First-time data analysis users
  "intermediate",  // Some experience with data/Excel
  "advanced",      // Comfortable with SQL/Python
  "expert"         // Data science professionals
]);

export type TechnicalLevel = z.infer<typeof TechnicalLevelEnum>;

// ==========================================
// JOURNEY TYPES
// ==========================================

/**
 * Analysis Journey Types
 * Determines the workflow, agent involvement, and deliverables
 *
 * CANONICAL DEFINITION - Use everywhere
 * 
 * UPDATED (Dec 1, 2025): Changed to match frontend route naming
 * - ai_guided → non-tech (AI-guided journey for non-technical users)
 * - template_based → business (Template-based journey for business users)
 * - self_service → technical (Self-service journey for technical users)
 * - consultation, custom remain unchanged
 */
export const JourneyTypeEnum = z.enum([
  "non-tech",      // Full AI orchestration with checkpoints (formerly ai_guided)
  "business",      // Structured workflow with business templates (formerly template_based)
  "technical",     // Full user control with advanced tools (formerly self_service)
  "consultation",  // Expert-assisted analysis
  "custom"         // Hybrid workflow with bespoke orchestration
]);

export type JourneyType = z.infer<typeof JourneyTypeEnum>;

/**
 * Journey to Role Mapping
 * Defines which user roles can access which journey types
 */
export const journeyToRoleMapping = {
  'non-tech': ['non-tech'] as UserRole[],
  business: ['business'] as UserRole[],
  technical: ['technical'] as UserRole[],
  consultation: ['technical', 'business', 'consultation', 'custom'] as UserRole[],
  custom: ['technical', 'business', 'consultation', 'custom'] as UserRole[]
} as const;

/**
 * Journey Complexity Levels
 * Used for pricing and resource allocation
 */
export const JourneyComplexityEnum = z.enum([
  "simple",     // Basic analysis, single dataset
  "moderate",   // Multiple datasets, advanced statistics
  "complex",    // ML models, custom analysis
  "enterprise"  // Multi-project, custom integrations
]);

export type JourneyComplexity = z.infer<typeof JourneyComplexityEnum>;

// ==========================================
// SUBSCRIPTION TIERS
// ==========================================

/**
 * Subscription Tier Types
 * CANONICAL DEFINITION - Use everywhere for consistency
 */
export const SubscriptionTierEnum = z.enum([
  "none",          // No subscription (anonymous/guest)
  "trial",         // Trial period
  "starter",       // Entry-level paid tier
  "professional",  // Mid-tier with advanced features
  "enterprise"     // Full access with custom support
]);

export type SubscriptionTier = z.infer<typeof SubscriptionTierEnum>;

/**
 * Subscription Status
 * Tracks the state of a user's subscription
 */
export const SubscriptionStatusEnum = z.enum([
  "inactive",   // No active subscription
  "active",     // Currently active and paid
  "past_due",   // Payment failed, grace period
  "cancelled",  // User cancelled, may still have access until period end
  "expired"     // Subscription ended
]);

export type SubscriptionStatus = z.infer<typeof SubscriptionStatusEnum>;

/**
 * Subscription Tier to Journey Mapping
 * Defines which tiers can access which journeys
 */
export const tierToJourneyMapping = {
  none: [] as JourneyType[],
  trial: ['non-tech'] as JourneyType[],
  starter: ['non-tech', 'business'] as JourneyType[],
  professional: ['non-tech', 'business', 'technical'] as JourneyType[],
  enterprise: ['non-tech', 'business', 'technical', 'consultation', 'custom'] as JourneyType[]
} as const;

// ==========================================
// FEATURE TYPES & COMPLEXITY
// ==========================================

/**
 * Feature Categories
 * Different billable feature types
 */
export const FeatureCategoryEnum = z.enum([
  "data_upload",
  "data_transformation",
  "statistical_analysis",
  "machine_learning",
  "visualization",
  "ai_insights",
  "export",
  "collaboration"
]);

export type FeatureCategory = z.infer<typeof FeatureCategoryEnum>;

/**
 * Feature Complexity Levels
 * Used for usage-based pricing and quota management
 */
export const FeatureComplexityEnum = z.enum([
  "small",       // < 1k records, simple operations
  "medium",      // 1k-10k records, standard operations
  "large",       // 10k-100k records, advanced operations
  "extra_large"  // > 100k records, enterprise operations
]);

export type FeatureComplexity = z.infer<typeof FeatureComplexityEnum>;

/**
 * Feature complexity determination helper
 * Determines complexity based on BOTH data size AND operation complexity
 *
 * Complexity dimensions:
 * 1. Data size (row count, columns)
 * 2. Operation type (statistical complexity, analysis steps, processing time)
 * 3. Analysis components (number of steps in pipeline)
 * 4. Expected compute resources
 */
export function determineFeatureComplexity(
  recordCount: number,
  operationType: 'simple' | 'standard' | 'advanced' | 'enterprise'
): FeatureComplexity {
  // For very small datasets (< 1000 records)
  if (recordCount < 1000) {
    // Simple/standard operations on small data = small
    if (operationType === 'simple' || operationType === 'standard') {
      return 'small';
    }
    // Advanced/enterprise operations (MANOVA, complex ML) on small data = medium
    // Even small datasets require significant compute for complex statistical analysis
    return 'medium';
  }

  // For medium datasets (1k-10k records)
  if (recordCount < 10000) {
    // Enterprise operations (multi-step pipelines, ML) = large complexity
    if (operationType === 'enterprise') return 'large';
    // Advanced operations = medium-high
    if (operationType === 'advanced') return 'medium';
    // Standard/simple = medium
    return 'medium';
  }

  // For large datasets (10k-100k records)
  if (recordCount < 100000) {
    // Enterprise operations on large data = extra_large
    if (operationType === 'enterprise') return 'extra_large';
    return 'large';
  }

  // For very large datasets (>100k records)
  // All operations on very large datasets = extra_large
  return 'extra_large';
}

// ==========================================
// PROJECT & WORKFLOW STATUS
// ==========================================

/**
 * Project Status
 * Tracks the lifecycle state of a project
 */
export const ProjectStatusEnum = z.enum([
  "draft",          // Project created but not started
  "uploading",      // File upload in progress
  "processing",     // Initial data processing
  "pii_review",     // Awaiting PII consent
  "ready",          // Ready for analysis
  "analyzing",      // Analysis in progress
  "checkpoint",     // Awaiting user checkpoint decision
  "generating",     // Generating artifacts
  "plan_creation",  // Agents are building the analysis plan
  "plan_review",    // Awaiting user approval on the analysis plan
  "plan_approved",  // Plan approved and ready for downstream steps
  "completed",      // Analysis complete
  "error",          // Error occurred
  "cancelled"       // User cancelled
]);

export type ProjectStatus = z.infer<typeof ProjectStatusEnum>;

/**
 * Analysis Plan Status
 * Tracks lifecycle of generated analysis plans
 */
export const AnalysisPlanStatusEnum = z.enum([
  "pending",        // Plan creation has started
  "ready",          // Plan ready for user review
  "approved",       // User approved plan
  "rejected",       // User rejected the current plan
  "modified",       // Plan adjusted and waiting re-review
  "executing",      // Plan currently executing
  "completed",      // Plan execution completed
  "cancelled"       // Plan cancelled by user or system
]);

export type AnalysisPlanStatus = z.infer<typeof AnalysisPlanStatusEnum>;

/**
 * Agent Task Status
 * Status of individual agent tasks
 */
export const AgentTaskStatusEnum = z.enum([
  "queued",     // Task queued for execution
  "assigned",   // Task assigned to agent
  "running",    // Task currently executing
  "completed",  // Task completed successfully
  "failed",     // Task failed
  "timeout",    // Task exceeded time limit
  "cancelled"   // Task cancelled by user
]);

export type AgentTaskStatus = z.infer<typeof AgentTaskStatusEnum>;

/**
 * Checkpoint Decision Types
 * User responses to agent checkpoints
 */
export const CheckpointDecisionEnum = z.enum([
  "approve",       // Approve and continue
  "modify",        // Request modifications
  "reject",        // Reject and stop
  "skip",          // Skip this step
  "more_info"      // Request more information
]);

export type CheckpointDecision = z.infer<typeof CheckpointDecisionEnum>;

// ==========================================
// DATA TYPES & OPERATIONS
// ==========================================

/**
 * Data Source Types
 * Where data originates from
 */
export const DataSourceEnum = z.enum([
  "upload",        // File upload
  "google_drive",  // Google Drive integration
  "cloud_storage", // AWS/Azure/GCP storage
  "api",           // API integration
  "database",      // Direct database connection
  "streaming"      // Real-time data stream
]);

export type DataSource = z.infer<typeof DataSourceEnum>;

/**
 * Data Transformation Types
 */
export const TransformationTypeEnum = z.enum([
  "filter",            // Filter rows
  "select",            // Select columns
  "join",              // Join datasets
  "aggregate",         // Aggregate operations
  "pivot",             // Pivot table
  "normalize",         // Data normalization
  "outlier_detection", // Detect and handle outliers
  "missing_data",      // Handle missing data
  "feature_engineering" // Create derived features
]);

export type TransformationType = z.infer<typeof TransformationTypeEnum>;

/**
 * Analysis Types
 */
export const AnalysisTypeEnum = z.enum([
  "descriptive",      // Descriptive statistics
  "correlation",      // Correlation analysis
  "regression",       // Regression analysis
  "anova",            // ANOVA
  "ancova",           // ANCOVA
  "manova",           // MANOVA
  "mancova",          // MANCOVA
  "time_series",      // Time series analysis
  "clustering",       // Clustering
  "classification",   // Classification
  "custom"            // Custom analysis
]);

export type AnalysisType = z.infer<typeof AnalysisTypeEnum>;

// ==========================================
// ARTIFACT & DELIVERABLE TYPES
// ==========================================

/**
 * Artifact Types
 * Types of generated outputs
 */
export const ArtifactTypeEnum = z.enum([
  "report",           // PDF/HTML report
  "visualization",    // Chart/graph
  "dataset",          // Processed dataset
  "model",            // ML model
  "code",             // Generated code (Python/R)
  "presentation",     // Presentation slides
  "dashboard",        // Interactive dashboard
  "documentation"     // Technical documentation
]);

export type ArtifactType = z.infer<typeof ArtifactTypeEnum>;

/**
 * Export Format Types
 */
export const ExportFormatEnum = z.enum([
  "pdf",
  "csv",
  "json",
  "excel",
  "png",
  "svg",
  "html",
  "python",
  "r",
  "sql"
]);

export type ExportFormat = z.infer<typeof ExportFormatEnum>;

// ==========================================
// AGENT TYPES
// ==========================================

/**
 * Agent Types
 * Different agent roles in the multi-agent system
 */
export const AgentTypeEnum = z.enum([
  "project_manager",   // Orchestrates workflow
  "data_scientist",    // Technical analysis
  "business_analyst",  // Business insights
  "data_engineer",     // Data pipeline management
  "ml_specialist",     // Machine learning
  "visualization",     // Visualization generation
  "quality_assurance", // Result validation
  "customer_support"   // User assistance
]);

export type AgentType = z.infer<typeof AgentTypeEnum>;

/**
 * Agent Status
 */
export const AgentStatusEnum = z.enum([
  "active",       // Agent ready for tasks
  "busy",         // Agent executing task
  "idle",         // Agent available but idle
  "maintenance",  // Agent under maintenance
  "error",        // Agent in error state
  "offline"       // Agent not available
]);

export type AgentStatus = z.infer<typeof AgentStatusEnum>;

// ==========================================
// PII & PRIVACY
// ==========================================

/**
 * PII Category Types
 * Types of personally identifiable information
 */
export const PIICategoryEnum = z.enum([
  "name",
  "email",
  "phone",
  "ssn",
  "credit_card",
  "address",
  "date_of_birth",
  "ip_address",
  "medical",
  "financial",
  "biometric",
  "custom"
]);

export type PIICategory = z.infer<typeof PIICategoryEnum>;

/**
 * PII Handling Decision
 * User's decision on how to handle detected PII
 */
export const PIIDecisionEnum = z.enum([
  "anonymize",         // Anonymize all PII
  "keep_with_consent", // Keep PII with explicit consent
  "remove_fields",     // Remove PII fields entirely
  "reject"             // Reject upload/processing
]);

export type PIIDecision = z.infer<typeof PIIDecisionEnum>;

/**
 * Data Retention Policy
 */
export const RetentionPolicyEnum = z.enum([
  "30_days",
  "90_days",
  "1_year",
  "7_years",    // Legal/compliance requirement
  "indefinite",
  "until_deleted" // User-controlled
]);

export type RetentionPolicy = z.infer<typeof RetentionPolicyEnum>;

// ==========================================
// BILLING & PAYMENT
// ==========================================

/**
 * Payment Status
 */
export const PaymentStatusEnum = z.enum([
  "pending",
  "processing",
  "succeeded",
  "failed",
  "refunded",
  "disputed"
]);

export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

/**
 * Billing Cycle
 */
export const BillingCycleEnum = z.enum([
  "monthly",
  "quarterly",
  "annual",
  "usage_based" // Pay-per-use
]);

export type BillingCycle = z.infer<typeof BillingCycleEnum>;

/**
 * Invoice Status
 */
export const InvoiceStatusEnum = z.enum([
  "draft",
  "open",
  "paid",
  "void",
  "uncollectible"
]);

export type InvoiceStatus = z.infer<typeof InvoiceStatusEnum>;

// ==========================================
// VALIDATION HELPERS
// ==========================================

/**
 * Validate journey eligibility for user role
 */
export function canAccessJourney(role: UserRole, journey: JourneyType): boolean {
  const allowedRoles = journeyToRoleMapping[journey];
  return allowedRoles.includes(role);
}

/**
 * Validate journey eligibility for subscription tier
 */
export function canAccessJourneyForTier(tier: SubscriptionTier, journey: JourneyType): boolean {
  const allowedJourneys = tierToJourneyMapping[tier];
  return allowedJourneys.includes(journey);
}

/**
 * Get allowed journeys for role
 */
export function getAllowedJourneysForRole(role: UserRole): JourneyType[] {
  return (Object.entries(journeyToRoleMapping) as [JourneyType, UserRole[]][])
    .filter(([_, roles]) => roles.includes(role))
    .map(([journey, _]) => journey);
}

/**
 * Get allowed journeys for subscription tier
 */
export function getAllowedJourneysForTier(tier: SubscriptionTier): JourneyType[] {
  return tierToJourneyMapping[tier] as JourneyType[];
}

/**
 * Validate role and tier combination for journey
 */
export function validateJourneyAccess(
  role: UserRole,
  tier: SubscriptionTier,
  journey: JourneyType
): { allowed: boolean; reason?: string } {
  if (!canAccessJourney(role, journey)) {
    return {
      allowed: false,
      reason: `Role '${role}' cannot access '${journey}' journey. Allowed roles: ${journeyToRoleMapping[journey].join(', ')}`
    };
  }

  if (!canAccessJourneyForTier(tier, journey)) {
    return {
      allowed: false,
      reason: `Subscription tier '${tier}' cannot access '${journey}' journey. Upgrade to access this journey.`
    };
  }

  return { allowed: true };
}

// ==========================================
// TYPE GUARDS
// ==========================================

/**
 * Type guard for UserRole
 */
export function isUserRole(value: unknown): value is UserRole {
  return UserRoleEnum.safeParse(value).success;
}

/**
 * Type guard for JourneyType
 */
export function isJourneyType(value: unknown): value is JourneyType {
  return JourneyTypeEnum.safeParse(value).success;
}

/**
 * Type guard for SubscriptionTier
 */
export function isSubscriptionTier(value: unknown): value is SubscriptionTier {
  return SubscriptionTierEnum.safeParse(value).success;
}

/**
 * Type guard for FeatureComplexity
 */
export function isFeatureComplexity(value: unknown): value is FeatureComplexity {
  return FeatureComplexityEnum.safeParse(value).success;
}

// ==========================================
// CONSTANTS
// ==========================================

/**
 * Default values
 */
export const DEFAULTS = {
  USER_ROLE: 'non-tech' as UserRole,
  SUBSCRIPTION_TIER: 'none' as SubscriptionTier,
  SUBSCRIPTION_STATUS: 'inactive' as SubscriptionStatus,
  JOURNEY_TYPE: 'non-tech' as JourneyType,
  PROJECT_STATUS: 'draft' as ProjectStatus,
  TECHNICAL_LEVEL: 'beginner' as TechnicalLevel,
  DATA_SOURCE: 'upload' as DataSource,
  RETENTION_POLICY: '90_days' as RetentionPolicy
} as const;

/**
 * Tier priorities (for upgrade/downgrade logic)
 */
export const TIER_PRIORITY = {
  none: 0,
  trial: 1,
  starter: 2,
  professional: 3,
  enterprise: 4
} as const;

/**
 * Get tier priority
 */
export function getTierPriority(tier: SubscriptionTier): number {
  return TIER_PRIORITY[tier];
}

/**
 * Check if tier1 is higher than tier2
 */
export function isHigherTier(tier1: SubscriptionTier, tier2: SubscriptionTier): boolean {
  return getTierPriority(tier1) > getTierPriority(tier2);
}

// ==========================================
// EXPORTS
// ==========================================

// All enums and types are already exported with `export const` throughout this file
// No need for duplicate export statements
