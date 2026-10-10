// npm run hubspot:check — verifies HUBSPOT_ACCESS_TOKEN against the real HubSpot API and lists your
// deal pipelines and stage IDs, so you can fill Settings → HubSpot without hunting through HubSpot's UI.
import { inspectHubspot } from "../lib/hubspot/client";

inspectHubspot().then((r) => {
  if (r.error) console.log("✗", r.error);
  if (r.ok) console.log(`✓ Connected${r.portalId ? ` to portal ${r.portalId}` : ""}${r.uiDomain ? ` (${r.uiDomain})` : ""}. Contacts, deals and notes are readable.`);
  for (const p of r.pipelines ?? []) console.log(`\nPipeline "${p.label}"  id=${p.id}\n  ${p.stages.map((s) => `${s.label} = ${s.id}`).join("\n  ")}`);
  console.log("\nFor writes the token also needs: crm.objects.contacts.write, crm.objects.deals.write (notes use the contacts/deals scopes).");
  process.exit(r.ok ? 0 : 1);
});
