-- Cogent Hub restructure: one Magazine table, every record stamped with its
-- magazine, all existing data backfilled to MEPCA. Hand-written so the
-- backfill happens between "add column" and "set NOT NULL" — Prisma's
-- generated version cannot do this on populated tables.

-- CreateTable
CREATE TABLE "Magazine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Magazine_pkey" PRIMARY KEY ("id")
);

-- Seed the five Cogent Multimedia titles
INSERT INTO "Magazine" ("id", "name", "siteUrl", "sortOrder") VALUES
    ('mepca',     'MEPCA',                   'https://mepca-engineering.com',        0),
    ('hotel',     'Hotel Magazine',          'https://thehotelmagazine.co.uk',       1),
    ('bar',       'Bar Magazine',            'https://barmagazine.co.uk',            2),
    ('care-home', 'Care Home Magazine',      'https://carehomemagazine.co.uk',       3),
    ('grooming',  'Total Grooming Magazine', 'https://totalgroomingmagazine.co.uk',  4);

-- Campaign: magazineId + salesperson, fileMakerId unique becomes per-magazine
ALTER TABLE "Campaign" ADD COLUMN "magazineId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "salesperson" TEXT;
UPDATE "Campaign" SET "magazineId" = 'mepca';
ALTER TABLE "Campaign" ALTER COLUMN "magazineId" SET NOT NULL;
DROP INDEX "Campaign_fileMakerId_key";
CREATE UNIQUE INDEX "Campaign_magazineId_fileMakerId_key" ON "Campaign"("magazineId", "fileMakerId");
CREATE INDEX "Campaign_magazineId_idx" ON "Campaign"("magazineId");
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_magazineId_fkey" FOREIGN KEY ("magazineId") REFERENCES "Magazine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PipelineItem: magazineId + salesperson
ALTER TABLE "PipelineItem" ADD COLUMN "magazineId" TEXT;
ALTER TABLE "PipelineItem" ADD COLUMN "salesperson" TEXT;
UPDATE "PipelineItem" SET "magazineId" = 'mepca';
ALTER TABLE "PipelineItem" ALTER COLUMN "magazineId" SET NOT NULL;
CREATE INDEX "PipelineItem_magazineId_idx" ON "PipelineItem"("magazineId");
ALTER TABLE "PipelineItem" ADD CONSTRAINT "PipelineItem_magazineId_fkey" FOREIGN KEY ("magazineId") REFERENCES "Magazine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- IssueDeadline: issue unique becomes per-magazine
ALTER TABLE "IssueDeadline" ADD COLUMN "magazineId" TEXT;
UPDATE "IssueDeadline" SET "magazineId" = 'mepca';
ALTER TABLE "IssueDeadline" ALTER COLUMN "magazineId" SET NOT NULL;
DROP INDEX "IssueDeadline_issue_key";
CREATE UNIQUE INDEX "IssueDeadline_magazineId_issue_key" ON "IssueDeadline"("magazineId", "issue");
ALTER TABLE "IssueDeadline" ADD CONSTRAINT "IssueDeadline_magazineId_fkey" FOREIGN KEY ("magazineId") REFERENCES "Magazine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- WatchedSource
ALTER TABLE "WatchedSource" ADD COLUMN "magazineId" TEXT;
UPDATE "WatchedSource" SET "magazineId" = 'mepca';
ALTER TABLE "WatchedSource" ALTER COLUMN "magazineId" SET NOT NULL;
ALTER TABLE "WatchedSource" ADD CONSTRAINT "WatchedSource_magazineId_fkey" FOREIGN KEY ("magazineId") REFERENCES "Magazine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CompetitorAdvertiser: dedupeKey unique becomes per-magazine
ALTER TABLE "CompetitorAdvertiser" ADD COLUMN "magazineId" TEXT;
UPDATE "CompetitorAdvertiser" SET "magazineId" = 'mepca';
ALTER TABLE "CompetitorAdvertiser" ALTER COLUMN "magazineId" SET NOT NULL;
DROP INDEX "CompetitorAdvertiser_dedupeKey_key";
CREATE UNIQUE INDEX "CompetitorAdvertiser_magazineId_dedupeKey_key" ON "CompetitorAdvertiser"("magazineId", "dedupeKey");
ALTER TABLE "CompetitorAdvertiser" ADD CONSTRAINT "CompetitorAdvertiser_magazineId_fkey" FOREIGN KEY ("magazineId") REFERENCES "Magazine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MonitoredTerm: term unique becomes per-magazine
ALTER TABLE "MonitoredTerm" ADD COLUMN "magazineId" TEXT;
UPDATE "MonitoredTerm" SET "magazineId" = 'mepca';
ALTER TABLE "MonitoredTerm" ALTER COLUMN "magazineId" SET NOT NULL;
DROP INDEX "MonitoredTerm_term_key";
CREATE UNIQUE INDEX "MonitoredTerm_magazineId_term_key" ON "MonitoredTerm"("magazineId", "term");
ALTER TABLE "MonitoredTerm" ADD CONSTRAINT "MonitoredTerm_magazineId_fkey" FOREIGN KEY ("magazineId") REFERENCES "Magazine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- GoogleAdsLead: dedupeKey unique becomes per-magazine
ALTER TABLE "GoogleAdsLead" ADD COLUMN "magazineId" TEXT;
UPDATE "GoogleAdsLead" SET "magazineId" = 'mepca';
ALTER TABLE "GoogleAdsLead" ALTER COLUMN "magazineId" SET NOT NULL;
DROP INDEX "GoogleAdsLead_dedupeKey_key";
CREATE UNIQUE INDEX "GoogleAdsLead_magazineId_dedupeKey_key" ON "GoogleAdsLead"("magazineId", "dedupeKey");
ALTER TABLE "GoogleAdsLead" ADD CONSTRAINT "GoogleAdsLead_magazineId_fkey" FOREIGN KEY ("magazineId") REFERENCES "Magazine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
