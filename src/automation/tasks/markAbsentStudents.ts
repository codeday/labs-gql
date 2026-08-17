import { PrismaClient } from '@prisma/client';
import Container from 'typedi';
import { isAttendanceTracked, makeDebug } from '../../utils';
import { DateTime } from 'luxon';

const DEBUG = makeDebug('automation:tasks:markAbsentStudents');

export const JOBSPEC = '0 2 * * *'; // Run daily at 2 AM

/**
 * For completed meetings (from Slack huddles), mark students who didn't
 * join the huddle as absent. This runs daily to check meetings that
 * ended in the last 24 hours.
 */
export default async function markAbsentStudents(): Promise<void> {
  const prisma = Container.get(PrismaClient);

  // Find meetings that ended in the last 24 hours
  const oneDayAgo = DateTime.now().minus({ hours: 24 }).toJSDate();
  const now = new Date();

  const recentMeetings = await prisma.meeting.findMany({
    where: {
      scheduledEndAt: { gte: oneDayAgo, lte: now },
      slackHuddleId: { not: null },
    },
    include: {
      project: {
        include: {
          students: { where: { status: 'ACCEPTED' } },
          event: { select: { defaultAttendanceTracking: true } },
        },
      },
      attendance: { where: { source: 'SLACK_HUDDLE' } },
    },
  });

  DEBUG(`Checking ${recentMeetings.length} meetings from last 24 hours for absent students`);

  let totalAbsentMarked = 0;

  for (const meeting of recentMeetings) {
    if (!meeting.project) {
      DEBUG(`Meeting ${meeting.id} has no project, skipping`);
      continue;
    }

    // Never infer absence for projects which do not meet on Slack; they have no
    // huddle data, so every student would be wrongly marked absent.
    if (!isAttendanceTracked(meeting.project)) {
      DEBUG(`Meeting ${meeting.id} project is not tracked via Slack, skipping`);
      continue;
    }

    // Get IDs of students who attended
    const attendedStudentIds = new Set(
      meeting.attendance.map((a) => a.studentId).filter((id): id is string => id !== null)
    );

    // Mark students who didn't attend as absent
    for (const student of meeting.project.students) {
      if (!attendedStudentIds.has(student.id)) {
        // Check if attendance record already exists
        const existing = await prisma.meetingAttendance.findFirst({
          where: {
            meetingId: meeting.id,
            studentId: student.id,
            source: 'SLACK_HUDDLE',
          },
        });

        if (!existing) {
          // Create absent record
          await prisma.meetingAttendance.create({
            data: {
              meetingId: meeting.id,
              studentId: student.id,
              attended: false,
              source: 'SLACK_HUDDLE',
              confidence: 1.0,
              metadata: {
                reason: 'Did not join Slack huddle',
                meetingEndTime: meeting.scheduledEndAt?.toISOString(),
              },
            },
          });

          totalAbsentMarked++;
          DEBUG(`Marked student ${student.id} as absent from meeting ${meeting.id}`);
        }
      }
    }
  }

  DEBUG(`Completed: marked ${totalAbsentMarked} students as absent`);
}
