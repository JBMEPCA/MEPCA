-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "issue" TEXT,
ADD COLUMN     "saleDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "IssueDeadline" (
    "id" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "salesDeadline" TIMESTAMP(3),
    "adsDeadline" TIMESTAMP(3),
    "printDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueDeadline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IssueDeadline_issue_key" ON "IssueDeadline"("issue");
