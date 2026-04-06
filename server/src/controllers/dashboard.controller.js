import { sendSuccess } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";

export function createDashboardController(dashboardService) {
  return {
    getDashboard: asyncHandler(async (req, res) => {
      const { params, query } = req.validated;

      const result = await dashboardService.getDashboard(params.scanId, {
        threshold: query.threshold,
        riskLimit: query.riskLimit,
        recommendationLimit: query.recommendationLimit,
        weakLimit: query.weakLimit,
        includeInsights: query.includeInsights
      });

      return sendSuccess(res, result, "Dashboard data fetched.");
    })
  };
}
