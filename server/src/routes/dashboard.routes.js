import { Router } from "express";
import { z } from "zod";

import { validate } from "../middleware/validate.middleware.js";

const emptyObjectSchema = z.object({}).passthrough();

const dashboardSchema = z.object({
  body: emptyObjectSchema,
  params: z.object({
    scanId: z.string().uuid()
  }),
  query: z.object({
    threshold: z.coerce.number().min(0).max(100).default(50),
    riskLimit: z.coerce.number().int().min(1).max(500).default(100),
    recommendationLimit: z.coerce.number().int().min(1).max(200).default(20),
    weakLimit: z.coerce.number().int().min(1).max(500).default(100),
    includeInsights: z.coerce.boolean().default(true)
  })
});

export function createDashboardRoutes(dashboardController, security) {
  const router = Router();

  const requireScanViewerRole = security.requireScanRole({
    minRole: "viewer",
    scanIdResolver: (req) => req.validated.params.scanId
  });

  router.get(
    "/:scanId",
    security.requireAuth,
    validate(dashboardSchema),
    requireScanViewerRole,
    dashboardController.getDashboard
  );

  return router;
}
