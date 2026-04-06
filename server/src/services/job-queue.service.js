import { randomUUID } from "node:crypto";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toErrorObject(error) {
  if (!error) {
    return null;
  }

  return {
    name: error.name || "Error",
    message: error.message || String(error),
    stack: error.stack || null,
    statusCode: error.statusCode || null,
    details: error.details || null
  };
}

function toIso(value) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

export class JobQueueService {
  constructor({
    queueName,
    concurrency,
    defaultMaxAttempts,
    retryBaseDelayMs,
    rateLimitMax,
    rateLimitWindowMs,
    jobResultTtlMs,
    maxStoredJobs
  }) {
    this.queueName = queueName;
    this.concurrency = Math.max(1, Math.floor(concurrency || 1));
    this.defaultMaxAttempts = Math.max(1, Math.floor(defaultMaxAttempts || 1));
    this.retryBaseDelayMs = Math.max(100, Math.floor(retryBaseDelayMs || 500));
    this.rateLimitMax = Math.max(1, Math.floor(rateLimitMax || 1));
    this.rateLimitWindowMs = Math.max(1000, Math.floor(rateLimitWindowMs || 60000));
    this.jobResultTtlMs = Math.max(60000, Math.floor(jobResultTtlMs || 3600000));
    this.maxStoredJobs = Math.max(100, Math.floor(maxStoredJobs || 1000));

    this.pending = [];
    this.jobs = new Map();
    this.activeCount = 0;
    this.startedTimestamps = [];
  }

  enqueue({ type, payload, requestedByUserId, handler, maxAttempts }) {
    if (typeof handler !== "function") {
      throw new Error("handler must be a function.");
    }

    const now = Date.now();

    const job = {
      id: randomUUID(),
      queueName: this.queueName,
      type: String(type || "job"),
      requestedByUserId: requestedByUserId || null,
      payload,
      handler,
      status: "queued",
      attempts: 0,
      maxAttempts: Math.max(1, maxAttempts || this.defaultMaxAttempts),
      createdAtMs: now,
      updatedAtMs: now,
      startedAtMs: null,
      completedAtMs: null,
      lastError: null,
      result: null,
      completion: null,
      resolveCompletion: null,
      rejectCompletion: null
    };

    job.completion = new Promise((resolve, reject) => {
      job.resolveCompletion = resolve;
      job.rejectCompletion = reject;
    });

    job.completion.catch(() => {
      // Prevent unhandled rejection when caller enqueues async jobs without awaiting.
    });

    this.jobs.set(job.id, job);
    this.pending.push(job);
    this.drainQueue();

    return {
      jobId: job.id,
      queueName: this.queueName,
      completion: job.completion
    };
  }

  async acquireRateLimitSlot() {
    while (true) {
      const now = Date.now();
      this.startedTimestamps = this.startedTimestamps.filter(
        (timestamp) => now - timestamp < this.rateLimitWindowMs
      );

      if (this.startedTimestamps.length < this.rateLimitMax) {
        this.startedTimestamps.push(now);
        return;
      }

      const waitMs = Math.max(
        this.rateLimitWindowMs - (now - this.startedTimestamps[0]) + 5,
        10
      );

      await sleep(waitMs);
    }
  }

  drainQueue() {
    while (this.activeCount < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift();
      this.activeCount += 1;

      this.executeJob(job)
        .catch(() => {
          // Errors are written into the job object itself.
        })
        .finally(() => {
          this.activeCount -= 1;
          this.pruneJobs();
          this.drainQueue();
        });
    }
  }

  async executeJob(job) {
    if (!job) {
      return;
    }

    job.status = "processing";
    job.startedAtMs = Date.now();
    job.updatedAtMs = job.startedAtMs;

    while (job.attempts < job.maxAttempts) {
      job.attempts += 1;
      job.updatedAtMs = Date.now();

      try {
        await this.acquireRateLimitSlot();
        const result = await job.handler(job.payload, {
          jobId: job.id,
          queueName: this.queueName,
          attempt: job.attempts,
          maxAttempts: job.maxAttempts
        });

        job.status = "completed";
        job.result = result;
        job.completedAtMs = Date.now();
        job.updatedAtMs = job.completedAtMs;
        job.resolveCompletion(result);
        return;
      } catch (error) {
        job.lastError = toErrorObject(error);
        job.updatedAtMs = Date.now();

        if (job.attempts >= job.maxAttempts) {
          job.status = "failed";
          job.completedAtMs = Date.now();
          job.updatedAtMs = job.completedAtMs;
          job.rejectCompletion(error);
          return;
        }

        const backoffMs = this.retryBaseDelayMs * 2 ** (job.attempts - 1);
        await sleep(backoffMs);
      }
    }
  }

  buildSnapshot(job, includeResult = false) {
    if (!job) {
      return null;
    }

    return {
      jobId: job.id,
      queueName: job.queueName,
      type: job.type,
      requestedByUserId: job.requestedByUserId,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      createdAt: toIso(job.createdAtMs),
      startedAt: toIso(job.startedAtMs),
      completedAt: toIso(job.completedAtMs),
      error: job.lastError,
      result: includeResult ? job.result : undefined
    };
  }

  getJob(jobId, includeResult = true) {
    return this.buildSnapshot(this.jobs.get(jobId), includeResult);
  }

  listJobs({ status, requestedByUserId, limit = 50, includeResult = false } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
    const snapshots = [];

    for (const job of this.jobs.values()) {
      if (status && job.status !== status) {
        continue;
      }

      if (requestedByUserId && job.requestedByUserId !== requestedByUserId) {
        continue;
      }

      snapshots.push(this.buildSnapshot(job, includeResult));
    }

    snapshots.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return snapshots.slice(0, safeLimit);
  }

  async waitForJob(jobId, timeoutMs = 0) {
    const job = this.jobs.get(jobId);

    if (!job) {
      return null;
    }

    if (job.status === "completed" || job.status === "failed") {
      return this.getJob(jobId, true);
    }

    const completion = job.completion.then(
      () => "done",
      () => "done"
    );

    if (!timeoutMs || timeoutMs <= 0) {
      await completion;
      return this.getJob(jobId, true);
    }

    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve("timeout"), timeoutMs);
    });

    const result = await Promise.race([completion, timeoutPromise]);

    if (result === "timeout") {
      return {
        ...this.getJob(jobId, true),
        timedOut: true
      };
    }

    return this.getJob(jobId, true);
  }

  hasJob(jobId) {
    return this.jobs.has(jobId);
  }

  pruneJobs() {
    const now = Date.now();

    for (const [jobId, job] of this.jobs.entries()) {
      const isTerminal = job.status === "completed" || job.status === "failed";
      if (!isTerminal) {
        continue;
      }

      if (now - job.updatedAtMs > this.jobResultTtlMs) {
        this.jobs.delete(jobId);
      }
    }

    if (this.jobs.size <= this.maxStoredJobs) {
      return;
    }

    const terminalJobs = [...this.jobs.values()]
      .filter((job) => job.status === "completed" || job.status === "failed")
      .sort((a, b) => a.updatedAtMs - b.updatedAtMs);

    while (this.jobs.size > this.maxStoredJobs && terminalJobs.length > 0) {
      const oldest = terminalJobs.shift();
      this.jobs.delete(oldest.id);
    }
  }
}
