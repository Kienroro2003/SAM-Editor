import styles from './AnalyzeToolbar.module.css';

/**
 * @typedef {Object} AnalyzeToolbarProps
 * @property {(code: string, filename: string, language: string) => void} onAnalyze
 * @property {(code: string, filename: string, language: string) => void} onCodeLoad
 * @property {() => boolean} isAnalyzing
 */

const EXT_TO_LANG = {
    '.js': 'javascript',
    '.ts': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.c': 'cpp',
    '.cpp': 'cpp'
};

function detectLanguage(filename) {
    const lower = (filename || '').toLowerCase();
    const ext = Object.keys(EXT_TO_LANG).find(e => lower.endsWith(e));
    return ext ? EXT_TO_LANG[ext] : 'plaintext';
}

function languageLabel(lang) {
    switch (lang) {
        case 'javascript': return 'JavaScript';
        case 'typescript': return 'TypeScript';
        case 'python': return 'Python';
        case 'java': return 'Java';
        case 'cpp': return 'C / C++';
        default: return 'Auto-detect';
    }
}

export class AnalyzeToolbar {
    /**
     * @param {HTMLElement} container
     * @param {AnalyzeToolbarProps} props
     */
    constructor(container, props) {
        this.container = container;
        this.props = props;

        this.filename = '';
        this.code = '';
        this.languageMode = 'auto'; // 'auto' | specific
        this.detectedLanguage = 'plaintext';

        this._fileInput = null;
        this._importBtn = null;
        this._chip = null;
        this._langSelect = null;
        this._analyzeBtn = null;
        this._analyzeSpinner = null;

        this.render();
        this._startTick();
    }

    destroy() {
        this._stopTick();
        this.container.innerHTML = '';
    }

    _startTick() {
        this._tick = window.setInterval(() => {
            this._syncUI();
        }, 100);
    }

    _stopTick() {
        if (this._tick) {
            window.clearInterval(this._tick);
            this._tick = null;
        }
    }

    _effectiveLanguage() {
        return this.languageMode === 'auto' ? this.detectedLanguage : this.languageMode;
    }

    _clearLoaded() {
        this.filename = '';
        this.code = '';
        this.detectedLanguage = 'plaintext';
        this.languageMode = 'auto';
        if (this._fileInput) this._fileInput.value = '';
        this._syncUI();
    }

    _syncUI() {
        const analyzing = !!this.props.isAnalyzing?.();
        const hasFile = !!this.filename && typeof this.code === 'string';

        if (this._chip) {
            this._chip.classList.toggle(styles.hidden, !hasFile);
            const nameEl = this._chip.querySelector(`[data-role="filename"]`);
            if (nameEl) nameEl.textContent = this.filename || '';
        }

        if (this._langSelect) {
            // keep select in sync if user cleared
            if (!hasFile && this._langSelect.value !== 'auto') this._langSelect.value = 'auto';
        }

        if (this._analyzeBtn) {
            this._analyzeBtn.disabled = !hasFile || analyzing;
            this._analyzeBtn.classList.toggle(styles.primaryDisabled, this._analyzeBtn.disabled);
        }
        if (this._analyzeSpinner) {
            this._analyzeSpinner.classList.toggle(styles.hidden, !analyzing);
        }
    }

    render() {
        this.container.classList.add(styles.toolbar);

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.js,.ts,.java,.py,.c,.cpp';
        input.className = styles.hiddenInput;
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) return;

            const text = await file.text();
            this.filename = file.name;
            this.code = text;
            this.detectedLanguage = detectLanguage(file.name);
            this.languageMode = 'auto';

            this.props.onCodeLoad?.(this.code, this.filename, this._effectiveLanguage());
            this._syncUI();
        });
        this._fileInput = input;

        const importBtn = document.createElement('button');
        importBtn.type = 'button';
        importBtn.className = styles.button;
        importBtn.innerHTML = `<span class="${styles.btnIcon}">📂</span><span>Import File</span>`;
        importBtn.addEventListener('click', () => input.click());
        this._importBtn = importBtn;

        const chip = document.createElement('div');
        chip.className = `${styles.chip} ${styles.hidden}`;
        chip.innerHTML = `
          <span class="${styles.chipIcon}">📄</span>
          <span class="${styles.chipText}" data-role="filename"></span>
          <button type="button" class="${styles.chipClose}" title="Clear">✕</button>
        `;
        chip.querySelector('button')?.addEventListener('click', () => this._clearLoaded());
        this._chip = chip;

        const divider = document.createElement('span');
        divider.className = styles.divider;
        divider.textContent = '|';

        const selectWrap = document.createElement('div');
        selectWrap.className = styles.selectWrap;
        const selectLabel = document.createElement('span');
        selectLabel.className = styles.selectLabel;
        selectLabel.textContent = 'Language';
        const select = document.createElement('select');
        select.className = styles.select;
        select.innerHTML = `
          <option value="auto">Auto-detect</option>
          <option value="javascript">JavaScript</option>
          <option value="typescript">TypeScript</option>
          <option value="python">Python</option>
          <option value="java">Java</option>
        `;
        select.value = 'auto';
        select.addEventListener('change', () => {
            this.languageMode = select.value;
            if (this.filename && this.code) {
                this.props.onCodeLoad?.(this.code, this.filename, this._effectiveLanguage());
            }
        });
        this._langSelect = select;
        selectWrap.appendChild(selectLabel);
        selectWrap.appendChild(select);

        const spacer = document.createElement('div');
        spacer.className = styles.spacer;

        const analyzeBtn = document.createElement('button');
        analyzeBtn.type = 'button';
        analyzeBtn.className = `${styles.button} ${styles.primary}`;
        analyzeBtn.innerHTML = `
          <span class="${styles.btnIcon}">⚡</span>
          <span>Analyze</span>
          <span class="${styles.spinner} ${styles.hidden}" aria-hidden="true"></span>
        `;
        analyzeBtn.disabled = true;
        analyzeBtn.addEventListener('click', () => {
            if (!this.filename || !this.code) return;
            this.props.onAnalyze?.(this.code, this.filename, this._effectiveLanguage());
        });
        this._analyzeBtn = analyzeBtn;
        this._analyzeSpinner = analyzeBtn.querySelector(`.${styles.spinner}`);

        // Assemble
        this.container.innerHTML = '';
        this.container.appendChild(input);
        this.container.appendChild(importBtn);
        this.container.appendChild(chip);
        this.container.appendChild(divider);
        this.container.appendChild(selectWrap);
        this.container.appendChild(spacer);
        this.container.appendChild(analyzeBtn);

        this._syncUI();
    }
}

