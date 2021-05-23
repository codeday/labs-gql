import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { GraphQLJSONObject } from 'graphql-type-json';
import { StudentStatus, Track } from '../enums';

@InputType()
export class StudentApplyInput {
  @Field(() => String)
  givenName: string

  @Field(() => String)
  surname: string

  @Field(() => String)
  email: string

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  profile?: object

  @Field(() => Track)
  track: Track

  @Field(() => String, { nullable: true })
  partnerCode?: string

  toQuery(): Omit<Prisma.StudentCreateInput, 'username'> {
    return {
      givenName: this.givenName,
      surname: this.surname,
      email: this.email,
      profile: this.profile || {},
      status: StudentStatus.APPLIED,
      track: this.track,
      partnerCode: this.partnerCode,
    };
  }
}
