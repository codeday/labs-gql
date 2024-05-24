import {
  Resolver, Authorized, Query, Arg, Ctx,
} from 'type-graphql';
import { PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { DateTime } from 'luxon';
import { Context, AuthRole } from '../context';
import { Track, StudentStatus } from '../enums';
import { Stat } from '../types/Stat';

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
}
