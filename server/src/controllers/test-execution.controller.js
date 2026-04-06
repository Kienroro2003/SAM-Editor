import { env } from "../config/env.js";
import { sendSuccess } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { AppError } from "../utils/app-error.js";

export function createTestExecutionController(testExecutionService, jobOrchestratorService = null) {
  return {
    runTests: asyncHandler(async (req, res) => {
      const { body } = req.validated;

      const payload = {
        projectPath: body.projectPath,
        command: body.command,
        timeoutMs: body.timeoutMs
      };

      if (!jobOrchestratorService) {
        const result = await testExecutionService.runTests(payload);
        return sendSuccess(res, result, "Test execution completed.");
      }

      const submission = jobOrchestratorService.submitTestExecution({
        payload,
        requestedByUserId: req.auth?.userId || null,
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
          "Test execution job queued.",
          202
        );
      }

      const settled = await jobOrchestratorService.waitForJob({
        jobId: submission.jobId,
        timeoutMs: body.waitTimeoutMs || env.JOB_SYNC_WAIT_TIMEOUT_MS,
        requestedByUserId: req.auth?.userId || null,
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
          "Test execution job is still processing.",
          202
        );
      }

      if (settled.status === "failed") {
        throw new AppError(
          `Test execution job failed: ${settled.error?.message || "Unknown error."}`,
          settled.error?.statusCode || 500,
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
        "Test execution completed."
      );
    }),

    getRuntimeConfig: asyncHandler(async (_req, res) => {
      const result = testExecutionService.getRuntimeConfig();
      return sendSuccess(res, result, "Test execution config fetched.");
    })
  };
}
