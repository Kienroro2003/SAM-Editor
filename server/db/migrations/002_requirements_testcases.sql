ALTER TABLE scans DROP CONSTRAINT IF EXISTS scans_input_type_check;
ALTER TABLE scans
ADD CONSTRAINT scans_input_type_check
CHECK (input_type IN ('lcov_upload', 'source_import'));

CREATE TABLE IF NOT EXISTS project_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requirement_key VARCHAR(120) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority SMALLINT NOT NULL DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, requirement_key)
);

CREATE TABLE IF NOT EXISTS requirement_code_mappings (
  id BIGSERIAL PRIMARY KEY,
  requirement_id UUID NOT NULL REFERENCES project_requirements(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  start_line INT NOT NULL CHECK (start_line > 0),
  end_line INT NOT NULL CHECK (end_line >= start_line),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scan_requirement_coverage (
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES project_requirements(id) ON DELETE CASCADE,
  mapped_lines INT NOT NULL DEFAULT 0 CHECK (mapped_lines >= 0),
  covered_lines INT NOT NULL DEFAULT 0 CHECK (covered_lines >= 0),
  pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (pct >= 0 AND pct <= 100),
  status VARCHAR(20) NOT NULL CHECK (status IN ('covered', 'partial', 'uncovered', 'not_mapped')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scan_id, requirement_id)
);

CREATE TABLE IF NOT EXISTS scan_test_cases (
  id BIGSERIAL PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  test_name TEXT NOT NULL,
  file_path TEXT,
  status VARCHAR(20) NOT NULL CHECK (status IN ('passed', 'failed', 'skipped', 'unknown')),
  assertions INT NOT NULL DEFAULT 0 CHECK (assertions >= 0),
  duration_ms INT CHECK (duration_ms >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requirements_project
  ON project_requirements(project_id, requirement_key);

CREATE INDEX IF NOT EXISTS idx_req_map_requirement
  ON requirement_code_mappings(requirement_id);

CREATE INDEX IF NOT EXISTS idx_req_map_file_path
  ON requirement_code_mappings(file_path);

CREATE INDEX IF NOT EXISTS idx_scan_req_cov_scan
  ON scan_requirement_coverage(scan_id, status);

CREATE INDEX IF NOT EXISTS idx_scan_test_cases_scan
  ON scan_test_cases(scan_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_test_cases_unique
  ON scan_test_cases(scan_id, test_name, COALESCE(file_path, ''));

DROP TRIGGER IF EXISTS trg_project_requirements_set_updated_at ON project_requirements;
CREATE TRIGGER trg_project_requirements_set_updated_at
BEFORE UPDATE ON project_requirements
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
