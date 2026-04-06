import fs from "node:fs/promises";
import path from "node:path";

import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";

const IGNORED_DIRS = new Set([".git", "node_modules"]);

function normalizeRelativePath(relativePath) {
  if (!relativePath || relativePath === "." || relativePath === "/") {
    return ".";
  }

  return relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function toPosixRelative(fromRoot) {
  return fromRoot.replace(/\\/g, "/");
}

export class WorkspaceService {
  constructor({ rootPath, maxReadBytes, maxWriteBytes, maxTreeDepth, maxTreeEntries }) {
    this.rootPath = path.resolve(rootPath);
    this.maxReadBytes = maxReadBytes;
    this.maxWriteBytes = maxWriteBytes;
    this.maxTreeDepth = maxTreeDepth;
    this.maxTreeEntries = maxTreeEntries;
  }

  resolveWorkspacePath(relativePath = ".") {
    const normalizedPath = normalizeRelativePath(relativePath);
    const absolutePath = path.resolve(this.rootPath, normalizedPath);
    const relative = path.relative(this.rootPath, absolutePath);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new AppError("Path is outside workspace root.", 400);
    }

    return absolutePath;
  }

  async listTree(relativePath = ".", depth = 3) {
    const safeDepth = Math.max(1, Math.min(depth, this.maxTreeDepth));
    const startPath = this.resolveWorkspacePath(relativePath);

    let visited = 0;

    const walk = async (absolutePath, currentDepth) => {
      visited += 1;

      if (visited > this.maxTreeEntries) {
        throw new AppError("Workspace tree is too large. Narrow your path or depth.", 400);
      }

      const stat = await fs.stat(absolutePath);
      const relative = path.relative(this.rootPath, absolutePath);
      const relativePosix = relative ? toPosixRelative(relative) : ".";

      if (stat.isFile()) {
        return {
          type: "file",
          name: path.basename(absolutePath),
          path: relativePosix,
          size: stat.size,
          mtime: stat.mtime.toISOString()
        };
      }

      if (!stat.isDirectory()) {
        throw new AppError("Unsupported filesystem node type.", 400);
      }

      const node = {
        type: "directory",
        name: relativePosix === "." ? path.basename(this.rootPath) : path.basename(absolutePath),
        path: relativePosix,
        children: []
      };

      if (currentDepth <= 0) {
        return node;
      }

      const entries = await fs.readdir(absolutePath, { withFileTypes: true });
      const filtered = entries
        .filter((entry) => {
          if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
            return false;
          }

          return true;
        })
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) {
            return -1;
          }
          if (!a.isDirectory() && b.isDirectory()) {
            return 1;
          }
          return a.name.localeCompare(b.name);
        });

      for (const entry of filtered) {
        const childPath = path.join(absolutePath, entry.name);
        node.children.push(await walk(childPath, currentDepth - 1));
      }

      return node;
    };

    return walk(startPath, safeDepth - 1);
  }

  async readFile(relativePath) {
    const absolutePath = this.resolveWorkspacePath(relativePath);

    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat || !stat.isFile()) {
      throw new AppError("File not found.", 404);
    }

    if (stat.size > this.maxReadBytes) {
      throw new AppError(`File is too large to read (>${this.maxReadBytes} bytes).`, 413);
    }

    const content = await fs.readFile(absolutePath, "utf8");

    return {
      path: toPosixRelative(path.relative(this.rootPath, absolutePath)),
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      content
    };
  }

  async writeFile(relativePath, content) {
    if (typeof content !== "string") {
      throw new AppError("content must be a string.", 400);
    }

    const byteLength = Buffer.byteLength(content, "utf8");
    if (byteLength > this.maxWriteBytes) {
      throw new AppError(`Content is too large to write (>${this.maxWriteBytes} bytes).`, 413);
    }

    const absolutePath = this.resolveWorkspacePath(relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, "utf8");

    const stat = await fs.stat(absolutePath);

    return {
      path: toPosixRelative(path.relative(this.rootPath, absolutePath)),
      size: stat.size,
      mtime: stat.mtime.toISOString()
    };
  }
}

export function createWorkspaceService() {
  return new WorkspaceService({
    rootPath: env.WORKSPACE_ROOT,
    maxReadBytes: env.WORKSPACE_MAX_READ_BYTES,
    maxWriteBytes: env.WORKSPACE_MAX_WRITE_BYTES,
    maxTreeDepth: env.WORKSPACE_MAX_TREE_DEPTH,
    maxTreeEntries: env.WORKSPACE_MAX_TREE_ENTRIES
  });
}
