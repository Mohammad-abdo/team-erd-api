import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";

const runIntegration = process.env.INTEGRATION_TESTS === "1";
const describeIntegration = runIntegration ? describe : describe.skip;

const SEED_PASSWORD = "adminabdo123";
const ADMIN_EMAIL = "admin@team.com";
const MEMBER_EMAIL = "editor@dbforge.seed";

async function login(email) {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password: SEED_PASSWORD });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.accessToken, user: res.body.user };
}

describeIntegration("Admin users (integration)", () => {
  let adminToken;
  let adminUserId;
  let memberToken;
  let memberUserId;
  let tempUserId;
  let teamId;

  beforeAll(async () => {
    const admin = await login(ADMIN_EMAIL);
    adminToken = admin.token;
    adminUserId = admin.user.id;

    const member = await login(MEMBER_EMAIL);
    memberToken = member.token;
    memberUserId = member.user.id;

    const team = await prisma.team.findFirst({ where: { slug: "frontend" } });
    teamId = team?.id;
    expect(teamId).toBeTruthy();
  }, 30000);

  afterAll(async () => {
    if (tempUserId) {
      await prisma.user.delete({ where: { id: tempUserId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("super admin patches platformRole MEMBER → CLIENT", async () => {
    const createRes = await request(app)
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "CI Role Test",
        email: `ci-role-${Date.now()}@dbforge.test`,
        password: SEED_PASSWORD,
        platformRole: "MEMBER",
      });

    expect(createRes.status).toBe(201);
    tempUserId = createRes.body.user?.id;
    expect(tempUserId).toBeTruthy();

    const patchRes = await request(app)
      .patch(`/api/admin/users/${tempUserId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ platformRole: "CLIENT" });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.user?.platformRole).toBe("CLIENT");

    const detailRes = await request(app)
      .get(`/api/admin/users/${tempUserId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.user?.platformRole).toBe("CLIENT");
  });

  test("patch isActive false on another user", async () => {
    expect(tempUserId).toBeTruthy();

    const patchRes = await request(app)
      .patch(`/api/admin/users/${tempUserId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.user?.isActive).toBe(false);
  });

  test("self-deactivate is blocked", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${adminUserId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/deactivate/i);
  });

  test("non-admin PATCH returns 403", async () => {
    expect(tempUserId).toBeTruthy();

    const res = await request(app)
      .patch(`/api/admin/users/${tempUserId}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ platformRole: "MEMBER" });

    expect(res.status).toBe(403);
  });

  test("invalid platformRole returns 400", async () => {
    expect(tempUserId).toBeTruthy();

    const res = await request(app)
      .patch(`/api/admin/users/${tempUserId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ platformRole: "NOT_A_ROLE" });

    expect(res.status).toBe(400);
  });

  test("assignUserTeam upserts team role", async () => {
    const createRes = await request(app)
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "CI Team Role",
        email: `ci-team-role-${Date.now()}@dbforge.test`,
        password: SEED_PASSWORD,
        platformRole: "MEMBER",
      });

    expect(createRes.status).toBe(201);
    const userId = createRes.body.user?.id;

    const assignRes = await request(app)
      .post(`/api/admin/users/${userId}/teams`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ teamId, role: "MEMBER" });

    expect(assignRes.status).toBe(201);

    const upsertRes = await request(app)
      .post(`/api/admin/users/${userId}/teams`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ teamId, role: "TEAM_LEAD" });

    expect(upsertRes.status).toBe(201);

    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    expect(membership?.role).toBe("TEAM_LEAD");

    await prisma.teamMember.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });
});
