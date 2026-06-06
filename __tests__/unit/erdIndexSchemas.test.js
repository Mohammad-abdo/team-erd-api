import { describe, test, expect } from "@jest/globals";
import { createIndexSchema, createCheckConstraintSchema } from "../../src/modules/erd/erd.schemas.js";

describe("erd index schemas", () => {
  test("createIndexSchema requires columnNames", () => {
    expect(createIndexSchema.safeParse({ columnNames: ["email"] }).success).toBe(true);
    expect(createIndexSchema.safeParse({ columnNames: [] }).success).toBe(false);
  });

  test("createCheckConstraintSchema requires expression", () => {
    expect(createCheckConstraintSchema.safeParse({ expression: "age >= 18" }).success).toBe(true);
    expect(createCheckConstraintSchema.safeParse({ expression: "" }).success).toBe(false);
  });
});
