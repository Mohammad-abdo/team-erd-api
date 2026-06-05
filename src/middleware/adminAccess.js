import { PlatformRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../utils/httpError.js";

export async function requirePlatformAdmin(req, _res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { platformRole: true, isActive: true },
    });
    if (!user?.isActive || user.platformRole !== PlatformRole.SUPER_ADMIN) {
      return next(new HttpError(403, "Platform admin access required"));
    }
    req.isPlatformAdmin = true;
    next();
  } catch (err) {
    next(err);
  }
}

export async function isPlatformAdmin(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true, isActive: true },
  });
  return Boolean(user?.isActive && user.platformRole === PlatformRole.SUPER_ADMIN);
}
