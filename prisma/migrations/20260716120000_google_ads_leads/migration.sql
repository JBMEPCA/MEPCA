-- CreateEnum
CREATE TYPE "AdSearchStatus" AS ENUM ('IDLE', 'QUEUED', 'SEARCHING');

-- CreateTable
CREATE TABLE "MonitoredTerm" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "searchStatus" "AdSearchStatus" NOT NULL DEFAULT 'IDLE',
    "lastCheckedAt" TIMESTAMP(3),
    "lastResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoredTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleAdsLead" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "website" TEXT,
    "adHeadline" TEXT,
    "adDescription" TEXT,
    "termId" TEXT NOT NULL,
    "searchTerm" TEXT NOT NULL,
    "goodTarget" BOOLEAN NOT NULL DEFAULT false,
    "pitched" BOOLEAN NOT NULL DEFAULT false,
    "dedupeKey" TEXT NOT NULL,
    "timesSeen" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleAdsLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredTerm_term_key" ON "MonitoredTerm"("term");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleAdsLead_dedupeKey_key" ON "GoogleAdsLead"("dedupeKey");

-- AddForeignKey
ALTER TABLE "GoogleAdsLead" ADD CONSTRAINT "GoogleAdsLead_termId_fkey" FOREIGN KEY ("termId") REFERENCES "MonitoredTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
