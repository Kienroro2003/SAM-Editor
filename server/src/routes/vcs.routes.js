import { Router } from "express";
import { z } from "zod";

import { validate } from "../middleware/validate.middleware.js";

const emptyObjectSchema = z.object({}).passthrough();

const statusSchema = z.object({
  body: emptyObjectSchema,
  params: emptyObjectSchema,
  query: z.object({
    repoPath: z.string().default(".")
  })
});

const commitsSchema = z.object({
  body: emptyObjectSchema,
  params: emptyObjectSchema,
  query: z.object({
    repoPath: z.string().default("."),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
});

const syncSchema = z.object({
  body: z.object({
    repoPath: z.string().default("."),
    remote: z.string().default("origin"),
    branch: z.string().min(1).optional(),
    performPull: z.coerce.boolean().default(false)
  }),
  params: emptyObjectSchema,
  query: emptyObjectSchema
});

export function createVcsRoutes(vcsController, security) {
  const router = Router();

  router.get(
    "/status",
    security.requireAuth,
    security.requireAdmin,
    validate(statusSchema),
    vcsController.getStatus
  );
  router.get(
    "/commits",
    security.requireAuth,
    security.requireAdmin,
    validate(commitsSchema),
    vcsController.getRecentCommits
  );
  router.post(
    "/sync",
    security.requireAuth,
    security.requireAdmin,
    validate(syncSchema),
    vcsController.sync
  );

  return router;
}
