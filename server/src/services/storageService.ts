import axios from 'axios';

const MAX_FILE_CHARS = 500_000;

const extensionToLanguageMap: Record<string, string> = {
  '.js': 'javascript',
  '.ts': 'typescript',
  '.py': 'python',
  '.java': 'java',
  '.c': 'cpp',
  '.cpp': 'cpp',
};

export const fetchFileFromUrl = async (fileUrl: string): Promise<string> => {
  try {
    const response = await axios.get<string>(fileUrl, { responseType: 'text' });
    const content = response.data;

    if (content.length > MAX_FILE_CHARS) {
      throw new Error('File too large. Max 500KB.');
    }

    return content;
  } catch (error) {
    if (error instanceof Error && error.message === 'File too large. Max 500KB.') {
      throw error;
    }

    throw new Error('Failed to fetch file from URL');
  }
};

export const validateFileType = (filename: string): string => {
  try {
    const lastDotIndex = filename.lastIndexOf('.');
    const ext = lastDotIndex >= 0 ? filename.slice(lastDotIndex).toLowerCase() : '';

    const language = extensionToLanguageMap[ext];

    if (!language) {
      throw new Error(`Unsupported file type: ${ext || '(none)'}`);
    }

    return language;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unsupported file type:')) {
      throw error;
    }

    throw new Error('Unsupported file type: (invalid filename)');
  }
};
