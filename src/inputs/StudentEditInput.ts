import { InputType, Field, Int } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { GraphQLJSONObject } from 'graphql-type-json';
import { StudentStatus, Track } from '../enums';

@InputType()
export class StudentEditInput {
  @Field(() => String, { nullable: true })
  givenName?: string

  @Field(() => String, { nullable: true })
  surname?: string

  @Field(() => String, { nullable: true })
  email?: string

  @Field(() => String, { nullable: true })
  username?: string

  @Field(() => StudentStatus, { nullable: true })
  status?: StudentStatus

  @Field(() => Track, { nullable: true })
  track?: Track

  @Field(() => Int, { nullable: true })
  minHours?: number

  @Field(() => Int, { nullable: true })
  weeks?: number

  @Field(() => Boolean, { nullable: true })
  skipPreferences?: boolean

  @Field(() => String, { nullable: true })
  interviewNotes?: string

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  profile?: object

  @Field(() => String, { nullable: true })
  partnerCode?: string

  @Field(() => [String], { nullable: true })
  tags?: string[]

  toQuery(): Prisma.StudentUpdateInput {
    return {
      givenName: this.givenName ?? undefined,
      surname: this.surname ?? undefined,
      username: this.username ?? undefined,
      email: this.email ?? undefined,
      status: this.status ?? undefined,
      track: this.track ?? undefined,
      weeks: this.weeks ?? undefined,
      minHours: this.minHours ?? undefined,
      profile: this.profile ?? undefined,
      partnerCode: this.partnerCode ?? undefined,
      interviewNotes: this.interviewNotes ?? undefined,
      skipPreferences: typeof this.skipPreferences === 'boolean'
        ? this.skipPreferences
        : undefined,
      tags: this.tags ? { set: this.tags.map((id): Prisma.TagWhereUniqueInput => ({ id })) } : undefined,
    };
  }
}
