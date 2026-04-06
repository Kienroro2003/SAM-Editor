import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";

import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";

function normalizeRelativePath(relativePath) {
  if (!relativePath || relativePath === "." || relativePath === "/") {
    return ".";
  }

  return relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function toPosixPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function toSingleQuotedShellString(value) {
  return `'${String(value || "").replace(/'/g, `'"'"'`)}'`;
}

function appendWithLimit(current, chunk, maxBytes) {
  const next = current + chunk;
  if (Buffer.byteLength(next, "utf8") <= maxBytes) {
    return { text: next, truncated: false };
  }

  const allowedBytes = Math.max(maxBytes - Buffer.byteLength(current, "utf8"), 0);
  const truncatedChunk = Buffer.from(chunk, "utf8").subarray(0, allowedBytes).toString("utf8");

  return {
    text: current + truncatedChunk,
    truncated: true
  };
}

export class TestExecutionService {
  constructor({
    workspaceRoot,
    defaultCommand,
    defaultTimeoutMs,
    maxOutputBytes,
    executionMode,
    allowCustomCommands,
    allowedCommands,
    dockerImage,
    dockerNetwork,
    dockerMemoryMb,
    dockerCpus,
    dockerReadonlyWorkspace,
    dockerReadOnlyRoot,
    dockerPidsLimit,
    dockerSandboxTmpfsSizeMb,
    dockerFallbackToLocal
  }) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.defaultCommand = defaultCommand;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.maxOutputBytes = maxOutputBytes;
    this.executionMode = executionMode;
    this.allowCustomCommands = allowCustomCommands;
    this.allowedCommands = allowedCommands;
    this.dockerImage = dockerImage;
    this.dockerNetwork = dockerNetwork;
    this.dockerMemoryMb = dockerMemoryMb;
    this.dockerCpus = dockerCpus;
    this.dockerReadonlyWorkspace = dockerReadonlyWorkspace;
    this.dockerReadOnlyRoot = dockerReadOnlyRoot;
    this.dockerPidsLimit = dockerPidsLimit;
    this.dockerSandboxTmpfsSizeMb = dockerSandboxTmpfsSizeMb;
    this.dockerFallbackToLocal = dockerFallbackToLocal;
  }

  resolveProjectPath(projectPath = ".") {
    const normalizedPath = normalizeRelativePath(projectPath);
    const absolutePath = path.resolve(this.workspaceRoot, normalizedPath);
    const relative = path.relative(this.workspaceRoot, absolutePath);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new AppError("projectPath is outside workspace root.", 400);
    }

    return absolutePath;
  }

  resolveTestCommand(command) {
    const requested = command ? command.trim() : "";
    const resolved = (requested || this.defaultCommand || "").trim();

    if (!resolved) {
      throw new AppError("Test command is empty.", 400);
    }

    if (!this.allowCustomCommands && requested && requested !== this.defaultCommand) {
      throw new AppError(
        "Custom test commands are disabled. Use DEFAULT_TEST_COMMAND.",
        403
      );
    }

    if (
      this.allowedCommands.length > 0 &&
      !this.allowedCommands.some(
        (allowed) => resolved === allowed || resolved.startsWith(`${allowed} `)
      )
    ) {
      throw new AppError(
        "Command is not allowed by TEST_ALLOWED_COMMANDS policy.",
        403,
        {
          allowedCommands: this.allowedCommands
        }
      );
    }

    return resolved;
  }

  executeSpawn({ command, args = [], cwd, shell, timeoutMs, envVars }) {
    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        shell,
        windowsHide: true,
        env: envVars
      });

      let stdout = "";
      let stderr = "";
      let stdoutTruncated = false;
      let stderrTruncated = false;
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        const result = appendWithLimit(stdout, chunk.toString("utf8"), this.maxOutputBytes);
        stdout = result.text;
        stdoutTruncated = stdoutTruncated || result.truncated;
      });

      child.stderr.on("data", (chunk) => {
        const result = appendWithLimit(stderr, chunk.toString("utf8"), this.maxOutputBytes);
        stderr = result.text;
        stderrTruncated = stderrTruncated || result.truncated;
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        reject(new AppError(`Failed to execute command: ${error.message}`, 500));
      });

      child.on("close", (code, signal) => {
        clearTimeout(timer);

        resolve({
          status: timedOut ? "timeout" : code === 0 ? "passed" : "failed",
          exitCode: code,
          signal: signal || null,
          durationMs: Date.now() - startedAt,
          stdout,
          stderr,
          outputTruncated: stdoutTruncated || stderrTruncated
        });
      });
    });
  }

  buildDockerArgs({ projectPath, testCommand }) {
    const normalizedProjectPath = normalizeRelativePath(projectPath);
    const containerProjectPath =
      normalizedProjectPath === "."
        ? "/sandbox"
        : `/sandbox/${toPosixPath(normalizedProjectPath)}`;

    const script = [
      "set -e",
      "mkdir -p /sandbox",
      "cp -R /workspace/. /sandbox/",
      `cd ${toSingleQuotedShellString(containerProjectPath)}`,
      testCommand
    ].join(" && ");

    const args = ["run", "--rm", "--name", `sam-test-${randomUUID().slice(0, 8)}`];

    if (this.dockerReadOnlyRoot) {
      args.push("--read-only");
      args.push("--tmpfs", "/tmp:rw,size=128m");
      args.push("--tmpfs", `/sandbox:rw,size=${this.dockerSandboxTmpfsSizeMb}m`);
    }

    args.push("--security-opt", "no-new-privileges");
    args.push("--cap-drop", "ALL");

    if (this.dockerPidsLimit > 0) {
      args.push("--pids-limit", String(this.dockerPidsLimit));
    }

    if (this.dockerNetwork) {
      args.push("--network", this.dockerNetwork);
    }

    if (this.dockerMemoryMb > 0) {
      args.push("--memory", `${this.dockerMemoryMb}m`);
    }

    if (this.dockerCpus > 0) {
      args.push("--cpus", String(this.dockerCpus));
    }

    args.push(
      "-v",
      `${this.workspaceRoot}:/workspace:${this.dockerReadonlyWorkspace ? "ro" : "rw"}`
    );
    args.push("--workdir", "/sandbox");
    args.push(this.dockerImage, "sh", "-lc", script);

    return args;
  }

  async runInLocalProcess({ cwd, testCommand, timeoutMs }) {
    const result = await this.executeSpawn({
      command: testCommand,
      args: [],
      cwd,
      shell: true,
      timeoutMs,
      envVars: process.env
    });

    return {
      executionMode: "local",
      command: testCommand,
      cwd,
      timeoutMs,
      ...result
    };
  }

  async runInDockerSandbox({ projectPath, testCommand, timeoutMs }) {
    const args = this.buildDockerArgs({ projectPath, testCommand });

    const result = await this.executeSpawn({
      command: "docker",
      args,
      cwd: this.workspaceRoot,
      shell: false,
      timeoutMs,
      envVars: process.env
    });

    return {
      executionMode: "docker",
      command: testCommand,
      cwd: path.join(this.workspaceRoot, normalizeRelativePath(projectPath)),
      timeoutMs,
      docker: {
        image: this.dockerImage,
        network: this.dockerNetwork,
        memoryMb: this.dockerMemoryMb,
        cpus: this.dockerCpus,
        readonlyWorkspace: this.dockerReadonlyWorkspace,
        readOnlyRoot: this.dockerReadOnlyRoot,
        pidsLimit: this.dockerPidsLimit
      },
      ...result
    };
  }

  async runTests({ projectPath = ".", command, timeoutMs }) {
    const cwd = this.resolveProjectPath(projectPath);
    const testCommand = this.resolveTestCommand(command);

    const safeTimeout = Math.max(1000, timeoutMs || this.defaultTimeoutMs);

    if (this.executionMode === "docker") {
      try {
        return await this.runInDockerSandbox({
          projectPath: path.relative(this.workspaceRoot, cwd) || ".",
          testCommand,
          timeoutMs: safeTimeout
        });
      } catch (error) {
        if (!this.dockerFallbackToLocal) {
          throw error;
        }

        const fallbackResult = await this.runInLocalProcess({
          cwd,
          testCommand,
          timeoutMs: safeTimeout
        });

        return {
          ...fallbackResult,
          executionMode: "local-fallback",
          dockerError: error.message
        };
      }
    }

    return this.runInLocalProcess({
      cwd,
      testCommand,
      timeoutMs: safeTimeout
    });
  }

  getRuntimeConfig() {
    return {
      workspaceRoot: this.workspaceRoot,
      defaultCommand: this.defaultCommand,
      defaultTimeoutMs: this.defaultTimeoutMs,
      maxOutputBytes: this.maxOutputBytes,
      executionMode: this.executionMode,
      allowCustomCommands: this.allowCustomCommands,
      allowedCommands: this.allowedCommands,
      docker: {
        image: this.dockerImage,
        network: this.dockerNetwork,
        memoryMb: this.dockerMemoryMb,
        cpus: this.dockerCpus,
        readonlyWorkspace: this.dockerReadonlyWorkspace,
        readOnlyRoot: this.dockerReadOnlyRoot,
        pidsLimit: this.dockerPidsLimit,
        sandboxTmpfsSizeMb: this.dockerSandboxTmpfsSizeMb,
        fallbackToLocal: this.dockerFallbackToLocal
      }
    };
  }
}

export function createTestExecutionService() {
  return new TestExecutionService({
    workspaceRoot: env.WORKSPACE_ROOT,
    defaultCommand: env.DEFAULT_TEST_COMMAND,
    defaultTimeoutMs: env.TEST_TIMEOUT_MS,
    maxOutputBytes: env.TEST_MAX_OUTPUT_BYTES,
    executionMode: env.TEST_EXECUTION_MODE,
    allowCustomCommands: env.TEST_ALLOW_CUSTOM_COMMANDS,
    allowedCommands: env.TEST_ALLOWED_COMMANDS,
    dockerImage: env.TEST_DOCKER_IMAGE,
    dockerNetwork: env.TEST_DOCKER_NETWORK,
    dockerMemoryMb: env.TEST_DOCKER_MEMORY_MB,
    dockerCpus: env.TEST_DOCKER_CPUS,
    dockerReadonlyWorkspace: env.TEST_DOCKER_READONLY_WORKSPACE,
    dockerReadOnlyRoot: env.TEST_DOCKER_READ_ONLY_ROOT,
    dockerPidsLimit: env.TEST_DOCKER_PIDS_LIMIT,
    dockerSandboxTmpfsSizeMb: env.TEST_DOCKER_SANDBOX_TMPFS_MB,
    dockerFallbackToLocal: env.TEST_DOCKER_FALLBACK_TO_LOCAL
  });
}
