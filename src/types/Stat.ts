import { ObjectType, Field } from 'type-graphql';

@ObjectType()
export class Stat {
  @Field(() => String)
  key: string

  @Field(() => Number)
  value: number
}
