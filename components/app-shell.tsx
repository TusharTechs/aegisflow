"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShieldCheck, LayoutDashboard, AlertTriangle, Factory,
  Network, FileText, UserCheck, ScrollText, Plug, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ResetDemoButton } from "@/components/reset-demo-button";
import { DemoControls } from "@/components/demo-controls";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/incidents/INC-1042", label: "Incidents", icon: AlertTriangle },
  { href: "/suppliers", label: "Suppliers", icon: Factory },
  { href: "/evidence", label: "Evidence", icon: Network },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/approvals", label: "Approvals", icon: UserCheck },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/audit", label: "Audit Log", icon: ScrollText },
  { href: "/business", label: "Business case", icon: Building2 },
];

export function AppShell({ children, persistence }: { children: React.ReactNode; persistence?: "XANO" | "LOCAL" }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r bg-card">
        <div className="flex h-14 items-center gap-2 border-b px-5">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-semibold tracking-tight">AegisFlow</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const active =
              item.label === "Incidents"
                ? pathname.startsWith("/incidents")
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  active && "bg-accent text-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-4 text-xs text-muted-foreground">
          AI prepares. <span className="font-medium text-foreground">Humans authorize.</span>
          <div className="mt-1">
            Persistence: <span className="font-medium text-foreground">{persistence ?? "LOCAL"}</span>
          </div>
        </div>
      </aside>

      <div className="pl-60">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-card/80 px-8 backdrop-blur">
          <span className="text-sm text-muted-foreground">Meridian Manufacturing Co.</span>
          <div className="flex items-center gap-2">
            <DemoControls />
            <ResetDemoButton />
            <Badge variant="warning">DEMO MODE</Badge>
          </div>
        </header>
        <main className="p-8">{children}</main>
      </div>
    </div>
  );
}