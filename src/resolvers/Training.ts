import {
  Resolver, Authorized, Ctx, Mutation, Arg,
} from 'type-graphql';
import { PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { AuthRole, Context } from '../context';

@Service()
@Resolver(Boolean)
export class TrainingResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Authorized(AuthRole.STUDENT)
  @Mutation(() => Boolean)
  async submitTraining(
    @Ctx() { auth }: Context,
    @Arg('tag', () => String) tag: string,
    @Arg('url', () => String) url: string,
  ): Promise<boolean> {
    await this.prisma.tagTrainingSubmission.create({
      data: {
        student: { connect: auth.toWhere() },
        tag: { connect: { id: tag } },
        url,
      },
    });

    return true;
  }
}
