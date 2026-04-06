import { sendSuccess } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";

export function createHealthController(scanService) {
  return {
    getHealth: asyncHandler(async (_req, res) => {
      const health = await scanService.healthCheck();
      return sendSuccess(res, health, "Service is healthy.");
    })
  };
}
