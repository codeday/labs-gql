import { ObjectType, Field } from 'type-graphql';
import { Project } from './Project';

@ObjectType()
export class Recommendation {
  @Field(() => Number)
  score: number

  @Field(() => Project)
  project: Project
}
