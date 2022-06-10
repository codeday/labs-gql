import {
  Resolver, Authorized, Query, Ctx,
} from 'type-graphql';
import { Event as PrismaEvent, PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context } from '../context';
import { Event } from '../types';

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
}
