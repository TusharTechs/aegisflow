import { AppShell } from "@/components/app-shell";
import { persistenceMode, persistenceNote } from "@/lib/incidents/repository";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell persistence={persistenceMode()} persistenceNote={persistenceNote()}>
      {children}
    </AppShell>
  );
}