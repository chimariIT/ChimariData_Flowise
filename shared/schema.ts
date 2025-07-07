import { z } from "zod";

// Simple data project schema
export const dataProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  fileName: z.string(),
  fileSize: z.number(),
  fileType: z.string(),
  uploadedAt: z.date(),
  schema: z.record(z.object({
    type: z.string(),
    nullable: z.boolean().optional(),
    sampleValues: z.array(z.string()).optional(),
    description: z.string().optional(),
  })).optional(),
  recordCount: z.number().optional(),
  processed: z.boolean().default(false),
});

export type DataProject = z.infer<typeof dataProjectSchema>;

// Insert schema (omit auto-generated fields)
export const insertDataProjectSchema = dataProjectSchema.omit({
  id: true,
  uploadedAt: true,
  processed: true,
});

export type InsertDataProject = z.infer<typeof insertDataProjectSchema>;

// File upload response
export const fileUploadResponseSchema = z.object({
  success: z.boolean(),
  projectId: z.string().optional(),
  project: dataProjectSchema.optional(),
  error: z.string().optional(),
});

export type FileUploadResponse = z.infer<typeof fileUploadResponseSchema>;