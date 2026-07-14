-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('IDLE', 'QUEUED', 'SCANNING');

-- AlterTable
ALTER TABLE "WatchedSource" ADD COLUMN     "scanStatus" "ScanStatus" NOT NULL DEFAULT 'IDLE';
