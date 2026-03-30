/**
 * Editor Tabs — Tab bar for multiple open files.
 */
export class EditorTabs {
    constructor(container) {
        this.container = container;
        this.tabs = []; // [{ path, filename, modified }]
        this.activeTab = null;
        this._listeners = {};
    }

    on(event, fn) {
        (this._listeners[event] ||= []).push(fn);
    }

    emit(event, ...args) {
        (this._listeners[event] || []).forEach(fn => fn(...args));
    }

    addTab(path, filename) {
        if (this.tabs.find(t => t.path === path)) {
            this.setActive(path);
            return;
        }

        this.tabs.push({ path, filename, modified: false });
        this.setActive(path);
        this.render();
    }

    removeTab(path) {
        const idx = this.tabs.findIndex(t => t.path === path);
        if (idx === -1) return;

        this.tabs.splice(idx, 1);

        if (this.activeTab === path) {
            // Activate the neighboring tab
            if (this.tabs.length > 0) {
                const nextIdx = Math.min(idx, this.tabs.length - 1);
                this.activeTab = this.tabs[nextIdx].path;
            } else {
                this.activeTab = null;
            }
        }

        this.render();
        this.emit('tabClosed', path);
        if (this.activeTab) {
            this.emit('tabActivated', this.activeTab);
        } else {
            this.emit('allTabsClosed');
        }
    }

    setActive(path) {
        if (this.activeTab === path) return;
        this.activeTab = path;
        this.render();
        this.emit('tabActivated', path);
    }

    setModified(path, modified) {
        const tab = this.tabs.find(t => t.path === path);
        if (tab) {
            tab.modified = modified;
            this.render();
        }
    }

    updateTabPath(oldPath, newPath, newFilename) {
        const tab = this.tabs.find(t => t.path === oldPath);
        if (tab) {
            tab.path = newPath;
            tab.filename = newFilename;
            if (this.activeTab === oldPath) {
                this.activeTab = newPath;
            }
            this.render();
        }
    }

    getTab(path) {
        return this.tabs.find(t => t.path === path);
    }

    getTabs() {
        return this.tabs;
    }

    render() {
        this.container.innerHTML = '';

        if (this.tabs.length === 0) {
            this.container.style.display = 'none';
            return;
        }

        this.container.style.display = 'flex';

        this.tabs.forEach(tab => {
            const tabEl = document.createElement('div');
            tabEl.className = `editor-tab${tab.path === this.activeTab ? ' active' : ''}${tab.modified ? ' modified' : ''}`;
            tabEl.dataset.path = tab.path;

            // Tab icon
            const icon = document.createElement('span');
            icon.className = 'tab-icon';
            icon.innerHTML = this._getTabIcon(tab.filename);
            tabEl.appendChild(icon);

            // Tab label
            const label = document.createElement('span');
            label.className = 'tab-label';
            label.textContent = tab.filename;
            tabEl.appendChild(label);

            // Modified dot
            const modifiedDot = document.createElement('span');
            modifiedDot.className = 'tab-modified';
            tabEl.appendChild(modifiedDot);

            // Close button
            const closeBtn = document.createElement('button');
            closeBtn.className = 'tab-close';
            closeBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8.707l3.646 3.647.708-.708L8.707 8l3.647-3.646-.708-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/></svg>`;
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('tabCloseRequested', tab.path);
            });
            tabEl.appendChild(closeBtn);

            // Click to activate
            tabEl.addEventListener('click', () => {
                this.setActive(tab.path);
            });

            // Middle-click to close
            tabEl.addEventListener('mousedown', (e) => {
                if (e.button === 1) {
                    e.preventDefault();
                    this.emit('tabCloseRequested', tab.path);
                }
            });

            this.container.appendChild(tabEl);
        });

        // Scroll active tab into view
        requestAnimationFrame(() => {
            const activeEl = this.container.querySelector('.editor-tab.active');
            if (activeEl) {
                activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
        });
    }

    _getTabIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const colorMap = {
            'js': '#f0db4f', 'mjs': '#f0db4f', 'jsx': '#61dafb',
            'ts': '#3178c6', 'tsx': '#3178c6',
            'html': '#e34c26', 'htm': '#e34c26',
            'css': '#563d7c', 'scss': '#cd6799', 'less': '#1d365d',
            'json': '#f0db4f', 'md': '#519aba',
            'py': '#3776ab', 'go': '#00add8', 'rs': '#dea584',
            'java': '#b07219'
        };
        const color = colorMap[ext] || '#969696';
        return `<svg width="14" height="14" viewBox="0 0 16 16" fill="${color}"><path d="M13 4H9.42L8 2.59 7.59 2H2.5l-.5.5v11l.5.5h11l.5-.5V4.5L13 4zm-.5 9h-9V3h4.59L9.5 4.41 10 5h3v8z"/></svg>`;
    }
}
