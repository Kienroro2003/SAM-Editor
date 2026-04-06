import { Router } from "express";
import { z } from "zod";

import { validate } from "../middleware/validate.middleware.js";

const emptyObjectSchema = z.object({}).passthrough();

const jobIdSchema = z.object({
  body: emptyObjectSchema,
  params: z.object({
    jobId: z.string().uuid()
  }),
  query: emptyObjectSchema
});

const listJobsSchema = z.object({
  body: emptyObjectSchema,
  params: emptyObjectSchema,
  query: z.object({
    queue: z.enum(["all", "ai", "test"]).default("all"),
    status: z.enum(["queued", "processing", "completed", "failed"]).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50)
  })
});

export function createJobRoutes(jobController, security) {
  const router = Router();

  router.get(
    "/",
    security.requireAuth,
    validate(listJobsSchema),
    jobController.listJobs
  );

  router.get(
    "/:jobId",
    security.requireAuth,
    validate(jobIdSchema),
    jobController.getJob
  );

  return router;
}
