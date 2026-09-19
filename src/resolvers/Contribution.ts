import { Resolver, Query } from 'type-graphql';
import { PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Contribution } from '../types';

@Service()
@Resolver(Contribution)
export class ContributionResolver {
  @Inject(() => PrismaClient)
  private readonly prisma: PrismaClient;

  @Query(() => [Contribution])
  async contributions(): Promise<Contribution[]> {
    return this.prisma.project.findMany({
      where: { prShortDescription: { not: null } },
      select: {
        id: true,
        issueUrl: true,
        prUrl: true,
        prShortDescription: true,
        prStatus: true,
        repositoryId: true,
      },
    }) as unknown as Promise<Contribution[]>;
  }
}
