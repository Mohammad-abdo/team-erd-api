import { describe, expect, it } from "@jest/globals";
import {
  DB_PROFILE_ENVIRONMENTS,
  environmentSortKey,
  normalizeDbProfileEnvironment,
} from "../../src/lib/dbProfileEnvironments.js";

describe("dbProfileEnvironments", () => {
  it("normalizes known environments", () => {
    expect(normalizeDbProfileEnvironment("staging")).toBe("staging");
    expect(normalizeDbProfileEnvironment("PRODUCTION")).toBe("production");
  });

  it("falls back to custom for unknown values", () => {
    expect(normalizeDbProfileEnvironment("qa")).toBe("custom");
    expect(normalizeDbProfileEnvironment("")).toBe("development");
  });

  it("sorts environments in roadmap order", () => {
    expect(environmentSortKey("development")).toBeLessThan(environmentSortKey("staging"));
    expect(environmentSortKey("staging")).toBeLessThan(environmentSortKey("production"));
    expect(DB_PROFILE_ENVIRONMENTS).toContain("custom");
  });
});
