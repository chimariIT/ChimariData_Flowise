import "dotenv/config";
import { readFile } from "node:fs/promises";
import { pool } from "../server/db";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL is not set. Please update your environment configuration.");
    process.exit(1);
  }

  if (!pool) {
    console.error("❌ Database pool is not available. Check server/db.ts configuration.");
    process.exit(1);
  }

  const migrationUrl = new URL("../migrations/009_create_project_states.sql", import.meta.url);

  try {
  const sql = await readFile(migrationUrl, "utf-8");
    console.log("🚀 Applying project_states migration...");
    await pool.query(sql);
    console.log("✅ project_states table ensured.");
  } catch (error) {
    console.error("❌ Migration execution failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
