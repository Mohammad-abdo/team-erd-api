import { PlatformRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../utils/httpError.js";

export async function requireSuperAdmin(req, _res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { platformRole: true, isActive: true },
    });
    if (!user?.isActive || user.platformRole !== PlatformRole.SUPER_ADMIN) {
      return next(new HttpError(403, "Super admin access required"));
    }
    req.isSuperAdmin = true;
    req.isOrgAdmin = true;
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireOrgAdmin(req, _res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.actorId ?? req.user.sub },
      select: { platformRole: true, isActive: true },
    });
    const allowed = user?.isActive && (
      user.platformRole === PlatformRole.SUPER_ADMIN
      || user.platformRole === PlatformRole.ORG_ADMIN
    );
    if (!allowed) {
      return next(new HttpError(403, "Organization admin access required"));
    }
    req.isOrgAdmin = true;
    req.isSuperAdmin = user.platformRole === PlatformRole.SUPER_ADMIN;
    next();
  } catch (err) {
    next(err);
  }
}

/** @deprecated use requireSuperAdmin */
export const requirePlatformAdmin = requireSuperAdmin;

export async function isSuperAdmin(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true, isActive: true },
  });
  return Boolean(user?.isActive && user.platformRole === PlatformRole.SUPER_ADMIN);
}

export async function isOrgAdmin(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true, isActive: true },
  });
  return Boolean(
    user?.isActive && (
      user.platformRole === PlatformRole.SUPER_ADMIN
      || user.platformRole === PlatformRole.ORG_ADMIN
    ),
  );
}

/** @deprecated use isSuperAdmin */
export const isPlatformAdmin = isSuperAdmin;
