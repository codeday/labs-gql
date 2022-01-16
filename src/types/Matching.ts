// eslint-disable-next-line max-classes-per-file
import { ObjectType, Field } from 'type-graphql';
import {
  MatchingStatsExternal,
} from '../match/matchingTypes';

@ObjectType()
export class MatchingStats implements MatchingStatsExternal {
  @Field(() => Number)
  totalProjects: number

  @Field(() => Number)
  totalStudents: number

  @Field(() => Number)
  unassignedStudents: number

  @Field(() => Number)
  unfilledSlots: number

  @Field(() => Number)
  matchingScore: number

  @Field(() => Number)
  runtimeMs: number
}

@ObjectType()
export class MatchingProjectDatum {
  @Field(() => String)
  projectId: string

  @Field(() => [String])
  studentsMatched: string[]

  // Below fields are pretty much just debugging data in case this is desired by the frontend.
  // TODO: Confirm that this is desired on the frontend
  @Field(() => Number)
  numFirstChoice: number

  @Field(() => Number)
  projSizeRemaining: number;

  @Field(() => [String])
  studentsSelected: string[];
}

@ObjectType()
export class MatchingResult {
  @Field(() => [MatchingProjectDatum])
  match: MatchingProjectDatum[]

  @Field(() => MatchingStats)
  stats: MatchingStats
}
