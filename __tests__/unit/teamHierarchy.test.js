import { describe, test, expect } from "@jest/globals";
import { TeamRole } from "@prisma/client";
import { isManagerRole } from "../../src/lib/teamHierarchy.js";

describe("teamHierarchy", () => {
  test("isManagerRole includes PROJECT_MANAGER and TEAM_LEAD", () => {
    expect(isManagerRole(TeamRole.PROJECT_MANAGER)).toBe(true);
    expect(isManagerRole(TeamRole.TEAM_LEAD)).toBe(true);
    expect(isManagerRole(TeamRole.MEMBER)).toBe(false);
  });
});
