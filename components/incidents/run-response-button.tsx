"use client";

import { useTransition } from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runResponse } from "@/lib/orchestration/actions";

export function RunResponseButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="lg" disabled={pending} onClick={() => start(() => runResponse(id))}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
      {pending ? "Investigating…" : "Run Response"}
    </Button>
  );
}