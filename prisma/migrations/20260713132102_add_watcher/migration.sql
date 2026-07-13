-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('WEBSITE', 'PDF_ARCHIVE', 'FLIPBOOK');

-- CreateTable
CREATE TABLE "WatchedSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "url" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "lastResult" TEXT,
    "seenItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchedSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceAlert" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "url" TEXT,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceAlert_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SourceAlert" ADD CONSTRAINT "SourceAlert_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "WatchedSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
