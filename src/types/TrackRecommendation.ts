import {
  ObjectType, Field,
} from 'type-graphql';
import { Track } from '../enums';

@ObjectType()
export class TrackRecommendation {
  @Field(() => Track)
  track: Track

  @Field(() => Number)
  weight: number
}
