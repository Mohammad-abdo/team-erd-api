import { describe, test, expect } from "@jest/globals";
import {
  applyTestSettingsPatch,
  normalizeTestSettings,
} from "../../src/lib/apiTestSettings.js";

describe("apiTestSettings", () => {
  test("normalizes legacy single baseUrl into dev environment", () => {
    const result = normalizeTestSettings({
      baseUrl: "http://localhost:8080",
      authToken: "legacy-token",
      headers: [{ key: "X-Test", value: "1" }],
    });

    expect(result.activeEnvironment).toBe("dev");
    expect(result.baseUrl).toBe("http://localhost:8080");
    expect(result.authToken).toBe("legacy-token");
    expect(result.environments).toHaveLength(3);
    expect(result.environments.find((e) => e.id === "dev").baseUrl).toBe("http://localhost:8080");
  });

  test("switching active environment updates resolved baseUrl and token", () => {
    const current = normalizeTestSettings({
      environments: [
        { id: "dev", name: "Development", baseUrl: "http://localhost:3000", authToken: "dev" },
        { id: "staging", name: "Staging", baseUrl: "https://staging.example.com", authToken: "stg" },
        { id: "production", name: "Production", baseUrl: "https://api.example.com", authToken: "prod" },
      ],
      activeEnvironment: "dev",
    });

    const next = applyTestSettingsPatch(current, { activeEnvironment: "staging" });
    expect(next.activeEnvironment).toBe("staging");
    expect(next.baseUrl).toBe("https://staging.example.com");
    expect(next.authToken).toBe("stg");
  });

  test("editing baseUrl updates active environment profile", () => {
    const current = normalizeTestSettings({});
    const next = applyTestSettingsPatch(current, { baseUrl: "http://127.0.0.1:5000" });
    const dev = next.environments.find((e) => e.id === "dev");
    expect(dev.baseUrl).toBe("http://127.0.0.1:5000");
    expect(next.baseUrl).toBe("http://127.0.0.1:5000");
  });
});
