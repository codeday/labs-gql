-- CreateEnum: Add attendance source tracking
CREATE TYPE "AttendanceSource" AS ENUM ('SLACK_HUDDLE', 'MANUAL');

-- CreateEnum: Per-project/event attendance tracking mode, allowing teams which do
-- not meet on Slack to opt out of automated tracking.
CREATE TYPE "AttendanceTrackingMode" AS ENUM ('SLACK_HUDDLE', 'NOT_TRACKED');

-- AlterTable: Opt-out configuration. Project value is nullable and falls back to the event default.
ALTER TABLE "Project" ADD COLUMN "attendanceTracking" "AttendanceTrackingMode";
ALTER TABLE "Event" ADD COLUMN "defaultAttendanceTracking" "AttendanceTrackingMode" NOT NULL DEFAULT 'SLACK_HUDDLE';

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

-- CreateTable: Raw Slack huddle join/leave events, used to derive meeting attendance.
CREATE TABLE "SlackHuddleParticipation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "huddleId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),
    "studentId" TEXT,
    "mentorId" TEXT,
    "meetingId" TEXT,
    "projectId" TEXT,

    CONSTRAINT "SlackHuddleParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlackHuddleParticipation_huddleId_userId_key" ON "SlackHuddleParticipation"("huddleId", "userId");
CREATE INDEX "SlackHuddleParticipation_huddleId_idx" ON "SlackHuddleParticipation"("huddleId");
CREATE INDEX "SlackHuddleParticipation_studentId_joinedAt_idx" ON "SlackHuddleParticipation"("studentId", "joinedAt");
CREATE INDEX "SlackHuddleParticipation_mentorId_joinedAt_idx" ON "SlackHuddleParticipation"("mentorId", "joinedAt");
CREATE INDEX "SlackHuddleParticipation_channelId_joinedAt_idx" ON "SlackHuddleParticipation"("channelId", "joinedAt");

-- AddForeignKey
ALTER TABLE "SlackHuddleParticipation" ADD CONSTRAINT "SlackHuddleParticipation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SlackHuddleParticipation" ADD CONSTRAINT "SlackHuddleParticipation_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "Mentor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SlackHuddleParticipation" ADD CONSTRAINT "SlackHuddleParticipation_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SlackHuddleParticipation" ADD CONSTRAINT "SlackHuddleParticipation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
