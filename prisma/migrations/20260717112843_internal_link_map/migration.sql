-- CreateEnum
CREATE TYPE "CrawlStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'ERROR');

-- CreateTable
CREATE TABLE "SitePage" (
    "id" TEXT NOT NULL,
    "magazineId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT,
    "kind" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "crawledAt" TIMESTAMP(3),

    CONSTRAINT "SitePage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteLink" (
    "id" TEXT NOT NULL,
    "magazineId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,

    CONSTRAINT "SiteLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteCrawl" (
    "id" TEXT NOT NULL,
    "magazineId" TEXT NOT NULL,
    "status" "CrawlStatus" NOT NULL DEFAULT 'QUEUED',
    "totalPages" INTEGER NOT NULL DEFAULT 0,
    "crawledPages" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SiteCrawl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SitePage_magazineId_idx" ON "SitePage"("magazineId");

-- CreateIndex
CREATE UNIQUE INDEX "SitePage_magazineId_url_key" ON "SitePage"("magazineId", "url");

-- CreateIndex
CREATE INDEX "SiteLink_magazineId_idx" ON "SiteLink"("magazineId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteLink_fromId_toId_key" ON "SiteLink"("fromId", "toId");

-- CreateIndex
CREATE INDEX "SiteCrawl_magazineId_idx" ON "SiteCrawl"("magazineId");

-- AddForeignKey
ALTER TABLE "SitePage" ADD CONSTRAINT "SitePage_magazineId_fkey" FOREIGN KEY ("magazineId") REFERENCES "Magazine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteLink" ADD CONSTRAINT "SiteLink_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "SitePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteLink" ADD CONSTRAINT "SiteLink_toId_fkey" FOREIGN KEY ("toId") REFERENCES "SitePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteCrawl" ADD CONSTRAINT "SiteCrawl_magazineId_fkey" FOREIGN KEY ("magazineId") REFERENCES "Magazine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
