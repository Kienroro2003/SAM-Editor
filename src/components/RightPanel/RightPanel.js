import styles from './RightPanel.module.css';

/**
 * @typedef {Object} TestCase
 * @property {string} id
 * @property {string} title
 * @property {string} pathLabel
 * @property {string} code
 *
 * @typedef {'high'|'medium'|'low'} Severity
 *
 * @typedef {Object} AISuggestion
 * @property {string} id
 * @property {Severity} severity
 * @property {string} title
 * @property {string} description
 * @property {number} line
 *
 * @typedef {Object} RightPanelProps
 * @property {TestCase[]} testCases
 * @property {AISuggestion[]} suggestions
 * @property {boolean} isVisible
 * @property {() => void} onClose
 * @property {(width: number) => void} [onWidthChange]
 */

function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return Promise.resolve();
}

function severityClass(sev) {
    if (sev === 'high') return styles.sevHigh;
    if (sev === 'medium') return styles.sevMedium;
    return styles.sevLow;
}

export class RightPanel {
    /**
     * @param {HTMLElement} container
     * @param {RightPanelProps} props
     */
    constructor(container, props) {
        this.container = container;
        this.props = { ...props };

        this.activeTab = 'testCases'; // 'testCases' | 'suggestions'
        this.width = 380;
        this.minWidth = 280;
        this.maxWidth = 600;

        this._isResizing = false;

        this.render();
        this.setVisible(!!props.isVisible);
    }

    destroy() {
        this.container.innerHTML = '';
        document.removeEventListener('mousemove', this._onMove);
        document.removeEventListener('mouseup', this._onUp);
    }

    setData({ testCases, suggestions }) {
        if (Array.isArray(testCases)) this.props.testCases = testCases;
        if (Array.isArray(suggestions)) this.props.suggestions = suggestions;
        this._renderList();
        this._renderHeaderCounts();
    }

    setVisible(isVisible) {
        this.props.isVisible = !!isVisible;
        this.container.classList.toggle(styles.visible, !!isVisible);
    }

    setWidth(px) {
        const w = Math.max(this.minWidth, Math.min(this.maxWidth, px));
        this.width = w;
        this.container.style.width = `${w}px`;
        this.props.onWidthChange?.(w);
    }

    render() {
        this.container.className = styles.panel;
        this.setWidth(this.width);

        this.container.innerHTML = `
          <div class="${styles.handle}" title="Resize"></div>
          <div class="${styles.header}">
            <div class="${styles.headerTitle}">SAM Analysis</div>
            <button class="${styles.closeBtn}" type="button" title="Close">✕</button>
          </div>
          <div class="${styles.tabs}">
            <button class="${styles.tabBtn} ${styles.active}" data-tab="testCases" type="button">
              Test Cases <span class="${styles.badge}" data-role="tcBadge">0</span>
            </button>
            <button class="${styles.tabBtn}" data-tab="suggestions" type="button">
              AI Suggestions <span class="${styles.badge}" data-role="aiBadge">0</span>
            </button>
          </div>
          <div class="${styles.content}">
            <div class="${styles.sectionHeader}">
              <div class="${styles.sectionTitle}" data-role="sectionTitle"></div>
              <span class="${styles.badge}" data-role="sectionBadge">0</span>
            </div>
            <div class="${styles.list}" data-role="list"></div>
          </div>
        `;

        this.container.querySelector(`.${styles.closeBtn}`)?.addEventListener('click', () => {
            this.props.onClose?.();
        });

        this.container.querySelectorAll(`.${styles.tabBtn}`).forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.activeTab = tab === 'suggestions' ? 'suggestions' : 'testCases';
                this._syncTabs();
                this._renderList();
                this._renderHeaderCounts();
            });
        });

        const handle = this.container.querySelector(`.${styles.handle}`);
        handle?.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this._isResizing = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            const startX = e.clientX;
            const startW = this.width;

            this._onMove = (ev) => {
                if (!this._isResizing) return;
                const delta = startX - ev.clientX; // drag left increases width
                this.setWidth(startW + delta);
            };
            this._onUp = () => {
                this._isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', this._onMove);
                document.removeEventListener('mouseup', this._onUp);
            };

            document.addEventListener('mousemove', this._onMove);
            document.addEventListener('mouseup', this._onUp);
        });

        this._syncTabs();
        this._renderList();
        this._renderHeaderCounts();
    }

    _syncTabs() {
        this.container.querySelectorAll(`.${styles.tabBtn}`).forEach(btn => {
            const tab = btn.dataset.tab;
            const isActive = (this.activeTab === 'suggestions' ? tab === 'suggestions' : tab === 'testCases');
            btn.classList.toggle(styles.active, isActive);
        });
    }

    _renderHeaderCounts() {
        const tcCount = this.props.testCases?.length || 0;
        const aiCount = this.props.suggestions?.length || 0;
        const tcBadge = this.container.querySelector('[data-role="tcBadge"]');
        const aiBadge = this.container.querySelector('[data-role="aiBadge"]');
        if (tcBadge) tcBadge.textContent = String(tcCount);
        if (aiBadge) aiBadge.textContent = String(aiCount);

        const title = this.container.querySelector('[data-role="sectionTitle"]');
        const badge = this.container.querySelector('[data-role="sectionBadge"]');
        if (this.activeTab === 'testCases') {
            if (title) title.textContent = 'Generated Test Cases';
            if (badge) badge.textContent = String(tcCount);
        } else {
            if (title) title.textContent = 'AI Suggestions';
            if (badge) badge.textContent = String(aiCount);
        }
    }

    _renderList() {
        const list = this.container.querySelector('[data-role="list"]');
        if (!list) return;

        const items = this.activeTab === 'testCases' ? (this.props.testCases || []) : (this.props.suggestions || []);
        list.innerHTML = '';

        if (!items.length) {
            const empty = document.createElement('div');
            empty.className = styles.empty;
            empty.innerHTML = `
              <div class="${styles.emptyIcon}">${this.activeTab === 'testCases' ? '🧪' : '✨'}</div>
              <div class="${styles.emptyText}">
                ${this.activeTab === 'testCases'
                    ? 'No test cases yet. Run analysis to generate.'
                    : 'Run analysis to get AI suggestions.'}
              </div>
            `;
            list.appendChild(empty);
            return;
        }

        if (this.activeTab === 'testCases') {
            items.forEach(tc => {
                const card = document.createElement('div');
                card.className = styles.card;
                card.innerHTML = `
                  <div class="${styles.cardTop}">
                    <div class="${styles.cardTitle}">${tc.title}</div>
                    <div class="${styles.cardSub}">${tc.pathLabel}</div>
                  </div>
                  <div class="${styles.codeWrap}">
                    <button class="${styles.copyBtn}" type="button" title="Copy">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                        <path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zm4 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h12v14z"/>
                      </svg>
                    </button>
                    <pre class="${styles.pre}"><code>${this._escape(tc.code)}</code></pre>
                  </div>
                `;
                card.querySelector(`.${styles.copyBtn}`)?.addEventListener('click', () => {
                    copyToClipboard(tc.code);
                });
                list.appendChild(card);
            });
        } else {
            items.forEach(s => {
                const card = document.createElement('div');
                card.className = styles.card;
                card.innerHTML = `
                  <div class="${styles.sugRow}">
                    <span class="${styles.sev} ${severityClass(s.severity)}">${String(s.severity).toUpperCase()}</span>
                    <div class="${styles.sugMain}">
                      <div class="${styles.cardTitle}">${s.title}</div>
                      <div class="${styles.sugDesc}">${s.description}</div>
                      <div class="${styles.sugFooter}">
                        <span class="${styles.lineChip}">Line ${s.line}</span>
                      </div>
                    </div>
                  </div>
                `;
                list.appendChild(card);
            });
        }
    }

    _escape(str) {
        return String(str)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
    }
}

