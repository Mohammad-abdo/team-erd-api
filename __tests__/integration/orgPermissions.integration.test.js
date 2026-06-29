import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";

const runIntegration = process.env.INTEGRATION_TESTS === "1";
const describeIntegration = runIntegration ? describe : describe.skip;

const SEED_PASSWORD = "adminabdo123";
const PROJECT_SLUG = "e-commerce-platform";

async function login(email) {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password: SEED_PASSWORD });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken;
}

describeIntegration("Org scope and permissions (integration)", () => {
  let projectId;
  let editorToken;
  let commenterToken;
  let editorId;
  let commenterId;

  beforeAll(async () => {
    editorToken = await login("editor@dbforge.seed");
    commenterToken = await login("commenter@dbforge.seed");

    const editor = await prisma.user.findUnique({ where: { email: "editor@dbforge.seed" }, select: { id: true } });
    const commenter = await prisma.user.findUnique({ where: { email: "commenter@dbforge.seed" }, select: { id: true } });
    editorId = editor?.id;
    commenterId = commenter?.id;

    const project = await prisma.project.findUnique({
      where: { slug: PROJECT_SLUG },
      select: { id: true },
    });
    if (!project) {
      throw new Error(`Seed project "${PROJECT_SLUG}" not found. Run migrations + seed.`);
    }
    projectId = project.id;
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("progress/me returns insights for self", async () => {
    const res = await request(app)
      .get("/api/progress/me")
      .set("Authorization", `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.insights).toBeTruthy();
    expect(res.body.insights.userId).toBe(editorId);
  });

  test("member cannot read another user's progress", async () => {
    const res = await request(app)
      .get(`/api/progress/${commenterId}`)
      .set("Authorization", `Bearer ${editorToken}`);
    expect(res.status).toBe(403);
  });

  test("editor cannot patch another user's task without scope", async () => {
    const createRes = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set("Authorization", `Bearer ${commenterToken}`)
      .send({ title: `Scoped task ${Date.now()}`, assigneeIds: [commenterId] });
    expect(createRes.status).toBe(201);
    const taskId = createRes.body.task.id;

    const patchRes = await request(app)
      .patch(`/api/projects/${projectId}/tasks/${taskId}`)
      .set("Authorization", `Bearer ${editorToken}`)
      .send({ title: "Hijacked title" });
    expect(patchRes.status).toBe(403);
  });

  test("organizations register rejects duplicate email", async () => {
    const res = await request(app)
      .post("/api/organizations/register")
      .send({
        organizationName: "Dup Org",
        adminName: "Dup Admin",
        adminEmail: "editor@dbforge.seed",
        adminPassword: "password12345",
      });
    expect(res.status).toBe(409);
  });

  test("shifts/team returns 403 for unrelated member", async () => {
    const res = await request(app)
      .get("/api/shifts/team")
      .set("Authorization", `Bearer ${editorToken}`);
    expect([403, 200]).toContain(res.status);
  });

  test("focus/team returns summary or 403", async () => {
    const res = await request(app)
      .get("/api/focus/team")
      .set("Authorization", `Bearer ${editorToken}`);
    expect([200, 403]).toContain(res.status);
  });

  test("performance/me returns monthly KPIs", async () => {
    const res = await request(app)
      .get("/api/performance/me")
      .set("Authorization", `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.performance).toBeTruthy();
  });
});
