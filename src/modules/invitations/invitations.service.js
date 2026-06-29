import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { signAccessToken, persistRefreshToken } from "../../lib/tokens.js";

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

  // Wrap user creation + member creation + token consumption in one transaction
  const { user, member } = await prisma.$transaction(async (tx) => {
    // Re-check inside transaction to handle concurrent requests on the same token
    const inv = await tx.projectInvitation.findUnique({ where: { token } });
    if (!inv || inv.acceptedAt) throw new HttpError(400, "Invitation was just used");

    const created = await tx.user.create({
      data: { name: name.trim(), email: normalized, passwordHash },
      select: { id: true, name: true, email: true, avatar: true, createdAt: true },
    });

    const m = await tx.projectMember.create({
      data: { projectId: inv.projectId, userId: created.id, role: inv.role },
    });

    await tx.projectInvitation.update({
      where: { id: inv.id },
      data: { acceptedAt: new Date() },
    });

    return { user: created, member: m };
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refresh = await persistRefreshToken(user.id);

  return {
    user,
    projectId: invitation.projectId,
    project: invitation.project,
    member: {
      id: member.id,
      role: member.role,
      joinedAt: member.joinedAt ?? member.createdAt,
    },
    accessToken,
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
  };
}
