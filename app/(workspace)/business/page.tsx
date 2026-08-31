import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Business case — AegisFlow" };

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default function BusinessPage() {
  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Business case</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Why AegisFlow is a company, not a feature — for the Feasibility criterion.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat value="$2.4M" label="Revenue exposure in the demo incident alone" />
        <Stat value="4–6 hrs" label="Manual investigation time per critical disruption, compressed to minutes" />
        <Stat value="$184B" label="Est. annual cost of supply-chain disruptions to large enterprises" />
        <Stat value="1 seat" label="Wedge: the supply-chain risk analyst who lives in a spreadsheet" />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">The problem, precisely</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          When a single-source supplier of a critical component fails, a cross-functional scramble begins: procurement,
          operations, quality, and legal pull fragmented facts from contracts, certificates, supplier sites, news, and
          internal systems, then try to verify claims and pick an alternative under revenue pressure. The work is done
          in a shared spreadsheet and a Slack channel. The failure modes are slow decisions, missed contradictions, and
          commitments made on unverified supplier claims.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Who buys it</h2>
        <div className="space-y-2 text-sm">
          <p><span className="font-medium">Buyer:</span> Head / Director of Supply Chain Risk, or VP Operations, at a manufacturer with single-source critical components — electronics, medical devices, aerospace, industrial equipment.</p>
          <p><span className="font-medium">Champion:</span> the supply-chain risk analyst who currently maintains the disruption &quot;war-room&quot; spreadsheet by hand.</p>
          <p><span className="font-medium">Trigger:</span> a board-level mandate for supply-chain resilience after a real disruption (near-universal since 2021).</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Wedge and expansion</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Land with the incident-response workflow for one commodity family (the spreadsheet replacement). Expand to
          continuous supplier monitoring, multi-tier mapping, and pre-cleared alternate-supplier playbooks. The
          provenance layer — every claim carries its source and verification status — becomes the audit record
          procurement already needs for compliance.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pricing</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Tier</th>
                <th className="pb-2 font-medium">Price</th>
                <th className="pb-2 font-medium">For</th>
              </tr>
            </thead>
            <tbody className="[&>tr]:border-b [&>tr:last-child]:border-0">
              <tr><td className="py-2 font-medium">Team</td><td className="py-2">$1.5–3k / mo + per-incident usage</td><td className="py-2 text-muted-foreground">One risk team, shared backend</td></tr>
              <tr><td className="py-2 font-medium">Enterprise</td><td className="py-2">$60–150k / yr</td><td className="py-2 text-muted-foreground">Private backend (Xano), SSO, custom risk model, multi-site</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The math the buyer runs: one prevented 8-day stockout on a $2.4M line pays for the platform for years. The
          subscription is a rounding error against a single missed disruption.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Competitive landscape</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p><span className="font-medium text-foreground">Risk-monitoring platforms</span> (Everstream, Interos, Resilinc) tell you a disruption happened. They don&apos;t run the verified investigate → decide → document → sign response. AegisFlow starts where they stop.</p>
          <p><span className="font-medium text-foreground">Procurement suites</span> (SAP Ariba, Coupa) manage POs and approved vendors. They have no evidence-provenance model and no rapid-response workflow for a supplier that just failed.</p>
          <p><span className="font-medium text-foreground">Generic AI agents</span> promise autonomous procurement. Buyers in regulated manufacturing will not let an agent commit spend. AegisFlow&apos;s &quot;AI prepares, human authorizes&quot; posture is the wedge, not a limitation.</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Why now</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Two curves crossed: supply-chain resilience became a board priority, and LLMs got good enough to read a
          certificate and cross-check a registration. The missing piece is trust — which is exactly what the provenance
          layer and the human-authorization state machine provide.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">What we don&apos;t claim</h2>
        <div className="flex flex-wrap gap-2">
          {[
            "No autonomous procurement",
            "No legally guaranteed contracts",
            "No perfect verification",
            "No invented savings figures",
            "Demo suppliers are fictional and tagged",
          ].map((t) => (
            <Badge key={t} variant="muted">{t}</Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Market figures above are order-of-magnitude industry estimates for framing, not audited data.
        </p>
      </section>
    </div>
  );
}
