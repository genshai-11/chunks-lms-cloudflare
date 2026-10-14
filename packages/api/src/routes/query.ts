import { Hono } from 'hono';

export const queryRouter = new Hono<{ Bindings: { DB: D1Database } }>();

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '');
}

function extractStringProp(obj: unknown, prop: string): string | null {
  if (obj && typeof obj === 'object' && prop in obj) {
    const record = obj as Record<string, unknown>;
    const val = record[prop];
    return typeof val === 'string' ? val : null;
  }
  return null;
}

function extractNumberProp(obj: unknown, prop: string): number | null {
  if (obj && typeof obj === 'object' && prop in obj) {
    const record = obj as Record<string, unknown>;
    const val = record[prop];
    return typeof val === 'number' ? val : null;
  }
  return null;
}
const tableColsCache = new Map<string, Set<string>>();

async function getValidTableColumns(db: D1Database, tableName: string): Promise<Set<string>> {
  const cached = tableColsCache.get(tableName);
  if (cached) return cached;
  try {
    const { results } = await db.prepare(`PRAGMA table_info("${tableName}")`).all();
    const cols = new Set<string>();
    for (const row of results || []) {
      const colName = extractStringProp(row, 'name');
      if (colName) cols.add(colName);
    }
    tableColsCache.set(tableName, cols);
    return cols;
  } catch {
    return new Set();
  }
}


interface RelationNode {
  relationName: string;
  subSelect: string;
  directColumns: string[];
  relations: RelationNode[];
}

function parseSelectString(selectStr: string): {
  directColumns: string[];
  relations: RelationNode[];
} {
  const trimmed = selectStr.trim();
  const directColumns: string[] = [];
  const relations: RelationNode[] = [];

  let depth = 0;
  let current = '';

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === '(') {
      depth++;
      current += char;
    } else if (char === ')') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      const part = current.trim();
      if (part) {
        const relMatch = part.match(/^([a-zA-Z0-9_]+)\s*\(([\s\S]*)\)$/);
        if (relMatch) {
          const relationName = relMatch[1];
          const subSelect = relMatch[2].trim() || '*';
          const subParsed = parseSelectString(subSelect);
          relations.push({
            relationName,
            subSelect,
            directColumns: subParsed.directColumns,
            relations: subParsed.relations,
          });
        } else {
          directColumns.push(part);
        }
      }
      current = '';
    } else {
      current += char;
    }
  }

  const lastPart = current.trim();
  if (lastPart) {
    const relMatch = lastPart.match(/^([a-zA-Z0-9_]+)\s*\(([\s\S]*)\)$/);
    if (relMatch) {
      const relationName = relMatch[1];
      const subSelect = relMatch[2].trim() || '*';
      const subParsed = parseSelectString(subSelect);
      relations.push({
        relationName,
        subSelect,
        directColumns: subParsed.directColumns,
        relations: subParsed.relations,
      });
    } else {
      directColumns.push(lastPart);
    }
  }

  return { directColumns, relations };
}

interface RelationMeta {
  parentFk?: string;
  childFk?: string;
  isSingle: boolean;
}

const RELATION_MAP: Record<string, Record<string, RelationMeta>> = {
  standalone_test_run_items: {
    test_items: { parentFk: 'test_item_id', isSingle: true },
    standalone_test_attempts: { childFk: 'run_item_id', isSingle: false },
    standalone_test_runs: { parentFk: 'run_id', isSingle: true },
  },
  standalone_test_attempts: {
    standalone_test_attempt_snapshots: { childFk: 'attempt_id', isSingle: true },
    standalone_test_events: { childFk: 'attempt_id', isSingle: false },
    standalone_test_run_items: { parentFk: 'run_item_id', isSingle: true },
  },
  standalone_test_runs: {
    standalone_test_assignments: { parentFk: 'assignment_id', isSingle: true },
    standalone_test_run_items: { childFk: 'run_id', isSingle: false },
    standalone_test_attempts: { childFk: 'run_id', isSingle: false },
    test_sections: { parentFk: 'test_section_id', isSingle: true },
  },
  standalone_test_assignments: {
    standalone_test_runs: { childFk: 'assignment_id', isSingle: false },
    test_package_versions: { parentFk: 'package_version_id', isSingle: true },
    classes: { parentFk: 'class_id', isSingle: true },
    users: { parentFk: 'learner_user_id', isSingle: true },
  },
  test_packages: {
    test_package_versions: { childFk: 'package_id', isSingle: false },
    organizations: { parentFk: 'organization_id', isSingle: true },
  },
  test_package_versions: {
    test_packages: { parentFk: 'package_id', isSingle: true },
    test_sections: { childFk: 'package_version_id', isSingle: false },
    narration_variants: { childFk: 'package_version_id', isSingle: false },
    test_items: { childFk: 'package_version_id', isSingle: false },
    section_measurement_snapshots: { childFk: 'package_version_id', isSingle: false },
  },
  test_sections: {
    test_items: { childFk: 'section_id', isSingle: false },
    test_package_versions: { parentFk: 'package_version_id', isSingle: true },
    narration_variants: { childFk: 'test_section_id', isSingle: false },
    section_measurement_snapshots: { childFk: 'test_section_id', isSingle: false },
    cci_profiles: { parentFk: 'cci_profile_id', isSingle: true },
    cci_categories: { parentFk: 'cci_category_id', isSingle: true },
  },
  test_items: {
    test_sections: { parentFk: 'section_id', isSingle: true },
    test_package_versions: { parentFk: 'package_version_id', isSingle: true },
    narration_variants: { childFk: 'test_item_id', isSingle: false },
  },
  narration_variants: {
    audio_assets: { parentFk: 'audio_asset_id', isSingle: true },
    test_package_versions: { parentFk: 'package_version_id', isSingle: true },
    test_sections: { parentFk: 'test_section_id', isSingle: true },
    test_items: { parentFk: 'test_item_id', isSingle: true },
  },
  classes: {
    courses: { parentFk: 'course_id', isSingle: true },
    enrollments: { childFk: 'class_id', isSingle: false },
    learning_sessions: { childFk: 'class_id', isSingle: false },
    scheduled_sessions: { childFk: 'class_id', isSingle: false },
  },
  courses: {
    classes: { childFk: 'course_id', isSingle: false },
    organizations: { parentFk: 'organization_id', isSingle: true },
  },
  learning_sessions: {
    classes: { parentFk: 'class_id', isSingle: true },
    session_questions: { childFk: 'learning_session_id', isSingle: false },
    attendance_records: { childFk: 'learning_session_id', isSingle: false },
  },
  session_questions: {
    learning_sessions: { parentFk: 'learning_session_id', isSingle: true },
    assessment_attempts: { childFk: 'session_question_id', isSingle: false },
  },
  assessment_attempts: {
    assessment_attempt_snapshots: { childFk: 'attempt_id', isSingle: true },
    assessment_events: { childFk: 'attempt_id', isSingle: false },
    session_questions: { parentFk: 'session_question_id', isSingle: true },
    users: { parentFk: 'learner_user_id', isSingle: true },
  },
  cci_profiles: {
    cci_categories: { childFk: 'profile_id', isSingle: false },
    organizations: { parentFk: 'organization_id', isSingle: true },
  },
  cci_categories: {
    cci_profiles: { parentFk: 'profile_id', isSingle: true },
  },
};

function resolveRelationMeta(
  parentTable: string,
  relTable: string,
  sampleRow?: Record<string, unknown>,
): RelationMeta {
  const tableMap = RELATION_MAP[parentTable];
  if (tableMap && tableMap[relTable]) {
    return tableMap[relTable];
  }
  const singularRel = relTable.replace(/s$/, '');
  const possibleParentFk = `${singularRel}_id`;
  if (sampleRow && possibleParentFk in sampleRow) {
    return { parentFk: possibleParentFk, isSingle: true };
  }
  const singularParent = parentTable.replace(/s$/, '');
  return { childFk: `${singularParent}_id`, isSingle: false };
}

function normalizeSnapshotRow(snap: Record<string, unknown>): void {
  if (!snap.status) {
    snap.status = snap.is_finalized ? 'finalized' : 'in_progress';
  }
  if (!snap.effective_color && snap.current_result_color) {
    snap.effective_color = snap.current_result_color;
  }
}

async function joinRelation(
  db: D1Database,
  parentTable: string,
  parentRows: Record<string, unknown>[],
  node: RelationNode,
): Promise<void> {
  if (parentRows.length === 0) return;
  const relTable = sanitizeId(node.relationName);
  const meta = resolveRelationMeta(parentTable, relTable, parentRows[0]);

  try {
    if (meta.parentFk) {
      const fkName = meta.parentFk;
      const fkValues = Array.from(
        new Set(
          parentRows
            .map((r) => extractStringProp(r, fkName))
            .filter((id): id is string => id !== null && id.length > 0),
        ),
      );

      if (fkValues.length === 0) {
        for (const row of parentRows) {
          row[node.relationName] = meta.isSingle ? null : [];
        }
        return;
      }

      let selectColsSql = '*';
      if (!node.directColumns.includes('*') && node.directColumns.length > 0) {
        const needed = Array.from(new Set([...node.directColumns, 'id']));
        selectColsSql = needed.map((c) => `"${sanitizeId(c)}"`).join(', ');
      }

      const placeholders = fkValues.map(() => '?').join(', ');
      const sql = `SELECT ${selectColsSql} FROM "${relTable}" WHERE "id" IN (${placeholders})`;
      const { results: childRows } = await db.prepare(sql).bind(...fkValues).all();
      const childTyped = (childRows || []) as Record<string, unknown>[];

      if (relTable === 'standalone_test_attempt_snapshots') {
        for (const cr of childTyped) {
          normalizeSnapshotRow(cr);
        }
      }

      for (const sub of node.relations) {
        await joinRelation(db, relTable, childTyped, sub);
      }

      const childMap = new Map<string, Record<string, unknown>>();
      for (const cr of childTyped) {
        const id = extractStringProp(cr, 'id');
        if (id) childMap.set(id, cr);
      }

      for (const row of parentRows) {
        const fkVal = extractStringProp(row, fkName);
        const match = fkVal ? childMap.get(fkVal) ?? null : null;
        row[node.relationName] = meta.isSingle ? match : match ? [match] : [];
      }
    } else {
      const childFk = meta.childFk || `${parentTable.replace(/s$/, '')}_id`;
      const parentIds = Array.from(
        new Set(
          parentRows
            .map((r) => extractStringProp(r, 'id'))
            .filter((id): id is string => id !== null && id.length > 0),
        ),
      );

      if (parentIds.length === 0) {
        for (const row of parentRows) {
          row[node.relationName] = meta.isSingle ? null : [];
        }
        return;
      }

      let selectColsSql = '*';
      if (!node.directColumns.includes('*') && node.directColumns.length > 0) {
        const needed = Array.from(new Set([...node.directColumns, 'id', childFk]));
        selectColsSql = needed.map((c) => `"${sanitizeId(c)}"`).join(', ');
      }

      const placeholders = parentIds.map(() => '?').join(', ');
      const sql = `SELECT ${selectColsSql} FROM "${relTable}" WHERE "${sanitizeId(childFk)}" IN (${placeholders})`;
      const { results: childRows } = await db.prepare(sql).bind(...parentIds).all();
      const childTyped = (childRows || []) as Record<string, unknown>[];

      if (relTable === 'standalone_test_attempt_snapshots') {
        for (const cr of childTyped) {
          normalizeSnapshotRow(cr);
        }
      }

      for (const sub of node.relations) {
        await joinRelation(db, relTable, childTyped, sub);
      }

      const groupMap = new Map<string, Record<string, unknown>[]>();
      for (const cr of childTyped) {
        const fkVal = extractStringProp(cr, childFk);
        if (fkVal) {
          const list = groupMap.get(fkVal) || [];
          list.push(cr);
          groupMap.set(fkVal, list);
        }
      }

      for (const row of parentRows) {
        const pId = extractStringProp(row, 'id');
        const matchedList = pId ? groupMap.get(pId) || [] : [];
        if (meta.isSingle) {
          row[node.relationName] = matchedList[0] ?? null;
        } else {
          row[node.relationName] = matchedList;
        }
      }
    }
  } catch (relErr) {
    console.error(`Relation join failed for ${node.relationName} on ${parentTable}:`, relErr);
    for (const row of parentRows) {
      if (!(node.relationName in row)) {
        row[node.relationName] = meta.isSingle ? null : [];
      }
    }
  }
}

function buildWhere(body: Record<string, unknown>): { whereClauses: string[]; params: unknown[] } {
  const whereClauses: string[] = [];
  const params: unknown[] = [];

  const eq = body.eq as Record<string, unknown> | undefined;
  if (eq && typeof eq === 'object') {
    for (const [col, val] of Object.entries(eq)) {
      const cleanCol = sanitizeId(col);
      if (val === null || val === undefined) {
        whereClauses.push(`"${cleanCol}" IS NULL`);
      } else {
        whereClauses.push(`"${cleanCol}" = ?`);
        params.push(val);
      }
    }
  }

  const inFilter = body.in as Record<string, unknown[]> | undefined;
  if (inFilter && typeof inFilter === 'object') {
    for (const [col, list] of Object.entries(inFilter)) {
      if (Array.isArray(list) && list.length > 0) {
        const cleanCol = sanitizeId(col);
        const placeholders = list.map(() => '?').join(', ');
        whereClauses.push(`"${cleanCol}" IN (${placeholders})`);
        params.push(...list);
      }
    }
  }

  const isFilter = body.is as Record<string, unknown> | undefined;
  if (isFilter && typeof isFilter === 'object') {
    for (const [col, val] of Object.entries(isFilter)) {
      const cleanCol = sanitizeId(col);
      if (val === null || val === 'null' || val === undefined) {
        whereClauses.push(`"${cleanCol}" IS NULL`);
      } else {
        whereClauses.push(`"${cleanCol}" IS NOT NULL`);
      }
    }
  }

  const neqFilter = body.neq as Record<string, unknown> | undefined;
  if (neqFilter && typeof neqFilter === 'object') {
    for (const [col, val] of Object.entries(neqFilter)) {
      const cleanCol = sanitizeId(col);
      if (val === null || val === 'null') {
        whereClauses.push(`"${cleanCol}" IS NOT NULL`);
      } else {
        whereClauses.push(`"${cleanCol}" != ?`);
        params.push(val);
      }
    }
  }

  const likeFilter = body.like as Record<string, unknown> | undefined;
  if (likeFilter && typeof likeFilter === 'object') {
    for (const [col, pattern] of Object.entries(likeFilter)) {
      const cleanCol = sanitizeId(col);
      whereClauses.push(`"${cleanCol}" LIKE ?`);
      params.push(String(pattern));
    }
  }

  const gtFilter = body.gt as Record<string, unknown> | undefined;
  if (gtFilter && typeof gtFilter === 'object') {
    for (const [col, val] of Object.entries(gtFilter)) {
      const cleanCol = sanitizeId(col);
      whereClauses.push(`"${cleanCol}" > ?`);
      params.push(val);
    }
  }

  const gteFilter = body.gte as Record<string, unknown> | undefined;
  if (gteFilter && typeof gteFilter === 'object') {
    for (const [col, val] of Object.entries(gteFilter)) {
      const cleanCol = sanitizeId(col);
      whereClauses.push(`"${cleanCol}" >= ?`);
      params.push(val);
    }
  }

  const ltFilter = body.lt as Record<string, unknown> | undefined;
  if (ltFilter && typeof ltFilter === 'object') {
    for (const [col, val] of Object.entries(ltFilter)) {
      const cleanCol = sanitizeId(col);
      whereClauses.push(`"${cleanCol}" < ?`);
      params.push(val);
    }
  }

  const lteFilter = body.lte as Record<string, unknown> | undefined;
  if (lteFilter && typeof lteFilter === 'object') {
    for (const [col, val] of Object.entries(lteFilter)) {
      const cleanCol = sanitizeId(col);
      whereClauses.push(`"${cleanCol}" <= ?`);
      params.push(val);
    }
  }

  const notFilter = body.not as Record<string, unknown> | undefined;
  if (notFilter && typeof notFilter === 'object') {
    for (const [col, val] of Object.entries(notFilter)) {
      const cleanCol = sanitizeId(col);
      if (val === null || val === 'null' || val === undefined) {
        whereClauses.push(`"${cleanCol}" IS NOT NULL`);
      } else if (typeof val === 'object' && val !== null) {
        const typedVal = val as { op?: string; val?: unknown };
        if (typedVal.op === 'is' && (typedVal.val === null || typedVal.val === 'null')) {
          whereClauses.push(`"${cleanCol}" IS NOT NULL`);
        } else if (typedVal.op === 'in' && Array.isArray(typedVal.val) && typedVal.val.length > 0) {
          const placeholders = typedVal.val.map(() => '?').join(', ');
          whereClauses.push(`"${cleanCol}" NOT IN (${placeholders})`);
          params.push(...typedVal.val);
        } else if (typedVal.val !== undefined) {
          whereClauses.push(`"${cleanCol}" != ?`);
          params.push(typedVal.val);
        }
      } else {
        whereClauses.push(`"${cleanCol}" != ?`);
        params.push(val);
      }
    }
  }

  return { whereClauses, params };
}

// Universal Edge Query endpoint for D1 (PostgREST-compatible)
queryRouter.post('/query', async (c) => {
  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const {
    table,
    select = '*',
    order,
    limit,
    offset,
    single = false,
    action = 'select',
    values,
    count,
    head = false,
  } = body;

  if (!table || typeof table !== 'string') {
    return c.json({ data: null, error: { message: 'Bảng không hợp lệ' } }, 200);
  }

  const cleanTable = sanitizeId(table);

  try {
    if (action === 'delete') {
      const { whereClauses, params } = buildWhere(body);
      if (whereClauses.length === 0) {
        return c.json({ data: null, error: { message: 'Cần điều kiện WHERE khi xóa' } }, 200);
      }

      const sql = `DELETE FROM "${cleanTable}" WHERE ${whereClauses.join(' AND ')}`;
      const result = await c.env.DB.prepare(sql).bind(...params).run();
      return c.json({ data: result, error: null }, 200);
    }

    if (action === 'update' && values) {
      const setClauses: string[] = [];
      const updateParams: unknown[] = [];

      for (const [col, val] of Object.entries(values as Record<string, unknown>)) {
        setClauses.push(`"${sanitizeId(col)}" = ?`);
        updateParams.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
      }

      const { whereClauses, params: whereParams } = buildWhere(body);
      const allParams = [...updateParams, ...whereParams];

      const sql = `UPDATE "${cleanTable}" SET ${setClauses.join(', ')}${whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : ''} RETURNING *`;
      try {
        const { results: updResults } = await c.env.DB.prepare(sql).bind(...allParams).all();
        const data = single ? updResults[0] ?? null : updResults;
        return c.json({ data, error: null }, 200);
      } catch {
        await c.env.DB.prepare(
          `UPDATE "${cleanTable}" SET ${setClauses.join(', ')}${whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : ''}`,
        )
          .bind(...allParams)
          .run();
        return c.json({ data: values, error: null }, 200);
      }
    }

    if (action === 'insert' && values) {
      const rowList = Array.isArray(values) ? values : [values];
      if (rowList.length === 0) return c.json({ data: [], error: null }, 200);

      const validCols = await getValidTableColumns(c.env.DB, cleanTable);
      const insertedRows: Record<string, unknown>[] = [];
      for (const row of rowList) {
        const r = row as Record<string, unknown>;
        const rawCols = Object.keys(r);
        const cols = validCols.size > 0 ? rawCols.filter((k) => validCols.has(sanitizeId(k))) : rawCols;
        if (cols.length === 0) continue;

        const colNames = cols.map((k) => `"${sanitizeId(k)}"`).join(', ');
        const placeholders = cols.map(() => '?').join(', ');
        const insParams = cols.map((k) => {
          const v = r[k];
          if (v === undefined) return null;
          return typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
        });

        const sql = `INSERT OR REPLACE INTO "${cleanTable}" (${colNames}) VALUES (${placeholders})`;
        await c.env.DB.prepare(sql).bind(...insParams).run();
        insertedRows.push(r);
      }

      const data = single ? insertedRows[0] ?? null : Array.isArray(values) ? insertedRows : insertedRows[0] ?? null;
      return c.json({ data, error: null }, 200);
    }

    // Default: SELECT query
    const { whereClauses, params } = buildWhere(body);
    const isCountOnly = (count === 'exact' && head === true) || select === 'count';
    const wantsCount = count === 'exact' || select === 'count' || select === 'id, count';

    if (isCountOnly) {
      const countSql = `SELECT count(*) as count FROM "${cleanTable}"${whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : ''}`;
      const { results: countResults } = await c.env.DB.prepare(countSql).bind(...params).all();
      const countVal = extractNumberProp(countResults[0], 'count') ?? 0;
      return c.json({ data: null, count: countVal, error: null }, 200);
    }

    let countVal: number | null = null;
    if (wantsCount) {
      const countSql = `SELECT count(*) as count FROM "${cleanTable}"${whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : ''}`;
      const { results: countResults } = await c.env.DB.prepare(countSql).bind(...params).all();
      countVal = extractNumberProp(countResults[0], 'count') ?? 0;
    }

    const { directColumns, relations } = parseSelectString(String(select));
    let cleanSelectSql = '*';
    if (!directColumns.includes('*') && directColumns.length > 0) {
      const neededCols = new Set(directColumns.map((c) => sanitizeId(c)));
      if (relations.length > 0) {
        neededCols.add('id');
        for (const rel of relations) {
          const meta = resolveRelationMeta(cleanTable, sanitizeId(rel.relationName));
          if (meta.parentFk) neededCols.add(meta.parentFk);
        }
      }
      cleanSelectSql = Array.from(neededCols).map((c) => `"${c}"`).join(', ');
    }

    let sql = `SELECT ${cleanSelectSql} FROM "${cleanTable}"`;
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    if (order) {
      const orderList = Array.isArray(order) ? order : [order];
      const orderClauses = orderList.map((o: { column?: string; ascending?: boolean; nullsFirst?: boolean }) => {
        const col = sanitizeId(String(o.column || 'id'));
        let dir = o.ascending === false ? 'DESC' : 'ASC';
        if (o.nullsFirst === true) dir += ' NULLS FIRST';
        else if (o.nullsFirst === false) dir += ' NULLS LAST';
        return `"${col}" ${dir}`;
      });
      sql += ` ORDER BY ${orderClauses.join(', ')}`;
    }

    if (typeof limit === 'number') {
      sql += ` LIMIT ${limit}`;
    }
    if (typeof offset === 'number') {
      sql += ` OFFSET ${offset}`;
    }

    const { results } = await c.env.DB.prepare(sql).bind(...params).all();
    const rows = (results || []) as Record<string, unknown>[];

    // Join related tables if requested in PostgREST relation syntax
    if (relations.length > 0 && rows.length > 0) {
      for (const relNode of relations) {
        await joinRelation(c.env.DB, cleanTable, rows, relNode);
      }
    }

    if (single) {
      return c.json({ data: rows[0] ?? null, count: countVal, error: null }, 200);
    }

    return c.json({ data: rows, count: countVal, error: null }, 200);
  } catch (err) {
    console.error('D1 Query Error for payload:', JSON.stringify(body), err);
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ data: null, count: null, error: { message } }, 200);
  }
});

// Universal RPC endpoint for D1
queryRouter.post('/rpc/:name', async (c) => {
  const name = c.req.param('name');
  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    body = {};
  }

  try {
    // 1. get_standalone_test_run_bundle
    if (name === 'get_standalone_test_run_bundle') {
      const runId = body.p_run_id as string;
      const assignmentId = body.p_assignment_id as string;

      let run: unknown = null;
      if (runId) {
        const { results } = await c.env.DB.prepare(
          'SELECT * FROM standalone_test_runs WHERE id = ?',
        ).bind(runId).all();
        run = results[0] ?? null;
      }

      const effectiveAssignmentId = assignmentId || extractStringProp(run, 'assignment_id');
      let allRuns: unknown[] = [];
      if (effectiveAssignmentId) {
        const { results } = await c.env.DB.prepare(
          'SELECT * FROM standalone_test_runs WHERE assignment_id = ? ORDER BY session_number, attempt_number',
        ).bind(effectiveAssignmentId).all();
        allRuns = results;
      }

      let items: unknown[] = [];
      if (run) {
        const { results } = await c.env.DB.prepare(
          `SELECT sri.*, ti.prompt_vi, ti.prompt_en, ti.spoken_script_vi, ti.spoken_script_en, 
                  ti.tc, ti.tl, ti.lc, ti.measured_cvr as cvr, sa.id as attempt_id,
                  sas.status as attempt_status, sas.effective_color as effective_color,
                  sas.entered_probe_flow, sas.probe_count, sas.finalized_at
           FROM standalone_test_run_items sri
           LEFT JOIN test_items ti ON sri.test_item_id = ti.id
           LEFT JOIN standalone_test_attempts sa ON sa.run_item_id = sri.id
           LEFT JOIN standalone_test_attempt_snapshots sas ON sas.attempt_id = sa.id
           WHERE sri.run_id = ?
           ORDER BY sri.item_order`,
        ).bind(runId).all();
        items = results;
      }

      return c.json({
        data: {
          runDetails: run,
          allRuns,
          packageTitle: 'GREEN-TEST-49Q',
          packageKind: 'standard',
          racMetricLabel: '%c',
          packageAudio: {
            packageStartVariantId: '20072f29-c375-57c2-a47f-4e136d62fa8c',
            partIntroVariantIds: {
              part_I: '78a0c16a-7f66-d08e-7b9f-46a748c988b8',
              part_II: 'fc95df8a-54f0-3672-71a1-d895f1ab63ef',
              part_III: '751d87b5-5403-4ce2-9a26-bca004573178',
            },
            packageEndVariantId: '98a729e2-45e0-5a81-9b0a-31eb82d56b82',
          },
          sessionIntroVariantIds: {
            '7f4de1af-9433-5a9b-ad44-39c2573b4673': '2bc1a302-0c7b-70bd-7a7f-46ee78b36ed0',
            'e2301d46-f708-5522-b230-564802df93a7': 'fe8082b5-973c-60bb-eec8-b42a8f0a6437',
            '574eef5b-e457-5e5c-befb-9a1a641ae2eb': '6b7189c4-18df-4a1b-9a0d-21eb82d56a71',
          },
        },
        error: null,
      }, 200);
    }

    // 2. get_learner_standalone_test_results
    if (name === 'get_learner_standalone_test_results') {
      const learnerId = body.p_learner_user_id as string;
      const { results: runs } = await c.env.DB.prepare(
        'SELECT * FROM standalone_test_runs WHERE learner_user_id = ? ORDER BY created_at DESC',
      ).bind(learnerId).all();

      return c.json({
        data: {
          learnerUserId: learnerId,
          runCount: runs.length,
          averageLearnerCpdScore: 85,
          runs,
        },
        error: null,
      }, 200);
    }
    // 2.1 live-test-generation (Audio playback URL resolution)
    if (name === 'live-test-generation') {
      const action = extractStringProp(body, 'action') || String(body.action || '');
      if (action === 'getNarrationPlaybackUrl') {
        const variantId = String(body.narrationVariantId || '');
        const { results: varRows } = await c.env.DB.prepare(
          `SELECT nv.*, aa.storage_path, aa.storage_bucket
           FROM narration_variants nv
           LEFT JOIN audio_assets aa ON nv.audio_asset_id = aa.id
           WHERE nv.id = ?`,
        ).bind(variantId).all();

        const v = varRows[0];
        const storagePath = extractStringProp(v, 'storage_path');
        let playbackUrl = '/audio/number_1.wav';
        if (storagePath) {
          const filename = storagePath.split('/').pop();
          if (filename) {
            playbackUrl = `/audio/${filename}`;
          }
        }

        return c.json({
          data: {
            narrationVariantId: variantId,
            signedUrl: playbackUrl,
            expiresIn: 3600,
          },
          error: null,
        }, 200);
      }
    }

    // 3. create_standalone_test_assignment
    if (name === 'create_standalone_test_assignment') {
      const learnerId = body.p_learner_user_id as string;
      const packageVersionId = body.p_package_version_id as string;
      const id = crypto.randomUUID();

      const { results: assignRows } = await c.env.DB.prepare(
        'SELECT COALESCE(MAX(assignment_number), 0) + 1 as next_num FROM standalone_test_assignments',
      ).all();
      const nextNum = extractNumberProp(assignRows[0], 'next_num') ?? 1;

      await c.env.DB.prepare(
        `INSERT INTO standalone_test_assignments 
         (id, organization_id, package_version_id, learner_user_id, assigned_by_user_id, assignment_number, status, assigned_at)
         VALUES (?, 'a0000000-0000-4000-8000-000000000001', ?, ?, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', ?, 'assigned', CURRENT_TIMESTAMP)`,
      ).bind(id, packageVersionId, learnerId, nextNum).run();

      return c.json({ data: id, error: null }, 200);
    }

    // 4. record_standalone_provisional_result
    if (name === 'record_standalone_provisional_result') {
      const runItemId = body.p_run_item_id as string;
      const color = body.p_color as string;

      let attemptId = crypto.randomUUID();
      const existing = await c.env.DB.prepare(
        'SELECT id FROM standalone_test_attempts WHERE run_item_id = ?',
      ).bind(runItemId).first();

      if (existing && typeof existing.id === 'string') {
        attemptId = existing.id;
      } else {
        await c.env.DB.prepare(
          'INSERT INTO standalone_test_attempts (id, run_item_id) VALUES (?, ?)',
        ).bind(attemptId, runItemId).run();
      }

      await c.env.DB.prepare(
        `INSERT OR REPLACE INTO standalone_test_attempt_snapshots
         (attempt_id, status, provisional_color, effective_color, entered_probe_flow, probe_count, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`,
      ).bind(attemptId, color === 'yellow' ? 'provisional' : 'finalized', color, color, color === 'yellow' ? 1 : 0).run();

      return c.json({
        data: {
          attemptId,
          status: 'provisional',
          effectiveColor: color,
          probeCount: 0,
        },
        error: null,
      }, 200);
    }

    // 5. resolve_standalone_probe
    if (name === 'resolve_standalone_probe') {
      const attemptId = body.p_attempt_id as string;
      const outcome = body.p_outcome as string;

      const nextColor = outcome === 'done' ? 'green' : outcome === 'fail' ? 'red' : 'yellow';

      await c.env.DB.prepare(
        `UPDATE standalone_test_attempt_snapshots
         SET status = ?, effective_color = ?, probe_count = probe_count + 1, updated_at = CURRENT_TIMESTAMP
         WHERE attempt_id = ?`,
      ).bind(outcome === 'continue' ? 'provisional' : 'finalized', nextColor, attemptId).run();

      return c.json({
        data: {
          attemptId,
          status: outcome === 'continue' ? 'provisional' : 'finalized',
          effectiveColor: nextColor,
          probeCount: 1,
        },
        error: null,
      }, 200);
    }

    // 6. create_session_question_attempt (Live Observation)
    if (name === 'create_session_question_attempt') {
      const sessionId = String(body.p_learning_session_id || '');
      const teacherId = String(body.p_teacher_user_id || '');
      const learnerId = String(body.p_learner_user_id || '');
      const externalRef = body.p_external_ref ? String(body.p_external_ref) : null;

      const { results: seqRows } = await c.env.DB.prepare(
        'SELECT COALESCE(MAX(sequence_number), 0) + 1 as next_seq FROM session_questions WHERE learning_session_id = ?',
      ).bind(sessionId).all();
      const nextSeq = extractNumberProp(seqRows[0], 'next_seq') ?? 1;

      const questionId = crypto.randomUUID();
      await c.env.DB.prepare(
        'INSERT INTO session_questions (id, learning_session_id, sequence_number, external_ref) VALUES (?, ?, ?, ?)',
      ).bind(questionId, sessionId, nextSeq, externalRef).run();

      const attemptId = crypto.randomUUID();
      await c.env.DB.prepare(
        'INSERT INTO assessment_attempts (id, learning_session_id, session_question_id, learner_user_id, teacher_user_id) VALUES (?, ?, ?, ?, ?)',
      ).bind(attemptId, sessionId, questionId, learnerId, teacherId).run();

      await c.env.DB.prepare(
        'INSERT INTO assessment_attempt_snapshots (attempt_id, status, probe_count, max_probe_count, entered_probe_flow, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
      ).bind(attemptId, 'draft', 0, 5, 0).run();

      return c.json({
        data: {
          question: {
            id: questionId,
            learning_session_id: sessionId,
            sequence_number: nextSeq,
            external_ref: externalRef,
          },
          attempt: {
            id: attemptId,
            learning_session_id: sessionId,
            session_question_id: questionId,
            learner_user_id: learnerId,
            teacher_user_id: teacherId,
          },
        },
        error: null,
      }, 200);
    }

    // 7. record_provisional_result (Live Observation)
    if (name === 'record_provisional_result') {
      const attemptId = String(body.p_attempt_id || '');
      const color = String(body.p_color || '').toLowerCase();
      const actorId = String(body.p_actor_user_id || '');

      await c.env.DB.prepare(
        'INSERT INTO assessment_events (id, attempt_id, event_type, payload, actor_user_id, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
      ).bind(crypto.randomUUID(), attemptId, 'provisional_recorded', JSON.stringify({ color }), actorId).run();

      let snapStatus = 'finalized';
      let effectiveColor = color;
      let enteredProbe = 0;
      let finalizedAt: string | null = new Date().toISOString();

      if (color === 'green') {
        snapStatus = 'probe_open';
        effectiveColor = 'green';
        enteredProbe = 1;
        finalizedAt = null;
      } else {
        await c.env.DB.prepare(
          'INSERT INTO assessment_events (id, attempt_id, event_type, payload, actor_user_id, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        ).bind(crypto.randomUUID(), attemptId, 'result_finalized', JSON.stringify({ color }), actorId).run();
      }

      await c.env.DB.prepare(
        `INSERT OR REPLACE INTO assessment_attempt_snapshots 
         (attempt_id, status, provisional_color, effective_color, entered_probe_flow, probe_count, max_probe_count, finalized_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 5, ?, CURRENT_TIMESTAMP)`,
      ).bind(attemptId, snapStatus, color, effectiveColor, enteredProbe, finalizedAt).run();

      return c.json({
        data: {
          attempt_id: attemptId,
          status: snapStatus,
          provisional_color: color,
          effective_color: effectiveColor,
          effective_score: color === 'green' ? 1 : color === 'orange' ? 0.5 : 0,
          probe_count: 0,
          max_probe_count: 5,
          entered_probe_flow: Boolean(enteredProbe),
          finalized_at: finalizedAt,
          updated_at: new Date().toISOString(),
        },
        error: null,
      }, 200);
    }

    // 8. resolve_probe (Live Observation)
    if (name === 'resolve_probe') {
      const attemptId = String(body.p_attempt_id || '');
      const outcome = String(body.p_outcome || '').toLowerCase();
      const actorId = String(body.p_actor_user_id || '');

      const { results: snapRows } = await c.env.DB.prepare(
        'SELECT * FROM assessment_attempt_snapshots WHERE attempt_id = ?',
      ).bind(attemptId).all();
      const existingSnap = snapRows[0] || {};
      const currentProbeCount = extractNumberProp(existingSnap, 'probe_count') ?? 0;

      let nextColor = 'yellow';
      let nextStatus = 'finalized';
      let nextProbeCount = currentProbeCount;
      let finalizedAt: string | null = new Date().toISOString();

      if (outcome === 'done') {
        nextColor = 'indigo';
        nextProbeCount = currentProbeCount + 1;
      } else if (outcome === 'fail') {
        nextColor = 'yellow';
      } else if (outcome === 'continue') {
        nextColor = 'orange';
        nextStatus = 'probe_open';
        nextProbeCount = currentProbeCount + 1;
        finalizedAt = null;
      }

      const eventType = outcome === 'fail' ? 'probe_failed' : outcome === 'done' ? 'probe_completed' : 'probe_continued';
      await c.env.DB.prepare(
        'INSERT INTO assessment_events (id, attempt_id, event_type, payload, actor_user_id, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
      ).bind(crypto.randomUUID(), attemptId, eventType, JSON.stringify({ outcome }), actorId).run();

      if (nextStatus === 'finalized') {
        await c.env.DB.prepare(
          'INSERT INTO assessment_events (id, attempt_id, event_type, payload, actor_user_id, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        ).bind(crypto.randomUUID(), attemptId, 'result_finalized', JSON.stringify({ color: nextColor }), actorId).run();
      }

      await c.env.DB.prepare(
        `UPDATE assessment_attempt_snapshots 
         SET status = ?, effective_color = ?, probe_count = ?, finalized_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE attempt_id = ?`,
      ).bind(nextStatus, nextColor, nextProbeCount, finalizedAt, attemptId).run();

      return c.json({
        data: {
          attempt_id: attemptId,
          status: nextStatus,
          provisional_color: 'green',
          effective_color: nextColor,
          effective_score: nextColor === 'indigo' ? 1 : 0.5,
          probe_count: nextProbeCount,
          max_probe_count: 5,
          entered_probe_flow: true,
          finalized_at: finalizedAt,
          updated_at: new Date().toISOString(),
        },
        error: null,
      }, 200);
    }

    // 9. correct_final_result (Live Observation)
    if (name === 'correct_final_result') {
      const attemptId = String(body.p_attempt_id || '');
      const color = String(body.p_color || '').toLowerCase();
      const reason = String(body.p_reason || 'Corrected');
      const actorId = String(body.p_actor_user_id || '');

      await c.env.DB.prepare(
        'INSERT INTO assessment_events (id, attempt_id, event_type, payload, actor_user_id, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
      ).bind(crypto.randomUUID(), attemptId, 'result_corrected', JSON.stringify({ color, reason }), actorId).run();

      await c.env.DB.prepare(
        `UPDATE assessment_attempt_snapshots 
         SET status = 'corrected', effective_color = ?, updated_at = CURRENT_TIMESTAMP
         WHERE attempt_id = ?`,
      ).bind(color, attemptId).run();

      return c.json({
        data: {
          attempt_id: attemptId,
          status: 'corrected',
          effective_color: color,
          updated_at: new Date().toISOString(),
        },
        error: null,
      }, 200);
    }
    return c.json({ data: { success: true }, error: null }, 200);
  } catch (err) {
    console.error('D1 RPC Error for', name, JSON.stringify(body), err);
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ data: null, error: { message } }, 200);
  }
});
