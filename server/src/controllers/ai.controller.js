import { env } from "../config/env.js";
import { sendSuccess } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { AppError } from "../utils/app-error.js";

export function createAiController(
  aiService,
  jobOrchestratorService = null,
  aiInsightService = null
) {
  return {
    generateRecommendation: asyncHandler(async (req, res) => {
      const { body } = req.validated;

      const requestedByUserId = req.auth?.userId || body.triggeredByUserId || null;

      const payload = {
        scanId: body.scanId,
        scanFileId: body.scanFileId,
        lineNumber: body.lineNumber,
        triggeredByUserId: requestedByUserId,
        forceRefresh: body.forceRefresh,
        windowSize: body.windowSize
      };

      if (!jobOrchestratorService) {
        const result = await aiService.generateRecommendation(payload);
        return sendSuccess(res, result, "AI recommendation generated.", 201);
      }

      const submission = jobOrchestratorService.submitAiRecommendation({
        payload,
        requestedByUserId,
        maxAttempts: body.maxAttempts
      });

      if (body.async) {
        return sendSuccess(
          res,
          {
            jobId: submission.jobId,
            queueName: submission.queueName,
            status: "queued"
          },
          "AI recommendation job queued.",
          202
        );
      }

      const settled = await jobOrchestratorService.waitForJob({
        jobId: submission.jobId,
        timeoutMs: body.waitTimeoutMs || env.JOB_SYNC_WAIT_TIMEOUT_MS,
        requestedByUserId,
        isAdmin: req.auth?.isAdmin || false
      });

      if (settled.timedOut || settled.status === "queued" || settled.status === "processing") {
        return sendSuccess(
          res,
          {
            jobId: settled.jobId,
            queueName: settled.queueName,
            status: settled.status,
            timedOut: true
          },
          "AI recommendation job is still processing.",
          202
        );
      }

      if (settled.status === "failed") {
        throw new AppError(
          `AI recommendation job failed: ${settled.error?.message || "Unknown error."}`,
          settled.error?.statusCode || 502,
          settled.error?.details || settled.error
        );
      }

      const result = settled.result;

      return sendSuccess(
        res,
        {
          ...result,
          jobId: settled.jobId,
          queueName: settled.queueName
        },
        "AI recommendation generated.",
        201
      );
    }),

    getRecommendation: asyncHandler(async (req, res) => {
      const { query } = req.validated;
      const result = await aiService.getCachedRecommendation(query.scanFileId, query.lineNumber);

      if (!result) {
        throw new AppError("AI recommendation not found.", 404);
      }

      return sendSuccess(res, result, "AI recommendation fetched.");
    }),

    getScanStats: asyncHandler(async (req, res) => {
      const { params } = req.validated;
      const result = await aiService.getScanStats(params.scanId);
      return sendSuccess(res, result, "AI recommendation stats fetched.");
    }),

    getScanInsights: asyncHandler(async (req, res) => {
      if (!aiInsightService) {
        throw new AppError("AI insight service is not available.", 500);
      }

      const { params, query } = req.validated;

      const result = await aiInsightService.generateScanInsights(params.scanId, {
        threshold: query.threshold,
        riskLimit: query.riskLimit,
        weakLimit: query.weakLimit,
        maxItems: query.maxItems
      });

      return sendSuccess(res, result, "AI scan insights generated.");
    })
  };
}
