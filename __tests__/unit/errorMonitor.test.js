import { describe, expect, it, jest } from "@jest/globals";
import { captureServerError } from "../../src/lib/errorMonitor.js";

describe("captureServerError", () => {
  it("logs structured JSON without throwing", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    captureServerError(new Error("test failure"), { path: "GET /api/test" });
    expect(spy).toHaveBeenCalled();
    const payload = JSON.parse(spy.mock.calls[0][0]);
    expect(payload.message).toBe("test failure");
    expect(payload.path).toBe("GET /api/test");
    spy.mockRestore();
  });
});
