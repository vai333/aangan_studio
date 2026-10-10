"use client";
import { useState, useTransition } from "react";
import { syncVaaniAction } from "../actions";

export function SyncButton() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = () => start(async () => {
    const r = await syncVaaniAction();
    if (r.demo) setMsg({ ok: false, text: "Demo mode — set DATABASE_URL to sync real calls." });
    else if (r.error) setMsg({ ok: false, text: r.error });
    else setMsg({ ok: true, text: r.fetched ? `${r.imported} new, ${r.updated} updated, ${r.skipped} already here — ${r.graded} graded.` : "Vaani has no calls yet." });
  });
  return (
    <div className="flex items-center gap-3">
      {msg && <span className={`max-w-xs text-xs ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</span>}
      <button type="button" onClick={run} disabled={pending} className="focus-ring rounded-full border border-line bg-surface px-4 py-2 text-sm hover:border-ink disabled:opacity-60">
        {pending ? "Syncing…" : "↻ Sync from Vaani"}
      </button>
    </div>
  );
}
