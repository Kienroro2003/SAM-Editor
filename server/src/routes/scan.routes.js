import { Router } from "express";
import { z } from "zod";

import { validate } from "../middleware/validate.middleware.js";
import { uploadLcovReport, uploadSourceArchive } from "../middleware/upload.middleware.js";

const emptyObjectSchema = z.object({}).passthrough();

const ingestLcovSchema = z.object({
  body: z.object({
    projectId: z.string().uuid(),
    createdByUserId: z.string().uuid().optional(),
    riskThreshold: z.coerce.number().min(0).max(100).default(50)
  }),
  params: emptyObjectSchema,
  query: emptyObjectSchema
});

const sourceImportSchema = z.object({
  body: z.object({
    projectId: z.string().uuid(),
    createdByUserId: z.string().uuid().optional(),
    riskThreshold: z.coerce.number().min(0).max(100).default(50)
  }),
  params: emptyObjectSchema,
  query: emptyObjectSchema
});

const ingestExistingScanSchema = z.object({
  body: emptyObjectSchema,
  params: z.object({
    scanId: z.string().uuid()
  }),
  query: emptyObjectSchema
});

const scanIdParamsSchema = z.object({
  body: emptyObjectSchema,
  params: z.object({
    scanId: z.string().uuid()
  }),
  query: emptyObjectSchema
});

const riskModulesSchema = z.object({
  body: emptyObjectSchema,
  params: z.object({
    scanId: z.string().uuid()
  }),
  query: z.object({
    threshold: z.coerce.number().min(0).max(100).default(50),
    limit: z.coerce.number().int().min(1).max(500).default(100)
  })
});

const fileLineCoverageSchema = z.object({
  body: emptyObjectSchema,
  params: z.object({
    scanId: z.string().uuid(),
    scanFileId: z.coerce.number().int().positive()
  }),
  query: emptyObjectSchema
});

const importRequirementsSchema = z.object({
  body: z.object({
    requirements: z.array(
      z.object({
        requirementKey: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.coerce.number().int().min(1).max(5).default(3),
        metadata: z.record(z.string(), z.unknown()).optional(),
        mappings: z.array(
          z.object({
            filePath: z.string().min(1),
            startLine: z.coerce.number().int().positive(),
            endLine: z.coerce.number().int().positive()
          })
        )
      })
    )
  }),
  params: z.object({
    scanId: z.string().uuid()
  }),
  query: emptyObjectSchema
});

const importTestCasesSchema = z.object({
  body: z.object({
    testCases: z.array(
      z.object({
        testName: z.string().min(1),
        filePath: z.string().optional(),
        status: z.string().optional(),
        assertions: z.coerce.number().int().min(0).optional(),
        durationMs: z.coerce.number().int().min(0).optional(),
        metadata: z.record(z.string(), z.unknown()).optional()
      })
    ),
    qualityLimit: z.coerce.number().int().min(1).max(500).default(200)
  }),
  params: z.object({
    scanId: z.string().uuid()
  }),
  query: emptyObjectSchema
});

const testCaseQualitySchema = z.object({
  body: emptyObjectSchema,
  params: z.object({
    scanId: z.string().uuid()
  }),
  query: z.object({
    limit: z.coerce.number().int().min(1).max(500).default(200)
  })
});

export function createScanRoutes(scanController, security) {
  const router = Router();

  const requireProjectMemberRole = security.requireProjectRole({
    minRole: "member",
    projectIdResolver: (req) => req.validated.body.projectId
  });

  const requireScanViewerRole = security.requireScanRole({
    minRole: "viewer",
    scanIdResolver: (req) => req.validated.params.scanId
  });

  const requireScanMemberRole = security.requireScanRole({
    minRole: "member",
    scanIdResolver: (req) => req.validated.params.scanId
  });

  router.post(
    "/source-import",
    security.requireAuth,
    uploadSourceArchive,
    validate(sourceImportSchema),
    requireProjectMemberRole,
    scanController.importSourceArchive
  );

  router.post(
    "/lcov",
    security.requireAuth,
    uploadLcovReport,
    validate(ingestLcovSchema),
    requireProjectMemberRole,
    scanController.ingestLcov
  );

  router.post(
    "/:scanId/lcov",
    security.requireAuth,
    uploadLcovReport,
    validate(ingestExistingScanSchema),
    requireScanMemberRole,
    scanController.ingestLcovForScan
  );

  router.post(
    "/:scanId/requirements/import",
    security.requireAuth,
    validate(importRequirementsSchema),
    requireScanMemberRole,
    scanController.importRequirements
  );

  router.get(
    "/:scanId/requirements/coverage",
    security.requireAuth,
    validate(scanIdParamsSchema),
    requireScanViewerRole,
    scanController.getRequirementCoverage
  );

  router.post(
    "/:scanId/test-cases/import",
    security.requireAuth,
    validate(importTestCasesSchema),
    requireScanMemberRole,
    scanController.importTestCases
  );

  router.get(
    "/:scanId/test-cases/quality",
    security.requireAuth,
    validate(testCaseQualitySchema),
    requireScanViewerRole,
    scanController.getTestCaseQuality
  );

  router.get(
    "/:scanId/overview",
    security.requireAuth,
    validate(scanIdParamsSchema),
    requireScanViewerRole,
    scanController.getOverview
  );

  router.get(
    "/:scanId/risk-modules",
    security.requireAuth,
    validate(riskModulesSchema),
    requireScanViewerRole,
    scanController.getRiskModules
  );

  router.get(
    "/:scanId/files/:scanFileId/line-coverage",
    security.requireAuth,
    validate(fileLineCoverageSchema),
    requireScanViewerRole,
    scanController.getFileLineCoverage
  );

  return router;
}
