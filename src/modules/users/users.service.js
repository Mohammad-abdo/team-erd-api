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
