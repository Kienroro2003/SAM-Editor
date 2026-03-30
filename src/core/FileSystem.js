/**
 * Virtual File System — In-memory file tree
 */

class EventEmitter {
    constructor() {
        this._listeners = {};
    }
    on(event, fn) {
        (this._listeners[event] ||= []).push(fn);
        return this;
    }
    off(event, fn) {
        const arr = this._listeners[event];
        if (arr) this._listeners[event] = arr.filter(f => f !== fn);
        return this;
    }
    emit(event, ...args) {
        (this._listeners[event] || []).forEach(fn => fn(...args));
    }
}

export class FileSystem extends EventEmitter {
    constructor() {
        super();
        // Root node
        this.root = {
            name: 'sam-project',
            type: 'directory',
            children: [],
            path: '/'
        };
    }

    /**
     * Resolve a path to a node.
     */
    resolve(path) {
        if (path === '/' || path === '') return this.root;
        const parts = path.replace(/^\//, '').split('/');
        let node = this.root;
        for (const part of parts) {
            if (!node || node.type !== 'directory') return null;
            node = node.children.find(c => c.name === part);
        }
        return node || null;
    }

    /**
     * Get parent directory of a path.
     */
    getParent(path) {
        const parts = path.replace(/^\//, '').split('/');
        parts.pop();
        return parts.length === 0 ? this.root : this.resolve(parts.join('/'));
    }

    /**
     * Create a file at the given path with optional content.
     */
    createFile(path, content = '') {
        const parts = path.replace(/^\//, '').split('/');
        const name = parts.pop();
        const parentPath = parts.join('/');
        const parent = parts.length === 0 ? this.root : this.resolve(parentPath);

        if (!parent || parent.type !== 'directory') {
            throw new Error(`Parent directory not found: ${parentPath}`);
        }

        if (parent.children.find(c => c.name === name)) {
            throw new Error(`File already exists: ${path}`);
        }

        const file = {
            name,
            type: 'file',
            content,
            path: '/' + (parentPath ? parentPath + '/' : '') + name,
            modified: false
        };

        parent.children.push(file);
        this._sortChildren(parent);
        this.emit('fileCreated', file);
        return file;
    }

    /**
     * Create a directory at the given path.
     */
    createDirectory(path) {
        const parts = path.replace(/^\//, '').split('/');
        const name = parts.pop();
        const parentPath = parts.join('/');
        const parent = parts.length === 0 ? this.root : this.resolve(parentPath);

        if (!parent || parent.type !== 'directory') {
            throw new Error(`Parent directory not found: ${parentPath}`);
        }

        if (parent.children.find(c => c.name === name)) {
            throw new Error(`Directory already exists: ${path}`);
        }

        const dir = {
            name,
            type: 'directory',
            children: [],
            path: '/' + (parentPath ? parentPath + '/' : '') + name
        };

        parent.children.push(dir);
        this._sortChildren(parent);
        this.emit('directoryCreated', dir);
        return dir;
    }

    /**
     * Read file content.
     */
    readFile(path) {
        const node = this.resolve(path);
        if (!node || node.type !== 'file') {
            throw new Error(`File not found: ${path}`);
        }
        return node.content;
    }

    /**
     * Write file content.
     */
    writeFile(path, content) {
        const node = this.resolve(path);
        if (!node || node.type !== 'file') {
            throw new Error(`File not found: ${path}`);
        }
        node.content = content;
        node.modified = true;
        this.emit('fileChanged', node);
        return node;
    }

    /**
     * Save file (mark as not modified).
     */
    saveFile(path) {
        const node = this.resolve(path);
        if (!node || node.type !== 'file') return;
        node.modified = false;
        this.emit('fileSaved', node);
        return node;
    }

    /**
     * Delete a file or directory.
     */
    delete(path) {
        const node = this.resolve(path);
        if (!node) throw new Error(`Not found: ${path}`);
        const parent = this.getParent(path);
        if (!parent) throw new Error(`Cannot delete root`);
        parent.children = parent.children.filter(c => c !== node);
        this.emit('deleted', node);
        return node;
    }

    /**
     * Rename a file or directory.
     */
    rename(path, newName) {
        const node = this.resolve(path);
        if (!node) throw new Error(`Not found: ${path}`);
        const parent = this.getParent(path);
        if (parent.children.find(c => c.name === newName && c !== node)) {
            throw new Error(`Name already exists: ${newName}`);
        }
        const oldPath = node.path;
        node.name = newName;
        // Update path for this node and all descendants
        this._updatePaths(node, parent);
        this.emit('renamed', { node, oldPath });
        return node;
    }

    _updatePaths(node, parent) {
        const parentPath = parent === this.root ? '' : parent.path;
        node.path = parentPath + '/' + node.name;
        if (node.type === 'directory' && node.children) {
            node.children.forEach(child => this._updatePaths(child, node));
        }
    }

    /**
     * Sort children: folders first, then alphabetically.
     */
    _sortChildren(dir) {
        dir.children.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    }

    /**
     * Load a tree structure into the file system.
     */
    loadTree(tree, parentPath = '') {
        for (const item of tree) {
            const itemPath = parentPath ? `${parentPath}/${item.name}` : item.name;
            if (item.type === 'directory') {
                this.createDirectory(itemPath);
                if (item.children) {
                    this.loadTree(item.children, itemPath);
                }
            } else {
                this.createFile(itemPath, item.content || '');
            }
        }
    }

    /**
     * Get all files recursively.
     */
    getAllFiles(node = this.root) {
        const files = [];
        if (node.type === 'file') {
            files.push(node);
        } else if (node.children) {
            node.children.forEach(child => {
                files.push(...this.getAllFiles(child));
            });
        }
        return files;
    }
}
