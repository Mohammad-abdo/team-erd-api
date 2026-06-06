import { describe, test, expect } from "@jest/globals";
import { isManagedAvatarUrl } from "../../src/lib/avatarUpload.js";

describe("avatarUpload helpers", () => {
  test("isManagedAvatarUrl detects uploaded avatars", () => {
    expect(isManagedAvatarUrl(
      "https://back.erd.nodeteam.site/team-mg/api/users/avatars/u1/photo.jpg",
      "u1",
    )).toBe(true);
    expect(isManagedAvatarUrl("https://google.com/picture.jpg", "u1")).toBe(false);
  });
});
