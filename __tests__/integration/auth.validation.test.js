import { describe, test, expect } from "@jest/globals";
import { registerSchema, loginSchema, resetPasswordSchema } from "../../src/modules/auth/auth.schemas.js";

describe("Auth validation schemas", () => {
  test("register rejects short password", () => {
    const result = registerSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  test("register accepts valid payload", () => {
    const result = registerSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  test("login rejects invalid email", () => {
    const result = loginSchema.safeParse({ email: "not-email", password: "x" });
    expect(result.success).toBe(false);
  });

  test("reset password requires token length", () => {
    const result = resetPasswordSchema.safeParse({ token: "short", password: "password123" });
    expect(result.success).toBe(false);
  });
});
