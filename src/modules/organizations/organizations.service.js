import { z } from "zod";
import bcrypt from "bcryptjs";
import { PlatformRole, TeamRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { slugify } from "../../utils/slug.js";
import { loadAdminActor, assertTeamInOrgScope } from "../../lib/adminScope.js";
import { DEFAULT_ORG_ID } from "../../lib/orgScope.js";
import {
  buildOrgLogoPublicUrl,
  deleteManagedOrgLogoFile,
} from "../../lib/orgLogoUpload.js";

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
  return normalizeOrgRecord(org);
}

export async function getOrgBranding(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });
  if (!user?.organizationId) return null;
  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
  });
  if (!org) return null;
  return pickPublicBranding(org);
}

function pickPublicBranding(org) {
  const settings = typeof org.settings === "object" && org.settings ? org.settings : {};
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    logoUrl: settings.logoUrl ?? null,
    tagline: settings.tagline ?? null,
    brandColor: settings.brandColor ?? null,
  };
}

function normalizeOrgRecord(org) {
  const settings = typeof org.settings === "object" && org.settings ? org.settings : {};
  return {
    ...org,
    settings: {
      ...settings,
      logoUrl: settings.logoUrl ?? "",
    },
  };
}

export async function patchOrgSettings(userId, input) {
  const actor = await loadAdminActor(userId);
  const orgId = resolveActorOrgId(actor);
  const current = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!current) throw new HttpError(404, "Organization not found");

  const prevSettings = typeof current.settings === "object" && current.settings ? current.settings : {};
  const settings = {
    ...prevSettings,
    ...(input.settings ?? {}),
  };

  if (input.settings?.logoUrl === "" || input.settings?.logoUrl === null) {
    deleteManagedOrgLogoFile(prevSettings.logoUrl, orgId);
    settings.logoUrl = "";
  }

  const updated = await prisma.organization.update({
    where: { id: orgId },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      settings,
    },
  });
  return normalizeOrgRecord(updated);
}

export async function uploadOrgLogo(userId, file, req) {
  if (!file) throw new HttpError(400, "No logo file uploaded");
  const actor = await loadAdminActor(userId);
  const orgId = resolveActorOrgId(actor);
  const current = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!current) throw new HttpError(404, "Organization not found");

  const prevSettings = typeof current.settings === "object" && current.settings ? current.settings : {};
  const logoUrl = buildOrgLogoPublicUrl(req, orgId, file.filename);

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      settings: { ...prevSettings, logoUrl },
    },
  });

  deleteManagedOrgLogoFile(prevSettings.logoUrl, orgId);
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  return normalizeOrgRecord(org);
}

export async function removeOrgLogo(userId) {
  const actor = await loadAdminActor(userId);
  const orgId = resolveActorOrgId(actor);
  const current = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!current) throw new HttpError(404, "Organization not found");

  const prevSettings = typeof current.settings === "object" && current.settings ? current.settings : {};
  deleteManagedOrgLogoFile(prevSettings.logoUrl, orgId);

  const updated = await prisma.organization.update({
    where: { id: orgId },
    data: {
      settings: { ...prevSettings, logoUrl: "" },
    },
  });
  return normalizeOrgRecord(updated);
}

export const patchOrgSettingsSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  settings: z.object({
    logoUrl: z.string().max(500).optional().nullable(),
    tagline: z.string().max(300).optional(),
    website: z.string().max(300).optional(),
    supportEmail: z.string().email().optional().or(z.literal("")),
    contactPhone: z.string().max(40).optional(),
    companyAddress: z.string().max(500).optional(),
    brandColor: z.string().max(20).optional(),
    timezone: z.string().max(80).optional(),
    defaultLocale: z.enum(["en", "ar"]).optional(),
    weekStartsOn: z.number().int().min(0).max(6).optional(),
    invitePolicy: z.enum(["open", "admin_only"]).optional(),
    shiftRequired: z.boolean().optional(),
    voiceNotifications: z.boolean().optional(),
    requireDailyReports: z.boolean().optional(),
    weeklyDigestEnabled: z.boolean().optional(),
    clientPortalEnabled: z.boolean().optional(),
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

async function assertTeamAccountUser(actor, userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, platformRole: true, organizationId: true },
  });
  if (!user || user.platformRole !== PlatformRole.TEAM_ADMIN) {
    throw new HttpError(404, "Team account not found");
  }
  await assertUserInOrgScope(actor, user);
  return user;
}

function formatTeamAccount(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    isActive: row.isActive,
    createdAt: row.createdAt,
    teams: row.teamMemberships.map((m) => ({
      id: m.team.id,
      name: m.team.name,
      color: m.team.color,
      role: m.role,
    })),
  };
}

export async function listTeamAccounts(actorId) {
  const actor = await loadAdminActor(actorId);
  const orgId = resolveActorOrgId(actor);
  const rows = await prisma.user.findMany({
    where: {
      organizationId: orgId,
      platformRole: PlatformRole.TEAM_ADMIN,
    },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      createdAt: true,
      teamMemberships: {
        include: {
          team: { select: { id: true, name: true, color: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(formatTeamAccount);
}

export const updateTeamAccountSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128).optional(),
  teamId: z.string().min(1).optional(),
  teamRole: z.enum(["MEMBER", "TEAM_LEAD", "PROJECT_MANAGER"]).optional(),
  isActive: z.boolean().optional(),
});

export async function updateTeamAccount(actorId, userId, input) {
  const actor = await loadAdminActor(actorId);
  await assertTeamAccountUser(actor, userId);

  if (actorId === userId && input.isActive === false) {
    throw new HttpError(400, "Cannot deactivate your own account");
  }

  const data = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.email !== undefined) {
    const normalized = input.email.trim().toLowerCase();
    const existing = await prisma.user.findFirst({
      where: { email: normalized, id: { not: userId } },
    });
    if (existing) throw new HttpError(409, "Email already registered");
    data.email = normalized;
  }
  if (input.password) {
    data.passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length) {
      await tx.user.update({ where: { id: userId }, data });
    }
    if (input.teamId) {
      await assertTeamInOrgScope(actor, input.teamId);
      await tx.teamMember.deleteMany({ where: { userId } });
      await tx.teamMember.create({
        data: {
          userId,
          teamId: input.teamId,
          role: input.teamRole ?? TeamRole.TEAM_LEAD,
        },
      });
    } else if (input.teamRole) {
      const membership = await tx.teamMember.findFirst({ where: { userId } });
      if (membership) {
        await tx.teamMember.update({
          where: { id: membership.id },
          data: { role: input.teamRole },
        });
      }
    }
  });

  const updated = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      createdAt: true,
      teamMemberships: {
        include: { team: { select: { id: true, name: true, color: true } } },
      },
    },
  });
  return formatTeamAccount(updated);
}

export async function deleteTeamAccount(actorId, userId) {
  const actor = await loadAdminActor(actorId);
  await assertTeamAccountUser(actor, userId);
  if (actorId === userId) {
    throw new HttpError(400, "Cannot delete your own account");
  }
  await prisma.$transaction(async (tx) => {
    await tx.teamMember.deleteMany({ where: { userId } });
    await tx.user.update({ where: { id: userId }, data: { isActive: false } });
  });
  return { ok: true };
}
