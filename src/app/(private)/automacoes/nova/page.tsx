import type { Metadata } from "next";
import { AutomationEditor } from "@/components/automation-editor";
import { requireOwner } from "@/lib/session";
import { tagService } from "@/lib/tags";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Nova automação" };

export default async function NewAutomationPage() {
  const { workspace } = await requireOwner();
  const tags = await tagService(db).list(workspace.id);
  return (
    <AutomationEditor
      tags={tags.map((tag) => ({ id: tag.id, name: tag.name }))}
    />
  );
}
