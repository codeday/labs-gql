import { InputType, Field, Int } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { GraphQLJSONObject } from 'graphql-type-json';
import { MentorStatus } from '../enums';

@InputType()
export class MentorEditInput {
  @Field(() => String, { nullable: true })
  givenName?: string

  @Field(() => String, { nullable: true })
  surname?: string

  @Field(() => String, { nullable: true })
  email?: string

  @Field(() => String, { nullable: true })
  username?: string

  @Field(() => MentorStatus, { nullable: true })
  status?: MentorStatus

  @Field(() => Int, { nullable: true })
  maxWeeks?: number

  @Field(() => String, { nullable: true })
  managerUsername?: string

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  profile?: object

  toQuery(): Prisma.MentorUpdateInput {
    return {
      givenName: this.givenName,
      surname: this.surname,
      username: this.username,
      email: this.email,
      status: this.status,
      maxWeeks: this.maxWeeks,
      profile: this.profile,
      managerUsername: this.managerUsername,
    };
  }
}
