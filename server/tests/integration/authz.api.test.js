import { randomUUID } from "node:crypto";

import { DataType, newDb } from "pg-mem";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import { createAuthService } from "../../src/services/auth.service.js";

const schemaSql = `
CREATE TABLE users (
  id UUID PRIMARY KEY,
  firebase_uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  default_risk_threshold NUMERIC(5,2) NOT NULL DEFAULT 50.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id, name)
);

CREATE TABLE project_members (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE scans (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL,
  input_type VARCHAR(20) NOT NULL DEFAULT 'lcov_upload',
  risk_threshold NUMERIC(5,2) NOT NULL DEFAULT 50.00,
  lines_found INT NOT NULL DEFAULT 0,
  lines_hit INT NOT NULL DEFAULT 0,
  branches_found INT NOT NULL DEFAULT 0,
  branches_hit INT NOT NULL DEFAULT 0,
  functions_found INT NOT NULL DEFAULT 0,
  functions_hit INT NOT NULL DEFAULT 0,
  statements_found INT NOT NULL DEFAULT 0,
  statements_hit INT NOT NULL DEFAULT 0,
  requirements_found INT NOT NULL DEFAULT 0,
  requirements_hit INT NOT NULL DEFAULT 0,
  line_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  branch_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  function_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  statement_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  requirement_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_files INT NOT NULL DEFAULT 0,
  total_uncovered_lines INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE TABLE scan_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  artifact_type VARCHAR(20) NOT NULL,
  storage_provider VARCHAR(20) NOT NULL,
  bucket_name TEXT NOT NULL,
  object_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL,
  sha256 CHAR(64),
  status VARCHAR(20) NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scan_id, artifact_type)
);

CREATE TABLE scan_files (
  id BIGSERIAL PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  language VARCHAR(30),
  source_code TEXT NOT NULL,
  source_truncated BOOLEAN NOT NULL DEFAULT FALSE,
  lines_found INT NOT NULL DEFAULT 0,
  lines_hit INT NOT NULL DEFAULT 0,
  branches_found INT NOT NULL DEFAULT 0,
  branches_hit INT NOT NULL DEFAULT 0,
  functions_found INT NOT NULL DEFAULT 0,
  functions_hit INT NOT NULL DEFAULT 0,
  statements_found INT NOT NULL DEFAULT 0,
  statements_hit INT NOT NULL DEFAULT 0,
  requirements_found INT NOT NULL DEFAULT 0,
  requirements_hit INT NOT NULL DEFAULT 0,
  line_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  branch_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  function_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  statement_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  requirement_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  uncovered_lines_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scan_id, file_path)
);

CREATE TABLE file_line_coverage (
  scan_file_id BIGINT NOT NULL REFERENCES scan_files(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  hits INT NOT NULL DEFAULT 0,
  status VARCHAR(12) NOT NULL,
  source_line TEXT,
  PRIMARY KEY (scan_file_id, line_number)
);

CREATE TABLE project_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requirement_key VARCHAR(120) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority SMALLINT NOT NULL DEFAULT 3,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, requirement_key)
);

CREATE TABLE requirement_code_mappings (
  id BIGSERIAL PRIMARY KEY,
  requirement_id UUID NOT NULL REFERENCES project_requirements(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  start_line INT NOT NULL,
  end_line INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE scan_requirement_coverage (
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES project_requirements(id) ON DELETE CASCADE,
  mapped_lines INT NOT NULL DEFAULT 0,
  covered_lines INT NOT NULL DEFAULT 0,
  pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scan_id, requirement_id)
);

CREATE TABLE scan_test_cases (
  id BIGSERIAL PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  test_name TEXT NOT NULL,
  file_path TEXT,
  status VARCHAR(20) NOT NULL,
  assertions INT NOT NULL DEFAULT 0,
  duration_ms INT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_recommendations (
  id BIGSERIAL PRIMARY KEY,
  scan_file_id BIGINT NOT NULL REFERENCES scan_files(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  triggered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL,
  reason TEXT,
  suggested_test_code TEXT,
  edge_cases JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_provider VARCHAR(30),
  model_name VARCHAR(80),
  prompt_version VARCHAR(20),
  response_ms INT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scan_file_id, line_number)
);
`;

describe("Auth and authorization", () => {
  let pool;
  let app;
  let ownerId;
  let outsiderId;
  let projectId;
  let scanId;
  let authService;

  beforeEach(async () => {
    const db = newDb();
    db.public.registerFunction({
      name: "gen_random_uuid",
      returns: DataType.text,
      implementation: () => randomUUID()
    });

    const pgAdapter = db.adapters.createPg();
    pool = new pgAdapter.Pool();

    await pool.query(schemaSql);

    ownerId = randomUUID();
    outsiderId = randomUUID();
    projectId = randomUUID();
    scanId = randomUUID();

    await pool.query(
      `
      INSERT INTO users (id, firebase_uid, email, display_name)
      VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)
    `,
      [
        ownerId,
        "firebase-owner",
        "owner@example.com",
        "Owner User",
        outsiderId,
        "firebase-outsider",
        "outsider@example.com",
        "Outsider User"
      ]
    );

    await pool.query(
      `
      INSERT INTO projects (id, owner_user_id, name)
      VALUES ($1, $2, $3)
    `,
      [projectId, ownerId, "Auth Project"]
    );

    await pool.query(
      `
      INSERT INTO scans (id, project_id, created_by_user_id, status)
      VALUES ($1, $2, $3, 'ready')
    `,
      [scanId, projectId, ownerId]
    );

    authService = createAuthService({
      jwtSecret: "integration-test-secret",
      jwtIssuer: "sam-editor-api",
      jwtAudience: "sam-editor-client"
    });

    app = createApp({
      pool,
      corsOrigin: "*",
      authRequired: true,
      authorizationRequired: true,
      authService
    });
  });

  afterEach(async () => {
    await pool.end();
  });

  it("enforces auth and project access on scan overview endpoint", async () => {
    const noTokenResponse = await request(app).get(`/api/scans/${scanId}/overview`);
    expect(noTokenResponse.status).toBe(401);

    const outsiderToken = authService.createToken({
      userId: outsiderId,
      email: "outsider@example.com",
      roles: ["member"]
    });

    const outsiderResponse = await request(app)
      .get(`/api/scans/${scanId}/overview`)
      .set("Authorization", `Bearer ${outsiderToken}`);

    expect(outsiderResponse.status).toBe(403);

    const ownerToken = authService.createToken({
      userId: ownerId,
      email: "owner@example.com",
      roles: ["member"]
    });

    const ownerResponse = await request(app)
      .get(`/api/scans/${scanId}/overview`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.success).toBe(true);
  });
});
