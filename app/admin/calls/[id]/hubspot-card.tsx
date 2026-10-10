"use client";
import { useState, useTransition } from "react";
import { pushHubspotAction } from "../../actions";

export function PushButton({ callId, label }: { callId: string; label: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      {msg && <span className="text-xs text-ink-2">{msg}</span>}
      <button type="button" disabled={pending} onClick={() => start(async () => setMsg((await pushHubspotAction(callId)).message))}
        className="focus-ring rounded-full border border-line px-3 py-1.5 text-sm hover:border-ink disabled:opacity-60">{pending ? "Pushing…" : label}</button>
    </span>
  );
}
