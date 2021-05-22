import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { ProjectStatus, Track } from '../enums';

@InputType()
export class ProjectEditInput {
  @Field(() => String, { nullable: true })
  description?: string

  @Field(() => String, { nullable: true })
  deliverables?: string

  @Field(() => Track, { nullable: true })
  track?: Track

  @Field(() => ProjectStatus, { nullable: true })
  status: ProjectStatus

  @Field(() => Number, { nullable: true })
  maxStudents?: number

  @Field(() => [String], { nullable: true })
  tags?: string[]

  toQuery(): Prisma.ProjectUpdateInput {
    return {
      description: this.description,
      deliverables: this.deliverables,
      track: this.track,
      status: this.status,
      maxStudents: this.maxStudents,
      tags: this.tags ? { set: this.tags.map((id): Prisma.TagWhereUniqueInput => ({ id })) } : undefined,
    };
  }
}
