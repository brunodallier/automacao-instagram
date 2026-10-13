import type { Metadata } from "next";
import { AutomationEditor } from "@/components/automation-editor";
import { requireOwner } from "@/lib/session";
import { tagService } from "@/lib/tags";
import { db } from "@/lib/db";
import { reelService } from "@/lib/instagram/reels";

export const metadata: Metadata = { title: "Nova automação" };

export default async function NewAutomationPage() {
  const { workspace } = await requireOwner();
  const [tags, reels] = await Promise.all([
    tagService(db).list(workspace.id),
    reelService(db).list(workspace.id),
  ]);
  return (
    <AutomationEditor
      reels={reels.items}
      tags={tags.map((tag) => ({ id: tag.id, name: tag.name }))}
    />
  );
}
