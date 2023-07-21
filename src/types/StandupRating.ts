import { Field, Int, ObjectType, registerEnumType } from "type-graphql";

@ObjectType()
export class StandupRating {
  @Field(() => Date)
  dueAt: Date;

  @Field(() => Int, { nullable: true })
  rating: number | null;
}