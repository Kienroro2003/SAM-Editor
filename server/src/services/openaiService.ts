import axios from 'axios';

import type { ParseResponse } from '@/services/pythonService';

export interface TestCase {
  id: string;
  title: string;
  pathLabel: string;
  code: string;
}

export interface AISuggestion {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  line: number;
}

export interface AIResult {
  testCases: TestCase[];
  suggestions: AISuggestion[];
}

export type AIServiceErrorCode = 'AI_QUOTA_EXCEEDED' | 'AI_REQUEST_FAILED' | 'AI_UNAVAILABLE';

export class AIServiceError extends Error {
  readonly code: AIServiceErrorCode;
  readonly statusCode?: number;

  constructor(message: string, code: AIServiceErrorCode, statusCode?: number) {
    super(message);
    this.name = 'AIServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL_CANDIDATES = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
];

const stringifyPayload = (payload: unknown): string => {
  if (typeof payload === 'string') {
    return payload;
  }

  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
};

const extractGroqMessage = (payload: unknown): string => {
  if (payload && typeof payload === 'object') {
    const errorNode = (payload as { error?: { message?: unknown; code?: unknown } }).error;

    if (errorNode) {
      if (typeof errorNode.message === 'string') {
        return errorNode.message;
      }

      if (typeof errorNode.code === 'string') {
        return errorNode.code;
      }
    }
  }

  return stringifyPayload(payload);
};

const isQuotaExceeded = (statusCode: number | undefined, payloadMessage: string): boolean => {
  if (statusCode === 429) {
    return true;
  }

  return /quota\s*exceeded|rate\s*limit|too\s*many\s*requests/i.test(payloadMessage);
};

const extractJsonFromText = (text: string): string => {
  const trimmed = text.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');

  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
};

const requestGroq = async (apiKey: string, model: string, prompt: string): Promise<string> => {
  const response = await axios.post(
    `${GROQ_BASE_URL}/chat/completions`,
    {
      model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: {
        type: 'json_object',
      },
      temperature: 0.2,
      max_tokens: 2000,
    },
    {
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
  );

  return response.data?.choices?.[0]?.message?.content || '';
};

export const generateTestsAndSuggestions = async (
  code: string,
  language: string,
  parseResult: ParseResponse,
): Promise<AIResult> => {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    const configuredModel = process.env.GROQ_MODEL;

    if (!apiKey) {
      throw new Error('Missing GROQ_API_KEY');
    }

    const modelCandidates = configuredModel
      ? [configuredModel, ...DEFAULT_MODEL_CANDIDATES.filter((m) => m !== configuredModel)]
      : DEFAULT_MODEL_CANDIDATES;

    const prompt = `You are an expert software testing engineer and code quality analyst.
You analyze source code and generate unit tests based on control flow paths.
Always respond with valid JSON only. No markdown, no explanation outside JSON.

Analyze this ${language} source code and its control flow analysis results.

SOURCE CODE:
${code}

CONTROL FLOW ANALYSIS:
- Cyclomatic Complexity: ${parseResult.cyclomaticComplexity}
- Functions found: ${JSON.stringify(parseResult.functions)}
- Total paths: ${parseResult.paths.length}
- Paths: ${JSON.stringify(parseResult.paths)}

Generate a response in this EXACT JSON format:
{
  "testCases": [
    {
      "id": "tc-1",
      "title": "descriptive test name",
      "pathLabel": "Path X → description of branch",
      "code": "the actual test code as a string"
    }
  ],
  "suggestions": [
    {
      "id": "sg-1",
      "severity": "high|medium|low",
      "title": "short issue title",
      "description": "explanation of the issue and how to fix it",
      "line": 0
    }
  ]
}

Rules:
- Generate 1 test case per unique path (max 10)
- Test code must be in ${language} using appropriate test framework
  (Jest for JS/TS, pytest for Python, JUnit for Java)
- Suggestions focus on: untested branches, high CC, dead code, missing error handling
- severity: 'high' for untested critical paths, 'medium' for style/quality, 'low' for optimization
- line numbers are estimates based on code structure (0 if unknown)
- Return ONLY the JSON object, nothing else`;

    let content = '';
    let lastError: unknown = null;

    for (const model of modelCandidates) {
      try {
        content = await requestGroq(apiKey, model, prompt);
        break;
      } catch (error) {
        lastError = error;

        const modelUnavailable =
          axios.isAxiosError(error) &&
          (error.response?.status === 404 ||
            /model|not found|decommissioned|not available/i.test(
              extractGroqMessage(error.response?.data),
            ));

        if (!modelUnavailable) {
          throw error;
        }
      }
    }

    if (!content) {
      throw lastError instanceof Error
        ? lastError
        : new Error('No available Groq model could be used');
    }

    try {
      const parsed = JSON.parse(extractJsonFromText(content)) as AIResult;

      return {
        testCases: Array.isArray(parsed.testCases) ? parsed.testCases : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      };
    } catch {
      return {
        testCases: [],
        suggestions: [],
      };
    }
  } catch (error) {
    if (error instanceof AIServiceError) {
      throw error;
    }

    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      const payloadMessage = extractGroqMessage(error.response?.data);
      const fallbackMessage = payloadMessage && payloadMessage !== 'undefined' ? payloadMessage : error.message;

      if (isQuotaExceeded(statusCode, payloadMessage)) {
        throw new AIServiceError(
          'Groq API quota/rate limit exceeded. Analysis metrics are still available, but AI-generated test cases and suggestions are temporarily disabled. Please check plan/billing at https://console.groq.com/',
          'AI_QUOTA_EXCEEDED',
          statusCode,
        );
      }

      if (statusCode === 401 || statusCode === 403) {
        throw new AIServiceError(
          'Groq API key is invalid or missing required permissions. Please verify GROQ_API_KEY and API access.',
          'AI_REQUEST_FAILED',
          statusCode,
        );
      }

      throw new AIServiceError(
        `Groq request failed (${statusCode ?? 'no-status'}): ${fallbackMessage}`,
        'AI_REQUEST_FAILED',
        statusCode,
      );
    }

    throw new AIServiceError(
      error instanceof Error ? error.message : 'Unknown AI service error',
      'AI_UNAVAILABLE',
    );
  }
};
