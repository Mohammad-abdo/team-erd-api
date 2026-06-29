import { z } from "zod";
import bcrypt from "bcryptjs";
import { PlatformRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { slugify } from "../../utils/slug.js";

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

export async function getOrganization(orgId) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new HttpError(404, "Organization not found");
  return org;
}

export async function listOrganizationsForSuperAdmin() {
  return prisma.organization.findMany({ orderBy: { createdAt: "desc" } });
}

export const registerOrganizationSchema = z.object({
  organizationName: z.string().min(2).max(200),
  adminName: z.string().min(1).max(200),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8).max(128),
});
