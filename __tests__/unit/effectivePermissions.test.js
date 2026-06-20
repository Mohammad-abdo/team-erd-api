import { describe, test, expect } from "@jest/globals";
import { roleAllowsAction } from "../../src/lib/rolePermissionDefaults.js";
import { getEffectivePermissions } from "../../src/modules/permissions/permissions.service.js";

describe("getEffectivePermissions", () => {
  test("EDITOR defaults include TASKS DELETE without overrides object shape", () => {
    expect(roleAllowsAction("EDITOR", "TASKS", "DELETE")).toBe(true);
    expect(roleAllowsAction("VIEWER", "TASKS", "CREATE")).toBe(false);
  });

  test("module exports getEffectivePermissions", () => {
    expect(typeof getEffectivePermissions).toBe("function");
  });
});
