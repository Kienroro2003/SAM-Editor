import { Pool } from "pg";

import { env } from "./env.js";

let poolInstance = null;

function shouldUseSsl(connectionString) {
  return !connectionString.includes("localhost") && !connectionString.includes("127.0.0.1");
}

export function createDbPool(connectionString = env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required. Add it in server/.env (see server/.env.example)."
    );
  }

  const useSsl = shouldUseSsl(connectionString);

  return new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false
  });
}

export function getDbPool() {
  if (!poolInstance) {
    poolInstance = createDbPool();
  }

  return poolInstance;
}

export async function closeDbPool() {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}
