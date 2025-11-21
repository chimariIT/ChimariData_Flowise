import { defineConfig } from "drizzle-kit";

// Use SQLite for development if PostgreSQL is not available
const databaseUrl = process.env.DATABASE_URL || "file:./dev.db";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: databaseUrl.startsWith("file:") ? "sqlite" : "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
