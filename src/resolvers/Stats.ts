import {
  Resolver, Authorized, Query, Arg, Ctx, Int, Float,
} from 'type-graphql';
import { PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { DateTime } from 'luxon';
import { Context, AuthRole } from '../context';
import { Track, StudentStatus } from '../enums';
import { Stat } from '../types/Stat';
import { StudentAttendanceStat, MentorReflectionStat, FlaggedStudent } from '../types/AttendanceStats';

// 2012: 24 students, 400 hours = 9,600 hours
// 2013: 16 students, 400 hours = 6,400 hours
// 2014: 12 students, 400 hours = 4,800 hours
// 2017: 482, 100 hours = 48,200 hours
// 2018: 1018, 100 hours = 101,800 hours
// 2019: 1011 students, 100 hours = 101,100 hours
const STUDENTS_IN_OLD_SYSTEM = 2_563;
const HOURS_IN_OLD_SYSTEM = 271_900;
const PROJECTS_IN_OLD_SYSTEM = 849;
const MENTORS_IN_OLD_SYSTEM = 851;
const MENTOR_HOURS_IN_OLD_SYSTEM = 5_106;

@Service()
@Resolver(Stat)
export class StatsResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Query(() => [Stat])
  async statTotalOutcomes(): Promise<Stat[]> {
    const [
      studentCount,
      mentorCount,
      projectCount,
      prCount,
      studentHoursCount,
      mentorHoursCount,
    ] = await Promise.all([
      // studentCount
      this.prisma.student.count({
        where: { status: 'ACCEPTED' },
      }),

      // mentorCount
      this.prisma.mentor.count({
        where: { status: 'ACCEPTED' },
      }),

      // projectCount
      this.prisma.project.count({
        where: { status: 'MATCHED' },
      }),

      // prCount
      this.prisma.project.count({
        where: { status: 'MATCHED', prUrl: { not: null } },
      }),

      // studentHoursCount
      this.prisma.$queryRaw<{ hours: number }[]>`
        select sum(weeks * "minHours") as hours from "Student" where "status" = 'ACCEPTED';
      `,

      // mentorHoursCount
      this.prisma.$queryRaw<{ hours: number }[]>`
        select sum("maxWeeks") * 3.5 as hours from "Mentor" where "status" = 'ACCEPTED';
      `,
    ]);

    return [
      { key: 'studentCount', value: studentCount + STUDENTS_IN_OLD_SYSTEM },
      { key: 'mentorCount', value: mentorCount + MENTORS_IN_OLD_SYSTEM },
      { key: 'projectCount', value: projectCount + PROJECTS_IN_OLD_SYSTEM },
      { key: 'prCount', value: prCount },
      { key: 'studentHoursCount', value: studentHoursCount[0].hours + HOURS_IN_OLD_SYSTEM },
      { key: 'mentorHoursCount', value: mentorHoursCount[0].hours + MENTOR_HOURS_IN_OLD_SYSTEM },
      { key: 'hoursCount', value: studentHoursCount[0].hours + mentorHoursCount[0].hours + HOURS_IN_OLD_SYSTEM + MENTOR_HOURS_IN_OLD_SYSTEM },
    ]
  }

  @Authorized(AuthRole.ADMIN)
  @Query(() => [Stat])
  async statAdmissionsStatus(
    @Ctx() { auth }: Context,
    @Arg('track', () => Track, { nullable: true }) track?: Track,
  ): Promise<Stat[]> {
    const allStudents = await this.prisma.student.groupBy({
      by: ['status'],
      _count: { status: true },
      where: { track, event: { id: auth.eventId } },
    });

    const expiredStudents = await this.prisma.student.count({
      where: {
        track,
        event: { id: auth.eventId },
        status: StudentStatus.OFFERED,
        offerDate: { lt: DateTime.now().plus({ days: -3 }).toJSDate() },
      },
    });

    return [
      { key: 'EXPIRED', value: expiredStudents },
      ...allStudents.map(({ status, _count }): Stat => ({
        key: status,
        value: _count.status - (status === StudentStatus.OFFERED ? expiredStudents : 0),
      })),
    ];
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Query(() => [StudentAttendanceStat])
  async statStudentAttendance(
    @Ctx() { auth }: Context,
    @Arg('eventId', () => String, { nullable: true }) eventId?: string,
    @Arg('projectId', () => String, { nullable: true }) projectId?: string,
    @Arg('minAttendance', () => Float, { nullable: true }) minAttendance?: number,
  ): Promise<StudentAttendanceStat[]> {
    const targetEventId = eventId || auth.eventId!;
    const minAttendanceThreshold = minAttendance ?? 0.75; // Default 75%

    // Get all students in the event
    const students = await this.prisma.student.findMany({
      where: {
        eventId: targetEventId,
        status: 'ACCEPTED',
        ...(projectId ? { projects: { some: { id: projectId } } } : {}),
      },
      include: {
        projects: {
          where: { status: 'MATCHED' },
          include: {
            meetings: {
              include: {
                attendance: {
                  where: { studentId: { not: null } },
                },
              },
            },
          },
        },
      },
    });

    const stats: StudentAttendanceStat[] = [];

    for (const student of students) {
      const project = student.projects[0]; // Assume one project per student
      if (!project) continue;

      const allMeetings = project.meetings;
      const studentAttendance = allMeetings.flatMap((m) =>
        m.attendance.filter((a) => a.studentId === student.id)
      );

      const meetingsTotal = allMeetings.length;
      const meetingsAttended = studentAttendance.filter((a) => a.attended).length;
      const attendancePercentage = meetingsTotal > 0 ? meetingsAttended / meetingsTotal : 0;

      const lastAttended = studentAttendance
        .filter((a) => a.attended)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      const lastMeeting = allMeetings.sort(
        (a, b) => (b.scheduledStartAt?.getTime() || 0) - (a.scheduledStartAt?.getTime() || 0)
      )[0];

      const dataSources = Array.from(
        new Set(studentAttendance.map((a) => a.source))
      );

      stats.push({
        student: student as any,
        project: project as any,
        meetingsTotal,
        meetingsAttended,
        attendancePercentage,
        lastAttendedAt: lastAttended?.createdAt,
        lastMeetingAt: lastMeeting?.scheduledStartAt || undefined,
        isFlagged: attendancePercentage < minAttendanceThreshold && meetingsTotal > 0,
        dataSources,
      });
    }

    return stats.sort((a, b) => a.attendancePercentage - b.attendancePercentage);
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Query(() => [MentorReflectionStat])
  async statMentorReflectionCompletion(
    @Ctx() { auth }: Context,
    @Arg('eventId', () => String, { nullable: true }) eventId?: string,
  ): Promise<MentorReflectionStat[]> {
    const targetEventId = eventId || auth.eventId!;

    // Get all mentors in the event
    const mentors = await this.prisma.mentor.findMany({
      where: {
        eventId: targetEventId,
        status: 'ACCEPTED',
      },
      include: {
        projects: {
          where: { status: 'MATCHED' },
        },
        authoredSurveyResponses: {
          where: {
            surveyOccurence: {
              survey: {
                personType: 'MENTOR',
                eventId: targetEventId,
              },
            },
          },
        },
      },
    });

    const stats: MentorReflectionStat[] = [];

    // Calculate expected reflections based on weeks since event start
    const event = await this.prisma.event.findUnique({
      where: { id: targetEventId },
    });

    if (!event) return stats;

    const weeksSinceStart = Math.max(
      1,
      Math.floor(DateTime.now().diff(DateTime.fromJSDate(event.startsAt), 'weeks').weeks)
    );

    for (const mentor of mentors) {
      const project = mentor.projects[0];
      const submittedReflections = mentor.authoredSurveyResponses.length;
      const expectedReflections = Math.min(weeksSinceStart, event.defaultWeeks);
      const completionPercentage =
        expectedReflections > 0 ? submittedReflections / expectedReflections : 0;

      const lastSubmitted = mentor.authoredSurveyResponses.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      )[0];

      stats.push({
        mentor: mentor as any,
        project: project as any,
        expectedReflections,
        submittedReflections,
        completionPercentage,
        lastSubmittedAt: lastSubmitted?.createdAt,
        isFlagged: completionPercentage < 0.75 && expectedReflections > 0,
      });
    }

    return stats.sort((a, b) => a.completionPercentage - b.completionPercentage);
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Query(() => [FlaggedStudent])
  async flaggedStudents(
    @Ctx() { auth }: Context,
    @Arg('eventId', () => String, { nullable: true }) eventId?: string,
    @Arg('minAttendance', () => Float, { nullable: true }) minAttendance?: number,
  ): Promise<FlaggedStudent[]> {
    const attendanceStats = await this.statStudentAttendance(
      { auth } as Context,
      eventId,
      undefined,
      minAttendance
    );

    const flagged: FlaggedStudent[] = [];

    for (const stat of attendanceStats.filter((s) => s.isFlagged)) {
      const mentor = stat.project?.mentors?.[0];

      flagged.push({
        student: stat.student,
        mentor: mentor as any,
        project: stat.project,
        reason: `Low attendance: ${Math.round(stat.attendancePercentage * 100)}%`,
        attendancePercentage: stat.attendancePercentage,
        missedMeetings: stat.meetingsTotal - stat.meetingsAttended,
        lastAttendedAt: stat.lastAttendedAt,
      });
    }

    return flagged;
  }
}
