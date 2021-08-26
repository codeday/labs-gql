import { ObjectType, Field } from 'type-graphql';

@ObjectType()
export class Event {
  @Field(() => String)
  id: string;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;

  @Field(() => String)
  slug: string

  @Field(() => String)
  name: string;

  @Field(() => Date)
  studentApplicationsStartAt: Date;

  @Field(() => Date)
  mentorApplicationsStartAt: Date;

  @Field(() => Date)
  studentApplicationsEndAt: Date;

  @Field(() => Date)
  mentorApplicationsEndAt: Date;

  @Field(() => Date)
  startsAt: Date;

  @Field(() => String)
  matchingAlgorithm: string;

  @Field(() => String)
  emailTemplate: string;
}
