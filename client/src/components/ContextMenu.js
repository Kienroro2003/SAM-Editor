/**
 * Context Menu — Right-click context menu for the file explorer.
 */
export class ContextMenu {
    constructor() {
        this.el = document.getElementById('context-menu');
        this.list = this.el.querySelector('.context-menu-list');
        this.backdrop = this.el.querySelector('.context-menu-backdrop');
        this.isOpen = false;
        this._listeners = {};

        this.backdrop.addEventListener('click', () => this.close());
    }

    on(event, fn) {
        (this._listeners[event] ||= []).push(fn);
    }

    emit(event, ...args) {
        (this._listeners[event] || []).forEach(fn => fn(...args));
    }

    show(x, y, items) {
        this.list.innerHTML = '';

        items.forEach(item => {
            if (item.separator) {
                const sep = document.createElement('li');
                sep.className = 'context-menu-separator';
                this.list.appendChild(sep);
                return;
            }

            const li = document.createElement('li');
            li.className = 'context-menu-item';

            const label = document.createElement('span');
            label.textContent = item.label;
            li.appendChild(label);

            if (item.shortcut) {
                const shortcut = document.createElement('span');
                shortcut.className = 'context-menu-item-shortcut';
                shortcut.textContent = item.shortcut;
                li.appendChild(shortcut);
            }

            li.addEventListener('click', () => {
                this.close();
                if (item.action) item.action();
            });

            this.list.appendChild(li);
        });

        // Position menu
        this.list.style.left = `${x}px`;
        this.list.style.top = `${y}px`;
        this.el.classList.remove('hidden');
        this.isOpen = true;

        // Adjust if overflowing viewport
        requestAnimationFrame(() => {
            const rect = this.list.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                this.list.style.left = `${window.innerWidth - rect.width - 4}px`;
            }
            if (rect.bottom > window.innerHeight) {
                this.list.style.top = `${window.innerHeight - rect.height - 4}px`;
            }
        });
    }

    close() {
        this.el.classList.add('hidden');
        this.isOpen = false;
    }
}
