import { InputType, Field, Int } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { GraphQLJSONObject } from 'graphql-type-json';
import { Track, PersonType } from '../enums';

@InputType()
export class SurveyRespondInput {
  @Field(() => GraphQLJSONObject)
  // eslint-disable-next-line @typescript-eslint/ban-types
  response: object

  @Field(() => String, { nullable: true })
  student: string | null

  @Field(() => String, { nullable: true })
  mentor: string | null

  @Field(() => String, { nullable: true })
  project: string | null

  toQuery(): Pick<Prisma.SurveyCreateInput, 'response' & 'student' & 'mentor' & 'project'> {
    return this;
  }
}
