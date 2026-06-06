import { describe, test, expect } from "@jest/globals";
import { parseApiBasePath, withApiBasePath } from "../../src/lib/apiPaths.js";

describe("apiPaths", () => {
  test("parseApiBasePath from API_BASE_PATH", () => {
    expect(parseApiBasePath({ API_BASE_PATH: "/team-mg" })).toBe("/team-mg");
    expect(parseApiBasePath({ API_BASE_PATH: "team-mg/" })).toBe("/team-mg");
  });

  test("parseApiBasePath from API_PUBLIC_URL", () => {
    expect(parseApiBasePath({
      API_PUBLIC_URL: "https://back.erd.nodeteam.site/team-mg/api",
    })).toBe("/team-mg");
  });

  test("parseApiBasePath empty when unset", () => {
    expect(parseApiBasePath({})).toBe("");
  });

  test("withApiBasePath prefixes routes", () => {
    expect(withApiBasePath("/team-mg", "/api/health")).toBe("/team-mg/api/health");
    expect(withApiBasePath("", "/api/health")).toBe("/api/health");
  });
});
