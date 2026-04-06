import fs from "node:fs/promises";

import { AppError } from "../utils/app-error.js";
import { parseLcov } from "./lcov-parser.service.js";
import { ScanRepository } from "../repositories/scan.repository.js";
import { createStorageService } from "./storage.service.js";

function safeFileName(value) {
  return String(value || "source-archive")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 200);
}

export class ScanService {
  constructor(scanRepository, storageService) {
    this.scanRepository = scanRepository;
    this.storageService = storageService;
  }

  async healthCheck() {
    await this.scanRepository.healthCheck();
    return {
      status: "ok",
      timestamp: new Date().toISOString()
    };
  }

  async ingestLcov({
    projectId,
    createdByUserId,
    riskThreshold,
    lcovContent,
    reportFileName,
    reportSizeBytes
  }) {
    if (!lcovContent || !lcovContent.trim()) {
      throw new AppError("LCOV file is empty.", 400);
    }

    let scan;

    try {
      scan = await this.scanRepository.createScan({
        projectId,
        createdByUserId,
        riskThreshold
      });
    } catch (error) {
      if (error.code === "23503") {
        throw new AppError(
          "projectId or createdByUserId does not exist.",
          400
        );
      }

      throw error;
    }

    try {
      const parsedResult = parseLcov(lcovContent);

      await this.scanRepository.saveParsedScan({
        scanId: scan.id,
        reportFileName,
        reportSizeBytes,
        parsedResult
      });

      const overview = await this.getOverview(scan.id);

      return {
        scanId: scan.id,
        projectId,
        summary: overview.metrics,
        totals: overview.totals
      };
    } catch (error) {
      await this.scanRepository.markScanFailed(scan.id, error.message);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(error.message || "Failed to ingest LCOV report.", 400);
    }
  }

  async importSourceArchive({
    projectId,
    createdByUserId,
    riskThreshold,
    archiveFilePath,
    originalFilename,
    mimeType,
    sizeBytes
  }) {
    if (!archiveFilePath) {
      throw new AppError("Source archive file is required.", 400);
    }

    let scan;

    try {
      scan = await this.scanRepository.createScan({
        projectId,
        createdByUserId,
        riskThreshold,
        inputType: "source_import",
        status: "uploading"
      });
    } catch (error) {
      if (error.code === "23503") {
        throw new AppError("projectId or createdByUserId does not exist.", 400);
      }

      throw error;
    }

    const artifactObjectKey = `projects/${projectId}/scans/${scan.id}/source/${Date.now()}-${safeFileName(
      originalFilename
    )}`;

    try {
      const stored = await this.storageService.uploadFilePath({
        filePath: archiveFilePath,
        objectKey: artifactObjectKey,
        contentType: mimeType,
        metadata: {
          scanId: scan.id,
          projectId
        }
      });

      await this.scanRepository.upsertScanArtifact({
        scanId: scan.id,
        artifactType: "source_zip",
        storageProvider: stored.storageProvider,
        bucketName: stored.bucketName,
        objectKey: stored.objectKey,
        originalFilename,
        mimeType,
        sizeBytes: sizeBytes || stored.sizeBytes,
        status: "available"
      });

      return {
        scanId: scan.id,
        projectId,
        status: "uploading",
        sourceArtifact: {
          storageProvider: stored.storageProvider,
          bucketName: stored.bucketName,
          objectKey: stored.objectKey,
          sizeBytes: sizeBytes || stored.sizeBytes,
          downloadUrl: stored.downloadUrl || null
        }
      };
    } catch (error) {
      await this.scanRepository.markScanFailed(scan.id, error.message || "Source upload failed.");
      throw error;
    } finally {
      await fs.unlink(archiveFilePath).catch(() => {
        // Ignore cleanup errors for temp upload files.
      });
    }
  }

  async ingestLcovForScan({
    scanId,
    lcovContent,
    reportFileName,
    reportSizeBytes
  }) {
    if (!lcovContent || !lcovContent.trim()) {
      throw new AppError("LCOV file is empty.", 400);
    }

    const scan = await this.scanRepository.getScanMinimal(scanId);

    if (!scan) {
      throw new AppError("Scan not found.", 404);
    }

    try {
      await this.scanRepository.updateScanStatus(scanId, "processing", null);

      const parsedResult = parseLcov(lcovContent);

      await this.scanRepository.saveParsedScan({
        scanId,
        reportFileName,
        reportSizeBytes,
        parsedResult
      });

      const overview = await this.getOverview(scanId);

      return {
        scanId,
        projectId: scan.projectId,
        summary: overview.metrics,
        totals: overview.totals
      };
    } catch (error) {
      await this.scanRepository.markScanFailed(scanId, error.message);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(error.message || "Failed to ingest LCOV report.", 400);
    }
  }

  async getOverview(scanId) {
    const overview = await this.scanRepository.getOverview(scanId);

    if (!overview) {
      throw new AppError("Scan not found.", 404);
    }

    return overview;
  }

  async getScanMinimal(scanId) {
    const scan = await this.scanRepository.getScanMinimal(scanId);

    if (!scan) {
      throw new AppError("Scan not found.", 404);
    }

    return scan;
  }

  async getRiskModules(scanId, threshold = 50, limit = 100) {
    await this.getOverview(scanId);

    const modules = await this.scanRepository.getRiskModules(scanId, threshold, limit);

    return {
      scanId,
      threshold,
      count: modules.length,
      modules
    };
  }

  async getFileLineCoverage(scanId, scanFileId) {
    await this.getOverview(scanId);

    const result = await this.scanRepository.getFileLineCoverage(scanId, scanFileId);

    if (!result) {
      throw new AppError("File coverage not found.", 404);
    }

    return {
      scanId,
      file: result.file,
      lines: result.lines
    };
  }
}

export function createScanService(pool, { storageService } = {}) {
  return new ScanService(
    new ScanRepository(pool),
    storageService || createStorageService()
  );
}
