import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password"),
  email: text("email").unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profileImageUrl: text("profile_image_url"),
  provider: text("provider").default("local"), // local, google, microsoft, apple
  providerId: text("provider_id"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  schema: jsonb("schema"),
  questions: jsonb("questions").default([]),
  insights: jsonb("insights").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  ownerId: integer("owner_id").references(() => users.id),
  recordCount: integer("record_count").default(0),
  status: text("status").default("active"),
  dataSnapshot: jsonb("data_snapshot"), // Store sample data for AI analysis
  analysisType: text("analysis_type").default("standard"), // standard, advanced, custom
  paymentType: text("payment_type").default("subscription"), // subscription, one_time
  paymentAmount: integer("payment_amount"), // amount in cents for one-time payments
  paymentStatus: text("payment_status").default("pending"), // pending, paid, failed
  isPaid: boolean("is_paid").default(false), // true after successful payment
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  dataSizeMB: integer("data_size_mb").default(0),
  complexityScore: integer("complexity_score").default(1), // 1-5 based on data structure and questions
  fileMetadata: jsonb("file_metadata"), // Store original filename, sheets, header info
});

export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  aiProvider: text("ai_provider").default("platform"), // platform, anthropic, openai, gemini
  aiApiKey: text("ai_api_key"), // encrypted API key (null for platform provider)
  subscriptionTier: text("subscription_tier").default("starter"), // starter, professional, enterprise
  usageQuota: integer("usage_quota").default(50), // monthly AI queries allowed
  usageCount: integer("usage_count").default(0), // current month usage
  lastResetDate: timestamp("last_reset_date").defaultNow(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  monthlyUsage: integer("monthly_usage").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const usageLogs = pgTable("usage_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  projectId: text("project_id").references(() => projects.id),
  action: text("action").notNull(), // query, upload, export, etc.
  provider: text("provider"), // which AI provider was used
  tokensUsed: integer("tokens_used").default(0),
  cost: text("cost"), // estimated cost in USD
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  ownerId: true,
});

export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastResetDate: true,
});

export const insertUsageLogSchema = createInsertSchema(usageLogs).omit({
  id: true,
  createdAt: true,
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const aiQuerySchema = z.object({
  query: z.string().min(1, "Query is required"),
  projectId: z.string().min(1, "Project ID is required"),
});

export const subscriptionUpgradeSchema = z.object({
  tier: z.enum(["starter", "professional", "enterprise"]),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUsageLog = z.infer<typeof insertUsageLogSchema>;
export type UsageLog = typeof usageLogs.$inferSelect;
export type LoginData = z.infer<typeof loginSchema>;
export type RegisterData = z.infer<typeof registerSchema>;
export type AIQueryData = z.infer<typeof aiQuerySchema>;
export type SubscriptionUpgrade = z.infer<typeof subscriptionUpgradeSchema>;
