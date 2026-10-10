// npm run webhook:url — prints the exact URL to paste into Vaani → Settings → Webhooks.
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const base = process.argv[2] || env.APP_URL;
if (!env.VAANI_WEBHOOK_TOKEN) { console.error("VAANI_WEBHOOK_TOKEN is not set in .env.local"); process.exit(1); }
console.log(`${base.replace(/\/$/, "")}/api/vaani/webhook?token=${env.VAANI_WEBHOOK_TOKEN}`);
