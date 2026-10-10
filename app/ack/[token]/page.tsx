import { getHandoffForAck } from "@/lib/data/repo";
import { verifyAck } from "@/lib/tokens";
import { ackAction } from "./actions";

export const dynamic = "force-dynamic";

// The email link lands here. Acknowledging needs a click (POST), so email
// security scanners that prefetch links can't mark a lead as picked up.
export default async function Ack({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const { done } = await searchParams;
  const id = verifyAck(token);
  const h = id ? await getHandoffForAck(id) : null;

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="card w-full max-w-md p-7 text-center">
        <p className="eyebrow mb-2">Aangan enquiry desk</p>
        {!h ? (
          <h1 className="font-display text-2xl">This link isn&apos;t valid</h1>
        ) : h.acknowledged_at || done ? (
          <>
            <h1 className="font-display text-2xl">Thanks, {h.designer_name.split(" ")[0]} — it&apos;s yours.</h1>
            <p className="mt-2 text-sm text-ink-2">The lead is marked as picked up. Call within the hour — it converts four times better.</p>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl">Pick up this lead?</h1>
            <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 font-mono text-[13px]">{h.subject}</p>
            <form action={ackAction.bind(null, token)} className="mt-5">
              <button className="focus-ring w-full rounded-full bg-accent px-5 py-3 font-medium text-white">I&apos;ve got this</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
