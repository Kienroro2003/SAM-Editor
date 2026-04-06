import { AppError } from "../utils/app-error.js";
import { ScanRepository } from "../repositories/scan.repository.js";

const ALLOWED_STATUS = new Set(["passed", "failed", "skipped", "unknown"]);

function normalizeStatus(status) {
  const normalized = String(status || "unknown").trim().toLowerCase();
  return ALLOWED_STATUS.has(normalized) ? normalized : "unknown";
}

function normalizeTestCase(testCase, index) {
  const testName = String(testCase.testName || testCase.name || "").trim();

  if (!testName) {
    throw new AppError(`testCases[${index}] must include testName.`, 400);
  }

  const assertions = Number.isFinite(Number(testCase.assertions))
    ? Math.max(0, Number(testCase.assertions))
    : 0;

  const durationMs = Number.isFinite(Number(testCase.durationMs))
    ? Math.max(0, Number(testCase.durationMs))
    : null;

  return {
    testName,
    filePath: testCase.filePath ? String(testCase.filePath).replace(/\\/g, "/") : null,
    status: normalizeStatus(testCase.status),
    assertions,
    durationMs,
    metadata: testCase.metadata || {}
  };
}

function scoreTestCase(testCase, duplicateCount, slowThresholdMs) {
  const issues = [];

  if (testCase.status === "failed") {
    issues.push({
      code: "failing_test",
      severity: "high",
      message: "Test is currently failing."
    });
  }

  if (testCase.status === "skipped") {
    issues.push({
      code: "skipped_test",
      severity: "high",
      message: "Test is skipped and does not provide coverage signal."
    });
  }

  if (testCase.assertions <= 0) {
    issues.push({
      code: "no_assertion",
      severity: "medium",
      message: "Test has zero recorded assertions."
    });
  }

  if (testCase.durationMs && testCase.durationMs > slowThresholdMs) {
    issues.push({
      code: "slow_test",
      severity: "low",
      message: `Test execution time is high (${testCase.durationMs}ms).`
    });
  }

  if (duplicateCount > 1) {
    issues.push({
      code: "duplicate_name",
      severity: "medium",
      message: `Duplicate test name appears ${duplicateCount} times.`
    });
  }

  if (testCase.status === "unknown") {
    issues.push({
      code: "unknown_status",
      severity: "low",
      message: "Test status is unknown."
    });
  }

  const score = issues.reduce((acc, issue) => {
    if (issue.severity === "high") {
      return acc + 40;
    }

    if (issue.severity === "medium") {
      return acc + 25;
    }

    return acc + 10;
  }, 0);

  return {
    score,
    level: score >= 60 ? "critical" : score >= 30 ? "weak" : "healthy",
    issues
  };
}

export class TestCaseService {
  constructor(scanRepository, options = {}) {
    this.scanRepository = scanRepository;
    this.slowThresholdMs = options.slowThresholdMs || 2000;
  }

  async importScanTestCases(scanId, testCases) {
    if (!Array.isArray(testCases)) {
      throw new AppError("testCases must be an array.", 400);
    }

    const normalized = testCases.map((item, index) => normalizeTestCase(item, index));

    await this.scanRepository.replaceScanTestCases(scanId, normalized);

    return {
      scanId,
      count: normalized.length
    };
  }

  async getQualityReport(scanId, { limit = 200 } = {}) {
    const testCases = await this.scanRepository.listScanTestCases(scanId);

    const nameCount = new Map();
    for (const item of testCases) {
      const key = `${item.filePath || ""}::${item.testName}`;
      nameCount.set(key, (nameCount.get(key) || 0) + 1);
    }

    const scored = testCases.map((item) => {
      const key = `${item.filePath || ""}::${item.testName}`;
      const duplicateCount = nameCount.get(key) || 1;
      const score = scoreTestCase(item, duplicateCount, this.slowThresholdMs);

      return {
        id: item.id,
        testName: item.testName,
        filePath: item.filePath,
        status: item.status,
        assertions: item.assertions,
        durationMs: item.durationMs,
        weaknessScore: score.score,
        weaknessLevel: score.level,
        issues: score.issues,
        createdAt: item.createdAt
      };
    });

    const weakTestCases = scored
      .filter((item) => item.weaknessLevel !== "healthy")
      .sort((a, b) => b.weaknessScore - a.weaknessScore)
      .slice(0, Math.max(1, Math.min(Number(limit) || 200, 500)));

    const summary = {
      total: scored.length,
      passed: scored.filter((item) => item.status === "passed").length,
      failed: scored.filter((item) => item.status === "failed").length,
      skipped: scored.filter((item) => item.status === "skipped").length,
      unknown: scored.filter((item) => item.status === "unknown").length,
      weakCount: weakTestCases.length,
      slowThresholdMs: this.slowThresholdMs
    };

    return {
      scanId,
      summary,
      weakTestCases,
      allTestCases: scored
    };
  }
}

export function createTestCaseService(pool, options = {}) {
  return new TestCaseService(new ScanRepository(pool), options);
}
