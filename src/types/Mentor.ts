import {
  Prisma, Project as PrismaProject, Mentor as PrismaMentor, PrismaClient,
} from '@prisma/client';
import {
  ObjectType, Field, Authorized, Arg, Int,
} from 'type-graphql';
import GraphQLJSON from 'graphql-type-json';
import Container from 'typedi';
import { MentorStatus } from '../enums';
import { AuthRole } from '../context';
import { Project } from './Project';

@ObjectType()
export class Mentor implements PrismaMentor {
  // Metadata
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  // Data
  @Field(() => String, { nullable: true })
  username: string | null

  @Field(() => String)
  givenName: string

  @Field(() => String)
  surname: string

  @Field(() => String)
  name(): string {
    return `${this.givenName} ${this.surname}`;
  }

  @Field(() => String)
  email: string

  @Field(() => MentorStatus)
  status: MentorStatus

  @Field(() => GraphQLJSON)
  profile: Prisma.JsonValue

  @Field(() => String, { nullable: true })
  managerUsername: string | null

  @Field(() => Int)
  maxWeeks: number

  projects?: PrismaProject[] | null

  @Field(() => [Project], { name: 'projects' })
  async fetchProjects(): Promise<PrismaProject[]> {
    if (this.projects) return this.projects;
    return Container.get(PrismaClient).project.findMany({ where: { mentors: { some: { id: this.id } } } });
  }

  @Field(() => GraphQLJSON, { nullable: true })
  profileField(
    @Arg('key', () => String) key: string,
  ): Prisma.JsonValue | null {
    if (typeof this.profile !== 'object' || this.profile === null) return null;
    return (this.profile as {[k: string]: Prisma.JsonValue | undefined})[key] || null;
  }
}
