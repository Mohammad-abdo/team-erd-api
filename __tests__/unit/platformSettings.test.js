import { describe, test, expect } from "@jest/globals";
import { serializeBranding } from "../../src/modules/settings/settings.service.js";
import { updatePlatformBrandingSchema } from "../../src/modules/settings/settings.schemas.js";

describe("platformSettings", () => {
  test("serializeBranding returns empty strings when row is missing", () => {
    expect(serializeBranding(null)).toEqual({
      logoUrl: "",
      workspaceTitle: "",
      workspaceTagline: "",
      updatedAt: null,
    });
  });

  test("serializeBranding maps stored values", () => {
    const updatedAt = new Date("2026-06-06T12:00:00.000Z");
    expect(
      serializeBranding({
        logoUrl: "https://cdn.example/logo.png",
        workspaceTitle: "Acme DB",
        workspaceTagline: "Data platform",
        updatedAt,
      }),
    ).toEqual({
      logoUrl: "https://cdn.example/logo.png",
      workspaceTitle: "Acme DB",
      workspaceTagline: "Data platform",
      updatedAt,
    });
  });

  test("updatePlatformBrandingSchema accepts partial branding payload", () => {
    const parsed = updatePlatformBrandingSchema.parse({
      workspaceTitle: "DBForge",
      logoUrl: "",
    });
    expect(parsed).toEqual({ workspaceTitle: "DBForge", logoUrl: "" });
  });

  test("updatePlatformBrandingSchema rejects invalid logo URL", () => {
    expect(() => updatePlatformBrandingSchema.parse({ logoUrl: "not-a-url" })).toThrow();
  });
});
