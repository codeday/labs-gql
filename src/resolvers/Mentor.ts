import {
  Resolver, Authorized, Query, Mutation, Arg, Ctx,
} from 'type-graphql';
import { PrismaClient, Mentor as PrismaMentor } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context, AuthRole } from '../context';
import { Mentor } from '../types';
import {
  IdOrUsernameInput, MentorApplyInput, MentorCreateInput, MentorEditInput, MentorFilterInput,
} from '../inputs';
import { MentorOnlySelf } from './decorators';
import { eventAllowsApplicationMentor, idOrUsernameOrAuthToUniqueWhere, idOrUsernameToUniqueWhere, validateMentorEvent } from '../utils';

@Service()
@Resolver(Mentor)
export class MentorResolver {
  @Inject(() => PrismaClient)
  private readonly prisma: PrismaClient;

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Query(() => [Mentor])
  async mentors(
    @Ctx() { auth }: Context,
    @Arg('where', () => MentorFilterInput, { nullable: true }) where?: MentorFilterInput,
    @Arg('skip', () => Number, { nullable: true }) skip?: number,
    @Arg('take', () => Number, { nullable: true }) take?: number,
  ): Promise<PrismaMentor[]> {
    return this.prisma.mentor.findMany({
      where: {
        ...where?.toQuery(),
        ...(auth.eventId ? { event: { id: auth.eventId } } : {}),
      },
      skip,
      take,
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR)
  @MentorOnlySelf('where')
  @Query(() => Mentor, { nullable: true })
  async mentor(
    @Ctx() { auth }: Context,
    @Arg('where', () => IdOrUsernameInput, { nullable: true }) where?: IdOrUsernameInput,
  ): Promise<PrismaMentor | null> {
    const mentor = await this.prisma.mentor.findUniqueOrThrow({
      where: idOrUsernameOrAuthToUniqueWhere(auth, where),
      include: { event: true },
    });
    if (!mentor) return null;
    if (!auth.isMentor && mentor.event.id !== auth.eventId) return null;
    return mentor;
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR)
  @MentorOnlySelf('where')
  @Query(() => Mentor, { nullable: true })
  async mentorPriorParticipation(
    @Ctx() { auth }: Context,
    @Arg('where', () => IdOrUsernameInput, { nullable: true }) where?: IdOrUsernameInput,
  ): Promise<PrismaMentor | null> {
    const currentMentor = await this.prisma.mentor.findUniqueOrThrow({
      where: idOrUsernameOrAuthToUniqueWhere(auth, where),
      select: {
        event: { select: { id: true } },
        email: true,
        username: true,
      }
    });
    if (!currentMentor) return null;
    if (!auth.isMentor && currentMentor.event.id !== auth.eventId) return null;

    return await this.prisma.mentor.findFirstOrThrow({
      where: {
        eventId: { not: currentMentor?.event.id },
        OR: [
          { email: { mode: 'insensitive', equals: currentMentor?.email } },
          ...(currentMentor.username ? [{ username: currentMentor.username }] : []),
        ],
      }
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Mutation(() => Mentor)
  async createMentor(
    @Ctx() { auth }: Context,
    @Arg('data', () => MentorCreateInput) data: MentorCreateInput,
  ): Promise<PrismaMentor> {
    return this.prisma.mentor.create({
      data: {
        ...data.toQuery(),
        event: { connect: { id: auth.eventId } },
      },
    });
  }

  @Authorized(AuthRole.APPLICANT_MENTOR)
  @Mutation(() => Mentor)
  async applyMentor(
    @Ctx() { auth }: Context,
    @Arg('data', () => MentorApplyInput) data: MentorApplyInput,
  ): Promise<PrismaMentor> {
    const event = await this.prisma.event.findUniqueOrThrow({ where: { id: auth.eventId } });
    if (!event) throw Error('Event does not exist.');
    if (!eventAllowsApplicationMentor(event)) throw Error('Mentor applications are not open for this event.');

    return this.prisma.mentor.create({
      data: {
        ...data.toQuery(),
        username: auth.username,
        event: { connect: { id: auth.eventId! } },
      },
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR)
  @MentorOnlySelf('where')
  @Mutation(() => Mentor)
  async editMentor(
    @Ctx() { auth }: Context,
    @Arg('data', () => MentorEditInput) data: MentorEditInput,
    @Arg('where', () => IdOrUsernameInput, { nullable: true }) where?: IdOrUsernameInput,
  ): Promise<PrismaMentor> {
    if (where) await validateMentorEvent(auth, where);

    if ((data.username || data.managerUsername || data.status) && !(auth.isAdmin || auth.isManager)) {
      throw Error('You do not have permission to edit restricted fields.');
    }

    return this.prisma.mentor.update({
      where: idOrUsernameOrAuthToUniqueWhere(auth, where),
      data: data.toQuery(),
    });
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Boolean)
  async deleteMentor(
    @Ctx() { auth }: Context,
    @Arg('where', () => IdOrUsernameInput) where: IdOrUsernameInput,
  ): Promise<boolean> {
    await this.prisma.mentor.deleteMany({ where: { ...where, eventId: auth.eventId! } });
    return true;
  }
}
