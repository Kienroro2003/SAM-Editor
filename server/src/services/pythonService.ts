import axios from 'axios';

export interface CFGNode {
  id: string;
  label: string;
  type: string;
}

export interface CFGEdge {
  source: string;
  target: string;
  label: string;
}

export interface ParseResponse {
  success: boolean;
  language: string;
  cyclomaticComplexity: number;
  nodes: CFGNode[];
  edges: CFGEdge[];
  paths: string[][];
  functions: string[];
  error?: string;
}

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL;

export const parseCode = async (
  code: string,
  language: string,
): Promise<ParseResponse> => {
  try {
    if (!PYTHON_SERVICE_URL) {
      throw new Error('Analysis service unavailable');
    }

    const response = await axios.post<ParseResponse>(
      `${PYTHON_SERVICE_URL}/parse`,
      { code, language },
      { timeout: 30_000 },
    );

    const parseResult = response.data;

    if (!parseResult.success) {
      throw new Error(parseResult.error || 'Parsing failed');
    }

    return parseResult;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error('Analysis service unavailable');
    }

    throw error;
  }
};
