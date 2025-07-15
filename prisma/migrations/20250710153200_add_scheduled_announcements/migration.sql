-- CreateEnum
CREATE TYPE "ScheduledAnnouncementMedium" AS ENUM ('SLACK', 'EMAIL');

-- CreateEnum
CREATE TYPE "ScheduledAnnouncementTarget" AS ENUM ('MENTOR', 'STUDENT', 'TEAM');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "slackAnnouncementChannelId" TEXT;

-- CreateTable
CREATE TABLE "ScheduledAnnouncement" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "medium" "ScheduledAnnouncementMedium" NOT NULL,
    "target" "ScheduledAnnouncementTarget" NOT NULL,
    "isSent" BOOLEAN NOT NULL DEFAULT false,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "ScheduledAnnouncement_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ScheduledAnnouncement" ADD CONSTRAINT "ScheduledAnnouncement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
