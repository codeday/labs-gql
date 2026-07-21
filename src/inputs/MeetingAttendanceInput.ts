import { InputType, Field } from 'type-graphql';
import { GraphQLJSONObject } from 'graphql-type-json';
import { AttendanceSource } from '../enums';

@InputType()
export class MeetingAttendanceInput {
  @Field(() => String)
  meetingId: string

  @Field(() => String)
  studentId: string

  @Field(() => Boolean)
  attended: boolean

  @Field(() => Boolean, { nullable: true })
  prepared?: boolean

  @Field(() => AttendanceSource, { nullable: true })
  source?: AttendanceSource

  @Field(() => Number, { nullable: true })
  confidence?: number

  @Field(() => GraphQLJSONObject, { nullable: true })
  metadata?: Record<string, unknown>
}
