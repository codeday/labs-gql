import {
  Resolver, Authorized, Mutation, Arg
} from 'type-graphql';
import { PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { AuthRole } from '../context';
import { runJob } from '../automation';

@Service()
@Resolver(Boolean)
export class StudentResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Boolean)
  runCronjob(
    @Arg('functionName', () => String) functionName: string,
  ): boolean {
    return Boolean(runJob(functionName));
  }
}
