import {
  Resolver, Authorized, Query, Arg, Ctx,
} from 'type-graphql';
import { PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { DateTime } from 'luxon';
import { Context, AuthRole } from '../context';
import { Track, StudentStatus } from '../enums';
import { Stat } from '../types/Stat';
import { StatOutcomes, YearStatOutcomes } from '../types/StatOutcomes';
import { ttlCache } from '../utils';

const STAT_OUTCOMES_CACHE_TTL_MS = 60 * 60 * 1000;

// Projects matched before 2025 don't reliably have a tracked prUrl, so we estimate
// their PR completion rate using the historical rate observed once tracking began.
const PRE_2025_PR_RATE = 0.71;
const PR_TRACKING_START_YEAR = 2025;

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

  private readonly getCachedStatOutcomes = ttlCache(
    STAT_OUTCOMES_CACHE_TTL_MS,
    () => this.computeStatOutcomes(),
  );

  private readonly getCachedStatOutcomesByYear = ttlCache(
    STAT_OUTCOMES_CACHE_TTL_MS,
    () => this.computeStatOutcomesByYear(),
  );

  @Query(() => StatOutcomes)
  async statOutcomes(): Promise<StatOutcomes> {
    return this.getCachedStatOutcomes();
  }

  @Query(() => [YearStatOutcomes])
  async statOutcomesByYear(): Promise<YearStatOutcomes[]> {
    return this.getCachedStatOutcomesByYear();
  }

  private async computeStatOutcomes(): Promise<StatOutcomes> {
    const [
      studentCount,
      volunteerCount,
      projectCount,
      prCount,
      studentHours,
      volunteerHours,
    ] = await Promise.all([
      this.prisma.student.count({ where: { status: 'ACCEPTED' } }),
      this.prisma.mentor.count({ where: { status: 'ACCEPTED' } }),
      this.prisma.project.count({ where: { status: 'MATCHED' } }),

      this.prisma.$queryRaw<{ prCount: number }[]>`
        select coalesce(sum(
          case
            when extract(year from e."startsAt") >= ${PR_TRACKING_START_YEAR}::int then
              case when p."prUrl" is not null then 1 else 0 end
            else ${PRE_2025_PR_RATE}::float
          end
        ), 0)::float as "prCount"
        from "Project" p
        join "Event" e on e.id = p."eventId"
        where p.status = 'MATCHED';
      `,

      this.prisma.$queryRaw<{ studentHours: number }[]>`
        select coalesce(sum(("minHours" + 6) * weeks), 0)::float as "studentHours"
        from "Student"
        where status = 'ACCEPTED';
      `,

      this.prisma.$queryRaw<{ volunteerHours: number }[]>`
        select coalesce(sum("maxWeeks"), 0)::float * 2 as "volunteerHours"
        from "Mentor"
        where status = 'ACCEPTED';
      `,
    ]);

    const studentHoursValue = Math.round(studentHours[0].studentHours);
    const volunteerHoursValue = Math.round(volunteerHours[0].volunteerHours);

    return {
      studentCount,
      volunteerCount,
      projectCount,
      prCount: Math.round(prCount[0].prCount),
      studentHours: studentHoursValue,
      volunteerHours: volunteerHoursValue,
      hours: studentHoursValue + volunteerHoursValue,
    };
  }

  private async computeStatOutcomesByYear(): Promise<YearStatOutcomes[]> {
    const [studentsByYear, mentorsByYear, projectsByYear] = await Promise.all([
      this.prisma.$queryRaw<{ year: number, studentCount: number, studentHours: number }[]>`
        select
          extract(year from e."startsAt")::int as year,
          count(*)::int as "studentCount",
          coalesce(sum(("minHours" + 6) * s.weeks), 0)::float as "studentHours"
        from "Student" s
        join "Event" e on e.id = s."eventId"
        where s.status = 'ACCEPTED'
        group by 1;
      `,

      this.prisma.$queryRaw<{ year: number, volunteerCount: number, volunteerHours: number }[]>`
        select
          extract(year from e."startsAt")::int as year,
          count(*)::int as "volunteerCount",
          coalesce(sum(m."maxWeeks"), 0)::float * 2 as "volunteerHours"
        from "Mentor" m
        join "Event" e on e.id = m."eventId"
        where m.status = 'ACCEPTED'
        group by 1;
      `,

      this.prisma.$queryRaw<{ year: number, projectCount: number, prCount: number }[]>`
        select
          extract(year from e."startsAt")::int as year,
          count(*)::int as "projectCount",
          coalesce(sum(
            case
              when extract(year from e."startsAt") >= ${PR_TRACKING_START_YEAR}::int then
                case when p."prUrl" is not null then 1 else 0 end
              else ${PRE_2025_PR_RATE}::float
            end
          ), 0)::float as "prCount"
        from "Project" p
        join "Event" e on e.id = p."eventId"
        where p.status = 'MATCHED'
        group by 1;
      `,
    ]);

    const byYear = new Map<number, StatOutcomes>();
    const getYear = (year: number): StatOutcomes => {
      if (!byYear.has(year)) {
        byYear.set(year, {
          studentCount: 0,
          volunteerCount: 0,
          projectCount: 0,
          prCount: 0,
          studentHours: 0,
          volunteerHours: 0,
          hours: 0,
        });
      }
      return byYear.get(year) as StatOutcomes;
    };

    studentsByYear.forEach(({ year, studentCount, studentHours }) => {
      const outcomes = getYear(year);
      outcomes.studentCount = studentCount;
      outcomes.studentHours = Math.round(studentHours);
    });

    mentorsByYear.forEach(({ year, volunteerCount, volunteerHours }) => {
      const outcomes = getYear(year);
      outcomes.volunteerCount = volunteerCount;
      outcomes.volunteerHours = Math.round(volunteerHours);
    });

    projectsByYear.forEach(({ year, projectCount, prCount }) => {
      const outcomes = getYear(year);
      outcomes.projectCount = projectCount;
      outcomes.prCount = Math.round(prCount);
    });

    return Array.from(byYear.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, statOutcomes]) => ({
        year,
        statOutcomes: {
          ...statOutcomes,
          hours: statOutcomes.studentHours + statOutcomes.volunteerHours,
        },
      }));
  }

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
