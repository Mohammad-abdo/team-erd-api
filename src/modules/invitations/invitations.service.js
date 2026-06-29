import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { signAccessToken, persistRefreshToken } from "../../lib/tokens.js";
import * as membersService from "../projects/members.service.js";

const SALT_ROUNDS = 10;

export async function previewProjectInvitation(token) {
  const invitation = await prisma.projectInvitation.findUnique({
    where: { token },
    include: {
      project: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!invitation) {
    throw new HttpError(404, "Invitation not found");
  }

  const expired = invitation.expiresAt < new Date();
  const used = Boolean(invitation.acceptedAt);
  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true },
  });

  return {
    invitation: {
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      expired,
      used,
      requiresRegistration: !existingUser,
    },
    project: invitation.project,
  };
}

export async function registerViaProjectInvitation({ token, name, password }) {
  const invitation = await prisma.projectInvitation.findUnique({
    where: { token },
    include: { project: { select: { id: true, name: true } } },
  });

  if (!invitation || invitation.acceptedAt) {
    throw new HttpError(400, "Invalid or already used invitation");
  }
  if (invitation.expiresAt < new Date()) {
    throw new HttpError(400, "Invitation has expired");
  }

  const normalized = invitation.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) {
    throw new HttpError(409, "Email already registered — sign in to accept this invitation");
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

  const acceptResult = await membersService.acceptInvitation({
    userId: user.id,
    userEmail: user.email,
    token,
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refresh = await persistRefreshToken(user.id);

  return {
    user,
    projectId: acceptResult.projectId,
    project: invitation.project,
    member: {
      id: acceptResult.member.id,
      role: acceptResult.member.role,
      joinedAt: acceptResult.member.joinedAt,
    },
    accessToken,
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
  };
}
