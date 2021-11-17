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
import { eventAllowsApplicationMentor } from '../utils';

@Service()
@Resolver(Mentor)
export class MentorResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

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
        event: { id: auth.eventId },
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
    const mentor = this.prisma.mentor.findUnique({
      where: where ? where?.toQuery() : auth.toWhere(),
      include: { event: true },
    });
    if (!auth.isMentor && mentor.event.id !== auth.eventId) return null;
    return mentor;
  }

  @Authorized(AuthRole.ADMIN)
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
    if (!auth.eventId) throw Error('Event id in authentication token is required to apply.');
    const event = await this.prisma.event.findUnique({ where: { id: auth.eventId } });
    if (!event) throw Error('Event does not exist.');
    if (!eventAllowsApplicationMentor(event)) throw Error('Mentor applications are not open for this event.');

    return this.prisma.mentor.create({
      data: {
        ...data.toQuery(),
        username: auth.username,
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
    if ((data.username || data.managerUsername || data.status) && !(auth.isAdmin || auth.isManager)) {
      throw Error('You do not have permission to edit restricted fields.');
    }

    // TODO(@tylermenezes) validate event id
    return this.prisma.mentor.update({
      where: where?.toQuery() || auth.toWhere(),
      data: data.toQuery(),
    });
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Boolean)
  async deleteMentor(
    @Arg('where', () => IdOrUsernameInput) where: IdOrUsernameInput,
  ): Promise<boolean> {
    // TODO(@tylermenezes) validate event id
    await this.prisma.mentor.delete({ where });
    return true;
  }
}
