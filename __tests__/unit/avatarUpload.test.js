import { describe, test, expect } from "@jest/globals";
import { isManagedAvatarUrl, normalizeAvatarUrl } from "../../src/lib/avatarUpload.js";

describe("avatarUpload helpers", () => {
  test("isManagedAvatarUrl detects uploaded avatars", () => {
    expect(isManagedAvatarUrl(
      "https://back.erd.nodeteam.site/team-mg/api/users/avatars/u1/photo.jpg",
      "u1",
    )).toBe(true);
    expect(isManagedAvatarUrl("https://google.com/picture.jpg", "u1")).toBe(false);
  });

  test("normalizeAvatarUrl upgrades http managed avatars to https", () => {
    expect(normalizeAvatarUrl("http://back.erd.nodeteam.site/api/users/avatars/u1/a.png"))
      .toBe("https://back.erd.nodeteam.site/api/users/avatars/u1/a.png");
    expect(normalizeAvatarUrl("http://cdn.example.com/pic.jpg"))
      .toBe("http://cdn.example.com/pic.jpg");
  });
});
