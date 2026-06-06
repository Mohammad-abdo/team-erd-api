import { describe, test, expect } from "@jest/globals";
import {
  mergeNotificationPrefs,
  patchNotificationPrefs,
  shouldNotify,
} from "../../src/lib/notificationPrefs.js";

describe("notificationPrefs", () => {
  test("mergeNotificationPrefs applies defaults when null", () => {
    const prefs = mergeNotificationPrefs(null);
    expect(prefs.schemaChange).toBe(true);
    expect(prefs.commentMention).toBe(true);
  });

  test("patchNotificationPrefs merges partial updates", () => {
    const next = patchNotificationPrefs({ schemaChange: false }, { commentMention: false });
    expect(next.schemaChange).toBe(false);
    expect(next.commentMention).toBe(false);
    expect(next.taskAssigned).toBe(true);
  });

  test("shouldNotify respects stored preference", () => {
    expect(shouldNotify({ commentMention: false }, "comment_mention")).toBe(false);
    expect(shouldNotify({ commentMention: true }, "comment_mention")).toBe(true);
    expect(shouldNotify(null, "unknown_type")).toBe(true);
  });
});
