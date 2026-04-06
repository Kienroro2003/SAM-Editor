import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";

const execFileAsync = promisify(execFile);

function normalizeRelativePath(relativePath) {
  if (!relativePath || relativePath === "." || relativePath === "/") {
    return ".";
  }

  return relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function parseBranchSummary(line) {
  const value = line.replace(/^##\s*/, "").trim();
  const [branchPart, trackingPart] = value.split("...");

  let ahead = 0;
  let behind = 0;

  const aheadMatch = value.match(/ahead\s+(\d+)/);
  const behindMatch = value.match(/behind\s+(\d+)/);

  if (aheadMatch) {
    ahead = Number(aheadMatch[1]);
  }

  if (behindMatch) {
    behind = Number(behindMatch[1]);
  }

  return {
    branch: (branchPart || "").trim(),
    tracking: trackingPart ? trackingPart.split(" ")[0].trim() : null,
    ahead,
    behind
  };
}

function parseStatus(output) {
  const lines = output.split(/\r?\n/).filter(Boolean);

  if (lines.length === 0) {
    return {
      branch: "unknown",
      tracking: null,
      ahead: 0,
      behind: 0,
      changes: []
    };
  }

  const summary = parseBranchSummary(lines[0]);

  const changes = lines.slice(1).map((line) => ({
    code: line.slice(0, 2),
    path: line.slice(3).trim()
  }));

  return {
    ...summary,
    changes
  };
}

export class VcsService {
  constructor({ workspaceRoot }) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  resolveRepoPath(repoPath = ".") {
    const normalizedPath = normalizeRelativePath(repoPath);
    const absolutePath = path.resolve(this.workspaceRoot, normalizedPath);
    const relative = path.relative(this.workspaceRoot, absolutePath);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new AppError("repoPath is outside workspace root.", 400);
    }

    return absolutePath;
  }

  async runGit(args, cwd) {
    try {
      const { stdout, stderr } = await execFileAsync("git", args, {
        cwd,
        windowsHide: true,
        maxBuffer: 1024 * 1024
      });

      return {
        stdout: (stdout || "").trim(),
        stderr: (stderr || "").trim()
      };
    } catch (error) {
      const details = error.stderr || error.message;
      throw new AppError(`Git command failed: ${details}`, 400);
    }
  }

  async ensureGitRepository(cwd) {
    const { stdout } = await this.runGit(["rev-parse", "--is-inside-work-tree"], cwd);

    if (stdout !== "true") {
      throw new AppError("Path is not inside a git repository.", 400);
    }
  }

  async getStatus({ repoPath = "." }) {
    const cwd = this.resolveRepoPath(repoPath);
    await this.ensureGitRepository(cwd);

    const statusResult = await this.runGit(["status", "--porcelain", "--branch"], cwd);
    const remoteResult = await this.runGit(["remote", "-v"], cwd);

    const parsed = parseStatus(statusResult.stdout);
    const remotes = remoteResult.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [name, url, directionRaw] = line.split(/\s+/);
        return {
          name,
          url,
          direction: (directionRaw || "").replace(/[()]/g, "")
        };
      });

    return {
      repoPath: path.relative(this.workspaceRoot, cwd) || ".",
      branch: parsed.branch,
      tracking: parsed.tracking,
      ahead: parsed.ahead,
      behind: parsed.behind,
      changedFilesCount: parsed.changes.length,
      changes: parsed.changes,
      remotes
    };
  }

  async getRecentCommits({ repoPath = ".", limit = 20 }) {
    const cwd = this.resolveRepoPath(repoPath);
    await this.ensureGitRepository(cwd);

    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));

    const { stdout } = await this.runGit(
      [
        "log",
        `-n`,
        String(safeLimit),
        "--date=iso",
        "--pretty=format:%H%x09%an%x09%ad%x09%s"
      ],
      cwd
    );

    const commits = stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [sha, author, date, ...subjectParts] = line.split("\t");
        return {
          sha,
          author,
          date,
          subject: subjectParts.join("\t")
        };
      });

    return {
      repoPath: path.relative(this.workspaceRoot, cwd) || ".",
      count: commits.length,
      commits
    };
  }

  async sync({ repoPath = ".", remote = "origin", branch, performPull = false }) {
    const cwd = this.resolveRepoPath(repoPath);
    await this.ensureGitRepository(cwd);

    await this.runGit(["fetch", remote], cwd);

    let targetBranch = branch;
    if (!targetBranch) {
      const branchResult = await this.runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
      targetBranch = branchResult.stdout;
    }

    let ahead = 0;
    let behind = 0;
    let trackingRef = `${remote}/${targetBranch}`;

    try {
      const diffResult = await this.runGit(
        ["rev-list", "--left-right", "--count", `HEAD...${trackingRef}`],
        cwd
      );

      const [aheadRaw, behindRaw] = diffResult.stdout.split(/\s+/);
      ahead = Number(aheadRaw) || 0;
      behind = Number(behindRaw) || 0;
    } catch {
      trackingRef = null;
    }

    let pullResult = null;
    if (performPull) {
      const result = await this.runGit(["pull", "--ff-only", remote, targetBranch], cwd);
      pullResult = {
        stdout: result.stdout,
        stderr: result.stderr
      };
    }

    return {
      repoPath: path.relative(this.workspaceRoot, cwd) || ".",
      remote,
      branch: targetBranch,
      trackingRef,
      ahead,
      behind,
      isUpToDate: ahead === 0 && behind === 0,
      pullPerformed: performPull,
      pullResult
    };
  }
}

export function createVcsService() {
  return new VcsService({
    workspaceRoot: env.WORKSPACE_ROOT
  });
}
