import { env } from "../config/env.js";

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

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildHeuristicInsights({ overview, riskModules, testQuality, requirementCoverage, maxItems }) {
  const untestedModules = riskModules.modules.slice(0, maxItems).map((item) => ({
    filePath: item.filePath,
    linePct: item.linePct,
    reason: "Coverage below risk threshold"
  }));

  const weakTestCases = testQuality.weakTestCases.slice(0, maxItems).map((item) => ({
    testName: item.testName,
    filePath: item.filePath,
    weaknessScore: item.weaknessScore,
    issues: item.issues.map((issue) => issue.code)
  }));

  const requirementGaps = requirementCoverage.requirements
    .filter((item) => item.status !== "covered")
    .slice(0, maxItems)
    .map((item) => ({
      requirementKey: item.requirementKey,
      title: item.title,
      status: item.status,
      pct: item.pct
    }));

  const missingEdgeCases = [];

  if (overview.metrics.branch.pct < 80) {
    missingEdgeCases.push("Uncovered branching paths for boundary and negative conditions.");
  }

  if (overview.metrics.function.pct < 90) {
    missingEdgeCases.push("Untested function call combinations and optional parameter variants.");
  }

  if (testQuality.summary.skipped > 0) {
    missingEdgeCases.push("Skipped tests may hide critical edge cases and regression paths.");
  }

  if (requirementGaps.length > 0) {
    missingEdgeCases.push("Requirements with partial or no coverage need scenario-focused tests.");
  }

  if (missingEdgeCases.length === 0) {
    missingEdgeCases.push("No critical edge case gap detected from current metrics.");
  }

  const recommendedAdditionalTests = [];

  for (const module of untestedModules.slice(0, Math.min(5, maxItems))) {
    recommendedAdditionalTests.push({
      title: `Increase coverage for ${module.filePath}`,
      target: module.filePath,
      priority: "high",
      testIdea: "Add focused tests for uncovered branches and failure conditions."
    });
  }

  for (const weak of weakTestCases.slice(0, Math.min(3, maxItems))) {
    recommendedAdditionalTests.push({
      title: `Strengthen test ${weak.testName}`,
      target: weak.filePath || "unknown",
      priority: "medium",
      testIdea: "Increase assertions and cover alternative execution paths."
    });
  }

  for (const gap of requirementGaps.slice(0, Math.min(3, maxItems))) {
    recommendedAdditionalTests.push({
      title: `Cover requirement ${gap.requirementKey}`,
      target: gap.requirementKey,
      priority: "high",
      testIdea: "Add scenario tests mapped to uncovered requirement lines."
    });
  }

  return {
    untestedModules,
    weakTestCases,
    missingEdgeCases,
    requirementGaps,
    recommendedAdditionalTests
  };
}

async function requestOpenAiInsights(payload) {
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
              "You are a senior quality engineer. Return strict JSON with keys: untestedModules, weakTestCases, missingEdgeCases, requirementGaps, recommendedAdditionalTests. Keep arrays concise and actionable."
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

    if (!parsed) {
      throw new Error("OpenAI returned non-JSON insight payload.");
    }

    return {
      provider: "openai",
      model: data.model || env.OPENAI_MODEL,
      insights: {
        untestedModules: toArray(parsed.untestedModules),
        weakTestCases: toArray(parsed.weakTestCases),
        missingEdgeCases: toArray(parsed.missingEdgeCases),
        requirementGaps: toArray(parsed.requirementGaps),
        recommendedAdditionalTests: toArray(parsed.recommendedAdditionalTests)
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

export class AiInsightService {
  constructor({ scanService, testCaseService, requirementCoverageService }) {
    this.scanService = scanService;
    this.testCaseService = testCaseService;
    this.requirementCoverageService = requirementCoverageService;
  }

  async generateScanInsights(scanId, {
    threshold = 50,
    riskLimit = 50,
    weakLimit = 50,
    maxItems = 20
  } = {}) {
    const overview = await this.scanService.getOverview(scanId);
    const riskModules = await this.scanService.getRiskModules(scanId, threshold, riskLimit);
    const testQuality = await this.testCaseService.getQualityReport(scanId, { limit: weakLimit });
    const requirementCoverage = await this.requirementCoverageService.getScanRequirementCoverage(scanId);

    const heuristic = buildHeuristicInsights({
      overview,
      riskModules,
      testQuality,
      requirementCoverage,
      maxItems
    });

    let provider = "heuristic";
    let model = "rules-v1";
    let insights = heuristic;

    try {
      const aiResult = await requestOpenAiInsights({
        scanId,
        overview,
        riskModules: riskModules.modules,
        weakTestCases: testQuality.weakTestCases,
        requirementCoverage: requirementCoverage.requirements,
        heuristic
      });

      if (aiResult) {
        provider = aiResult.provider;
        model = aiResult.model;
        insights = aiResult.insights;
      }
    } catch {
      // Fall back to heuristic insights when provider is unavailable.
    }

    return {
      scanId,
      generatedAt: new Date().toISOString(),
      provider,
      model,
      summary: {
        untestedModuleCount: (insights.untestedModules || []).length,
        weakTestCaseCount: (insights.weakTestCases || []).length,
        missingEdgeCaseCount: (insights.missingEdgeCases || []).length,
        recommendationCount: (insights.recommendedAdditionalTests || []).length
      },
      ...insights
    };
  }
}

export function createAiInsightService({
  scanService,
  testCaseService,
  requirementCoverageService
}) {
  return new AiInsightService({
    scanService,
    testCaseService,
    requirementCoverageService
  });
}
