import "server-only";

// One tiny query function over Postgres. On Neon it uses @neondatabase/serverless
// (HTTP, no connection pool to manage on Vercel). For a local Postgres
// (postgres://…@localhost/…) it uses node-postgres, so dev and tests need no cloud.
export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Runner = (text: string, params: unknown[]) => Promise<Row[]>;

// AANGAN_DEMO=1 forces the in-memory September replay even when DATABASE_URL is set (`npm run dev:demo`).
export const dbConfigured = () => !!process.env.DATABASE_URL && process.env.AANGAN_DEMO !== "1";

// Timestamps arrive as Date objects; the app works in ISO strings.
const normalise = (rows: Row[]): Row[] =>
  rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])));

async function makeRunner(): Promise<Runner> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 5 });
    return async (t, p) => normalise((await pool.query(t, p as unknown[])).rows);
  }
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  return async (t, p) => normalise((await sql.query(t, p as unknown[])) as Row[]);
}

const g = globalThis as unknown as { __aanganDb?: Promise<Runner> };

export async function q<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const run = await (g.__aanganDb ??= makeRunner());
  return (await run(text, params)) as T[];
}

export const q1 = async <T extends Row = Row>(text: string, params: unknown[] = []): Promise<T | null> => (await q<T>(text, params))[0] ?? null;

/** jsonb parameter helper. */
export const json = (v: unknown) => JSON.stringify(v ?? null);
