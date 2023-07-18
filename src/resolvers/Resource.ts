import {
  Resolver, Authorized, Arg, Ctx, Mutation, Float, Query,
} from 'type-graphql';
import { Resource as PrismaResource, PrismaClient, Prisma } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context, AuthRole } from '../context';
import { ResourceCreateInput, ResourceEditInput } from '../inputs';
import { Resource } from '../types/Resource';
import { AllowedFieldsWithType } from '../utils';

const WHERE_KEYS:
  Partial<Record<AuthRole, keyof AllowedFieldsWithType<Resource, boolean>>> =
    {
      [AuthRole.MENTOR]: 'displayToMentors',
      [AuthRole.STUDENT]: 'displayToStudents',
      [AuthRole.PARTNER]: 'displayToPartners',
      [AuthRole.MANAGER]: 'displayToManagers',
    };

@Service()
@Resolver(Resource)
export class ResourceResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Resource)
  async addResource(
    @Ctx() { auth }: Context,
    @Arg('data', () => ResourceCreateInput) data: ResourceCreateInput,
  ): Promise<PrismaResource> {
    return this.prisma.resource.create({
      data: {
        ...data,
        event: { connect: { id: auth.eventId } },
      },
    });
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Resource)
  async editResource(
    @Ctx() { auth }: Context,
    @Arg('where', () => String) where: string,
    @Arg('data', () => ResourceEditInput) data: ResourceEditInput,
  ): Promise<PrismaResource> {
    return this.prisma.resource.update({
      where: { id: where },
      data: {
        ...data,
      },
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.STUDENT, AuthRole.MENTOR)
  @Query(() => [Resource])
  async resources(
    @Ctx() { auth }: Context,
  ): Promise<PrismaResource[]> {
    return this.prisma.resource.findMany({
      where: {
        [WHERE_KEYS[auth.type!] as string]: true,
      },
    });
  }
}
