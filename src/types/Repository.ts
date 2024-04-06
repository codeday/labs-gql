import {
  Repository as PrismaRepository,
  Project as PrismaProject,
  PrismaClient
} from '@prisma/client';
import { ObjectType, Field, Int, Authorized } from 'type-graphql';
import Container from 'typedi';
import { Project } from './Project';
import { AuthRole } from '../context';

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

  projects?: PrismaProject[]

  @Field(() => [Project], { name: 'projects' })
  @Authorized(AuthRole.ADMIN, AuthRole.MENTOR, AuthRole.OPEN_SOURCE_MANAGER)
  async fetchProjects(): Promise<PrismaProject[]> {
    if (!this.projects) {
      this.projects = await Container.get(PrismaClient).project.findMany({
        where: { repositoryId: this.id }
      });
    }

    return this.projects;
  }

  @Field(() => Int, { nullable: true })
  usersExp: number | null
}
