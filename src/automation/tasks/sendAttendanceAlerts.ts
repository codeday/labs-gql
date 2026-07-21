import { PrismaClient, Event } from '@prisma/client';
import Container from 'typedi';
import { getSlackClientForEvent } from '../../slack';
import { makeDebug } from '../../utils';
import { DateTime } from 'luxon';

const DEBUG = makeDebug('automation:tasks:sendAttendanceAlerts');

export const JOBSPEC = '0 9 * * MON'; // Every Monday at 9 AM

interface AttendanceIssue {
  studentName: string;
  studentEmail: string;
  projectName: string;
  mentorName: string;
  attendancePercentage: number;
  meetingsAttended: number;
  meetingsTotal: number;
  lastAttendedAt?: Date;
}

interface MentorIssue {
  mentorName: string;
  mentorEmail: string;
  projectName: string;
  missedReflections: number;
  expectedReflections: number;
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

async function processEventAlerts(event: Event): Promise<void> {
  const prisma = Container.get(PrismaClient);

  DEBUG(`Processing attendance alerts for event: ${event.name}`);

  const lowAttendanceStudents: AttendanceIssue[] = [];
  const mentorReflectionIssues: MentorIssue[] = [];

  // Get all matched projects with their students and attendance
  const projects = await prisma.project.findMany({
    where: {
      eventId: event.id,
      status: 'MATCHED',
    },
    include: {
      students: { where: { status: 'ACCEPTED' } },
      mentors: { where: { status: 'ACCEPTED' } },
      meetings: {
        include: {
          attendance: true,
        },
      },
    },
  });

  for (const project of projects) {
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
          projectName: project.description?.slice(0, 50) || 'Untitled Project',
          mentorName: `${mentor.givenName} ${mentor.surname}`,
          attendancePercentage,
          meetingsAttended,
          meetingsTotal,
          lastAttendedAt: lastAttended?.createdAt,
        });
      }
    }

    // Check mentor reflection completion
    const mentorReflections = await prisma.surveyResponse.count({
      where: {
        authorMentorId: mentor.id,
        surveyOccurence: {
          survey: {
            personType: 'MENTOR',
            eventId: event.id,
          },
        },
      },
    });

    const weeksSinceStart = Math.max(
      1,
      Math.floor(DateTime.now().diff(DateTime.fromJSDate(event.startsAt), 'weeks').weeks)
    );
    const expectedReflections = Math.min(weeksSinceStart, event.defaultWeeks);

    if (mentorReflections < expectedReflections * 0.75 && expectedReflections >= 2) {
      mentorReflectionIssues.push({
        mentorName: `${mentor.givenName} ${mentor.surname}`,
        mentorEmail: mentor.email,
        projectName: project.description?.slice(0, 50) || 'Untitled Project',
        missedReflections: expectedReflections - mentorReflections,
        expectedReflections,
      });
    }
  }

  // Send alerts if there are any issues
  if (lowAttendanceStudents.length > 0 || mentorReflectionIssues.length > 0) {
    await sendSlackAlert(event, lowAttendanceStudents, mentorReflectionIssues);
  } else {
    DEBUG(`No attendance issues found for ${event.name}`);
  }
}

async function sendSlackAlert(
  event: Event,
  students: AttendanceIssue[],
  mentors: MentorIssue[]
): Promise<void> {
  if (!event.slackWorkspaceAccessToken || !event.slackMentorChannelId || !event.slackWorkspaceId) {
    DEBUG(`Event ${event.id} does not have Slack configured, skipping Slack alert`);
    return;
  }

  const slack = getSlackClientForEvent(event as any);

  let message = `🚨 *Weekly Attendance Alert for ${event.name}*\n\n`;
  
  if (students.length > 0) {
    message += `*Students with Low Attendance (<75%):*\n`;
    students.slice(0, 10).forEach((s) => {
      const pct = Math.round(s.attendancePercentage * 100);
      message += `• ${s.studentName} - ${pct}% (${s.meetingsAttended}/${s.meetingsTotal} meetings)\n`;
      message += `  Project: ${s.projectName}\n`;
      message += `  Mentor: ${s.mentorName}\n`;
    });
    if (students.length > 10) {
      message += `\n_... and ${students.length - 10} more students_\n`;
    }
    message += '\n';
  }

  if (mentors.length > 0) {
    message += `*Mentors Behind on Reflections:*\n`;
    mentors.slice(0, 10).forEach((m) => {
      message += `• ${m.mentorName} - ${m.missedReflections} reflections behind\n`;
      message += `  Project: ${m.projectName}\n`;
    });
    if (mentors.length > 10) {
      message += `\n_... and ${mentors.length - 10} more mentors_\n`;
    }
  }

  DEBUG(`Sending Slack alert to channel ${event.slackMentorChannelId}`);
  
  await slack.chat.postMessage({
    channel: event.slackMentorChannelId,
    text: message,
  });
}
