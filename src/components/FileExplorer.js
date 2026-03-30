/**
 * File Explorer — Tree view of the virtual file system.
 */
export class FileExplorer {
    constructor(container, fileSystem) {
        this.container = container;
        this.fs = fileSystem;
        this.expandedDirs = new Set(['/']);
        this.selectedPath = null;
        this._listeners = {};

        this.render();
        this._bindFSEvents();
    }

    on(event, fn) {
        (this._listeners[event] ||= []).push(fn);
    }

    emit(event, ...args) {
        (this._listeners[event] || []).forEach(fn => fn(...args));
    }

    _bindFSEvents() {
        this.fs.on('fileCreated', () => this.render());
        this.fs.on('directoryCreated', () => this.render());
        this.fs.on('deleted', () => this.render());
        this.fs.on('renamed', () => this.render());
        this.fs.on('fileSaved', () => this.render());
    }

    render() {
        this.container.innerHTML = '';

        const section = document.createElement('div');
        section.className = 'tree-section';

        // Section header
        const header = document.createElement('div');
        header.className = 'tree-section-header';
        header.innerHTML = `
      <span class="tree-section-arrow">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6 4l4 4-4 4V4z"/>
        </svg>
      </span>
      <span>${this.fs.root.name.toUpperCase()}</span>
    `;
        header.addEventListener('click', () => {
            const arrow = header.querySelector('.tree-section-arrow');
            const content = header.nextElementSibling;
            if (content) {
                arrow.classList.toggle('collapsed');
                content.classList.toggle('hidden');
            }
        });
        section.appendChild(header);

        // Tree content
        const treeContent = document.createElement('div');
        this._renderNode(this.fs.root, treeContent, 0);
        section.appendChild(treeContent);

        this.container.appendChild(section);
    }

    _renderNode(node, parentEl, depth) {
        if (node.type === 'directory') {
            node.children.forEach(child => {
                if (child.type === 'directory') {
                    const isExpanded = this.expandedDirs.has(child.path);
                    const dirItem = this._createTreeItem(child, depth, true, isExpanded);
                    parentEl.appendChild(dirItem);

                    if (isExpanded && child.children.length > 0) {
                        const childContainer = document.createElement('div');
                        childContainer.className = 'tree-children';
                        this._renderNode(child, childContainer, depth + 1);
                        parentEl.appendChild(childContainer);
                    }
                }
            });

            // Files after directories
            node.children.forEach(child => {
                if (child.type === 'file') {
                    const fileItem = this._createTreeItem(child, depth, false, false);
                    parentEl.appendChild(fileItem);
                }
            });
        }
    }

    _createTreeItem(node, depth, isDir, isExpanded) {
        const item = document.createElement('div');
        item.className = 'tree-item';
        if (node.path === this.selectedPath) {
            item.classList.add('selected');
        }
        item.style.setProperty('--depth', depth);
        item.dataset.path = node.path;
        item.dataset.type = node.type;

        // Arrow (for directories)
        const arrow = document.createElement('span');
        arrow.className = `tree-item-arrow${isDir ? (isExpanded ? '' : ' collapsed') : ' hidden'}`;
        arrow.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4V4z"/></svg>`;
        item.appendChild(arrow);

        // Icon
        const icon = document.createElement('span');
        icon.className = 'tree-item-icon';
        icon.innerHTML = this._getFileIcon(node);
        item.appendChild(icon);

        // Label
        const label = document.createElement('span');
        label.className = 'tree-item-label';
        label.textContent = node.name;
        item.appendChild(label);

        // Click handler
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectedPath = node.path;
            this._updateSelection();

            if (isDir) {
                if (this.expandedDirs.has(node.path)) {
                    this.expandedDirs.delete(node.path);
                } else {
                    this.expandedDirs.add(node.path);
                }
                this.render();
            } else {
                this.emit('fileSelected', node);
            }
        });

        // Double-click to open file
        item.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (!isDir) {
                this.emit('fileOpened', node);
            }
        });

        // Context menu
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.selectedPath = node.path;
            this._updateSelection();
            this.emit('contextMenu', { node, x: e.clientX, y: e.clientY });
        });

        return item;
    }

    _updateSelection() {
        this.container.querySelectorAll('.tree-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.path === this.selectedPath);
        });
    }

    _getFileIcon(node) {
        if (node.type === 'directory') {
            const isOpen = this.expandedDirs.has(node.path);
            return isOpen
                ? `<svg class="file-icon-folder-open" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5l.5-.5h4l1 1H13l.5.5v2h-1V5H6.5l-1-1H2v8h4v1H1.5l-.5-.5v-9z"/><path d="M5 7.5l.5-.5h9l.5.5-.5 5.5H5.5L5 7.5zm1 .5v4h8l.5-4H6z"/></svg>`
                : `<svg class="file-icon-folder" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14 4H8l-1-2H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zm0 9H2V5h12v8z"/></svg>`;
        }

        const ext = node.name.split('.').pop().toLowerCase();
        const iconClass = this._getIconClass(ext);

        switch (ext) {
            case 'js':
            case 'mjs':
                return `<svg class="${iconClass}" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h12v12H2V2zm1 1v10h10V3H3zm3 6.5c0 .83-.67 1.5-1.5 1.5S3 10.33 3 9.5V8h1v1.5c0 .28.22.5.5.5s.5-.22.5-.5V6h1v3.5zm5-1c0 .83-.67 1.5-1.5 1.5H8V8h1.5c.28 0 .5-.22.5-.5s-.22-.5-.5-.5H8V6h1.5C10.33 6 11 6.67 11 7.5v1z"/></svg>`;
            case 'jsx':
                return `<svg class="${iconClass}" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM4.5 5c.83 0 1.5.67 1.5 1.5S5.33 8 4.5 8 3 7.33 3 6.5 3.67 5 4.5 5zm7 0c.83 0 1.5.67 1.5 1.5S12.33 8 11.5 8 10 7.33 10 6.5s.67-1.5 1.5-1.5zM8 12c-2.33 0-4-1.5-4-3h8c0 1.5-1.67 3-4 3z"/></svg>`;
            case 'ts':
            case 'tsx':
                return `<svg class="${iconClass}" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h12v12H2V2zm1 1v10h10V3H3zm2 3h4v1H7.5v3.5h-1V7H5V6zm5.5 0H12v1h-1v1.5c0 .83-.67 1.5-1.5 1.5S8 9.33 8 8.5h1c0 .28.22.5.5.5s.5-.22.5-.5V7h-1.5V6z"/></svg>`;
            case 'html':
            case 'htm':
                return `<svg class="${iconClass}" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 1l1.275 12.842L8 15l5.723-1.158L15 1H1zm10.94 4.156H5.477l.15 1.672h6.163L11.3 12l-3.3.917L4.7 12l-.22-2.48h1.63l.113 1.272L8 11.37l1.777-.578.193-2.136H4.41L3.978 3.844h8.044l-.082 1.312z"/></svg>`;
            case 'css':
            case 'scss':
            case 'less':
                return `<svg class="${iconClass}" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h12v12H2V2zm1 1v10h10V3H3zm3 3c.93 0 1.75.638 1.75 1.5 0 .862-.18 1.083-.75 1.5-.57.417-1 .767-1 1.5h2v1H5c0-1.253.535-1.662 1.12-2.1.407-.305.63-.5.63-.9C6.75 6.863 6.4 7 6 7c-.4 0-.75-.138-.75-.5S5.07 6 6 6zm4 0c.93 0 1.75.638 1.75 1.5 0 .862-.18 1.083-.75 1.5-.57.417-1 .767-1 1.5h2v1H9c0-1.253.535-1.662 1.12-2.1.407-.305.63-.5.63-.9C10.75 6.863 10.4 7 10 7c-.4 0-.75-.138-.75-.5S9.07 6 10 6z"/></svg>`;
            case 'json':
                return `<svg class="${iconClass}" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 2.984V2h-.09c-.313 0-.866.124-1.36.671C4.06 3.159 3.9 3.747 3.9 4.5c0 .76-.05 1.356-.19 1.771-.14.415-.39.634-.89.634V8.37c.5 0 .75.22.89.634.14.414.19 1.011.19 1.771 0 .753.16 1.341.65 1.829.494.487 1.047.612 1.36.612V12.1c-.36 0-.6-.12-.77-.387a2.42 2.42 0 0 1-.31-1.238c0-.713-.1-1.27-.37-1.675S4 8.2 3.7 8c.3-.2.52-.395.75-.8.27-.405.37-.96.37-1.675 0-.52.1-.94.31-1.238.17-.267.41-.387.77-.387V2.984zM10 2v.916c.36 0 .6.12.77.387.21.298.31.718.31 1.238 0 .715.1 1.27.37 1.675.23.405.45.6.75.8-.3.2-.52.395-.75.8-.27.405-.37.96-.37 1.675 0 .52-.1.94-.31 1.238-.17.267-.41.387-.77.387v1.116c.313 0 .866-.125 1.36-.612.49-.488.65-1.076.65-1.83 0-.76.05-1.357.19-1.77.14-.415.39-.635.89-.635V7.37c-.5 0-.75-.22-.89-.634-.14-.415-.19-1.012-.19-1.771 0-.753-.16-1.341-.65-1.829C10.866 2.649 10.313 2.524 10 2.524V2z"/></svg>`;
            case 'md':
            case 'markdown':
                return `<svg class="${iconClass}" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1zm0 9H2V4h12v8zM3 5h2l1.5 2L8 5h2v6H8V7.5L6.5 9.5 5 7.5V11H3V5zm9 0h-1v2.5l-1-1-1 1V5H8v6h1V8.5l1 1 1-1V11h1V5z"/></svg>`;
            case 'py':
                return `<svg class="${iconClass}" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1C5.3 1 5 2.2 5 2.2v1.8h3v1H3.5S1 4.6 1 8c0 3.4 2.2 3.3 2.2 3.3H4.5v-1.6s-.1-2.2 2.2-2.2h3.1s2.1 0 2.1-2V3.3S12.3 1 8 1zM5.8 2.4c.4 0 .7.3.7.7s-.3.7-.7.7-.7-.3-.7-.7.3-.7.7-.7z"/><path d="M8 15c2.7 0 3-1.2 3-1.2v-1.8h-3v-1h4.5S15 11.4 15 8c0-3.4-2.2-3.3-2.2-3.3H11.5v1.6s.1 2.2-2.2 2.2H6.2S4.1 8.5 4.1 10.5v2.2S3.7 15 8 15zm2.2-1.4c-.4 0-.7-.3-.7-.7s.3-.7.7-.7.7.3.7.7-.3.7-.7.7z"/></svg>`;
            case 'gitignore':
            case 'env':
                return `<svg class="${iconClass}" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 1.5l.5-.5h11l.5.5v13l-.5.5H2.5l-.5-.5v-13zM3 2v12h10V2H3zm1 1h8v1H4V3zm0 3h8v1H4V6zm0 3h5v1H4V9z"/></svg>`;
            default:
                return `<svg class="${iconClass}" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M13 4H9.42L8 2.59 7.59 2H2.5l-.5.5v11l.5.5h11l.5-.5V4.5L13 4zm-.5 9h-9V3h4.59L9.5 4.41 10 5h3v8z"/></svg>`;
        }
    }

    _getIconClass(ext) {
        const classMap = {
            'js': 'file-icon-js', 'mjs': 'file-icon-js', 'jsx': 'file-icon-js',
            'ts': 'file-icon-ts', 'tsx': 'file-icon-ts',
            'html': 'file-icon-html', 'htm': 'file-icon-html',
            'css': 'file-icon-css', 'scss': 'file-icon-css', 'less': 'file-icon-css',
            'json': 'file-icon-json',
            'md': 'file-icon-md', 'markdown': 'file-icon-md',
            'py': 'file-icon-py',
            'go': 'file-icon-go',
            'rs': 'file-icon-rs',
            'java': 'file-icon-java'
        };
        return classMap[ext] || 'file-icon-default';
    }

    expandTo(path) {
        const parts = path.replace(/^\//, '').split('/');
        let currentPath = '';
        for (let i = 0; i < parts.length - 1; i++) {
            currentPath += '/' + parts[i];
            this.expandedDirs.add(currentPath);
        }
        this.selectedPath = path;
        this.render();
    }

    collapseAll() {
        this.expandedDirs.clear();
        this.expandedDirs.add('/');
        this.render();
    }
}
