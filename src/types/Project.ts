import {
  Mentor as PrismaMentor,
  Project as PrismaProject,
  Tag as PrismaTag,
  Student as PrismaStudent,
  PrismaClient,
} from '@prisma/client';
import { Container } from 'typedi';
import {
  ObjectType, Field, Int,
} from 'type-graphql';
import { Track, ProjectStatus } from '../enums';
import { Tag } from './Tag';
import { Mentor } from './Mentor';
import { Student } from './Student';

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

  tags: PrismaTag[]

  @Field(() => [Tag], { name: 'tags' })
  async fetchTags(): Promise<PrismaTag[]> {
    if (!this.tags) {
      this.tags = await Container.get(PrismaClient).tag.findMany({ where: { projects: { some: { id: this.id } } } });
    }
    return this.tags;
  }

  mentors: PrismaMentor[]

  @Field(() => [Mentor], { name: 'mentors' })
  async fetchMentors(): Promise<PrismaMentor[]> {
    if (!this.mentors) {
      this.mentors = await Container.get(PrismaClient).mentor.findMany({
        where: { projects: { some: { id: this.id } } },
      });
    }
    return this.mentors;
  }

  students?: PrismaStudent[] | null

  @Field(() => [Student], { name: 'students' })
  async fetchStudents(): Promise<PrismaStudent[]> {
    if (!this.students) {
      this.students = await Container.get(PrismaClient).student.findMany({
        where: { projects: { some: { id: this.id } } },
      });
    }
    return this.students;
  }

  @Field(() => Number)
  async studentCount(): Promise<number> {
    return (await this.fetchStudents()).length;
  }
}
