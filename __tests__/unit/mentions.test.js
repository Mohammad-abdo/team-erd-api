import { describe, test, expect } from "@jest/globals";
import {
  buildMentionToken,
  extractMentionUserIds,
  filterMentionsToMembers,
} from "../../src/lib/mentions.js";

describe("mentions", () => {
  test("buildMentionToken encodes user id", () => {
    expect(buildMentionToken({ id: "u1", name: "Ada Lovelace" })).toBe(
      "@[Ada Lovelace](mention:u1)",
    );
  });

  test("extractMentionUserIds parses tokens", () => {
    const body = "Hi @[Ada](mention:u1) and @[Bob](mention:u2) — review this";
    expect(extractMentionUserIds(body)).toEqual(["u1", "u2"]);
  });

  test("filterMentionsToMembers keeps project members only", () => {
    const body = "@[Ada](mention:u1) @[Eve](mention:u9)";
    expect(filterMentionsToMembers(body, new Set(["u1", "u2"]))).toEqual(["u1"]);
  });
});
