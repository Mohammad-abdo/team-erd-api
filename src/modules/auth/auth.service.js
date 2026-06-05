import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { signAccessToken, persistRefreshToken } from "../../lib/tokens.js";
import { sendEmail } from "../../lib/email.js";
import { config } from "../../config/index.js";
import { enrichUserProfile } from "../../lib/userProfile.js";

const SALT_ROUNDS = 10;

export async function registerUser({ name, email, password }) {
  const normalized = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) {
    throw new HttpError(409, "Email already registered");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: normalized,
      passwordHash,
    },
    select: { id: true, name: true, email: true, avatar: true, createdAt: true },
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refresh = await persistRefreshToken(user.id);

  return {
    user,
    accessToken,
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
  };
}

export async function loginUser({ email, password }) {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user || !user.isActive) {
    throw new HttpError(401, "Invalid email or password");
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new HttpError(401, "Invalid email or password");
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refresh = await persistRefreshToken(user.id);
  const profile = await enrichUserProfile(user.id);

  return {
    user: profile,
    accessToken,
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
  };
}

export async function logoutUser(userId, refreshToken) {
  if (refreshToken) {
    await prisma.refreshToken.deleteMany({
      where: { userId, token: refreshToken },
    });
  } else {
    await prisma.refreshToken.deleteMany({ where: { userId } });
  }
}

const RESET_TOKEN_MS = 60 * 60 * 1000;

/**
 * Creates a reset token when the user exists. Response is always generic to callers.
 * @returns {{ devToken?: string }}
 */
export async function requestPasswordReset(email) {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user?.isActive) {
    return {};
  }

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + RESET_TOKEN_MS),
    },
  });

  const resetUrl = `${config.appUrl}/auth/reset-password?token=${token}`;
  await sendEmail({
    to: normalized,
    subject: "Reset your DBForge password",
    text: `Use this link to reset your password (valid for 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
  });

  return { devToken: config.isProd ? undefined : token };
}

export async function resetPasswordWithToken(token, password) {
  const row = await prisma.passwordResetToken.findUnique({
    where: { token },
  });

  if (!row || row.expiresAt < new Date()) {
    throw new HttpError(400, "Invalid or expired reset token");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: row.userId },
      data: { passwordHash },
    });
    await tx.passwordResetToken.delete({ where: { id: row.id } });
    await tx.refreshToken.deleteMany({ where: { userId: row.userId } });
  });
}
