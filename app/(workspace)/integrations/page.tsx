import { getIncident, persistenceMode } from "@/lib/incidents/repository";
import { SPONSOR_META } from "@/lib/integrations/ledger";
import { ApiActivity } from "@/components/integrations/api-activity";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/** A blank or whitespace-only env var is a placeholder, not a credential. */
const isSet = (v?: string) => Boolean(v && v.trim());

const CONFIG: { name: string; env: string; configured: boolean }[] = [
  { name: "SerpApi", env: "SERPAPI_API_KEY", configured: isSet(process.env.SERPAPI_API_KEY) },
  { name: "Nutrient", env: "NUTRIENT_API_KEY", configured: isSet(process.env.NUTRIENT_API_KEY) },
  {
    name: "Doctavian",
    env: "DOCTAVIAN_API_KEY + _ACCESS_TOKEN + _TEMPLATE_URN",
    // All three are required: the gateway enforces X-Api-Key AND an OAuth bearer,
    // and generation renders against an uploaded template addressed by URN.
    configured:
      isSet(process.env.DOCTAVIAN_API_KEY) &&
      isSet(process.env.DOCTAVIAN_ACCESS_TOKEN) &&
      isSet(process.env.DOCTAVIAN_TEMPLATE_URN),
  },
  { name: "Foxit", env: "FOXIT_CLIENT_ID", configured: isSet(process.env.FOXIT_CLIENT_ID) && isSet(process.env.FOXIT_CLIENT_SECRET) },
  { name: "name.com", env: "NAMECOM_API_TOKEN", configured: isSet(process.env.NAMECOM_USERNAME) && isSet(process.env.NAMECOM_API_TOKEN) },
  { name: "Xano", env: "XANO_API_BASE", configured: isSet(process.env.XANO_API_BASE) },
  { name: "Gemini", env: "GEMINI_API_KEY", configured: isSet(process.env.GEMINI_API_KEY) },
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
                const xanoDegraded = m.name === "Xano" && Boolean(process.env.XANO_API_BASE) && persistenceMode() !== "XANO";
                const configured = m.name === "Xano" ? persistenceMode() === "XANO" : cfg?.configured;
                return (
                  <tr key={m.name} className="border-b last:border-0 align-top">
                    <td className="py-3 font-medium">{m.name}</td>
                    <td className="py-3 text-muted-foreground">{m.challenge}</td>
                    <td className="py-3 font-mono text-xs text-muted-foreground">{cfg?.env}</td>
                    <td className="py-3 text-right">
                      <Badge variant={configured ? "success" : xanoDegraded ? "warning" : "muted"}>
                        {configured
                          ? "CONFIGURED"
                          : xanoDegraded
                            ? "CONFIGURED — fell back this run"
                            : "NOT CONFIGURED"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">CONFIGURED means a key is present, not that the call
            succeeded.</span>{" "}
            Whether an API actually answered is decided by the run, and the ledger below is the record — each entry is
            tagged LIVE, LOCAL or DEMO SEEDED by what really happened. With no keys at all the full workflow still runs
            end to end on honest fallbacks and every screen stays usable.
          </p>
        </CardContent>
      </Card>

      <ApiActivity calls={calls} />
    </div>
  );
}
