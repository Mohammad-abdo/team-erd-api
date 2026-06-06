import { describe, test, expect } from "@jest/globals";
import { roleAllowsAction } from "../../src/lib/rolePermissionDefaults.js";

describe("projectPermissions", () => {
  test("leader role allows all actions", () => {
    expect(roleAllowsAction("LEADER", "ERD", "DELETE")).toBe(true);
  });

  test("viewer can view ERD and API", () => {
    expect(roleAllowsAction("VIEWER", "ERD", "VIEW")).toBe(true);
    expect(roleAllowsAction("VIEWER", "API", "VIEW")).toBe(true);
    expect(roleAllowsAction("VIEWER", "ERD", "EDIT")).toBe(false);
  });

  test("editor can edit ERD", () => {
    expect(roleAllowsAction("EDITOR", "ERD", "EDIT")).toBe(true);
    expect(roleAllowsAction("EDITOR", "ERD", "DELETE")).toBe(true);
  });

  test("commenter can create comments", () => {
    expect(roleAllowsAction("COMMENTER", "COMMENTS", "CREATE")).toBe(true);
    expect(roleAllowsAction("COMMENTER", "ERD", "EDIT")).toBe(false);
  });

  test("viewer with API grant pattern — editor defaults cover API mutations", () => {
    expect(roleAllowsAction("EDITOR", "API", "CREATE")).toBe(true);
    expect(roleAllowsAction("EDITOR", "API", "DELETE")).toBe(true);
    expect(roleAllowsAction("VIEWER", "API", "EDIT")).toBe(false);
  });

  test("tasks permissions follow role presets", () => {
    expect(roleAllowsAction("EDITOR", "TASKS", "CREATE")).toBe(true);
    expect(roleAllowsAction("VIEWER", "TASKS", "VIEW")).toBe(true);
    expect(roleAllowsAction("VIEWER", "TASKS", "CREATE")).toBe(false);
    expect(roleAllowsAction("COMMENTER", "TASKS", "EDIT")).toBe(false);
  });
});
