"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { resetDemo } from "@/lib/orchestration/actions";

export function ResetDemoButton() {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await resetDemo();
          router.push("/dashboard");
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
    >
      <RotateCcw className="h-3 w-3" /> Reset demo
    </button>
  );
}