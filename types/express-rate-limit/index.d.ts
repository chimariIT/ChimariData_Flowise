declare module 'express-rate-limit' {
  import type { RequestHandler } from 'express';

  export interface RateLimitRequestHandler extends RequestHandler {
    resetKey: (key: string) => void;
  }

  export interface RateLimitOptions {
    windowMs?: number;
    max?: number | ((req: import('express').Request, res: import('express').Response) => number | Promise<number>);
    message?: string | Record<string, unknown>;
    statusCode?: number;
    headers?: boolean;
    standardHeaders?: boolean;
    legacyHeaders?: boolean;
    keyGenerator?: (req: import('express').Request) => string;
    skip?: (req: import('express').Request, res: import('express').Response) => boolean | Promise<boolean>;
    handler?: (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction, optionsUsed: RateLimitOptions) => void;
    onLimitReached?: (req: import('express').Request, res: import('express').Response, optionsUsed: RateLimitOptions) => void;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
    requestPropertyName?: string;
  }

  export function ipKeyGenerator(ip: string, ipv6Subnet?: number | false): string;

  export default function rateLimit(options?: RateLimitOptions): RateLimitRequestHandler;
}
