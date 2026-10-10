// npm run db:migrate — applies db/migrations/*.sql to DATABASE_URL, once each.
import fs from "node:fs";
import path from "node:path";
import { q } from "../lib/db";

async function main() {
  await q("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await q<{ name: string }>("select name from schema_migrations")).map((r) => r.name));
  const dir = path.join(process.cwd(), "db/migrations");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    if (done.has(f)) { console.log("skip ", f); continue; }
    // one statement per call: the Neon HTTP driver runs a single statement at a time
    const stmts = fs.readFileSync(path.join(dir, f), "utf8").replace(/^\s*--.*$/gm, "").split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
    for (const s of stmts) await q(s);
    await q("insert into schema_migrations (name) values ($1)", [f]);
    console.log("apply", f, `(${stmts.length} statements)`);
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
