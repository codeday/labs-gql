-- CreateEnum: Add attendance source tracking
CREATE TYPE "AttendanceSource" AS ENUM ('SLACK_HUDDLE', 'MESSAGE_ACTIVITY', 'MENTOR_REPORT', 'MANUAL');

-- AlterTable: Add attendance tracking fields to MeetingAttendance
ALTER TABLE "MeetingAttendance" ADD COLUMN "source" "AttendanceSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "MeetingAttendance" ADD COLUMN "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
ALTER TABLE "MeetingAttendance" ADD COLUMN "metadata" JSONB;

-- AlterTable: Add Slack and project fields to Meeting
ALTER TABLE "Meeting" ADD COLUMN "slackHuddleId" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "scheduledStartAt" TIMESTAMP(3);
ALTER TABLE "Meeting" ADD COLUMN "scheduledEndAt" TIMESTAMP(3);
ALTER TABLE "Meeting" ADD COLUMN "projectId" TEXT;

-- AddForeignKey: Link meetings to projects
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: Add index for source-based queries
CREATE INDEX "MeetingAttendance_source_idx" ON "MeetingAttendance"("source");

-- CreateIndex: Add index for project-based meeting queries
CREATE INDEX "Meeting_projectId_idx" ON "Meeting"("projectId");
