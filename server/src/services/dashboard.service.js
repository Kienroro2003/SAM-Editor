import { ScanRepository } from "../repositories/scan.repository.js";

export class DashboardService {
  constructor(
    scanService,
    scanRepository,
    { requirementCoverageService = null, testCaseService = null, aiInsightService = null } = {}
  ) {
    this.scanService = scanService;
    this.scanRepository = scanRepository;
    this.requirementCoverageService = requirementCoverageService;
    this.testCaseService = testCaseService;
    this.aiInsightService = aiInsightService;
  }

  async getDashboard(scanId, {
    threshold = 50,
    riskLimit = 100,
    recommendationLimit = 20,
    includeInsights = true,
    weakLimit = 100
  }) {
    const overview = await this.scanService.getOverview(scanId);
    const riskModules = await this.scanService.getRiskModules(scanId, threshold, riskLimit);
    const aiStats = await this.scanRepository.getAiRecommendationStats(scanId);
    const aiRecommendations = await this.scanRepository.listAiRecommendationsByScan(
      scanId,
      recommendationLimit
    );

    const requirementCoverage = this.requirementCoverageService
      ? await this.requirementCoverageService.getScanRequirementCoverage(scanId)
      : {
          scanId,
          summary: {
            requirementsFound: 0,
            requirementsHit: 0,
            requirementPct: 0,
            partiallyCovered: 0,
            uncovered: 0,
            notMapped: 0
          },
          requirements: []
        };

    const testCaseQuality = this.testCaseService
      ? await this.testCaseService.getQualityReport(scanId, { limit: weakLimit })
      : {
          scanId,
          summary: {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            unknown: 0,
            weakCount: 0,
            slowThresholdMs: 0
          },
          weakTestCases: [],
          allTestCases: []
        };

    const insights =
      includeInsights && this.aiInsightService
        ? await this.aiInsightService.generateScanInsights(scanId, {
            threshold,
            riskLimit,
            weakLimit,
            maxItems: recommendationLimit
          })
        : null;

    return {
      scanId,
      generatedAt: new Date().toISOString(),
      overview,
      riskModules,
      requirementCoverage,
      testCaseQuality: {
        summary: testCaseQuality.summary,
        weakTestCases: testCaseQuality.weakTestCases
      },
      ai: {
        stats: aiStats,
        recommendations: aiRecommendations,
        insights
      },
      recommendedAdditionalTests: insights?.recommendedAdditionalTests || []
    };
  }
}

export function createDashboardService({
  scanService,
  pool,
  requirementCoverageService,
  testCaseService,
  aiInsightService
}) {
  return new DashboardService(scanService, new ScanRepository(pool), {
    requirementCoverageService,
    testCaseService,
    aiInsightService
  });
}
