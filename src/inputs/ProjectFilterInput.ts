import { InputType, Field } from 'type-graphql';
import { Prisma, ProjectStatus } from '@prisma/client';
import { MentorStatus, Track } from '../enums';
import { GtLtEq } from './GtLtEq';

@InputType()
export class ProjectFilterInput {
  @Field(() => String, { nullable: true })
  assignedToManager?: string

  @Field(() => ProjectStatus, { nullable: true })
  status?: ProjectStatus

  @Field(() => GtLtEq, { nullable: true })
  studentWeeks?: GtLtEq

  @Field(() => Number, { nullable: true })
  weeksGte?: number

  @Field(() => Track, { nullable: true })
  track?: Track

  toQuery(): Prisma.ProjectWhereInput {
    return {
      ...(this.status ? { status: this.status } : {}),
      ...(this.studentWeeks ? { students: { some: { weeks: this.studentWeeks } } } : {}),
      ...(this.track ? { track: this.track } : {}),
      ...((this.weeksGte || this.assignedToManager)
        ? { mentors: { some: {
            ...(this.weeksGte ? { maxWeeks: { gte: this.weeksGte } } : {}),
            ...(this.assignedToManager ? { managerUsername: this.assignedToManager } : {}),
          } } }
        : {}),
    };
  }
}
