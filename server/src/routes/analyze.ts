import { Router } from 'express';

import verifyFirebaseToken from '@/middleware/auth';
import { firestoreService } from '@/services/firestoreService';
import { AIServiceError, generateTestsAndSuggestions } from '@/services/openaiService';
import { parseCode } from '@/services/pythonService';
import { fetchFileFromUrl, validateFileType } from '@/services/storageService';

const router = Router();

const estimateStatementCoverage = (cc: number): number => {
  if (cc <= 5) {
    return 85;
  }

  if (cc <= 10) {
    return 70;
  }

  if (cc <= 20) {
    return 55;
  }

  return 35;
};

const estimateBranchCoverage = (pathCount: number, nodeCount: number): number => {
  const raw = (pathCount / (nodeCount || 1)) * 100;
  return Math.min(95, Math.round(raw));
};

const estimateFunctionCoverage = (): number => {
  return 75 + Math.floor(Math.random() * 20);
};

router.post('/', verifyFirebaseToken, async (req, res) => {
  try {
    const { fileUrl, filename, language: languageOverride } = req.body as {
      fileUrl?: string;
      filename?: string;
      language?: string;
    };

    if (!fileUrl || !filename) {
      res.status(400).json({
        success: false,
        error: 'fileUrl and filename are required',
      });
      return;
    }

    let code: string;
    try {
      code = await fetchFileFromUrl(fileUrl);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch file from URL',
      });
      return;
    }

    let detectedLanguage: string;
    try {
      detectedLanguage = validateFileType(filename);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unsupported file type',
      });
      return;
    }

    const language = languageOverride || detectedLanguage;

    let parseResult;
    try {
      parseResult = await parseCode(code, language);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis service unavailable';
      const statusCode = message === 'Analysis service unavailable' ? 503 : 500;

      res.status(statusCode).json({
        success: false,
        error: message,
      });
      return;
    }

    let aiWarning: string | null = null;
    let aiResult = {
      testCases: [],
      suggestions: [],
    };

    try {
      aiResult = await generateTestsAndSuggestions(code, language, parseResult);
    } catch (error) {
      if (error instanceof AIServiceError && error.code === 'AI_QUOTA_EXCEEDED') {
        aiWarning = error.message;
      } else {
        res.status(502).json({
          success: false,
          error: error instanceof Error ? error.message : 'AI service error',
        });
        return;
      }

      // Continue returning parser/coverage output when only AI quota is exhausted.
    }

    const statementEstimate = estimateStatementCoverage(parseResult.cyclomaticComplexity);
    const branchEstimate = estimateBranchCoverage(parseResult.paths.length, parseResult.nodes.length);
    const functionEstimate = estimateFunctionCoverage();

    const result = {
      filename,
      language,
      metrics: {
        cyclomaticComplexity: parseResult.cyclomaticComplexity,
        statement: {
          estimated: true,
          value: statementEstimate,
        },
        branch: {
          estimated: true,
          value: branchEstimate,
        },
        function: {
          estimated: true,
          value: functionEstimate,
        },
      },
      cfg: {
        nodes: parseResult.nodes,
        edges: parseResult.edges,
      },
      testCases: aiResult.testCases,
      suggestions: aiResult.suggestions,
      ai: {
        available: !aiWarning,
        warning: aiWarning,
      },
      analyzedAt: new Date().toISOString(),
    };

    try {
      const userId = req.user?.uid;

      if (userId) {
        await firestoreService.saveReport(userId, {
          userId,
          filename,
          language,
          fileUrl,
          metrics: {
            cyclomaticComplexity: parseResult.cyclomaticComplexity,
            statement: statementEstimate,
            branch: branchEstimate,
            function: functionEstimate,
          },
          cfg: {
            nodes: parseResult.nodes,
            edges: parseResult.edges,
          },
          testCases: aiResult.testCases,
          suggestions: aiResult.suggestions,
          analyzedAt: result.analyzedAt,
        });
      }
    } catch {
      // Firestore persistence should not block response
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
    });
  }
});

export default router;
