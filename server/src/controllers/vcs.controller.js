import { sendSuccess } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";

export function createVcsController(vcsService) {
  return {
    getStatus: asyncHandler(async (req, res) => {
      const { query } = req.validated;
      const result = await vcsService.getStatus({ repoPath: query.repoPath });
      return sendSuccess(res, result, "VCS status fetched.");
    }),

    getRecentCommits: asyncHandler(async (req, res) => {
      const { query } = req.validated;
      const result = await vcsService.getRecentCommits({
        repoPath: query.repoPath,
        limit: query.limit
      });

      return sendSuccess(res, result, "Recent commits fetched.");
    }),

    sync: asyncHandler(async (req, res) => {
      const { body } = req.validated;

      const result = await vcsService.sync({
        repoPath: body.repoPath,
        remote: body.remote,
        branch: body.branch,
        performPull: body.performPull
      });

      return sendSuccess(res, result, "VCS sync completed.");
    })
  };
}
