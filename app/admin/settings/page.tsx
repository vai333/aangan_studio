import { getSettings } from "@/lib/data/repo";
import { hubspotConfigured } from "@/lib/hubspot/client";
import { SettingsForm } from "./form";

export default async function SettingsPage() {
  const s = await getSettings();
  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow mb-1">Settings</p>
        <h1 className="font-display text-3xl">How the desk decides</h1>
        <p className="mt-1.5 max-w-2xl text-ink-2">The rubric itself lives in qualified.md and isn&apos;t editable here — these are the dials around it.</p>
      </header>
      <SettingsForm initial={s} hubspotConnected={hubspotConfigured()} />
    </div>
  );
}
