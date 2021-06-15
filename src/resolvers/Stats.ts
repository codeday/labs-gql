import {
  Resolver, Authorized, Query, Arg,
} from 'type-graphql';
import { PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { DateTime } from 'luxon';
import { AuthRole } from '../context';
import { Track, StudentStatus } from '../enums';
import { Stat } from '../types/Stat';

@Service()
@Resolver(Stat)
export class StatsResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Authorized(AuthRole.ADMIN)
  @Query(() => [Stat])
  async statAdmissionsStatus(
    @Arg('track', () => Track, { nullable: true }) track?: Track,
  ): Promise<Stat[]> {
    const allStudents = await this.prisma.student.groupBy({
      by: ['status'],
      _count: { status: true },
      where: { track },
    });

    const expiredStudents = await this.prisma.student.count({
      where: {
        track,
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
