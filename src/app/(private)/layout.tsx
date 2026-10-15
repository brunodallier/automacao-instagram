import { AppShell } from "@/components/app-shell";
import { requireOwner } from "@/lib/session";
import {
  executionConfigured,
  executionSettings,
} from "@/lib/instagram/execution/config";

export const dynamic = "force-dynamic";
export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, workspace } = await requireOwner();
  const settings = executionSettings();
  const executionLabel = executionConfigured(settings)
    ? settings.mode === "controlled"
      ? "Teste controlado"
      : "Execução configurada"
    : "Envios desabilitados";
  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      workspaceName={workspace.name}
      executionLabel={executionLabel}
    >
      {children}
    </AppShell>
  );
}
