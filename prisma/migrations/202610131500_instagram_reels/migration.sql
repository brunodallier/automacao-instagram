ALTER TABLE "SocialAccount" ADD COLUMN "reelsSyncedAt" TIMESTAMPTZ(3);
ALTER TABLE "AutomationReel" ADD COLUMN "instagramReelId" TEXT;

CREATE TABLE "InstagramReel" (
  "id" TEXT NOT NULL,
  "socialAccountId" TEXT NOT NULL,
  "externalId" VARCHAR(120) NOT NULL,
  "caption" TEXT,
  "publishedAt" TIMESTAMPTZ(3),
  "permalink" TEXT,
  "thumbnailUrl" TEXT,
  "mediaType" VARCHAR(30) NOT NULL,
  "mediaProductType" VARCHAR(30),
  "classification" VARCHAR(30) NOT NULL,
  "syncedAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "InstagramReel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InstagramReel_socialAccountId_externalId_key" ON "InstagramReel"("socialAccountId", "externalId");
CREATE INDEX "InstagramReel_socialAccountId_publishedAt_idx" ON "InstagramReel"("socialAccountId", "publishedAt");
CREATE INDEX "AutomationReel_instagramReelId_idx" ON "AutomationReel"("instagramReelId");
ALTER TABLE "InstagramReel" ADD CONSTRAINT "InstagramReel_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomationReel" ADD CONSTRAINT "AutomationReel_instagramReelId_fkey" FOREIGN KEY ("instagramReelId") REFERENCES "InstagramReel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
