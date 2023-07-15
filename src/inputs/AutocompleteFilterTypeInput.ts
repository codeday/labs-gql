import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { MentorStatus, Track } from '../enums';
import { GtLtEq } from './GtLtEq';

@InputType()
export class AutocompleteFilterTypeInput {
  @Field(() => Boolean, { defaultValue: false })
  students: boolean

  @Field(() => Boolean, { defaultValue: false })
  mentors: boolean

  @Field(() => Boolean, { defaultValue: false })
  projects: boolean
}
