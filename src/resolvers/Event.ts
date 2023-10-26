import {
  Resolver, Authorized, Query, Ctx, Arg,
} from 'type-graphql';
import { Event as PrismaEvent, PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context } from '../context';
import { Event } from '../types';
import { EventsWhereInput } from '../inputs';

@Service()
@Resolver(Event)
export class EventResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Authorized()
  @Query(() => Event, { nullable: true })
  async event(
    @Ctx() { auth }: Context,
  ): Promise<PrismaEvent> {
    return this.prisma.event.findUnique({ where: { id: auth.eventId! }, rejectOnNotFound: true });
  }

  @Query(() => [Event], { nullable: true })
  async events(
    @Ctx() { auth }: Context,
    @Arg('where', () => EventsWhereInput, { nullable: true }) where?: EventsWhereInput,
  ): Promise<PrismaEvent[]> {
    return this.prisma.event.findMany({
      where: {
        AND: [
          where ? where.toQuery() : {},
          auth.isUnspecified ? {
            OR: [
              { mentors: { some: { username: auth.username } } },
              { mentors: { some: { managerUsername: auth.username } } },
              { students: { some: { username: auth.username } } },
            ],
          } : {},
        ],
      },
    });
  }
}
