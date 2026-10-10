import { TryForm } from "./form";

export default function TryPage() {
  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow mb-1">Try the grader</p>
        <h1 className="font-display text-3xl">Paste any enquiry, see how it&apos;s judged</h1>
        <p className="mt-1.5 max-w-2xl text-ink-2">Gemini reads the conversation against qualified.md and services.md and quotes its evidence. Then the rules in code make the call.</p>
      </header>
      <TryForm enabled={!!process.env.GEMINI_API_KEY} />
    </div>
  );
}
