import {
  Resolver, Authorized, Mutation, Arg, Ctx, Query
} from 'type-graphql';
import { PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { AuthRole, Context } from '../context';

@Service()
@Resolver(String)
export class StandupResolver {
  @Inject(() => PrismaClient)
  private readonly prisma: PrismaClient;

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.PARTNER)
  @Mutation(() => Boolean)
  async rateStandup(
    @Ctx() { auth }: Context,
    @Arg('where', () => String) where: string,
    @Arg('rating', () => Number) rating: number,
  ): Promise<boolean> {
    if (auth.type === AuthRole.PARTNER) {
      const previousStandup = await this.prisma.standupResult.findUniqueOrThrow({
        where: { id: where },
        select: { student: { select: { partnerCode: true } } },
        rejectOnNotFound: true,
      });

      if (auth.partnerCode !== previousStandup.student.partnerCode) {
        throw new Error('No permission to edit this student\'s standups.');
      }
    }

    if (Math.round(rating) !== rating || rating < 1 || rating > 3) {
      throw new Error('Rating must be 1, 2, or 3.');
    }

    await this.prisma.standupResult.update({
      where: { id: where },
      data: {
        rating,
        humanRated: true,
        trainingSubmitted: false,
      },
    });

    return true;
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.PARTNER, AuthRole.STUDENT, AuthRole.MENTOR)
  @Query(() => String)
  async getStandup(
    @Ctx() { auth }: Context,
    @Arg('where', () => String) where: string,
  ): Promise<string> {
    const standup = await this.prisma.standupResult.findUniqueOrThrow({
      where: { id: where },
      select: { text: true, student: { select: { partnerCode: true, id: true } } },
      rejectOnNotFound: true,
    });

    if (auth.type === AuthRole.PARTNER) {
      if (auth.partnerCode !== standup.student.partnerCode) {
        throw new Error('No permission to view this student\'s standups.');
      }
    } else if (auth.isMentor) {
      const id = auth.id ?? (await this.prisma.mentor.findUniqueOrThrow({ where: { username_eventId: { username: auth.username!, eventId: auth.eventId! } } }))?.id!;
      const projectCount = await this.prisma.project.count({
        where: {
          mentors: { some: { id: id } },
          students: { some: { id: standup.student.id } },
        }
      });
      if (projectCount === 0) {
        throw new Error(`Cannot access this standup.`)
      }
    } else if (auth.isStudent) {
      const id = auth.id ?? (await this.prisma.student.findUniqueOrThrow({ where: { username_eventId: { username: auth.username!, eventId: auth.eventId! } } }))?.id!;
      if (standup.student.id !== id) {
        throw new Error(`Cannot access this standup.`);
      }
    }

    return standup.text;
  }
}