"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function TranscriptSearch() {
  const sp = useSearchParams();
  const path = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <input type="search" defaultValue={sp.get("q") ?? ""} placeholder="Search every transcript…" aria-label="Search transcripts"
      onChange={(e) => {
        const n = new URLSearchParams(sp.toString());
        e.target.value ? n.set("q", e.target.value) : n.delete("q");
        n.delete("id");
        start(() => router.replace(`${path}?${n.toString()}`, { scroll: false }));
      }}
      className={`focus-ring h-9 w-full rounded-full border border-line bg-surface px-4 text-sm sm:w-72 ${pending ? "opacity-60" : ""}`} />
  );
}
