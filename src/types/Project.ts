import {
  Mentor as PrismaMentor, Project as PrismaProject, PrismaClient, ProjectStatus,
} from '@prisma/client';
import { Container } from 'typedi';
import {
  ObjectType, Field, Int,
} from 'type-graphql';
import { Track } from '../enums';
import { Mentor } from './Mentor';

@ObjectType()
export class Project implements PrismaProject {
  // Metadata
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  // Data
  @Field(() => String, { nullable: true })
  description: string | null

  @Field(() => String, { nullable: true })
  deliverables: string | null

  @Field(() => Track)
  track: Track

  @Field(() => Int)
  maxStudents: number

  @Field(() => ProjectStatus)
  status: ProjectStatus

  mentors: PrismaMentor[]

  @Field(() => [Mentor], { name: 'mentors' })
  async fetchMentors(): Promise<PrismaMentor[]> {
    if (this.mentors) return this.mentors;
    return Container.get(PrismaClient).mentor.findMany({ where: { projects: { some: { id: this.id } } } });
  }
}
