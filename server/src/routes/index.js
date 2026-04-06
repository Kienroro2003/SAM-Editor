import { Router } from "express";

import { createHealthRoutes } from "./health.routes.js";
import { createScanRoutes } from "./scan.routes.js";
import { createDashboardRoutes } from "./dashboard.routes.js";
import { createAiRoutes } from "./ai.routes.js";
import { createWorkspaceRoutes } from "./workspace.routes.js";
import { createTestExecutionRoutes } from "./test-execution.routes.js";
import { createVcsRoutes } from "./vcs.routes.js";
import { createJobRoutes } from "./job.routes.js";

export function createApiRouter({
  healthController,
  scanController,
  dashboardController,
  aiController,
  workspaceController,
  testExecutionController,
  vcsController,
  jobController,
  security
}) {
  const router = Router();

  router.use("/health", createHealthRoutes(healthController));
  router.use("/scans", createScanRoutes(scanController, security));
  router.use("/dashboard", createDashboardRoutes(dashboardController, security));
  router.use("/ai", createAiRoutes(aiController, security));
  router.use("/workspace", createWorkspaceRoutes(workspaceController, security));
  router.use("/test-execution", createTestExecutionRoutes(testExecutionController, security));
  router.use("/vcs", createVcsRoutes(vcsController, security));
  router.use("/jobs", createJobRoutes(jobController, security));

  return router;
}
