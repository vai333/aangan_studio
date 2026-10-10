"use client";
import { useState, useTransition } from "react";
import { importVaaniCallAction } from "../actions";

export function ImportBox() {
  const [id, setId] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const input = "focus-ring h-9 rounded-full border border-line bg-surface px-3 text-sm";
  return (
    <details className="card p-4 text-sm">
      <summary className="cursor-pointer font-medium">Import a call from Vaani by its call ID</summary>
      <p className="mt-2 text-ink-2">For a call that hasn&apos;t arrived by webhook. Copy the call ID from Vaani → Call History. The caller&apos;s number is optional, but needed to mirror it to HubSpot.</p>
      <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await importVaaniCallAction(id, phone); setMsg({ ok: r.ok, text: r.message }); if (r.ok) setId(""); }); }}>
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="Vaani call ID, e.g. inbound-1790000000-ab12cd34" aria-label="Vaani call ID" className={`${input} w-full sm:w-96`} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Caller number (optional)" aria-label="Caller number" className={`${input} w-full sm:w-52`} />
        <button disabled={pending || !id.trim()} className="focus-ring rounded-full bg-ink px-4 py-2 text-sm font-medium text-surface disabled:opacity-50">{pending ? "Importing…" : "Import"}</button>
      </form>
      {msg && <p className={`mt-2 ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>}
    </details>
  );
}
