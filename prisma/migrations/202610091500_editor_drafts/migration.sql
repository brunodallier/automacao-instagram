-- Preserve all existing names. Only new unnamed drafts use this flag.
ALTER TABLE "Automation" ADD COLUMN "nameIsProvisional" BOOLEAN NOT NULL DEFAULT false;
