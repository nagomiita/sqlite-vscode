/**
 * Read-only SQL guard.
 *
 * The viewer is strictly read-only. We only allow a single SELECT / WITH ...
 * SELECT / PRAGMA (read form) / EXPLAIN statement. Anything that could mutate
 * the in-memory database or attach external files is rejected.
 */

const FORBIDDEN_KEYWORDS = [
  'insert',
  'update',
  'delete',
  'replace',
  'drop',
  'alter',
  'create',
  'attach',
  'detach',
  'reindex',
  'vacuum',
  'begin',
  'commit',
  'rollback',
  'savepoint',
  'release',
  'analyze',
];

export type GuardResult = { ok: true } | { ok: false; reason: string };

/** Strip line/block comments so keyword detection is not bypassed by comments. */
function stripComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

export function guardReadOnlySql(rawSql: string): GuardResult {
  const sql = stripComments(rawSql).trim();
  if (!sql) {
    return { ok: false, reason: 'Empty query.' };
  }

  // Reject multiple statements (defense in depth). Allow a single trailing ';'.
  const withoutTrailing = sql.replace(/;\s*$/, '');
  if (withoutTrailing.includes(';')) {
    return { ok: false, reason: 'Only a single statement is allowed.' };
  }

  const firstWord = withoutTrailing.match(/^\s*([a-z]+)/i)?.[1]?.toLowerCase();
  const allowedStarts = ['select', 'with', 'pragma', 'explain'];
  if (!firstWord || !allowedStarts.includes(firstWord)) {
    return {
      ok: false,
      reason: 'Only SELECT / WITH / PRAGMA / EXPLAIN queries are allowed.',
    };
  }

  // PRAGMA with assignment (`PRAGMA x = y`) can change state -> reject.
  if (firstWord === 'pragma' && /=/.test(withoutTrailing)) {
    return { ok: false, reason: 'Writable PRAGMA is not allowed.' };
  }

  const lower = withoutTrailing.toLowerCase();
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`).test(lower)) {
      return { ok: false, reason: `Keyword "${kw.toUpperCase()}" is not allowed.` };
    }
  }

  return { ok: true };
}
