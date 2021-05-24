import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { MentorStatus } from '../enums';

@InputType()
export class MentorFilterInput {
  @Field(() => String, { nullable: true })
  assignedToManager?: string

  @Field(() => MentorStatus, { nullable: true })
  inStatus?: MentorStatus

  @Field(() => Boolean, { nullable: true })
  withProjects?: boolean

  @Field(() => Number, { nullable: true })
  weeksGte?: number

  toQuery(): Prisma.MentorWhereInput {
    return {
      managerUsername: this.assignedToManager,
      status: this.inStatus,
      projects: this.withProjects ? { some: {} } : undefined,
      maxWeeks: this.weeksGte ? { gte: this.weeksGte } : undefined,
    };
  }
}
