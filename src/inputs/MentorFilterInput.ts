import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { MentorStatus, Track } from '../enums';
import { GtLtEq } from './GtLtEq';

@InputType()
export class MentorFilterInput {
  @Field(() => String, { nullable: true })
  assignedToManager?: string

  @Field(() => MentorStatus, { nullable: true })
  inStatus?: MentorStatus

  @Field(() => Boolean, { nullable: true })
  withProjects?: boolean

  @Field(() => GtLtEq, { nullable: true })
  studentWeeks?: GtLtEq

  @Field(() => Number, { nullable: true })
  weeksGte?: number

  @Field(() => Track, { nullable: true })
  track?: Track

  toQuery(): Prisma.MentorWhereInput {
    return {
      managerUsername: this.assignedToManager,
      status: this.inStatus,
      projects: (this.withProjects || this.studentWeeks || this.track) ? {
        some: {
          ...(this.studentWeeks ? { students: { some: { weeks: this.studentWeeks } } } : {}),
          ...(this.track ? { track: this.track } : {}),
        },
      } : undefined,
      maxWeeks: this.weeksGte ? { gte: this.weeksGte } : undefined,
    };
  }
}
