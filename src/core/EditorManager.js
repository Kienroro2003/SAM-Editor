/**
 * Editor Manager — Manages Monaco Editor models and state for multiple open files.
 */
export class EditorManager {
    constructor() {
        /** @type {import('monaco-editor').editor.IStandaloneCodeEditor | null} */
        this.editor = null;
        /** Map of file path → { model, viewState } */
        this.openFiles = new Map();
        /** Currently active file path */
        this.activeFile = null;
        this._listeners = {};
    }

    on(event, fn) {
        (this._listeners[event] ||= []).push(fn);
    }

    emit(event, ...args) {
        (this._listeners[event] || []).forEach(fn => fn(...args));
    }

    /**
     * Initialize the Monaco Editor inside the given container element.
     */
    init(container, monaco) {
        this.monaco = monaco;
        this.editor = monaco.editor.create(container, {
            value: '',
            language: 'plaintext',
            theme: 'vs-dark',
            automaticLayout: true,
            fontSize: 14,
            fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
            fontLigatures: true,
            minimap: { enabled: true, scale: 1 },
            scrollBeyondLastLine: true,
            smoothScrolling: true,
            cursorSmoothCaretAnimation: 'on',
            cursorBlinking: 'smooth',
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
            guides: {
                bracketPairs: true,
                indentation: true
            },
            padding: { top: 8 },
            lineNumbersMinChars: 4,
            glyphMargin: false,
            folding: true,
            links: true,
            wordWrap: 'off',
            suggestOnTriggerCharacters: true,
            quickSuggestions: true,
            parameterHints: { enabled: true },
            tabSize: 2,
            insertSpaces: true,
            renderLineHighlight: 'all',
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            scrollbar: {
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
                useShadows: false
            }
        });

        // Track cursor position changes
        this.editor.onDidChangeCursorPosition((e) => {
            this.emit('cursorChanged', {
                lineNumber: e.position.lineNumber,
                column: e.position.column
            });
        });

        // Track content changes
        this.editor.onDidChangeModelContent(() => {
            if (this.activeFile) {
                this.emit('contentChanged', this.activeFile);
            }
        });
    }

    /**
     * Get the Monaco language ID for a file extension.
     */
    getLanguage(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const langMap = {
            'js': 'javascript',
            'jsx': 'javascript',
            'ts': 'typescript',
            'tsx': 'typescript',
            'html': 'html',
            'htm': 'html',
            'css': 'css',
            'scss': 'scss',
            'less': 'less',
            'json': 'json',
            'md': 'markdown',
            'py': 'python',
            'rb': 'ruby',
            'go': 'go',
            'rs': 'rust',
            'java': 'java',
            'c': 'c',
            'cpp': 'cpp',
            'h': 'c',
            'hpp': 'cpp',
            'cs': 'csharp',
            'php': 'php',
            'sql': 'sql',
            'xml': 'xml',
            'yaml': 'yaml',
            'yml': 'yaml',
            'toml': 'ini',
            'sh': 'shell',
            'bash': 'shell',
            'zsh': 'shell',
            'bat': 'bat',
            'ps1': 'powershell',
            'dockerfile': 'dockerfile',
            'graphql': 'graphql',
            'svg': 'xml',
            'vue': 'html',
            'swift': 'swift',
            'kt': 'kotlin',
            'dart': 'dart',
            'lua': 'lua',
            'r': 'r'
        };
        return langMap[ext] || 'plaintext';
    }

    /**
     * Get nice language display name
     */
    getLanguageDisplay(filename) {
        const lang = this.getLanguage(filename);
        const displayMap = {
            'javascript': 'JavaScript',
            'typescript': 'TypeScript',
            'html': 'HTML',
            'css': 'CSS',
            'scss': 'SCSS',
            'json': 'JSON',
            'markdown': 'Markdown',
            'python': 'Python',
            'ruby': 'Ruby',
            'go': 'Go',
            'rust': 'Rust',
            'java': 'Java',
            'c': 'C',
            'cpp': 'C++',
            'csharp': 'C#',
            'php': 'PHP',
            'sql': 'SQL',
            'xml': 'XML',
            'yaml': 'YAML',
            'shell': 'Shell Script',
            'plaintext': 'Plain Text',
            'swift': 'Swift',
            'kotlin': 'Kotlin',
            'dart': 'Dart',
            'lua': 'Lua'
        };
        return displayMap[lang] || lang;
    }

    /**
     * Open a file in the editor.
     */
    openFile(path, content, filename) {
        if (!this.editor || !this.monaco) return;

        // Save current view state before switching
        if (this.activeFile && this.openFiles.has(this.activeFile)) {
            const current = this.openFiles.get(this.activeFile);
            current.viewState = this.editor.saveViewState();
        }

        // Reuse existing model or create new one
        if (!this.openFiles.has(path)) {
            const language = this.getLanguage(filename);
            const uri = this.monaco.Uri.parse('file://' + path);
            let model = this.monaco.editor.getModel(uri);
            if (!model) {
                model = this.monaco.editor.createModel(content, language, uri);
            }
            this.openFiles.set(path, { model, viewState: null, filename });
        }

        const fileData = this.openFiles.get(path);
        this.editor.setModel(fileData.model);

        // Restore view state
        if (fileData.viewState) {
            this.editor.restoreViewState(fileData.viewState);
        }

        this.activeFile = path;
        this.editor.focus();
        this.emit('fileOpened', path);
    }

    /**
     * Close a file.
     */
    closeFile(path) {
        const fileData = this.openFiles.get(path);
        if (!fileData) return;

        fileData.model.dispose();
        this.openFiles.delete(path);

        if (this.activeFile === path) {
            // Switch to another open file or clear
            const remaining = [...this.openFiles.keys()];
            if (remaining.length > 0) {
                const nextPath = remaining[remaining.length - 1];
                const nextData = this.openFiles.get(nextPath);
                this.editor.setModel(nextData.model);
                if (nextData.viewState) {
                    this.editor.restoreViewState(nextData.viewState);
                }
                this.activeFile = nextPath;
            } else {
                this.editor.setModel(null);
                this.activeFile = null;
            }
        }

        this.emit('fileClosed', path);
        return this.activeFile;
    }

    /**
     * Get current editor content for the active file.
     */
    getContent(path) {
        const fileData = this.openFiles.get(path || this.activeFile);
        return fileData ? fileData.model.getValue() : null;
    }

    /**
     * Check if a file is open.
     */
    isOpen(path) {
        return this.openFiles.has(path);
    }

    /**
     * Get list of open file paths.
     */
    getOpenFiles() {
        return [...this.openFiles.keys()];
    }

    /**
     * Update the file path when a file is renamed.
     */
    updateFilePath(oldPath, newPath, newFilename) {
        const data = this.openFiles.get(oldPath);
        if (!data) return;

        const language = this.getLanguage(newFilename);
        const uri = this.monaco.Uri.parse('file://' + newPath);
        const content = data.model.getValue();
        data.model.dispose();

        const newModel = this.monaco.editor.createModel(content, language, uri);
        this.openFiles.delete(oldPath);
        this.openFiles.set(newPath, { model: newModel, viewState: data.viewState, filename: newFilename });

        if (this.activeFile === oldPath) {
            this.activeFile = newPath;
            this.editor.setModel(newModel);
        }

        this.emit('filePathUpdated', { oldPath, newPath });
    }

    dispose() {
        this.openFiles.forEach(data => data.model.dispose());
        this.openFiles.clear();
        if (this.editor) {
            this.editor.dispose();
        }
    }
}
