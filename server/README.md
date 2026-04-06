# SAM Coverage Backend

Express + Neon backend for LCOV ingest, coverage analytics, AI recommendation, workspace operations, test execution, and git sync.

This backend now includes production-hardening features:

- JWT authentication and endpoint authorization
- Queue + retry + rate-limit for AI and test execution jobs
- Docker sandbox mode for test execution

## Implemented Components (vs architecture diagram)

- Source Import Storage: large source archive upload to Firebase Storage (or local fallback)
- IDE Workspace Manager: file tree/read/write APIs
- Coverage Metrics Calculator: LCOV parsing, metrics persistence, risk modules
- Requirement Coverage Engine: requirement-to-code mapping and true requirement coverage metrics
- Test Case Quality Analyzer: imports test cases and flags weak/fragile tests
- AI Integration Component: recommendation generation + cache persistence
- Dashboard Aggregator: combined payload (overview + risk + requirement + weak tests + AI)
- Test & Coverage Execution Engine: run test command API
- Version Control Sync: git status/commits/fetch sync API
- Database: PostgreSQL/Neon schema with scan + line + AI tables

## Security Model

- Authentication:
   - Bearer token (JWT HS256) via `Authorization: Bearer <token>`
- Authorization:
   - Project-scoped role checks (`viewer`, `member`, `owner`)
   - Admin-only endpoints for workspace/test execution/vcs operations
- Toggle strategy:
   - Use `AUTH_REQUIRED=true` and `AUTHZ_REQUIRED=true` for production
   - Defaults are relaxed for local development and tests

## Prerequisites

- Node.js 18+
- PostgreSQL/Neon connection string

## Quick Start

1. Install dependencies:
   - `npm install`
2. Configure environment:
   - Copy `.env.example` to `.env`
   - Set `DATABASE_URL`
3. Run migrations:
   - `npm run db:migrate`
4. Seed demo user/project:
   - `npm run db:seed`
5. Start dev server:
   - `npm run dev`

## Environment Variables

- `PORT`: API port (default `3000`)
- `DATABASE_URL`: Neon/PostgreSQL URL (required)
- `CORS_ORIGIN`: Frontend origin or comma-separated origins
- `MAX_UPLOAD_MB`: Max LCOV upload size in MB (default `5`)

Auth and authorization:

- `AUTH_REQUIRED`: Require JWT on protected routes
- `AUTHZ_REQUIRED`: Enforce role checks (`viewer/member/owner/admin`)
- `AUTH_JWT_SECRET`: JWT secret (must be changed in production)
- `AUTH_JWT_ISSUER`: Expected JWT issuer
- `AUTH_JWT_AUDIENCE`: Expected JWT audience

Workspace manager:

- `WORKSPACE_ROOT`: Absolute path of project workspace (defaults to parent of `server`)
- `WORKSPACE_MAX_READ_BYTES`: Max bytes for file read API
- `WORKSPACE_MAX_WRITE_BYTES`: Max bytes for file write API
- `WORKSPACE_MAX_TREE_DEPTH`: Max folder tree depth
- `WORKSPACE_MAX_TREE_ENTRIES`: Max total nodes per tree request

Source import storage:

- `SOURCE_STORAGE_PROVIDER`: `firebase` or `local`
- `SOURCE_IMPORT_MAX_UPLOAD_MB`: Max source archive upload size
- `SOURCE_STORAGE_ROOT`: Local storage root when provider=`local`
- `SOURCE_IMPORT_TEMP_DIR`: Temp dir for uploaded archives before transfer

Firebase storage:

- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_SIGNED_URL_EXPIRES_SEC`

Test execution engine:

- `DEFAULT_TEST_COMMAND`: Default command for test runner API
- `TEST_TIMEOUT_MS`: Command timeout in milliseconds
- `TEST_MAX_OUTPUT_BYTES`: Max collected stdout/stderr bytes
- `TEST_EXECUTION_MODE`: `local` or `docker`
- `TEST_ALLOW_CUSTOM_COMMANDS`: Allow overriding default command
- `TEST_ALLOWED_COMMANDS`: Comma-separated command allowlist

Docker sandbox:

- `TEST_DOCKER_IMAGE`: Container image used for execution
- `TEST_DOCKER_NETWORK`: Network mode (`none` recommended)
- `TEST_DOCKER_MEMORY_MB`: Memory cap
- `TEST_DOCKER_CPUS`: CPU cap
- `TEST_DOCKER_READONLY_WORKSPACE`: Mount workspace as read-only
- `TEST_DOCKER_READ_ONLY_ROOT`: Run container root filesystem as read-only
- `TEST_DOCKER_PIDS_LIMIT`: PID cap inside container
- `TEST_DOCKER_SANDBOX_TMPFS_MB`: Writable tmpfs size for sandbox copy
- `TEST_DOCKER_FALLBACK_TO_LOCAL`: Fallback to local mode when Docker launch fails

Jobs and queue controls:

- `JOB_SYNC_WAIT_TIMEOUT_MS`: Max wait for sync-style API call before returning `202`
- `JOB_RESULT_TTL_MS`: Retention for completed/failed jobs in memory
- `JOB_MAX_STORED`: Max retained jobs

AI job queue and API throttling:

- `AI_QUEUE_CONCURRENCY`
- `AI_QUEUE_MAX_ATTEMPTS`
- `AI_QUEUE_RETRY_BASE_MS`
- `AI_QUEUE_RATE_LIMIT_MAX`
- `AI_QUEUE_RATE_LIMIT_WINDOW_MS`
- `AI_HTTP_RATE_LIMIT_MAX`
- `AI_HTTP_RATE_LIMIT_WINDOW_MS`

Test execution queue and API throttling:

- `TEST_QUEUE_CONCURRENCY`
- `TEST_QUEUE_MAX_ATTEMPTS`
- `TEST_QUEUE_RETRY_BASE_MS`
- `TEST_QUEUE_RATE_LIMIT_MAX`
- `TEST_QUEUE_RATE_LIMIT_WINDOW_MS`
- `TEST_HTTP_RATE_LIMIT_MAX`
- `TEST_HTTP_RATE_LIMIT_WINDOW_MS`

AI integration:

- `AI_PROVIDER`: `mock` or `openai`
- `OPENAI_API_KEY`: required when `AI_PROVIDER=openai`
- `OPENAI_MODEL`: OpenAI model name
- `AI_TIMEOUT_MS`: AI request timeout
- `AI_ALLOW_FALLBACK`: `true/false` fallback to rule-based recommendation on provider error
- `AI_ALLOW_EXTERNAL_REQUESTS_IN_TEST`: Allow real provider calls during tests

## Response Format

All endpoints return:

- Success:
  - `{ "success": true, "message": "...", "data": { ... } }`
- Error:
  - `{ "success": false, "message": "...", "details": { ... } }`

## API Endpoints

### Health

- `GET /api/health`

### Scan Ingest + Coverage APIs

- `POST /api/scans/source-import`
- `multipart/form-data` fields:
   - `projectId` (UUID)
   - `createdByUserId` (UUID, optional when auth is enabled)
   - `riskThreshold` (optional, 0-100)
   - `sourceArchive` (file: `.zip`, `.tar`, `.tar.gz`, `.tgz`)

Creates scan with `input_type=source_import`, uploads source archive to configured storage provider, and stores artifact metadata.

- `POST /api/scans/lcov`
- `multipart/form-data` fields:
  - `projectId` (UUID)
   - `createdByUserId` (UUID, optional when auth is enabled)
  - `riskThreshold` (optional, 0-100)
  - `lcovReport` (file: `.info`, `.lcov`, `.txt`)

Returns `scanId` and immediate summary.

- `POST /api/scans/:scanId/lcov`
- Ingest LCOV report into an existing source-import scan.

- `GET /api/scans/:scanId/overview`
- `GET /api/scans/:scanId/risk-modules?threshold=50&limit=100`
- `GET /api/scans/:scanId/files/:scanFileId/line-coverage`

Requirement coverage:

- `POST /api/scans/:scanId/requirements/import`
   - JSON body:
      - `requirements`: array of requirement objects
         - `requirementKey`
         - `title`
         - `description` (optional)
         - `priority` (1-5, optional)
         - `metadata` (optional object)
         - `mappings`: array of `{ filePath, startLine, endLine }`
- `GET /api/scans/:scanId/requirements/coverage`

Test case quality:

- `POST /api/scans/:scanId/test-cases/import`
   - JSON body:
      - `testCases`: array of `{ testName, filePath?, status?, assertions?, durationMs?, metadata? }`
      - `qualityLimit` (optional)
- `GET /api/scans/:scanId/test-cases/quality?limit=200`

### Dashboard Aggregator

- `GET /api/dashboard/:scanId?threshold=50&riskLimit=100&recommendationLimit=20&weakLimit=100&includeInsights=true`
- Returns:
   - coverage overview percentages
   - risk modules
   - requirement coverage summary
   - weak test case summary
   - AI recommendations
   - AI scan insights (untested modules, weak tests, missing edge cases, recommended additional tests)

### AI Integration Component

- `POST /api/ai/recommendations`
   - JSON body:
      - `scanId` UUID
      - `scanFileId` number
      - `lineNumber` number
      - `triggeredByUserId` UUID (optional)
      - `forceRefresh` boolean (optional)
      - `windowSize` number (optional, default `3`)
   - `async` boolean (optional, default `false`)
   - `waitTimeoutMs` number (optional)
   - `maxAttempts` number (optional, overrides queue default)
- `GET /api/ai/recommendations?scanFileId=<id>&lineNumber=<n>`
- `GET /api/ai/scans/:scanId/stats`
- `GET /api/ai/scans/:scanId/insights?threshold=50&riskLimit=100&weakLimit=100&maxItems=20`

### IDE Workspace Manager

- `GET /api/workspace/tree?path=.&depth=3`
- `GET /api/workspace/file?path=src/main.js`
- `PUT /api/workspace/file`
   - JSON body:
      - `path` string
      - `content` string

### Test & Coverage Execution Engine

- `POST /api/test-execution/run`
   - JSON body:
      - `projectPath` string (optional)
      - `command` string (optional)
      - `timeoutMs` number (optional)
   - `async` boolean (optional, default `false`)
   - `waitTimeoutMs` number (optional)
   - `maxAttempts` number (optional, overrides queue default)
- `GET /api/test-execution/config`

### Version Control Sync

- `GET /api/vcs/status?repoPath=.`
- `GET /api/vcs/commits?repoPath=.&limit=20`
- `POST /api/vcs/sync`
   - JSON body:
      - `repoPath` string (optional)
      - `remote` string (optional, default `origin`)
      - `branch` string (optional)
      - `performPull` boolean (optional, default `false`)

### Jobs API (queue visibility)

- `GET /api/jobs?queue=all|ai|test&status=queued|processing|completed|failed&limit=50`
- `GET /api/jobs/:jobId`

## Testing

- Run all tests:
  - `npm test`

Test coverage includes:

- Unit tests for LCOV parser
- Integration tests for ingest/overview/risk/line coverage APIs
- Integration tests for AI recommendation + dashboard aggregation APIs
- Integration tests for source-import workflow
- Integration tests for requirement coverage + test quality + AI insights workflow
- Integration tests for auth/authorization
- Integration tests for async jobs API
- Error tests for invalid and malformed LCOV input

## Security Notes

- Never commit real credentials to `.env.example`.
- Rotate API keys immediately if they were accidentally exposed.
- For production, set:
   - `AUTH_REQUIRED=true`
   - `AUTHZ_REQUIRED=true`
   - strong `AUTH_JWT_SECRET`
   - `TEST_EXECUTION_MODE=docker`
   - restricted `TEST_ALLOWED_COMMANDS`

## Suggested Frontend Flow

1. Upload source archive via `POST /api/scans/source-import` (Firebase-backed artifact)
2. Use returned `scanId` and ingest LCOV to `POST /api/scans/:scanId/lcov`
3. Import requirement mappings via `POST /api/scans/:scanId/requirements/import`
4. Import test cases via `POST /api/scans/:scanId/test-cases/import`
5. Call:
   - `GET /api/scans/:scanId/overview`
   - `GET /api/scans/:scanId/risk-modules`
   - `GET /api/scans/:scanId/requirements/coverage`
   - `GET /api/scans/:scanId/test-cases/quality`
   - `GET /api/ai/scans/:scanId/insights`
   - `GET /api/dashboard/:scanId`
6. On file selection, call:
   - `GET /api/scans/:scanId/files/:scanFileId/line-coverage`
7. On line click, call:
   - `POST /api/ai/recommendations`
8. Optional IDE action APIs:
   - workspace (`/api/workspace/*`)
   - test execution (`/api/test-execution/*`)
   - vcs sync (`/api/vcs/*`)
