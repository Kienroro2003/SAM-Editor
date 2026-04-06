import { AppError } from "../utils/app-error.js";

function createAllowAllMiddleware() {
  return function allowAll(_req, _res, next) {
    next();
  };
}

function ensureAuthenticated(req) {
  if (!req.auth || !req.auth.isAuthenticated || !req.auth.userId) {
    throw new AppError("Authentication required.", 401);
  }
}

export function createRequireProjectRoleMiddleware({
  accessControlService,
  authorizationRequired,
  minRole,
  projectIdResolver
}) {
  if (!authorizationRequired) {
    return createAllowAllMiddleware();
  }

  return async function requireProjectRoleMiddleware(req, _res, next) {
    try {
      ensureAuthenticated(req);

      const projectId = await projectIdResolver(req);
      if (!projectId) {
        throw new AppError("projectId is required for authorization.", 400);
      }

      const role = await accessControlService.ensureProjectRole({
        userId: req.auth.userId,
        projectId,
        minRole,
        isAdmin: req.auth.isAdmin
      });

      req.authorization = {
        ...(req.authorization || {}),
        projectId,
        role
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createRequireScanRoleMiddleware({
  accessControlService,
  authorizationRequired,
  minRole,
  scanIdResolver
}) {
  if (!authorizationRequired) {
    return createAllowAllMiddleware();
  }

  return async function requireScanRoleMiddleware(req, _res, next) {
    try {
      ensureAuthenticated(req);

      const scanId = await scanIdResolver(req);
      if (!scanId) {
        throw new AppError("scanId is required for authorization.", 400);
      }

      const result = await accessControlService.ensureScanRole({
        userId: req.auth.userId,
        scanId,
        minRole,
        isAdmin: req.auth.isAdmin
      });

      req.authorization = {
        ...(req.authorization || {}),
        scanId,
        projectId: result.projectId,
        role: result.role
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createRequireScanFileRoleMiddleware({
  accessControlService,
  authorizationRequired,
  minRole,
  scanFileIdResolver
}) {
  if (!authorizationRequired) {
    return createAllowAllMiddleware();
  }

  return async function requireScanFileRoleMiddleware(req, _res, next) {
    try {
      ensureAuthenticated(req);

      const scanFileId = await scanFileIdResolver(req);
      if (!scanFileId) {
        throw new AppError("scanFileId is required for authorization.", 400);
      }

      const result = await accessControlService.ensureScanFileRole({
        userId: req.auth.userId,
        scanFileId,
        minRole,
        isAdmin: req.auth.isAdmin
      });

      req.authorization = {
        ...(req.authorization || {}),
        scanFileId,
        projectId: result.projectId,
        role: result.role
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
