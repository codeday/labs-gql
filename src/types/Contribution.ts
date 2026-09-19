import { Repository as PrismaRepository, PrismaClient } from '@prisma/client';
import { ObjectType, Field } from 'type-graphql';
import Container from 'typedi';
import { PrStatus } from '../enums';
import { Repository } from './Repository';

@ObjectType()
export class Contribution {
  @Field(() => String)
  id: string

  @Field(() => String, { nullable: true })
  issueUrl: string | null

  @Field(() => String, { nullable: true })
  prUrl: string | null

  prShortDescription: string | null

  @Field(() => String, { name: 'shortDescription' })
  fetchShortDescription(): string {
    return this.prShortDescription!;
  }

  @Field(() => PrStatus, { nullable: true })
  prStatus: PrStatus | null

  repositoryId: string | null

  repository?: PrismaRepository | null

  @Field(() => Repository, { name: 'repository', nullable: true })
  async fetchRepository(): Promise<PrismaRepository | null> {
    if (!this.repositoryId) return null;
    if (!this.repository) {
      this.repository = await Container.get(PrismaClient).repository.findUnique({ where: { id: this.repositoryId } });
    }

    return this.repository ?? null;
  }
}
