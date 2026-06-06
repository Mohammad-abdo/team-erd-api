import { describe, test, expect } from "@jest/globals";
import { formatPgColumnType } from "../../src/lib/sqlIntrospect.js";

describe("formatPgColumnType", () => {
  test("formats varchar with length", () => {
    expect(
      formatPgColumnType({
        dataType: "character varying",
        udtName: "varchar",
        characterMaximumLength: 255,
      }),
    ).toBe("varchar(255)");
  });

  test("formats numeric with precision and scale", () => {
    expect(
      formatPgColumnType({
        dataType: "numeric",
        udtName: "numeric",
        numericPrecision: 10,
        numericScale: 2,
      }),
    ).toBe("numeric(10,2)");
  });

  test("maps common udt names", () => {
    expect(formatPgColumnType({ dataType: "integer", udtName: "int4" })).toBe("integer");
    expect(formatPgColumnType({ dataType: "boolean", udtName: "bool" })).toBe("boolean");
    expect(formatPgColumnType({ dataType: "jsonb", udtName: "jsonb" })).toBe("jsonb");
  });

  test("falls back to data type", () => {
    expect(
      formatPgColumnType({
        dataType: "ARRAY",
        udtName: "_text",
      }),
    ).toBe("_text");
  });
});
