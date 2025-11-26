import {
  PrismaClient,
  TagTrainingSubmission as PrismaTagTrainingSubmission,
  Tag as PrismaTag,
  Student as PrismaStudent,
} from '@prisma/client';
import { ObjectType, Field } from 'type-graphql';
import { Container } from 'typedi';
import { Tag } from './Tag';
import { Student } from './Student';

@ObjectType()
export class TagTrainingSubmission implements PrismaTagTrainingSubmission {
  // Metadata
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  // Data
  @Field(() => String)
  url: string

  tag: Tag

  student: Student

  studentId: string

  tagId: string

  @Field(() => Tag, { name: 'tag' })
  async fetchTag(): Promise<PrismaTag> {
    if (this.tag) return this.tag;
    return <PrismaTag><unknown>Container.get(PrismaClient).tag.findUniqueOrThrow({ where: { id: this.tagId } });
  }

  @Field(() => Student, { name: 'student' })
  async fetchStudent(): Promise<PrismaStudent> {
    if (this.tag) return this.student;
    return <PrismaStudent><unknown>Container.get(PrismaClient).tag.findUniqueOrThrow({ where: { id: this.tagId } });
  }
}
