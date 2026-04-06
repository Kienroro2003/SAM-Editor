import { Router } from "express";
import { z } from "zod";

import { validate } from "../middleware/validate.middleware.js";

const emptyObjectSchema = z.object({}).passthrough();

const runTestsSchema = z.object({
  body: z.object({
    projectPath: z.string().default("."),
    command: z.string().min(1).optional(),
    timeoutMs: z.coerce.number().int().min(1000).max(600000).default(60000),
    async: z.coerce.boolean().default(false),
    waitTimeoutMs: z.coerce.number().int().min(1000).max(120000).default(30000),
    maxAttempts: z.coerce.number().int().min(1).max(10).optional()
  }),
  params: emptyObjectSchema,
  query: emptyObjectSchema
});

export function createTestExecutionRoutes(testExecutionController, security) {
  const router = Router();

  router.post(
    "/run",
    security.requireAuth,
    security.requireAdmin,
    security.testSubmitRateLimit,
    validate(runTestsSchema),
    testExecutionController.runTests
  );
  router.get(
    "/config",
    security.requireAuth,
    security.requireAdmin,
    testExecutionController.getRuntimeConfig
  );

  return router;
}
