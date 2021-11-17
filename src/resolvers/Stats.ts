import {
  Resolver, Authorized, Query, Arg, Ctx,
} from 'type-graphql';
import { PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { DateTime } from 'luxon';
import { Context, AuthRole } from '../context';
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
