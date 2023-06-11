import { InputType, Field, Int } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { GraphQLJSONObject } from 'graphql-type-json';
import { StudentStatus, Track } from '../enums';

@InputType()
export class StudentCreateInput {
  @Field(() => String)
  givenName: string

  @Field(() => String)
  surname: string

  @Field(() => String)
  email: string

  @Field(() => String)
  username: string

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  profile?: object

  @Field(() => StudentStatus, { nullable: true })
  status?: StudentStatus

  @Field(() => Track)
  track: Track

  @Field(() => Int)
  minHours: number

  @Field(() => Int, { nullable: true })
  weeks?: number

  @Field(() => Boolean, { nullable: true })
  skipPreferences?: boolean

  @Field(() => String, { nullable: true })
  partnerCode?: string

  @Field(() => [String], { nullable: true })
  tags?: string[]

  toQuery(): Prisma.StudentCreateInput {
    return {
      givenName: this.givenName,
      surname: this.surname,
      username: this.username,
      email: this.email,
      profile: this.profile || {},
      status: this.status,
      track: this.track,
      minHours: this.minHours,
      weeks: this.weeks,
      partnerCode: this.partnerCode,
      skipPreferences: this.skipPreferences,
      tags: this.tags ? { connect: this.tags.map((id): Prisma.TagWhereUniqueInput => ({ id })) } : undefined,
    };
  }
}
