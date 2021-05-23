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

@Service()
@Resolver(Mentor)
export class MentorResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Query(() => [Mentor])
  async mentors(
    @Arg('where', () => MentorFilterInput, { nullable: true }) where?: MentorFilterInput,
  ): Promise<PrismaMentor[]> {
    return this.prisma.mentor.findMany({ where: where?.toQuery() });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR)
  @MentorOnlySelf('where')
  @Query(() => Mentor, { nullable: true })
  async mentor(
    @Ctx() { auth }: Context,
    @Arg('where', () => IdOrUsernameInput, { nullable: true }) where?: IdOrUsernameInput,
  ): Promise<PrismaMentor | null> {
    return this.prisma.mentor.findUnique({ where: where?.toQuery() || auth.toWhere() });
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Mentor)
  async createMentor(
    @Arg('data', () => MentorCreateInput) data: MentorCreateInput,
  ): Promise<PrismaMentor> {
    return this.prisma.mentor.create({ data: data.toQuery() });
  }

  @Authorized(AuthRole.APPLICANT_MENTOR)
  @Mutation(() => Mentor)
  async applyMentor(
    @Ctx() { auth }: Context,
    @Arg('data', () => MentorApplyInput) data: MentorApplyInput,
  ): Promise<PrismaMentor> {
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
    await this.prisma.mentor.delete({ where });
    return true;
  }
}
