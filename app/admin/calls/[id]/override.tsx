"use client";
import { useActionState, useEffect, useState } from "react";
import { clearOverrideAction, overrideAction } from "../../actions";
import { DECISION_LABEL, type Decision, type Override } from "@/lib/types";

export function OverrideForm({ callId, current, override }: { callId: string; current: Decision; override: Override | null | undefined }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(overrideAction, {});
  useEffect(() => { if (state.ok) setOpen(false); }, [state]);

  if (override && !open) {
    return (
      <div className="rounded-xl border border-line bg-surface-2/60 p-3 text-sm">
        <p><b>Overridden</b> to {DECISION_LABEL[override.decision]} by {override.by}</p>
        <p className="mt-1 text-ink-2">“{override.reason}”</p>
        <div className="mt-2 flex gap-3 text-xs">
          <button type="button" onClick={() => setOpen(true)} className="text-accent-ink underline">Change</button>
          <button type="button" onClick={() => clearOverrideAction(callId)} className="text-muted underline">Revert to grader&apos;s decision</button>
        </div>
      </div>
    );
  }
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="focus-ring rounded-full border border-line px-4 py-2 text-sm hover:border-line-strong">Disagree? Override the decision</button>;
  }
  return (
    <form action={action} className="space-y-3 rounded-xl border border-line p-3">
      <input type="hidden" name="callId" value={callId} />
      <label className="block text-sm">
        <span className="mb-1 block text-ink-2">New decision</span>
        <select name="decision" defaultValue={override?.decision ?? current} className="focus-ring h-9 w-full rounded-lg border border-line bg-surface px-2">
          {(Object.keys(DECISION_LABEL) as Decision[]).map((d) => <option key={d} value={d}>{DECISION_LABEL[d]}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-ink-2">Why? <span className="text-muted">(logged — this trains the next prompt version)</span></span>
        <textarea name="reason" required minLength={5} rows={3} defaultValue={override?.reason} className="focus-ring w-full rounded-lg border border-line bg-surface p-2" placeholder="e.g. Kharadi is adjoining Viman Nagar — we serve it." />
      </label>
      {state.error && <p className="text-sm text-bad">{state.error}</p>}
      <div className="flex gap-2">
        <button disabled={pending} className="focus-ring rounded-full bg-ink px-4 py-2 text-sm font-medium text-surface disabled:opacity-60">{pending ? "Saving…" : "Save override"}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full px-3 py-2 text-sm text-muted">Cancel</button>
      </div>
    </form>
  );
}
