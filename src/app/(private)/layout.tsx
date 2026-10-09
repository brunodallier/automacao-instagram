import { AppShell } from "@/components/app-shell";
import { requireOwner } from "@/lib/session";

export const dynamic = "force-dynamic";
export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, workspace } = await requireOwner();
  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      workspaceName={workspace.name}
    >
      {children}
    </AppShell>
  );
}
