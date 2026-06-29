import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { PlatformRole, TeamRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { sendEmail } from "../../lib/email.js";
import { config } from "../../config/index.js";
import { logAdminAudit } from "../../lib/audit.js";
import { signAccessToken, persistRefreshToken } from "../../lib/tokens.js";
import {
  loadAdminActor,
  assertTeamInOrgScope,
  assertAssignablePlatformRole,
} from "../../lib/adminScope.js";
import { DEFAULT_ORG_ID } from "../../lib/orgScope.js";

const SALT_ROUNDS = 10;
const INVITE_MS = 7 * 24 * 60 * 60 * 1000;

function inviteUrl(token) {
  return `${config.appUrl}/org-invite?token=${token}`;
}

async function loadValidInvitation(token) {
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { token },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      team: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!invitation || invitation.acceptedAt) {
    throw new HttpError(400, "Invalid or already used invitation");
  }
  if (invitation.expiresAt < new Date()) {
    throw new HttpError(400, "Invitation has expired");
  }
  return invitation;
}

function orgIdForActor(actor) {
  return actor.user.organizationId ?? DEFAULT_ORG_ID;
}

export async function createOrganizationInvitation(actorId, input) {
  const actor = await loadAdminActor(actorId);
  const organizationId = actor.isSuperAdmin
    ? (input.organizationId ?? orgIdForActor(actor))
    : orgIdForActor(actor);

  const platformRole = input.platformRole ?? PlatformRole.MEMBER;
  assertAssignablePlatformRole(actor, platformRole);

  if (input.teamId) {
    await assertTeamInOrgScope(actor, input.teamId);
  }

  const normalized = input.email.trim().toLowerCase();
  const existingUser = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, organizationId: true },
  });
  if (existingUser && (existingUser.organizationId ?? DEFAULT_ORG_ID) === organizationId) {
    throw new HttpError(409, "User is already a member of this organization");
  }

  const pending = await prisma.organizationInvitation.findFirst({
    where: {
      organizationId,
      email: normalized,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (pending) {
    throw new HttpError(409, "An active invitation already exists for this email");
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_MS);
  const teamRole = input.teamRole ?? (input.teamId ? TeamRole.MEMBER : null);

  const invitation = await prisma.organizationInvitation.create({
    data: {
      organizationId,
      email: normalized,
      token,
      platformRole,
      teamId: input.teamId ?? null,
      teamRole,
      expiresAt,
      invitedById: actorId,
    },
    include: {
      organization: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      invitedBy: { select: { id: true, name: true, email: true } },
    },
  });

  const orgName = invitation.organization.name;
  const teamLine = invitation.team ? ` Team: ${invitation.team.name}.` : "";
  const url = inviteUrl(token);
  await sendEmail({
    to: normalized,
    subject: `Invitation to join ${orgName} on DBForge`,
    text: `You have been invited to join "${orgName}" on DBForge as ${platformRole}.${teamLine}\n\nAccept the invitation:\n${url}\n\nThis link expires in 7 days.`,
  });

  await logAdminAudit({
    userId: actorId,
    organizationId,
    action: "created",
    entityType: "organization_invitation",
    entityId: invitation.id,
    meta: { email: normalized, platformRole },
  });

  return {
    id: invitation.id,
    email: invitation.email,
    platformRole: invitation.platformRole,
    teamId: invitation.teamId,
    teamRole: invitation.teamRole,
    expiresAt: invitation.expiresAt,
    inviteUrl: url,
    organization: invitation.organization,
    team: invitation.team,
    invitedBy: invitation.invitedBy,
  };
}

export async function listOrganizationInvitations(actorId) {
  const actor = await loadAdminActor(actorId);
  const organizationId = orgIdForActor(actor);
  const where = actor.isSuperAdmin
    ? { acceptedAt: null, expiresAt: { gt: new Date() } }
    : {
        organizationId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      };

  const invitations = await prisma.organizationInvitation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      platformRole: true,
      teamId: true,
      teamRole: true,
      expiresAt: true,
      createdAt: true,
      organization: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      invitedBy: { select: { id: true, name: true, email: true } },
    },
  });

  return { invitations };
}

export async function revokeOrganizationInvitation(actorId, invitationId) {
  const actor = await loadAdminActor(actorId);
  const organizationId = orgIdForActor(actor);

  const invitation = await prisma.organizationInvitation.findFirst({
    where: actor.isSuperAdmin
      ? { id: invitationId, acceptedAt: null }
      : { id: invitationId, organizationId, acceptedAt: null },
  });
  if (!invitation) {
    throw new HttpError(404, "Invitation not found");
  }

  await prisma.organizationInvitation.delete({ where: { id: invitation.id } });

  await logAdminAudit({
    userId: actorId,
    organizationId: invitation.organizationId,
    action: "deleted",
    entityType: "organization_invitation",
    entityId: invitation.id,
    meta: { email: invitation.email },
  });
}

export async function previewOrganizationInvitation(token) {
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { token },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      team: { select: { id: true, name: true, slug: true } },
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
      platformRole: invitation.platformRole,
      teamRole: invitation.teamRole,
      expiresAt: invitation.expiresAt,
      expired,
      used,
      requiresRegistration: !existingUser,
    },
    organization: invitation.organization,
    team: invitation.team,
  };
}

async function fulfillOrganizationInvitation(invitation, userId) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        organizationId: invitation.organizationId,
        platformRole: invitation.platformRole,
      },
    });

    if (invitation.teamId) {
      const existingMembership = await tx.teamMember.findUnique({
        where: {
          teamId_userId: { teamId: invitation.teamId, userId },
        },
      });
      if (!existingMembership) {
        await tx.teamMember.create({
          data: {
            teamId: invitation.teamId,
            userId,
            role: invitation.teamRole ?? TeamRole.MEMBER,
          },
        });
      }
    }

    await tx.organizationInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
  });
}

export async function acceptOrganizationInvitation({ userId, userEmail, token }) {
  const invitation = await loadValidInvitation(token);

  if (invitation.email !== userEmail.trim().toLowerCase()) {
    throw new HttpError(403, "Signed-in user does not match invitation email");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });
  if ((user?.organizationId ?? DEFAULT_ORG_ID) === invitation.organizationId) {
    await prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
    return {
      organizationId: invitation.organizationId,
      alreadyMember: true,
      organization: invitation.organization,
    };
  }

  await fulfillOrganizationInvitation(invitation, userId);

  return {
    organizationId: invitation.organizationId,
    alreadyMember: false,
    organization: invitation.organization,
    team: invitation.team,
  };
}

export async function registerViaOrganizationInvitation({ token, name, password }) {
  const invitation = await loadValidInvitation(token);
  const normalized = invitation.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) {
    throw new HttpError(409, "Email already registered — sign in to accept this invitation");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: name.trim(),
        email: normalized,
        passwordHash,
        platformRole: invitation.platformRole,
        organizationId: invitation.organizationId,
      },
      select: { id: true, name: true, email: true, avatar: true, createdAt: true },
    });

    if (invitation.teamId) {
      await tx.teamMember.create({
        data: {
          teamId: invitation.teamId,
          userId: created.id,
          role: invitation.teamRole ?? TeamRole.MEMBER,
        },
      });
    }

    await tx.organizationInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });

    return created;
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refresh = await persistRefreshToken(user.id);

  return {
    user,
    organizationId: invitation.organizationId,
    organization: invitation.organization,
    team: invitation.team,
    accessToken,
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
  };
}
