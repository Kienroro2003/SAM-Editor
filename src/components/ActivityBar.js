/**
 * Activity Bar — Vertical icon bar on the far left.
 */
export class ActivityBar {
    constructor(container) {
        this.container = container;
        this.activeItem = 'explorer';
        this._listeners = {};
        this.render();
    }

    on(event, fn) {
        (this._listeners[event] ||= []).push(fn);
    }

    emit(event, ...args) {
        (this._listeners[event] || []).forEach(fn => fn(...args));
    }

    render() {
        this.container.innerHTML = `
      <div class="activity-bar-top">
        <button class="activity-item active" data-id="explorer" title="Explorer (Ctrl+Shift+E)">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.5 0h-9L7 1.5V6H2.5L1 7.5v15.07L2.5 24h12.07L16 22.57V18h4.7l1.3-1.43V4.5L17.5 0zm0 2.12l2.38 2.38H17.5V2.12zm-3 20.38h-12V7.5H7v12.07L8.5 21h6v1.5zm4.5-3h-12V1.5H16V6h4.5v13.5z"/>
          </svg>
        </button>
        <button class="activity-item" data-id="search" title="Search (Ctrl+Shift+F)">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.25 1a6.75 6.75 0 0 0-6.044 3.738L1 12.943V21h8.057l8.205-8.206A6.75 6.75 0 0 0 15.25 1zm4.235 11.263L12.118 19.5H2.5v-5.618l7.237-7.367A5.25 5.25 0 1 1 19.485 12.263z"/>
            <circle cx="15.25" cy="7.75" r="2"/>
          </svg>
        </button>
        <button class="activity-item" data-id="git" title="Source Control (Ctrl+Shift+G)">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M21.007 8.222A3.738 3.738 0 0 0 15.045 5.2a3.737 3.737 0 0 0 1.156 6.583 2.988 2.988 0 0 1-2.668 1.67h-2.99a4.456 4.456 0 0 0-2.989 1.165V7.401a3.737 3.737 0 1 0-1.494 0v9.117a3.718 3.718 0 1 0 1.494.078V14.96a2.988 2.988 0 0 1 2.989-1.165h2.99a4.456 4.456 0 0 0 4.455-3.993A3.738 3.738 0 0 0 21.007 8.222zM4.016 3.82a2.244 2.244 0 1 1 2.244 2.244A2.246 2.246 0 0 1 4.016 3.82zm2.244 17.855a2.244 2.244 0 1 1 2.244-2.244 2.246 2.246 0 0 1-2.244 2.244zm9.468-10.04a2.244 2.244 0 1 1 2.244-2.244 2.246 2.246 0 0 1-2.244 2.244z"/>
          </svg>
        </button>
        <button class="activity-item" data-id="debug" title="Run and Debug (Ctrl+Shift+D)">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M10.94 13.5l-1.32 1.32a3.73 3.73 0 0 0-7.24 0L1.06 13.5 0 14.56l1.72 1.72-.22.22V18H0v1.5h1.5v.08c.077.489.214.966.41 1.42L.41 22.5 1.5 23.6l1.28-1.28c.87.72 1.97 1.18 3.22 1.18 1.25 0 2.35-.46 3.22-1.18l1.28 1.28 1.06-1.06-1.5-1.5c.2-.46.34-.94.41-1.44V19.5H12V18h-1.5v-1.5l-.22-.22L12 14.56l-1.06-1.06zM6 21a2.25 2.25 0 0 1-2.25-2.25V16.5a2.25 2.25 0 0 1 4.5 0v2.25A2.25 2.25 0 0 1 6 21z"/>
            <path d="M22.5 7.5L24 9l-1.5 1.5L24 12l-1.5 1.5-1.5-1.5-1.5 1.5L18 12l1.5-1.5L18 9l1.5-1.5L21 9l1.5-1.5z" opacity="0.5"/>
          </svg>
        </button>
        <button class="activity-item" data-id="extensions" title="Extensions (Ctrl+Shift+X)">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M13.5 1.5L15 0h7.5L24 1.5V9l-1.5 1.5H15L13.5 9V1.5zM15 9h7.5V1.5H15V9zM0 15l1.5-1.5H9L10.5 15v7.5L9 24H1.5L0 22.5V15zm1.5 7.5H9V15H1.5v7.5zM13.5 15l1.5-1.5h7.5L24 15v7.5L22.5 24H15l-1.5-1.5V15zM15 22.5h7.5V15H15v7.5zM0 1.5L1.5 0H9l1.5 1.5V9L9 10.5H1.5L0 9V1.5zM1.5 9H9V1.5H1.5V9z"/>
          </svg>
        </button>
        <button class="activity-item" data-id="sam-analysis" title="SAM Analysis">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 2h6v2h-1v5.586l4.707 7.06A3 3 0 0 1 16.21 21H7.79a3 3 0 0 1-2.497-4.354L10 9.586V4H9V2zm3 10.236-5.04 7.56A1 1 0 0 0 7.79 20h8.42a1 1 0 0 0 .832-1.56L12 12.236z" opacity="0.95"/>
            <path d="M8.5 14.5h7v1.5h-7z" opacity="0.5"/>
          </svg>
        </button>
      </div>
      <div class="activity-bar-bottom">
        <button class="activity-item" data-id="account" title="Account">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
          </svg>
        </button>
        <button class="activity-item" data-id="settings" title="Settings (Ctrl+,)">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
      </div>
    `;

        // Bind click events
        this.container.querySelectorAll('.activity-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                if (id !== 'sam-analysis') {
                    this.setActive(id);
                }
                this.emit('itemClicked', id);
            });
        });
    }

    setActive(id) {
        this.container.querySelectorAll('.activity-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id === id);
        });
        this.activeItem = id;
    }

    setSamAnalysisActive(active) {
        const btn = this.container.querySelector('.activity-item[data-id="sam-analysis"]');
        if (btn) btn.classList.toggle('active', !!active);
    }
}
