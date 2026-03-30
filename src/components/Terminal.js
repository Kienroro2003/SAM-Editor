/**
 * Terminal — Simulated terminal panel using xterm.js.
 */
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

export class Terminal {
    constructor(container) {
        this.container = container;
        this.term = null;
        this.fitAddon = null;
        this.currentLine = '';
        this.history = [];
        this.historyIndex = -1;
        this.cwd = '~/sam-project';
        this._listeners = {};
        this.init();
    }

    on(event, fn) {
        (this._listeners[event] ||= []).push(fn);
    }

    emit(event, ...args) {
        (this._listeners[event] || []).forEach(fn => fn(...args));
    }

    init() {
        this.term = new XTerm({
            theme: {
                background: '#1e1e1e',
                foreground: '#cccccc',
                cursor: '#ffffff',
                cursorAccent: '#1e1e1e',
                selectionBackground: '#264f78',
                black: '#1e1e1e',
                red: '#f44747',
                green: '#6a9955',
                yellow: '#d7ba7d',
                blue: '#569cd6',
                magenta: '#c586c0',
                cyan: '#4ec9b0',
                white: '#d4d4d4',
                brightBlack: '#808080',
                brightRed: '#f44747',
                brightGreen: '#6a9955',
                brightYellow: '#d7ba7d',
                brightBlue: '#569cd6',
                brightMagenta: '#c586c0',
                brightCyan: '#4ec9b0',
                brightWhite: '#ffffff'
            },
            fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
            fontSize: 13,
            lineHeight: 1.4,
            cursorBlink: true,
            cursorStyle: 'bar',
            scrollback: 1000,
            allowProposedApi: true
        });

        this.fitAddon = new FitAddon();
        this.term.loadAddon(this.fitAddon);
        this.term.open(this.container);

        // Fit terminal to container size
        requestAnimationFrame(() => {
            try { this.fitAddon.fit(); } catch (e) { /* ignore */ }
        });

        // Welcome message
        this.term.writeln('\x1b[1;34m╭──────────────────────────────────────────────╮\x1b[0m');
        this.term.writeln('\x1b[1;34m│\x1b[0m  \x1b[1;36mSAM Code Editor\x1b[0m - Integrated Terminal       \x1b[1;34m│\x1b[0m');
        this.term.writeln('\x1b[1;34m│\x1b[0m  Type \x1b[1;33mhelp\x1b[0m for available commands             \x1b[1;34m│\x1b[0m');
        this.term.writeln('\x1b[1;34m╰──────────────────────────────────────────────╯\x1b[0m');
        this.term.writeln('');
        this._writePrompt();

        // Handle input
        this.term.onData((data) => {
            this._handleInput(data);
        });

        // Handle resize
        window.addEventListener('resize', () => {
            this.fit();
        });
    }

    _writePrompt() {
        this.term.write(`\x1b[1;32m➜\x1b[0m \x1b[1;36m${this.cwd}\x1b[0m \x1b[1;33m$\x1b[0m `);
    }

    _handleInput(data) {
        const code = data.charCodeAt(0);

        if (data === '\r') {
            // Enter
            this.term.writeln('');
            if (this.currentLine.trim()) {
                this.history.push(this.currentLine);
                this.historyIndex = this.history.length;
                this._executeCommand(this.currentLine.trim());
            } else {
                this._writePrompt();
            }
            this.currentLine = '';
        } else if (data === '\x7f') {
            // Backspace
            if (this.currentLine.length > 0) {
                this.currentLine = this.currentLine.slice(0, -1);
                this.term.write('\b \b');
            }
        } else if (data === '\x1b[A') {
            // Up arrow - history
            if (this.historyIndex > 0) {
                // Clear current line
                this.term.write('\x1b[2K\r');
                this._writePrompt();
                this.historyIndex--;
                this.currentLine = this.history[this.historyIndex];
                this.term.write(this.currentLine);
            }
        } else if (data === '\x1b[B') {
            // Down arrow - history
            this.term.write('\x1b[2K\r');
            this._writePrompt();
            if (this.historyIndex < this.history.length - 1) {
                this.historyIndex++;
                this.currentLine = this.history[this.historyIndex];
                this.term.write(this.currentLine);
            } else {
                this.historyIndex = this.history.length;
                this.currentLine = '';
            }
        } else if (data === '\x03') {
            // Ctrl+C
            this.term.writeln('^C');
            this.currentLine = '';
            this._writePrompt();
        } else if (code >= 32) {
            // Printable characters
            this.currentLine += data;
            this.term.write(data);
        }
    }

    _executeCommand(cmd) {
        const parts = cmd.split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        switch (command) {
            case 'help':
                this.term.writeln('');
                this.term.writeln('\x1b[1;36mAvailable commands:\x1b[0m');
                this.term.writeln('  \x1b[1;33mhelp\x1b[0m           Show this help message');
                this.term.writeln('  \x1b[1;33mclear\x1b[0m          Clear terminal');
                this.term.writeln('  \x1b[1;33mecho\x1b[0m  <text>   Print text');
                this.term.writeln('  \x1b[1;33mdate\x1b[0m           Show current date');
                this.term.writeln('  \x1b[1;33mls\x1b[0m             List files');
                this.term.writeln('  \x1b[1;33mpwd\x1b[0m            Print working directory');
                this.term.writeln('  \x1b[1;33mwhoami\x1b[0m         Show current user');
                this.term.writeln('  \x1b[1;33muname\x1b[0m          Show system info');
                this.term.writeln('  \x1b[1;33mnpm\x1b[0m            Simulate npm commands');
                this.term.writeln('  \x1b[1;33mnode\x1b[0m  -v       Show Node.js version');
                this.term.writeln('  \x1b[1;33mgit\x1b[0m            Simulate git commands');
                this.term.writeln('');
                break;

            case 'clear':
                this.term.clear();
                break;

            case 'echo':
                this.term.writeln(args.join(' '));
                break;

            case 'date':
                this.term.writeln(new Date().toString());
                break;

            case 'ls':
                this.term.writeln('\x1b[1;34msrc/\x1b[0m    \x1b[1;34mpublic/\x1b[0m    \x1b[1;34mnode_modules/\x1b[0m');
                this.term.writeln('\x1b[0mpackage.json    README.md    tsconfig.json    .gitignore\x1b[0m');
                break;

            case 'pwd':
                this.term.writeln(`/home/user/projects/sam-project`);
                break;

            case 'whoami':
                this.term.writeln('developer');
                break;

            case 'uname':
                this.term.writeln('SAM-OS 1.0.0 (Web Terminal)');
                break;

            case 'npm':
                if (args[0] === 'run' && args[1] === 'dev') {
                    this.term.writeln('\x1b[1;32m> sam-project@1.0.0 dev\x1b[0m');
                    this.term.writeln('\x1b[1;32m> vite\x1b[0m');
                    this.term.writeln('');
                    this.term.writeln('\x1b[1;36m  VITE v5.0.0\x1b[0m  ready in \x1b[1;33m120\x1b[0m ms');
                    this.term.writeln('');
                    this.term.writeln('  \x1b[1;32m➜\x1b[0m  \x1b[1mLocal:\x1b[0m   \x1b[36mhttp://localhost:5173/\x1b[0m');
                    this.term.writeln('  \x1b[1;32m➜\x1b[0m  \x1b[1mNetwork:\x1b[0m \x1b[36mhttp://192.168.1.100:5173/\x1b[0m');
                    this.term.writeln('');
                } else if (args[0] === 'install' || args[0] === 'i') {
                    this.term.writeln('\x1b[90madded 150 packages in 3s\x1b[0m');
                    this.term.writeln('');
                } else if (args[0] === '-v' || args[0] === '--version') {
                    this.term.writeln('10.2.4');
                } else {
                    this.term.writeln(`npm \x1b[1;33mWARN\x1b[0m Unknown command: ${args.join(' ')}`);
                }
                break;

            case 'node':
                if (args[0] === '-v' || args[0] === '--version') {
                    this.term.writeln('v20.11.1');
                } else {
                    this.term.writeln('Welcome to Node.js v20.11.1.');
                    this.term.writeln('Type ".exit" to exit.');
                }
                break;

            case 'git':
                if (args[0] === 'status') {
                    this.term.writeln('On branch \x1b[1;32mmain\x1b[0m');
                    this.term.writeln('Your branch is up to date with \'origin/main\'.');
                    this.term.writeln('');
                    this.term.writeln('nothing to commit, working tree clean');
                } else if (args[0] === 'log') {
                    this.term.writeln('\x1b[33mcommit a1b2c3d\x1b[0m (HEAD -> \x1b[1;32mmain\x1b[0m)');
                    this.term.writeln('Author: Developer <dev@example.com>');
                    this.term.writeln('Date:   Mon Mar 17 2026 12:00:00');
                    this.term.writeln('');
                    this.term.writeln('    Initial commit');
                } else if (args[0] === 'branch') {
                    this.term.writeln('* \x1b[1;32mmain\x1b[0m');
                    this.term.writeln('  develop');
                    this.term.writeln('  feature/auth');
                } else {
                    this.term.writeln(`git: '${args.join(' ')}' simulated.`);
                }
                break;

            default:
                this.term.writeln(`\x1b[1;31mcommand not found:\x1b[0m ${command}`);
                this.term.writeln(`Type \x1b[1;33mhelp\x1b[0m for available commands.`);
                break;
        }

        this._writePrompt();
    }

    fit() {
        if (this.fitAddon) {
            try { this.fitAddon.fit(); } catch (e) { /* ignore */ }
        }
    }

    clear() {
        if (this.term) {
            this.term.clear();
        }
    }

    focus() {
        if (this.term) {
            this.term.focus();
        }
    }
}
