import { ObjectType, Field, Int } from 'type-graphql';

@ObjectType()
export class StatOutcomes {
  @Field(() => Int)
  studentCount: number;

  @Field(() => Int)
  volunteerCount: number;

  @Field(() => Int)
  projectCount: number;

  @Field(() => Int)
  prCount: number;

  @Field(() => Int)
  studentHours: number;

  @Field(() => Int)
  volunteerHours: number;

  @Field(() => Int)
  hours: number;
}

@ObjectType()
export class YearStatOutcomes {
  @Field(() => Int)
  year: number;

  @Field(() => StatOutcomes)
  statOutcomes: StatOutcomes;
}
