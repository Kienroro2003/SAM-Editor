import { sendSuccess } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { AppError } from "../utils/app-error.js";

export function createScanController(
  scanService,
  requirementCoverageService = null,
  testCaseService = null
) {
  return {
    importSourceArchive: asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new AppError("sourceArchive file is required.", 400);
      }

      const { body } = req.validated;

      if (
        req.auth?.isAuthenticated &&
        body.createdByUserId &&
        body.createdByUserId !== req.auth.userId &&
        !req.auth.isAdmin
      ) {
        throw new AppError("createdByUserId does not match authenticated user.", 403);
      }

      const createdByUserId = req.auth?.userId || body.createdByUserId;

      if (!createdByUserId) {
        throw new AppError(
          "createdByUserId is required when authentication is not enabled.",
          400
        );
      }

      const result = await scanService.importSourceArchive({
        projectId: body.projectId,
        createdByUserId,
        riskThreshold: body.riskThreshold,
        archiveFilePath: req.file.path,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size
      });

      return sendSuccess(res, result, "Source archive imported successfully.", 201);
    }),

    ingestLcov: asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new AppError("lcovReport file is required.", 400);
      }

      const { body } = req.validated;

      if (
        req.auth?.isAuthenticated &&
        body.createdByUserId &&
        body.createdByUserId !== req.auth.userId &&
        !req.auth.isAdmin
      ) {
        throw new AppError("createdByUserId does not match authenticated user.", 403);
      }

      const createdByUserId = req.auth?.userId || body.createdByUserId;

      if (!createdByUserId) {
        throw new AppError(
          "createdByUserId is required when authentication is not enabled.",
          400
        );
      }

      const result = await scanService.ingestLcov({
        projectId: body.projectId,
        createdByUserId,
        riskThreshold: body.riskThreshold,
        lcovContent: req.file.buffer.toString("utf8"),
        reportFileName: req.file.originalname,
        reportSizeBytes: req.file.size
      });

      if (requirementCoverageService) {
        result.requirementCoverage = await requirementCoverageService.recomputeScanRequirementCoverage(
          result.scanId
        );
      }

      return sendSuccess(res, result, "LCOV report ingested successfully.", 201);
    }),

    ingestLcovForScan: asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new AppError("lcovReport file is required.", 400);
      }

      const { params } = req.validated;

      const result = await scanService.ingestLcovForScan({
        scanId: params.scanId,
        lcovContent: req.file.buffer.toString("utf8"),
        reportFileName: req.file.originalname,
        reportSizeBytes: req.file.size
      });

      if (requirementCoverageService) {
        result.requirementCoverage = await requirementCoverageService.recomputeScanRequirementCoverage(
          result.scanId
        );
      }

      return sendSuccess(res, result, "LCOV report ingested successfully.", 201);
    }),

    importRequirements: asyncHandler(async (req, res) => {
      if (!requirementCoverageService) {
        throw new AppError("Requirement coverage service is not available.", 500);
      }

      const { params, body } = req.validated;
      const scan = await scanService.getScanMinimal(params.scanId);

      const requirements = await requirementCoverageService.upsertProjectRequirements(
        scan.projectId,
        body.requirements
      );

      const coverage = await requirementCoverageService.recomputeScanRequirementCoverage(
        params.scanId
      );

      return sendSuccess(
        res,
        {
          scanId: params.scanId,
          projectId: scan.projectId,
          importedCount: requirements.length,
          coverage
        },
        "Requirements imported and coverage recomputed."
      );
    }),

    getRequirementCoverage: asyncHandler(async (req, res) => {
      if (!requirementCoverageService) {
        throw new AppError("Requirement coverage service is not available.", 500);
      }

      const { params } = req.validated;
      const coverage = await requirementCoverageService.getScanRequirementCoverage(
        params.scanId
      );

      return sendSuccess(res, coverage, "Requirement coverage fetched.");
    }),

    importTestCases: asyncHandler(async (req, res) => {
      if (!testCaseService) {
        throw new AppError("Test case service is not available.", 500);
      }

      const { params, body } = req.validated;

      const importResult = await testCaseService.importScanTestCases(
        params.scanId,
        body.testCases
      );

      const quality = await testCaseService.getQualityReport(params.scanId, {
        limit: body.qualityLimit
      });

      return sendSuccess(
        res,
        {
          importResult,
          quality
        },
        "Test cases imported and quality analyzed."
      );
    }),

    getTestCaseQuality: asyncHandler(async (req, res) => {
      if (!testCaseService) {
        throw new AppError("Test case service is not available.", 500);
      }

      const { params, query } = req.validated;
      const quality = await testCaseService.getQualityReport(params.scanId, {
        limit: query.limit
      });

      return sendSuccess(res, quality, "Test case quality fetched.");
    }),

    getOverview: asyncHandler(async (req, res) => {
      const { params } = req.validated;
      const result = await scanService.getOverview(params.scanId);
      return sendSuccess(res, result, "Scan overview fetched.");
    }),

    getRiskModules: asyncHandler(async (req, res) => {
      const { params, query } = req.validated;

      const result = await scanService.getRiskModules(
        params.scanId,
        query.threshold,
        query.limit
      );

      return sendSuccess(res, result, "Risk modules fetched.");
    }),

    getFileLineCoverage: asyncHandler(async (req, res) => {
      const { params } = req.validated;

      const result = await scanService.getFileLineCoverage(
        params.scanId,
        params.scanFileId
      );

      return sendSuccess(res, result, "File line coverage fetched.");
    })
  };
}
