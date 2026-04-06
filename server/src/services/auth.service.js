import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";

function normalizeRoles(payload) {
  if (Array.isArray(payload.roles)) {
    return payload.roles
      .map((role) => String(role || "").trim().toLowerCase())
      .filter(Boolean);
  }

  if (payload.role) {
    return [String(payload.role).trim().toLowerCase()];
  }

  return [];
}

export class AuthService {
  constructor({ jwtSecret, jwtIssuer, jwtAudience }) {
    this.jwtSecret = jwtSecret;
    this.jwtIssuer = jwtIssuer;
    this.jwtAudience = jwtAudience;
  }

  verifyAccessToken(token) {
    if (!this.jwtSecret) {
      throw new AppError("AUTH_JWT_SECRET is not configured.", 500);
    }

    try {
      const options = {
        algorithms: ["HS256"]
      };

      if (this.jwtIssuer) {
        options.issuer = this.jwtIssuer;
      }

      if (this.jwtAudience) {
        options.audience = this.jwtAudience;
      }

      const payload = jwt.verify(token, this.jwtSecret, options);

      const userId = payload.sub || payload.userId || payload.id;
      if (!userId) {
        throw new AppError("Token subject is missing.", 401);
      }

      const roles = normalizeRoles(payload);

      return {
        userId: String(userId),
        email: payload.email ? String(payload.email) : null,
        roles,
        isAdmin: roles.includes("admin"),
        raw: payload
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError("Invalid or expired access token.", 401);
    }
  }

  createToken({ userId, email = null, roles = [], expiresIn = "1h" }) {
    if (!this.jwtSecret) {
      throw new AppError("AUTH_JWT_SECRET is not configured.", 500);
    }

    if (!userId) {
      throw new AppError("userId is required to create token.", 400);
    }

    const payload = {
      sub: userId,
      email,
      roles
    };

    const options = {
      algorithm: "HS256",
      expiresIn
    };

    if (this.jwtIssuer) {
      options.issuer = this.jwtIssuer;
    }

    if (this.jwtAudience) {
      options.audience = this.jwtAudience;
    }

    return jwt.sign(payload, this.jwtSecret, options);
  }
}

export function createAuthService(options = {}) {
  return new AuthService({
    jwtSecret: options.jwtSecret || env.AUTH_JWT_SECRET,
    jwtIssuer: options.jwtIssuer || env.AUTH_JWT_ISSUER,
    jwtAudience: options.jwtAudience || env.AUTH_JWT_AUDIENCE
  });
}
