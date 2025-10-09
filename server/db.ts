import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// Handle missing DATABASE_URL gracefully for development
let pool: Pool | null = null;
let db: any = null;

if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
      // Optimize connection pool for better performance
      max: 20, // maximum number of connections in the pool
      min: 2,  // minimum number of connections in the pool
      idleTimeoutMillis: 30000, // close idle connections after 30 seconds
      connectionTimeoutMillis: 10000, // timeout connection attempts after 10 seconds
      maxUses: 7500, // close connections after 7500 uses
      allowExitOnIdle: true // allow the pool to exit when all connections are idle
    });
    db = drizzle(pool, { schema });
    console.log('✅ Database connection established with optimized pool settings');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    pool = null;
    db = null;
  }
} else {
  console.log('⚠️  DATABASE_URL not set, running in development mode without database');
}

export { pool, db };
