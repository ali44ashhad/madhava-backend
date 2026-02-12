-- AlterTable
ALTER TABLE "otp_verifications" ADD COLUMN     "payload" JSONB,
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'LOGIN';
