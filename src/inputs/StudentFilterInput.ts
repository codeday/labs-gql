import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { StudentStatus, Track } from '../enums';
import { someNoneUndefined } from '../utils';
import { GtLtEq } from './GtLtEq';

@InputType()
export class StudentFilterInput {
  @Field(() => StudentStatus, { nullable: true })
  inStatus?: StudentStatus

  @Field(() => Boolean, { nullable: true })
  withProjects?: boolean

  @Field(() => String, { nullable: true })
  partnerCode?: string

  @Field(() => String, { nullable: true })
  givenName?: string

  @Field(() => String, { nullable: true })
  surname?: string

  @Field(() => String, { nullable: true })
  email?: string

  @Field(() => GtLtEq, { nullable: true })
  weeks?: GtLtEq

  @Field(() => Track, { nullable: true })
  track?: Track

  @Field(() => String, { nullable: true })
  id?: string;

  toQuery(): Prisma.StudentWhereInput {
    return {
      status: this.inStatus,
      partnerCode: this.partnerCode,
      projects: someNoneUndefined(this.withProjects),
      givenName: this.givenName,
      surname: this.surname,
      email: this.email,
      weeks: this.weeks,
      track: this.track,
      id: this.id,
    };
  }
}
