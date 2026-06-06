import { describe, test, expect } from "@jest/globals";
import {
  normalizeClientAccessInput,
  sanitizeReportForClient,
  serializeClientAccess,
} from "../../src/lib/clientPortal.js";

describe("clientPortal", () => {
  test("normalizeClientAccessInput applies defaults", () => {
    expect(normalizeClientAccessInput({ report: false })).toMatchObject({
      viewReport: false,
      viewErd: true,
      viewTasks: true,
    });
  });

  test("serializeClientAccess maps API shape", () => {
    expect(
      serializeClientAccess({
        viewOverview: true,
        viewErd: true,
        viewApi: false,
        viewReport: true,
        viewTasks: true,
        viewComments: false,
        viewActivity: false,
        viewHealth: false,
      }),
    ).toEqual({
      overview: true,
      erd: true,
      api: false,
      report: true,
      tasks: true,
      comments: false,
      activity: false,
      health: false,
    });
  });

  test("sanitizeReportForClient removes team roster and activity", () => {
    const sanitized = sanitizeReportForClient({
      project: {
        id: "p1",
        name: "Demo",
        slug: "demo",
        description: "x",
        visibility: "PRIVATE",
        createdAt: "2026-01-01",
        leader: { id: "u1", name: "Lead", email: "lead@test.com" },
      },
      statistics: { tables: 2, members: 3 },
      team: { members: [{ user: { email: "a@test.com" } }] },
      recentActivity: [{ id: "a1" }],
    });

    expect(sanitized.team).toEqual({ memberCount: 3 });
    expect(sanitized.recentActivity).toEqual([]);
    expect(sanitized.project.leader.email).toBeUndefined();
    expect(sanitized.statistics.members).toBeUndefined();
  });
});
