import { describe, expect, it } from "@jest/globals";
import { updateProjectSchema } from "../../src/modules/projects/projects.schemas.js";

describe("updateProjectSchema deployment access", () => {
  it("accepts null startDate and deadline", () => {
    const parsed = updateProjectSchema.safeParse({
      name: "Demo",
      startDate: null,
      deadline: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("normalizes deployment URLs without protocol", () => {
    const parsed = updateProjectSchema.safeParse({
      deploymentAccessJson: [{
        id: "entry-1",
        type: "ADMIN_PANEL",
        label: "Admin",
        url: "admin.example.com",
        environment: "production",
        password: "secret",
      }],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.deploymentAccessJson[0].url).toBe("https://admin.example.com");
  });

  it("accepts credentials without URL when label is present", () => {
    const parsed = updateProjectSchema.safeParse({
      deploymentAccessJson: [{
        id: "entry-2",
        type: "BACKEND_API",
        label: "API",
        username: "admin",
        password: "secret",
      }],
    });
    expect(parsed.success).toBe(true);
  });
});
