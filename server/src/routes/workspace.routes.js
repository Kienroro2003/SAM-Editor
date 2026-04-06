import { Router } from "express";
import { z } from "zod";

import { validate } from "../middleware/validate.middleware.js";

const emptyObjectSchema = z.object({}).passthrough();

const treeSchema = z.object({
  body: emptyObjectSchema,
  params: emptyObjectSchema,
  query: z.object({
    path: z.string().default("."),
    depth: z.coerce.number().int().min(1).max(8).default(3)
  })
});

const readFileSchema = z.object({
  body: emptyObjectSchema,
  params: emptyObjectSchema,
  query: z.object({
    path: z.string().min(1)
  })
});

const writeFileSchema = z.object({
  body: z.object({
    path: z.string().min(1),
    content: z.string()
  }),
  params: emptyObjectSchema,
  query: emptyObjectSchema
});

export function createWorkspaceRoutes(workspaceController, security) {
  const router = Router();

  router.get(
    "/tree",
    security.requireAuth,
    security.requireAdmin,
    validate(treeSchema),
    workspaceController.getTree
  );
  router.get(
    "/file",
    security.requireAuth,
    security.requireAdmin,
    validate(readFileSchema),
    workspaceController.readFile
  );
  router.put(
    "/file",
    security.requireAuth,
    security.requireAdmin,
    validate(writeFileSchema),
    workspaceController.writeFile
  );

  return router;
}
