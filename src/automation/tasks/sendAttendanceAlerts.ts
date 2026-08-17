import { PrismaClient, Event } from '@prisma/client';
import Container from 'typedi';
import { getSlackClientForEvent } from '../../slack';
import { isAttendanceTracked, makeDebug } from '../../utils';

const DEBUG = makeDebug('automation:tasks:sendAttendanceAlerts');
const ATTENDANCE_ALERT_CHANNEL = 'stats';

export const JOBSPEC = '0 9 * * MON'; // Every Monday at 9 AM

export interface AttendanceIssue {
  studentName: string;
  studentEmail: string;
  studentSlackId?: string;
  projectName: string;
  mentorName: string;
  mentorSlackId?: string;
  attendancePercentage: number;
  meetingsAttended: number;
  meetingsTotal: number;
  lastAttendedAt?: Date;
}

function slackMention(slackId?: string): string | null {
  return slackId ? `<@${slackId}>` : null;
}

export function buildWeeklyAttendanceAlertMessage(
  eventName: string,
  students: AttendanceIssue[],
  untrackedProjectCount = 0,
): string {
  let message = `🚨 *Weekly Attendance Alert for ${eventName}*\n\n`;

  if (students.length > 0) {
    message += '*Students with Low Attendance (<75%):*\n';
    students.slice(0, 10).forEach((s) => {
      const pct = Math.round(s.attendancePercentage * 100);
      message += `• ${s.studentName} - ${pct}% (${s.meetingsAttended}/${s.meetingsTotal} meetings)\n`;
      message += `  Project: ${s.projectName}\n`;
      message += `  Mentor: ${s.mentorName}\n`;

      const studentMention = slackMention(s.studentSlackId);
      const mentorMention = slackMention(s.mentorSlackId);
      const mentions = [studentMention, mentorMention].filter(Boolean).join(' ');
      if (mentions) message += `  Notify: ${mentions}\n`;
    });
    if (students.length > 10) {
      message += `\n_... and ${students.length - 10} more students_\n`;
    }
    message += '\n';
  }

  if (untrackedProjectCount > 0) {
    message += `_${untrackedProjectCount} project(s) are not tracked via Slack huddles and were excluded._\n`;
  }

  return message;
}

export default async function sendAttendanceAlerts(): Promise<void> {
  const prisma = Container.get(PrismaClient);

  // Get all active events
  const activeEvents = await prisma.event.findMany({
    where: { isActive: true },
  });

  DEBUG(`Checking ${activeEvents.length} active events for attendance issues`);

  for (const event of activeEvents) {
    try {
      await processEventAlerts(event);
    } catch (err) {
      DEBUG(`Error processing alerts for event ${event.id}: ${err}`);
    }
  }
}

export async function getAttendanceIssuesForEvent(
  prisma: PrismaClient,
  event: Event,
): Promise<{ students: AttendanceIssue[]; untrackedProjectCount: number }> {

  DEBUG(`Processing attendance alerts for event: ${event.name}`);

  const lowAttendanceStudents: AttendanceIssue[] = [];
  let untrackedProjectCount = 0;

  // Get all matched projects with their students and attendance
  const projects = await prisma.project.findMany({
    where: {
      eventId: event.id,
      status: 'MATCHED',
    },
    include: {
      students: { where: { status: 'ACCEPTED' } },
      mentors: { where: { status: 'ACCEPTED' } },
      event: { select: { defaultAttendanceTracking: true } },
      meetings: {
        include: {
          attendance: true,
        },
      },
    },
  });

  for (const project of projects) {
    // Projects which do not meet on Slack have no huddle data, so reporting on
    // them would falsely show every student as absent.
    if (!isAttendanceTracked(project)) {
      untrackedProjectCount += 1;
      DEBUG(`Skipping project ${project.id}: attendance not tracked via Slack`);
      continue;
    }

    const mentor = project.mentors[0];
    if (!mentor) continue;

    // Check student attendance
    for (const student of project.students) {
      const allMeetings = project.meetings;
      const studentAttendance = allMeetings.flatMap((m) =>
        m.attendance.filter((a) => a.studentId === student.id)
      );

      const meetingsTotal = allMeetings.length;
      const meetingsAttended = studentAttendance.filter((a) => a.attended).length;
      const attendancePercentage = meetingsTotal > 0 ? meetingsAttended / meetingsTotal : 1;

      // Flag students with <75% attendance and at least 2 meetings
      if (attendancePercentage < 0.75 && meetingsTotal >= 2) {
        const lastAttended = studentAttendance
          .filter((a) => a.attended)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

        lowAttendanceStudents.push({
          studentName: `${student.givenName} ${student.surname}`,
          studentEmail: student.email,
          studentSlackId: student.slackId || undefined,
          projectName: project.description?.slice(0, 50) || 'Untitled Project',
          mentorName: `${mentor.givenName} ${mentor.surname}`,
          mentorSlackId: mentor.slackId || undefined,
          attendancePercentage,
          meetingsAttended,
          meetingsTotal,
          lastAttendedAt: lastAttended?.createdAt,
        });
      }
    }

  }

  return {
    students: lowAttendanceStudents,
    untrackedProjectCount,
  };
}

async function processEventAlerts(event: Event): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const { students, untrackedProjectCount } = await getAttendanceIssuesForEvent(prisma, event);

  // Send alerts if there are any issues
  if (students.length > 0) {
    await sendSlackAlert(event, students, untrackedProjectCount);
  } else {
    DEBUG(`No attendance issues found for ${event.name}`);
  }
}

async function sendSlackAlert(
  event: Event,
  students: AttendanceIssue[],
  untrackedProjectCount: number,
): Promise<void> {
  if (!event.slackWorkspaceAccessToken || !event.slackWorkspaceId) {
    DEBUG(`Event ${event.id} does not have Slack configured, skipping Slack alert`);
    return;
  }

  const slack = getSlackClientForEvent(event as any);
  const message = buildWeeklyAttendanceAlertMessage(event.name, students, untrackedProjectCount);

  DEBUG(`Sending Slack alert to channel ${ATTENDANCE_ALERT_CHANNEL}`);

  await slack.chat.postMessage({
    channel: ATTENDANCE_ALERT_CHANNEL,
    text: message,
  });
}
