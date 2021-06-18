import { ObjectType, Field } from 'type-graphql';
import { Project } from './Project';

@ObjectType()
export class Preference {
  @Field(() => Number)
  ranking: number

  @Field(() => Project)
  project: Project
}
