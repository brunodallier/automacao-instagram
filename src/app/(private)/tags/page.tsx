import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { TagManager } from "@/components/tag-manager";
import { requireOwner } from "@/lib/session";
import { tagService } from "@/lib/tags";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Tags" };
export default async function TagsPage() {
  const { workspace } = await requireOwner();
  const tags = await tagService(db).list(workspace.id);
  return (
    <>
      <PageHeading
        eyebrow="ORGANIZAÇÃO"
        title="Tags"
        description="Pequenos marcadores. Uma forma simples de organizar suas futuras conversas."
      />
      <TagManager
        initialTags={tags.map(({ id, name, createdAt }) => ({
          id,
          name,
          createdAt: createdAt.toISOString(),
        }))}
      />
    </>
  );
}
