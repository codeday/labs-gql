import { InputType, Field } from 'type-graphql';

@InputType()
export class GtLtEq {
  @Field(() => Number, { nullable: true })
  gt?: number

  @Field(() => Number, { nullable: true })
  gte?: number

  @Field(() => Number, { nullable: true })
  lt?: number

  @Field(() => Number, { nullable: true })
  lte?: number

  @Field(() => Number, { nullable: true })
  eq?: number
}
