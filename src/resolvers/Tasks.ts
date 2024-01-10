import {
  Resolver, Authorized, Mutation, Arg, Ctx, Query
} from 'type-graphql';
import { PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { GraphQLJSONObject } from 'graphql-type-json';
import { AuthRole, Context } from '../context';
import { getAutomations, runJob } from '../automation';
import { getActivities, getActivitySchema, runActivity } from '../activities';

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

  @Authorized(AuthRole.ADMIN)
  @Query(() => [String])
  automations(): string[] {
    return getAutomations();
  }

  @Authorized(AuthRole.ADMIN)
  @Query(() => [String])
  activities(): string[] {
    return getActivities();
  }

  @Authorized(AuthRole.ADMIN)
  @Query(() => GraphQLJSONObject)
  activitySchema(
    @Arg('functionName', () => String) functionName: string,
  ) {
    return getActivitySchema(functionName) || {};
  }
}
