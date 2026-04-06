import { Router } from "express";
import { z } from "zod";

import { validate } from "../middleware/validate.middleware.js";

const emptyObjectSchema = z.object({}).passthrough();

const generateRecommendationSchema = z.object({
  body: z.object({
    scanId: z.string().uuid(),
    scanFileId: z.coerce.number().int().positive(),
    lineNumber: z.coerce.number().int().positive(),
    triggeredByUserId: z.string().uuid().optional(),
    forceRefresh: z.coerce.boolean().default(false),
    windowSize: z.coerce.number().int().min(1).max(20).default(3),
    async: z.coerce.boolean().default(false),
    waitTimeoutMs: z.coerce.number().int().min(1000).max(120000).default(30000),
    maxAttempts: z.coerce.number().int().min(1).max(10).optional()
  }),
  params: emptyObjectSchema,
  query: emptyObjectSchema
});

const getRecommendationSchema = z.object({
  body: emptyObjectSchema,
  params: emptyObjectSchema,
  query: z.object({
    scanFileId: z.coerce.number().int().positive(),
    lineNumber: z.coerce.number().int().positive()
  })
});

const scanStatsSchema = z.object({
  body: emptyObjectSchema,
  params: z.object({
    scanId: z.string().uuid()
  }),
  query: emptyObjectSchema
});

const scanInsightsSchema = z.object({
  body: emptyObjectSchema,
  params: z.object({
    scanId: z.string().uuid()
  }),
  query: z.object({
    threshold: z.coerce.number().min(0).max(100).default(50),
    riskLimit: z.coerce.number().int().min(1).max(500).default(100),
    weakLimit: z.coerce.number().int().min(1).max(500).default(100),
    maxItems: z.coerce.number().int().min(1).max(200).default(20)
  })
});

export function createAiRoutes(aiController, security) {
  const router = Router();

  const requireScanViewerRole = security.requireScanRole({
    minRole: "viewer",
    scanIdResolver: (req) => req.validated.params.scanId
  });

  const requireScanMemberRole = security.requireScanRole({
    minRole: "member",
    scanIdResolver: (req) => req.validated.body.scanId
  });

  const requireScanFileViewerRole = security.requireScanFileRole({
    minRole: "viewer",
    scanFileIdResolver: (req) => req.validated.query.scanFileId
  });

  router.post(
    "/recommendations",
    security.requireAuth,
    security.aiSubmitRateLimit,
    validate(generateRecommendationSchema),
    requireScanMemberRole,
    aiController.generateRecommendation
  );

  router.get(
    "/recommendations",
    security.requireAuth,
    validate(getRecommendationSchema),
    requireScanFileViewerRole,
    aiController.getRecommendation
  );

  router.get(
    "/scans/:scanId/stats",
    security.requireAuth,
    validate(scanStatsSchema),
    requireScanViewerRole,
    aiController.getScanStats
  );

  router.get(
    "/scans/:scanId/insights",
    security.requireAuth,
    validate(scanInsightsSchema),
    requireScanViewerRole,
    aiController.getScanInsights
  );

  return router;
}
