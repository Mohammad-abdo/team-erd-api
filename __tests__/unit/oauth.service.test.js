import { describe, test, expect } from "@jest/globals";
import { listOAuthProviders } from "../../src/modules/auth/oauth.service.js";

describe("listOAuthProviders", () => {
  test("returns google flag", () => {
    const providers = listOAuthProviders();
    expect(providers).toHaveProperty("google");
    expect(typeof providers.google).toBe("boolean");
  });
});
