import { describe, test, expect } from "@jest/globals";
import { roleAllowsAction } from "../../src/lib/projectPermissions.js";

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
});
