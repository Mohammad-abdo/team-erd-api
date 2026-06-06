import fs from "fs";
import path from "path";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { enrichUserProfile } from "../../lib/userProfile.js";
import { patchNotificationPrefs } from "../../lib/notificationPrefs.js";
import {
  avatarStoragePath,
  buildAvatarPublicUrl,
  deleteManagedAvatarFile,
} from "../../lib/avatarUpload.js";

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
  let notificationPrefsUpdate;
  if (data.notificationPrefs !== undefined) {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
    notificationPrefsUpdate = patchNotificationPrefs(
      existing?.notificationPrefs,
      data.notificationPrefs,
    );
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatar: true },
  });
  if (!existing) {
    throw new HttpError(401, "Invalid session");
  }

  const clearingAvatar = data.avatar === "" || data.avatar === null;
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.avatar !== undefined && {
        avatar: clearingAvatar ? null : data.avatar,
      }),
      ...(notificationPrefsUpdate !== undefined && { notificationPrefs: notificationPrefsUpdate }),
    },
  });

  if (clearingAvatar) {
    deleteManagedAvatarFile(existing.avatar, userId);
  }

  return enrichUserProfile(user.id);
}

export async function uploadUserAvatar(userId, file, req) {
  if (!file) {
    throw new HttpError(400, "No avatar file uploaded");
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatar: true },
  });
  if (!existing) {
    throw new HttpError(401, "Invalid session");
  }

  const avatarUrl = buildAvatarPublicUrl(req, userId, file.filename);
  await prisma.user.update({
    where: { id: userId },
    data: { avatar: avatarUrl },
  });

  deleteManagedAvatarFile(existing.avatar, userId);

  return enrichUserProfile(userId);
}

export function getUserAvatarFile(userId, filename) {
  const abs = avatarStoragePath(userId, filename);
  if (!fs.existsSync(abs)) {
    throw new HttpError(404, "Avatar not found");
  }
  const ext = path.extname(filename).toLowerCase();
  const mime = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  }[ext] ?? "application/octet-stream";
  return { abs, mime };
}
