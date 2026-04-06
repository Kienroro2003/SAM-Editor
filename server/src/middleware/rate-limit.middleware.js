import { AppError } from "../utils/app-error.js";

export function createInMemoryRateLimiter({ keyPrefix, windowMs, maxRequests }) {
  if (!windowMs || !maxRequests || windowMs <= 0 || maxRequests <= 0) {
    return function noRateLimit(_req, _res, next) {
      next();
    };
  }

  const bucket = new Map();

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const ip =
      req.ip ||
      String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      "unknown";

    const key = `${keyPrefix}:${ip}`;
    const current = bucket.get(key) || [];
    const active = current.filter((timestamp) => now - timestamp < windowMs);

    if (active.length >= maxRequests) {
      const retryAfterMs = Math.max(windowMs - (now - active[0]), 0);
      const retryAfterSec = Math.max(Math.ceil(retryAfterMs / 1000), 1);
      res.setHeader("Retry-After", String(retryAfterSec));

      return next(
        new AppError("Rate limit exceeded. Please retry later.", 429, {
          keyPrefix,
          retryAfterSec
        })
      );
    }

    active.push(now);
    bucket.set(key, active);

    if (bucket.size > 50000) {
      for (const [bucketKey, timestamps] of bucket.entries()) {
        const filtered = timestamps.filter((timestamp) => now - timestamp < windowMs);
        if (filtered.length === 0) {
          bucket.delete(bucketKey);
        } else {
          bucket.set(bucketKey, filtered);
        }
      }
    }

    next();
  };
}
