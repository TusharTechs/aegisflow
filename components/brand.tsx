import { cn } from "@/lib/utils";

/** The AegisFlow mark — a shield (aegis) with investigation streams flowing to a
 *  checkmark that only a human completes. */
export function AegisMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={cn("h-6 w-6", className)} fill="none" aria-hidden>
      <defs>
        <linearGradient id="aegis-mark" x1="26" y1="14" x2="70" y2="88" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B82F6" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
        <clipPath id="aegis-clip">
          <path d="M21 25C21 21.69 23.69 19 27 19H69C72.31 19 75 21.69 75 25V47.5C75 66.4 61.9 80.1 49.3 86.6C48.48 87.02 47.52 87.02 46.7 86.6C34.1 80.1 21 66.4 21 47.5V25Z" />
        </clipPath>
      </defs>
      <path
        d="M21 25C21 21.69 23.69 19 27 19H69C72.31 19 75 21.69 75 25V47.5C75 66.4 61.9 80.1 49.3 86.6C48.48 87.02 47.52 87.02 46.7 86.6C34.1 80.1 21 66.4 21 47.5V25Z"
        fill="url(#aegis-mark)"
      />
      <g clipPath="url(#aegis-clip)" strokeLinecap="round">
        <path d="M12 41H40" stroke="#93C5FD" strokeWidth="3.4" />
        <path d="M12 50H40" stroke="#BFDBFE" strokeWidth="3.4" opacity="0.9" />
        <path d="M12 59H40" stroke="#DBEAFE" strokeWidth="3.4" opacity="0.72" />
      </g>
      <path d="M38.5 50L45.5 58L61 39" stroke="#fff" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AegisWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <AegisMark className="h-6 w-6" />
      <span className="font-semibold tracking-tight">
        Aegis<span className="text-primary">Flow</span>
      </span>
    </span>
  );
}
