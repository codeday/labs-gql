ALTER TABLE "ProjectEmail" ADD COLUMN "emailSentId" TEXT NULL DEFAULT NULL;
ALTER TABLE "ProjectEmail" ADD FOREIGN KEY ("emailSentId") REFERENCES "EmailSent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Mentor" ADD COLUMN "slackId" TEXT NULL DEFAULT NULL;