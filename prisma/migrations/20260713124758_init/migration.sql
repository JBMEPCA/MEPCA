-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('UPCOMING', 'LIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('PITCHED', 'PROPOSAL_SENT', 'NEGOTIATING', 'VERBAL_AGREEMENT', 'SIGNED_OFF', 'LOST');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "package" TEXT NOT NULL,
    "value" DECIMAL(10,2),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "CampaignStatus" NOT NULL DEFAULT 'UPCOMING',
    "notes" TEXT,
    "fileMakerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineItem" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "package" TEXT,
    "estimatedValue" DECIMAL(10,2),
    "stage" "PipelineStage" NOT NULL DEFAULT 'PITCHED',
    "followUpDate" TIMESTAMP(3),
    "notes" TEXT,
    "convertedCampaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpReminder" (
    "id" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "pipelineItemId" TEXT,
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorAdvertiser" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "competitorMagazine" TEXT NOT NULL,
    "adType" TEXT,
    "whereFound" TEXT,
    "confidenceNotes" TEXT,
    "source" TEXT,
    "goodTarget" BOOLEAN NOT NULL DEFAULT false,
    "pitched" BOOLEAN NOT NULL DEFAULT false,
    "dedupeKey" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastImportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorAdvertiser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_fileMakerId_key" ON "Campaign"("fileMakerId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorAdvertiser_dedupeKey_key" ON "CompetitorAdvertiser"("dedupeKey");

-- AddForeignKey
ALTER TABLE "FollowUpReminder" ADD CONSTRAINT "FollowUpReminder_pipelineItemId_fkey" FOREIGN KEY ("pipelineItemId") REFERENCES "PipelineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpReminder" ADD CONSTRAINT "FollowUpReminder_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
