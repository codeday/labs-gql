import { PrismaClient, Student, Mentor } from '@prisma/client';
import Container from 'typedi';
import { isAttendanceTracked, makeDebug } from '../../utils';
import { DateTime } from 'luxon';

const DEBUG = makeDebug('slack:events:huddle');

interface HuddleEvent {
  user: { id: string; team_id: string };
  channel: { id: string };
  huddle: { id: string };
  huddle_client?: 'desktop' | 'mobile' | null; // null = left huddle
}

/**
 * Handle Slack huddle event (user_huddle_changed)
 * When a user joins or leaves a huddle in a project channel
 */
export async function handleHuddleEvent(event: HuddleEvent): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const { user, channel, huddle, huddle_client } = event;

  DEBUG(`Huddle event: user=${user.id}, channel=${channel.id}, huddle=${huddle.id}, joined=${!!huddle_client}`);

  // Find project by Slack channel
  const project = await prisma.project.findFirst({
    where: { slackChannelId: channel.id, status: 'MATCHED' },
    include: {
      students: { where: { status: 'ACCEPTED' } },
      mentors: { where: { status: 'ACCEPTED' } },
      event: { select: { id: true, defaultAttendanceTracking: true } },
    },
  });

  if (!project || !project.event) {
    DEBUG(`No matched project found for channel ${channel.id}`);
    return;
  }

  if (!isAttendanceTracked(project)) {
    DEBUG(`Project ${project.id} has opted out of Slack attendance tracking`);
    return;
  }

  const now = new Date();
  const mentor = project.mentors.find((m) => m.slackId === user.id);
  const student = project.students.find((s) => s.slackId === user.id);

  if (!mentor && !student) {
    DEBUG(`User ${user.id} is neither mentor nor student in project ${project.id}`);
    return;
  }

  if (huddle_client) {
    // User JOINED huddle
    await handleHuddleJoin({
      huddleId: huddle.id,
      channelId: channel.id,
      userId: user.id,
      mentor,
      student,
      projectId: project.id,
      eventId: project.event.id,
      joinedAt: now,
    });
  } else {
    // User LEFT huddle
    await handleHuddleLeave({
      huddleId: huddle.id,
      userId: user.id,
      leftAt: now,
    });
  }
}

interface HuddleJoinData {
  huddleId: string;
  channelId: string;
  userId: string;
  mentor?: Mentor;
  student?: Student;
  projectId: string;
  eventId: string;
  joinedAt: Date;
}

async function handleHuddleJoin(data: HuddleJoinData): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const { mentor, student } = data;

  // Record participation
  await prisma.slackHuddleParticipation.upsert({
    where: { huddleId_userId: { huddleId: data.huddleId, userId: data.userId } },
    create: {
      huddleId: data.huddleId,
      channelId: data.channelId,
      userId: data.userId,
      projectId: data.projectId,
      mentorId: mentor?.id,
      studentId: student?.id,
      joinedAt: data.joinedAt,
    },
    update: {
      joinedAt: data.joinedAt,
      leftAt: null,
    },
  });

  DEBUG(`Recorded huddle participation for user ${data.userId}`);

  // If MENTOR joined → create/find meeting
  if (mentor) {
    await handleMentorJoinedHuddle({
      huddleId: data.huddleId,
      projectId: data.projectId,
      eventId: data.eventId,
      mentorId: mentor.id,
      startedAt: data.joinedAt,
    });
  }

  // If STUDENT joined → record attendance
  if (student) {
    await handleStudentJoinedHuddle({
      huddleId: data.huddleId,
      studentId: student.id,
      joinedAt: data.joinedAt,
    });
  }
}

interface MentorJoinData {
  huddleId: string;
  projectId: string;
  eventId: string;
  mentorId: string;
  startedAt: Date;
}

async function handleMentorJoinedHuddle(data: MentorJoinData): Promise<void> {
  const prisma = Container.get(PrismaClient);

  // Check if meeting already exists for this huddle
  const existing = await prisma.meeting.findFirst({
    where: { slackHuddleId: data.huddleId },
  });

  if (existing) {
    DEBUG(`Meeting already exists for huddle ${data.huddleId}`);
    return;
  }

  // Create new meeting
  const meeting = await prisma.meeting.create({
    data: {
      eventId: data.eventId,
      projectId: data.projectId,
      slackHuddleId: data.huddleId,
      scheduledStartAt: data.startedAt,
      scheduledEndAt: data.startedAt, // Will update when huddle ends
      visibleAt: data.startedAt,
      dueAt: DateTime.fromJSDate(data.startedAt).plus({ days: 1 }).toJSDate(),
    },
  });

  DEBUG(`Created meeting ${meeting.id} from mentor joining huddle ${data.huddleId}`);

  // Link all existing huddle participations to this meeting
  await prisma.slackHuddleParticipation.updateMany({
    where: { huddleId: data.huddleId, meetingId: null },
    data: { meetingId: meeting.id },
  });
}

interface StudentJoinData {
  huddleId: string;
  studentId: string;
  joinedAt: Date;
}

async function handleStudentJoinedHuddle(data: StudentJoinData): Promise<void> {
  const prisma = Container.get(PrismaClient);

  // Find meeting for this huddle
  const meeting = await prisma.meeting.findFirst({
    where: { slackHuddleId: data.huddleId },
  });

  if (!meeting) {
    DEBUG(`No meeting yet for huddle ${data.huddleId} - mentor hasn't joined?`);
    return;
  }

  // Check if attendance already recorded
  const existing = await prisma.meetingAttendance.findFirst({
    where: {
      meetingId: meeting.id,
      studentId: data.studentId,
      source: 'SLACK_HUDDLE',
    },
  });

  if (existing) {
    DEBUG(`Attendance already recorded for student ${data.studentId}`);
    return;
  }

  // Record attendance
  await prisma.meetingAttendance.create({
    data: {
      meetingId: meeting.id,
      studentId: data.studentId,
      attended: true,
      source: 'SLACK_HUDDLE',
      confidence: 1.0,
      metadata: {
        huddleId: data.huddleId,
        joinedAt: data.joinedAt.toISOString(),
      },
    },
  });

  DEBUG(`Recorded attendance for student ${data.studentId} at meeting ${meeting.id}`);
}

interface HuddleLeaveData {
  huddleId: string;
  userId: string;
  leftAt: Date;
}

async function handleHuddleLeave(data: HuddleLeaveData): Promise<void> {
  const prisma = Container.get(PrismaClient);

  // Update participation record
  await prisma.slackHuddleParticipation.updateMany({
    where: { huddleId: data.huddleId, userId: data.userId, leftAt: null },
    data: { leftAt: data.leftAt },
  });

  DEBUG(`Updated leave time for user ${data.userId} in huddle ${data.huddleId}`);

  // Check if this was the last person to leave
  const remaining = await prisma.slackHuddleParticipation.count({
    where: { huddleId: data.huddleId, leftAt: null },
  });

  if (remaining === 0) {
    // Huddle ended - update meeting end time
    await prisma.meeting.updateMany({
      where: { slackHuddleId: data.huddleId },
      data: { scheduledEndAt: data.leftAt },
    });

    DEBUG(`Huddle ${data.huddleId} ended, updated meeting end time`);
  }
}
