import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backupDir = resolve(__dirname, '../../../data/supabase-backup');
const outSqlPath = resolve(__dirname, '../src/db/migrations/seed-data.sql');

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

// Table order respecting foreign keys
const tableOrder = [
  'organizations',
  'organization_workspace_versions',
  'org_settings',
  'users',
  'staff_roles',
  'organization_memberships',
  'courses',
  'classes',
  'enrollments',
  'learning_sessions',
  'scheduled_sessions',
  'session_questions',
  'assessment_attempts',
  'assessment_attempt_snapshots',
  'assessment_events',
  'attendance_records',
  'test_packages',
  'test_package_versions',
  'cci_profiles',
  'cci_categories',
  'test_sections',
  'section_measurement_snapshots',
  'test_items',
  'audio_assets',
  'narration_variants',
  'standalone_test_assignments',
  'standalone_test_runs',
  'standalone_test_run_items',
  'standalone_test_attempts',
  'standalone_test_attempt_snapshots',
  'standalone_test_events'
];

// Map of Postgres columns to SQLite columns if different
const columnMap = {
  organization_memberships: {
    user_id: 'userId'
  }
};

let sql = '-- Seed data generated from Supabase backup for Cloudflare D1\nPRAGMA foreign_keys = OFF;\nBEGIN TRANSACTION;\n';

let totalRows = 0;
for (const table of tableOrder) {
  const jsonPath = resolve(backupDir, `${table}.json`);
  if (!existsSync(jsonPath)) {
    console.warn(`[SKIP] Missing backup file for ${table}`);
    continue;
  }

  const rows = JSON.parse(readFileSync(jsonPath, 'utf8'));
  if (!Array.isArray(rows) || rows.length === 0) continue;

  console.log(`Processing ${table}: ${rows.length} rows...`);

  for (const row of rows) {
    // Filter out obsolete clerk columns in users
    if (table === 'users') {
      delete row.clerk_user_id;
      delete row.legacy_clerk_user_id;
      delete row.auth_user_id;
    }

    const cols = Object.keys(row).map(c => (columnMap[table]?.[c] || c));
    const vals = Object.keys(row).map(c => escapeSql(row[c]));

    sql += `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')});\n`;
    totalRows++;
  }
}

sql += 'COMMIT;\nPRAGMA foreign_keys = ON;\n';

writeFileSync(outSqlPath, sql, 'utf8');
console.log(`\nSuccessfully generated D1 seed file at ${outSqlPath} with ${totalRows} INSERT statements!`);
