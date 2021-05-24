import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { GraphQLJSONObject } from 'graphql-type-json';
import { MentorStatus } from '../enums';

@InputType()
export class MentorCreateInput {
  @Field(() => String)
  givenName: string

  @Field(() => String)
  surname: string

  @Field(() => String)
  email: string

  @Field(() => String, { nullable: true })
  username?: string

  @Field(() => MentorStatus, { nullable: true })
  status?: MentorStatus

  @Field(() => Number, { nullable: true })
  maxWeeks?: number

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  profile?: object

  toQuery(): Prisma.MentorCreateInput {
    return {
      givenName: this.givenName,
      surname: this.surname,
      username: this.username,
      email: this.email,
      maxWeeks: this.maxWeeks,
      profile: this.profile || {},
      status: this.status,
    };
  }
}
