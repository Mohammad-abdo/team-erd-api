import { describe, test, expect } from "@jest/globals";
import { getRateLimitCatalog } from "../../src/middleware/rateLimits.js";

describe("getRateLimitCatalog", () => {
  test("returns all known limiter tiers", () => {
    const catalog = getRateLimitCatalog();
    const ids = catalog.map((row) => row.id);
    expect(ids).toEqual([
      "global",
      "auth",
      "login",
      "forgot-password",
      "expensive-db",
      "ai",
      "export",
      "admin-backup",
    ]);
  });

  test("each entry has routing metadata", () => {
    for (const row of getRateLimitCatalog()) {
      expect(row.scope).toBeTruthy();
      expect(row.window).toBeTruthy();
      expect(typeof row.max).toBe("number");
      expect(row.max).toBeGreaterThan(0);
      expect(Array.isArray(row.routes)).toBe(true);
      expect(row.routes.length).toBeGreaterThan(0);
    }
  });

  test("login limiter uses a short window label", () => {
    const login = getRateLimitCatalog().find((r) => r.id === "login");
    expect(login.window).toMatch(/min/);
    expect(login.env).toContain("RATE_LIMIT_LOGIN_MAX");
  });
});
