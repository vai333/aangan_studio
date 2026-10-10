"use client";
import { useState, useTransition } from "react";
import { hubspotBackfillAction, hubspotTestAction } from "../actions";
import type { PipelineInfo } from "@/lib/hubspot/client";
import type { Settings } from "@/lib/types";

const input = "focus-ring h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-sm";

export function HubspotPanel({ connected, hubspot, onChange }: { connected: boolean; hubspot: Settings["hubspot"]; onChange: (h: Settings["hubspot"]) => void }) {
  const [res, setRes] = useState<{ ok: boolean; portalId?: string; pipelines?: PipelineInfo[]; error?: string } | null>(null);
  const [bf, setBf] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof Settings["hubspot"], v: string | boolean) => onChange({ ...hubspot, [k]: v });
  const pipeline = res?.pipelines?.find((p) => p.id === hubspot.pipeline_id);

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Status:{" "}
        {connected ? <b className="text-good">token configured</b> : <b className="text-warn">not connected — set HUBSPOT_ACCESS_TOKEN</b>}
        {" · "}
        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={hubspot.enabled} onChange={(e) => set("enabled", e.target.checked)} /> push calls to HubSpot</label>
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm"><span className="mb-1 block text-ink-2">Deal pipeline ID</span><input value={hubspot.pipeline_id} onChange={(e) => set("pipeline_id", e.target.value.trim())} className={input} /></label>
        <label className="block text-sm"><span className="mb-1 block text-ink-2">Stage: new qualified lead</span><input value={hubspot.stage_new} onChange={(e) => set("stage_new", e.target.value.trim())} className={input} /></label>
        <label className="block text-sm"><span className="mb-1 block text-ink-2">Stage: nurture (later start)</span><input value={hubspot.stage_nurture} onChange={(e) => set("stage_nurture", e.target.value.trim())} className={input} /></label>
        <label className="block text-sm"><span className="mb-1 block text-ink-2">Stage: closed / lost</span><input value={hubspot.stage_lost} onChange={(e) => set("stage_lost", e.target.value.trim())} className={input} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={() => start(async () => setRes(await hubspotTestAction()))} className="focus-ring rounded-full border border-line px-4 py-2 text-sm hover:border-ink disabled:opacity-60">{pending ? "Checking…" : "Test connection & list stages"}</button>
        <button type="button" disabled={pending || !connected} onClick={() => start(async () => { const r = await hubspotBackfillAction(); setBf(r.error ?? `Pushed ${r.pushed}, ${r.failed} failed, ${r.remaining} still waiting.`); })} className="focus-ring rounded-full border border-line px-4 py-2 text-sm hover:border-ink disabled:opacity-60">Push existing calls</button>
        {bf && <span className="text-sm text-ink-2">{bf}</span>}
      </div>
      {res && (
        <div className={`rounded-xl border p-3 text-sm ${res.ok ? "border-line" : "border-bad"}`}>
          {res.error && <p className="text-bad">{res.error}</p>}
          {res.ok && <p className="text-good">Connected{res.portalId ? ` to portal ${res.portalId}` : ""}.</p>}
          {res.pipelines?.map((p) => (
            <div key={p.id} className="mt-2">
              <p className="font-medium">{p.label} <code className="rounded bg-surface-2 px-1 text-xs">{p.id}</code></p>
              <p className="text-ink-2">{p.stages.map((s) => `${s.label} (${s.id})`).join(" → ")}</p>
            </div>
          ))}
          {res.pipelines && !pipeline && <p className="mt-2 text-warn">The pipeline ID above isn&apos;t one of these — copy an ID from the list.</p>}
          {pipeline && ![hubspot.stage_new, hubspot.stage_nurture, hubspot.stage_lost].every((s) => pipeline.stages.some((x) => x.id === s)) && <p className="mt-2 text-warn">One of the stage IDs above isn&apos;t in &ldquo;{pipeline.label}&rdquo;.</p>}
        </div>
      )}
    </div>
  );
}
