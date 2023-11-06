import {
  Resolver, Authorized, Arg, Ctx, Mutation, Query,
} from 'type-graphql';
import { Repository as PrismaRepository, PrismaClient, Prisma } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context, AuthRole } from '../context';
import { RepositoryCreateInput, RepositoryEditInput, RepositoryWhereInput } from '../inputs';
import { Repository } from '../types';

@Service()
@Resolver(Repository)
export class RepositoryResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Repository)
  async addRepository(
    @Arg('data', () => RepositoryCreateInput) data: RepositoryCreateInput,
  ): Promise<PrismaRepository> {
    return this.prisma.repository.create({
      data: {
        ...data,
      },
    });
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Repository)
  async editRepository(
    @Arg('where', () => String) where: string,
    @Arg('data', () => RepositoryEditInput) data: RepositoryEditInput,
  ): Promise<PrismaRepository> {
    return this.prisma.repository.update({
      where: { id: where },
      data: data.toQuery(),
    });
  }

  @Query(() => [Repository])
  async repositories(
    @Arg('where', () => RepositoryWhereInput, { nullable: true }) where: RepositoryWhereInput,
  ): Promise<PrismaRepository[]> {
    return this.prisma.repository.findMany({ where: where.toQuery() });
  }
}
