import { Router } from "express";

export function createHealthRoutes(healthController) {
  const router = Router();

  router.get("/", healthController.getHealth);

  return router;
}
