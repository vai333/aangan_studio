// npm run vaani:import -- <vaani-call-id> [+91caller-number]
import { importVaaniCall } from "../lib/vaani/sync";
const [id, phone] = process.argv.slice(2);
importVaaniCall(id ?? "", phone).then((r) => { console.log(r.ok ? "✓" : "✗", r.message, r.id ? `(call ${r.id})` : ""); process.exit(r.ok ? 0 : 1); });
