import cors from "cors";
import express from "express";

import { env } from "./config/env.js";
import { getDbPool } from "./config/db.js";
import { createApiRouter } from "./routes/index.js";
import { createScanService } from "./services/scan.service.js";
import { createAiService } from "./services/ai.service.js";
import { createDashboardService } from "./services/dashboard.service.js";
import { createRequirementCoverageService } from "./services/requirement-coverage.service.js";
import { createTestCaseService } from "./services/test-case.service.js";
import { createAiInsightService } from "./services/ai-insight.service.js";
import { createWorkspaceService } from "./services/workspace.service.js";
import { createTestExecutionService } from "./services/test-execution.service.js";
import { createVcsService } from "./services/vcs.service.js";
import { createAuthService } from "./services/auth.service.js";
import { createAccessControlService } from "./services/access-control.service.js";
import { createJobOrchestratorService } from "./services/job-orchestrator.service.js";
import { createHealthController } from "./controllers/health.controller.js";
import { createScanController } from "./controllers/scan.controller.js";
import { createAiController } from "./controllers/ai.controller.js";
import { createDashboardController } from "./controllers/dashboard.controller.js";
import { createWorkspaceController } from "./controllers/workspace.controller.js";
import { createTestExecutionController } from "./controllers/test-execution.controller.js";
import { createVcsController } from "./controllers/vcs.controller.js";
import { createJobController } from "./controllers/job.controller.js";
import {
  createAuthenticateMiddleware,
  createRequireAuthMiddleware,
  createRequireAdminMiddleware
} from "./middleware/auth.middleware.js";
import {
  createRequireProjectRoleMiddleware,
  createRequireScanRoleMiddleware,
  createRequireScanFileRoleMiddleware
} from "./middleware/authorization.middleware.js";
import { createInMemoryRateLimiter } from "./middleware/rate-limit.middleware.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { notFoundMiddleware } from "./middleware/not-found.middleware.js";

function resolveCorsOrigin(originValue) {
  if (!originValue || originValue === "*") {
    return "*";
  }

  return originValue.split(",").map((item) => item.trim());
}

export function createApp(options = {}) {
  const app = express();
  const pool = options.pool || getDbPool();

  const authRequired = options.authRequired ?? env.AUTH_REQUIRED;
  const authorizationRequired = options.authorizationRequired ?? env.AUTHZ_REQUIRED;

  const authService = options.authService || createAuthService();
  const accessControlService =
    options.accessControlService || createAccessControlService(pool);

  const authenticate =
    options.authenticate ||
    createAuthenticateMiddleware({
      authService,
      authRequired: false
    });

  const requireAuth =
    options.requireAuth ||
    createRequireAuthMiddleware({
      authRequired
    });

  const requireAdmin =
    options.requireAdmin ||
    createRequireAdminMiddleware({
      authorizationRequired
    });

  const aiSubmitRateLimit =
    options.aiSubmitRateLimit ||
    createInMemoryRateLimiter({
      keyPrefix: "ai-submit",
      windowMs: env.AI_HTTP_RATE_LIMIT_WINDOW_MS,
      maxRequests: env.AI_HTTP_RATE_LIMIT_MAX
    });

  const testSubmitRateLimit =
    options.testSubmitRateLimit ||
    createInMemoryRateLimiter({
      keyPrefix: "test-submit",
      windowMs: env.TEST_HTTP_RATE_LIMIT_WINDOW_MS,
      maxRequests: env.TEST_HTTP_RATE_LIMIT_MAX
    });

  const security = {
    requireAuth,
    requireAdmin,
    aiSubmitRateLimit,
    testSubmitRateLimit,
    requireProjectRole: ({ minRole, projectIdResolver }) =>
      createRequireProjectRoleMiddleware({
        accessControlService,
        authorizationRequired,
        minRole,
        projectIdResolver
      }),
    requireScanRole: ({ minRole, scanIdResolver }) =>
      createRequireScanRoleMiddleware({
        accessControlService,
        authorizationRequired,
        minRole,
        scanIdResolver
      }),
    requireScanFileRole: ({ minRole, scanFileIdResolver }) =>
      createRequireScanFileRoleMiddleware({
        accessControlService,
        authorizationRequired,
        minRole,
        scanFileIdResolver
      })
  };

  const scanService =
    options.scanService ||
    createScanService(pool, {
      storageService: options.storageService
    });
  const requirementCoverageService =
    options.requirementCoverageService || createRequirementCoverageService(pool);
  const testCaseService = options.testCaseService || createTestCaseService(pool);
  const aiInsightService =
    options.aiInsightService ||
    createAiInsightService({
      scanService,
      testCaseService,
      requirementCoverageService
    });

  const dashboardService =
    options.dashboardService ||
    createDashboardService({
      scanService,
      pool,
      requirementCoverageService,
      testCaseService,
      aiInsightService
    });
  const aiService = options.aiService || createAiService(pool);
  const workspaceService = options.workspaceService || createWorkspaceService();
  const testExecutionService =
    options.testExecutionService || createTestExecutionService();
  const vcsService = options.vcsService || createVcsService();
  const jobOrchestratorService =
    options.jobOrchestratorService ||
    createJobOrchestratorService({
      aiService,
      testExecutionService
    });

  const healthController = options.healthController || createHealthController(scanService);
  const scanController =
    options.scanController ||
    createScanController(scanService, requirementCoverageService, testCaseService);
  const dashboardController =
    options.dashboardController || createDashboardController(dashboardService);
  const aiController =
    options.aiController ||
    createAiController(aiService, jobOrchestratorService, aiInsightService);
  const workspaceController =
    options.workspaceController || createWorkspaceController(workspaceService);
  const testExecutionController =
    options.testExecutionController ||
    createTestExecutionController(testExecutionService, jobOrchestratorService);
  const vcsController = options.vcsController || createVcsController(vcsService);
  const jobController =
    options.jobController || createJobController(jobOrchestratorService);

  app.use(
    cors({
      origin: resolveCorsOrigin(options.corsOrigin || env.CORS_ORIGIN)
    })
  );

  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req, res) => {
    res.json({
      success: true,
      message: "SAM Coverage API is running."
    });
  });

  app.use(
    "/api",
    authenticate,
    createApiRouter({
      healthController,
      scanController,
      dashboardController,
      aiController,
      workspaceController,
      testExecutionController,
      vcsController,
      jobController,
      security
    })
  );

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
