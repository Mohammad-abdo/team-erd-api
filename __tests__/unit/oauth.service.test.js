import { describe, test, expect } from "@jest/globals";
import { listOAuthProviders } from "../../src/modules/auth/oauth.service.js";

describe("listOAuthProviders", () => {
  test("returns provider flags", () => {
    const providers = listOAuthProviders();
    expect(providers).toMatchObject({
      google: expect.any(Boolean),
      github: expect.any(Boolean),
      microsoft: expect.any(Boolean),
    });
  });
});
