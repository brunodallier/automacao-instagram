import type { PrismaClient } from "@/generated/prisma/client";
import { fetchInstagramReels, type InstagramMediaSnapshot } from "./media";
import type { InstagramCredentialProvider } from "./connection";
import type { ReelLibrary } from "./reel-types";

export function reelService(client: PrismaClient) {
  return {
    async list(workspaceId: string): Promise<ReelLibrary> {
      const [items, account] = await Promise.all([
        client.instagramReel.findMany({
          where: { socialAccount: { workspaceId, platform: "INSTAGRAM" } },
          include: { socialAccount: { select: { username: true } } },
          orderBy: [
            { publishedAt: { sort: "desc", nulls: "last" } },
            { externalId: "asc" },
          ],
        }),
        client.socialAccount.findFirst({
          where: {
            workspaceId,
            platform: "INSTAGRAM",
            reelsSyncedAt: { not: null },
          },
          orderBy: { reelsSyncedAt: "desc" },
          select: { reelsSyncedAt: true },
        }),
      ]);
      return {
        items: items.map((item) => ({
          id: item.id,
          externalId: item.externalId,
          caption: item.caption,
          publishedAt: item.publishedAt?.toISOString() ?? null,
          permalink: item.permalink,
          thumbnailUrl: item.thumbnailUrl,
          username: item.socialAccount.username,
        })),
        lastSyncedAt: account?.reelsSyncedAt?.toISOString() ?? null,
      };
    },
    async sync(
      workspaceId: string,
      provider: InstagramCredentialProvider,
      fetcher: typeof fetch = fetch,
    ) {
      // Complete every page before any write. Failures cannot replace the catalogue.
      const snapshot = await fetchInstagramReels(provider, fetcher);
      return this.apply(workspaceId, snapshot);
    },
    async apply(workspaceId: string, snapshot: InstagramMediaSnapshot) {
      const syncedAt = new Date();
      const saved = await client.$transaction(
        async (tx) => {
          // Serialize concurrent writes for this account; stable upserts preserve IDs/associations.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId + ":instagram:" + snapshot.account.id}, 0))`;
          const account = await tx.socialAccount.upsert({
            where: {
              workspaceId_platform_externalId: {
                workspaceId,
                platform: "INSTAGRAM",
                externalId: snapshot.account.id,
              },
            },
            create: {
              workspaceId,
              platform: "INSTAGRAM",
              externalId: snapshot.account.id,
              username: snapshot.account.username,
              status: "CONNECTED",
              reelsSyncedAt: syncedAt,
            },
            update: {
              username: snapshot.account.username,
              status: "CONNECTED",
              reelsSyncedAt: syncedAt,
            },
          });
          for (const reel of snapshot.reels) {
            const storedReel = await tx.instagramReel.upsert({
              where: {
                socialAccountId_externalId: {
                  socialAccountId: account.id,
                  externalId: reel.externalId,
                },
              },
              create: { ...reel, socialAccountId: account.id, syncedAt },
              update: { ...reel, syncedAt },
            });
            // Attach matching legacy links without recreating them or changing their snapshots.
            await tx.automationReel.updateMany({
              where: {
                instagramReelId: null,
                externalId: reel.externalId,
                automation: { workspaceId },
              },
              data: { instagramReelId: storedReel.id },
            });
          }
          return tx.instagramReel.count({
            where: { socialAccountId: account.id },
          });
        },
        { timeout: 60000 },
      );
      return {
        synchronized: snapshot.reels.length,
        stored: saved,
        pages: snapshot.pages,
        publications: snapshot.publications,
        unclassifiedVideos: snapshot.unclassifiedVideos,
        unavailableFields: snapshot.unavailableFields,
        syncedAt: syncedAt.toISOString(),
      };
    },
  };
}
