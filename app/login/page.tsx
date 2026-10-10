import { redirect } from "next/navigation";
import { mode } from "@/lib/data/repo";
import { signIn } from "./actions";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (mode() === "demo") redirect("/admin");
  const sp = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <form action={signIn} className="card w-full max-w-sm space-y-4 p-7">
        <div>
          <p className="eyebrow mb-1">Aangan enquiry desk</p>
          <h1 className="font-display text-2xl">Sign in</h1>
          <p className="mt-1 text-sm text-ink-2">Admins only.</p>
        </div>
        <input name="email" type="email" required autoComplete="username" placeholder="you@aangan.studio" className="focus-ring h-10 w-full rounded-lg border border-line bg-surface px-3" />
        <input name="password" type="password" required autoComplete="current-password" placeholder="Password" className="focus-ring h-10 w-full rounded-lg border border-line bg-surface px-3" />
        <button className="focus-ring w-full rounded-full bg-ink py-2.5 font-medium text-surface">Sign in</button>
        {sp.error && <p className="text-sm text-bad">{sp.error}</p>}
      </form>
    </main>
  );
}
