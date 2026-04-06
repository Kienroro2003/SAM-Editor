CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  default_risk_threshold NUMERIC(5,2) NOT NULL DEFAULT 50.00
    CHECK (default_risk_threshold >= 0 AND default_risk_threshold <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id, name)
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL CHECK (status IN ('uploading', 'processing', 'ready', 'failed')),
  input_type VARCHAR(20) NOT NULL DEFAULT 'lcov_upload' CHECK (input_type IN ('lcov_upload')),
  risk_threshold NUMERIC(5,2) NOT NULL DEFAULT 50.00
    CHECK (risk_threshold >= 0 AND risk_threshold <= 100),

  lines_found INT NOT NULL DEFAULT 0 CHECK (lines_found >= 0),
  lines_hit INT NOT NULL DEFAULT 0 CHECK (lines_hit >= 0),
  branches_found INT NOT NULL DEFAULT 0 CHECK (branches_found >= 0),
  branches_hit INT NOT NULL DEFAULT 0 CHECK (branches_hit >= 0),
  functions_found INT NOT NULL DEFAULT 0 CHECK (functions_found >= 0),
  functions_hit INT NOT NULL DEFAULT 0 CHECK (functions_hit >= 0),
  statements_found INT NOT NULL DEFAULT 0 CHECK (statements_found >= 0),
  statements_hit INT NOT NULL DEFAULT 0 CHECK (statements_hit >= 0),
  requirements_found INT NOT NULL DEFAULT 0 CHECK (requirements_found >= 0),
  requirements_hit INT NOT NULL DEFAULT 0 CHECK (requirements_hit >= 0),

  line_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (line_pct >= 0 AND line_pct <= 100),
  branch_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (branch_pct >= 0 AND branch_pct <= 100),
  function_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (function_pct >= 0 AND function_pct <= 100),
  statement_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (statement_pct >= 0 AND statement_pct <= 100),
  requirement_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (requirement_pct >= 0 AND requirement_pct <= 100),

  total_files INT NOT NULL DEFAULT 0 CHECK (total_files >= 0),
  total_uncovered_lines INT NOT NULL DEFAULT 0 CHECK (total_uncovered_lines >= 0),

  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS scan_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  artifact_type VARCHAR(20) NOT NULL CHECK (artifact_type IN ('source_zip', 'lcov_report')),
  storage_provider VARCHAR(20) NOT NULL DEFAULT 'firebase' CHECK (storage_provider IN ('firebase', 'local', 's3')),
  bucket_name TEXT NOT NULL,
  object_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  sha256 CHAR(64),
  status VARCHAR(20) NOT NULL CHECK (status IN ('uploaded', 'available', 'failed', 'deleted')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scan_id, artifact_type)
);

CREATE TABLE IF NOT EXISTS scan_files (
  id BIGSERIAL PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  language VARCHAR(30),
  source_code TEXT NOT NULL,
  source_truncated BOOLEAN NOT NULL DEFAULT FALSE,

  lines_found INT NOT NULL DEFAULT 0 CHECK (lines_found >= 0),
  lines_hit INT NOT NULL DEFAULT 0 CHECK (lines_hit >= 0),
  branches_found INT NOT NULL DEFAULT 0 CHECK (branches_found >= 0),
  branches_hit INT NOT NULL DEFAULT 0 CHECK (branches_hit >= 0),
  functions_found INT NOT NULL DEFAULT 0 CHECK (functions_found >= 0),
  functions_hit INT NOT NULL DEFAULT 0 CHECK (functions_hit >= 0),
  statements_found INT NOT NULL DEFAULT 0 CHECK (statements_found >= 0),
  statements_hit INT NOT NULL DEFAULT 0 CHECK (statements_hit >= 0),
  requirements_found INT NOT NULL DEFAULT 0 CHECK (requirements_found >= 0),
  requirements_hit INT NOT NULL DEFAULT 0 CHECK (requirements_hit >= 0),

  line_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (line_pct >= 0 AND line_pct <= 100),
  branch_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (branch_pct >= 0 AND branch_pct <= 100),
  function_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (function_pct >= 0 AND function_pct <= 100),
  statement_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (statement_pct >= 0 AND statement_pct <= 100),
  requirement_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (requirement_pct >= 0 AND requirement_pct <= 100),

  uncovered_lines_count INT NOT NULL DEFAULT 0 CHECK (uncovered_lines_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (scan_id, file_path)
);

CREATE TABLE IF NOT EXISTS file_line_coverage (
  scan_file_id BIGINT NOT NULL REFERENCES scan_files(id) ON DELETE CASCADE,
  line_number INT NOT NULL CHECK (line_number > 0),
  hits INT NOT NULL DEFAULT 0 CHECK (hits >= 0),
  status VARCHAR(12) NOT NULL CHECK (status IN ('covered', 'uncovered', 'neutral')),
  source_line TEXT,
  PRIMARY KEY (scan_file_id, line_number)
);

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id BIGSERIAL PRIMARY KEY,
  scan_file_id BIGINT NOT NULL REFERENCES scan_files(id) ON DELETE CASCADE,
  line_number INT NOT NULL CHECK (line_number > 0),
  triggered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
  reason TEXT,
  suggested_test_code TEXT,
  edge_cases JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_provider VARCHAR(30),
  model_name VARCHAR(80),
  prompt_version VARCHAR(20),
  response_ms INT CHECK (response_ms >= 0),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scan_file_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_projects_owner_updated
  ON projects(owner_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_members_user_project
  ON project_members(user_id, project_id);

CREATE INDEX IF NOT EXISTS idx_scans_project_created
  ON scans(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scans_status
  ON scans(status);

CREATE INDEX IF NOT EXISTS idx_scan_artifacts_scan
  ON scan_artifacts(scan_id);

CREATE INDEX IF NOT EXISTS idx_scan_files_scan_line_pct
  ON scan_files(scan_id, line_pct ASC);

CREATE INDEX IF NOT EXISTS idx_scan_files_scan_file_path
  ON scan_files(scan_id, file_path);

CREATE INDEX IF NOT EXISTS idx_line_cov_uncovered
  ON file_line_coverage(scan_file_id, line_number)
  WHERE status = 'uncovered';

CREATE INDEX IF NOT EXISTS idx_ai_scan_file_line
  ON ai_recommendations(scan_file_id, line_number);

CREATE INDEX IF NOT EXISTS idx_ai_status
  ON ai_recommendations(status);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;
CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_projects_set_updated_at ON projects;
CREATE TRIGGER trg_projects_set_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_ai_recommendations_set_updated_at ON ai_recommendations;
CREATE TRIGGER trg_ai_recommendations_set_updated_at
BEFORE UPDATE ON ai_recommendations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
