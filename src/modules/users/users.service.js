import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";

export async function getUserById(id) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      isActive: true,
      createdAt: true,
    },
  });
  /* Valid JWT but no row (e.g. DB reset / reseed) — use 401 so clients refresh or clear session, not a silent 404. */
  if (!user) {
    throw new HttpError(401, "Invalid session");
  }
  return user;
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
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      isActive: true,
      createdAt: true,
    },
  });
  return user;
}
