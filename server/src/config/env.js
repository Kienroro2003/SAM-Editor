import path from "node:path";

import dotenv from "dotenv";

dotenv.config();

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function toStringList(value, fallback = []) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveWorkspaceRoot(value) {
  if (value && value.trim()) {
    return path.resolve(value.trim());
  }

  const cwd = process.cwd();
  if (path.basename(cwd).toLowerCase() === "server") {
    return path.resolve(cwd, "..");
  }

  return cwd;
}

function resolveStorageRoot(value, workspaceRoot) {
  if (value && value.trim()) {
    return path.resolve(value.trim());
  }

  return path.resolve(workspaceRoot, ".storage");
}

function resolveSourceImportTempDir(value, workspaceRoot) {
  if (value && value.trim()) {
    return path.resolve(value.trim());
  }

  return path.resolve(workspaceRoot, ".tmp-source-imports");
}

function assertPositiveNumber(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name} value in environment.`);
  }
}

const authRequired = toBoolean(process.env.AUTH_REQUIRED, false);
const authorizationRequired = toBoolean(process.env.AUTHZ_REQUIRED, authRequired);

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: toNumber(process.env.PORT, 3000),
  DATABASE_URL: process.env.DATABASE_URL || "",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
  MAX_UPLOAD_MB: toNumber(process.env.MAX_UPLOAD_MB, 5),

  AUTH_REQUIRED: authRequired,
  AUTHZ_REQUIRED: authorizationRequired,
  AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET || "sam-editor-dev-secret",
  AUTH_JWT_ISSUER: process.env.AUTH_JWT_ISSUER || "sam-editor-api",
  AUTH_JWT_AUDIENCE: process.env.AUTH_JWT_AUDIENCE || "sam-editor-client",

  WORKSPACE_ROOT: resolveWorkspaceRoot(process.env.WORKSPACE_ROOT),
  WORKSPACE_MAX_READ_BYTES: toNumber(
    process.env.WORKSPACE_MAX_READ_BYTES,
    256 * 1024
  ),
  WORKSPACE_MAX_WRITE_BYTES: toNumber(
    process.env.WORKSPACE_MAX_WRITE_BYTES,
    1024 * 1024
  ),
  WORKSPACE_MAX_TREE_DEPTH: toNumber(process.env.WORKSPACE_MAX_TREE_DEPTH, 6),
  WORKSPACE_MAX_TREE_ENTRIES: toNumber(process.env.WORKSPACE_MAX_TREE_ENTRIES, 5000),

  SOURCE_STORAGE_PROVIDER: process.env.SOURCE_STORAGE_PROVIDER || "firebase",
  SOURCE_IMPORT_MAX_UPLOAD_MB: toNumber(process.env.SOURCE_IMPORT_MAX_UPLOAD_MB, 512),
  SOURCE_STORAGE_ROOT: resolveStorageRoot(
    process.env.SOURCE_STORAGE_ROOT,
    resolveWorkspaceRoot(process.env.WORKSPACE_ROOT)
  ),
  SOURCE_IMPORT_TEMP_DIR: resolveSourceImportTempDir(
    process.env.SOURCE_IMPORT_TEMP_DIR,
    resolveWorkspaceRoot(process.env.WORKSPACE_ROOT)
  ),

  FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || "",
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "",
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || "",
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY || "",
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "",
  FIREBASE_SIGNED_URL_EXPIRES_SEC: toNumber(
    process.env.FIREBASE_SIGNED_URL_EXPIRES_SEC,
    3600
  ),

  DEFAULT_TEST_COMMAND: process.env.DEFAULT_TEST_COMMAND || "npm test",
  TEST_TIMEOUT_MS: toNumber(process.env.TEST_TIMEOUT_MS, 60000),
  TEST_MAX_OUTPUT_BYTES: toNumber(process.env.TEST_MAX_OUTPUT_BYTES, 65536),
  TEST_EXECUTION_MODE: process.env.TEST_EXECUTION_MODE || "local",
  TEST_ALLOW_CUSTOM_COMMANDS: toBoolean(process.env.TEST_ALLOW_CUSTOM_COMMANDS, false),
  TEST_ALLOWED_COMMANDS: toStringList(process.env.TEST_ALLOWED_COMMANDS, [
    "npm test",
    "npm run test",
    "npm run test:coverage",
    "pnpm test",
    "yarn test",
    "vitest run"
  ]),
  TEST_DOCKER_IMAGE: process.env.TEST_DOCKER_IMAGE || "node:20-alpine",
  TEST_DOCKER_NETWORK: process.env.TEST_DOCKER_NETWORK || "none",
  TEST_DOCKER_MEMORY_MB: toNumber(process.env.TEST_DOCKER_MEMORY_MB, 1024),
  TEST_DOCKER_CPUS: toNumber(process.env.TEST_DOCKER_CPUS, 1),
  TEST_DOCKER_READONLY_WORKSPACE: toBoolean(
    process.env.TEST_DOCKER_READONLY_WORKSPACE,
    true
  ),
  TEST_DOCKER_READ_ONLY_ROOT: toBoolean(process.env.TEST_DOCKER_READ_ONLY_ROOT, true),
  TEST_DOCKER_PIDS_LIMIT: toNumber(process.env.TEST_DOCKER_PIDS_LIMIT, 256),
  TEST_DOCKER_SANDBOX_TMPFS_MB: toNumber(
    process.env.TEST_DOCKER_SANDBOX_TMPFS_MB,
    512
  ),
  TEST_DOCKER_FALLBACK_TO_LOCAL: toBoolean(
    process.env.TEST_DOCKER_FALLBACK_TO_LOCAL,
    true
  ),

  JOB_SYNC_WAIT_TIMEOUT_MS: toNumber(process.env.JOB_SYNC_WAIT_TIMEOUT_MS, 30000),
  JOB_RESULT_TTL_MS: toNumber(process.env.JOB_RESULT_TTL_MS, 3600000),
  JOB_MAX_STORED: toNumber(process.env.JOB_MAX_STORED, 2000),

  AI_QUEUE_CONCURRENCY: toNumber(process.env.AI_QUEUE_CONCURRENCY, 1),
  AI_QUEUE_MAX_ATTEMPTS: toNumber(process.env.AI_QUEUE_MAX_ATTEMPTS, 3),
  AI_QUEUE_RETRY_BASE_MS: toNumber(process.env.AI_QUEUE_RETRY_BASE_MS, 500),
  AI_QUEUE_RATE_LIMIT_MAX: toNumber(process.env.AI_QUEUE_RATE_LIMIT_MAX, 30),
  AI_QUEUE_RATE_LIMIT_WINDOW_MS: toNumber(
    process.env.AI_QUEUE_RATE_LIMIT_WINDOW_MS,
    60000
  ),
  AI_HTTP_RATE_LIMIT_MAX: toNumber(process.env.AI_HTTP_RATE_LIMIT_MAX, 20),
  AI_HTTP_RATE_LIMIT_WINDOW_MS: toNumber(process.env.AI_HTTP_RATE_LIMIT_WINDOW_MS, 60000),

  TEST_QUEUE_CONCURRENCY: toNumber(process.env.TEST_QUEUE_CONCURRENCY, 1),
  TEST_QUEUE_MAX_ATTEMPTS: toNumber(process.env.TEST_QUEUE_MAX_ATTEMPTS, 2),
  TEST_QUEUE_RETRY_BASE_MS: toNumber(process.env.TEST_QUEUE_RETRY_BASE_MS, 1000),
  TEST_QUEUE_RATE_LIMIT_MAX: toNumber(process.env.TEST_QUEUE_RATE_LIMIT_MAX, 10),
  TEST_QUEUE_RATE_LIMIT_WINDOW_MS: toNumber(
    process.env.TEST_QUEUE_RATE_LIMIT_WINDOW_MS,
    60000
  ),
  TEST_HTTP_RATE_LIMIT_MAX: toNumber(process.env.TEST_HTTP_RATE_LIMIT_MAX, 10),
  TEST_HTTP_RATE_LIMIT_WINDOW_MS: toNumber(
    process.env.TEST_HTTP_RATE_LIMIT_WINDOW_MS,
    60000
  ),

  AI_PROVIDER: process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "mock"),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  AI_TIMEOUT_MS: toNumber(process.env.AI_TIMEOUT_MS, 12000),
  AI_ALLOW_FALLBACK: toBoolean(process.env.AI_ALLOW_FALLBACK, true),
  AI_ALLOW_EXTERNAL_REQUESTS_IN_TEST: toBoolean(
    process.env.AI_ALLOW_EXTERNAL_REQUESTS_IN_TEST,
    false
  )
};

assertPositiveNumber("PORT", env.PORT);
assertPositiveNumber("MAX_UPLOAD_MB", env.MAX_UPLOAD_MB);
assertPositiveNumber("WORKSPACE_MAX_READ_BYTES", env.WORKSPACE_MAX_READ_BYTES);
assertPositiveNumber("WORKSPACE_MAX_WRITE_BYTES", env.WORKSPACE_MAX_WRITE_BYTES);
assertPositiveNumber("WORKSPACE_MAX_TREE_DEPTH", env.WORKSPACE_MAX_TREE_DEPTH);
assertPositiveNumber("WORKSPACE_MAX_TREE_ENTRIES", env.WORKSPACE_MAX_TREE_ENTRIES);
assertPositiveNumber("SOURCE_IMPORT_MAX_UPLOAD_MB", env.SOURCE_IMPORT_MAX_UPLOAD_MB);
assertPositiveNumber("FIREBASE_SIGNED_URL_EXPIRES_SEC", env.FIREBASE_SIGNED_URL_EXPIRES_SEC);

assertPositiveNumber("TEST_TIMEOUT_MS", env.TEST_TIMEOUT_MS);
assertPositiveNumber("TEST_MAX_OUTPUT_BYTES", env.TEST_MAX_OUTPUT_BYTES);
assertPositiveNumber("TEST_DOCKER_MEMORY_MB", env.TEST_DOCKER_MEMORY_MB);
assertPositiveNumber("TEST_DOCKER_CPUS", env.TEST_DOCKER_CPUS);
assertPositiveNumber("TEST_DOCKER_PIDS_LIMIT", env.TEST_DOCKER_PIDS_LIMIT);
assertPositiveNumber("TEST_DOCKER_SANDBOX_TMPFS_MB", env.TEST_DOCKER_SANDBOX_TMPFS_MB);

assertPositiveNumber("JOB_SYNC_WAIT_TIMEOUT_MS", env.JOB_SYNC_WAIT_TIMEOUT_MS);
assertPositiveNumber("JOB_RESULT_TTL_MS", env.JOB_RESULT_TTL_MS);
assertPositiveNumber("JOB_MAX_STORED", env.JOB_MAX_STORED);

assertPositiveNumber("AI_QUEUE_CONCURRENCY", env.AI_QUEUE_CONCURRENCY);
assertPositiveNumber("AI_QUEUE_MAX_ATTEMPTS", env.AI_QUEUE_MAX_ATTEMPTS);
assertPositiveNumber("AI_QUEUE_RETRY_BASE_MS", env.AI_QUEUE_RETRY_BASE_MS);
assertPositiveNumber("AI_QUEUE_RATE_LIMIT_MAX", env.AI_QUEUE_RATE_LIMIT_MAX);
assertPositiveNumber("AI_QUEUE_RATE_LIMIT_WINDOW_MS", env.AI_QUEUE_RATE_LIMIT_WINDOW_MS);
assertPositiveNumber("AI_HTTP_RATE_LIMIT_MAX", env.AI_HTTP_RATE_LIMIT_MAX);
assertPositiveNumber("AI_HTTP_RATE_LIMIT_WINDOW_MS", env.AI_HTTP_RATE_LIMIT_WINDOW_MS);

assertPositiveNumber("TEST_QUEUE_CONCURRENCY", env.TEST_QUEUE_CONCURRENCY);
assertPositiveNumber("TEST_QUEUE_MAX_ATTEMPTS", env.TEST_QUEUE_MAX_ATTEMPTS);
assertPositiveNumber("TEST_QUEUE_RETRY_BASE_MS", env.TEST_QUEUE_RETRY_BASE_MS);
assertPositiveNumber("TEST_QUEUE_RATE_LIMIT_MAX", env.TEST_QUEUE_RATE_LIMIT_MAX);
assertPositiveNumber("TEST_QUEUE_RATE_LIMIT_WINDOW_MS", env.TEST_QUEUE_RATE_LIMIT_WINDOW_MS);
assertPositiveNumber("TEST_HTTP_RATE_LIMIT_MAX", env.TEST_HTTP_RATE_LIMIT_MAX);
assertPositiveNumber("TEST_HTTP_RATE_LIMIT_WINDOW_MS", env.TEST_HTTP_RATE_LIMIT_WINDOW_MS);

assertPositiveNumber("AI_TIMEOUT_MS", env.AI_TIMEOUT_MS);

if (!new Set(["local", "docker"]).has(env.TEST_EXECUTION_MODE)) {
  throw new Error("Invalid TEST_EXECUTION_MODE value in environment.");
}

if (!new Set(["firebase", "local"]).has(env.SOURCE_STORAGE_PROVIDER)) {
  throw new Error("Invalid SOURCE_STORAGE_PROVIDER value in environment.");
}

if (
  env.NODE_ENV === "production" &&
  env.AUTH_REQUIRED &&
  env.AUTH_JWT_SECRET === "sam-editor-dev-secret"
) {
  throw new Error("AUTH_JWT_SECRET must be changed in production.");
}
