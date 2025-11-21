import type { PoolConfig } from 'pg';

const SSL_REQUIRE_MODES = new Set(['require', 'verify-ca', 'verify-full', 'prefer']);

/**
 * Derives a pg SSL configuration based on environment variables and the database URL.
 * Allows development to opt into TLS (e.g., when the server requires SSL) without
 * forcing certificate validation unless explicitly requested.
 */
export function resolveDatabaseSslConfig(connectionString?: string): PoolConfig['ssl'] {
  const envModeRaw = (process.env.DATABASE_SSL_MODE ?? process.env.PGSSLMODE ?? '').trim().toLowerCase();
  const urlModeMatch = connectionString?.match(/sslmode=([^&]+)/i);
  const urlMode = urlModeMatch ? urlModeMatch[1].toLowerCase() : '';
  const mode = envModeRaw || urlMode;

  if (mode === 'disable' || mode === 'off') {
    return undefined;
  }

  const requireFromFlag = process.env.DATABASE_REQUIRE_SSL === 'true';
  const shouldUseSsl =
    requireFromFlag ||
    SSL_REQUIRE_MODES.has(mode) ||
    (!mode && process.env.NODE_ENV === 'production');

  if (!shouldUseSsl) {
    return undefined;
  }

  const rejectUnauthorized =
    mode === 'verify-ca' ||
    mode === 'verify-full' ||
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true';

  return { rejectUnauthorized };
}
