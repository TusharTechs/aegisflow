import { getIncident, persistenceMode } from "@/lib/incidents/repository";
import { SPONSOR_META } from "@/lib/integrations/ledger";
import { ApiActivity } from "@/components/integrations/api-activity";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const CONFIG: { name: string; env: string; configured: boolean }[] = [
  { name: "SerpApi", env: "SERPAPI_API_KEY", configured: Boolean(process.env.SERPAPI_API_KEY) },
  { name: "Nutrient", env: "NUTRIENT_API_KEY", configured: Boolean(process.env.NUTRIENT_API_KEY) },
  { name: "Doctavian", env: "DOCTAVIAN_API_KEY", configured: Boolean(process.env.DOCTAVIAN_API_KEY) },
  { name: "Foxit", env: "FOXIT_ESIGN_CLIENT_ID", configured: Boolean(process.env.FOXIT_ESIGN_CLIENT_ID && process.env.FOXIT_ESIGN_CLIENT_SECRET) },
  { name: "Xano", env: "XANO_API_BASE", configured: Boolean(process.env.XANO_API_BASE) },
  { name: "Gemini", env: "GEMINI_API_KEY", configured: Boolean(process.env.GEMINI_API_KEY) },
];

export default async function IntegrationsPage() {
  const incident = await getIncident("INC-1042");
  const calls = incident?.apiActivity ?? [];

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every sponsor API is load-bearing in the workflow. This page shows what each one does, whether its key is
          configured, and the real request/response for every call made during the last incident response.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Configuration</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Service</th>
                <th className="pb-2 font-medium">Challenge</th>
                <th className="pb-2 font-medium">Env var</th>
                <th className="pb-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {SPONSOR_META.map((m) => {
                const cfg = CONFIG.find((c) => c.name === m.name);
                const configured = m.name === "Xano" ? persistenceMode() === "XANO" : cfg?.configured;
                return (
                  <tr key={m.name} className="border-b last:border-0 align-top">
                    <td className="py-3 font-medium">{m.name}</td>
                    <td className="py-3 text-muted-foreground">{m.challenge}</td>
                    <td className="py-3 font-mono text-xs text-muted-foreground">{cfg?.env}</td>
                    <td className="py-3 text-right">
                      <Badge variant={configured ? "success" : "muted"}>
                        {configured ? "LIVE — key set" : "FALLBACK — no key"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            With no keys set, the full workflow still runs end to end on honest local fallbacks — every screen stays
            usable for review. Add a key and that path switches to LIVE automatically on the next run.
          </p>
        </CardContent>
      </Card>

      <ApiActivity calls={calls} />
    </div>
  );
}
