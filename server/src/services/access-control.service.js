import { ScanRepository } from "../repositories/scan.repository.js";
import { AppError } from "../utils/app-error.js";

const ROLE_WEIGHT = {
  viewer: 1,
  member: 2,
  owner: 3,
  admin: 4
};

function normalizeRole(role) {
  if (!role) {
    return null;
  }

  return String(role).trim().toLowerCase();
}

function hasEnoughRole(currentRole, minRole) {
  const current = ROLE_WEIGHT[normalizeRole(currentRole)] || 0;
  const required = ROLE_WEIGHT[normalizeRole(minRole)] || 0;

  return current >= required;
}

export class AccessControlService {
  constructor(scanRepository) {
    this.scanRepository = scanRepository;
  }

  async ensureProjectRole({ userId, projectId, minRole = "viewer", isAdmin = false }) {
    if (isAdmin) {
      return "admin";
    }

    const role = await this.scanRepository.getProjectRoleForUser(projectId, userId);

    if (!role) {
      throw new AppError("Access denied for this project.", 403);
    }

    if (!hasEnoughRole(role, minRole)) {
      throw new AppError(
        `Insufficient project role. Required: ${minRole}, current: ${role}.`,
        403
      );
    }

    return role;
  }

  async ensureScanRole({ userId, scanId, minRole = "viewer", isAdmin = false }) {
    const projectId = await this.scanRepository.getProjectIdByScanId(scanId);

    if (!projectId) {
      throw new AppError("Scan not found.", 404);
    }

    const role = await this.ensureProjectRole({
      userId,
      projectId,
      minRole,
      isAdmin
    });

    return {
      role,
      projectId
    };
  }

  async ensureScanFileRole({ userId, scanFileId, minRole = "viewer", isAdmin = false }) {
    const projectId = await this.scanRepository.getProjectIdByScanFileId(scanFileId);

    if (!projectId) {
      throw new AppError("Scan file not found.", 404);
    }

    const role = await this.ensureProjectRole({
      userId,
      projectId,
      minRole,
      isAdmin
    });

    return {
      role,
      projectId
    };
  }
}

export function createAccessControlService(pool) {
  return new AccessControlService(new ScanRepository(pool));
}
