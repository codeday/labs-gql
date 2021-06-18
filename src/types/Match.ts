import { ObjectType, Field } from 'type-graphql';
import { Project } from './Project';

@ObjectType()
export class Match {
  @Field(() => Number)
  score: number

  @Field(() => Project)
  project: Project
}
