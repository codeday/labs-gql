import { PrismaClient, SurveyResponse, Meeting } from '@prisma/client';
import Container from 'typedi';
import { makeDebug } from '../../utils';
import { DateTime } from 'luxon';

const DEBUG = makeDebug('automation:tasks:processMentorReflections');

export const JOBSPEC = '0 */6 * * *'; // Run every 6 hours

/**
 * This task processes mentor reflection survey responses and extracts
 * attendance data to create MeetingAttendance records.
 * 
 * Looks for survey responses with:
 * - response.meetingHeld (boolean) - whether a meeting occurred
 * - response.studentAttendance (array of student IDs) - which students attended
 * - response.studentsAbsent (array of student IDs) - alternative format
 */
export default async function processMentorReflections(): Promise<void> {
  const prisma = Container.get(PrismaClient);

  // Get the last time we processed reflections (stored in a simple way)
  const lastProcessed = DateTime.now().minus({ hours: 7 }).toJSDate();

  DEBUG(`Processing mentor reflections since ${lastProcessed.toISOString()}`);

  // Find recent mentor-authored survey responses
  const mentorReflections = await prisma.surveyResponse.findMany({
    where: {
      authorMentorId: { not: null },
      createdAt: { gte: lastProcessed },
      surveyOccurence: {
        survey: {
          personType: 'MENTOR',
        },
      },
    },
    include: {
      authorMentor: {
        include: {
          projects: {
            where: { status: 'MATCHED' },
            include: {
              students: { where: { status: 'ACCEPTED' } },
            },
          },
        },
      },
      surveyOccurence: {
        include: { survey: true },
      },
    },
  });

  DEBUG(`Found ${mentorReflections.length} mentor reflections to process`);

  for (const reflection of mentorReflections) {
    try {
      await processReflection(reflection);
    } catch (err) {
      DEBUG(`Error processing reflection ${reflection.id}: ${err}`);
    }
  }
}

async function processReflection(reflection: any): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const response = reflection.response as any;

  // Check if this reflection contains meeting attendance data
  if (!response || typeof response !== 'object') {
    DEBUG(`Skipping reflection ${reflection.id}: invalid response format`);
    return;
  }

  // Get the mentor's project (assume first project for now)
  const project = reflection.authorMentor?.projects?.[0];
  if (!project) {
    DEBUG(`Skipping reflection ${reflection.id}: no project found for mentor`);
    return;
  }

  // Determine if a meeting was held
  const meetingHeld = response.meetingHeld === true || response.meetingHeld === 'true';
  
  if (!meetingHeld && !response.studentAttendance && !response.studentsAbsent) {
    DEBUG(`Skipping reflection ${reflection.id}: no attendance data found`);
    return;
  }

  DEBUG(`Processing attendance for project ${project.id} from reflection ${reflection.id}`);

  // Find or create a meeting for this week
  const weekStart = DateTime.fromJSDate(reflection.createdAt).startOf('week').toJSDate();
  const weekEnd = DateTime.fromJSDate(reflection.createdAt).endOf('week').toJSDate();

  let meeting = await prisma.meeting.findFirst({
    where: {
      projectId: project.id,
      scheduledStartAt: { gte: weekStart, lte: weekEnd },
    },
  });

  if (!meeting) {
    // Create a meeting for this week
    DEBUG(`Creating meeting for project ${project.id}, week of ${weekStart.toISOString()}`);
    meeting = await prisma.meeting.create({
      data: {
        projectId: project.id,
        eventId: project.eventId!,
        visibleAt: weekStart,
        dueAt: weekEnd,
        scheduledStartAt: weekStart,
        scheduledEndAt: weekStart,
      },
    });
  }

  // Extract attendance information
  const attendedStudentIds = new Set<string>();
  
  // Format 1: response.studentAttendance (array of student IDs)
  if (Array.isArray(response.studentAttendance)) {
    response.studentAttendance.forEach((id: string) => attendedStudentIds.add(id));
  }

  // Format 2: response.studentsPresent (array of student IDs)
  if (Array.isArray(response.studentsPresent)) {
    response.studentsPresent.forEach((id: string) => attendedStudentIds.add(id));
  }

  // Record attendance for all students in the project
  for (const student of project.students) {
    const attended = attendedStudentIds.has(student.id);

    // Check if attendance record already exists
    const existing = await prisma.meetingAttendance.findFirst({
      where: {
        meetingId: meeting.id,
        studentId: student.id,
        source: 'MENTOR_REPORT',
      },
    });

    if (existing) {
      DEBUG(`Updating attendance for student ${student.id} in meeting ${meeting.id}: ${attended}`);
      await prisma.meetingAttendance.update({
        where: { id: existing.id },
        data: {
          attended,
          metadata: { reflectionId: reflection.id, processedAt: new Date().toISOString() },
        },
      });
    } else {
      DEBUG(`Creating attendance for student ${student.id} in meeting ${meeting.id}: ${attended}`);
      await prisma.meetingAttendance.create({
        data: {
          meetingId: meeting.id,
          studentId: student.id,
          attended,
          source: 'MENTOR_REPORT',
          confidence: 1.0,
          metadata: { reflectionId: reflection.id, processedAt: new Date().toISOString() },
        },
      });
    }
  }

  DEBUG(`Successfully processed reflection ${reflection.id} for ${project.students.length} students`);
}
