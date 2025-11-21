import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../server/db";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL is not set. Please configure the connection string before running migrations.");
    process.exit(1);
  }

  if (!db || !pool) {
    console.error("❌ Database connection is not available. Ensure server/db.ts can establish a connection.");
    process.exit(1);
  }

  try {
    console.log("🚀 Running pending migrations...");
    await migrate(db, { migrationsFolder: "migrations" });
    console.log("✅ Migrations applied successfully.");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool?.end();
  }
}

main();
