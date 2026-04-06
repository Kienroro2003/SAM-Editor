import { sendSuccess } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";

export function createJobController(jobOrchestratorService) {
  return {
    getJob: asyncHandler(async (req, res) => {
      const { params } = req.validated;

      const result = jobOrchestratorService.getJobForRequester({
        jobId: params.jobId,
        requestedByUserId: req.auth?.userId || null,
        isAdmin: req.auth?.isAdmin || false,
        includeResult: true
      });

      return sendSuccess(res, result, "Job status fetched.");
    }),

    listJobs: asyncHandler(async (req, res) => {
      const { query } = req.validated;

      const jobs = jobOrchestratorService.listJobs({
        queueName: query.queue,
        status: query.status,
        limit: query.limit,
        requestedByUserId: req.auth?.userId || null,
        isAdmin: req.auth?.isAdmin || false
      });

      return sendSuccess(
        res,
        {
          count: jobs.length,
          jobs
        },
        "Jobs list fetched."
      );
    })
  };
}
