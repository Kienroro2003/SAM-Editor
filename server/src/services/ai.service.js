import path from "node:path";

import { env } from "../config/env.js";
import { ScanRepository } from "../repositories/scan.repository.js";
import { AppError } from "../utils/app-error.js";

const PROMPT_VERSION = "v1";

function buildLineContext(lines, targetLineNumber, windowSize) {
  const startLine = Math.max(1, targetLineNumber - windowSize);
  const endLine = targetLineNumber + windowSize;

  return lines
    .filter((line) => line.lineNumber >= startLine && line.lineNumber <= endLine)
    .map((line) => ({
      lineNumber: line.lineNumber,
      hits: line.hits,
      status: line.status,
      sourceLine: line.sourceLine || ""
    }));
}

function ensureStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (item === null || item === undefined ? "" : String(item).trim()))
    .filter(Boolean)
    .slice(0, 20);
}

function parseJsonFromText(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const candidate = text.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }

    return null;
  }
}

function buildFallbackRecommendation({ filePath, lineNumber, targetLine }) {
  const baseName = path.basename(filePath || "unknown-file");
  const isUncovered = targetLine.status === "uncovered" || targetLine.hits === 0;

  const reason = isUncovered
    ? `Line ${lineNumber} in ${baseName} has no execution hit and should be covered by at least one focused test.`
    : `Line ${lineNumber} in ${baseName} has low execution confidence. Add assertions around boundary behavior.`;

  const suggestedTestCode = [
    `describe("${baseName}", () => {`,
    `  it("covers line ${lineNumber}", () => {`,
    "    // Arrange: prepare minimal input that reaches the target branch",
    "    // Act: call the exported function",
    "    // Assert: verify output and side effects",
    "  });",
    "});"
  ].join("\n");

  const edgeCases = [
    "empty input",
    "null or undefined input",
    "boundary values",
    "unexpected type conversion"
  ];

  return {
    reason,
    suggestedTestCode,
    edgeCases,
    modelProvider: "rule-based",
    modelName: "fallback-v1"
  };
}

async function requestOpenAiRecommendation(payload) {
  if (env.AI_PROVIDER !== "openai" || !env.OPENAI_API_KEY) {
    return null;
  }

  if (env.NODE_ENV === "test" && !env.AI_ALLOW_EXTERNAL_REQUESTS_IN_TEST) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a senior test engineer. Return strict JSON with keys: reason, suggestedTestCode, edgeCases (array of strings)."
          },
          {
            role: "user",
            content: JSON.stringify(payload)
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed with status ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = parseJsonFromText(content);

    if (!parsed || !parsed.reason || !parsed.suggestedTestCode) {
      throw new Error("OpenAI returned invalid JSON response format.");
    }

    return {
      reason: String(parsed.reason),
      suggestedTestCode: String(parsed.suggestedTestCode),
      edgeCases: ensureStringArray(parsed.edgeCases),
      modelProvider: "openai",
      modelName: data.model || env.OPENAI_MODEL
    };
  } finally {
    clearTimeout(timeout);
  }
}

export class AiService {
  constructor(scanRepository) {
    this.scanRepository = scanRepository;
  }

  async getCachedRecommendation(scanFileId, lineNumber) {
    return this.scanRepository.getAiRecommendation(scanFileId, lineNumber);
  }

  async generateRecommendation({
    scanId,
    scanFileId,
    lineNumber,
    triggeredByUserId,
    forceRefresh = false,
    windowSize = 3
  }) {
    const fileCoverage = await this.scanRepository.getFileLineCoverage(scanId, scanFileId);

    if (!fileCoverage) {
      throw new AppError("File coverage not found.", 404);
    }

    if (!forceRefresh) {
      const cached = await this.scanRepository.getAiRecommendation(scanFileId, lineNumber);

      if (cached && cached.status === "ready") {
        return {
          ...cached,
          scanId,
          filePath: fileCoverage.file.filePath,
          source: "cache"
        };
      }
    }

    const targetLine =
      fileCoverage.lines.find((line) => line.lineNumber === lineNumber) ||
      {
        lineNumber,
        hits: 0,
        status: "neutral",
        sourceLine: null
      };

    const contextLines = buildLineContext(fileCoverage.lines, lineNumber, windowSize);

    const payload = {
      filePath: fileCoverage.file.filePath,
      lineNumber,
      lineStatus: targetLine.status,
      lineHits: targetLine.hits,
      lineCoveragePct: fileCoverage.file.linePct,
      contextLines
    };

    const startedAt = Date.now();

    let recommendation;
    let generationError = null;

    try {
      recommendation = await requestOpenAiRecommendation(payload);
    } catch (error) {
      generationError = error;
    }

    if (!recommendation) {
      if (generationError && !env.AI_ALLOW_FALLBACK) {
        await this.scanRepository.upsertAiRecommendation({
          scanFileId,
          lineNumber,
          triggeredByUserId,
          status: "failed",
          reason: null,
          suggestedTestCode: null,
          edgeCases: [],
          modelProvider: env.AI_PROVIDER,
          modelName: env.OPENAI_MODEL,
          promptVersion: PROMPT_VERSION,
          responseMs: Date.now() - startedAt,
          errorMessage: generationError.message
        });

        throw new AppError(`AI generation failed: ${generationError.message}`, 502);
      }

      recommendation = buildFallbackRecommendation({
        filePath: fileCoverage.file.filePath,
        lineNumber,
        targetLine
      });
    }

    const responseMs = Date.now() - startedAt;

    await this.scanRepository.upsertAiRecommendation({
      scanFileId,
      lineNumber,
      triggeredByUserId,
      status: "ready",
      reason: recommendation.reason,
      suggestedTestCode: recommendation.suggestedTestCode,
      edgeCases: recommendation.edgeCases,
      modelProvider: recommendation.modelProvider,
      modelName: recommendation.modelName,
      promptVersion: PROMPT_VERSION,
      responseMs,
      errorMessage: generationError ? generationError.message : null
    });

    const saved = await this.scanRepository.getAiRecommendation(scanFileId, lineNumber);

    return {
      ...saved,
      scanId,
      filePath: fileCoverage.file.filePath,
      source: recommendation.modelProvider === "rule-based" ? "fallback" : "generated",
      contextLines
    };
  }

  async getScanStats(scanId) {
    return this.scanRepository.getAiRecommendationStats(scanId);
  }
}

export function createAiService(pool) {
  return new AiService(new ScanRepository(pool));
}
