/**
 * Command Palette — Quick command search modal (Ctrl+Shift+P / Cmd+Shift+P).
 */
export class CommandPalette {
    constructor() {
        this.el = document.getElementById('command-palette');
        this.input = document.getElementById('command-palette-input');
        this.results = document.getElementById('command-palette-results');
        this.backdrop = this.el.querySelector('.command-palette-backdrop');
        this.isOpen = false;
        this.selectedIndex = 0;
        this.commands = [];
        this.filteredCommands = [];
        this._listeners = {};

        this._bindEvents();
    }

    on(event, fn) {
        (this._listeners[event] ||= []).push(fn);
    }

    emit(event, ...args) {
        (this._listeners[event] || []).forEach(fn => fn(...args));
    }

    registerCommands(commands) {
        this.commands = commands;
        this.filteredCommands = [...commands];
    }

    open() {
        this.isOpen = true;
        this.el.classList.remove('hidden');
        this.input.value = '';
        this.selectedIndex = 0;
        this.filteredCommands = [...this.commands];
        this._renderResults();
        requestAnimationFrame(() => this.input.focus());
    }

    close() {
        this.isOpen = false;
        this.el.classList.add('hidden');
        this.input.value = '';
        this.results.innerHTML = '';
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    _bindEvents() {
        // Close on backdrop click
        this.backdrop.addEventListener('click', () => this.close());

        // Filter on input
        this.input.addEventListener('input', () => {
            const query = this.input.value.toLowerCase().replace(/^>\s*/, '');
            this.filteredCommands = this.commands.filter(cmd =>
                cmd.label.toLowerCase().includes(query)
            );
            this.selectedIndex = 0;
            this._renderResults();
        });

        // Keyboard navigation
        this.input.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredCommands.length - 1);
                    this._renderResults();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                    this._renderResults();
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (this.filteredCommands[this.selectedIndex]) {
                        this._executeCommand(this.filteredCommands[this.selectedIndex]);
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    this.close();
                    break;
            }
        });
    }

    _executeCommand(cmd) {
        this.close();
        if (cmd.action) {
            cmd.action();
        }
        this.emit('commandExecuted', cmd);
    }

    _renderResults() {
        this.results.innerHTML = '';
        const query = this.input.value.toLowerCase().replace(/^>\s*/, '');

        this.filteredCommands.forEach((cmd, idx) => {
            const item = document.createElement('div');
            item.className = `command-item${idx === this.selectedIndex ? ' selected' : ''}`;

            // Label with highlighted match
            const label = document.createElement('span');
            label.className = 'command-item-label';
            if (query) {
                label.innerHTML = this._highlightMatch(cmd.label, query);
            } else {
                label.textContent = cmd.label;
            }
            item.appendChild(label);

            // Keybinding
            if (cmd.keybinding) {
                const kb = document.createElement('span');
                kb.className = 'command-item-keybinding';
                kb.innerHTML = cmd.keybinding.split('+').map(k => `<kbd>${k.trim()}</kbd>`).join('');
                item.appendChild(kb);
            }

            item.addEventListener('click', () => {
                this._executeCommand(cmd);
            });

            item.addEventListener('mouseenter', () => {
                this.selectedIndex = idx;
                this._renderResults();
            });

            this.results.appendChild(item);
        });

        // Scroll selected into view
        const selected = this.results.querySelector('.command-item.selected');
        if (selected) {
            selected.scrollIntoView({ block: 'nearest' });
        }
    }

    _highlightMatch(text, query) {
        const idx = text.toLowerCase().indexOf(query);
        if (idx === -1) return text;
        return text.substring(0, idx) +
            `<span class="highlight">${text.substring(idx, idx + query.length)}</span>` +
            text.substring(idx + query.length);
    }
}
