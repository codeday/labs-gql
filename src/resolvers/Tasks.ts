import {
  Resolver, Authorized, Mutation, Arg, Ctx
} from 'type-graphql';
import { PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { GraphQLJSONObject } from 'graphql-type-json';
import { AuthRole, Context } from '../context';
import { runJob } from '../automation';
import { runActivity } from '../activities';

@Service()
@Resolver(Boolean)
export class TasksResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Boolean)
  runAutomation(
    @Arg('functionName', () => String) functionName: string,
  ): boolean {
    return Boolean(runJob(functionName));
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Boolean)
  runActivity(
    @Arg('functionName', () => String) functionName: string,
    @Arg('args', () => GraphQLJSONObject) args: object,
    @Ctx() context: Context, 
  ): boolean {
    return Boolean(runActivity(functionName, context, args));
  }
}
