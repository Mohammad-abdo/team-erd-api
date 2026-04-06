import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { prisma } from "./prisma.js";
import { durationToMs } from "../utils/time.js";

export function signAccessToken(payload) {
  return jwt.sign(
    { sub: payload.sub, email: payload.email },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpires },
  );
}

export function createRefreshTokenRow(userId) {
  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + durationToMs(config.jwt.refreshExpires));
  return { token, expiresAt };
}

export async function persistRefreshToken(userId) {
  const { token, expiresAt } = createRefreshTokenRow(userId);
  await prisma.refreshToken.create({
    data: { userId, token, expiresAt },
  });
  return { token, expiresAt };
}

export async function rotateRefreshToken(oldToken) {
  const existing = await prisma.refreshToken.findUnique({
    where: { token: oldToken },
    include: { user: true },
  });

  if (!existing || existing.expiresAt < new Date()) {
    return null;
  }

  if (!existing.user.isActive) {
    await prisma.refreshToken.deleteMany({ where: { userId: existing.userId } });
    return null;
  }

  await prisma.refreshToken.delete({ where: { id: existing.id } });
  const { token, expiresAt } = createRefreshTokenRow(existing.userId);
  await prisma.refreshToken.create({
    data: { userId: existing.userId, token, expiresAt },
  });

  return {
    user: existing.user,
    refreshToken: token,
    refreshExpiresAt: expiresAt,
  };
}
