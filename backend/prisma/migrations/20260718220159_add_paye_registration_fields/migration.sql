-- AlterTable
ALTER TABLE "taxpayers" ADD COLUMN     "payeRegNumber" TEXT,
ADD COLUMN     "payeSource" TEXT,
ADD COLUMN     "payeStatus" TEXT DEFAULT 'UNKNOWN',
ADD COLUMN     "payeVerifiedAt" TIMESTAMP(3);
