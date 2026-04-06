/**
 * Seed: admin + team users, one project, member roles, sample project_permissions.
 * Run: npx prisma db seed   (requires DATABASE_URL + prisma generate)
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import {
  PrismaClient,
  ProjectMemberRole,
  PermissionResource,
  PermissionAction,
  ProjectVisibility,
} from "@prisma/client";

const prisma = new PrismaClient();

const SEED_PASSWORD = "SeedPass123!";
const PROJECT_SLUG = "seed-team-demo";

const USERS = [
  { email: "admin@dbforge.seed", name: "Admin User", key: "admin" },
  { email: "editor@dbforge.seed", name: "Ed Editor", key: "editor" },
  { email: "viewer@dbforge.seed", name: "Vic Viewer", key: "viewer" },
  { email: "commenter@dbforge.seed", name: "Casey Commenter", key: "commenter" },
];

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  console.log("Seeding users…");
  const byKey = {};
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        name: u.name,
        passwordHash,
        isActive: true,
      },
      update: {
        name: u.name,
        passwordHash,
        isActive: true,
      },
    });
    byKey[u.key] = user;
  }

  const admin = byKey.admin;
  const editor = byKey.editor;
  const viewer = byKey.viewer;
  const commenter = byKey.commenter;

  const existing = await prisma.project.findUnique({
    where: { slug: PROJECT_SLUG },
  });
  if (existing) {
    console.log("Removing existing seed project…");
    await prisma.project.delete({ where: { id: existing.id } });
  }

  console.log("Creating project + team members…");
  const project = await prisma.project.create({
    data: {
      name: "Seed Team Demo",
      slug: PROJECT_SLUG,
      description:
        "Seeded workspace: admin (leader), editor, viewer, commenter — plus sample granular permissions.",
      visibility: ProjectVisibility.PRIVATE,
      leaderId: admin.id,
      members: {
        create: [
          { userId: admin.id, role: ProjectMemberRole.LEADER },
          { userId: editor.id, role: ProjectMemberRole.EDITOR, invitedById: admin.id },
          { userId: viewer.id, role: ProjectMemberRole.VIEWER, invitedById: admin.id },
          { userId: commenter.id, role: ProjectMemberRole.COMMENTER, invitedById: admin.id },
        ],
      },
    },
  });

  console.log("Seeding project_permissions (granular grants)…");
  await prisma.projectPermission.createMany({
    data: [
      {
        projectId: project.id,
        userId: viewer.id,
        resource: PermissionResource.ERD,
        action: PermissionAction.VIEW,
        grantedById: admin.id,
      },
      {
        projectId: project.id,
        userId: viewer.id,
        resource: PermissionResource.API,
        action: PermissionAction.VIEW,
        grantedById: admin.id,
      },
      {
        projectId: project.id,
        userId: editor.id,
        resource: PermissionResource.EXPORTS,
        action: PermissionAction.EDIT,
        grantedById: admin.id,
      },
      {
        projectId: project.id,
        userId: editor.id,
        resource: PermissionResource.API,
        action: PermissionAction.DELETE,
        grantedById: admin.id,
      },
      {
        projectId: project.id,
        userId: commenter.id,
        resource: PermissionResource.COMMENTS,
        action: PermissionAction.CREATE,
        grantedById: admin.id,
      },
      {
        projectId: project.id,
        userId: commenter.id,
        resource: PermissionResource.EXPORTS,
        action: PermissionAction.VIEW,
        grantedById: admin.id,
      },
    ],
  });

  console.log("\nDone.\n");
  console.log("Project:", project.name, `(${project.slug})`, "id:", project.id);
  console.log("Log in with any seeded user; password for all:");
  console.log(" ", SEED_PASSWORD);
  console.log("\nAccounts:");
  for (const u of USERS) {
    console.log(`  ${u.email}  →  ${u.name}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
