/**
 * Flow Graph Panel — Renders a Control Flow Graph with SVG inside the editor area.
 * Shows CC (Cyclomatic Complexity) badges per function, supports zoom/pan, and
 * clicking a node jumps to the corresponding line in the editor.
 */
import { CFGAnalyzer } from '../core/CFGAnalyzer.js';

// ─── Layout Constants ──────────────────────────────────────────────────
const NODE_W = 180;
const NODE_H = 44;
const NODE_H_DECISION = 52;
const GAP_X = 40;
const GAP_Y = 60;
const PADDING = 40;

// ─── Colors ────────────────────────────────────────────────────────────
const COLORS = {
    start:    { fill: '#2ea04366', stroke: '#2ea043', text: '#7ee787' },
    end:      { fill: '#f8514966', stroke: '#f85149', text: '#ffa198' },
    process:  { fill: '#388bfd33', stroke: '#388bfd', text: '#a5d6ff' },
    decision: { fill: '#d29922aa', stroke: '#d29922', text: '#e3b341' },
    merge:    { fill: '#8b949e33', stroke: '#8b949e', text: '#c9d1d9' },
    return:   { fill: '#bc8cff33', stroke: '#bc8cff', text: '#d2a8ff' },
    throw:    { fill: '#f8514966', stroke: '#f85149', text: '#ffa198' },
    edge:     '#8b949e',
    edgeLabel:'#8b949e',
    bg:       '#0d1117',
};

export class FlowGraphPanel {
    constructor(container) {
        this.container = container;
        this.analyzer = new CFGAnalyzer();
        this._listeners = {};

        // State
        this.visible = false;
        this.analysis = null;   // { functions: [...] }
        this.activeFuncIdx = 0;
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this._isPanning = false;
        this._panStart = { x: 0, y: 0 };

        this._buildDOM();
    }

    on(event, fn) { (this._listeners[event] ||= []).push(fn); }
    emit(event, ...args) { (this._listeners[event] || []).forEach(fn => fn(...args)); }

    // ─── DOM ───────────────────────────────────────────────────────
    _buildDOM() {
        this.container.innerHTML = `
            <div class="fg-toolbar">
                <div class="fg-toolbar-left">
                    <span class="fg-title">FLOW GRAPH</span>
                    <select id="fg-func-select" class="fg-select"></select>
                </div>
                <div class="fg-toolbar-right">
                    <span class="fg-cc-badge" id="fg-cc-badge">CC: —</span>
                    <button class="fg-btn" id="fg-zoom-in" title="Zoom In">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4v3H5v2h3v3h2V9h3V7H10V4H8z"/><path d="M14.5 13.793l-3.116-3.116a5.501 5.501 0 1 0-.707.707l3.116 3.116.707-.707zM2 6.5a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0z"/></svg>
                    </button>
                    <button class="fg-btn" id="fg-zoom-out" title="Zoom Out">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5 7h6v2H5V7z"/><path d="M14.5 13.793l-3.116-3.116a5.501 5.501 0 1 0-.707.707l3.116 3.116.707-.707zM2 6.5a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0z"/></svg>
                    </button>
                    <button class="fg-btn" id="fg-reset" title="Reset View">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 3l3 3H5v4.5c0 .83.67 1.5 1.5 1.5H11v1.5H6.5A3 3 0 0 1 3.5 10.5V6H1l3.5-3zM11.5 13l-3-3H11V5.5c0-.83-.67-1.5-1.5-1.5H5V2.5h4.5A3 3 0 0 1 12.5 5.5V10H15l-3.5 3z"/></svg>
                    </button>
                    <button class="fg-btn" id="fg-close" title="Close Panel">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8.707l3.646 3.647.708-.708L8.707 8l3.647-3.646-.708-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/></svg>
                    </button>
                </div>
            </div>
            <div class="fg-canvas-wrapper" id="fg-canvas-wrapper">
                <svg id="fg-svg" class="fg-svg" xmlns="http://www.w3.org/2000/svg"></svg>
            </div>
            <div class="fg-summary" id="fg-summary"></div>
        `;

        this.svg = this.container.querySelector('#fg-svg');
        this.wrapper = this.container.querySelector('#fg-canvas-wrapper');
        this.funcSelect = this.container.querySelector('#fg-func-select');
        this.ccBadge = this.container.querySelector('#fg-cc-badge');
        this.summary = this.container.querySelector('#fg-summary');

        this._bindEvents();
    }

    _bindEvents() {
        // Function select
        this.funcSelect.addEventListener('change', () => {
            this.activeFuncIdx = parseInt(this.funcSelect.value, 10);
            this._renderGraph();
        });

        // Zoom
        this.container.querySelector('#fg-zoom-in').addEventListener('click', () => {
            this.zoom = Math.min(3, this.zoom + 0.2);
            this._applyTransform();
        });
        this.container.querySelector('#fg-zoom-out').addEventListener('click', () => {
            this.zoom = Math.max(0.2, this.zoom - 0.2);
            this._applyTransform();
        });
        this.container.querySelector('#fg-reset').addEventListener('click', () => {
            this.zoom = 1; this.panX = 0; this.panY = 0;
            this._applyTransform();
        });

        // Close
        this.container.querySelector('#fg-close').addEventListener('click', () => {
            this.hide();
            this.emit('close');
        });

        // Scroll zoom
        this.wrapper.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.zoom = Math.max(0.2, Math.min(3, this.zoom + delta));
            this._applyTransform();
        }, { passive: false });

        // Pan
        this.wrapper.addEventListener('mousedown', (e) => {
            if (e.target.closest('.fg-node')) return;
            this._isPanning = true;
            this._panStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
            this.wrapper.style.cursor = 'grabbing';
        });
        window.addEventListener('mousemove', (e) => {
            if (!this._isPanning) return;
            this.panX = e.clientX - this._panStart.x;
            this.panY = e.clientY - this._panStart.y;
            this._applyTransform();
        });
        window.addEventListener('mouseup', () => {
            this._isPanning = false;
            this.wrapper.style.cursor = 'grab';
        });
    }

    // ─── Public API ────────────────────────────────────────────────

    show() {
        this.visible = true;
        this.container.classList.add('visible');
    }

    hide() {
        this.visible = false;
        this.container.classList.remove('visible');
    }

    toggle() {
        this.visible ? this.hide() : this.show();
        return this.visible;
    }

    /**
     * Analyze code and render the flow graph.
     */
    analyze(code, language = 'javascript') {
        this.analysis = this.analyzer.analyzeFile(code, language);
        this.activeFuncIdx = 0;

        // Populate function select
        this.funcSelect.innerHTML = this.analysis.functions.map((f, i) =>
            `<option value="${i}">${f.name} (CC: ${f.cfg.cc})</option>`
        ).join('');

        this._renderGraph();
        this._renderSummary();
    }

    // ─── Rendering ─────────────────────────────────────────────────

    _renderGraph() {
        if (!this.analysis || this.analysis.functions.length === 0) return;

        const func = this.analysis.functions[this.activeFuncIdx];
        const { nodes, edges, cc } = func.cfg;

        // Update CC badge
        const severity = CFGAnalyzer.severity(cc);
        this.ccBadge.textContent = `CC: ${cc}`;
        this.ccBadge.className = `fg-cc-badge fg-cc-${severity}`;

        // Layout nodes
        const positions = this._layoutNodes(nodes, edges);

        // Compute SVG size
        let maxX = 0, maxY = 0;
        for (const pos of Object.values(positions)) {
            maxX = Math.max(maxX, pos.x + NODE_W);
            maxY = Math.max(maxY, pos.y + NODE_H_DECISION);
        }
        const svgW = maxX + PADDING * 2;
        const svgH = maxY + PADDING * 2;

        // Build SVG content
        let svgContent = `<defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="${COLORS.edge}" />
            </marker>
            <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>`;

        // Draw edges first (behind nodes)
        for (const edge of edges) {
            const from = positions[edge.from];
            const to = positions[edge.to];
            if (!from || !to) continue;

            const fromNode = nodes.find(n => n.id === edge.from);
            const toNode = nodes.find(n => n.id === edge.to);

            const fromH = fromNode?.type === 'decision' ? NODE_H_DECISION : NODE_H;
            const toH = toNode?.type === 'decision' ? NODE_H_DECISION : NODE_H;

            const x1 = from.x + NODE_W / 2;
            const y1 = from.y + fromH;
            const x2 = to.x + NODE_W / 2;
            const y2 = to.y;

            // Curved path
            const midY = (y1 + y2) / 2;
            let path;
            if (edge.label === 'loop') {
                // Loop-back edge — route to the right
                const offsetX = NODE_W / 2 + 30;
                path = `M ${x1} ${y1} C ${x1 + offsetX} ${y1 + 40}, ${x2 + offsetX} ${y2 - 40}, ${x2} ${y2}`;
            } else if (Math.abs(x1 - x2) < 5) {
                path = `M ${x1} ${y1} L ${x2} ${y2}`;
            } else {
                path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
            }

            svgContent += `<path d="${path}" fill="none" stroke="${COLORS.edge}" stroke-width="1.5" 
                marker-end="url(#arrowhead)" opacity="0.6" class="fg-edge"/>`;

            // Edge label
            if (edge.label && edge.label !== 'loop') {
                const lx = (x1 + x2) / 2 + (edge.label === 'T' ? -15 : 15);
                const ly = (y1 + y2) / 2 - 5;
                svgContent += `<text x="${lx}" y="${ly}" class="fg-edge-label" fill="${COLORS.edgeLabel}" 
                    font-size="11" text-anchor="middle" font-family="Inter, sans-serif">${edge.label}</text>`;
            }
        }

        // Draw nodes
        for (const node of nodes) {
            const pos = positions[node.id];
            if (!pos) continue;
            svgContent += this._renderNode(node, pos);
        }

        this.svg.setAttribute('width', svgW);
        this.svg.setAttribute('height', svgH);
        this.svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
        this.svg.innerHTML = svgContent;

        // Reset pan/zoom
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this._applyTransform();

        // Bind node click events
        this.svg.querySelectorAll('.fg-node').forEach(el => {
            el.addEventListener('click', () => {
                const line = parseInt(el.dataset.line, 10);
                if (line > 0) this.emit('nodeClicked', line);
            });
        });
    }

    _renderNode(node, pos) {
        const colors = COLORS[node.type] || COLORS.process;
        const h = node.type === 'decision' ? NODE_H_DECISION : NODE_H;
        const label = node.label.length > 28 ? node.label.slice(0, 25) + '...' : node.label;
        const lineInfo = node.startLine ? `L${node.startLine}` : '';

        if (node.type === 'decision') {
            // Diamond shape
            const cx = pos.x + NODE_W / 2;
            const cy = pos.y + h / 2;
            const dx = NODE_W / 2;
            const dy = h / 2;
            return `
                <g class="fg-node fg-node-${node.type}" data-line="${node.startLine || 0}" style="cursor:pointer">
                    <polygon points="${cx},${pos.y} ${pos.x + NODE_W},${cy} ${cx},${pos.y + h} ${pos.x},${cy}" 
                        fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2" rx="4"/>
                    <text x="${cx}" y="${cy - 2}" fill="${colors.text}" font-size="11" text-anchor="middle" 
                        font-family="'Cascadia Code', monospace" dominant-baseline="middle">${this._escSvg(label)}</text>
                    ${lineInfo ? `<text x="${cx}" y="${cy + 14}" fill="${colors.text}" font-size="9" text-anchor="middle" 
                        font-family="Inter, sans-serif" opacity="0.6">${lineInfo}</text>` : ''}
                </g>`;
        }

        if (node.type === 'start' || node.type === 'end') {
            // Rounded pill
            return `
                <g class="fg-node fg-node-${node.type}" data-line="${node.startLine || 0}" style="cursor:pointer">
                    <rect x="${pos.x}" y="${pos.y}" width="${NODE_W}" height="${h}" rx="22" 
                        fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2"/>
                    <text x="${pos.x + NODE_W / 2}" y="${pos.y + h / 2}" fill="${colors.text}" font-size="12" 
                        text-anchor="middle" font-family="Inter, sans-serif" font-weight="600" dominant-baseline="middle">
                        ${this._escSvg(label)}</text>
                </g>`;
        }

        // Regular process / return / throw nodes
        return `
            <g class="fg-node fg-node-${node.type}" data-line="${node.startLine || 0}" style="cursor:pointer">
                <rect x="${pos.x}" y="${pos.y}" width="${NODE_W}" height="${h}" rx="6" 
                    fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="1.5"/>
                <text x="${pos.x + NODE_W / 2}" y="${pos.y + h / 2 - (lineInfo ? 4 : 0)}" fill="${colors.text}" 
                    font-size="11" text-anchor="middle" font-family="'Cascadia Code', monospace" dominant-baseline="middle">
                    ${this._escSvg(label)}</text>
                ${lineInfo ? `<text x="${pos.x + NODE_W / 2}" y="${pos.y + h / 2 + 12}" fill="${colors.text}" font-size="9" 
                    text-anchor="middle" font-family="Inter, sans-serif" opacity="0.5">${lineInfo}</text>` : ''}
            </g>`;
    }

    _escSvg(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ─── Layout (Sugiyama-style simplified) ────────────────────────

    _layoutNodes(nodes, edges) {
        // Assign layers using topological depth
        const adj = {};   // adjacency list
        const inDeg = {}; // in-degree
        for (const n of nodes) { adj[n.id] = []; inDeg[n.id] = 0; }
        for (const e of edges) {
            if (e.label === 'loop') continue; // skip back-edges for layering
            if (adj[e.from]) adj[e.from].push(e.to);
            if (inDeg[e.to] !== undefined) inDeg[e.to]++;
        }

        // BFS layering
        const layers = {};
        const queue = nodes.filter(n => inDeg[n.id] === 0).map(n => n.id);
        const visited = new Set();
        for (const id of queue) { layers[id] = 0; visited.add(id); }

        let head = 0;
        while (head < queue.length) {
            const id = queue[head++];
            for (const next of (adj[id] || [])) {
                layers[next] = Math.max(layers[next] || 0, (layers[id] || 0) + 1);
                if (!visited.has(next)) {
                    visited.add(next);
                    queue.push(next);
                }
            }
        }

        // Assign un-visited nodes
        for (const n of nodes) {
            if (layers[n.id] === undefined) layers[n.id] = 0;
        }

        // Group by layer
        const layerGroups = {};
        for (const n of nodes) {
            const l = layers[n.id];
            (layerGroups[l] ||= []).push(n);
        }

        // Position
        const maxLayer = Math.max(...Object.keys(layerGroups).map(Number));
        const positions = {};

        for (let l = 0; l <= maxLayer; l++) {
            const group = layerGroups[l] || [];
            const totalW = group.length * NODE_W + (group.length - 1) * GAP_X;
            let startX = PADDING + (maxLayer > 0 ? 0 : 0);
            // Center the layer
            const maxGroupSize = Math.max(...Object.values(layerGroups).map(g => g.length));
            const maxTotalW = maxGroupSize * NODE_W + (maxGroupSize - 1) * GAP_X;
            startX = PADDING + (maxTotalW - totalW) / 2;

            group.forEach((node, idx) => {
                positions[node.id] = {
                    x: startX + idx * (NODE_W + GAP_X),
                    y: PADDING + l * (NODE_H_DECISION + GAP_Y),
                };
            });
        }

        return positions;
    }

    // ─── Summary ───────────────────────────────────────────────────

    _renderSummary() {
        if (!this.analysis) return;

        const rows = this.analysis.functions.map(f => {
            const sev = CFGAnalyzer.severity(f.cfg.cc);
            return `<div class="fg-summary-row">
                <span class="fg-summary-name">${f.name}</span>
                <span class="fg-summary-range">L${f.startLine}–${f.endLine}</span>
                <span class="fg-cc-badge fg-cc-${sev}" style="font-size:11px;padding:2px 8px;">CC: ${f.cfg.cc}</span>
            </div>`;
        }).join('');

        this.summary.innerHTML = `
            <div class="fg-summary-title">Cyclomatic Complexity Summary</div>
            ${rows}
        `;
    }

    _applyTransform() {
        this.svg.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    }
}
