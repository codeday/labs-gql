import {
  Repository as PrismaRepository,
  PrismaClient
} from '@prisma/client';
import { ObjectType, Field, Int } from 'type-graphql';
import Container from 'typedi';

@ObjectType()
export class Repository implements PrismaRepository {
  // Metadata
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  // Data
  @Field(() => String, { nullable: true })
  logoUrl: string | null

  @Field(() => String)
  name: string

  @Field(() => String)
  url: string

  @Field(() => Int, { name: 'projectCount' })
  async projectCount(): Promise<number> {
    return Container.get(PrismaClient).project.count({
      where: { repositoryId: this.id }
    });
  }
}
