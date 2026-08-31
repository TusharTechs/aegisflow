import Link from "next/link";
import { ArrowRight, FileSearch, SearchCheck, ShieldCheck, UserCheck } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <header className="flex h-14 items-center justify-between border-b px-8">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-semibold tracking-tight">AegisFlow</span>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">
          Open Dashboard
        </Link>
      </header>

      <section className="mx-auto max-w-3xl space-y-6 px-6 pb-16 pt-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-foreground">
          Your supplier failed.
          <br />
          Your response shouldn&apos;t.
        </h1>
        <p className="text-xl leading-relaxed text-muted-foreground">
          AegisFlow investigates disruptions, verifies alternatives, and prepares an evidence-backed response in minutes.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Link
            href="/incidents/INC-1042"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Open Incident <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#how"
            className="inline-flex h-10 items-center rounded-md border border-border px-6 text-sm font-medium hover:bg-accent"
          >
            See how it works
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-16">
        <p className="text-center text-xs uppercase tracking-wide text-muted-foreground">Built on</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {["SerpApi", "Nutrient", "Doctavian", "Foxit", "Xano", "Gemini API", "Next.js", "Zod"].map((n) => (
            <span key={n} className="rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
              {n}
            </span>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto grid max-w-5xl gap-4 px-6 pb-24 md:grid-cols-3">
        {[
          { icon: SearchCheck, title: "Investigate", body: "Supplier documents and live web intelligence are collected into one case file in minutes." },
          { icon: FileSearch, title: "Verify", body: "Every claim gets evidence, provenance, and a verification status. Conflicts are surfaced, never hidden." },
          { icon: UserCheck, title: "Decide", body: "AI prepares the recommendation and the agreement. Authorized humans approve and sign. Always." },
        ].map((f) => (
          <div key={f.title} className="rounded-lg border bg-card p-6 text-left">
            <f.icon className="h-5 w-5 text-primary" />
            <h2 className="mt-3 font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        AI prepares. Humans authorize irreversible actions.
      </footer>
    </main>
  );
}