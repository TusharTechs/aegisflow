"use client";

import { useEffect, useState, useTransition } from "react";
import { Bug } from "lucide-react";
import { getDemoControlsState, setDemoFlagAction } from "@/lib/orchestration/actions";
import type { DemoFlags } from "@/lib/orchestration/demo-controls";

const LABELS: Record<keyof DemoFlags, string> = {
  serpapi: "Fail SerpApi",
  nutrient: "Fail Nutrient",
  doctavian: "Fail Doctavian",
  foxit: "Fail Foxit",
  namecom: "Fail name.com",
  gemini: "Disable Gemini",
};

export function DemoControls() {
  const [flags, setFlags] = useState<DemoFlags | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    getDemoControlsState().then(setFlags);
  }, []);

  const toggle = (key: keyof DemoFlags, value: boolean) => {
    setFlags((f) => (f ? { ...f, [key]: value } : f));
    start(() => setDemoFlagAction(key, value));
  };

  if (!flags) return null;
  const anyOn = Object.values(flags).some(Boolean);

  return (
    <details className="relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
        <Bug className="h-3 w-3" /> Demo controls
        {anyOn && <span className="h-1.5 w-1.5 rounded-full bg-destructive" />}
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-52 space-y-2 rounded-md border bg-card p-3 shadow-lg">
        <p className="text-xs font-medium">Failure injection</p>
        {(Object.keys(LABELS) as (keyof DemoFlags)[]).map((k) => (
          <label key={k} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            {LABELS[k]}
            <input
              type="checkbox"
              checked={flags[k]}
              disabled={pending}
              onChange={(e) => toggle(k, e.target.checked)}
              className="h-3.5 w-3.5"
            />
          </label>
        ))}
        <p className="text-[10px] text-muted-foreground">
          Injected failures exercise the same graceful fallbacks as real outages.
        </p>
      </div>
    </details>
  );
}