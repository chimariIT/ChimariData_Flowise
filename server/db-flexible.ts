import * as schema from "@shared/schema";
import { sql } from 'drizzle-orm';
import { resolveDatabaseSslConfig } from './utils/database-ssl';

// We intentionally keep the database type broad because the connection can be
// backed by either the PostgreSQL or SQLite driver at runtime.
type DrizzleDatabase = any;

let cachedDb: DrizzleDatabase | null = null;
let initializationPromise: Promise<DrizzleDatabase | null> | null = null;

const buildPostgresConfig = (dbUrl: string) => ({
  connectionString: dbUrl,
  ssl: resolveDatabaseSslConfig(dbUrl),
  ...(process.env.NODE_ENV === 'production'
    ? {
        min: 5,
        max: 30,
        idleTimeoutMillis: 60000,
        connectionTimeoutMillis: 15000,
        maxUses: 10000,
        allowExitOnIdle: false,
        statement_timeout: 30000,
        query_timeout: 30000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000
      }
    : process.env.NODE_ENV === 'test'
    ? {
        min: 1,
        max: 5,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 5000,
        maxUses: 1000,
        allowExitOnIdle: true
      }
    : {
        min: 2,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        maxUses: 7500,
        allowExitOnIdle: true,
        application_name: 'chimaridata_agents',
        statement_timeout: 30000,
        idle_in_transaction_session_timeout: 60000
      })
});

async function initializeDatabase(): Promise<DrizzleDatabase | null> {
  if (cachedDb) {
    return cachedDb;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  if (!process.env.DATABASE_URL) {
    console.warn('⚠️  DATABASE_URL not set, running in development mode without database');
    initializationPromise = Promise.resolve(null);
    return initializationPromise;
  }

  const dbUrl = process.env.DATABASE_URL;

  initializationPromise = (async () => {
    if (dbUrl.startsWith('file:')) {
      const [{ drizzle }, { default: Database }] = await Promise.all([
        import('drizzle-orm/better-sqlite3'),
        import('better-sqlite3')
      ]);

      const sqlite = new Database(dbUrl.replace('file:', ''));
      cachedDb = drizzle(sqlite, { schema });

      console.log('✅ SQLite database connection established');
      return cachedDb;
    }

    const [{ Pool }, { drizzle }] = await Promise.all([
      import('pg'),
      import('drizzle-orm/node-postgres')
    ]);

    const poolConfig = buildPostgresConfig(dbUrl);
    const pool = new Pool(poolConfig);
    cachedDb = drizzle(pool, { schema });

    try {
      await cachedDb.execute(sql`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS subscription_balances jsonb NOT NULL DEFAULT '{}'::jsonb
      `);
    } catch (error) {
      console.error('⚠️  Unable to ensure subscription_balances column exists during DB init:', error);
    }

    console.log(
      `✅ PostgreSQL database connection established with optimized pool settings for ${
        process.env.NODE_ENV || 'development'
      }`
    );
    console.log(
      `📊 Pool config: min=${poolConfig.min}, max=${poolConfig.max}, idle_timeout=${poolConfig.idleTimeoutMillis}ms`
    );

    return cachedDb;
  })();

  const result = await initializationPromise;
  cachedDb = result;
  return result;
}

export const getFlexibleDatabase = async () => {
  const database = await initializeDatabase();
  if (!database) {
    throw new Error('Database connection unavailable. Ensure DATABASE_URL is configured.');
  }
  return database;
};

export const getFlexibleDatabaseIfAvailable = async () => {
  return initializeDatabase();
};

export type FlexibleDatabase = Awaited<ReturnType<typeof getFlexibleDatabase>>;

