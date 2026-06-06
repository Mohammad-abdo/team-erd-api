function normName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function relationKey(r) {
  return [
    normName(r.fromTable),
    normName(r.toTable),
    normName(r.fromColumn),
    normName(r.toColumn),
    r.relationType ?? "",
  ].join("|");
}

function indexKey(idx) {
  const cols = Array.isArray(idx.columnNames) ? [...idx.columnNames].map(normName).sort() : [];
  return `${idx.isUnique ? "U" : "I"}:${cols.join(",")}`;
}

function checkKey(chk) {
  return normName(chk.name) || normName(chk.expression);
}

function fieldChanges(before, after, fields) {
  const changes = [];
  for (const field of fields) {
    const b = before?.[field] ?? null;
    const a = after?.[field] ?? null;
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes.push({ field, before: b, after: a });
    }
  }
  return changes;
}

function diffNamedItems(beforeList, afterList, keyFn, compareFields) {
  const beforeMap = new Map((beforeList ?? []).map((item) => [keyFn(item), item]));
  const afterMap = new Map((afterList ?? []).map((item) => [keyFn(item), item]));

  const added = [];
  const removed = [];
  const modified = [];

  for (const [key, after] of afterMap) {
    const before = beforeMap.get(key);
    if (!before) {
      added.push(after);
      continue;
    }
    const changes = fieldChanges(before, after, compareFields);
    if (changes.length) {
      modified.push({ key, before, after, changes });
    }
  }

  for (const [key, before] of beforeMap) {
    if (!afterMap.has(key)) {
      removed.push(before);
    }
  }

  return { added, removed, modified };
}

/**
 * Compare two normalized ERD snapshot payloads (tables + relations).
 */
export function diffErdSchemas(baseSchema, targetSchema) {
  const baseTables = baseSchema?.tables ?? [];
  const targetTables = targetSchema?.tables ?? [];
  const baseRelations = baseSchema?.relations ?? [];
  const targetRelations = targetSchema?.relations ?? [];

  const baseTableMap = new Map(baseTables.map((t) => [normName(t.name), t]));
  const targetTableMap = new Map(targetTables.map((t) => [normName(t.name), t]));

  const tablesAdded = [];
  const tablesRemoved = [];
  const tablesModified = [];

  for (const [name, targetTable] of targetTableMap) {
    const baseTable = baseTableMap.get(name);
    if (!baseTable) {
      tablesAdded.push({ name: targetTable.name });
      continue;
    }

    const metaChanges = fieldChanges(baseTable, targetTable, [
      "label",
      "color",
      "description",
      "groupName",
    ]);

    const columns = diffNamedItems(baseTable.columns, targetTable.columns, (c) => normName(c.name), [
      "dataType",
      "isPk",
      "isFk",
      "isNullable",
      "isUnique",
      "defaultValue",
      "description",
    ]);

    const indexes = diffNamedItems(baseTable.indexes, targetTable.indexes, indexKey, [
      "name",
      "columnNames",
      "isUnique",
    ]);

    const checkConstraints = diffNamedItems(
      baseTable.checkConstraints,
      targetTable.checkConstraints,
      checkKey,
      ["name", "expression"],
    );

    const hasColumnChanges =
      columns.added.length || columns.removed.length || columns.modified.length;
    const hasIndexChanges =
      indexes.added.length || indexes.removed.length || indexes.modified.length;
    const hasCheckChanges =
      checkConstraints.added.length ||
      checkConstraints.removed.length ||
      checkConstraints.modified.length;

    if (metaChanges.length || hasColumnChanges || hasIndexChanges || hasCheckChanges) {
      tablesModified.push({
        name: targetTable.name,
        metaChanges,
        columns,
        indexes,
        checkConstraints,
      });
    }
  }

  for (const [name, baseTable] of baseTableMap) {
    if (!targetTableMap.has(name)) {
      tablesRemoved.push({ name: baseTable.name });
    }
  }

  const relations = diffNamedItems(baseRelations, targetRelations, relationKey, [
    "relationType",
    "label",
    "fromColumn",
    "toColumn",
  ]);

  const summary = {
    tablesAdded: tablesAdded.length,
    tablesRemoved: tablesRemoved.length,
    tablesModified: tablesModified.length,
    relationsAdded: relations.added.length,
    relationsRemoved: relations.removed.length,
    relationsModified: relations.modified.length,
    hasChanges:
      tablesAdded.length +
        tablesRemoved.length +
        tablesModified.length +
        relations.added.length +
        relations.removed.length +
        relations.modified.length >
      0,
  };

  return {
    summary,
    tables: {
      added: tablesAdded,
      removed: tablesRemoved,
      modified: tablesModified,
    },
    relations,
  };
}
