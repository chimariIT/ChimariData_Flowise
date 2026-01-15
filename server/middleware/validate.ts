/**
 * Validation Middleware
 * Validates request body, query, and params against Zod schemas
 * FAIL FAST: Invalid data rejected at API boundary with detailed errors
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodSchema, ZodError, z } from 'zod';

/**
 * Error response format for validation failures
 */
interface ValidationErrorResponse {
  success: false;
  error: string;
  details: Array<{
    path: string;
    message: string;
    code?: string;
  }>;
}

/**
 * Format Zod errors into API-friendly response
 */
function formatZodError(error: ZodError): ValidationErrorResponse {
  return {
    success: false,
    error: 'Validation failed',
    details: error.errors.map(e => ({
      path: e.path.join('.'),
      message: e.message,
      code: e.code
    }))
  };
}

/**
 * Validate request body against Zod schema
 * Replaces req.body with validated (and transformed) data
 *
 * @example
 * router.post('/questions',
 *   validateBody(CreateQuestionInput),
 *   async (req, res) => {
 *     // req.body is now typed and validated
 *   }
 * );
 */
export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse will throw if invalid
      const validated = schema.parse(req.body);

      // Replace body with validated (and potentially transformed) data
      req.body = validated;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json(formatZodError(error));
      }
      next(error);
    }
  };
}

/**
 * Validate query parameters against Zod schema
 *
 * @example
 * router.get('/questions',
 *   validateQuery(z.object({ limit: z.coerce.number().default(50) })),
 *   async (req, res) => {
 *     // req.query.limit is now a number
 *   }
 * );
 */
export function validateQuery<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          ...formatZodError(error),
          error: 'Invalid query parameters'
        });
      }
      next(error);
    }
  };
}

/**
 * Validate route parameters against Zod schema
 *
 * @example
 * router.get('/questions/:id',
 *   validateParams(z.object({ id: z.string().min(1) })),
 *   async (req, res) => {
 *     // req.params.id is validated
 *   }
 * );
 */
export function validateParams<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.params);
      req.params = validated as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          ...formatZodError(error),
          error: 'Invalid route parameters'
        });
      }
      next(error);
    }
  };
}

/**
 * Combined validation for body, query, and params
 *
 * @example
 * router.put('/questions/:id',
 *   validate({
 *     params: z.object({ id: z.string() }),
 *     body: UpdateQuestionInput,
 *     query: z.object({ notify: z.coerce.boolean().optional() })
 *   }),
 *   async (req, res) => { ... }
 * );
 */
export function validate<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown
>(schemas: {
  body?: ZodSchema<TBody>;
  query?: ZodSchema<TQuery>;
  params?: ZodSchema<TParams>;
}): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: Array<{ location: string; details: ValidationErrorResponse['details'] }> = [];

    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as any;
      }
    } catch (error) {
      if (error instanceof ZodError) {
        errors.push({ location: 'params', details: formatZodError(error).details });
      }
    }

    try {
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as any;
      }
    } catch (error) {
      if (error instanceof ZodError) {
        errors.push({ location: 'query', details: formatZodError(error).details });
      }
    }

    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        errors.push({ location: 'body', details: formatZodError(error).details });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        validationErrors: errors.map(e => ({
          location: e.location,
          issues: e.details
        }))
      });
    }

    next();
  };
}

/**
 * Validate and send response
 * Catches bugs where we send malformed responses
 *
 * @example
 * const response = QuestionResponse.parse(data);
 * res.json({ success: true, data: response });
 *
 * // Or use helper:
 * sendValidated(res, QuestionResponse, data);
 */
export function sendValidated<T>(
  res: Response,
  schema: ZodSchema<T>,
  data: unknown
): void {
  try {
    const validated = schema.parse(data);
    res.json({ success: true, data: validated });
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('Response validation failed:', error.errors);

      // In development, show the validation error
      if (process.env.NODE_ENV === 'development') {
        res.status(500).json({
          success: false,
          error: 'Internal error: Response validation failed',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
          }))
        });
      } else {
        // In production, send generic error
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    } else {
      throw error;
    }
  }
}

/**
 * Common query parameter schemas for reuse
 */
export const CommonQuerySchemas = {
  pagination: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0)
  }),

  projectId: z.object({
    projectId: z.string().min(1).max(50)
  }),

  id: z.object({
    id: z.string().min(1).max(50)
  })
};

/**
 * Type helper to extract validated type from middleware
 */
export type ValidatedBody<T extends ZodSchema> = z.infer<T>;
export type ValidatedQuery<T extends ZodSchema> = z.infer<T>;
export type ValidatedParams<T extends ZodSchema> = z.infer<T>;
