export type ReelOption = {
  id: string;
  externalId: string;
  caption: string | null;
  publishedAt: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  username: string | null;
};
export type ReelLibrary = { items: ReelOption[]; lastSyncedAt: string | null };
