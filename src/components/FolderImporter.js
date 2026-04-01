/**
 * FolderImporter — Handles importing real folders into the virtual file system.
 * Supports File System Access API (Chrome/Edge) and fallback via webkitdirectory/drag-and-drop.
 */

// Binary file extensions to skip reading content
const BINARY_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg', 'webp', 'avif',
    'mp3', 'mp4', 'wav', 'ogg', 'webm', 'avi', 'mov', 'mkv',
    'zip', 'tar', 'gz', 'rar', '7z', 'bz2',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'exe', 'dll', 'so', 'dylib', 'bin',
    'woff', 'woff2', 'ttf', 'eot', 'otf',
    'class', 'jar', 'pyc', 'o', 'obj',
    'sqlite', 'db',
]);

// Directories to skip
const SKIP_DIRS = new Set([
    'node_modules', '.git', '.svn', '.hg', '__pycache__',
    '.next', '.nuxt', 'dist', 'build', '.cache',
    '.DS_Store', 'Thumbs.db', '.idea', '.vscode',
]);

// Max file size to read (1MB)
const MAX_FILE_SIZE = 1 * 1024 * 1024;

export class FolderImporter {
    constructor() {
        this._listeners = {};
        this.isImporting = false;
        this.supportsFileSystemAPI = 'showDirectoryPicker' in window;
    }

    on(event, fn) {
        (this._listeners[event] ||= []).push(fn);
        return this;
    }

    emit(event, ...args) {
        (this._listeners[event] || []).forEach(fn => fn(...args));
    }

    /**
     * Import via modern File System Access API (Chrome/Edge).
     */
    async importViaFileSystemAPI() {
        if (!this.supportsFileSystemAPI) {
            throw new Error('File System Access API is not supported in this browser.');
        }

        try {
            const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
            this.isImporting = true;
            this.emit('importStart', dirHandle.name);

            const tree = await this._processDirectoryHandle(dirHandle);

            this.isImporting = false;
            this.emit('importComplete', { name: dirHandle.name, tree });
            return { name: dirHandle.name, tree };
        } catch (err) {
            this.isImporting = false;
            if (err.name === 'AbortError') {
                // User cancelled the picker
                return null;
            }
            this.emit('importError', err);
            throw err;
        }
    }

    /**
     * Import via <input webkitdirectory> FileList.
     */
    async importViaInput(fileList) {
        if (!fileList || fileList.length === 0) return null;

        this.isImporting = true;

        // Determine folder name from the first file's webkitRelativePath
        const firstPath = fileList[0].webkitRelativePath;
        const folderName = firstPath ? firstPath.split('/')[0] : 'imported-project';

        this.emit('importStart', folderName);

        try {
            const tree = await this._processFileList(fileList);
            this.isImporting = false;
            this.emit('importComplete', { name: folderName, tree });
            return { name: folderName, tree };
        } catch (err) {
            this.isImporting = false;
            this.emit('importError', err);
            throw err;
        }
    }

    /**
     * Import via drag-and-drop DataTransfer items.
     */
    async importViaDrop(dataTransfer) {
        const items = dataTransfer.items;
        if (!items || items.length === 0) return null;

        // Check for File System Access API handles first (Chrome)
        if (items[0].getAsFileSystemHandle) {
            try {
                const handle = await items[0].getAsFileSystemHandle();
                if (handle.kind === 'directory') {
                    this.isImporting = true;
                    this.emit('importStart', handle.name);

                    const tree = await this._processDirectoryHandle(handle);
                    this.isImporting = false;
                    this.emit('importComplete', { name: handle.name, tree });
                    return { name: handle.name, tree };
                }
            } catch (e) {
                // Fall through to webkitGetAsEntry
            }
        }

        // Fallback: webkitGetAsEntry
        const entry = items[0].webkitGetAsEntry?.() || items[0].getAsEntry?.();
        if (entry && entry.isDirectory) {
            this.isImporting = true;
            this.emit('importStart', entry.name);

            try {
                const tree = await this._processWebkitEntry(entry);
                this.isImporting = false;
                this.emit('importComplete', { name: entry.name, tree });
                return { name: entry.name, tree };
            } catch (err) {
                this.isImporting = false;
                this.emit('importError', err);
                throw err;
            }
        }

        return null;
    }

    /* ─── Internal Processing Methods ─── */

    /**
     * Process a FileSystemDirectoryHandle recursively.
     */
    async _processDirectoryHandle(dirHandle) {
        const children = [];

        for await (const [name, handle] of dirHandle.entries()) {
            if (SKIP_DIRS.has(name)) continue;
            if (name.startsWith('.') && SKIP_DIRS.has(name)) continue;

            if (handle.kind === 'directory') {
                const subChildren = await this._processDirectoryHandle(handle);
                children.push({
                    name,
                    type: 'directory',
                    children: subChildren,
                });
            } else {
                // File
                const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
                if (BINARY_EXTENSIONS.has(ext)) {
                    children.push({
                        name,
                        type: 'file',
                        content: `[Binary file — ${ext.toUpperCase()}]`,
                    });
                    continue;
                }

                try {
                    const file = await handle.getFile();
                    if (file.size > MAX_FILE_SIZE) {
                        children.push({
                            name,
                            type: 'file',
                            content: `[File too large — ${(file.size / 1024 / 1024).toFixed(1)}MB]`,
                        });
                        continue;
                    }
                    const content = await file.text();
                    children.push({ name, type: 'file', content });
                } catch {
                    children.push({ name, type: 'file', content: '[Unable to read file]' });
                }
            }
        }

        // Sort: directories first, then alphabetical
        children.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        return children;
    }

    /**
     * Process a FileList from <input webkitdirectory>.
     * The FileList contains flat files with `webkitRelativePath` that encodes the tree structure.
     */
    async _processFileList(fileList) {
        // Build a tree from flat paths
        const rootChildren = [];
        const dirMap = new Map(); // path -> children array

        for (const file of fileList) {
            const relativePath = file.webkitRelativePath;
            if (!relativePath) continue;

            const parts = relativePath.split('/');
            // Skip the root folder name (first part)
            const pathParts = parts.slice(1);

            if (pathParts.length === 0) continue;

            // Skip files in ignored directories
            if (pathParts.some(p => SKIP_DIRS.has(p))) continue;

            // Ensure all parent directories exist
            let currentChildren = rootChildren;
            let currentPath = '';

            for (let i = 0; i < pathParts.length - 1; i++) {
                currentPath += '/' + pathParts[i];
                if (!dirMap.has(currentPath)) {
                    const dir = {
                        name: pathParts[i],
                        type: 'directory',
                        children: [],
                    };
                    currentChildren.push(dir);
                    dirMap.set(currentPath, dir.children);
                }
                currentChildren = dirMap.get(currentPath);
            }

            // Add the file
            const fileName = pathParts[pathParts.length - 1];
            const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';

            if (BINARY_EXTENSIONS.has(ext)) {
                currentChildren.push({
                    name: fileName,
                    type: 'file',
                    content: `[Binary file — ${ext.toUpperCase()}]`,
                });
                continue;
            }

            if (file.size > MAX_FILE_SIZE) {
                currentChildren.push({
                    name: fileName,
                    type: 'file',
                    content: `[File too large — ${(file.size / 1024 / 1024).toFixed(1)}MB]`,
                });
                continue;
            }

            try {
                const content = await file.text();
                currentChildren.push({ name: fileName, type: 'file', content });
            } catch {
                currentChildren.push({ name: fileName, type: 'file', content: '[Unable to read file]' });
            }
        }

        // Sort all directory children
        this._sortTree(rootChildren);
        return rootChildren;
    }

    /**
     * Process a webkitGetAsEntry (FileSystemEntry) recursively.
     */
    async _processWebkitEntry(entry) {
        if (entry.isFile) {
            return new Promise((resolve) => {
                entry.file(async (file) => {
                    const ext = entry.name.includes('.') ? entry.name.split('.').pop().toLowerCase() : '';
                    if (BINARY_EXTENSIONS.has(ext) || file.size > MAX_FILE_SIZE) {
                        resolve([{
                            name: entry.name,
                            type: 'file',
                            content: BINARY_EXTENSIONS.has(ext)
                                ? `[Binary file — ${ext.toUpperCase()}]`
                                : `[File too large — ${(file.size / 1024 / 1024).toFixed(1)}MB]`,
                        }]);
                        return;
                    }
                    try {
                        const content = await file.text();
                        resolve([{ name: entry.name, type: 'file', content }]);
                    } catch {
                        resolve([{ name: entry.name, type: 'file', content: '[Unable to read file]' }]);
                    }
                }, () => {
                    resolve([{ name: entry.name, type: 'file', content: '[Unable to read file]' }]);
                });
            });
        }

        if (entry.isDirectory) {
            const children = [];
            const reader = entry.createReader();

            // readEntries may return partial results, so we loop
            const readAll = () => new Promise((resolve, reject) => {
                const allEntries = [];
                const readBatch = () => {
                    reader.readEntries(async (entries) => {
                        if (entries.length === 0) {
                            resolve(allEntries);
                            return;
                        }
                        allEntries.push(...entries);
                        readBatch();
                    }, reject);
                };
                readBatch();
            });

            try {
                const entries = await readAll();
                for (const childEntry of entries) {
                    if (SKIP_DIRS.has(childEntry.name)) continue;

                    if (childEntry.isDirectory) {
                        const subResult = await this._processWebkitEntry(childEntry);
                        // subResult for a directory returns its children
                        children.push({
                            name: childEntry.name,
                            type: 'directory',
                            children: subResult,
                        });
                    } else {
                        const fileResult = await this._processWebkitEntry(childEntry);
                        children.push(...fileResult);
                    }
                }
            } catch {
                // Ignore read errors for directories
            }

            children.sort((a, b) => {
                if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

            return children;
        }

        return [];
    }

    /**
     * Sort tree recursively: directories first, then alphabetical.
     */
    _sortTree(children) {
        children.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        for (const child of children) {
            if (child.type === 'directory' && child.children) {
                this._sortTree(child.children);
            }
        }
    }
}
