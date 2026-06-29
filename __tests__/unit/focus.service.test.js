import { describe, expect, it, jest, beforeEach } from "@jest/globals";

const mockPrisma = {
  todayFocusItem: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  projectTask: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

jest.unstable_mockModule("../../src/lib/prisma.js", () => ({
  prisma: mockPrisma,
}));

const { deleteFocusItem } = await import("../../src/modules/focus/focus.service.js");

describe("deleteFocusItem", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("marks item done and dismissed instead of deleting", async () => {
    mockPrisma.todayFocusItem.findFirst.mockResolvedValue({
      id: "f1",
      userId: "u1",
      taskId: null,
      dismissedAt: null,
    });
    mockPrisma.todayFocusItem.update.mockResolvedValue({});

    await deleteFocusItem("u1", "f1");

    expect(mockPrisma.todayFocusItem.update).toHaveBeenCalledWith({
      where: { id: "f1" },
      data: expect.objectContaining({
        isDone: true,
        dismissedAt: expect.any(Date),
      }),
    });
    expect(mockPrisma.projectTask.update).not.toHaveBeenCalled();
  });

  it("syncs linked task when requested", async () => {
    mockPrisma.todayFocusItem.findFirst.mockResolvedValue({
      id: "f1",
      userId: "u1",
      taskId: "t1",
      dismissedAt: null,
    });
    mockPrisma.todayFocusItem.update.mockResolvedValue({});
    mockPrisma.projectTask.findUnique.mockResolvedValue({
      id: "t1",
      assignees: [{ userId: "u1" }],
      project: { leaderId: "other" },
    });
    mockPrisma.projectTask.update.mockResolvedValue({});

    await deleteFocusItem("u1", "f1", { syncTask: true });

    expect(mockPrisma.projectTask.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: expect.objectContaining({ status: "DONE" }),
    });
  });
});
