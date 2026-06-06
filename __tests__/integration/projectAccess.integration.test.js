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

describeIntegration("Project access (integration)", () => {
  let projectId;
  let editorToken;
  let commenterToken;

  beforeAll(async () => {
    editorToken = await login("editor@dbforge.seed");
    commenterToken = await login("commenter@dbforge.seed");

    const project = await prisma.project.findUnique({
      where: { slug: PROJECT_SLUG },
      select: { id: true },
    });
    if (!project) {
      throw new Error(
        `Seed project "${PROJECT_SLUG}" not found. Run: npx prisma migrate deploy && npm run db:seed`,
      );
    }
    projectId = project.id;
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("authenticated user can list project tasks", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/tasks`)
      .set("Authorization", `Bearer ${editorToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tasks)).toBe(true);
  });

  test("editor can create a project task", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set("Authorization", `Bearer ${editorToken}`)
      .send({ title: `CI task ${Date.now()}` });

    expect(res.status).toBe(201);
    expect(res.body.task?.title).toBeDefined();
  });

  test("commenter cannot create a project task without TASKS CREATE", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set("Authorization", `Bearer ${commenterToken}`)
      .send({ title: "Should be denied" });

    expect(res.status).toBe(403);
  });

  test("deactivated user access token is rejected", async () => {
    const email = `deact-${Date.now()}@dbforge.test`;
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ name: "Deact Test", email, password: SEED_PASSWORD });
    expect(registerRes.status).toBe(201);
    const token = registerRes.body.accessToken;

    await prisma.user.update({
      where: { email },
      data: { isActive: false },
    });

    const meRes = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${token}`);
    expect(meRes.status).toBe(401);

    await prisma.user.delete({ where: { email } });
  });
});
