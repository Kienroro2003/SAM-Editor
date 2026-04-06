import { AppError } from "../utils/app-error.js";

function parseBearerToken(headerValue) {
  if (!headerValue) {
    return null;
  }

  const [scheme, token] = String(headerValue).trim().split(/\s+/, 2);

  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

function createAnonymousContext() {
  return {
    isAuthenticated: false,
    userId: null,
    email: null,
    roles: [],
    isAdmin: false,
    raw: null
  };
}

export function createAuthenticateMiddleware({ authService, authRequired }) {
  return function authenticateMiddleware(req, _res, next) {
    const token = parseBearerToken(req.headers.authorization);

    if (!token) {
      if (authRequired) {
        return next(new AppError("Authentication required.", 401));
      }

      req.auth = createAnonymousContext();
      return next();
    }

    try {
      const auth = authService.verifyAccessToken(token);
      req.auth = {
        isAuthenticated: true,
        ...auth
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createRequireAuthMiddleware({ authRequired }) {
  if (!authRequired) {
    return function allowAnonymous(_req, _res, next) {
      next();
    };
  }

  return function requireAuthMiddleware(req, _res, next) {
    if (!req.auth || !req.auth.isAuthenticated) {
      return next(new AppError("Authentication required.", 401));
    }

    next();
  };
}

export function createRequireAdminMiddleware({ authorizationRequired }) {
  if (!authorizationRequired) {
    return function allowAll(_req, _res, next) {
      next();
    };
  }

  return function requireAdminMiddleware(req, _res, next) {
    if (!req.auth || !req.auth.isAuthenticated) {
      return next(new AppError("Authentication required.", 401));
    }

    if (!req.auth.isAdmin) {
      return next(new AppError("Admin role required.", 403));
    }

    next();
  };
}
