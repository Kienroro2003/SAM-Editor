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
import './styles/flow-graph.css';

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
import { FlowGraphPanel } from './components/FlowGraphPanel.js';

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
        this.flowGraphPanel = null;

        // State
        this.sidebarVisible = true;
        this.panelVisible = true;
        this.panelMaximized = false;

        // DOM elements
        this.editorArea = document.getElementById('editor-area');
        this.editorMainArea = document.getElementById('editor-main-area');
        this.editorWelcome = document.getElementById('editor-welcome');
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
        this._initCommandPalette();
        this._initContextMenu();
        this._initFlowGraph();
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
            }
        });
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
                label: 'View: Toggle Flow Graph',
                keybinding: 'Ctrl + Shift + G',
                action: () => this._toggleFlowGraph()
            },
            {
                label: 'Analyze: Show Cyclomatic Complexity',
                action: () => {
                    if (!this.flowGraphPanel.visible) this._toggleFlowGraph();
                    else this._analyzeCurrentFile();
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

    _initFlowGraph() {
        this.flowGraphPanel = new FlowGraphPanel(
            document.getElementById('flow-graph-panel')
        );

        // Jump to line when node is clicked
        this.flowGraphPanel.on('nodeClicked', (line) => {
            if (this.editorManager.editor) {
                this.editorManager.editor.revealLineInCenter(line);
                this.editorManager.editor.setPosition({ lineNumber: line, column: 1 });
                this.editorManager.editor.focus();
            }
        });

        // When panel is closed
        this.flowGraphPanel.on('close', () => {
            this.editorManager.editor?.layout();
        });
    }

    _toggleFlowGraph() {
        const isNowVisible = this.flowGraphPanel.toggle();
        if (isNowVisible && this.editorManager.activeFile) {
            const content = this.editorManager.getContent(this.editorManager.activeFile);
            const tab = this.editorTabs.getTab(this.editorManager.activeFile);
            const lang = tab ? this.editorManager.getLanguage(tab.filename) : 'javascript';
            if (content) {
                this.flowGraphPanel.analyze(content, lang);
            }
        }
        // Re-layout Monaco editor after panel toggle
        requestAnimationFrame(() => this.editorManager.editor?.layout());
    }

    _analyzeCurrentFile() {
        if (!this.flowGraphPanel.visible) return;
        if (!this.editorManager.activeFile) return;
        const content = this.editorManager.getContent(this.editorManager.activeFile);
        const tab = this.editorTabs.getTab(this.editorManager.activeFile);
        const lang = tab ? this.editorManager.getLanguage(tab.filename) : 'javascript';
        if (content) {
            this.flowGraphPanel.analyze(content, lang);
        }
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
            // Auto-analyze when a file is opened and flow graph is visible
            this._analyzeCurrentFile();
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

            // Ctrl/Cmd + Shift + G — Toggle Flow Graph
            if (mod && e.shiftKey && e.key === 'G') {
                e.preventDefault();
                this._toggleFlowGraph();
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
