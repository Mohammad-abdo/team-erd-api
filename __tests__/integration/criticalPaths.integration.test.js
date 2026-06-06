import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";

const runIntegration = process.env.INTEGRATION_TESTS === "1";
const describeIntegration = runIntegration ? describe : describe.skip;

const SEED_PASSWORD = "adminabdo123";
const ADMIN_EMAIL = "admin@team.com";
const SEED_PROJECT_SLUG = "e-commerce-platform";

async function login(email) {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password: SEED_PASSWORD });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken;
}

describeIntegration("Critical paths (integration)", () => {
  let adminToken;
  let tempProjectId;
  const tempProjectName = `CI Critical ${Date.now()}`;

  beforeAll(async () => {
    adminToken = await login(ADMIN_EMAIL);
  }, 30000);

  afterAll(async () => {
    if (tempProjectId) {
      await prisma.project.delete({ where: { id: tempProjectId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("auth login returns access token", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: ADMIN_EMAIL, password: SEED_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user?.email).toBe(ADMIN_EMAIL);
  });

  test("create project → empty health shell → prisma export placeholder", async () => {
    const createRes = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: tempProjectName, description: "CI critical path" });

    expect(createRes.status).toBe(201);
    tempProjectId = createRes.body.project?.id;
    expect(tempProjectId).toBeTruthy();

    const healthRes = await request(app)
      .get(`/api/projects/${tempProjectId}/health`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(healthRes.status).toBe(200);
    expect(healthRes.body.isEmptyShell).toBe(true);
    expect(healthRes.body.overall).toBe(0);
    expect(healthRes.body.statistics?.tables).toBe(0);

    const prismaRes = await request(app)
      .get(`/api/projects/${tempProjectId}/export/prisma`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(prismaRes.status).toBe(200);
    expect(prismaRes.text).toContain("No tables");
  });

  test("add ERD table → health scores activate → prisma export has model", async () => {
    expect(tempProjectId).toBeTruthy();

    const tableRes = await request(app)
      .post(`/api/projects/${tempProjectId}/erd/tables`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "ci_orders", x: 100, y: 100 });

    expect(tableRes.status).toBe(201);
    expect(tableRes.body.table?.name).toBe("ci_orders");

    const healthRes = await request(app)
      .get(`/api/projects/${tempProjectId}/health`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(healthRes.status).toBe(200);
    expect(healthRes.body.isEmptyShell).toBe(false);
    expect(healthRes.body.overall).toBeGreaterThan(0);
    const erd = healthRes.body.categories?.find((c) => c.key === "erd");
    expect(erd?.score).toBeGreaterThan(0);

    const prismaRes = await request(app)
      .get(`/api/projects/${tempProjectId}/export/prisma`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(prismaRes.status).toBe(200);
    expect(prismaRes.text).toContain("model CiOrders");
    expect(prismaRes.text).toContain('@@map("ci_orders")');
  });

  test("invite member → list pending → revoke invitation", async () => {
    expect(tempProjectId).toBeTruthy();
    const inviteEmail = `ci-invite-${Date.now()}@dbforge.test`;

    const inviteRes = await request(app)
      .post(`/api/projects/${tempProjectId}/members/invite`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: inviteEmail, role: "EDITOR" });

    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.invitation?.email).toBe(inviteEmail);
    expect(inviteRes.body.invitation?.inviteUrl).toContain("/invite?token=");

    const listRes = await request(app)
      .get(`/api/projects/${tempProjectId}/members/invitations`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    const pending = listRes.body.invitations?.find((i) => i.email === inviteEmail);
    expect(pending).toBeTruthy();

    const revokeRes = await request(app)
      .delete(`/api/projects/${tempProjectId}/members/invitations/${pending.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(revokeRes.status).toBe(204);
  });

  test("seed project exports TypeORM entities from live schema", async () => {
    const project = await prisma.project.findUnique({
      where: { slug: SEED_PROJECT_SLUG },
      select: { id: true },
    });
    expect(project).toBeTruthy();

    const typeormRes = await request(app)
      .get(`/api/projects/${project.id}/export/typeorm`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(typeormRes.status).toBe(200);
    expect(typeormRes.text).toContain("@Entity(");
    expect(typeormRes.text).toContain("from 'typeorm'");
    expect(typeormRes.text).not.toContain("No tables");
  });

  test("API route ↔ ERD table linking", async () => {
    expect(tempProjectId).toBeTruthy();

    const tables = await prisma.erdTable.findMany({
      where: { projectId: tempProjectId },
      select: { id: true },
    });
    expect(tables.length).toBeGreaterThan(0);
    const tableId = tables[0].id;

    const groupRes = await request(app)
      .post(`/api/projects/${tempProjectId}/api/groups`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "CI Orders", prefix: "/api" });

    expect(groupRes.status).toBe(201);
    const groupId = groupRes.body.group?.id;
    expect(groupId).toBeTruthy();

    const routeRes = await request(app)
      .post(`/api/projects/${tempProjectId}/api/groups/${groupId}/routes`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ method: "GET", path: "/orders", summary: "List orders" });

    expect(routeRes.status).toBe(201);
    const routeId = routeRes.body.route?.id;
    expect(routeId).toBeTruthy();

    const linkRes = await request(app)
      .put(`/api/projects/${tempProjectId}/api/routes/${routeId}/erd-links`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ erdTableIds: [tableId] });

    expect(linkRes.status).toBe(200);
    expect(linkRes.body.erdLinks).toHaveLength(1);
    expect(linkRes.body.erdLinks[0].erdTableId).toBe(tableId);

    const groupsRes = await request(app)
      .get(`/api/projects/${tempProjectId}/api/groups`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(groupsRes.status).toBe(200);
    const linkedRoute = groupsRes.body.groups
      ?.flatMap((g) => g.routes ?? [])
      ?.find((r) => r.id === routeId);
    expect(linkedRoute?.erdLinks?.[0]?.erdTable?.name).toBe("ci_orders");

    const mapRes = await request(app)
      .get(`/api/projects/${tempProjectId}/api/erd-links`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(mapRes.status).toBe(200);
    const entry = mapRes.body.links?.find((l) => l.routeId === routeId && l.erdTableId === tableId);
    expect(entry?.route?.method).toBe("GET");
    expect(entry?.route?.path).toBe("/orders");
  });

  test("DB drift detects ERD tables missing in live database", async () => {
    expect(tempProjectId).toBeTruthy();

    const driftRes = await request(app)
      .post(`/api/projects/${tempProjectId}/import/drift/mysql`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        host: "127.0.0.1",
        port: 3306,
        user: "root",
        password: process.env.MYSQL_ROOT_PASSWORD ?? "",
        database: "dbforge",
      });

    expect(driftRes.status).toBe(200);
    expect(driftRes.body.summary?.hasDrift).toBe(true);
    expect(driftRes.body.summary?.erdTables).toBeGreaterThan(0);
    expect(driftRes.body.issues?.some((i) => i.type === "missing_in_db" && i.table === "ci_orders")).toBe(true);
    expect(driftRes.body.migration?.sql).toContain("CREATE TABLE");
    expect(driftRes.body.migration?.sql).toContain("ci_orders");
    expect(driftRes.body.migration?.statementCount).toBeGreaterThan(0);
  });

  test("global search finds seed project by name fragment", async () => {
    const res = await request(app)
      .get("/api/search")
      .query({ q: "commerce" })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const names = (res.body.projects ?? []).map((p) => p.name.toLowerCase());
    expect(names.some((n) => n.includes("commerce"))).toBe(true);
  });
});
