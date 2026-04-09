/**
 * SAM Code Editor — React Root Component
 * Bridges existing vanilla JS modules (Monaco, xterm) with React + React Router.
 * Existing modules are NOT rewritten — only wrapped for React lifecycle management.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { FileSystem } from './core/FileSystem.js';
import { EditorManager } from './core/EditorManager.js';
import { ActivityBar } from './components/ActivityBar.js';
import { FileExplorer } from './components/FileExplorer.js';
import { EditorTabs } from './components/EditorTabs.js';
import { Terminal } from './components/Terminal.js';
import { CommandPalette } from './components/CommandPalette.js';
import { ContextMenu } from './components/ContextMenu.js';
import { sampleFiles } from './data/sampleFiles.js';
import AsyncState from './components/common/AsyncState.jsx';

// Shared editor context — allows child components to access core modules
export const EditorContext = React.createContext(null);

// External navigation callback — Coverage panel can trigger file jumps
let navigateToFileCallback = null;
export function registerNavigateCallback(fn) { navigateToFileCallback = fn; }
export function navigateToFile(path, lineNumber) {
  navigateToFileCallback?.(path, lineNumber);
}

// ─── Activity Bar ────────────────────────────────────────────────────────────
function ActivityBarPanel() {
  const ref = useRef(null);

  useEffect(() => {
    new ActivityBar(ref.current);
  }, []);

  return <div ref={ref} id="activity-bar" />;
}

// ─── Editor Tabs Container ───────────────────────────────────────────────────
// EditorTabs manages its own DOM inside the container element.
// We just expose a ref to it for external use.
function EditorTabsContainer({ editorTabsRef }) {
  const ref = useRef(null);

  useEffect(() => {
    const tabs = new EditorTabs(ref.current);
    editorTabsRef.current = tabs;
    return () => { editorTabsRef.current = null; };
  }, [editorTabsRef]);

  return <div id="editor-tabs" ref={ref} />;
}

// ─── Terminal Container ──────────────────────────────────────────────────────
function TerminalContainer({ terminalRef }) {
  const ref = useRef(null);

  useEffect(() => {
    const term = new Terminal(ref.current);
    terminalRef.current = term;
    return () => { terminalRef.current = null; };
  }, [terminalRef]);

  return <div id="terminal-container" ref={ref} />;
}

// ─── File Explorer Container ─────────────────────────────────────────────────
function FileExplorerContainer({ fs, fileExplorerRef }) {
  const ref = useRef(null);

  useEffect(() => {
    const explorer = new FileExplorer(ref.current, fs);
    fileExplorerRef.current = explorer;
    return () => { fileExplorerRef.current = null; };
  }, [fs, fileExplorerRef]);

  return <div id="file-explorer" ref={ref} />;
}

// ─── Panel Tabs ──────────────────────────────────────────────────────────────
function PanelTabs({ terminalRef }) {
  const [activePanel, setActivePanel] = useState('terminal');

  const switchPanel = (panel) => {
    setActivePanel(panel);
    document.querySelectorAll('.panel-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.panel === panel)
    );
    document.querySelectorAll('.panel-view').forEach(v =>
      v.classList.toggle('active', v.id === `${panel}-container`)
    );

    if (panel === 'terminal') {
      requestAnimationFrame(() => terminalRef.current?.fit());
    }
  };

  return (
    <div id="panel-tabs">
      <div className="panel-tab-list">
        {['terminal', 'problems', 'output'].map(p => (
          <button
            key={p}
            className={`panel-tab ${activePanel === p ? 'active' : ''}`}
            data-panel={p}
            onClick={() => switchPanel(p)}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="panel-actions">
        <button className="icon-btn" id="btn-panel-maximize" title="Maximize Panel">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3 3v10h10V3H3zm9 9H4V4h8v8z"/></svg>
        </button>
        <button className="icon-btn" id="btn-panel-close" title="Close Panel">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8.707l3.646 3.647.708-.708L8.707 8l3.647-3.646-.708-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/></svg>
        </button>
      </div>
    </div>
  );
}

// ─── Status Bar ─────────────────────────────────────────────────────────────
function StatusBar() {
  const [cursor, setCursor] = useState('Ln 1, Col 1');
  const [language, setLanguage] = useState('Plain Text');

  useEffect(() => {
    const editorManager = window._samEditorManager;
    if (!editorManager) return;

    editorManager.on('cursorChanged', ({ lineNumber, column }) => {
      setCursor(`Ln ${lineNumber}, Col ${column}`);
    });

    editorManager.on('fileOpened', (path) => {
      const data = editorManager.openFiles.get(path);
      if (data) {
        setLanguage(editorManager.getLanguageDisplay(data.filename));
      }
    });
  }, []);

  return (
    <div id="statusbar">
      <div className="statusbar-left">
        <div className="status-item status-branch" id="status-branch">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zM4 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5H9.5a.5.5 0 0 1-.5-.5V1H4z"/></svg>
          <span>main</span>
        </div>
        <div className="status-item" id="status-errors">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 13A6 6 0 1 1 8 2a6 6 0 0 1 0 12z"/><path d="M7.5 4h1v5h-1V4zm0 6h1v1h-1v-1z"/></svg>
          <span>0</span>
        </div>
        <div className="status-item" id="status-warnings">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1L1 14h14L8 1zm0 2l5.5 10h-11L8 3z"/><path d="M7.5 6h1v4h-1V6zm0 5h1v1h-1v-1z"/></svg>
          <span>0</span>
        </div>
      </div>
      <div className="statusbar-right">
        <div className="status-item" id="status-cursor">{cursor}</div>
        <div className="status-item" id="status-indent">Spaces: 2</div>
        <div className="status-item" id="status-encoding">UTF-8</div>
        <div className="status-item" id="status-eol">LF</div>
        <div className="status-item" id="status-language">{language}</div>
        <div className="status-item status-notification" id="status-notification">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 2h-11A1.5 1.5 0 0 0 1 3.5v9A1.5 1.5 0 0 0 2.5 14h11a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 13.5 2zM2 3.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 .5.5v.282l-6 3.6-6-3.6V3.5zm0 1.418l6 3.6 6-3.6V12.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V4.918z"/></svg>
        </div>
      </div>
    </div>
  );
}

// ─── Coverage Screen ────────────────────────────────────────────────────────
function CoverageScreen() {
  return (
    <div style={{ padding: '24px', color: 'var(--text-primary)', height: '100%', overflow: 'auto' }}>
      <h2 style={{ marginBottom: '16px', color: 'var(--text-active)' }}>Coverage Overview</h2>
      <AsyncState
        state={{ status: 'idle' }}
        emptyProps={{
          icon: '📊',
          title: 'No coverage report uploaded',
          description: 'Upload an LCOV (.info) coverage report to see analysis results.',
        }}
      >
        <p>Upload a coverage report to get started.</p>
      </AsyncState>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const navigate = useNavigate();

  // Core module refs — shared across components
  const fsRef = useRef(null);
  const editorManagerRef = useRef(null);
  const editorTabsRef = useRef(null);
  const terminalRef = useRef(null);
  const fileExplorerRef = useRef(null);
  const commandPaletteRef = useRef(null);
  const contextMenuRef = useRef(null);

  // DOM refs
  const editorAreaRef = useRef(null);

  // UI state
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [panelVisible, setPanelVisible] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // ─── Initialize core systems once ─────────────────────────────────────────
  useEffect(() => {
    if (initialized) return;

    const fs = new FileSystem();
    const editorManager = new EditorManager();
    fsRef.current = fs;
    editorManagerRef.current = editorManager;

    // Expose on window for StatusBar (React can't easily subscribe to vanilla events)
    window._samEditorManager = editorManager;

    // Load sample project
    fs.loadTree(sampleFiles);

    // Mark initialized so second useEffect can safely access refs after DOM commit
    setInitialized(true);

    return () => {
      editorManager.dispose();
    };
  }, [initialized, navigate]);

  // ─── Boot Monaco + init components AFTER DOM is committed ──────────────────
  useEffect(() => {
    if (!initialized) return;

    const editorManager = editorManagerRef.current;

    (async () => {
      const monaco = await import('monaco-editor');

      self.MonacoEnvironment = {
        getWorker(_, label) {
          switch (label) {
            case 'json':
              return new Worker(new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url), { type: 'module' });
            case 'css': case 'scss': case 'less':
              return new Worker(new URL('monaco-editor/esm/vs/language/css/css.worker.js', import.meta.url), { type: 'module' });
            case 'html': case 'handlebars': case 'razor':
              return new Worker(new URL('monaco-editor/esm/vs/language/html/html.worker.js', import.meta.url), { type: 'module' });
            case 'typescript': case 'javascript':
              return new Worker(new URL('monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url), { type: 'module' });
            default:
              return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' });
          }
        }
      };

      // Now editorAreaRef is guaranteed to exist — DOM is committed
      editorManager.init(editorAreaRef.current, monaco);

      // Init Command Palette
      const cp = new CommandPalette();
      commandPaletteRef.current = cp;

      cp.registerCommands([
        { label: 'View: Toggle Sidebar Visibility', keybinding: 'Ctrl + B', action: () => setSidebarVisible(v => !v) },
        { label: 'View: Toggle Terminal', keybinding: 'Ctrl + `', action: () => setPanelVisible(v => !v) },
        { label: 'File: New File', keybinding: 'Ctrl + N', action: () => handleNewFile(fsRef.current, editorTabsRef.current, editorManagerRef.current) },
        { label: 'File: Save', keybinding: 'Ctrl + S', action: () => handleSave(editorManager, fsRef.current, editorTabsRef.current) },
        { label: 'File: Save All', keybinding: 'Ctrl + Shift + S', action: () => handleSaveAll(editorManager, fsRef.current, editorTabsRef.current) },
        { label: 'File: Close Editor', keybinding: 'Ctrl + W', action: () => handleClose(editorManager, fsRef.current, editorTabsRef.current) },
        { label: 'Terminal: Clear Terminal', action: () => terminalRef.current?.clear() },
        { label: 'Terminal: Focus Terminal', action: () => setPanelVisible(true) },
        { label: 'Editor: Toggle Word Wrap', keybinding: 'Alt + Z', action: () => toggleWordWrap(editorManager) },
        { label: 'Editor: Toggle Minimap', action: () => toggleMinimap(editorManager) },
        { label: 'Editor: Format Document', keybinding: 'Shift + Alt + F', action: () => editorManager.editor?.getAction('editor.action.formatDocument')?.run() },
        { label: 'View: Toggle Full Screen', keybinding: 'F11', action: () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen() },
        { label: 'Coverage: Open Overview', action: () => navigate('/coverage') },
      ]);

      // Init Context Menu
      const cm = new ContextMenu();
      contextMenuRef.current = cm;
    })();
  }, [initialized, navigate]);

  // ─── File Explorer: wire open events ──────────────────────────────────────
  useEffect(() => {
    if (!initialized || !fileExplorerRef.current) return;

    const explorer = fileExplorerRef.current;

    explorer.on('fileSelected', (node) => openFile(node.path, node.name));
    explorer.on('fileOpened', (node) => openFile(node.path, node.name));
  }, [initialized]);

  // ─── Register navigateToFile ───────────────────────────────────────────────
  useEffect(() => {
    if (!initialized) return;
    registerNavigateCallback((path, lineNumber) => {
      const fs = fsRef.current;
      const em = editorManagerRef.current;
      const et = editorTabsRef.current;
      if (!fs || !em || !et) return;

      const node = fs.resolve(path);
      if (node?.type === 'file') {
        em.openFile(path, fs.readFile(path), node.name);
        et.addTab(path, node.name);
        document.getElementById('editor-area')?.classList.add('active');
        document.getElementById('editor-welcome')?.classList.add('hidden');
        if (lineNumber && em.editor) {
          em.editor.revealLineInCenter(lineNumber);
          em.editor.setPosition({ lineNumber, column: 1 });
        }
        navigate('/editor');
      }
    });
  }, [initialized, navigate]);

  // ─── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    if (!initialized) return;

    const handler = (e) => {
      const isMac = navigator.userAgent.includes('Mac');
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && e.shiftKey && e.key === 'P') { e.preventDefault(); commandPaletteRef.current?.toggle(); return; }
      if (mod && e.key === 'b') { e.preventDefault(); setSidebarVisible(v => !v); return; }
      if (mod && e.key === '`') { e.preventDefault(); setPanelVisible(v => !v); return; }
      if (mod && !e.shiftKey && e.key === 's') { e.preventDefault(); handleSave(editorManagerRef.current, fsRef.current, editorTabsRef.current); return; }
      if (mod && e.shiftKey && e.key === 'S') { e.preventDefault(); handleSaveAll(editorManagerRef.current, fsRef.current, editorTabsRef.current); return; }
      if (mod && e.key === 'w') { e.preventDefault(); handleClose(editorManagerRef.current, fsRef.current, editorTabsRef.current); return; }
      if (mod && e.key === 'n') { e.preventDefault(); handleNewFile(fsRef.current, editorTabsRef.current, editorManagerRef.current); return; }
      if (e.key === 'Escape') {
        if (commandPaletteRef.current?.isOpen) { commandPaletteRef.current.close(); return; }
        if (contextMenuRef.current?.isOpen) { contextMenuRef.current.close(); return; }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [initialized]);

  // ─── Resize handles ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialized) return;

    // Sidebar resize
    const sidebarHandle = document.getElementById('sidebar-resize-handle');
    let resizing = false;

    const onSidebarDown = () => {
      resizing = true;
      sidebarHandle.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (ev) => {
        if (!resizing) return;
        const newWidth = Math.max(150, Math.min(600, ev.clientX - 48));
        document.getElementById('sidebar').style.width = `${newWidth}px`;
      };

      const onUp = () => {
        resizing = false;
        sidebarHandle.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    sidebarHandle.addEventListener('mousedown', onSidebarDown);

    // Panel resize
    const panelHandle = document.getElementById('panel-resize-handle');
    let resizingPanel = false;

    const onPanelDown = (e) => {
      resizingPanel = true;
      panelHandle.classList.add('active');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';

      const startY = e.clientY;
      const panel = document.getElementById('bottom-panel');
      const startHeight = panel.offsetHeight;

      const onMove = (ev) => {
        if (!resizingPanel) return;
        const delta = startY - ev.clientY;
        const newHeight = Math.max(100, Math.min(window.innerHeight * 0.7, startHeight + delta));
        panel.style.height = `${newHeight}px`;
      };

      const onUp = () => {
        resizingPanel = false;
        panelHandle.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        terminalRef.current?.fit();
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    panelHandle.addEventListener('mousedown', onPanelDown);

    // Title bar search
    document.getElementById('titlebar-search-btn')?.addEventListener('click', () => commandPaletteRef.current?.open());

    // Panel buttons
    document.getElementById('btn-panel-close')?.addEventListener('click', () => setPanelVisible(false));
    document.getElementById('btn-panel-maximize')?.addEventListener('click', () => {
      const panel = document.getElementById('bottom-panel');
      panel.style.height = panel.style.height === '70%' ? '' : '70%';
      terminalRef.current?.fit();
    });

    return () => {
      sidebarHandle.removeEventListener('mousedown', onSidebarDown);
      panelHandle.removeEventListener('mousedown', onPanelDown);
    };
  }, [initialized]);

  // ─── Helper: open file ─────────────────────────────────────────────────────
  const openFile = (path, filename) => {
    const fs = fsRef.current;
    const em = editorManagerRef.current;
    const et = editorTabsRef.current;
    if (!fs || !em || !et) return;

    em.openFile(path, fs.readFile(path), filename);
    et.addTab(path, filename);
    document.getElementById('editor-area')?.classList.add('active');
    document.getElementById('editor-welcome')?.classList.add('hidden');
    fileExplorerRef.current?.expandTo(path);
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  if (!initialized) {
    return (
      <div id="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        Loading SAM Editor...
      </div>
    );
  }

  const fs = fsRef.current;

  return (
    <EditorContext.Provider value={{ fs, editorManager: editorManagerRef.current, editorTabs: editorTabsRef.current }}>
      <div id="app">
        {/* Title Bar */}
        <div id="titlebar">
          <div className="titlebar-left">
            <div className="titlebar-menu-icon" id="titlebar-menu-btn">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="3" width="14" height="1.5" rx="0.5"/>
                <rect x="1" y="7.25" width="14" height="1.5" rx="0.5"/>
                <rect x="1" y="11.5" width="14" height="1.5" rx="0.5"/>
              </svg>
            </div>
            <span className="titlebar-title">SAM Code Editor</span>
          </div>
          <div className="titlebar-center">
            <div className="titlebar-search" id="titlebar-search-btn">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/>
              </svg>
              <span>SAM Code Editor</span>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div id="main-content">
          <ActivityBarPanel />

          {/* Sidebar — always visible, outside Routes */}
          <div id="sidebar" className={sidebarVisible ? '' : 'collapsed'}>
            <div id="sidebar-header">
              <span className="sidebar-title">EXPLORER</span>
              <div className="sidebar-actions">
                <button className="icon-btn" id="btn-new-file" title="New File" onClick={() => handleNewFile(fsRef.current, editorTabsRef.current, editorManagerRef.current)}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M12 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4l-1-3zM8 1v3h3L8 1zM4 14V2h3v4h5v8H4z"/><path d="M7 7h2v2h1v-2h2V7h-2V5H9v2H7v1z" opacity="0.8"/></svg>
                </button>
                <button className="icon-btn" id="btn-new-folder" title="New Folder" onClick={() => promptNewFolder(fsRef.current, fileExplorerRef.current)}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14 4H8l-1-2H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zm0 9H2V5h12v8z"/><path d="M7 7h2v2h1V7h2V6h-2V4H9v2H7v1z" opacity="0.8"/></svg>
                </button>
                <button className="icon-btn" id="btn-collapse-all" title="Collapse All"
                  onClick={() => fileExplorerRef.current?.collapseAll()}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M9 9H4v1h5V9zM9 4H4v1h5V4zM14 1v14H2V1h12zm-1 1H3v12h10V2z"/></svg>
                </button>
              </div>
            </div>
            <FileExplorerContainer fs={fs} fileExplorerRef={fileExplorerRef} />
          </div>

          <div id="sidebar-resize-handle" className="resize-handle-vertical" />

          {/* Content area — switches between Editor and Coverage */}
          <div id="content-area">
            <Routes>
              <Route path="/" element={<Navigate to="/editor" replace />} />
              <Route path="/editor" element={
                <div id="editor-container">
                  <EditorTabsContainer editorTabsRef={editorTabsRef} />
                  <EditorWelcome />
                  <div id="editor-area" ref={editorAreaRef} />
                  <div id="panel-resize-handle" className="resize-handle-horizontal" />
                  <div id="bottom-panel" className={panelVisible ? '' : 'collapsed'}>
                    <PanelTabs terminalRef={terminalRef} />
                    <div id="panel-content">
                      <TerminalContainer terminalRef={terminalRef} />
                      <div id="problems-container" className="panel-view">
                        <div className="panel-empty">No problems have been detected in the workspace.</div>
                      </div>
                      <div id="output-container" className="panel-view">
                        <div className="panel-empty">No output available.</div>
                      </div>
                    </div>
                  </div>
                </div>
              } />
              <Route path="/coverage" element={<CoverageScreen />} />
            </Routes>
          </div>
        </div>

        {/* Status Bar */}
        <StatusBar />

        {/* Command Palette Overlay */}
        <div id="command-palette" className="hidden">
          <div className="command-palette-backdrop" />
          <div className="command-palette-dialog">
            <div className="command-palette-input-wrapper">
              <span className="command-palette-prefix">&gt;</span>
              <input type="text" id="command-palette-input" placeholder="Type a command..." autoComplete="off" />
            </div>
            <div id="command-palette-results" className="command-palette-results" />
          </div>
        </div>

        {/* Context Menu */}
        <div id="context-menu" className="hidden">
          <div className="context-menu-backdrop" />
          <ul className="context-menu-list" />
        </div>

        {/* Input Dialog */}
        <div id="input-dialog" className="hidden">
          <div className="input-dialog-backdrop" />
          <div className="input-dialog-content">
            <input type="text" id="input-dialog-field" autoComplete="off" />
          </div>
        </div>
      </div>
    </EditorContext.Provider>
  );
}

// ─── Editor Welcome (inline — not interactive) ──────────────────────────────
function EditorWelcome() {
  return (
    <div id="editor-welcome">
      <div className="welcome-content">
        <div className="welcome-logo">
          <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
            <rect width="100" height="100" rx="20" fill="#0078d4" opacity="0.15"/>
            <path d="M30 70V30l20 10v20L30 70zM50 40l20-10v40L50 60V40z" fill="#0078d4"/>
            <path d="M30 30l20-10 20 10-20 10-20-10z" fill="#0098ff"/>
          </svg>
        </div>
        <h2>SAM Code Editor</h2>
        <p className="welcome-subtitle">A VS Code-like editor powered by Monaco Editor</p>
        <div className="welcome-shortcuts">
          {[
            ['Ctrl+Shift+P', 'Command Palette'],
            ['Ctrl+`', 'Toggle Terminal'],
            ['Ctrl+B', 'Toggle Sidebar'],
            ['Ctrl+S', 'Save File'],
          ].map(([keys, label]) => (
            <div key={keys} className="shortcut-item">
              {keys.split('+').map(k => <kbd key={k}>{k}</kbd>)}
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Helper functions ───────────────────────────────────────────────────────
function handleSave(editorManager, fs, editorTabs) {
  const path = editorManager.activeFile;
  if (!path) return;
  const content = editorManager.getContent(path);
  if (content !== null) {
    fs.writeFile(path, content);
    fs.saveFile(path);
    editorTabs?.setModified(path, false);
  }
}

function handleSaveAll(editorManager, fs, editorTabs) {
  editorManager.getOpenFiles().forEach(path => {
    const content = editorManager.getContent(path);
    if (content !== null) {
      fs.writeFile(path, content);
      fs.saveFile(path);
      editorTabs?.setModified(path, false);
    }
  });
}

function handleClose(editorManager, fs, editorTabs) {
  const path = editorManager.activeFile;
  if (!path) return;
  const tab = editorTabs?.getTab(path);
  if (tab?.modified) {
    const content = editorManager.getContent(path);
    if (content !== null) { fs.writeFile(path, content); fs.saveFile(path); }
  }
  editorTabs?.removeTab(path);
  editorManager.closeFile(path);
  if (!editorManager.activeFile) {
    document.getElementById('editor-area')?.classList.remove('active');
    document.getElementById('editor-welcome')?.classList.remove('hidden');
  }
}

function handleNewFile(fs, editorTabs, editorManager) {
  const name = prompt('New File Name:');
  if (!name) return;
  try {
    fs.createFile(name, '');
    const path = '/' + name;
    editorTabs?.addTab(path, name);
    editorManager.openFile(path, fs.readFile(path), name);
    document.getElementById('editor-area')?.classList.add('active');
    document.getElementById('editor-welcome')?.classList.add('hidden');
  } catch (err) {
    console.error('Failed to create file:', err);
  }
}

function promptNewFolder(fs, fileExplorer) {
  const name = prompt('New Folder Name:');
  if (!name) return;
  try {
    fs.createDirectory(name);
    fileExplorer?.render();
  } catch (err) {
    console.error('Failed to create folder:', err);
  }
}

function toggleWordWrap(editorManager) {
  if (!editorManager?.editor) return;
  const opt = editorManager.monaco.editor.EditorOption.wordWrap;
  const current = editorManager.editor.getOption(opt);
  editorManager.editor.updateOptions({ wordWrap: current === 'off' ? 'on' : 'off' });
}

function toggleMinimap(editorManager) {
  if (!editorManager?.editor) return;
  const opt = editorManager.monaco.editor.EditorOption.minimap;
  const current = editorManager.editor.getOption(opt);
  editorManager.editor.updateOptions({ minimap: { enabled: !current.enabled } });
}
