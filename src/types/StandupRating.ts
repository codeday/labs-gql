import { Field, Int, ObjectType, registerEnumType } from "type-graphql";

@ObjectType()
export class StandupRating {
  @Field(() => String, { nullable: true })
  id: string | null;

  @Field(() => Date)
  dueAt: Date;

  @Field(() => Int, { nullable: true })
  rating: number | null;

  @Field(() => Boolean)
  humanRated: boolean;
}