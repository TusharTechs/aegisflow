"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ApiCall } from "@/schemas/core";
import { SPONSOR_META, groupBySponsor, type SponsorName } from "@/lib/integrations/ledger";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const modeVariant = (mode: ApiCall["mode"]) =>
  mode === "LIVE" ? "success" : mode === "DEMO SEEDED" ? "warning" : "muted";

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-md bg-muted/60 p-3 text-[11px] leading-relaxed text-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function CallRow({ call }: { call: ApiCall }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-90")} />
        <span className="font-mono font-medium">{call.method}</span>
        <span className="flex-1 truncate font-mono text-muted-foreground">{call.endpoint}</span>
        <Badge variant={modeVariant(call.mode)}>{call.mode}</Badge>
        <span className="tabular-nums text-muted-foreground">{call.ms}ms</span>
      </button>
      {open && (
        <div className="space-y-3 border-t px-3 py-3">
          <p className="text-xs font-medium">{call.operation}</p>
          {call.note && <p className="text-xs text-muted-foreground">{call.note}</p>}
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Request</p>
            <Json value={call.request} />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Response</p>
            <Json value={call.response} />
          </div>
        </div>
      )}
    </div>
  );
}

export function ApiActivity({ calls }: { calls: ApiCall[] }) {
  if (calls.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Integration Activity Ledger</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Run the incident response to populate the ledger. Every sponsor API call — live, local fallback, or seeded —
            is recorded here with its real request and response.
          </p>
        </CardContent>
      </Card>
    );
  }

  const grouped = groupBySponsor(calls);
  const live = calls.filter((c) => c.mode === "LIVE").length;
  const order = SPONSOR_META.map((m) => m.name).filter((n) => grouped[n]?.length) as SponsorName[];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Integration Activity Ledger</CardTitle>
        <span className="text-xs text-muted-foreground">
          {calls.length} calls · <span className="font-medium text-success">{live} live</span> · {calls.length - live} fallback/seeded
        </span>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-xs text-muted-foreground">
          One row per real API touchpoint. <span className="font-medium text-foreground">LIVE</span> = the sponsor API
          responded. <span className="font-medium text-foreground">LOCAL</span> / <span className="font-medium text-foreground">DEMO SEEDED</span> =
          honest fallback with the exact request we would have sent. Nothing here is fabricated.
        </p>
        {order.map((name) => {
          const meta = SPONSOR_META.find((m) => m.name === name)!;
          const sponsorCalls = grouped[name];
          const sponsorLive = sponsorCalls.filter((c) => c.mode === "LIVE").length;
          return (
            <div key={name} className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <span className="text-sm font-semibold">{name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{meta.challenge}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {sponsorCalls.length} call{sponsorCalls.length !== 1 && "s"}
                  {sponsorLive > 0 && <span className="text-success"> · {sponsorLive} live</span>}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{meta.role}</p>
              <div className="space-y-1.5">
                {sponsorCalls.map((c) => (
                  <CallRow key={c.id} call={c} />
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function ApiActivitySummary({ calls }: { calls: ApiCall[] }) {
  if (calls.length === 0) return null;
  const grouped = groupBySponsor(calls);
  const order = SPONSOR_META.map((m) => m.name).filter((n) => grouped[n]?.length) as SponsorName[];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Sponsor APIs used this run</CardTitle>
        <a href="/integrations" className="text-xs font-medium text-primary hover:underline">
          Open full ledger →
        </a>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {order.map((name) => {
            const sc = grouped[name];
            const live = sc.filter((c) => c.mode === "LIVE").length;
            return (
              <li key={name} className="flex items-center justify-between gap-3">
                <span className="font-medium">{name}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {sc.length} call{sc.length !== 1 && "s"}
                  <Badge variant={live > 0 ? "success" : "muted"}>{live > 0 ? `${live} LIVE` : "FALLBACK"}</Badge>
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
