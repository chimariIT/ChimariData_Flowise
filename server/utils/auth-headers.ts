import type { Request } from 'express';

/**
 * Normalize retrieval of bearer authorization header across proxies.
 * Handles array values and x-forwarded-authorization fallbacks commonly
 * injected by reverse proxies (e.g. Vite, Nginx, Cloudflare).
 */
export const getAuthHeader = (req: Request): string | undefined => {
  const rawHeader = req.headers.authorization ?? (req.headers as Record<string, unknown>)['x-forwarded-authorization'];

  if (Array.isArray(rawHeader)) {
    return typeof rawHeader[0] === 'string' ? rawHeader[0] : undefined;
  }

  return typeof rawHeader === 'string' ? rawHeader : undefined;
};
