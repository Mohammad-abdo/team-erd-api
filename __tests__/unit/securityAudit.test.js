import { describe, expect, it } from "@jest/globals";
import { sanitizeConnectionMeta } from "../../src/lib/securityAudit.js";

describe("sanitizeConnectionMeta", () => {
  it("strips password and keeps connection fields", () => {
    const meta = sanitizeConnectionMeta(
      {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "secret",
        database: "dbforge",
      },
      { profileId: "prof1", environment: "staging" },
    );

    expect(meta).toEqual({
      host: "localhost",
      port: 3306,
      user: "root",
      database: "dbforge",
      schema: null,
      profileId: "prof1",
      environment: "staging",
    });
    expect(meta.password).toBeUndefined();
  });
});
