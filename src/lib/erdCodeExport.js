function toPascalCase(name) {
  return String(name)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

function toCamelCase(name) {
  const pascal = toPascalCase(name);
  return pascal ? pascal.charAt(0).toLowerCase() + pascal.slice(1) : "field";
}

function mapSqlToPrismaType(dataType) {
  const dt = String(dataType ?? "varchar").toLowerCase();
  if (/\bbigint\b/.test(dt)) return { type: "BigInt", db: null };
  if (/\b(int|integer|smallint|tinyint|mediumint)\b/.test(dt)) return { type: "Int", db: null };
  if (/\b(bool|boolean)\b/.test(dt)) return { type: "Boolean", db: null };
  if (/\b(datetime|timestamp)\b/.test(dt)) return { type: "DateTime", db: null };
  if (/\bdate\b/.test(dt)) return { type: "DateTime", db: "@db.Date" };
  if (/\b(decimal|numeric)\b/.test(dt)) return { type: "Decimal", db: null };
  if (/\b(float|double|real)\b/.test(dt)) return { type: "Float", db: null };
  if (/\bjson\b/.test(dt)) return { type: "Json", db: null };
  if (/\btext\b/.test(dt)) return { type: "String", db: "@db.Text" };
  if (/\buuid\b/.test(dt)) return { type: "String", db: "@db.Uuid" };
  if (/\bchar\b/.test(dt)) return { type: "String", db: "@db.Char" };
  return { type: "String", db: null };
}

function mapSqlToTypeOrmType(dataType) {
  const dt = String(dataType ?? "varchar").toLowerCase();
  if (/\bbigint\b/.test(dt)) return "bigint";
  if (/\b(int|integer|smallint|tinyint|mediumint)\b/.test(dt)) return "int";
  if (/\b(bool|boolean)\b/.test(dt)) return "boolean";
  if (/\b(datetime|timestamp)\b/.test(dt)) return "timestamp";
  if (/\bdate\b/.test(dt)) return "date";
  if (/\b(decimal|numeric)\b/.test(dt)) return "decimal";
  if (/\b(float|double|real)\b/.test(dt)) return "float";
  if (/\bjson\b/.test(dt)) return "json";
  if (/\btext\b/.test(dt)) return "text";
  return "varchar";
}

function prismaFieldLine(col) {
  const { type, db } = mapSqlToPrismaType(col.dataType);
  const typeStr = col.isNullable && !col.isPk ? `${type}?` : type;
  const attrs = [];
  if (col.isPk) attrs.push("@id");
  if (col.isUnique && !col.isPk) attrs.push("@unique");
  if (col.defaultValue != null && col.defaultValue !== "") {
    attrs.push(`@default(${col.defaultValue})`);
  }
  const suffix = [attrs.join(" "), db].filter(Boolean).join(" ");
  return `  ${col.name} ${typeStr}${suffix ? ` ${suffix}` : ""}`;
}

function buildRelationMaps(relations, tablesById) {
  const prismaRelationLines = new Map();
  const typeOrmImports = new Set(["Entity", "Column", "PrimaryGeneratedColumn", "PrimaryColumn"]);

  for (const rel of relations) {
    const from = tablesById.get(rel.fromTableId);
    const to = tablesById.get(rel.toTableId);
    if (!from || !to) continue;

    const fromModel = toPascalCase(from.name);
    const toModel = toPascalCase(to.name);
    const fromField = toCamelCase(`${to.name}_rel`);
    const toField = toCamelCase(`${from.name}_rel`);

    if (rel.relationType === "MANY_TO_MANY") {
      if (!prismaRelationLines.has(fromModel)) prismaRelationLines.set(fromModel, []);
      if (!prismaRelationLines.has(toModel)) prismaRelationLines.set(toModel, []);
      prismaRelationLines.get(fromModel).push(`  ${toModel.toLowerCase()}s ${toModel}[]`);
      prismaRelationLines.get(toModel).push(`  ${fromModel.toLowerCase()}s ${fromModel}[]`);
      typeOrmImports.add("ManyToMany");
    } else if (rel.relationType === "ONE_TO_MANY") {
      const fkCol =
        (rel.toColumnId && to.columns?.find((c) => c.id === rel.toColumnId))
        || (rel.fromColumnId && to.columns?.find((c) => c.id === rel.fromColumnId))
        || to.columns?.find((c) => c.isFk);
      const fkField = fkCol?.name ?? `${from.name}_id`;
      if (!prismaRelationLines.has(fromModel)) prismaRelationLines.set(fromModel, []);
      if (!prismaRelationLines.has(toModel)) prismaRelationLines.set(toModel, []);
      prismaRelationLines.get(toModel).push(`  ${fromField} ${fromModel} @relation(fields: [${fkField}], references: [id])`);
      prismaRelationLines.get(fromModel).push(`  ${toField} ${toModel}[]`);
      typeOrmImports.add("ManyToOne");
      typeOrmImports.add("OneToMany");
    } else {
      // ONE_TO_ONE — child holds FK on to side by convention
      const fkField = rel.toColumnId
        ? to.columns?.find((c) => c.id === rel.toColumnId)?.name
        : `${from.name}_id`;
      if (!prismaRelationLines.has(fromModel)) prismaRelationLines.set(fromModel, []);
      if (!prismaRelationLines.has(toModel)) prismaRelationLines.set(toModel, []);
      prismaRelationLines.get(toModel).push(`  ${fromField} ${fromModel}? @relation(fields: [${fkField ?? "id"}], references: [id])`);
      prismaRelationLines.get(fromModel).push(`  ${toField} ${toModel}?`);
      typeOrmImports.add("OneToOne");
    }
  }

  return { prismaRelationLines, typeOrmImports };
}

export function generatePrismaSchema(tables, relations = []) {
  if (!tables.length) {
    return "// No tables in this project yet.\n// Add tables on the whiteboard, then export again.\n";
  }

  const tablesById = new Map(tables.map((t) => [t.id, t]));
  const { prismaRelationLines } = buildRelationMaps(relations, tablesById);

  const lines = [
    "// Generated by DBForge — review and adjust types before migrate.",
    "generator client {",
    "  provider = \"prisma-client-js\"",
    "}",
    "",
    "datasource db {",
    "  provider = \"postgresql\"",
    "  url      = env(\"DATABASE_URL\")",
    "}",
    "",
  ];

  for (const table of tables) {
    const model = toPascalCase(table.name);
    lines.push(`model ${model} {`);
    for (const col of table.columns ?? []) {
      lines.push(prismaFieldLine(col));
    }
    for (const extra of prismaRelationLines.get(model) ?? []) {
      lines.push(extra);
    }
    lines.push(`  @@map("${table.name}")`);
    lines.push("}");
    lines.push("");
  }

  return lines.join("\n");
}

function typeOrmColumnDecorator(col) {
  const ormType = mapSqlToTypeOrmType(col.dataType);
  const opts = [`type: '${ormType}'`];
  if (!col.isNullable) opts.push("nullable: false");
  if (col.isUnique) opts.push("unique: true");
  if (col.defaultValue != null && col.defaultValue !== "") {
    opts.push(`default: ${JSON.stringify(col.defaultValue)}`);
  }
  return `@Column({ ${opts.join(", ")} })`;
}

export function generateTypeOrmEntities(tables, relations = []) {
  if (!tables.length) {
    return "// No tables in this project yet.\n// Add tables on the whiteboard, then export again.\n";
  }

  const tablesById = new Map(tables.map((t) => [t.id, t]));
  const { typeOrmImports } = buildRelationMaps(relations, tablesById);

  const importList = [...typeOrmImports].sort().join(", ");
  const blocks = [
    "// Generated by DBForge — review column types and relations before use.",
    `import { ${importList} } from 'typeorm';`,
    "",
  ];

  for (const table of tables) {
    const className = toPascalCase(table.name);
    blocks.push(`@Entity('${table.name}')`);
    blocks.push(`export class ${className} {`);
    for (const col of table.columns ?? []) {
      const tsType = mapSqlToPrismaType(col.dataType).type === "Int" ? "number"
        : mapSqlToPrismaType(col.dataType).type === "Boolean" ? "boolean"
          : mapSqlToPrismaType(col.dataType).type === "DateTime" ? "Date"
            : "string";
      if (col.isPk) {
        blocks.push("  @PrimaryGeneratedColumn()");
      } else {
        blocks.push(`  ${typeOrmColumnDecorator(col)}`);
      }
      blocks.push(`  ${col.name}: ${tsType};`);
      blocks.push("");
    }
    blocks.push("}");
    blocks.push("");
  }

  return blocks.join("\n");
}
