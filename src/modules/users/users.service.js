import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { enrichUserProfile } from "../../lib/userProfile.js";

export async function getUserById(id) {
  const user = await enrichUserProfile(id);
  if (!user) {
    throw new HttpError(401, "Invalid session");
  }
  return user;
}

export async function listUserDirectory({ q, limit = 50 } = {}) {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const where = { isActive: true };
  if (q?.trim()) {
    const term = q.trim();
    where.OR = [
      { name: { contains: term } },
      { email: { contains: term } },
    ];
  }
  return prisma.user.findMany({
    where,
    orderBy: { name: "asc" },
    take,
    select: { id: true, name: true, email: true, avatar: true },
  });
}

export async function updateUserProfile(userId, data) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.avatar !== undefined && {
        avatar: data.avatar === "" || data.avatar === null ? null : data.avatar,
      }),
    },
  });
  return enrichUserProfile(user.id);
}
