import {
  Resolver, Authorized, Mutation, Arg, Ctx, Query,
} from 'type-graphql';
import { PrismaClient, ScheduledAnnouncement as PrismaScheduledAnnouncement } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context, AuthRole } from '../context';
import { ScheduledAnnouncement } from '../types';
import {
  ScheduledAnnouncementCreateInput,
  ScheduledAnnouncementEditInput,
} from '../inputs';

@Service()
@Resolver(ScheduledAnnouncement)
export class ScheduledAnnouncementResolver {
  @Inject(() => PrismaClient)
  private readonly prisma: PrismaClient;

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Query(() => [ScheduledAnnouncement])
  async scheduledAnnouncements(
    @Ctx() { auth }: Context,
    @Arg('eventId', () => String, { nullable: true }) eventId?: string,
  ): Promise<PrismaScheduledAnnouncement[]> {
    const targetEventId = eventId || auth.eventId;
    if (!targetEventId) {
      throw new Error('Event ID is required');
    }

    return this.prisma.scheduledAnnouncement.findMany({
      where: {
        eventId: targetEventId,
      },
      orderBy: {
        sendAt: 'asc',
      },
    });
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => ScheduledAnnouncement)
  async createScheduledAnnouncement(
    @Ctx() { auth }: Context,
    @Arg('data', () => ScheduledAnnouncementCreateInput) data: ScheduledAnnouncementCreateInput,
  ): Promise<PrismaScheduledAnnouncement> {
    // Validate that the event exists and user has access
    const event = await this.prisma.event.findUnique({
      where: { id: data.eventId },
      select: { id: true },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    if (auth.eventId && auth.eventId !== data.eventId) {
      throw new Error('You can only create announcements for your current event');
    }

    return this.prisma.scheduledAnnouncement.create({
      data: data.toQuery(),
    });
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => ScheduledAnnouncement)
  async editScheduledAnnouncement(
    @Ctx() { auth }: Context,
    @Arg('id', () => String) id: string,
    @Arg('data', () => ScheduledAnnouncementEditInput) data: ScheduledAnnouncementEditInput,
  ): Promise<PrismaScheduledAnnouncement> {
    // Validate that the announcement exists and user has access
    const announcement = await this.prisma.scheduledAnnouncement.findUnique({
      where: { id },
      select: { id: true, eventId: true },
    });

    if (!announcement) {
      throw new Error('Scheduled announcement not found');
    }

    if (auth.eventId && auth.eventId !== announcement.eventId) {
      throw new Error('You can only edit announcements for your current event');
    }

    return this.prisma.scheduledAnnouncement.update({
      where: { id },
      data: data.toQuery(),
    });
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Boolean)
  async deleteScheduledAnnouncement(
    @Ctx() { auth }: Context,
    @Arg('id', () => String) id: string,
  ): Promise<boolean> {
    // Validate that the announcement exists and user has access
    const announcement = await this.prisma.scheduledAnnouncement.findUnique({
      where: { id },
      select: { id: true, eventId: true },
    });

    if (!announcement) {
      throw new Error('Scheduled announcement not found');
    }

    if (auth.eventId && auth.eventId !== announcement.eventId) {
      throw new Error('You can only delete announcements for your current event');
    }

    await this.prisma.scheduledAnnouncement.delete({
      where: { id },
    });

    return true;
  }
}
