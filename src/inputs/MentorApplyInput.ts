import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { GraphQLJSONObject } from 'graphql-type-json';
import { MentorStatus } from '../enums';
import { ProjectCreateInput } from './ProjectCreateInput';

@InputType()
export class MentorApplyInput {
  @Field(() => String)
  givenName: string

  @Field(() => String)
  surname: string

  @Field(() => String)
  email: string

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  profile?: object

  @Field(() => [ProjectCreateInput])
  projects: ProjectCreateInput[]

  toQuery(): Omit<Prisma.MentorCreateInput, 'username'> {
    return {
      givenName: this.givenName,
      surname: this.surname,
      email: this.email,
      profile: this.profile || {},
      status: MentorStatus.APPLIED,
      projects: { create: this.projects.map((p) => p.toQuery()) },
    };
  }
}
