import Link from "next/link";
import { redirect } from "next/navigation";
import { getSettings, listRecords, mode, now, requireAdmin } from "@/lib/data/repo";
import { computeMetrics, periodRange } from "@/lib/metrics";
import { signOut } from "../login/actions";
import { Nav } from "./nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdmin();
  } catch {
    redirect("/login");
  }
  const [records, settings] = await Promise.all([listRecords(), getSettings()]);
  const t = now();
  const m = computeMetrics(records, settings, periodRange("all", t), t);
  const needsYou = m.openEscalations.length + m.unacked.length;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="no-print border-b border-line bg-surface lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-5 py-4 lg:py-6">
          <span className="grid size-9 grid-cols-3 grid-rows-3 gap-[2px] rounded-lg bg-accent p-[5px]" aria-hidden>
            {Array.from({ length: 9 }).map((_, i) => <span key={i} className={`rounded-[2px] ${i === 4 ? "bg-transparent" : "bg-white/85"}`} />)}
          </span>
          <div>
            <p className="font-display text-[17px] leading-none">Aangan</p>
            <p className="mt-1 text-[11px] text-muted">Enquiry desk</p>
          </div>
        </div>
        <Nav needsYou={needsYou} />
        <div className="hidden px-5 pb-6 text-xs text-muted lg:absolute lg:bottom-0 lg:block">
          <p>Phone calls only · 24×7</p>
          <p className="mt-1">Rubric: {settings.rubric_version}</p>
          {mode() === "live" && <form action={signOut} className="mt-2"><button className="underline hover:text-ink">Sign out</button></form>}
        </div>
      </aside>
      <div className="min-w-0">
        {mode() === "demo" && (
          <div className="no-print border-b border-line bg-accent-soft px-4 py-2 text-center text-xs text-accent-ink sm:px-8">
            <b>Demo mode</b> — September 2026&apos;s 20 phone transcripts replayed through the grader (golden labels, synthetic phone numbers).
            Clock is set to 26 Sep, 6 pm. Set DATABASE_URL (Neon) to go live — see <Link href="/admin/why#setup" className="underline">setup</Link>.
          </div>
        )}
        <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
