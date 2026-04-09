import styles from './CoveragePanel.module.css';

/**
 * @typedef {Object} CoverageMetrics
 * @property {number} statement
 * @property {number} branch
 * @property {number} function
 * @property {number} cyclomaticComplexity
 * @property {string} analyzedAt
 * @property {string} filename
 */

function pctColor(val) {
    if (typeof val !== 'number') return '#858585';
    if (val >= 80) return '#4ade80';
    if (val >= 50) return '#facc15';
    return '#f87171';
}

function ccColor(val) {
    if (typeof val !== 'number') return '#858585';
    if (val <= 10) return '#4ade80';
    if (val <= 20) return '#facc15';
    return '#f87171';
}

function fmtPct(val) {
    return typeof val === 'number' ? `${Math.round(val)}%` : '--';
}

function fmtNum(val) {
    return typeof val === 'number' ? String(val) : '--';
}

export class CoveragePanel {
    /**
     * @param {HTMLElement} container
     */
    constructor(container) {
        this.container = container;
        /** @type {CoverageMetrics | null} */
        this.metrics = null;
        this.isAnalyzing = false;
        this.render();
    }

    setMetrics(metrics) {
        this.metrics = metrics || null;
        this._renderValues();
    }

    setAnalyzing(isAnalyzing) {
        this.isAnalyzing = !!isAnalyzing;
        this.container.classList.toggle(styles.analyzing, !!isAnalyzing);
        this._renderValues();
    }

    render() {
        this.container.className = styles.root;
        this.container.innerHTML = `
          <div class="${styles.row}">
            <div class="${styles.cards}">
              <div class="${styles.card}" data-card="statement">
                <div class="${styles.label}">Statement Coverage</div>
                <div class="${styles.value}" data-role="statementValue">--</div>
                <div class="${styles.bar}">
                  <div class="${styles.fill}" data-role="statementFill" style="width:0%"></div>
                </div>
              </div>

              <div class="${styles.card}" data-card="branch">
                <div class="${styles.label}">Branch Coverage</div>
                <div class="${styles.value}" data-role="branchValue">--</div>
                <div class="${styles.bar}">
                  <div class="${styles.fill}" data-role="branchFill" style="width:0%"></div>
                </div>
              </div>

              <div class="${styles.card}" data-card="function">
                <div class="${styles.label}">Function Coverage</div>
                <div class="${styles.value}" data-role="functionValue">--</div>
                <div class="${styles.bar}">
                  <div class="${styles.fill}" data-role="functionFill" style="width:0%"></div>
                </div>
              </div>

              <div class="${styles.card}" data-card="cc">
                <div class="${styles.label}">Cyclomatic Complexity</div>
                <div class="${styles.value}" data-role="ccValue">--</div>
                <div class="${styles.subLabel}">CC Score</div>
                <div class="${styles.bar}">
                  <div class="${styles.fill}" data-role="ccFill" style="width:0%"></div>
                </div>
              </div>
            </div>

            <div class="${styles.side}">
              <div class="${styles.sideDivider}"></div>
              <div class="${styles.sideMeta}">
                <div class="${styles.metaLine}">
                  <span class="${styles.metaLabel}">Last analyzed</span>
                  <span class="${styles.metaValue}" data-role="analyzedAt">--</span>
                </div>
                <div class="${styles.metaLine}">
                  <span class="${styles.metaLabel}">File</span>
                  <span class="${styles.metaValue}" data-role="filename">--</span>
                </div>
                <div class="${styles.hint}" data-role="hint">Run analysis to see coverage metrics</div>
              </div>
            </div>
          </div>
        `;
        this._renderValues();
    }

    _renderValues() {
        const m = this.metrics;
        const analyzing = this.isAnalyzing;

        const statement = m?.statement;
        const branch = m?.branch;
        const func = m?.function;
        const cc = m?.cyclomaticComplexity;

        this._setMetric('statement', statement, analyzing, true);
        this._setMetric('branch', branch, analyzing, true);
        this._setMetric('function', func, analyzing, true);
        this._setMetric('cc', cc, analyzing, false);

        const analyzedAtEl = this.container.querySelector('[data-role="analyzedAt"]');
        const filenameEl = this.container.querySelector('[data-role="filename"]');
        const hintEl = this.container.querySelector('[data-role="hint"]');

        if (analyzedAtEl) analyzedAtEl.textContent = m?.analyzedAt ? new Date(m.analyzedAt).toLocaleString() : '--';
        if (filenameEl) filenameEl.textContent = m?.filename || '--';
        if (hintEl) hintEl.style.display = m ? 'none' : 'block';
    }

    _setMetric(kind, val, analyzing, isPct) {
        const valueEl = this.container.querySelector(`[data-role="${kind}Value"]`);
        const fillEl = this.container.querySelector(`[data-role="${kind}Fill"]`);

        const color = isPct ? pctColor(val) : ccColor(val);

        if (valueEl) {
            valueEl.style.color = color;
            valueEl.classList.toggle(styles.skeleton, analyzing);
            valueEl.textContent = analyzing ? ' ' : (isPct ? fmtPct(val) : fmtNum(val));
        }

        if (fillEl) {
            const width = (typeof val === 'number')
                ? (isPct ? Math.max(0, Math.min(100, val)) : Math.max(0, Math.min(100, (val / 25) * 100)))
                : 0;
            fillEl.style.width = `${width}%`;
            fillEl.style.background = color;
        }
    }
}

