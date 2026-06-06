import { describe, expect, it } from "@jest/globals";
import { generatePrismaSchema, generateTypeOrmEntities } from "../../src/lib/erdCodeExport.js";

const sampleTables = [
  {
    id: "t1",
    name: "users",
    columns: [
      { id: "c1", name: "id", dataType: "int", isPk: true, isNullable: false, isUnique: true, defaultValue: null },
      { id: "c2", name: "email", dataType: "varchar(255)", isPk: false, isNullable: false, isUnique: true, defaultValue: null },
    ],
  },
  {
    id: "t2",
    name: "posts",
    columns: [
      { id: "c3", name: "id", dataType: "int", isPk: true, isNullable: false, isUnique: true, defaultValue: null },
      { id: "c4", name: "user_id", dataType: "int", isPk: false, isNullable: false, isUnique: false, defaultValue: null, isFk: true },
      { id: "c5", name: "title", dataType: "varchar(200)", isPk: false, isNullable: false, isUnique: false, defaultValue: null },
    ],
  },
];

const sampleRelations = [
  {
    fromTableId: "t1",
    toTableId: "t2",
    relationType: "ONE_TO_MANY",
    fromColumnId: "c4",
    toColumnId: null,
  },
];

describe("erdCodeExport", () => {
  it("returns placeholder when no tables", () => {
    expect(generatePrismaSchema([])).toContain("No tables");
    expect(generateTypeOrmEntities([])).toContain("No tables");
  });

  it("generates Prisma models with @@map", () => {
    const out = generatePrismaSchema(sampleTables, sampleRelations);
    expect(out).toContain("model Users {");
    expect(out).toContain("@@map(\"users\")");
    expect(out).toContain("email String @unique");
    expect(out).toContain("datasource db");
  });

  it("generates TypeORM entities", () => {
    const out = generateTypeOrmEntities(sampleTables, sampleRelations);
    expect(out).toContain("@Entity('users')");
    expect(out).toContain("export class Users {");
    expect(out).toContain("@PrimaryGeneratedColumn()");
    expect(out).toContain("from 'typeorm'");
  });
});
