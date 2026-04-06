import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDbPool } from "../src/config/db.js";
import { env } from "../src/config/env.js";

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, "migrations");

const files = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.log("No migration files found.");
  process.exit(0);
}

const pool = createDbPool(env.DATABASE_URL);
const client = await pool.connect();

try {
  for (const file of files) {
    const sqlPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(sqlPath, "utf8");

    console.log(`Applying migration: ${file}`);
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
  }

  console.log("All migrations applied successfully.");
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Migration failed:", error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
