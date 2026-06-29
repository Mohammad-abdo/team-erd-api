import { z } from "zod";
import bcrypt from "bcryptjs";
import { PlatformRole, TeamRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { slugify } from "../../utils/slug.js";
import { loadAdminActor, assertTeamInOrgScope } from "../../lib/adminScope.js";
import { DEFAULT_ORG_ID } from "../../lib/orgScope.js";

const SALT_ROUNDS = 10;

async function uniqueOrgSlug(base) {
  let slug = slugify(base);
  for (let i = 0; i < 20; i += 1) {
    const taken = await prisma.organization.findUnique({ where: { slug } });
    if (!taken) return slug;
    slug = `${slugify(base)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  throw new HttpError(500, "Could not allocate organization slug");
}

export async function registerOrganization(input) {
  const existing = await prisma.user.findUnique({ where: { email: input.adminEmail } });
  if (existing) throw new HttpError(409, "Email already registered");

  const slug = await uniqueOrgSlug(input.organizationName);
  const passwordHash = await bcrypt.hash(input.adminPassword, SALT_ROUNDS);

  const org = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: input.organizationName.trim(),
        slug,
        settings: {},
      },
    });

    const user = await tx.user.create({
      data: {
        name: input.adminName.trim(),
        email: input.adminEmail.trim().toLowerCase(),
        passwordHash,
        platformRole: PlatformRole.ORG_ADMIN,
        organizationId: organization.id,
      },
    });

    return { organization, user };
  });

  return {
    organization: org.organization,
    userId: org.user.id,
  };
}

function resolveActorOrgId(actor) {
  if (actor.isSuperAdmin && !actor.user.organizationId) {
    return DEFAULT_ORG_ID;
  }
  return actor.user.organizationId ?? DEFAULT_ORG_ID;
}

export async function getOrgSettings(userId) {
  const actor = await loadAdminActor(userId);
  const org = await prisma.organization.findUnique({
    where: { id: resolveActorOrgId(actor) },
  });
  if (!org) throw new HttpError(404, "Organization not found");
  return org;
}

export async function patchOrgSettings(userId, input) {
  const actor = await loadAdminActor(userId);
  const orgId = resolveActorOrgId(actor);
  const current = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!current) throw new HttpError(404, "Organization not found");

  const settings = {
    ...(typeof current.settings === "object" && current.settings ? current.settings : {}),
    ...(input.settings ?? {}),
  };

  return prisma.organization.update({
    where: { id: orgId },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      settings,
    },
  });
}

export const patchOrgSettingsSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  settings: z.object({
    logoUrl: z.string().max(500).optional(),
    timezone: z.string().max(80).optional(),
    invitePolicy: z.enum(["open", "admin_only"]).optional(),
    shiftRequired: z.boolean().optional(),
    voiceNotifications: z.boolean().optional(),
  }).optional(),
});

export async function getOrganization(orgId) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new HttpError(404, "Organization not found");
  return org;
}

export async function listOrganizationsForSuperAdmin() {
  return prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { users: true, teams: true, projects: true } },
    },
  });
}

export const registerOrganizationSchema = z.object({
  organizationName: z.string().min(2).max(200),
  adminName: z.string().min(1).max(200),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8).max(128),
});

export const createTeamAccountSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  teamId: z.string().min(1),
  teamRole: z.enum(["MEMBER", "TEAM_LEAD", "PROJECT_MANAGER"]).optional(),
});

/** ORG_ADMIN creates a team-scoped account (TEAM_ADMIN) with fewer powers than company admin. */
export async function createTeamAccount(actorId, input) {
  const actor = await loadAdminActor(actorId);
  await assertTeamInOrgScope(actor, input.teamId);

  const normalized = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) throw new HttpError(409, "Email already registered");

  const organizationId = actor.isSuperAdmin
    ? (await prisma.team.findUnique({ where: { id: input.teamId }, select: { organizationId: true } }))?.organizationId
    : (actor.user.organizationId ?? DEFAULT_ORG_ID);

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const teamRole = input.teamRole ?? TeamRole.TEAM_LEAD;

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name.trim(),
        email: normalized,
        passwordHash,
        platformRole: PlatformRole.TEAM_ADMIN,
        organizationId: organizationId ?? DEFAULT_ORG_ID,
      },
    });
    await tx.teamMember.create({
      data: {
        teamId: input.teamId,
        userId: created.id,
        role: teamRole,
      },
    });
    return created;
  });

  return { userId: user.id, email: user.email, platformRole: user.platformRole };
}
