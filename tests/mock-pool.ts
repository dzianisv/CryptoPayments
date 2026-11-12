// ── In-memory fake `pg` Pool for the CryptoPayments test suite ───────────────
// The db layer (src/db.ts) issues parameterized SQL against a `pg.Pool`. This
// fake implements the `query(text, params)` surface for exactly the statement
// shapes db.ts emits — SELECT / INSERT ... RETURNING * / UPDATE [RETURNING *]
// with `"col" = $n` predicates, ORDER BY created_at, LIMIT/OFFSET — plus the
// `SELECT 1` health ping. Anything else throws, so a new query shape fails
// loudly here instead of silently returning the wrong rows.
//
// Fidelity notes (mirrors the old Supabase-chain mock it replaces):
// - INSERT generates `id` (uuid-N) + created_at/updated_at, enforces the two
//   UNIQUE constraints the schema carries ((tx_hash, chain_id) on
//   payment_intents, (id_type, uid) on customers) by throwing like pg does.
// - UPDATE bumps updated_at, like the schema's update_updated_at() trigger.
// - Timestamps are ISO strings, like the old PostgREST responses.
import type { DB } from "../src/db.js";

type Row = Record<string, unknown>;

const TABLES = [
  "customers",
  "payment_intents",
  "invoices",
  "invoice_line_items",
  "checkout_sessions",
  "webhook_events",
] as const;

function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let inQuote = false;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && s[i - 1] !== "'") inQuote = !inQuote;
    if (!inQuote && ch === "(") depth++;
    if (!inQuote && ch === ")") depth--;
    if (!inQuote && depth === 0 && ch === ",") {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim() !== "") parts.push(cur);
  return parts;
}

function parseValueToken(tok: string, params: unknown[]): unknown {
  const t = tok.trim();
  const placeholder = t.match(/^\$(\d+)$/);
  if (placeholder) return params[Number(placeholder[1]) - 1];
  if (/^'.*'$/.test(t)) return t.slice(1, -1).replace(/''/g, "'");
  if (t === "NULL") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  throw new Error(`mock-pool: unsupported value token ${JSON.stringify(t)}`);
}

function evalWhere(where: string, row: Row, params: unknown[]): boolean {
  // All db.ts predicates are `"col" = $n` joined by AND.
  return where
    .split(/\s+AND\s+/i)
    .every((cond) => {
      const m = cond.trim().match(/^"([\w]+)" = \$(\d+)$/);
      if (!m) throw new Error(`mock-pool: unsupported WHERE condition ${JSON.stringify(cond)}`);
      return row[m[1]] === params[Number(m[2]) - 1];
    });
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return a < b ? -1 : 1;
}

export function createMockPool(): DB {
  const stores: Record<string, Row[]> = Object.fromEntries(TABLES.map((t) => [t, [] as Row[]]));
  let idCounter = 0;

  async function query(text: string, params: unknown[] = []): Promise<{ rows: Row[] }> {
    const sql = text.replace(/\s+/g, " ").trim();

    // Health ping (src/db.ts pingDb).
    if (/^SELECT 1$/i.test(sql)) return { rows: [{ "?column?": 1 }] };

    let m: RegExpMatchArray | null;

    // ── SELECT ──
    m = sql.match(
      /^SELECT (.+) FROM "(\w+)"(?: WHERE (.+?))?(?: ORDER BY "([\w]+)" (ASC|DESC))?(?: LIMIT \$(\d+))?(?: OFFSET \$(\d+))?$/i,
    );
    if (m) {
      const [, cols, table, where, orderCol, orderDir, limitTok, offsetTok] = m;
      if (!stores[table]) throw new Error(`mock-pool: unknown table ${table}`);
      let rows = [...stores[table]];
      if (where) rows = rows.filter((r) => evalWhere(where, r, params));
      if (orderCol) {
        rows.sort((a, b) => {
          const c = compareValues(a[orderCol], b[orderCol]);
          return orderDir === "DESC" ? -c : c;
        });
      }
      if (offsetTok) rows = rows.slice(Number(params[Number(offsetTok) - 1]));
      if (limitTok) rows = rows.slice(0, Number(params[Number(limitTok) - 1]));
      if (cols.trim() !== "*") {
        const wanted = splitTopLevel(cols).map((c) => c.trim().replace(/^"|"$/g, ""));
        rows = rows.map((r) => Object.fromEntries(wanted.map((c) => [c, r[c]])));
      }
      return { rows: rows.map((r) => ({ ...r })) };
    }

    // ── INSERT ... RETURNING * ──
    m = sql.match(/^INSERT INTO "(\w+)" \((.+)\) VALUES \((.+)\) RETURNING \*$/i);
    if (m) {
      const [, table, colsPart, valsPart] = m;
      if (!stores[table]) throw new Error(`mock-pool: unknown table ${table}`);
      const cols = splitTopLevel(colsPart).map((c) => c.trim().replace(/^"|"$/g, ""));
      const vals = splitTopLevel(valsPart).map((t) => parseValueToken(t, params));
      const now = new Date().toISOString();
      const row: Row = { id: `uuid-${++idCounter}`, created_at: now, updated_at: now };
      cols.forEach((c, i) => {
        row[c] = vals[i];
      });
      if (table === "payment_intents" && row.tx_hash) {
        const dup = stores[table].find(
          (r) => r.tx_hash === row.tx_hash && r.chain_id === row.chain_id,
        );
        if (dup) throw new Error('duplicate key value violates unique constraint "payment_intents_tx_hash_chain_id_key"');
      }
      if (table === "customers") {
        const dup = stores[table].find((r) => r.id_type === row.id_type && r.uid === row.uid);
        if (dup) throw new Error('duplicate key value violates unique constraint "customers_id_type_uid_key"');
      }
      stores[table].push(row);
      return { rows: [{ ...row }] };
    }

    // ── UPDATE ... [RETURNING *] ──
    m = sql.match(/^UPDATE "(\w+)" SET (.+?) WHERE (.+?)(?: RETURNING \*)?$/i);
    if (m) {
      const [, table, setPart, where] = m;
      if (!stores[table]) throw new Error(`mock-pool: unknown table ${table}`);
      const assignments = splitTopLevel(setPart).map((a) => {
        const mm = a.trim().match(/^"([\w]+)" = (.+)$/);
        if (!mm) throw new Error(`mock-pool: unsupported SET assignment ${JSON.stringify(a)}`);
        return { col: mm[1], value: parseValueToken(mm[2], params) };
      });
      const matched = stores[table].filter((r) => evalWhere(where, r, params));
      for (const row of matched) {
        for (const a of assignments) row[a.col] = a.value;
        row.updated_at = new Date().toISOString();
      }
      const returning = /RETURNING \*$/.test(sql);
      return { rows: returning ? matched.map((r) => ({ ...r })) : [] };
    }

    throw new Error(`mock-pool: unsupported SQL: ${sql}`);
  }

  return { query } as unknown as DB;
}
