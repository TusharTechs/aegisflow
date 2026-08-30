import { AppShell } from "@/components/app-shell";
import { persistenceMode } from "@/lib/incidents/repository";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <AppShell persistence={persistenceMode()}>{children}</AppShell>;
}