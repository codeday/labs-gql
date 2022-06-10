import { InputType, Field, Int } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { GraphQLJSONObject } from 'graphql-type-json';
import { Track, PersonType } from '../enums';

@InputType()
export class SurveyCreateInput {
  @Field(() => String)
  slug: string

  @Field(() => String)
  name: string

  @Field(() => PersonType)
  personType: PersonType

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  selfSchema?: object

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  selfUi?: object

  @Field(() => String, { nullable: true })
  selfCaution?: string

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  peerSchema?: object

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  peerUi?: object

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  peerShare?: object

  @Field(() => String, { nullable: true })
  peerCaution?: string


  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  menteeSchema?: object

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  menteeUi?: object

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  menteeShare?: object

  @Field(() => String, { nullable: true })
  menteeCaution?: string


  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  mentorSchema?: object

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  mentorUi?: object

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  mentorShare?: object

  @Field(() => String, { nullable: true })
  mentorCaution?: string

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  projectSchema?: object

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  projectUi?: object

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  projectShare?: object

  @Field(() => String, { nullable: true })
  projectCaution?: string

  toQuery(): Omit<Prisma.SurveyCreateInput, 'event'> {
    return this;
  }
}
