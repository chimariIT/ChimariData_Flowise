import { z } from "zod";

export const TechnicalQuery = z.object({
    type: z.string(),
    prompt: z.string(),
    context: z.any(),
    parameters: z.any().optional(),
    metadata: z.any().optional(),
});

export type TechnicalQuery = z.infer<typeof TechnicalQuery>;
