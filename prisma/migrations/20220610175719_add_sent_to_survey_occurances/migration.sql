-- AlterTable
ALTER TABLE "SurveyOccurence" ADD COLUMN     "sentOverdueReminder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sentVisibleReminder" BOOLEAN NOT NULL DEFAULT false;
