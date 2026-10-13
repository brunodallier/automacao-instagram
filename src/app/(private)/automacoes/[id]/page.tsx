import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutomationEditor } from "@/components/automation-editor";
import { requireOwner } from "@/lib/session";
import { automationService } from "@/lib/automations";
import { tagService } from "@/lib/tags";
import { db } from "@/lib/db";
import { reelService } from "@/lib/instagram/reels";

export const metadata: Metadata = { title: "Editar automação" };

export default async function EditAutomationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { workspace } = await requireOwner();
  const { id } = await params;
  const [automation, tags, reels] = await Promise.all([
    automationService(db)
      .get(workspace.id, id)
      .catch(() => null),
    tagService(db).list(workspace.id),
    reelService(db).list(workspace.id),
  ]);
  if (!automation) notFound();
  return (
    <AutomationEditor
      automation={automation}
      reels={reels.items}
      tags={tags.map((tag) => ({ id: tag.id, name: tag.name }))}
    />
  );
}
