import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";
import { JobQueueService } from "./job-queue.service.js";

export class JobOrchestratorService {
  constructor({ aiService, testExecutionService, aiQueue, testQueue }) {
    this.aiService = aiService;
    this.testExecutionService = testExecutionService;
    this.aiQueue = aiQueue;
    this.testQueue = testQueue;
  }

  submitAiRecommendation({ payload, requestedByUserId, maxAttempts }) {
    return this.aiQueue.enqueue({
      type: "ai.recommendation",
      payload,
      requestedByUserId,
      maxAttempts,
      handler: async (jobPayload) => this.aiService.generateRecommendation(jobPayload)
    });
  }

  submitTestExecution({ payload, requestedByUserId, maxAttempts }) {
    return this.testQueue.enqueue({
      type: "test.execution",
      payload,
      requestedByUserId,
      maxAttempts,
      handler: async (jobPayload) => this.testExecutionService.runTests(jobPayload)
    });
  }

  resolveQueueByJobId(jobId) {
    if (this.aiQueue.hasJob(jobId)) {
      return this.aiQueue;
    }

    if (this.testQueue.hasJob(jobId)) {
      return this.testQueue;
    }

    return null;
  }

  getJob(jobId, includeResult = true) {
    const queue = this.resolveQueueByJobId(jobId);

    if (!queue) {
      return null;
    }

    return queue.getJob(jobId, includeResult);
  }

  getJobForRequester({ jobId, requestedByUserId, isAdmin = false, includeResult = true }) {
    const job = this.getJob(jobId, includeResult);

    if (!job) {
      throw new AppError("Job not found.", 404);
    }

    if (!isAdmin && job.requestedByUserId && job.requestedByUserId !== requestedByUserId) {
      throw new AppError("Access denied for this job.", 403);
    }

    return job;
  }

  async waitForJob({ jobId, timeoutMs, requestedByUserId, isAdmin = false }) {
    const queue = this.resolveQueueByJobId(jobId);

    if (!queue) {
      throw new AppError("Job not found.", 404);
    }

    const result = await queue.waitForJob(jobId, timeoutMs);

    if (!result) {
      throw new AppError("Job not found.", 404);
    }

    if (!isAdmin && result.requestedByUserId && result.requestedByUserId !== requestedByUserId) {
      throw new AppError("Access denied for this job.", 403);
    }

    return result;
  }

  listJobs({ queueName = "all", status, limit = 50, requestedByUserId, isAdmin = false }) {
    const filters = {
      status,
      limit,
      requestedByUserId: isAdmin ? null : requestedByUserId,
      includeResult: false
    };

    if (queueName === "ai") {
      return this.aiQueue.listJobs(filters);
    }

    if (queueName === "test") {
      return this.testQueue.listJobs(filters);
    }

    const aiJobs = this.aiQueue.listJobs(filters);
    const testJobs = this.testQueue.listJobs(filters);

    const combined = [...aiJobs, ...testJobs].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return combined.slice(0, Math.max(1, Math.min(Number(limit) || 50, 200)));
  }
}

export function createJobOrchestratorService({ aiService, testExecutionService }) {
  const aiQueue = new JobQueueService({
    queueName: "ai",
    concurrency: env.AI_QUEUE_CONCURRENCY,
    defaultMaxAttempts: env.AI_QUEUE_MAX_ATTEMPTS,
    retryBaseDelayMs: env.AI_QUEUE_RETRY_BASE_MS,
    rateLimitMax: env.AI_QUEUE_RATE_LIMIT_MAX,
    rateLimitWindowMs: env.AI_QUEUE_RATE_LIMIT_WINDOW_MS,
    jobResultTtlMs: env.JOB_RESULT_TTL_MS,
    maxStoredJobs: env.JOB_MAX_STORED
  });

  const testQueue = new JobQueueService({
    queueName: "test",
    concurrency: env.TEST_QUEUE_CONCURRENCY,
    defaultMaxAttempts: env.TEST_QUEUE_MAX_ATTEMPTS,
    retryBaseDelayMs: env.TEST_QUEUE_RETRY_BASE_MS,
    rateLimitMax: env.TEST_QUEUE_RATE_LIMIT_MAX,
    rateLimitWindowMs: env.TEST_QUEUE_RATE_LIMIT_WINDOW_MS,
    jobResultTtlMs: env.JOB_RESULT_TTL_MS,
    maxStoredJobs: env.JOB_MAX_STORED
  });

  return new JobOrchestratorService({
    aiService,
    testExecutionService,
    aiQueue,
    testQueue
  });
}
