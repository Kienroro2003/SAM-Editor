import { sendSuccess } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";

export function createWorkspaceController(workspaceService) {
  return {
    getTree: asyncHandler(async (req, res) => {
      const { query } = req.validated;
      const tree = await workspaceService.listTree(query.path, query.depth);
      return sendSuccess(res, tree, "Workspace tree fetched.");
    }),

    readFile: asyncHandler(async (req, res) => {
      const { query } = req.validated;
      const file = await workspaceService.readFile(query.path);
      return sendSuccess(res, file, "Workspace file fetched.");
    }),

    writeFile: asyncHandler(async (req, res) => {
      const { body } = req.validated;
      const file = await workspaceService.writeFile(body.path, body.content);
      return sendSuccess(res, file, "Workspace file saved.");
    })
  };
}
