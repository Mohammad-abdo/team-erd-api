import { describe, test, expect } from "@jest/globals";
import { PlatformRole } from "@prisma/client";
import { orgWhereClause, userIsOrgAdmin, isSuperAdmin } from "../../src/lib/orgScope.js";

describe("orgScope", () => {
  test("orgWhereClause scopes org admin to organization", () => {
    const clause = orgWhereClause({
      platformRole: PlatformRole.ORG_ADMIN,
      organizationId: "org_acme",
    });
    expect(clause).toEqual({ organizationId: "org_acme" });
  });

  test("orgWhereClause returns empty filter for super admin", () => {
    expect(orgWhereClause({ platformRole: PlatformRole.SUPER_ADMIN, organizationId: "org_x" })).toEqual({});
  });

  test("userIsOrgAdmin includes ORG_ADMIN and SUPER_ADMIN", () => {
    expect(userIsOrgAdmin({ platformRole: PlatformRole.ORG_ADMIN })).toBe(true);
    expect(userIsOrgAdmin({ platformRole: PlatformRole.SUPER_ADMIN })).toBe(true);
    expect(userIsOrgAdmin({ platformRole: PlatformRole.MEMBER })).toBe(false);
  });

  test("isSuperAdmin detects super admin only", () => {
    expect(isSuperAdmin({ platformRole: PlatformRole.SUPER_ADMIN })).toBe(true);
    expect(isSuperAdmin({ platformRole: PlatformRole.ORG_ADMIN })).toBe(false);
  });
});
