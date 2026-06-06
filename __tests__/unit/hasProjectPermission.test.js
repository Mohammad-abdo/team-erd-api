import { describe, test, expect, jest, beforeEach } from "@jest/globals";

const mockFindUnique = jest.fn();

jest.unstable_mockModule("../../src/lib/prisma.js", () => ({
  prisma: {
    projectPermission: {
      findUnique: mockFindUnique,
    },
  },
}));

const { hasProjectPermission } = await import("../../src/lib/projectPermissions.js");

describe("hasProjectPermission", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
  });

  test("leader always allowed", async () => {
    const allowed = await hasProjectPermission("u1", "p1", "LEADER", "ERD", "DELETE");
    expect(allowed).toBe(true);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  test("viewer denied ERD edit by role defaults", async () => {
    mockFindUnique.mockResolvedValue(null);
    const allowed = await hasProjectPermission("u1", "p1", "VIEWER", "ERD", "EDIT");
    expect(allowed).toBe(false);
  });

  test("viewer allowed ERD edit when explicit grant exists", async () => {
    mockFindUnique.mockResolvedValue({ id: "grant-1" });
    const allowed = await hasProjectPermission("u1", "p1", "VIEWER", "ERD", "EDIT");
    expect(allowed).toBe(true);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        projectId_userId_resource_action: {
          projectId: "p1",
          userId: "u1",
          resource: "ERD",
          action: "EDIT",
        },
      },
    });
  });

  test("commenter allowed to create comments by role defaults", async () => {
    mockFindUnique.mockResolvedValue(null);
    const allowed = await hasProjectPermission("u1", "p1", "COMMENTER", "COMMENTS", "CREATE");
    expect(allowed).toBe(true);
  });
});
