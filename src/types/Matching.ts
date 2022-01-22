// eslint-disable-next-line max-classes-per-file
import { Field, ObjectType } from 'type-graphql';
import { MatchingStatsExternal } from '../match/matchingTypes';

@ObjectType()
export class MatchingStats implements MatchingStatsExternal {
  @Field(() => Number)
  totalProjects: number;

  @Field(() => Number)
  totalStudents: number;

  @Field(() => Number)
  unassignedStudents: number;

  @Field(() => Number)
  unfilledSlots: number;

  @Field(() => Number)
  matchingScore: number;

  @Field(() => Number)
  runtimeMs: number;
}

@ObjectType()
export class MatchTuple {
  @Field(() => String)
  studentId: string;

  @Field(() => String)
  projectId: string;
}

@ObjectType()
export class MatchingResult {
  @Field(() => [MatchTuple])
  match: MatchTuple[];

  @Field(() => MatchingStats)
  stats: MatchingStats;
}
