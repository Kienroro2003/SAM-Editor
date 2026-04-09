/**
 * SAM Code Editor — Main Application Entry Point
 * Wires all components together and handles global keyboard shortcuts.
 */

// Styles
import './styles/index.css';
import './styles/layout.css';
import './styles/sidebar.css';
import './styles/editor.css';
import './styles/terminal.css';
import './styles/command-palette.css';
import './styles/statusbar.css';

// Core
import { FileSystem } from './core/FileSystem.js';
import { EditorManager } from './core/EditorManager.js';

// Components
import { ActivityBar } from './components/ActivityBar.js';
import { FileExplorer } from './components/FileExplorer.js';
import { EditorTabs } from './components/EditorTabs.js';
import { Terminal } from './components/Terminal.js';
import { CommandPalette } from './components/CommandPalette.js';
import { ContextMenu } from './components/ContextMenu.js';
import { AnalyzeToolbar } from './components/AnalyzeToolbar/AnalyzeToolbar.js';
import { RightPanel } from './components/RightPanel/RightPanel.js';
import { CoveragePanel } from './components/CoveragePanel/CoveragePanel.js';

// Data
import { sampleFiles } from './data/sampleFiles.js';

class App {
    constructor() {
        // Core systems
        this.fs = new FileSystem();
        this.editorManager = new EditorManager();

        // UI Components
        this.activityBar = null;
        this.fileExplorer = null;
        this.editorTabs = null;
        this.terminal = null;
        this.commandPalette = null;
        this.contextMenu = null;
        this.analyzeToolbar = null;
        this.rightPanel = null;
        this.coveragePanel = null;
        this.rightPanelHost = null;

        // State
        this.sidebarVisible = true;
        this.panelVisible = true;
        this.panelMaximized = false;

        // SAM analysis state
        this.isRightPanelVisible = false;
        this.isAnalyzing = false;
        this.loadedCode = '';
        this.loadedFilename = '';
        this.analysisResult = null;
        this.rightPanelWidth = 380;

        // DOM elements
        this.editorArea = document.getElementById('editor-area');
        this.editorWelcome = document.getElementById('editor-welcome');
        this.editorContainer = document.getElementById('editor-container');
        this.sidebar = document.getElementById('sidebar');
        this.bottomPanel = document.getElementById('bottom-panel');
        this.statusCursor = document.getElementById('status-cursor');
        this.statusLanguage = document.getElementById('status-language');
        this.statusEncoding = document.getElementById('status-encoding');
        this.statusIndent = document.getElementById('status-indent');

        this.init();
    }

    async init() {
        // Load sample files
        this.fs.loadTree(sampleFiles);

        // Initialize Monaco Editor
        await this._initMonaco();

        // Initialize UI components
        this._initActivityBar();
        this._initFileExplorer();
        this._initEditorTabs();
        this._initTerminal();
        this._initSamAnalysisUI();
        this._initCommandPalette();
        this._initContextMenu();
        this._initResizeHandles();
        this._initPanelTabs();
        this._initGlobalShortcuts();
        this._initTitlebarSearch();

        // Connect editor events to status bar
        this._initStatusBar();
    }

    async _initMonaco() {
        // Dynamic import of Monaco Editor
        const monaco = await import('monaco-editor');

        // Configure Monaco environment for workers
        self.MonacoEnvironment = {
            getWorker(_, label) {
                switch (label) {
                    case 'json':
                        return new Worker(
                            new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url),
                            { type: 'module' }
                        );
                    case 'css':
                    case 'scss':
                    case 'less':
                        return new Worker(
                            new URL('monaco-editor/esm/vs/language/css/css.worker.js', import.meta.url),
                            { type: 'module' }
                        );
                    case 'html':
                    case 'handlebars':
                    case 'razor':
                        return new Worker(
                            new URL('monaco-editor/esm/vs/language/html/html.worker.js', import.meta.url),
                            { type: 'module' }
                        );
                    case 'typescript':
                    case 'javascript':
                        return new Worker(
                            new URL('monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url),
                            { type: 'module' }
                        );
                    default:
                        return new Worker(
                            new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
                            { type: 'module' }
                        );
                }
            }
        };

        this.editorManager.init(this.editorArea, monaco);
    }

    _initActivityBar() {
        this.activityBar = new ActivityBar(document.getElementById('activity-bar'));

        this.activityBar.on('itemClicked', (id) => {
            if (id === 'explorer' || id === 'search' || id === 'git' || id === 'extensions' || id === 'debug') {
                if (this.activityBar.activeItem === id && this.sidebarVisible) {
                    // Already active, toggle sidebar off
                    // (Actually ActivityBar.setActive already set it, but we can toggle)
                }
                this.sidebarVisible = true;
                this.sidebar.classList.remove('collapsed');
                this._updateSidebarTitle(id);
            } else if (id === 'settings') {
                this.commandPalette.open();
            } else if (id === 'sam-analysis') {
                this._toggleRightPanel();
            }
        });
    }

    _initSamAnalysisUI() {
        // Analyze toolbar injected directly above Monaco editor (below the tab bar)
        const tabsEl = document.getElementById('editor-tabs');
        const toolbarHost = document.createElement('div');
        toolbarHost.id = 'analyze-toolbar-host';
        toolbarHost.style.flexShrink = '0';
        tabsEl?.insertAdjacentElement('afterend', toolbarHost);

        this.analyzeToolbar = new AnalyzeToolbar(toolbarHost, {
            onAnalyze: (code, filename, language) => this._runMockAnalysis(code, filename, language),
            onCodeLoad: (code, filename, language) => this._onCodeLoad(code, filename, language),
            isAnalyzing: () => this.isAnalyzing
        });

        // Right panel (absolute overlay that offsets Monaco via margin-right)
        const rpHost = document.createElement('div');
        rpHost.id = 'sam-right-panel';
        this.editorContainer.style.position = 'relative';
        this.editorContainer.appendChild(rpHost);
        this.rightPanelHost = rpHost;

        this.rightPanel = new RightPanel(rpHost, {
            testCases: [],
            suggestions: [],
            isVisible: false,
            onClose: () => this._hideRightPanel(),
            onWidthChange: (w) => {
                this.rightPanelWidth = w;
                if (this.isRightPanelVisible) this._applyRightPanelLayout();
            }
        });

        // Coverage panel view in bottom panel
        const covEl = document.getElementById('coverage-container');
        if (covEl) {
            this.coveragePanel = new CoveragePanel(covEl);
        }
    }

    _onCodeLoad(code, filename, language) {
        this.loadedCode = code;
        this.loadedFilename = filename;

        // Open as a virtual in-memory file (does not touch workspace FileSystem)
        const virtualPath = `/__import__/${filename}`;
        this.editorManager.openFile(virtualPath, code, filename);
        this.editorTabs.addTab(virtualPath, filename);

        // Show editor, hide welcome (same behavior as normal file open)
        this.editorArea.classList.add('active');
        this.editorWelcome.classList.add('hidden');
        this.statusLanguage.textContent = this.editorManager.getLanguageDisplay(filename);
    }

    _toggleRightPanel() {
        this.isRightPanelVisible = !this.isRightPanelVisible;
        this.rightPanel?.setVisible(this.isRightPanelVisible);
        this.activityBar?.setSamAnalysisActive(this.isRightPanelVisible);
        this._applyRightPanelLayout();
    }

    _showRightPanel() {
        this.isRightPanelVisible = true;
        this.rightPanel?.setVisible(true);
        this.activityBar?.setSamAnalysisActive(true);
        this._applyRightPanelLayout();
    }

    _hideRightPanel() {
        this.isRightPanelVisible = false;
        this.rightPanel?.setVisible(false);
        this.activityBar?.setSamAnalysisActive(false);
        this._applyRightPanelLayout();
    }

    _applyRightPanelLayout() {
        const mr = this.isRightPanelVisible ? `${this.rightPanelWidth}px` : '0px';
        this.editorArea.style.marginRight = mr;
        const welcome = document.getElementById('editor-welcome');
        const tabs = document.getElementById('editor-tabs');
        const toolbar = document.getElementById('analyze-toolbar-host');
        if (welcome) welcome.style.marginRight = mr;
        if (tabs) tabs.style.marginRight = mr;
        if (toolbar) toolbar.style.marginRight = mr;

        if (this.rightPanelHost) {
            const bottomOffset = (this.panelVisible && !this.bottomPanel.classList.contains('collapsed'))
                ? `${this.bottomPanel.offsetHeight}px`
                : '0px';
            this.rightPanelHost.style.bottom = bottomOffset;
        }
        requestAnimationFrame(() => {
            try { this.editorManager?.editor?.layout(); } catch (e) { /* ignore */ }
        });
    }

    _activateBottomPanelTab(panelId) {
        const panelTabs = document.querySelectorAll('.panel-tab');
        const panelViews = document.querySelectorAll('.panel-view');

        panelTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.panel === panelId));
        panelViews.forEach(v => v.classList.toggle('active', v.id === `${panelId}-container`));

        if (panelId === 'terminal') {
            requestAnimationFrame(() => this.terminal.fit());
        }
    }

    _runMockAnalysis(code, filename, language) {
        if (!filename || !code) return;
        if (this.isAnalyzing) return;

        this.isAnalyzing = true;
        this.coveragePanel?.setAnalyzing(true);

        const MOCK_RESULT = {
            metrics: {
                statement: 72,
                branch: 58,
                function: 85,
                cyclomaticComplexity: 12,
                analyzedAt: new Date().toISOString(),
                filename: this.loadedFilename,
            },
            testCases: [
                {
                    id: '1',
                    title: 'should return null when input is empty',
                    pathLabel: 'Path 1 → false branch',
                    code: 'test(\"should return null when input is empty\", () => {\\n  expect(myFunc(\"\")).toBeNull();\\n});',
                },
                {
                    id: '2',
                    title: 'should handle valid user object',
                    pathLabel: 'Path 2 → true branch',
                    code: 'test(\"should handle valid user object\", () => {\\n  const result = myFunc({ id: 1 });\\n  expect(result).toBeDefined();\\n});',
                },
                {
                    id: '3',
                    title: 'should throw on null input',
                    pathLabel: 'Path 3 → exception path',
                    code: 'test(\"should throw on null input\", () => {\\n  expect(() => myFunc(null)).toThrow();\\n});',
                },
            ],
            suggestions: [
                {
                    id: '1',
                    severity: 'high',
                    title: 'Untested branch in handleLogin()',
                    description: 'The false branch of the authentication check is never covered. Add a test for failed login scenarios.',
                    line: 42,
                },
                {
                    id: '2',
                    severity: 'medium',
                    title: 'Missing edge case in validateEmail()',
                    description: 'No test covers empty string or null input for this function.',
                    line: 17,
                },
                {
                    id: '3',
                    severity: 'low',
                    title: 'Redundant condition on line 88',
                    description: 'This condition is always true based on prior guards. Consider simplifying.',
                    line: 88,
                },
            ],
        };

        window.setTimeout(() => {
            this.analysisResult = MOCK_RESULT;
            this.isAnalyzing = false;

            this.rightPanel?.setData({
                testCases: MOCK_RESULT.testCases,
                suggestions: MOCK_RESULT.suggestions
            });
            this.coveragePanel?.setMetrics(MOCK_RESULT.metrics);
            this.coveragePanel?.setAnalyzing(false);

            this._showRightPanel();
            this._activateBottomPanelTab('coverage');
        }, 1500);
    }

    _updateSidebarTitle(id) {
        const titleMap = {
            'explorer': 'EXPLORER',
            'search': 'SEARCH',
            'git': 'SOURCE CONTROL',
            'debug': 'RUN AND DEBUG',
            'extensions': 'EXTENSIONS'
        };
        const titleEl = document.querySelector('.sidebar-title');
        if (titleEl) {
            titleEl.textContent = titleMap[id] || 'EXPLORER';
        }
    }

    _initFileExplorer() {
        this.fileExplorer = new FileExplorer(
            document.getElementById('file-explorer'),
            this.fs
        );

        // Open file on click
        this.fileExplorer.on('fileSelected', (node) => {
            this._openFile(node.path, node.name);
        });

        this.fileExplorer.on('fileOpened', (node) => {
            this._openFile(node.path, node.name);
        });

        // Context menu
        this.fileExplorer.on('contextMenu', ({ node, x, y }) => {
            this._showFileContextMenu(node, x, y);
        });

        // New file / folder buttons
        document.getElementById('btn-new-file').addEventListener('click', () => {
            this._promptNewFile();
        });

        document.getElementById('btn-new-folder').addEventListener('click', () => {
            this._promptNewFolder();
        });

        document.getElementById('btn-collapse-all').addEventListener('click', () => {
            this.fileExplorer.collapseAll();
        });
    }

    _openFile(path, filename) {
        const content = this.fs.readFile(path);
        this.editorManager.openFile(path, content, filename);
        this.editorTabs.addTab(path, filename);

        // Show editor, hide welcome
        this.editorArea.classList.add('active');
        this.editorWelcome.classList.add('hidden');

        // Highlight in file explorer
        this.fileExplorer.expandTo(path);
    }

    _initEditorTabs() {
        this.editorTabs = new EditorTabs(document.getElementById('editor-tabs'));

        this.editorTabs.on('tabActivated', (path) => {
            const tab = this.editorTabs.getTab(path);
            if (tab) {
                const content = this.fs.readFile(path);
                this.editorManager.openFile(path, content, tab.filename);
                this.editorArea.classList.add('active');
                this.editorWelcome.classList.add('hidden');
                this.fileExplorer.expandTo(path);
            }
        });

        this.editorTabs.on('tabCloseRequested', (path) => {
            this._closeFile(path);
        });

        this.editorTabs.on('allTabsClosed', () => {
            this.editorArea.classList.remove('active');
            this.editorWelcome.classList.remove('hidden');
            this._updateStatusBar(null);
        });
    }

    _closeFile(path) {
        // Check if file is modified
        const tab = this.editorTabs.getTab(path);
        if (tab && tab.modified) {
            // Save content to FS before closing
            const content = this.editorManager.getContent(path);
            if (content !== null) {
                this.fs.writeFile(path, content);
                this.fs.saveFile(path);
            }
        }

        this.editorTabs.removeTab(path);
        const nextFile = this.editorManager.closeFile(path);

        if (!nextFile) {
            this.editorArea.classList.remove('active');
            this.editorWelcome.classList.remove('hidden');
        }
    }

    _initTerminal() {
        this.terminal = new Terminal(document.getElementById('terminal-container'));

        // Panel close
        document.getElementById('btn-panel-close').addEventListener('click', () => {
            this.panelVisible = false;
            this.bottomPanel.classList.add('collapsed');
            this._applyRightPanelLayout();
        });

        // Panel maximize
        document.getElementById('btn-panel-maximize').addEventListener('click', () => {
            this.panelMaximized = !this.panelMaximized;
            if (this.panelMaximized) {
                this.bottomPanel.style.height = '70%';
            } else {
                this.bottomPanel.style.height = '';
            }
            this.terminal.fit();
            this._applyRightPanelLayout();
        });
    }

    _initPanelTabs() {
        const panelTabs = document.querySelectorAll('.panel-tab');
        const panelViews = document.querySelectorAll('.panel-view');

        panelTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.panel;

                panelTabs.forEach(t => t.classList.toggle('active', t === tab));
                panelViews.forEach(v => v.classList.toggle('active', v.id === `${target}-container`));

                if (target === 'terminal') {
                    requestAnimationFrame(() => this.terminal.fit());
                }
            });
        });
    }

    _initCommandPalette() {
        this.commandPalette = new CommandPalette();

        this.commandPalette.registerCommands([
            {
                label: 'View: Toggle Sidebar Visibility',
                keybinding: 'Ctrl + B',
                action: () => this._toggleSidebar()
            },
            {
                label: 'View: Toggle Terminal',
                keybinding: 'Ctrl + `',
                action: () => this._togglePanel()
            },
            {
                label: 'File: New File',
                keybinding: 'Ctrl + N',
                action: () => this._promptNewFile()
            },
            {
                label: 'File: Save',
                keybinding: 'Ctrl + S',
                action: () => this._saveActiveFile()
            },
            {
                label: 'File: Save All',
                keybinding: 'Ctrl + Shift + S',
                action: () => this._saveAllFiles()
            },
            {
                label: 'File: Close Editor',
                keybinding: 'Ctrl + W',
                action: () => {
                    if (this.editorManager.activeFile) {
                        this._closeFile(this.editorManager.activeFile);
                    }
                }
            },
            {
                label: 'View: Zoom In',
                keybinding: 'Ctrl + =',
                action: () => {
                    document.body.style.fontSize = (parseFloat(getComputedStyle(document.body).fontSize) + 1) + 'px';
                }
            },
            {
                label: 'View: Zoom Out',
                keybinding: 'Ctrl + -',
                action: () => {
                    document.body.style.fontSize = (parseFloat(getComputedStyle(document.body).fontSize) - 1) + 'px';
                }
            },
            {
                label: 'View: Reset Zoom',
                keybinding: 'Ctrl + 0',
                action: () => {
                    document.body.style.fontSize = '';
                }
            },
            {
                label: 'Terminal: Clear Terminal',
                action: () => this.terminal.clear()
            },
            {
                label: 'Terminal: Focus Terminal',
                action: () => {
                    this.panelVisible = true;
                    this.bottomPanel.classList.remove('collapsed');
                    this.terminal.focus();
                }
            },
            {
                label: 'Editor: Toggle Word Wrap',
                keybinding: 'Alt + Z',
                action: () => {
                    if (this.editorManager.editor) {
                        const current = this.editorManager.editor.getOption(
                            this.editorManager.monaco.editor.EditorOption.wordWrap
                        );
                        this.editorManager.editor.updateOptions({
                            wordWrap: current === 'off' ? 'on' : 'off'
                        });
                    }
                }
            },
            {
                label: 'Editor: Toggle Minimap',
                action: () => {
                    if (this.editorManager.editor) {
                        const current = this.editorManager.editor.getOption(
                            this.editorManager.monaco.editor.EditorOption.minimap
                        );
                        this.editorManager.editor.updateOptions({
                            minimap: { enabled: !current.enabled }
                        });
                    }
                }
            },
            {
                label: 'Editor: Format Document',
                keybinding: 'Shift + Alt + F',
                action: () => {
                    if (this.editorManager.editor) {
                        this.editorManager.editor.getAction('editor.action.formatDocument')?.run();
                    }
                }
            },
            {
                label: 'Preferences: Color Theme',
                keybinding: 'Ctrl + K, Ctrl + T',
                action: () => {
                    // Toggle between vs-dark and hc-black
                    if (this.editorManager.monaco) {
                        const currentTheme = document.body.dataset.theme || 'vs-dark';
                        const newTheme = currentTheme === 'vs-dark' ? 'hc-black' : 'vs-dark';
                        this.editorManager.monaco.editor.setTheme(newTheme);
                        document.body.dataset.theme = newTheme;
                    }
                }
            },
            {
                label: 'Explorer: Collapse All Folders',
                action: () => this.fileExplorer.collapseAll()
            },
            {
                label: 'View: Toggle Full Screen',
                keybinding: 'F11',
                action: () => {
                    if (document.fullscreenElement) {
                        document.exitFullscreen();
                    } else {
                        document.documentElement.requestFullscreen();
                    }
                }
            }
        ]);
    }

    _initContextMenu() {
        this.contextMenu = new ContextMenu();
    }

    _showFileContextMenu(node, x, y) {
        const isDir = node.type === 'directory';
        const items = [];

        if (isDir) {
            items.push({
                label: 'New File...',
                action: () => this._promptNewFile(node.path)
            });
            items.push({
                label: 'New Folder...',
                action: () => this._promptNewFolder(node.path)
            });
            items.push({ separator: true });
        }

        if (!isDir) {
            items.push({
                label: 'Open File',
                action: () => this._openFile(node.path, node.name)
            });
            items.push({ separator: true });
        }

        items.push({
            label: 'Rename...',
            shortcut: 'F2',
            action: () => this._promptRename(node)
        });

        items.push({
            label: 'Delete',
            shortcut: 'Del',
            action: () => this._deleteNode(node)
        });

        items.push({ separator: true });
        items.push({
            label: 'Copy Path',
            action: () => navigator.clipboard?.writeText(node.path)
        });
        items.push({
            label: 'Copy Relative Path',
            action: () => navigator.clipboard?.writeText(node.path.replace(/^\//, ''))
        });

        this.contextMenu.show(x, y, items);
    }

    _promptNewFile(parentPath = null) {
        const targetDir = parentPath || (this.fileExplorer.selectedPath
            ? (this.fs.resolve(this.fileExplorer.selectedPath)?.type === 'directory'
                ? this.fileExplorer.selectedPath
                : this._getParentPath(this.fileExplorer.selectedPath))
            : '');

        this._showInputDialog('New File Name:', '', (name) => {
            if (name) {
                try {
                    const path = targetDir ? `${targetDir}/${name}` : name;
                    this.fs.createFile(path, '');
                    this.fileExplorer.expandTo(path.startsWith('/') ? path : '/' + path);
                    this._openFile('/' + path.replace(/^\//, ''), name);
                } catch (e) {
                    console.error('Failed to create file:', e);
                }
            }
        });
    }

    _promptNewFolder(parentPath = null) {
        const targetDir = parentPath || (this.fileExplorer.selectedPath
            ? (this.fs.resolve(this.fileExplorer.selectedPath)?.type === 'directory'
                ? this.fileExplorer.selectedPath
                : this._getParentPath(this.fileExplorer.selectedPath))
            : '');

        this._showInputDialog('New Folder Name:', '', (name) => {
            if (name) {
                try {
                    const path = targetDir ? `${targetDir}/${name}` : name;
                    this.fs.createDirectory(path);
                    if (targetDir) this.fileExplorer.expandedDirs.add(targetDir);
                    this.fileExplorer.render();
                } catch (e) {
                    console.error('Failed to create folder:', e);
                }
            }
        });
    }

    _promptRename(node) {
        this._showInputDialog('Rename:', node.name, (newName) => {
            if (newName && newName !== node.name) {
                try {
                    const oldPath = node.path;
                    this.fs.rename(node.path, newName);
                    // Update tabs and editor
                    if (this.editorManager.isOpen(oldPath)) {
                        const newPath = node.path;
                        this.editorManager.updateFilePath(oldPath, newPath, newName);
                        this.editorTabs.updateTabPath(oldPath, newPath, newName);
                    }
                    this.fileExplorer.render();
                } catch (e) {
                    console.error('Failed to rename:', e);
                }
            }
        });
    }

    _deleteNode(node) {
        try {
            // Close file in editor if open
            if (node.type === 'file' && this.editorManager.isOpen(node.path)) {
                this.editorTabs.removeTab(node.path);
                this.editorManager.closeFile(node.path);
            }
            this.fs.delete(node.path);
        } catch (e) {
            console.error('Failed to delete:', e);
        }
    }

    _showInputDialog(placeholder, defaultValue, callback) {
        const dialog = document.getElementById('input-dialog');
        const input = document.getElementById('input-dialog-field');
        const backdrop = dialog.querySelector('.input-dialog-backdrop');

        input.value = defaultValue;
        input.placeholder = placeholder;
        dialog.classList.remove('hidden');

        // Position near the active tree item
        const dialogContent = dialog.querySelector('.input-dialog-content');
        const selectedItem = document.querySelector('.tree-item.selected');
        if (selectedItem) {
            const rect = selectedItem.getBoundingClientRect();
            dialogContent.style.left = `${rect.left}px`;
            dialogContent.style.top = `${rect.bottom + 2}px`;
            dialogContent.style.width = `${Math.max(rect.width, 200)}px`;
        } else {
            dialogContent.style.left = '80px';
            dialogContent.style.top = '100px';
            dialogContent.style.width = '250px';
        }

        requestAnimationFrame(() => {
            input.focus();
            if (defaultValue) {
                // Select filename without extension
                const dotIdx = defaultValue.lastIndexOf('.');
                if (dotIdx > 0) {
                    input.setSelectionRange(0, dotIdx);
                } else {
                    input.select();
                }
            }
        });

        const cleanup = () => {
            dialog.classList.add('hidden');
            input.removeEventListener('keydown', onKeyDown);
            backdrop.removeEventListener('click', onClose);
        };

        const onClose = () => {
            cleanup();
        };

        const onKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const value = input.value.trim();
                cleanup();
                callback(value);
            } else if (e.key === 'Escape') {
                cleanup();
            }
        };

        input.addEventListener('keydown', onKeyDown);
        backdrop.addEventListener('click', onClose);
    }

    _getParentPath(path) {
        const parts = path.replace(/^\//, '').split('/');
        parts.pop();
        return parts.length > 0 ? '/' + parts.join('/') : '';
    }

    _initResizeHandles() {
        // Sidebar resize
        const sidebarHandle = document.getElementById('sidebar-resize-handle');
        let isResizingSidebar = false;

        sidebarHandle.addEventListener('mousedown', (e) => {
            isResizingSidebar = true;
            sidebarHandle.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            const onMove = (e) => {
                if (!isResizingSidebar) return;
                const activityBarWidth = 48;
                const newWidth = Math.max(150, Math.min(600, e.clientX - activityBarWidth));
                this.sidebar.style.width = `${newWidth}px`;
            };

            const onUp = () => {
                isResizingSidebar = false;
                sidebarHandle.classList.remove('active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        // Panel resize
        const panelHandle = document.getElementById('panel-resize-handle');
        let isResizingPanel = false;

        panelHandle.addEventListener('mousedown', (e) => {
            isResizingPanel = true;
            panelHandle.classList.add('active');
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';

            const startY = e.clientY;
            const startHeight = this.bottomPanel.offsetHeight;

            const onMove = (e) => {
                if (!isResizingPanel) return;
                const delta = startY - e.clientY;
                const newHeight = Math.max(100, Math.min(window.innerHeight * 0.7, startHeight + delta));
                this.bottomPanel.style.height = `${newHeight}px`;
            };

            const onUp = () => {
                isResizingPanel = false;
                panelHandle.classList.remove('active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                this.terminal.fit();
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    _initStatusBar() {
        this.editorManager.on('cursorChanged', ({ lineNumber, column }) => {
            this.statusCursor.textContent = `Ln ${lineNumber}, Col ${column}`;
        });

        this.editorManager.on('fileOpened', (path) => {
            const tab = this.editorTabs.getTab(path);
            if (tab) {
                this.statusLanguage.textContent = this.editorManager.getLanguageDisplay(tab.filename);
            }
        });

        this.editorManager.on('contentChanged', (path) => {
            this.editorTabs.setModified(path, true);
        });
    }

    _updateStatusBar(path) {
        if (!path) {
            this.statusCursor.textContent = '';
            this.statusLanguage.textContent = 'Plain Text';
            return;
        }
        const tab = this.editorTabs.getTab(path);
        if (tab) {
            this.statusLanguage.textContent = this.editorManager.getLanguageDisplay(tab.filename);
        }
    }

    _saveActiveFile() {
        const path = this.editorManager.activeFile;
        if (!path) return;

        const content = this.editorManager.getContent(path);
        if (content !== null) {
            this.fs.writeFile(path, content);
            this.fs.saveFile(path);
            this.editorTabs.setModified(path, false);
        }
    }

    _saveAllFiles() {
        this.editorManager.getOpenFiles().forEach(path => {
            const content = this.editorManager.getContent(path);
            if (content !== null) {
                this.fs.writeFile(path, content);
                this.fs.saveFile(path);
                this.editorTabs.setModified(path, false);
            }
        });
    }

    _toggleSidebar() {
        this.sidebarVisible = !this.sidebarVisible;
        this.sidebar.classList.toggle('collapsed', !this.sidebarVisible);
    }

    _togglePanel() {
        this.panelVisible = !this.panelVisible;
        this.bottomPanel.classList.toggle('collapsed', !this.panelVisible);
        if (this.panelVisible) {
            requestAnimationFrame(() => this.terminal.fit());
        }
        this._applyRightPanelLayout();
    }

    _initGlobalShortcuts() {
        document.addEventListener('keydown', (e) => {
            const isMac = navigator.platform.includes('Mac');
            const mod = isMac ? e.metaKey : e.ctrlKey;

            // Ctrl/Cmd + Shift + P — Command Palette
            if (mod && e.shiftKey && e.key === 'P') {
                e.preventDefault();
                this.commandPalette.toggle();
                return;
            }

            // Ctrl/Cmd + B — Toggle Sidebar
            if (mod && e.key === 'b') {
                e.preventDefault();
                this._toggleSidebar();
                return;
            }

            // Ctrl/Cmd + ` — Toggle Terminal
            if (mod && e.key === '`') {
                e.preventDefault();
                this._togglePanel();
                return;
            }

            // Ctrl/Cmd + S — Save
            if (mod && !e.shiftKey && e.key === 's') {
                e.preventDefault();
                this._saveActiveFile();
                return;
            }

            // Ctrl/Cmd + Shift + S — Save All
            if (mod && e.shiftKey && e.key === 'S') {
                e.preventDefault();
                this._saveAllFiles();
                return;
            }

            // Ctrl/Cmd + W — Close Tab
            if (mod && e.key === 'w') {
                e.preventDefault();
                if (this.editorManager.activeFile) {
                    this._closeFile(this.editorManager.activeFile);
                }
                return;
            }

            // Ctrl/Cmd + N — New File
            if (mod && e.key === 'n') {
                e.preventDefault();
                this._promptNewFile();
                return;
            }

            // Escape — Close overlays
            if (e.key === 'Escape') {
                if (this.commandPalette.isOpen) {
                    this.commandPalette.close();
                    return;
                }
                if (this.contextMenu.isOpen) {
                    this.contextMenu.close();
                    return;
                }
            }
        });
    }

    _initTitlebarSearch() {
        document.getElementById('titlebar-search-btn').addEventListener('click', () => {
            this.commandPalette.open();
        });
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
