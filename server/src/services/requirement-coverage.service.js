import { AppError } from "../utils/app-error.js";
import { ScanRepository } from "../repositories/scan.repository.js";

function toPercent(hit, found) {
  if (!found || found <= 0) {
    return 0;
  }

  return Number(((hit / found) * 100).toFixed(2));
}

function normalizePath(filePath) {
  return String(filePath || "")
    .replace(/\\/g, "/")
    .trim();
}

function normalizeRequirementInput(requirement, index) {
  const requirementKey = String(
    requirement.requirementKey || requirement.key || `REQ-${index + 1}`
  ).trim();

  const title = String(requirement.title || requirement.name || requirementKey).trim();

  if (!requirementKey) {
    throw new AppError("Requirement key is required.", 400);
  }

  if (!title) {
    throw new AppError(`Requirement ${requirementKey} must have a title.`, 400);
  }

  const mappings = Array.isArray(requirement.mappings)
    ? requirement.mappings.map((mapping) => ({
        filePath: normalizePath(mapping.filePath),
        startLine: Number(mapping.startLine),
        endLine: Number(mapping.endLine)
      }))
    : [];

  for (const mapping of mappings) {
    if (!mapping.filePath) {
      throw new AppError(`Requirement ${requirementKey} has empty mapping filePath.`, 400);
    }

    if (!Number.isInteger(mapping.startLine) || mapping.startLine <= 0) {
      throw new AppError(
        `Requirement ${requirementKey} has invalid startLine for ${mapping.filePath}.`,
        400
      );
    }

    if (!Number.isInteger(mapping.endLine) || mapping.endLine < mapping.startLine) {
      throw new AppError(
        `Requirement ${requirementKey} has invalid endLine for ${mapping.filePath}.`,
        400
      );
    }
  }

  return {
    requirementKey,
    title,
    description: requirement.description || null,
    priority: Number(requirement.priority) || 3,
    metadata: requirement.metadata || {},
    mappings
  };
}

function buildLineSet(mappings) {
  const lineSet = new Map();

  for (const mapping of mappings) {
    const filePath = normalizePath(mapping.filePath);
    if (!lineSet.has(filePath)) {
      lineSet.set(filePath, new Set());
    }

    for (let line = mapping.startLine; line <= mapping.endLine; line += 1) {
      lineSet.get(filePath).add(line);
    }
  }

  return lineSet;
}

function summarizeCoverage(rows) {
  const requirementsFound = rows.length;
  const requirementsHit = rows.filter((row) => row.status === "covered").length;
  const requirementPct = toPercent(requirementsHit, requirementsFound);

  const partiallyCovered = rows.filter((row) => row.status === "partial").length;
  const uncovered = rows.filter((row) => row.status === "uncovered").length;
  const notMapped = rows.filter((row) => row.status === "not_mapped").length;

  return {
    requirementsFound,
    requirementsHit,
    requirementPct,
    partiallyCovered,
    uncovered,
    notMapped
  };
}

export class RequirementCoverageService {
  constructor(scanRepository) {
    this.scanRepository = scanRepository;
  }

  async upsertProjectRequirements(projectId, requirements) {
    if (!Array.isArray(requirements)) {
      throw new AppError("requirements must be an array.", 400);
    }

    const normalized = requirements.map((item, index) => normalizeRequirementInput(item, index));

    await this.scanRepository.upsertProjectRequirements(projectId, normalized);

    return this.scanRepository.listProjectRequirements(projectId);
  }

  async recomputeScanRequirementCoverage(scanId) {
    const scan = await this.scanRepository.getScanMinimal(scanId);

    if (!scan) {
      throw new AppError("Scan not found.", 404);
    }

    const requirements = await this.scanRepository.getRequirementMappingsForScan(scanId);
    const lineCoverageMap = await this.scanRepository.getScanLineCoverageMap(scanId);

    const rows = requirements.map((requirement) => {
      const mappedLineSet = buildLineSet(requirement.mappings || []);

      let mappedLines = 0;
      let coveredLines = 0;

      for (const [filePath, lineSet] of mappedLineSet.entries()) {
        mappedLines += lineSet.size;

        const coveredMap = lineCoverageMap.get(filePath);
        if (!coveredMap) {
          continue;
        }

        for (const lineNumber of lineSet.values()) {
          const lineStatus = coveredMap.get(lineNumber);
          if (lineStatus && (lineStatus.status === "covered" || lineStatus.hits > 0)) {
            coveredLines += 1;
          }
        }
      }

      let status = "not_mapped";
      if (mappedLines > 0 && coveredLines === 0) {
        status = "uncovered";
      } else if (mappedLines > 0 && coveredLines < mappedLines) {
        status = "partial";
      } else if (mappedLines > 0 && coveredLines >= mappedLines) {
        status = "covered";
      }

      return {
        requirementId: requirement.requirementId,
        requirementKey: requirement.requirementKey,
        title: requirement.title,
        description: requirement.description,
        priority: requirement.priority,
        mappedLines,
        coveredLines,
        pct: toPercent(coveredLines, mappedLines),
        status
      };
    });

    await this.scanRepository.replaceScanRequirementCoverage(scanId, rows);

    const summary = summarizeCoverage(rows);

    await this.scanRepository.updateScanRequirementMetrics(scanId, {
      requirementsFound: summary.requirementsFound,
      requirementsHit: summary.requirementsHit,
      requirementPct: summary.requirementPct
    });

    return {
      scanId,
      projectId: scan.projectId,
      summary,
      requirements: rows
    };
  }

  async getScanRequirementCoverage(scanId) {
    const rows = await this.scanRepository.listScanRequirementCoverage(scanId);

    if (rows.length === 0) {
      return {
        scanId,
        summary: summarizeCoverage([]),
        requirements: []
      };
    }

    return {
      scanId,
      summary: summarizeCoverage(rows),
      requirements: rows
    };
  }
}

export function createRequirementCoverageService(pool) {
  return new RequirementCoverageService(new ScanRepository(pool));
}
